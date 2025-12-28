/**
 * Outreach Orchestrator
 *
 * Integrates all outreach systems:
 * - ThinkingOfYou (random kindness)
 * - Decision Engine (timing & channel)
 * - Celebration Engine (achievement detection)
 * - Growth Engine (growth visibility)
 *
 * This is the single entry point for triggering proactive outreach.
 *
 * @module OutreachOrchestrator
 */

import { EventEmitter } from 'events';
import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getCelebrationEngine, type CelebrationTrigger } from '../celebration-engine.js';
import { getGrowthVisibilityEngine } from '../growth-visibility-engine.js';
import { getOutreachDecisionEngine, type OutreachDecision } from './decision-engine.js';
import {
  getThinkingOfYouEngine,
  type ThinkingOfYouOutreach,
  type UserOutreachContext,
} from './thinking-of-you.js';
import { deliverOutreach } from './delivery/index.js';

const log = createLogger({ module: 'OutreachOrchestrator' });

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachEvent {
  type: 'thinking_of_you' | 'celebration' | 'growth' | 'commitment' | 'check_in';
  userId: string;
  personaId: string;
  channel: 'sms' | 'email' | 'call' | 'voice_message' | 'push';
  message: string;
  scheduledFor: Date;
  metadata?: Record<string, unknown>;
}

export interface OutreachTelemetry {
  totalOutreachAttempts: number;
  successfulDeliveries: number;
  userResponses: number;
  positiveResponses: number;
  byType: Record<string, number>;
  byPersona: Record<string, number>;
  avgResponseTimeMs: number;
}

// ============================================================================
// OUTREACH ORCHESTRATOR
// ============================================================================

export class OutreachOrchestrator extends EventEmitter {
  private telemetry: OutreachTelemetry = {
    totalOutreachAttempts: 0,
    successfulDeliveries: 0,
    userResponses: 0,
    positiveResponses: 0,
    byType: {},
    byPersona: {},
    avgResponseTimeMs: 0,
  };

  private scheduledOutreach = new Map<string, NodeJS.Timeout>();

  constructor() {
    super();

    // Listen to decision engine events
    const decisionEngine = getOutreachDecisionEngine();
    decisionEngine.on('outreach-ready', (decision: OutreachDecision) => {
      void this.handleOutreachReady(decision);
    });

    log.info('🎯 Outreach Orchestrator initialized');
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Check if we should send a "thinking of you" message
   * Call this periodically (e.g., daily) for each user
   */
  async evaluateThinkingOfYou(profile: UserProfile): Promise<ThinkingOfYouOutreach | null> {
    if (!profile.id) return null;

    const thinkingOfYouEngine = getThinkingOfYouEngine();
    const decisionEngine = getOutreachDecisionEngine();

    // Build context from profile
    const context = this.buildUserContext(profile);

    // Check if we should reach out
    const decision = thinkingOfYouEngine.shouldReachOut(context);

    if (!decision.shouldSend || !decision.trigger || !decision.persona) {
      return null;
    }

    // Create the outreach
    const outreach = thinkingOfYouEngine.createOutreach(
      profile.id,
      decision.trigger,
      decision.persona,
      context
    );

    // Also register with decision engine for rate limiting
    decisionEngine.addTrigger({
      type: 'thinking_of_you',
      userId: profile.id,
      priority: 'low',
      reason: decision.reason || 'Random kindness',
    });

    // Track telemetry
    this.recordTelemetry('thinking_of_you', decision.persona);

    log.info(
      { userId: profile.id, trigger: decision.trigger, persona: decision.persona },
      '💭 Thinking of you outreach created'
    );

    return outreach;
  }

  /**
   * Trigger celebration outreach
   */
  async triggerCelebration(
    userId: string,
    personaId: string,
    trigger: CelebrationTrigger
  ): Promise<OutreachEvent | null> {
    const celebrationEngine = getCelebrationEngine(userId, personaId);
    const response = celebrationEngine.generateCelebration(trigger);

    // Determine if this should be proactive outreach
    // (High-intensity celebrations might warrant a call/text)
    if (trigger.intensity === 'enthusiastic' || trigger.intensity === 'ecstatic') {
      const decisionEngine = getOutreachDecisionEngine();

      decisionEngine.addTrigger({
        type: 'celebration',
        userId,
        priority: 'high',
        reason: `Celebrating: ${trigger.achievement}`,
        context: { trigger, response },
      });

      this.recordTelemetry('celebration', personaId);

      return {
        type: 'celebration',
        userId,
        personaId,
        channel: 'sms', // Celebrations work well as texts
        message: response.message,
        scheduledFor: new Date(),
        metadata: { trigger, response },
      };
    }

    return null;
  }

  /**
   * Trigger growth visibility outreach
   */
  async triggerGrowthReflection(userId: string, personaId: string): Promise<OutreachEvent | null> {
    const growthEngine = getGrowthVisibilityEngine(userId);

    // Detect any new growth
    growthEngine.detectGrowth();

    // Get insight to surface
    const reflection = growthEngine.getInsightToSurface({ sessionStart: false });

    if (!reflection) {
      return null;
    }

    // Growth insights are better delivered in-session, not proactively
    // But major growth (high confidence) could warrant outreach
    if (reflection.insight.confidence >= 0.8) {
      const decisionEngine = getOutreachDecisionEngine();

      decisionEngine.addTrigger({
        type: 'insight_discovery',
        userId,
        priority: 'medium',
        reason: `Growth insight: ${reflection.insight.area}`,
        context: { reflection },
      });

      this.recordTelemetry('growth', personaId);

      return {
        type: 'growth',
        userId,
        personaId,
        channel: 'email', // Growth reflections work better in longer form
        message: reflection.reflection,
        scheduledFor: new Date(),
        metadata: { reflection },
      };
    }

    return null;
  }

  /**
   * Schedule commitment check-in
   */
  scheduleCommitmentCheckIn(userId: string, commitment: string, checkInTime: Date): string {
    const decisionEngine = getOutreachDecisionEngine();

    const triggerId = decisionEngine.addTrigger({
      type: 'commitment_check',
      userId,
      priority: 'medium',
      reason: `Commitment follow-up: ${commitment}`,
      commitment,
      suggestedTime: checkInTime,
    });

    log.info({ userId, commitment, checkInTime }, '📅 Commitment check-in scheduled');

    return triggerId;
  }

  /**
   * Schedule goal milestone check
   */
  scheduleGoalMilestoneCheck(
    userId: string,
    goalName: string,
    milestone: string,
    checkTime: Date
  ): string {
    const decisionEngine = getOutreachDecisionEngine();

    const triggerId = decisionEngine.addTrigger({
      type: 'goal_milestone',
      userId,
      priority: 'medium',
      reason: `Goal milestone: ${milestone} for "${goalName}"`,
      goal: goalName,
      milestone,
      suggestedTime: checkTime,
    });

    log.info({ userId, goalName, milestone, checkTime }, '🎯 Goal milestone check scheduled');

    return triggerId;
  }

  /**
   * Process daily outreach for all users
   * Call this via cron job
   */
  async processDailyOutreach(profiles: UserProfile[]): Promise<{
    evaluated: number;
    sent: number;
    byType: Record<string, number>;
  }> {
    const results = {
      evaluated: 0,
      sent: 0,
      byType: {} as Record<string, number>,
    };

    for (const profile of profiles) {
      results.evaluated++;

      try {
        // Check thinking of you
        const toyOutreach = await this.evaluateThinkingOfYou(profile);
        if (toyOutreach) {
          results.sent++;
          results.byType['thinking_of_you'] = (results.byType['thinking_of_you'] || 0) + 1;
        }

        // Check growth reflection (less frequently)
        if (Math.random() < 0.1) {
          // 10% chance
          const growthOutreach = await this.triggerGrowthReflection(profile.id!, 'ferni');
          if (growthOutreach) {
            results.sent++;
            results.byType['growth'] = (results.byType['growth'] || 0) + 1;
          }
        }
      } catch (error) {
        log.error({ userId: profile.id, error }, 'Error processing daily outreach');
      }
    }

    log.info(results, '📊 Daily outreach processing complete');

    return results;
  }

  // ==========================================================================
  // INTERNAL HANDLERS
  // ==========================================================================

  /**
   * Handle outreach ready from decision engine
   */
  private async handleOutreachReady(decision: OutreachDecision): Promise<void> {
    this.telemetry.totalOutreachAttempts++;

    const event: OutreachEvent = {
      type: this.mapTriggerToType(decision.trigger.type),
      userId: decision.trigger.userId,
      personaId: decision.persona || 'ferni',
      channel: decision.channel || 'sms',
      message: decision.generatedMessage?.message || '',
      scheduledFor: decision.scheduledFor || new Date(),
      metadata: {
        triggerId: decision.trigger.id,
        triggerType: decision.trigger.type,
      },
    };

    // Emit for delivery
    this.emit('outreach:ready', event);

    log.info(
      {
        type: event.type,
        userId: event.userId,
        channel: event.channel,
      },
      '📤 Outreach ready for delivery'
    );
  }

  /**
   * Map trigger type to outreach event type
   */
  private mapTriggerToType(triggerType: string): OutreachEvent['type'] {
    const mapping: Record<string, OutreachEvent['type']> = {
      thinking_of_you: 'thinking_of_you',
      celebration: 'celebration',
      insight_discovery: 'growth',
      commitment_check: 'commitment',
      goal_milestone: 'check_in',
      habit_check: 'check_in',
    };
    return mapping[triggerType] || 'check_in';
  }

  // ==========================================================================
  // CONTEXT BUILDING
  // ==========================================================================

  /**
   * Build user context from profile
   */
  private buildUserContext(profile: UserProfile): UserOutreachContext {
    const now = new Date();

    // Calculate days since last contact
    const lastContactDate = profile.lastContact ? new Date(profile.lastContact) : null;
    const daysSinceLastContact = lastContactDate
      ? Math.floor((now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Determine emotional state from recent data
    let emotionalState: 'thriving' | 'stable' | 'struggling' = 'stable';
    // Check emotional patterns if available
    if (profile.emotionalPatterns && profile.emotionalPatterns.length > 0) {
      const recentPatterns = profile.emotionalPatterns.slice(-5);
      const positiveEmotions = ['happy', 'excited', 'grateful', 'content', 'hopeful', 'proud'];
      const positiveCount = recentPatterns.filter((p) =>
        positiveEmotions.some((e) => p.emotion?.toLowerCase().includes(e))
      ).length;
      if (positiveCount >= 4) emotionalState = 'thriving';
      if (positiveCount <= 1) emotionalState = 'struggling';
    }

    // Get recent wins from goals
    const recentWins: Array<{ description: string; date?: Date; category?: string }> = [];
    if (profile.goals) {
      for (const goal of profile.goals) {
        if (goal.status === 'achieved') {
          recentWins.push({ description: goal.name, category: goal.type });
        }
      }
    }

    // Get upcoming events
    const upcomingEvents: Array<{ date: Date; description: string }> = [];
    if (profile.customData?.upcomingEvents) {
      upcomingEvents.push(
        ...(profile.customData.upcomingEvents as Array<{ date: Date; description: string }>)
      );
    }

    // Get relationship stage
    const relationshipStage = profile.relationshipStage || 'acquaintance';

    // Get outreach tracking from decision engine
    const decisionEngine = getOutreachDecisionEngine();
    const userState = decisionEngine.getUserState(profile.id);

    // Calculate days since last outreach
    let daysSinceLastOutreach = 999; // Default to large number if never reached out
    if (userState.counters.lastOutreachDate) {
      const lastOutreachDate = new Date(userState.counters.lastOutreachDate);
      daysSinceLastOutreach = Math.floor(
        (Date.now() - lastOutreachDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return {
      profile,
      daysSinceLastContact,
      daysSinceLastOutreach,
      emotionalState,
      upcomingEvents,
      recentWins,
      relationshipStage: relationshipStage as
        | 'stranger'
        | 'acquaintance'
        | 'friend'
        | 'trusted_advisor',
      outreachCountThisWeek: userState.counters.outreachThisWeek,
    };
  }

  // ==========================================================================
  // TELEMETRY
  // ==========================================================================

  /**
   * Record telemetry data
   */
  private recordTelemetry(type: string, persona: string): void {
    this.telemetry.byType[type] = (this.telemetry.byType[type] || 0) + 1;
    this.telemetry.byPersona[persona] = (this.telemetry.byPersona[persona] || 0) + 1;
  }

  /**
   * Record successful delivery
   */
  recordDeliverySuccess(): void {
    this.telemetry.successfulDeliveries++;
  }

  /**
   * Record user response
   */
  recordUserResponse(positive: boolean, responseTimeMs: number): void {
    this.telemetry.userResponses++;
    if (positive) {
      this.telemetry.positiveResponses++;
    }

    // Update average response time
    const totalResponses = this.telemetry.userResponses;
    const currentAvg = this.telemetry.avgResponseTimeMs;
    this.telemetry.avgResponseTimeMs =
      (currentAvg * (totalResponses - 1) + responseTimeMs) / totalResponses;
  }

  /**
   * Get telemetry data
   */
  getTelemetry(): OutreachTelemetry {
    return { ...this.telemetry };
  }

  /**
   * Reset telemetry (for testing)
   */
  resetTelemetry(): void {
    this.telemetry = {
      totalOutreachAttempts: 0,
      successfulDeliveries: 0,
      userResponses: 0,
      positiveResponses: 0,
      byType: {},
      byPersona: {},
      avgResponseTimeMs: 0,
    };
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Cancel scheduled outreach
   */
  cancelScheduledOutreach(id: string): void {
    const timeout = this.scheduledOutreach.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.scheduledOutreach.delete(id);
      log.info({ id }, '❌ Scheduled outreach cancelled');
    }
  }

  /**
   * Clear all scheduled outreach
   */
  clearAllScheduled(): void {
    for (const timeout of this.scheduledOutreach.values()) {
      clearTimeout(timeout);
    }
    this.scheduledOutreach.clear();
    log.info('❌ All scheduled outreach cleared');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: OutreachOrchestrator | null = null;

export function getOutreachOrchestrator(): OutreachOrchestrator {
  if (!instance) {
    instance = new OutreachOrchestrator();

    // ==========================================================================
    // 🔗 CONNECT TO DELIVERY SYSTEM
    // This is the critical bridge that makes "Thinking of You" actually execute!
    // When the orchestrator decides it's time to reach out, we deliver the message.
    // ==========================================================================
    instance.on('outreach:ready', async (event: OutreachEvent) => {
      log.info(
        {
          type: event.type,
          userId: event.userId,
          channel: event.channel,
          personaId: event.personaId,
        },
        '💌 Executing outreach delivery'
      );

      try {
        const result = await deliverOutreach({
          userId: event.userId,
          channel: event.channel === 'voice_message' ? 'push' : event.channel, // Map voice_message to push
          message: event.message,
          personaId: event.personaId,
          outreachId: event.metadata?.triggerId as string | undefined,
        });

        if (result.success) {
          log.info(
            { userId: event.userId, channel: event.channel, messageId: result.messageId },
            '✅ Outreach delivered successfully'
          );
          // Update telemetry
          instance?.recordDeliverySuccess();
        } else {
          log.warn(
            { userId: event.userId, channel: event.channel, error: result.error },
            '⚠️ Outreach delivery failed'
          );
        }
      } catch (error) {
        log.error(
          { userId: event.userId, channel: event.channel, error: String(error) },
          '❌ Outreach delivery error'
        );
      }
    });

    log.info('📤 OutreachOrchestrator initialized with delivery listener');
  }
  return instance;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default OutreachOrchestrator;
