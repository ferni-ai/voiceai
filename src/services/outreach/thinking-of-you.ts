/**
 * Thinking of You - Random Kindness Engine
 *
 * This service generates non-task-driven outreach - the kind of messages
 * a thoughtful friend would send just because.
 *
 * "Saw this and thought of you"
 * "Just wanted to check in"
 * "Been 3 months since we started talking!"
 * "How are you handling winter?"
 *
 * Philosophy: Not every outreach needs a reason. Sometimes connection IS the reason.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { EventEmitter } from 'events';
import {
  getOutreachDecisionEngine,
  type OutreachTriggerType,
  type OutreachPriority,
} from './decision-engine.js';
import type { AgentId } from '../agent-bus.js';

// ============================================================================
// TYPES
// ============================================================================

export type ThinkingOfYouTrigger =
  | 'random_kindness' // Just because
  | 'relevant_content' // "Saw this and thought of you"
  | 'relationship_anniversary' // "It's been X months since we started!"
  | 'seasonal' // "How are you handling winter?"
  | 'after_silence' // Gentle reconnection
  | 'milestone_reflection' // "Remember when you started this journey?"
  | 'life_event_followup' // "How was the wedding?"
  | 'insight_share' // "I realized something about what you said"
  | 'appreciation' // "I just want to say I'm proud of you"
  | 'humor'; // Share something funny/relevant

export interface ThinkingOfYouConfig {
  // How often to consider random outreach
  checkIntervalMs: number; // 24 hours default

  // Base probability of reaching out (per user per check)
  baseProbability: number; // 0.1 = 10% chance per check

  // Probability modifiers
  probabilityBoosts: {
    userSeemingDown: number; // +30% if recent struggles
    longTimeSinceContact: number; // +20% if > 5 days
    upcomingChallenge: number; // +25% if big event coming
    recentBigWin: number; // +15% to celebrate more
    seasonalRelevance: number; // +10% during holidays
    relationshipAnniversary: number; // +40% on anniversaries
  };

  // Limits
  maxPerWeek: number;
  minDaysBetween: number;

  // Content
  seasonDates: {
    spring: { start: string; end: string };
    summer: { start: string; end: string };
    fall: { start: string; end: string };
    winter: { start: string; end: string };
  };
}

export interface UserKindnessState {
  userId: string;
  relationshipStartDate?: Date;
  lastKindnessDate?: Date;
  kindnessThisWeek: number;

  // Context for generating messages
  context: {
    emotionalState?: string;
    recentTopics?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: Array<{ date: Date; description: string }>;
    interests?: string[];
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ThinkingOfYouConfig = {
  checkIntervalMs: 24 * 60 * 60 * 1000, // Daily check

  baseProbability: 0.1, // 10% base chance

  probabilityBoosts: {
    userSeemingDown: 0.3,
    longTimeSinceContact: 0.2,
    upcomingChallenge: 0.25,
    recentBigWin: 0.15,
    seasonalRelevance: 0.1,
    relationshipAnniversary: 0.4,
  },

  maxPerWeek: 2,
  minDaysBetween: 3,

  seasonDates: {
    spring: { start: '03-20', end: '06-20' },
    summer: { start: '06-21', end: '09-21' },
    fall: { start: '09-22', end: '12-20' },
    winter: { start: '12-21', end: '03-19' },
  },
};

// ============================================================================
// STORAGE
// ============================================================================

const userKindnessStore = new Map<string, UserKindnessState>();

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

interface KindnessTemplate {
  trigger: ThinkingOfYouTrigger;
  condition?: (state: UserKindnessState) => boolean;
  generateReason: (state: UserKindnessState) => string;
  persona: AgentId;
  priority: OutreachPriority;
}

const kindnessTemplates: KindnessTemplate[] = [
  // Random kindness - no specific reason
  {
    trigger: 'random_kindness',
    generateReason: () => 'Just wanted to check in and see how you are doing.',
    persona: 'ferni',
    priority: 'low',
  },

  // Appreciation
  {
    trigger: 'appreciation',
    condition: (state) => (state.context.recentWins?.length || 0) > 0,
    generateReason: (state) =>
      `I've noticed how hard you've been working on ${state.context.recentWins?.[0] || 'your goals'}. Wanted to acknowledge that.`,
    persona: 'ferni',
    priority: 'low',
  },

  // Life event follow-up
  {
    trigger: 'life_event_followup',
    condition: (state) => {
      if (!state.context.upcomingEvents) return false;
      const now = new Date();
      return state.context.upcomingEvents.some((e) => {
        const eventDate = new Date(e.date);
        const daysSince = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 0 && daysSince < 7; // Event was within last week
      });
    },
    generateReason: (state) => {
      const recentEvent = state.context.upcomingEvents?.find((e) => {
        const eventDate = new Date(e.date);
        const daysSince = (new Date().getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 0 && daysSince < 7;
      });
      return `Checking in to see how ${recentEvent?.description || 'your event'} went!`;
    },
    persona: 'ferni',
    priority: 'low',
  },

  // Relationship anniversary
  {
    trigger: 'relationship_anniversary',
    condition: (state) => {
      if (!state.relationshipStartDate) return false;
      const now = new Date();
      const start = new Date(state.relationshipStartDate);
      const monthsSince = Math.floor(
        (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      // Check if it's a milestone month (1, 3, 6, 12, etc.)
      return [1, 3, 6, 12, 18, 24].includes(monthsSince) && now.getDate() === start.getDate();
    },
    generateReason: (state) => {
      const start = new Date(state.relationshipStartDate!);
      const monthsSince = Math.floor(
        (new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      return `It's been ${monthsSince} months since we started talking! Wanted to celebrate that.`;
    },
    persona: 'ferni',
    priority: 'low',
  },

  // Seasonal check-in
  {
    trigger: 'seasonal',
    condition: () => isSeasonTransition(),
    generateReason: () => {
      const season = getCurrentSeason();
      const messages: Record<string, string> = {
        winter: 'Checking in as the days get shorter. How are you handling the seasonal shift?',
        spring:
          'Spring is in the air! Wanted to see how you are feeling with the change of season.',
        summer: 'Summer is here! Hope you are finding some time to enjoy it.',
        fall: 'Fall is arriving. How are you feeling about the change of pace?',
      };
      return messages[season] || 'Just checking in with the change of season.';
    },
    persona: 'ferni',
    priority: 'low',
  },

  // After silence (gentle reconnection)
  {
    trigger: 'after_silence',
    condition: (state) => {
      if (!state.lastKindnessDate) return true; // Never reached out
      const daysSince =
        (new Date().getTime() - state.lastKindnessDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 14; // More than 2 weeks
    },
    generateReason: () =>
      'It has been a while since we talked. Just wanted to say hi and see how you are.',
    persona: 'ferni',
    priority: 'low',
  },

  // Supportive check-in when struggling
  {
    trigger: 'random_kindness',
    condition: (state) =>
      state.context.emotionalState === 'struggling' ||
      (state.context.currentStruggles?.length || 0) > 0,
    generateReason: (state) =>
      state.context.currentStruggles?.[0]
        ? `I know ${state.context.currentStruggles[0]} has been tough. Just wanted you to know I'm thinking of you.`
        : 'I know things have been challenging. Just wanted to check in.',
    persona: 'ferni',
    priority: 'medium', // Slightly higher priority for support
  },

  // Interest-based check-in
  {
    trigger: 'relevant_content',
    condition: (state) => (state.context.interests?.length || 0) > 0,
    generateReason: (state) =>
      `I came across something related to ${state.context.interests?.[0]} and thought of you!`,
    persona: 'peter-john', // Peter shares content
    priority: 'low',
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const log = getLogger().child({ service: 'thinking-of-you' });

function getCurrentSeason(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const mmdd = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  const config = DEFAULT_CONFIG.seasonDates;

  // Handle winter wrapping around year boundary
  if (mmdd >= config.winter.start || mmdd <= config.winter.end) return 'winter';
  if (mmdd >= config.spring.start && mmdd <= config.spring.end) return 'spring';
  if (mmdd >= config.summer.start && mmdd <= config.summer.end) return 'summer';
  if (mmdd >= config.fall.start && mmdd <= config.fall.end) return 'fall';

  return 'winter'; // Default
}

function isSeasonTransition(): boolean {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const mmdd = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  const config = DEFAULT_CONFIG.seasonDates;

  // Check if within first week of any season
  const seasonStarts = [
    config.spring.start,
    config.summer.start,
    config.fall.start,
    config.winter.start,
  ];

  for (const start of seasonStarts) {
    const startMonth = parseInt(start.split('-')[0]);
    const startDay = parseInt(start.split('-')[1]);
    const currentMonth = month;
    const currentDay = day;

    if (currentMonth === startMonth && Math.abs(currentDay - startDay) <= 7) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// THINKING OF YOU ENGINE
// ============================================================================

class ThinkingOfYouEngine extends EventEmitter {
  private config: ThinkingOfYouConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private userIds = new Set<string>();

  constructor(config: Partial<ThinkingOfYouConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info('💭 Thinking of You Engine created');
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  start(): void {
    log.info({ intervalMs: this.config.checkIntervalMs }, '💭 Thinking of You Engine started');

    // Run daily check
    this.intervalId = setInterval(() => {
      void this.runDailyCheck();
    }, this.config.checkIntervalMs);

    // Also run immediately
    void this.runDailyCheck();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    log.info('💭 Thinking of You Engine stopped');
  }

  /**
   * Register a user for thinking-of-you outreach
   */
  registerUser(userId: string, startDate?: Date): void {
    this.userIds.add(userId);

    if (!userKindnessStore.has(userId)) {
      userKindnessStore.set(userId, {
        userId,
        relationshipStartDate: startDate || new Date(),
        kindnessThisWeek: 0,
        context: {},
      });
    }

    log.debug({ userId }, 'User registered for thinking-of-you');
  }

  /**
   * Unregister a user
   */
  unregisterUser(userId: string): void {
    this.userIds.delete(userId);
  }

  /**
   * Update user context (call this after conversations)
   */
  updateUserContext(userId: string, context: Partial<UserKindnessState['context']>): void {
    const state = userKindnessStore.get(userId);
    if (state) {
      state.context = { ...state.context, ...context };
      userKindnessStore.set(userId, state);
    }
  }

  // ============================================================================
  // DAILY CHECK
  // ============================================================================

  private async runDailyCheck(): Promise<void> {
    log.debug({ userCount: this.userIds.size }, 'Running thinking-of-you check');

    for (const userId of this.userIds) {
      await this.checkUser(userId);
    }
  }

  private async checkUser(userId: string): Promise<void> {
    const state = userKindnessStore.get(userId);
    if (!state) return;

    // Check rate limits
    if (state.kindnessThisWeek >= this.config.maxPerWeek) {
      log.debug({ userId }, 'Weekly kindness limit reached');
      return;
    }

    if (state.lastKindnessDate) {
      const daysSince =
        (new Date().getTime() - state.lastKindnessDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < this.config.minDaysBetween) {
        log.debug({ userId, daysSince }, 'Too soon since last kindness');
        return;
      }
    }

    // Calculate probability
    let probability = this.config.baseProbability;

    // Apply boosts
    if (
      state.context.emotionalState === 'struggling' ||
      (state.context.currentStruggles?.length || 0) > 0
    ) {
      probability += this.config.probabilityBoosts.userSeemingDown;
    }

    if (state.lastKindnessDate) {
      const daysSince =
        (new Date().getTime() - state.lastKindnessDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 5) {
        probability += this.config.probabilityBoosts.longTimeSinceContact;
      }
    }

    if ((state.context.upcomingEvents?.length || 0) > 0) {
      probability += this.config.probabilityBoosts.upcomingChallenge;
    }

    if ((state.context.recentWins?.length || 0) > 0) {
      probability += this.config.probabilityBoosts.recentBigWin;
    }

    if (isSeasonTransition()) {
      probability += this.config.probabilityBoosts.seasonalRelevance;
    }

    // Check for relationship anniversary
    if (state.relationshipStartDate) {
      const now = new Date();
      const start = new Date(state.relationshipStartDate);
      const monthsSince = Math.floor(
        (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      if ([1, 3, 6, 12, 18, 24].includes(monthsSince) && now.getDate() === start.getDate()) {
        probability += this.config.probabilityBoosts.relationshipAnniversary;
      }
    }

    log.debug({ userId, probability }, 'Calculated kindness probability');

    // Roll the dice
    if (Math.random() > probability) {
      return; // Not this time
    }

    // Select an appropriate template
    const template = this.selectTemplate(state);
    if (!template) {
      log.debug({ userId }, 'No appropriate kindness template found');
      return;
    }

    // Create the trigger
    const reason = template.generateReason(state);

    const engine = getOutreachDecisionEngine();
    engine.addTrigger({
      type: 'thinking_of_you' as OutreachTriggerType,
      userId,
      priority: template.priority,
      reason,
      suggestedPersona: template.persona,
    });

    // Update state
    state.lastKindnessDate = new Date();
    state.kindnessThisWeek++;
    userKindnessStore.set(userId, state);

    log.info(
      { userId, trigger: template.trigger, persona: template.persona },
      '💭 Thinking-of-you outreach triggered'
    );

    this.emit('kindness-triggered', { userId, template, reason });
  }

  private selectTemplate(state: UserKindnessState): KindnessTemplate | null {
    // Filter to templates whose conditions are met
    const eligible = kindnessTemplates.filter((t) => {
      if (t.condition) {
        return t.condition(state);
      }
      return true;
    });

    if (eligible.length === 0) {
      return null;
    }

    // Weight by relevance
    const weighted: Array<{ template: KindnessTemplate; weight: number }> = eligible.map((t) => {
      let weight = 1;

      // Boost specific triggers based on context
      if (
        t.trigger === 'life_event_followup' &&
        state.context.upcomingEvents?.some((e) => {
          const daysSince =
            (new Date().getTime() - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24);
          return daysSince > 0 && daysSince < 7;
        })
      ) {
        weight = 5; // Strong boost for recent events
      }

      if (t.trigger === 'relationship_anniversary') {
        weight = 4; // Important milestone
      }

      if (
        t.trigger === 'random_kindness' &&
        (state.context.emotionalState === 'struggling' ||
          (state.context.currentStruggles?.length || 0) > 0)
      ) {
        weight = 3; // Support is important
      }

      if (t.trigger === 'seasonal' && isSeasonTransition()) {
        weight = 2;
      }

      return { template: t, weight };
    });

    // Weighted random selection
    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const { template, weight } of weighted) {
      random -= weight;
      if (random <= 0) {
        return template;
      }
    }

    // Fallback
    return weighted[0]?.template || null;
  }

  // ============================================================================
  // MANUAL TRIGGERS
  // ============================================================================

  /**
   * Manually trigger a thinking-of-you for a user
   * Useful for testing or admin override
   */
  async triggerKindness(
    userId: string,
    trigger?: ThinkingOfYouTrigger,
    reason?: string
  ): Promise<void> {
    const state = userKindnessStore.get(userId);
    if (!state) {
      log.warn({ userId }, 'User not registered for thinking-of-you');
      return;
    }

    let template: KindnessTemplate | null = null;

    if (trigger) {
      template = kindnessTemplates.find((t) => t.trigger === trigger) || null;
    } else {
      template = this.selectTemplate(state);
    }

    if (!template) {
      template = kindnessTemplates[0]; // Fallback to random kindness
    }

    const finalReason = reason || template.generateReason(state);

    const engine = getOutreachDecisionEngine();
    engine.addTrigger({
      type: 'thinking_of_you' as OutreachTriggerType,
      userId,
      priority: template.priority,
      reason: finalReason,
      suggestedPersona: template.persona,
    });

    log.info({ userId, trigger: template.trigger }, '💭 Manual kindness triggered');
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Reset weekly counters (call this weekly via cron)
   */
  resetWeeklyCounters(): void {
    for (const [userId, state] of userKindnessStore.entries()) {
      state.kindnessThisWeek = 0;
      userKindnessStore.set(userId, state);
    }
    log.info('Reset weekly kindness counters');
  }

  /**
   * Clear user data
   */
  clearUserData(userId: string): void {
    userKindnessStore.delete(userId);
    this.userIds.delete(userId);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engineInstance: ThinkingOfYouEngine | null = null;

export function getThinkingOfYouEngine(config?: Partial<ThinkingOfYouConfig>): ThinkingOfYouEngine {
  if (!engineInstance) {
    engineInstance = new ThinkingOfYouEngine(config);
  }
  return engineInstance;
}

export function startThinkingOfYouEngine(
  config?: Partial<ThinkingOfYouConfig>
): ThinkingOfYouEngine {
  const engine = getThinkingOfYouEngine(config);
  engine.start();
  return engine;
}

export function stopThinkingOfYouEngine(): void {
  if (engineInstance) {
    engineInstance.stop();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ThinkingOfYouEngine, getCurrentSeason, isSeasonTransition };

export default {
  getThinkingOfYouEngine,
  startThinkingOfYouEngine,
  stopThinkingOfYouEngine,
};
