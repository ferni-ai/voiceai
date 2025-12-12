/**
 * Better Than Human Telemetry
 *
 * Tracks activation and effectiveness of all "Better Than Human" features:
 * - Memory surfacing
 * - Celebration engine
 * - Growth visibility
 * - Pattern surfacing
 * - EQ features (micro-expressions, active listening, etc.)
 * - Proactive outreach
 *
 * This helps us understand if our superhuman capabilities are actually
 * being used and making a difference.
 *
 * @module BetterThanHumanTelemetry
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'BTHTelemetry' });

// ============================================================================
// TYPES
// ============================================================================

export type FeatureType =
  // Memory
  | 'proactive_memory_surfaced'
  | 'cross_session_reflection'
  | 'quoted_memory_recalled'
  // Celebration
  | 'celebration_triggered'
  | 'celebration_goal_completed'
  | 'celebration_streak'
  | 'celebration_breakthrough'
  // Growth
  | 'growth_insight_detected'
  | 'growth_insight_surfaced'
  | 'growth_insight_resonated'
  // Patterns
  | 'pattern_detected'
  | 'pattern_surfaced'
  | 'pattern_resonated'
  // EQ
  | 'micro_expression_played'
  | 'active_listening_triggered'
  | 'breath_sync_activated'
  | 'concern_detected'
  | 'anticipation_triggered'
  // Outreach
  | 'outreach_thinking_of_you'
  | 'outreach_celebration'
  | 'outreach_growth'
  | 'outreach_commitment_check'
  | 'outreach_response'
  // User reactions
  | 'user_reaction_positive'
  | 'user_reaction_neutral'
  | 'user_reaction_negative';

export interface TelemetryEvent {
  id: string;
  feature: FeatureType;
  userId: string;
  personaId: string;
  sessionId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface FeatureStats {
  totalActivations: number;
  uniqueUsers: Set<string>;
  lastActivation?: Date;
  successRate?: number; // For features with success/failure
}

export interface TelemetrySummary {
  period: {
    start: Date;
    end: Date;
  };
  memory: {
    proactiveMemoriesSurfaced: number;
    crossSessionReflections: number;
    quotedMemoriesRecalled: number;
  };
  celebration: {
    totalCelebrations: number;
    byType: Record<string, number>;
  };
  growth: {
    insightsDetected: number;
    insightsSurfaced: number;
    resonanceRate: number;
  };
  patterns: {
    patternsDetected: number;
    patternsSurfaced: number;
    resonanceRate: number;
  };
  eq: {
    microExpressions: number;
    activeListening: number;
    breathSync: number;
    concernDetections: number;
    anticipations: number;
  };
  outreach: {
    thinkingOfYou: number;
    celebrations: number;
    growth: number;
    commitmentChecks: number;
    totalSent: number;
    responseRate: number;
  };
  userReactions: {
    positive: number;
    neutral: number;
    negative: number;
    positiveRate: number;
  };
}

// ============================================================================
// TELEMETRY TRACKER
// ============================================================================

class BetterThanHumanTelemetry {
  private events: TelemetryEvent[] = [];
  private featureStats = new Map<FeatureType, FeatureStats>();
  private maxEvents = 10000; // Keep last N events

  constructor() {
    // Initialize all feature stats
    this.initializeStats();
  }

  private initializeStats(): void {
    const features: FeatureType[] = [
      'proactive_memory_surfaced',
      'cross_session_reflection',
      'quoted_memory_recalled',
      'celebration_triggered',
      'celebration_goal_completed',
      'celebration_streak',
      'celebration_breakthrough',
      'growth_insight_detected',
      'growth_insight_surfaced',
      'growth_insight_resonated',
      'pattern_detected',
      'pattern_surfaced',
      'pattern_resonated',
      'micro_expression_played',
      'active_listening_triggered',
      'breath_sync_activated',
      'concern_detected',
      'anticipation_triggered',
      'outreach_thinking_of_you',
      'outreach_celebration',
      'outreach_growth',
      'outreach_commitment_check',
      'outreach_response',
      'user_reaction_positive',
      'user_reaction_neutral',
      'user_reaction_negative',
    ];

    for (const feature of features) {
      this.featureStats.set(feature, {
        totalActivations: 0,
        uniqueUsers: new Set(),
      });
    }
  }

  // ==========================================================================
  // TRACKING
  // ==========================================================================

  /**
   * Track a feature activation
   */
  track(
    feature: FeatureType,
    userId: string,
    personaId: string,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): void {
    const event: TelemetryEvent = {
      id: `tel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      feature,
      userId,
      personaId,
      sessionId,
      timestamp: new Date(),
      metadata,
    };

    this.events.push(event);

    // Trim if too many events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update stats
    const stats = this.featureStats.get(feature);
    if (stats) {
      stats.totalActivations++;
      stats.uniqueUsers.add(userId);
      stats.lastActivation = new Date();
    }

    log.debug({ feature, userId, personaId }, '📊 Feature tracked');
  }

  /**
   * Convenience methods for specific features
   */

  // Memory
  trackProactiveMemory(userId: string, personaId: string, sessionId: string): void {
    this.track('proactive_memory_surfaced', userId, personaId, sessionId);
  }

  trackCrossSessionReflection(userId: string, personaId: string): void {
    this.track('cross_session_reflection', userId, personaId);
  }

  trackQuotedMemory(userId: string, personaId: string): void {
    this.track('quoted_memory_recalled', userId, personaId);
  }

  // Celebration
  trackCelebration(
    type: 'goal_completed' | 'streak' | 'breakthrough' | 'generic',
    userId: string,
    personaId: string,
    metadata?: Record<string, unknown>
  ): void {
    this.track('celebration_triggered', userId, personaId, undefined, { type, ...metadata });
    if (type === 'goal_completed') {
      this.track('celebration_goal_completed', userId, personaId);
    } else if (type === 'streak') {
      this.track('celebration_streak', userId, personaId);
    } else if (type === 'breakthrough') {
      this.track('celebration_breakthrough', userId, personaId);
    }
  }

  // Growth
  trackGrowthInsightDetected(userId: string, insightType: string): void {
    this.track('growth_insight_detected', userId, 'ferni', undefined, { insightType });
  }

  trackGrowthInsightSurfaced(userId: string, personaId: string, insightId: string): void {
    this.track('growth_insight_surfaced', userId, personaId, undefined, { insightId });
  }

  trackGrowthInsightResonated(userId: string, insightId: string): void {
    this.track('growth_insight_resonated', userId, 'ferni', undefined, { insightId });
  }

  // Patterns
  trackPatternDetected(userId: string, patternType: string): void {
    this.track('pattern_detected', userId, 'ferni', undefined, { patternType });
  }

  trackPatternSurfaced(userId: string, personaId: string, patternId: string): void {
    this.track('pattern_surfaced', userId, personaId, undefined, { patternId });
  }

  trackPatternResonated(userId: string, patternId: string): void {
    this.track('pattern_resonated', userId, 'ferni', undefined, { patternId });
  }

  // EQ
  trackMicroExpression(userId: string, personaId: string, expressionType: string): void {
    this.track('micro_expression_played', userId, personaId, undefined, { expressionType });
  }

  trackActiveListening(userId: string, personaId: string): void {
    this.track('active_listening_triggered', userId, personaId);
  }

  trackBreathSync(userId: string, personaId: string): void {
    this.track('breath_sync_activated', userId, personaId);
  }

  trackConcernDetected(userId: string, personaId: string, concernLevel: string): void {
    this.track('concern_detected', userId, personaId, undefined, { concernLevel });
  }

  trackAnticipation(userId: string, personaId: string): void {
    this.track('anticipation_triggered', userId, personaId);
  }

  // Outreach
  trackOutreach(
    type: 'thinking_of_you' | 'celebration' | 'growth' | 'commitment_check',
    userId: string,
    personaId: string,
    metadata?: Record<string, unknown>
  ): void {
    const featureMap: Record<string, FeatureType> = {
      thinking_of_you: 'outreach_thinking_of_you',
      celebration: 'outreach_celebration',
      growth: 'outreach_growth',
      commitment_check: 'outreach_commitment_check',
    };
    this.track(featureMap[type], userId, personaId, undefined, metadata);
  }

  trackOutreachResponse(options: {
    userId: string;
    outreachId: string;
    responseType: string;
    personaId?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
  }): void {
    this.track('outreach_response', options.userId, options.personaId || 'ferni', undefined, {
      outreachId: options.outreachId,
      responseType: options.responseType,
      sentiment: options.sentiment,
    });
  }

  // User reactions
  trackUserReaction(
    reaction: 'positive' | 'neutral' | 'negative',
    userId: string,
    featureContext?: string
  ): void {
    const featureMap: Record<string, FeatureType> = {
      positive: 'user_reaction_positive',
      neutral: 'user_reaction_neutral',
      negative: 'user_reaction_negative',
    };
    this.track(featureMap[reaction], userId, 'ferni', undefined, { featureContext });
  }

  // ==========================================================================
  // ANALYTICS
  // ==========================================================================

  /**
   * Get stats for a specific feature
   */
  getFeatureStats(feature: FeatureType): FeatureStats | undefined {
    return this.featureStats.get(feature);
  }

  /**
   * Get summary of all features
   */
  getSummary(periodDays = 7): TelemetrySummary {
    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Filter events to period
    const periodEvents = this.events.filter((e) => e.timestamp >= periodStart);

    // Count by feature
    const countByFeature = (feature: FeatureType): number =>
      periodEvents.filter((e) => e.feature === feature).length;

    // Calculate rates
    const growthSurfaced = countByFeature('growth_insight_surfaced');
    const growthResonated = countByFeature('growth_insight_resonated');
    const growthResonanceRate = growthSurfaced > 0 ? growthResonated / growthSurfaced : 0;

    const patternsSurfaced = countByFeature('pattern_surfaced');
    const patternsResonated = countByFeature('pattern_resonated');
    const patternResonanceRate = patternsSurfaced > 0 ? patternsResonated / patternsSurfaced : 0;

    const totalOutreach =
      countByFeature('outreach_thinking_of_you') +
      countByFeature('outreach_celebration') +
      countByFeature('outreach_growth') +
      countByFeature('outreach_commitment_check');

    const outreachResponses = periodEvents.filter((e) => e.feature === 'outreach_response');
    const respondedOutreachIds = new Set(
      outreachResponses
        .map((e) => e.metadata?.['outreachId'])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    const responseRate =
      totalOutreach > 0
        ? (respondedOutreachIds.size > 0 ? respondedOutreachIds.size : outreachResponses.length) /
          totalOutreach
        : 0;

    const positiveReactions = countByFeature('user_reaction_positive');
    const neutralReactions = countByFeature('user_reaction_neutral');
    const negativeReactions = countByFeature('user_reaction_negative');
    const totalReactions = positiveReactions + neutralReactions + negativeReactions;
    const positiveRate = totalReactions > 0 ? positiveReactions / totalReactions : 0;

    return {
      period: {
        start: periodStart,
        end: now,
      },
      memory: {
        proactiveMemoriesSurfaced: countByFeature('proactive_memory_surfaced'),
        crossSessionReflections: countByFeature('cross_session_reflection'),
        quotedMemoriesRecalled: countByFeature('quoted_memory_recalled'),
      },
      celebration: {
        totalCelebrations: countByFeature('celebration_triggered'),
        byType: {
          goal_completed: countByFeature('celebration_goal_completed'),
          streak: countByFeature('celebration_streak'),
          breakthrough: countByFeature('celebration_breakthrough'),
        },
      },
      growth: {
        insightsDetected: countByFeature('growth_insight_detected'),
        insightsSurfaced: growthSurfaced,
        resonanceRate: growthResonanceRate,
      },
      patterns: {
        patternsDetected: countByFeature('pattern_detected'),
        patternsSurfaced: patternsSurfaced,
        resonanceRate: patternResonanceRate,
      },
      eq: {
        microExpressions: countByFeature('micro_expression_played'),
        activeListening: countByFeature('active_listening_triggered'),
        breathSync: countByFeature('breath_sync_activated'),
        concernDetections: countByFeature('concern_detected'),
        anticipations: countByFeature('anticipation_triggered'),
      },
      outreach: {
        thinkingOfYou: countByFeature('outreach_thinking_of_you'),
        celebrations: countByFeature('outreach_celebration'),
        growth: countByFeature('outreach_growth'),
        commitmentChecks: countByFeature('outreach_commitment_check'),
        totalSent: totalOutreach,
        responseRate,
      },
      userReactions: {
        positive: positiveReactions,
        neutral: neutralReactions,
        negative: negativeReactions,
        positiveRate,
      },
    };
  }

  /**
   * Get activation rate for a feature (per session)
   */
  getActivationRate(feature: FeatureType, totalSessions: number): number {
    const stats = this.featureStats.get(feature);
    if (!stats || totalSessions === 0) return 0;
    return stats.totalActivations / totalSessions;
  }

  /**
   * Get unique user count for a feature
   */
  getUniqueUsers(feature: FeatureType): number {
    const stats = this.featureStats.get(feature);
    return stats?.uniqueUsers.size || 0;
  }

  /**
   * Log summary to console (for debugging)
   */
  logSummary(): void {
    const summary = this.getSummary(7);

    log.info(
      {
        memory: summary.memory,
        celebrations: summary.celebration.totalCelebrations,
        growthInsights: summary.growth.insightsSurfaced,
        patterns: summary.patterns.patternsSurfaced,
        eqActivations:
          summary.eq.microExpressions + summary.eq.activeListening + summary.eq.breathSync,
        outreach: summary.outreach.totalSent,
        positiveReactionRate: `${(summary.userReactions.positiveRate * 100).toFixed(1)}%`,
      },
      '📊 Better Than Human Feature Summary (7 days)'
    );
  }

  /**
   * Export events for external analytics
   */
  exportEvents(since?: Date): TelemetryEvent[] {
    if (since) {
      return this.events.filter((e) => e.timestamp >= since);
    }
    return [...this.events];
  }

  /**
   * Clear all telemetry (for testing)
   */
  reset(): void {
    this.events = [];
    this.initializeStats();
    log.info('Telemetry reset');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: BetterThanHumanTelemetry | null = null;

export function getBetterThanHumanTelemetry(): BetterThanHumanTelemetry {
  if (!instance) {
    instance = new BetterThanHumanTelemetry();
  }
  return instance;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { BetterThanHumanTelemetry };
export default BetterThanHumanTelemetry;
