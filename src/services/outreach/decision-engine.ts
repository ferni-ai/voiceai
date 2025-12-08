/**
 * Outreach Decision Engine
 *
 * The brain that decides WHEN, WHY, WHO, HOW, and WHAT to say for proactive outreach.
 *
 * This engine orchestrates all outreach decisions, ensuring:
 * - Right timing (learned patterns + preferences)
 * - Right persona (who should reach out)
 * - Right channel (call vs text vs email)
 * - Right message (persona-specific voice)
 * - Right frequency (rate limiting)
 */

import { EventEmitter } from 'events';
import { getLogger } from '../../utils/safe-logger.js';
import {
  generateOutreach,
  selectPersonaForOutreach,
  type OutreachChannel,
  type OutreachContext,
  type RelationshipStage,
  type OutreachTone,
  type GeneratedOutreach,
} from './persona-voice-generator.js';
import type { AgentId } from '../agent-bus.js';

// ============================================================================
// TYPES
// ============================================================================

export type OutreachTriggerType =
  // Task-driven triggers
  | 'commitment_check' // User said they'd do something
  | 'goal_milestone' // Progress toward a goal
  | 'streak_at_risk' // About to break a streak
  | 'habit_check' // Routine/habit check-in
  | 'appointment_reminder' // Upcoming appointment
  | 'event_countdown' // Event approaching
  | 'milestone_approaching' // Life milestone coming up

  // Emotional triggers
  | 'emotional_support' // Detected stress/struggle
  | 'celebration' // Achievement unlocked

  // Connection triggers
  | 'reengagement' // Haven't heard from user
  | 'thinking_of_you' // Random kindness
  | 'follow_up' // Explicit follow-up request
  | 'accountability' // Agreed accountability check

  // Content triggers
  | 'content_share' // Relevant content found
  | 'insight_discovery' // AI noticed something helpful

  // Time-based triggers
  | 'scheduled' // User requested specific time
  | 'seasonal' // Holiday/season check-in
  | 'anniversary'; // Relationship milestone

export type OutreachPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface OutreachTrigger {
  id: string;
  type: OutreachTriggerType;
  userId: string;
  priority: OutreachPriority;

  // What triggered this
  reason: string;
  context?: Record<string, unknown>;

  // Optional specifics
  commitment?: string;
  milestone?: string;
  goal?: string;
  event?: string;

  // Timing preferences
  suggestedTime?: Date;
  expiresAt?: Date;

  // Who should handle this
  suggestedPersona?: AgentId;
  lastPersona?: AgentId;
  wasRecentConversation?: boolean;

  // Created
  createdAt: Date;
}

export interface OutreachDecision {
  trigger: OutreachTrigger;
  decision: 'send' | 'skip' | 'defer';
  skipReason?: string;
  deferUntil?: Date;
  decidedAt: Date; // When this decision was made

  // If sending
  persona?: AgentId;
  channel?: OutreachChannel;
  scheduledFor?: Date;
  generatedMessage?: GeneratedOutreach;
}

export interface UserOutreachState {
  userId: string;

  // Permissions
  outreachEnabled: boolean;
  allowedChannels: OutreachChannel[];

  // Preferences
  preferences: {
    quietHoursStart: string; // "22:00"
    quietHoursEnd: string; // "08:00"
    timezone: string;
    maxPerDay: number;
    maxPerWeek: number;
    preferredChannel?: OutreachChannel;
    neverDuring?: string[]; // ["morning meditation", "family dinner"]
  };

  // Learned patterns
  patterns: {
    preferredHours: number[];
    preferredDays: number[];
    responseRateByChannel: Record<OutreachChannel, number>;
    avgResponseTimeMs: number;
  };

  // Current state
  counters: {
    outreachToday: number;
    outreachThisWeek: number;
    lastOutreachDate?: Date;
  };

  // Relationship
  relationshipStage: RelationshipStage;
  lastPersona?: AgentId;
  lastConversationDate?: Date;

  // Life context (aggregated)
  context: {
    emotionalState?: string;
    recentTopics?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: Array<{ date: Date; description: string }>;
    interests?: string[];
  };
}

export interface DecisionEngineConfig {
  // Timing
  checkIntervalMs: number;
  defaultQuietHoursStart: string;
  defaultQuietHoursEnd: string;

  // Rate limits
  defaultMaxPerDay: number;
  defaultMaxPerWeek: number;

  // Relationship-based permissions
  relationshipPermissions: {
    new: { allowedChannels: OutreachChannel[]; maxPerWeek: number };
    building: { allowedChannels: OutreachChannel[]; maxPerWeek: number };
    established: { allowedChannels: OutreachChannel[]; maxPerWeek: number };
    deep: { allowedChannels: OutreachChannel[]; maxPerWeek: number };
  };

  // Priority windows (how quickly to send based on priority)
  priorityWindows: {
    urgent: number; // ms to send within
    high: number;
    medium: number;
    low: number;
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: DecisionEngineConfig = {
  checkIntervalMs: 60 * 1000, // Check every minute
  defaultQuietHoursStart: '22:00',
  defaultQuietHoursEnd: '08:00',

  defaultMaxPerDay: 3,
  defaultMaxPerWeek: 10,

  relationshipPermissions: {
    new: {
      allowedChannels: ['email'],
      maxPerWeek: 1,
    },
    building: {
      allowedChannels: ['email', 'sms'],
      maxPerWeek: 2,
    },
    established: {
      allowedChannels: ['email', 'sms', 'call'],
      maxPerWeek: 4,
    },
    deep: {
      allowedChannels: ['email', 'sms', 'call', 'voice_message'],
      maxPerWeek: 7,
    },
  },

  priorityWindows: {
    urgent: 1 * 60 * 60 * 1000, // 1 hour
    high: 4 * 60 * 60 * 1000, // 4 hours
    medium: 24 * 60 * 60 * 1000, // 24 hours
    low: 72 * 60 * 60 * 1000, // 72 hours
  },
};

// ============================================================================
// STORAGE
// ============================================================================

const userStateStore = new Map<string, UserOutreachState>();
const pendingTriggers = new Map<string, OutreachTrigger[]>();
const outreachHistory = new Map<string, OutreachDecision[]>();

// ============================================================================
// OUTREACH DECISION ENGINE
// ============================================================================

const log = getLogger().child({ service: 'outreach-decision-engine' });

class OutreachDecisionEngine extends EventEmitter {
  private config: DecisionEngineConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config: Partial<DecisionEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info({ config: this.config }, '🧠 Outreach Decision Engine created');
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  start(): void {
    if (this.running) {
      log.warn('Decision engine already running');
      return;
    }

    this.running = true;
    log.info('🧠 Outreach Decision Engine started');

    // Process triggers on interval
    this.intervalId = setInterval(() => {
      void this.processPendingTriggers();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    log.info('🧠 Outreach Decision Engine stopped');
  }

  // ============================================================================
  // TRIGGER MANAGEMENT
  // ============================================================================

  /**
   * Add a new outreach trigger to be processed
   */
  addTrigger(trigger: Omit<OutreachTrigger, 'id' | 'createdAt'>): string {
    const id = `trigger_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const fullTrigger: OutreachTrigger = {
      ...trigger,
      id,
      createdAt: new Date(),
    };

    const userTriggers = pendingTriggers.get(trigger.userId) || [];
    userTriggers.push(fullTrigger);
    pendingTriggers.set(trigger.userId, userTriggers);

    log.info(
      {
        triggerId: id,
        userId: trigger.userId,
        type: trigger.type,
        priority: trigger.priority,
      },
      '📥 Outreach trigger added'
    );

    this.emit('trigger-added', fullTrigger);

    // Process immediately if urgent
    if (trigger.priority === 'urgent') {
      void this.processTrigger(fullTrigger);
    }

    return id;
  }

  /**
   * Cancel a pending trigger
   */
  cancelTrigger(triggerId: string): boolean {
    for (const [userId, triggers] of pendingTriggers.entries()) {
      const index = triggers.findIndex((t) => t.id === triggerId);
      if (index >= 0) {
        triggers.splice(index, 1);
        pendingTriggers.set(userId, triggers);
        log.info({ triggerId, userId }, '❌ Trigger cancelled');
        return true;
      }
    }
    return false;
  }

  /**
   * Get pending triggers for a user
   */
  getPendingTriggers(userId: string): OutreachTrigger[] {
    return pendingTriggers.get(userId) || [];
  }

  /**
   * Get a specific trigger by ID
   */
  getTrigger(triggerId: string): OutreachTrigger | undefined {
    for (const triggers of pendingTriggers.values()) {
      const found = triggers.find((t) => t.id === triggerId);
      if (found) return found;
    }
    return undefined;
  }

  // ============================================================================
  // USER STATE MANAGEMENT
  // ============================================================================

  /**
   * Get or create user outreach state
   */
  getUserState(userId: string): UserOutreachState {
    let state = userStateStore.get(userId);
    if (!state) {
      state = this.createDefaultUserState(userId);
      userStateStore.set(userId, state);
    }
    return state;
  }

  /**
   * Update user outreach state
   */
  updateUserState(userId: string, updates: Partial<UserOutreachState>): void {
    const state = this.getUserState(userId);
    const updated = { ...state, ...updates };
    userStateStore.set(userId, updated);
    log.debug({ userId, updates }, 'User outreach state updated');
  }

  /**
   * Update user preferences
   */
  updateUserPreferences(
    userId: string,
    preferences: Partial<UserOutreachState['preferences']>
  ): void {
    const state = this.getUserState(userId);
    state.preferences = { ...state.preferences, ...preferences };
    userStateStore.set(userId, state);
    log.info({ userId, preferences }, '⚙️ User outreach preferences updated');
  }

  /**
   * Update user context (from conversation analysis)
   */
  updateUserContext(userId: string, context: Partial<UserOutreachState['context']>): void {
    const state = this.getUserState(userId);
    state.context = { ...state.context, ...context };
    userStateStore.set(userId, state);
  }

  /**
   * Record that we reached out to a user
   */
  recordOutreach(userId: string): void {
    const state = this.getUserState(userId);
    const now = new Date();

    // Reset daily counter if new day
    if (state.counters.lastOutreachDate) {
      const lastDate = new Date(state.counters.lastOutreachDate);
      if (lastDate.toDateString() !== now.toDateString()) {
        state.counters.outreachToday = 0;
      }
    }

    state.counters.outreachToday++;
    state.counters.outreachThisWeek++;
    state.counters.lastOutreachDate = now;

    userStateStore.set(userId, state);
  }

  private createDefaultUserState(userId: string): UserOutreachState {
    return {
      userId,
      outreachEnabled: true,
      allowedChannels: ['email', 'sms'],

      preferences: {
        quietHoursStart: this.config.defaultQuietHoursStart,
        quietHoursEnd: this.config.defaultQuietHoursEnd,
        timezone: 'America/New_York',
        maxPerDay: this.config.defaultMaxPerDay,
        maxPerWeek: this.config.defaultMaxPerWeek,
      },

      patterns: {
        preferredHours: [9, 10, 11, 14, 15, 16, 19, 20],
        preferredDays: [1, 2, 3, 4, 5],
        responseRateByChannel: {
          sms: 0.5,
          email: 0.3,
          call: 0.2,
          voice_message: 0.2,
          push: 0.4,
        },
        avgResponseTimeMs: 60 * 60 * 1000,
      },

      counters: {
        outreachToday: 0,
        outreachThisWeek: 0,
      },

      relationshipStage: 'new',
      context: {},
    };
  }

  // ============================================================================
  // DECISION MAKING
  // ============================================================================

  /**
   * Process all pending triggers
   */
  private async processPendingTriggers(): Promise<void> {
    const now = new Date();

    for (const [userId, triggers] of pendingTriggers.entries()) {
      // Filter to triggers that should be processed now
      const readyTriggers = triggers.filter((t) => {
        if (t.expiresAt && t.expiresAt < now) return false;
        if (t.suggestedTime && t.suggestedTime > now) return false;
        return true;
      });

      for (const trigger of readyTriggers) {
        await this.processTrigger(trigger);
      }

      // Remove processed and expired triggers
      const remaining = triggers.filter((t) => {
        if (t.expiresAt && t.expiresAt < now) return false;
        return !readyTriggers.includes(t);
      });

      if (remaining.length > 0) {
        pendingTriggers.set(userId, remaining);
      } else {
        pendingTriggers.delete(userId);
      }
    }
  }

  /**
   * Process a single trigger and make a decision
   */
  private async processTrigger(trigger: OutreachTrigger): Promise<OutreachDecision> {
    const state = this.getUserState(trigger.userId);
    const now = new Date();

    log.debug(
      {
        triggerId: trigger.id,
        userId: trigger.userId,
        type: trigger.type,
      },
      'Processing trigger'
    );

    // Decision 1: Is outreach enabled?
    if (!state.outreachEnabled) {
      return this.createDecision(trigger, 'skip', 'Outreach disabled for user');
    }

    // Decision 2: Rate limit check
    if (state.counters.outreachToday >= state.preferences.maxPerDay) {
      return this.createDecision(trigger, 'defer', 'Daily limit reached', this.getNextDay(now));
    }

    if (state.counters.outreachThisWeek >= state.preferences.maxPerWeek) {
      return this.createDecision(trigger, 'defer', 'Weekly limit reached', this.getNextWeek(now));
    }

    // Decision 3: Is this a good time?
    const timingDecision = this.evaluateTiming(state, trigger, now);
    if (timingDecision.defer) {
      return this.createDecision(
        trigger,
        'defer',
        timingDecision.reason || 'Timing not optimal',
        timingDecision.deferUntil
      );
    }

    // Decision 4: Select persona
    const persona =
      trigger.suggestedPersona ||
      (selectPersonaForOutreach(
        trigger.type,
        trigger.lastPersona || state.lastPersona,
        trigger.wasRecentConversation
      ) as AgentId);

    // Decision 5: Select channel
    const channel = this.selectChannel(trigger, state);
    if (!channel) {
      return this.createDecision(trigger, 'skip', 'No suitable channel available');
    }

    // Decision 6: Generate the message
    const context = this.buildOutreachContext(trigger, state);
    const tone = this.determineTone(trigger);
    const generatedMessage = generateOutreach(persona, context, channel, tone);

    // Create the decision
    const decision: OutreachDecision = {
      trigger,
      decision: 'send',
      decidedAt: now,
      persona,
      channel,
      scheduledFor: now,
      generatedMessage,
    };

    // Record in history
    this.recordDecision(trigger.userId, decision);

    // Record that we're reaching out
    this.recordOutreach(trigger.userId);

    // Emit for delivery
    this.emit('outreach-ready', decision);

    log.info(
      {
        triggerId: trigger.id,
        userId: trigger.userId,
        persona,
        channel,
        type: trigger.type,
      },
      '📤 Outreach decision: SEND'
    );

    return decision;
  }

  private createDecision(
    trigger: OutreachTrigger,
    decision: 'skip' | 'defer',
    reason: string,
    deferUntil?: Date
  ): OutreachDecision {
    const result: OutreachDecision = {
      trigger,
      decision,
      decidedAt: new Date(),
      skipReason: decision === 'skip' ? reason : undefined,
      deferUntil: decision === 'defer' ? deferUntil : undefined,
    };

    this.recordDecision(trigger.userId, result);

    log.debug(
      {
        triggerId: trigger.id,
        decision,
        reason,
        deferUntil: deferUntil?.toISOString(),
      },
      `Outreach decision: ${decision.toUpperCase()}`
    );

    return result;
  }

  private recordDecision(userId: string, decision: OutreachDecision): void {
    const history = outreachHistory.get(userId) || [];
    history.push(decision);

    // Keep last 100 decisions per user
    if (history.length > 100) {
      history.shift();
    }

    outreachHistory.set(userId, history);
  }

  // ============================================================================
  // TIMING EVALUATION
  // ============================================================================

  private evaluateTiming(
    state: UserOutreachState,
    trigger: OutreachTrigger,
    now: Date
  ): { defer: boolean; reason?: string; deferUntil?: Date } {
    const hour = now.getHours();
    const day = now.getDay();

    // Check quiet hours
    const quietStart = parseInt(state.preferences.quietHoursStart.split(':')[0]);
    const quietEnd = parseInt(state.preferences.quietHoursEnd.split(':')[0]);

    const inQuietHours =
      (quietStart > quietEnd && (hour >= quietStart || hour < quietEnd)) ||
      (quietStart <= quietEnd && hour >= quietStart && hour < quietEnd);

    if (inQuietHours && trigger.priority !== 'urgent') {
      const deferUntil = new Date(now);
      deferUntil.setHours(quietEnd, 0, 0, 0);
      if (hour >= quietStart) {
        deferUntil.setDate(deferUntil.getDate() + 1);
      }
      return { defer: true, reason: 'Quiet hours', deferUntil };
    }

    // Check learned patterns (unless urgent)
    if (trigger.priority !== 'urgent' && trigger.priority !== 'high') {
      const isPreferredHour = state.patterns.preferredHours.includes(hour);
      const isPreferredDay = state.patterns.preferredDays.includes(day);

      if (!isPreferredHour || !isPreferredDay) {
        // Find next optimal time
        const deferUntil = this.findNextOptimalTime(state, now);
        return { defer: true, reason: 'Not optimal time', deferUntil };
      }
    }

    return { defer: false };
  }

  private findNextOptimalTime(state: UserOutreachState, now: Date): Date {
    const result = new Date(now);
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    // Try to find a good hour today
    const nextGoodHourToday = state.patterns.preferredHours.find((h) => h > currentHour);
    if (nextGoodHourToday !== undefined && state.patterns.preferredDays.includes(currentDay)) {
      result.setHours(nextGoodHourToday, 0, 0, 0);
      return result;
    }

    // Find next good day
    for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
      const futureDay = (currentDay + daysAhead) % 7;
      if (state.patterns.preferredDays.includes(futureDay)) {
        result.setDate(result.getDate() + daysAhead);
        result.setHours(state.patterns.preferredHours[0] || 9, 0, 0, 0);
        return result;
      }
    }

    // Fallback: tomorrow at first preferred hour
    result.setDate(result.getDate() + 1);
    result.setHours(state.patterns.preferredHours[0] || 9, 0, 0, 0);
    return result;
  }

  private getNextDay(now: Date): Date {
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  private getNextWeek(now: Date): Date {
    const result = new Date(now);
    result.setDate(result.getDate() + 7);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  // ============================================================================
  // CHANNEL SELECTION
  // ============================================================================

  private selectChannel(
    trigger: OutreachTrigger,
    state: UserOutreachState
  ): OutreachChannel | null {
    // Get allowed channels based on relationship
    const relationshipPermissions = this.config.relationshipPermissions[state.relationshipStage];
    const allowedByRelationship = relationshipPermissions.allowedChannels;

    // Intersect with user's allowed channels
    const allowedChannels = state.allowedChannels.filter((c) => allowedByRelationship.includes(c));

    if (allowedChannels.length === 0) {
      return null;
    }

    // Check user preference
    if (
      state.preferences.preferredChannel &&
      allowedChannels.includes(state.preferences.preferredChannel)
    ) {
      return state.preferences.preferredChannel;
    }

    // Select based on trigger type and priority
    if (trigger.priority === 'urgent') {
      // Urgent = most immediate channel
      if (allowedChannels.includes('call')) return 'call';
      if (allowedChannels.includes('sms')) return 'sms';
    }

    // Content-based selection
    const channelForTrigger = this.getChannelForTriggerType(trigger.type);
    if (channelForTrigger && allowedChannels.includes(channelForTrigger)) {
      return channelForTrigger;
    }

    // Historical success-based selection
    const bestChannel = Object.entries(state.patterns.responseRateByChannel)
      .filter(([channel]) => allowedChannels.includes(channel as OutreachChannel))
      .sort(([, a], [, b]) => b - a)[0];

    if (bestChannel) {
      return bestChannel[0] as OutreachChannel;
    }

    // Fallback to first allowed
    return allowedChannels[0];
  }

  private getChannelForTriggerType(type: OutreachTriggerType): OutreachChannel | null {
    const channelMap: Partial<Record<OutreachTriggerType, OutreachChannel>> = {
      // Emotional stuff is better via call or voice
      emotional_support: 'call',
      celebration: 'call',

      // Quick check-ins work well as texts
      commitment_check: 'sms',
      habit_check: 'sms',
      thinking_of_you: 'sms',

      // Detailed stuff goes to email
      content_share: 'email',
      insight_discovery: 'email',
      reengagement: 'email',
    };

    return channelMap[type] || null;
  }

  // ============================================================================
  // CONTEXT BUILDING
  // ============================================================================

  private buildOutreachContext(
    trigger: OutreachTrigger,
    state: UserOutreachState
  ): OutreachContext {
    return {
      userId: trigger.userId,
      userName: state.context.recentTopics?.[0] || 'there', // TODO: Get from profile
      relationshipStage: state.relationshipStage,

      trigger: {
        type: trigger.type,
        reason: trigger.reason,
        urgency: trigger.priority,
      },

      context: {
        recentTopics: state.context.recentTopics,
        recentWins: state.context.recentWins,
        currentStruggles: state.context.currentStruggles,
        upcomingEvents: state.context.upcomingEvents?.map((e) => e.description),
        emotionalState: state.context.emotionalState,
      },

      commitment: trigger.commitment,
      milestone: trigger.milestone,
      goal: trigger.goal,
      event: trigger.event,
    };
  }

  private determineTone(trigger: OutreachTrigger): OutreachTone {
    const toneMap: Partial<Record<OutreachTriggerType, OutreachTone>> = {
      celebration: 'celebratory',
      emotional_support: 'supportive',
      commitment_check: 'encouraging',
      habit_check: 'encouraging',
      thinking_of_you: 'casual',
      reengagement: 'casual',
      appointment_reminder: 'informative',
      event_countdown: 'celebratory',
    };

    if (trigger.priority === 'urgent') {
      return 'urgent';
    }

    return toneMap[trigger.type] || 'casual';
  }

  // ============================================================================
  // HISTORY & ANALYTICS
  // ============================================================================

  /**
   * Get outreach history for a user
   */
  getOutreachHistory(userId: string, limit = 20): OutreachDecision[] {
    const history = outreachHistory.get(userId) || [];
    return history.slice(-limit);
  }

  /**
   * Get analytics for outreach effectiveness
   */
  getAnalytics(userId: string): {
    totalSent: number;
    totalSkipped: number;
    totalDeferred: number;
    byChannel: Record<OutreachChannel, number>;
    byTrigger: Record<string, number>;
  } {
    const history = outreachHistory.get(userId) || [];

    const analytics = {
      totalSent: 0,
      totalSkipped: 0,
      totalDeferred: 0,
      byChannel: {} as Record<OutreachChannel, number>,
      byTrigger: {} as Record<string, number>,
    };

    for (const decision of history) {
      if (decision.decision === 'send') {
        analytics.totalSent++;
        if (decision.channel) {
          analytics.byChannel[decision.channel] = (analytics.byChannel[decision.channel] || 0) + 1;
        }
      } else if (decision.decision === 'skip') {
        analytics.totalSkipped++;
      } else if (decision.decision === 'defer') {
        analytics.totalDeferred++;
      }

      const triggerType = decision.trigger.type;
      analytics.byTrigger[triggerType] = (analytics.byTrigger[triggerType] || 0) + 1;
    }

    return analytics;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Clear all data for a user (for testing or privacy)
   */
  clearUserData(userId: string): void {
    userStateStore.delete(userId);
    pendingTriggers.delete(userId);
    outreachHistory.delete(userId);
    log.info({ userId }, 'Cleared all outreach data for user');
  }

  /**
   * Reset weekly counters (call this weekly via cron)
   */
  resetWeeklyCounters(): void {
    for (const [userId, state] of userStateStore.entries()) {
      state.counters.outreachThisWeek = 0;
      userStateStore.set(userId, state);
    }
    log.info('Reset weekly outreach counters for all users');
  }

  /**
   * Get all user IDs in the system
   */
  getAllUserIds(): string[] {
    return Array.from(userStateStore.keys());
  }

  /**
   * Prune history older than a cutoff date
   */
  pruneHistory(userId: string, cutoffDate: Date): number {
    const history = outreachHistory.get(userId) || [];
    const cutoffTime = cutoffDate.getTime();
    const filtered = history.filter((d) => new Date(d.decidedAt).getTime() > cutoffTime);
    const pruned = history.length - filtered.length;
    outreachHistory.set(userId, filtered);
    return pruned;
  }

  /**
   * Alias for clearUserData (for consistency)
   */
  clearUserState(userId: string): void {
    this.clearUserData(userId);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engineInstance: OutreachDecisionEngine | null = null;

export function getOutreachDecisionEngine(
  config?: Partial<DecisionEngineConfig>
): OutreachDecisionEngine {
  if (!engineInstance) {
    engineInstance = new OutreachDecisionEngine(config);
  }
  return engineInstance;
}

export function startOutreachDecisionEngine(
  config?: Partial<DecisionEngineConfig>
): OutreachDecisionEngine {
  const engine = getOutreachDecisionEngine(config);
  engine.start();
  return engine;
}

export function stopOutreachDecisionEngine(): void {
  if (engineInstance) {
    engineInstance.stop();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { OutreachDecisionEngine };

export default {
  getOutreachDecisionEngine,
  startOutreachDecisionEngine,
  stopOutreachDecisionEngine,
};
