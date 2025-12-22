/**
 * Music Transition Analytics
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks which music transitions lead to better engagement. This data helps us:
 * 1. Understand which transition types work best in different contexts
 * 2. Improve the intelligent transition system over time
 * 3. A/B test new transition strategies
 * 4. Learn per-user preferences
 *
 * Engagement signals we track:
 * - Time until user speaks after transition (shorter = better?)
 * - User's emotional response (positive/negative/neutral)
 * - Whether user continued the topic vs. changed subjects
 * - Session continuation (did they stay engaged?)
 */

import { createLogger } from '../utils/safe-logger.js';
import type { TransitionType, TransitionResult } from './intelligent-music-transitions.js';
import type { MusicStartReason, MusicSessionContext } from './music-session-context.js';

const log = createLogger({ module: 'MusicTransitionAnalytics' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single transition event for analytics
 */
export interface TransitionEvent {
  /** Unique event ID */
  eventId: string;

  /** Session ID for grouping */
  sessionId: string;

  /** User ID for per-user learning */
  userId: string;

  /** Persona that was active */
  personaId: string;

  /** Why music originally started */
  startReason: MusicStartReason;

  /** What type of transition we used */
  transitionType: TransitionType;

  /** Whether we spoke or stayed silent */
  didSpeak: boolean;

  /** The phrase used (if any) */
  phrase?: string;

  /** Confidence score of the transition decision */
  confidence: number;

  /** Context that influenced the decision */
  context: {
    emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis';
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'close_friend';
    isLateNight: boolean;
    topicBeforeMusic?: string;
    wasUserMidThought?: boolean;
    musicDurationMs?: number;
  };

  /** Timestamp when transition occurred */
  timestamp: number;

  /** A/B test variant (if in experiment) */
  experimentVariant?: string;
}

/**
 * Engagement signals after a transition
 */
export interface EngagementSignals {
  /** Event ID this engagement is for */
  eventId: string;

  /** Time (ms) until user spoke after transition */
  timeToUserSpeechMs?: number;

  /** What the user said (first utterance) */
  firstUserUtterance?: string;

  /** Detected emotional response */
  emotionalResponse?: 'positive' | 'negative' | 'neutral';

  /** Did user continue the topic from before music? */
  continuedTopic?: boolean;

  /** Did user explicitly reference the music? */
  mentionedMusic?: boolean;

  /** Session duration after this transition */
  sessionContinuedMs?: number;

  /** User's voice tone (if available) */
  voiceTone?: 'warm' | 'neutral' | 'cold' | 'emotional';
}

/**
 * Aggregated analytics for a transition type
 */
export interface TransitionStats {
  /** Total times this transition type was used */
  count: number;

  /** Average time to user speech (ms) */
  avgTimeToSpeech: number;

  /** Percentage with positive emotional response */
  positiveResponseRate: number;

  /** Percentage where user continued the topic */
  topicContinuationRate: number;

  /** Average session continuation time (ms) */
  avgSessionContinuation: number;

  /** Breakdown by start reason */
  byStartReason: Record<
    MusicStartReason,
    {
      count: number;
      avgTimeToSpeech: number;
      positiveResponseRate: number;
    }
  >;
}

/**
 * A/B Test configuration
 */
export interface ABTestConfig {
  /** Test name */
  name: string;

  /** Is the test active? */
  active: boolean;

  /** Variants and their weights */
  variants: Array<{
    name: string;
    weight: number; // 0-1, must sum to 1
    config: Partial<TransitionOverrides>;
  }>;

  /** Start date */
  startedAt: number;

  /** Minimum sample size per variant */
  minSampleSize: number;
}

/**
 * Overrides for transition behavior (used in A/B tests)
 */
export interface TransitionOverrides {
  /** Force silence probability */
  silenceProbability?: number;

  /** Force specific transition type */
  forceTransitionType?: TransitionType;

  /** Override phrase selection */
  phraseStyle?: 'minimal' | 'standard' | 'warm';
}

// ============================================================================
// ANALYTICS STORAGE
// ============================================================================

/**
 * In-memory analytics store
 * In production, this would be backed by Firestore/BigQuery
 */
class TransitionAnalyticsStore {
  private events = new Map<string, TransitionEvent>();
  private engagements = new Map<string, EngagementSignals>();
  private userStats = new Map<string, Map<TransitionType, TransitionStats>>();
  private globalStats = new Map<TransitionType, TransitionStats>();
  private activeTests = new Map<string, ABTestConfig>();
  private userAssignments = new Map<string, Map<string, string>>(); // userId -> testName -> variant

  // Sliding window for recent events (for real-time analysis)
  private recentEvents: TransitionEvent[] = [];
  private readonly MAX_RECENT_EVENTS = 1000;

  /**
   * Record a transition event
   */
  recordTransition(event: TransitionEvent): void {
    this.events.set(event.eventId, event);
    this.recentEvents.push(event);

    // Trim sliding window
    if (this.recentEvents.length > this.MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }

    log.debug(
      {
        eventId: event.eventId,
        transitionType: event.transitionType,
        didSpeak: event.didSpeak,
        startReason: event.startReason,
      },
      '📊 Transition event recorded'
    );
  }

  /**
   * Record engagement signals for a transition
   */
  recordEngagement(signals: EngagementSignals): void {
    this.engagements.set(signals.eventId, signals);

    // Update stats
    const event = this.events.get(signals.eventId);
    if (event) {
      this.updateStats(event, signals);
    }

    log.debug(
      {
        eventId: signals.eventId,
        timeToSpeech: signals.timeToUserSpeechMs,
        emotionalResponse: signals.emotionalResponse,
      },
      '📊 Engagement signals recorded'
    );
  }

  /**
   * Update aggregated stats
   */
  private updateStats(event: TransitionEvent, signals: EngagementSignals): void {
    // Update global stats
    this.updateStatsMap(this.globalStats, event, signals);

    // Update per-user stats
    let userStatsMap = this.userStats.get(event.userId);
    if (!userStatsMap) {
      userStatsMap = new Map();
      this.userStats.set(event.userId, userStatsMap);
    }
    this.updateStatsMap(userStatsMap, event, signals);
  }

  /**
   * Update a stats map with new data
   */
  private updateStatsMap(
    statsMap: Map<TransitionType, TransitionStats>,
    event: TransitionEvent,
    signals: EngagementSignals
  ): void {
    let stats = statsMap.get(event.transitionType);
    if (!stats) {
      stats = this.createEmptyStats();
      statsMap.set(event.transitionType, stats);
    }

    // Incremental update
    stats.count++;

    if (signals.timeToUserSpeechMs !== undefined) {
      stats.avgTimeToSpeech =
        (stats.avgTimeToSpeech * (stats.count - 1) + signals.timeToUserSpeechMs) / stats.count;
    }

    if (signals.emotionalResponse) {
      const positiveCount =
        stats.positiveResponseRate * (stats.count - 1) +
        (signals.emotionalResponse === 'positive' ? 1 : 0);
      stats.positiveResponseRate = positiveCount / stats.count;
    }

    if (signals.continuedTopic !== undefined) {
      const continuedCount =
        stats.topicContinuationRate * (stats.count - 1) + (signals.continuedTopic ? 1 : 0);
      stats.topicContinuationRate = continuedCount / stats.count;
    }

    if (signals.sessionContinuedMs !== undefined) {
      stats.avgSessionContinuation =
        (stats.avgSessionContinuation * (stats.count - 1) + signals.sessionContinuedMs) /
        stats.count;
    }

    // Update by start reason
    if (!stats.byStartReason[event.startReason]) {
      stats.byStartReason[event.startReason] = {
        count: 0,
        avgTimeToSpeech: 0,
        positiveResponseRate: 0,
      };
    }
    const reasonStats = stats.byStartReason[event.startReason];
    reasonStats.count++;
    if (signals.timeToUserSpeechMs !== undefined) {
      reasonStats.avgTimeToSpeech =
        (reasonStats.avgTimeToSpeech * (reasonStats.count - 1) + signals.timeToUserSpeechMs) /
        reasonStats.count;
    }
    if (signals.emotionalResponse === 'positive') {
      reasonStats.positiveResponseRate =
        (reasonStats.positiveResponseRate * (reasonStats.count - 1) + 1) / reasonStats.count;
    }
  }

  /**
   * Create empty stats object
   */
  private createEmptyStats(): TransitionStats {
    return {
      count: 0,
      avgTimeToSpeech: 0,
      positiveResponseRate: 0,
      topicContinuationRate: 0,
      avgSessionContinuation: 0,
      byStartReason: {} as Record<
        MusicStartReason,
        {
          count: number;
          avgTimeToSpeech: number;
          positiveResponseRate: number;
        }
      >,
    };
  }

  /**
   * Get stats for a transition type
   */
  getStats(transitionType: TransitionType): TransitionStats | null {
    return this.globalStats.get(transitionType) || null;
  }

  /**
   * Get stats for a user
   */
  getUserStats(userId: string, transitionType: TransitionType): TransitionStats | null {
    return this.userStats.get(userId)?.get(transitionType) || null;
  }

  /**
   * Get all global stats
   */
  getAllStats(): Map<TransitionType, TransitionStats> {
    return this.globalStats;
  }

  /**
   * Get recent events for analysis
   */
  getRecentEvents(count = 100): TransitionEvent[] {
    return this.recentEvents.slice(-count);
  }

  // ==========================================================================
  // A/B TESTING
  // ==========================================================================

  /**
   * Register an A/B test
   */
  registerTest(config: ABTestConfig): void {
    this.activeTests.set(config.name, config);
    log.info({ testName: config.name, variants: config.variants.length }, '🧪 A/B test registered');
  }

  /**
   * Get user's assigned variant for a test
   */
  getVariantAssignment(userId: string, testName: string): string | null {
    const test = this.activeTests.get(testName);
    if (!test || !test.active) {
      return null;
    }

    // Check existing assignment
    const userAssigns = this.userAssignments.get(userId);
    if (userAssigns?.has(testName)) {
      return userAssigns.get(testName)!;
    }

    // Assign based on weights
    const random = Math.random();
    let cumulative = 0;
    let assigned: string | null = null;

    for (const variant of test.variants) {
      cumulative += variant.weight;
      if (random < cumulative) {
        assigned = variant.name;
        break;
      }
    }

    if (!assigned) {
      assigned = test.variants[0].name;
    }

    // Store assignment
    if (!this.userAssignments.has(userId)) {
      this.userAssignments.set(userId, new Map());
    }
    this.userAssignments.get(userId)!.set(testName, assigned);

    log.debug({ userId, testName, variant: assigned }, '🧪 User assigned to A/B variant');
    return assigned;
  }

  /**
   * Get variant config for a user/test
   */
  getVariantConfig(userId: string, testName: string): TransitionOverrides | null {
    const variant = this.getVariantAssignment(userId, testName);
    if (!variant) return null;

    const test = this.activeTests.get(testName);
    const variantConfig = test?.variants.find((v) => v.name === variant);
    return variantConfig?.config || null;
  }

  /**
   * Get A/B test results
   */
  getTestResults(testName: string): Record<string, TransitionStats> | null {
    const test = this.activeTests.get(testName);
    if (!test) return null;

    const results: Record<string, TransitionStats> = {};

    // Filter events by test and variant
    for (const event of this.recentEvents) {
      if (event.experimentVariant && this.activeTests.has(testName)) {
        const engagement = this.engagements.get(event.eventId);
        if (engagement) {
          if (!results[event.experimentVariant]) {
            results[event.experimentVariant] = this.createEmptyStats();
          }
          this.updateStatsMap(
            new Map([[event.transitionType, results[event.experimentVariant]]]),
            event,
            engagement
          );
        }
      }
    }

    return results;
  }

  /**
   * Export analytics data (for persistence)
   */
  export(): {
    events: TransitionEvent[];
    engagements: EngagementSignals[];
    globalStats: Record<TransitionType, TransitionStats>;
  } {
    return {
      events: Array.from(this.events.values()),
      engagements: Array.from(this.engagements.values()),
      globalStats: Object.fromEntries(this.globalStats) as Record<TransitionType, TransitionStats>,
    };
  }

  /**
   * Import analytics data (from persistence)
   */
  import(data: {
    events?: TransitionEvent[];
    engagements?: EngagementSignals[];
    globalStats?: Record<TransitionType, TransitionStats>;
  }): void {
    if (data.events) {
      for (const event of data.events) {
        this.events.set(event.eventId, event);
      }
    }
    if (data.engagements) {
      for (const signals of data.engagements) {
        this.engagements.set(signals.eventId, signals);
      }
    }
    if (data.globalStats) {
      for (const [type, stats] of Object.entries(data.globalStats)) {
        this.globalStats.set(type as TransitionType, stats);
      }
    }
    log.info(
      {
        events: this.events.size,
        engagements: this.engagements.size,
      },
      '📊 Analytics data imported'
    );
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.events.clear();
    this.engagements.clear();
    this.userStats.clear();
    this.globalStats.clear();
    this.recentEvents = [];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let analyticsStore: TransitionAnalyticsStore | null = null;

/**
 * Get the analytics store (singleton)
 */
export function getTransitionAnalytics(): TransitionAnalyticsStore {
  if (!analyticsStore) {
    analyticsStore = new TransitionAnalyticsStore();

    // Register default A/B test
    analyticsStore.registerTest({
      name: 'intelligent_transitions_v1',
      active: true,
      variants: [
        { name: 'control', weight: 0.2, config: {} }, // Old static phrases (20%)
        { name: 'intelligent', weight: 0.8, config: {} }, // New intelligent system (80%)
      ],
      startedAt: Date.now(),
      minSampleSize: 100,
    });
  }
  return analyticsStore;
}

/**
 * Reset analytics (for testing)
 */
export function resetTransitionAnalytics(): void {
  if (analyticsStore) {
    analyticsStore.clear();
  }
  analyticsStore = null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Generate a unique event ID
 */
export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a transition event from context
 */
export function createTransitionEvent(
  sessionId: string,
  userId: string,
  personaId: string,
  musicContext: MusicSessionContext | null,
  result: TransitionResult,
  experimentVariant?: string
): TransitionEvent {
  return {
    eventId: generateEventId(),
    sessionId,
    userId,
    personaId,
    startReason: musicContext?.startReason || 'unknown',
    transitionType: result.transitionType,
    didSpeak: result.shouldSpeak,
    phrase: result.phrase,
    confidence: result.confidence,
    context: {
      emotionalTone: musicContext?.emotionalToneBeforeMusic,
      relationshipStage: musicContext?.relationshipStage,
      isLateNight: new Date().getHours() >= 22 || new Date().getHours() < 6,
      topicBeforeMusic: musicContext?.topicBeforeMusic,
      wasUserMidThought: musicContext?.wasUserMidThought,
      musicDurationMs: musicContext?.durationMs,
    },
    timestamp: Date.now(),
    experimentVariant,
  };
}

/**
 * Record a transition with analytics
 */
export function recordTransitionWithAnalytics(
  sessionId: string,
  userId: string,
  personaId: string,
  musicContext: MusicSessionContext | null,
  result: TransitionResult,
  experimentVariant?: string
): string {
  const event = createTransitionEvent(
    sessionId,
    userId,
    personaId,
    musicContext,
    result,
    experimentVariant
  );
  getTransitionAnalytics().recordTransition(event);
  return event.eventId;
}

/**
 * Record engagement signals after transition
 */
export function recordEngagementSignals(
  eventId: string,
  signals: Omit<EngagementSignals, 'eventId'>
): void {
  getTransitionAnalytics().recordEngagement({
    eventId,
    ...signals,
  });
}

/**
 * Get the best transition type for a context based on historical data
 */
export function getBestTransitionType(
  startReason: MusicStartReason,
  userId?: string
): TransitionType | null {
  const analytics = getTransitionAnalytics();

  // Try user-specific stats first
  if (userId) {
    const userStats = analytics.getUserStats(userId, 'silence');
    // If user has enough data, use their preferences
    if (userStats && userStats.count >= 10) {
      // Find the transition type with best positive response rate for this user
      let bestType: TransitionType | null = null;
      let bestRate = 0;

      for (const type of [
        'silence',
        'presence',
        'gentle_return',
        'acknowledgment',
      ] as TransitionType[]) {
        const stats = analytics.getUserStats(userId, type);
        if (stats && stats.count >= 5 && stats.positiveResponseRate > bestRate) {
          bestRate = stats.positiveResponseRate;
          bestType = type;
        }
      }

      if (bestType) {
        log.debug({ userId, bestType, rate: bestRate }, '📊 Using user-specific best transition');
        return bestType;
      }
    }
  }

  // Fall back to global stats
  let bestType: TransitionType | null = null;
  let bestRate = 0;

  for (const type of [
    'silence',
    'presence',
    'gentle_return',
    'acknowledgment',
  ] as TransitionType[]) {
    const stats = analytics.getStats(type);
    if (stats && stats.count >= 20 && stats.positiveResponseRate > bestRate) {
      // Check if this type works well for the specific start reason
      const reasonStats = stats.byStartReason[startReason];
      if (reasonStats && reasonStats.count >= 5) {
        const rate = reasonStats.positiveResponseRate;
        if (rate > bestRate) {
          bestRate = rate;
          bestType = type;
        }
      }
    }
  }

  return bestType;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getTransitionAnalytics,
  resetTransitionAnalytics,
  generateEventId,
  createTransitionEvent,
  recordTransitionWithAnalytics,
  recordEngagementSignals,
  getBestTransitionType,
};
