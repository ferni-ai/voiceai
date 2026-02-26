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
import { clearNamedInterval, registerInterval } from '../../utils/interval-manager.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { AgentId } from '../agent-bus.js';
import {
  loadOutreachProfile,
  loadPendingTriggers,
  saveOutreachProfile,
  saveTrigger,
} from './firestore-persistence.js';
import {
  generateOutreach,
  selectPersonaForOutreach,
  type OutreachChannel,
  type OutreachContext,
  type OutreachTone,
} from './persona-voice-generator.js';
import {
  evaluateTiming as evaluateTimingWindow,
  getNextDay,
  getNextWeek,
} from './scheduling/send-window-optimizer.js';
import {
  recordDecision as recordDecisionToHistory,
  getOutreachHistory as getHistoryFromMetrics,
  loadOutreachHistoryFromFirestore as loadHistoryFromFirestore,
  getAnalytics as getAnalyticsFromMetrics,
  pruneHistory as pruneHistoryFromMetrics,
  clearHistory as clearHistoryFromMetrics,
} from './analytics/engagement-metrics.js';
import {
  getPendingCheckIns,
  recordCheckInSent,
  type CheckInType,
} from './onboarding-checkin-arc.js';
import {
  onNeedsTeamSupport,
  onNeedsTeamRoundtable,
  onNeedsMultiplePerspectives,
} from './superhuman-outreach-bridge.js';

// Redis cache for real-time session suppression
import { getRedisCache } from '../../memory/redis-cache.js';

// Re-export types from dedicated types module
export type {
  OutreachTriggerType,
  OutreachPriority,
  OutreachTrigger,
  OutreachDecision,
  UserOutreachState,
  DecisionEngineConfig,
} from './decision-engine-types.js';

import type {
  OutreachTriggerType,
  OutreachPriority,
  OutreachTrigger,
  OutreachDecision,
  UserOutreachState,
  DecisionEngineConfig,
} from './decision-engine-types.js';

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

// ============================================================================
// OUTREACH DECISION ENGINE
// ============================================================================

const log = getLogger().child({ service: 'outreach-decision-engine' });

class OutreachDecisionEngine extends EventEmitter {
  private config: DecisionEngineConfig;
  private intervalId: (() => void) | null = null;
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
    this.intervalId = registerInterval(
      'outreach-decision-engine-triggers',
      () => {
        void this.processPendingTriggers();
      },
      this.config.checkIntervalMs
    );
  }

  stop(): void {
    clearNamedInterval('outreach-decision-engine-triggers');
    this.intervalId = null;
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

    // Persist to Firestore (fire and forget for speed)
    saveTrigger(fullTrigger, trigger.suggestedTime).catch((err) => {
      log.debug({ err, triggerId: id }, 'Failed to persist trigger (non-fatal)');
    });

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

  /**
   * Check for pending onboarding check-ins and create triggers
   * Should be called periodically by the scheduled job
   */
  async checkOnboardingTriggers(userId: string): Promise<string[]> {
    const createdTriggerIds: string[] = [];

    try {
      // Get pending check-ins from the onboarding arc service
      const pendingCheckIns = await getPendingCheckIns(userId);

      if (pendingCheckIns.length === 0) {
        return createdTriggerIds;
      }

      log.info(
        { userId, pendingCount: pendingCheckIns.length },
        '🎓 Found pending onboarding check-ins'
      );

      // Map check-in types to trigger types
      const checkInTypeToTrigger: Record<CheckInType, OutreachTriggerType> = {
        welcome_followup: 'onboarding_welcome',
        next_day_check: 'onboarding_nextday',
        topic_deepdive: 'onboarding_topic_deepdive',
        first_week_reflection: 'onboarding_first_week',
        momentum_check: 'onboarding_momentum',
        two_week_celebration: 'onboarding_two_week',
        habit_nudge: 'onboarding_momentum',
        win_celebration: 'celebration',
      };

      for (const checkIn of pendingCheckIns) {
        // Create a trigger for this check-in
        const triggerType = checkInTypeToTrigger[checkIn.type] || 'check_in';

        const triggerId = this.addTrigger({
          type: triggerType,
          userId,
          priority: checkIn.priority,
          reason: checkIn.reason,
          context: {
            checkInType: checkIn.type,
            scheduledFor: checkIn.scheduledFor,
          },
          suggestedTime: checkIn.scheduledFor,
          // Use the persona from the check-in (usually ferni for onboarding)
          suggestedPersona: checkIn.persona as AgentId,
        });

        createdTriggerIds.push(triggerId);

        log.debug(
          { userId, checkInType: checkIn.type, triggerId },
          '🎓 Created onboarding trigger'
        );
      }

      return createdTriggerIds;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to check onboarding triggers');
      return createdTriggerIds;
    }
  }

  /**
   * Mark an onboarding check-in as sent (called after successful outreach)
   */
  markOnboardingCheckInSent(
    userId: string,
    checkInType: CheckInType,
    responseReceived = false
  ): void {
    try {
      recordCheckInSent(userId, checkInType, responseReceived);
      log.debug({ userId, checkInType, responseReceived }, '✅ Onboarding check-in marked as sent');
    } catch (error) {
      log.warn(
        { error: String(error), userId, checkInType },
        'Failed to mark onboarding check-in as sent'
      );
    }
  }

  // ============================================================================
  // USER STATE MANAGEMENT
  // ============================================================================

  /**
   * Get or create user outreach state (sync - uses cache or creates default)
   * For hydrated data from Firestore, call loadUserStateFromFirestore first
   */
  getUserState(userId: string): UserOutreachState {
    let state = userStateStore.get(userId);
    if (!state) {
      state = this.createDefaultUserState(userId);
      userStateStore.set(userId, state);

      // Async load from Firestore to hydrate (fire and forget)
      this.loadUserStateFromFirestore(userId).catch((e) => {
        log.debug({ error: String(e), userId }, 'Firestore state load failed (using defaults)');
      });
    }
    return state;
  }

  /**
   * Load user state from Firestore (async - call for full hydration)
   */
  async loadUserStateFromFirestore(userId: string): Promise<UserOutreachState> {
    const profile = await loadOutreachProfile(userId);
    if (profile?.state) {
      // Merge with any existing in-memory state
      const existing = userStateStore.get(userId) || this.createDefaultUserState(userId);
      const merged = { ...existing, ...profile.state };
      userStateStore.set(userId, merged);
      log.debug({ userId }, 'Loaded user state from Firestore');
      return merged;
    }
    return this.getUserState(userId);
  }

  /**
   * Update user outreach state
   */
  updateUserState(userId: string, updates: Partial<UserOutreachState>): void {
    const state = this.getUserState(userId);
    const updated = { ...state, ...updates };
    userStateStore.set(userId, updated);

    // Persist to Firestore
    this.persistUserState(userId, updated);

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

    // Persist to Firestore
    this.persistUserState(userId, state);

    log.info({ userId, preferences }, '⚙️ User outreach preferences updated');
  }

  /**
   * Update user context (from conversation analysis)
   */
  updateUserContext(userId: string, context: Partial<UserOutreachState['context']>): void {
    const state = this.getUserState(userId);
    state.context = { ...state.context, ...context };
    userStateStore.set(userId, state);

    // Persist to Firestore (debounced - context updates frequently)
    this.persistUserState(userId, state);
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

    // Persist to Firestore
    this.persistUserState(userId, state);
  }

  /**
   * Persist user state to Firestore (fire and forget)
   */
  private persistUserState(userId: string, state: UserOutreachState): void {
    saveOutreachProfile(userId, { state }).catch((err) => {
      log.debug({ err, userId }, 'Failed to persist user state (non-fatal)');
    });
  }

  private createDefaultUserState(userId: string): UserOutreachState {
    return {
      userId,
      // OPT-OUT BY DEFAULT: Users must explicitly enable proactive outreach
      outreachEnabled: false,
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

    // Decision 1.5: Check Redis session suppression (user in session or just finished)
    try {
      const redis = getRedisCache();
      const suppression = await redis.isOutreachSuppressed(trigger.userId);
      if (suppression.suppressed) {
        // Defer until suppression expires (30 min from session end typically)
        const deferTime = new Date(Date.now() + 30 * 60 * 1000);
        return this.createDecision(
          trigger,
          'defer',
          `Session suppression: ${suppression.reason || 'user in/recently in session'}`,
          deferTime
        );
      }
    } catch (redisErr) {
      // Redis unavailable - proceed without suppression check
      log.debug({ error: String(redisErr) }, 'Redis suppression check failed (proceeding)');
    }

    // Decision 2: Rate limit check
    if (state.counters.outreachToday >= state.preferences.maxPerDay) {
      return this.createDecision(trigger, 'defer', 'Daily limit reached', getNextDay(now));
    }

    if (state.counters.outreachThisWeek >= state.preferences.maxPerWeek) {
      return this.createDecision(trigger, 'defer', 'Weekly limit reached', getNextWeek(now));
    }

    // Decision 3: Check for GROUP OUTREACH triggers
    // These are handled by the group outreach system, not single-persona flow
    if (this.isGroupOutreachTrigger(trigger, state)) {
      await this.routeToGroupOutreach(trigger, state);
      // Mark as sent (group outreach handles its own delivery)
      this.recordOutreach(trigger.userId);
      return {
        trigger,
        decision: 'send',
        decidedAt: now,
        // Group outreach - no single persona/channel
      };
    }

    // Decision 4: Is this a good time? (delegated to send-window-optimizer)
    const timingDecision = await evaluateTimingWindow(state, trigger, now);
    if (timingDecision.defer) {
      return this.createDecision(
        trigger,
        'defer',
        timingDecision.reason || 'Timing not optimal',
        timingDecision.deferUntil
      );
    }

    // Decision 5: Select persona
    const persona =
      trigger.suggestedPersona ||
      (selectPersonaForOutreach(
        trigger.type,
        trigger.lastPersona || state.lastPersona,
        trigger.wasRecentConversation
      ) as AgentId);

    // Decision 6: Select channel
    const channel = this.selectChannel(trigger, state);
    if (!channel) {
      return this.createDecision(trigger, 'skip', 'No suitable channel available');
    }

    // Decision 7: Generate the message
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
    recordDecisionToHistory(userId, decision);
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
      check_in: 'sms',

      // Trust-based triggers work well as texts (personal, non-intrusive)
      growth_reflection: 'sms',
      shared_memory: 'sms',
      life_rhythm_prediction: 'sms',

      // Onboarding check-ins (gentle texts, not too intrusive)
      onboarding_welcome: 'sms',
      onboarding_nextday: 'sms',
      onboarding_topic_deepdive: 'sms',
      onboarding_first_week: 'sms',
      onboarding_momentum: 'sms',
      onboarding_two_week: 'email', // Longer, more celebratory - email fits better

      // Detailed stuff goes to email
      content_share: 'email',
      insight_discovery: 'email',
      reengagement: 'email',
    };

    return channelMap[type] || null;
  }

  // ============================================================================
  // GROUP OUTREACH ROUTING
  // ============================================================================

  /**
   * Determine if a trigger should use group outreach (multiple personas)
   */
  private isGroupOutreachTrigger(trigger: OutreachTrigger, state: UserOutreachState): boolean {
    // Explicit group outreach types
    const groupTriggerTypes: OutreachTriggerType[] = [
      'team_insight',
      'collaborative_support',
      'planning',
      'team_roundtable',
    ];

    if (groupTriggerTypes.includes(trigger.type)) {
      return true;
    }

    // Escalate to group support for severe situations
    if (trigger.type === 'emotional_support' && trigger.priority === 'urgent') {
      return true;
    }

    // Escalate celebratory moments for deep relationships
    if (trigger.type === 'celebration' && state.relationshipStage === 'deep') {
      return true;
    }

    // Complex planning that benefits from multiple perspectives
    if (trigger.type === 'milestone_approaching' && trigger.context?.complexity === 'high') {
      return true;
    }

    return false;
  }

  /**
   * Route trigger to appropriate group outreach handler
   */
  private async routeToGroupOutreach(
    trigger: OutreachTrigger,
    state: UserOutreachState
  ): Promise<void> {
    const preferredName = this.getUserNameFromContext(trigger.userId, state);

    log.info(
      { userId: trigger.userId, type: trigger.type, priority: trigger.priority },
      '👥 Routing to group outreach'
    );

    switch (trigger.type) {
      case 'team_roundtable':
        await onNeedsTeamRoundtable(trigger.userId, {
          topic: String(trigger.context?.topic || trigger.reason),
          reason: trigger.reason,
          suggestedPersonas: trigger.context?.personas as string[] | undefined,
          collaborationMode: trigger.context?.mode as
            | 'discussion'
            | 'brainstorm'
            | 'support'
            | undefined,
          preferredName,
        });
        break;

      case 'team_insight':
        await onNeedsMultiplePerspectives(trigger.userId, {
          topic: String(trigger.context?.topic || trigger.reason),
          insightSummary: trigger.reason,
          preferredName,
        });
        break;

      case 'collaborative_support':
      case 'emotional_support':
        await onNeedsTeamSupport(trigger.userId, {
          type: trigger.priority === 'urgent' ? 'crisis' : 'complex_challenge',
          description: trigger.reason,
          preferredName,
          currentStruggles: state.context.currentStruggles,
        });
        break;

      case 'celebration':
        await onNeedsTeamSupport(trigger.userId, {
          type: 'celebration',
          description: trigger.milestone || trigger.reason,
          preferredName,
        });
        break;

      case 'planning':
      case 'milestone_approaching':
        await onNeedsTeamRoundtable(trigger.userId, {
          topic: trigger.milestone || trigger.event || trigger.reason,
          reason: trigger.reason,
          collaborationMode: 'brainstorm',
          preferredName,
        });
        break;

      default:
        // Fallback to team support
        await onNeedsTeamSupport(trigger.userId, {
          type: 'complex_challenge',
          description: trigger.reason,
          preferredName,
        });
    }
  }

  // ============================================================================
  // CONTEXT BUILDING
  // ============================================================================

  private buildOutreachContext(
    trigger: OutreachTrigger,
    state: UserOutreachState
  ): OutreachContext {
    // Get username from context aggregator's personal info
    const userName = this.getUserNameFromContext(trigger.userId, state);

    return {
      userId: trigger.userId,
      userName,
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

  /**
   * Get user's name from context aggregator or profile
   */
  private getUserNameFromContext(userId: string, state: UserOutreachState): string {
    // Try context aggregator first (has personal info from conversations)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getUserContext } = require('./context-aggregator.js');
      const context = getUserContext(userId);
      if (context?.personal?.preferredName) {
        return context.personal.preferredName;
      }
      if (context?.personal?.firstName) {
        return context.personal.firstName;
      }
    } catch {
      // Context aggregator not available, fall through
    }

    // Fallback: Try user identification service
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getGreeting } = require('../user-identification.js');
      const greeting = getGreeting(userId);
      // Parse name from greeting if it contains one
      const nameMatch = greeting.match(/(?:Welcome back|Hey|Hi),?\s+(\w+)/i);
      if (nameMatch?.[1] && nameMatch[1] !== 'there') {
        return nameMatch[1];
      }
    } catch {
      // User identification not available, fall through
    }

    // Default friendly fallback
    return 'there';
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
      // Trust-based triggers
      growth_reflection: 'encouraging', // Warm reflection on their journey
      shared_memory: 'casual', // Intimate callback to shared moments
      life_rhythm_prediction: 'supportive', // Proactive support before struggle
      check_in: 'casual', // General friendly check-in
    };

    if (trigger.priority === 'urgent') {
      return 'urgent';
    }

    return toneMap[trigger.type] || 'casual';
  }

  // ============================================================================
  // HISTORY & ANALYTICS (delegated to analytics/engagement-metrics.ts)
  // ============================================================================

  getOutreachHistory(userId: string, limit = 20): OutreachDecision[] {
    return getHistoryFromMetrics(userId, limit);
  }

  async loadOutreachHistoryFromFirestore(userId: string, limit = 50): Promise<OutreachDecision[]> {
    return loadHistoryFromFirestore(userId, limit);
  }

  getAnalytics(userId: string) {
    return getAnalyticsFromMetrics(userId);
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
    clearHistoryFromMetrics(userId);

    // Also clear from Firestore
    import('./firestore-persistence.js')
      .then(({ deleteAllUserOutreachData }) => {
        deleteAllUserOutreachData(userId).catch((err) => {
          log.warn(
            { userId, error: String(err) },
            'Failed to delete user outreach data from Firestore'
          );
        });
      })
      .catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to import firestore-persistence module');
      });

    log.info({ userId }, 'Cleared all outreach data for user');
  }

  /**
   * Load pending triggers for a user from Firestore
   */
  async loadUserTriggersFromFirestore(userId: string): Promise<OutreachTrigger[]> {
    const triggers = await loadPendingTriggers(userId);
    if (triggers.length > 0) {
      pendingTriggers.set(userId, triggers);
    }
    return triggers;
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

  pruneHistory(userId: string, cutoffDate: Date): number {
    return pruneHistoryFromMetrics(userId, cutoffDate);
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
