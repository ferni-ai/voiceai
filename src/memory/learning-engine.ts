/**
 * Learning Engine
 *
 * Tracks user reactions to surfaced memories and adapts future behavior.
 * The engine learns WHAT each user finds helpful vs. intrusive.
 *
 * Philosophy: "Better than human" means learning from every interaction.
 * A human friend slowly learns what topics to bring up and when.
 * We learn faster, with perfect recall of what worked.
 *
 * NOTE: Also delegates to the unified ConversationFeedbackStore for
 * cross-system analytics.
 */

import { getLogger } from '../utils/safe-logger.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import type { MemoryItem } from './advanced-retrieval.js';
import type { FeedbackReaction } from '../types/feedback.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * User reaction to a surfaced memory
 */
export type MemoryReaction =
  | 'engaged' // User responded positively, expanded on topic
  | 'acknowledged' // Neutral response, didn't engage deeply
  | 'ignored' // User changed topic, didn't acknowledge
  | 'negative' // User expressed discomfort or asked to stop
  | 'grateful'; // Explicit positive feedback ("you remembered!")

/**
 * A recorded memory surfacing event and user's reaction
 */
export interface SurfacingEvent {
  id: string;
  userId: string;
  memoryId: string;
  memoryType: string;
  memoryTopics: string[];
  emotionalWeight: number;

  /** How the memory was surfaced */
  surfacingMethod: 'proactive' | 'query_response' | 'association';

  /** Context when surfaced */
  conversationPhase: 'opening' | 'mid' | 'closing';
  userEmotionalState: 'positive' | 'neutral' | 'negative' | 'vulnerable';
  timeSinceSessionStart: number; // minutes

  /** User's reaction */
  reaction: MemoryReaction;

  /** Timing */
  surfacedAt: Date;
  reactedAt?: Date;
}

/**
 * Learned preferences for a user
 */
export interface UserLearnings {
  userId: string;

  /** Overall stats */
  totalSurfacings: number;
  positiveReactions: number;
  negativeReactions: number;

  /** Topic preferences (topic → engagement score 0-1) */
  topicReceptivity: Map<string, number>;

  /** Memory type preferences (type → engagement score 0-1) */
  typeReceptivity: Map<string, number>;

  /** Best conversation phases for proactive surfacing */
  preferredPhases: Map<string, number>; // phase → success rate

  /** Emotional states where proactive surfacing worked */
  emotionalReceptivity: Map<string, number>; // state → success rate

  /** Timing patterns */
  averageTimeToEngage: number; // minutes into session

  /** Adjusted thresholds based on learning */
  adjustedThresholds: {
    minConfidence: number; // Default 0.6, adjusted per user
    maxProactivePerSession: number; // Default 3, adjusted per user
    emotionalSensitivity: number; // 0-1, how much to weight emotional state
  };

  lastUpdated: Date;
}

/**
 * Learning Engine configuration
 */
export interface LearningConfig {
  /** Minimum events before adjusting thresholds */
  minEventsForLearning: number;

  /** How much each event adjusts scores (0-1) */
  learningRate: number;

  /** Decay rate for old learnings (per day) */
  learningDecay: number;

  /** Maximum adjustment to thresholds */
  maxThresholdAdjustment: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: LearningConfig = {
  minEventsForLearning: 5,
  learningRate: 0.1,
  learningDecay: 0.01, // 1% decay per day
  maxThresholdAdjustment: 0.3, // Can adjust thresholds by ±30%
};

const DEFAULT_LEARNINGS: Omit<UserLearnings, 'userId'> = {
  totalSurfacings: 0,
  positiveReactions: 0,
  negativeReactions: 0,
  topicReceptivity: new Map(),
  typeReceptivity: new Map(),
  preferredPhases: new Map(),
  emotionalReceptivity: new Map(),
  averageTimeToEngage: 5, // Default 5 minutes
  adjustedThresholds: {
    minConfidence: 0.6,
    maxProactivePerSession: 3,
    emotionalSensitivity: 0.5,
  },
  lastUpdated: new Date(),
};

// ============================================================================
// LEARNING ENGINE
// ============================================================================

export class LearningEngine {
  private config: LearningConfig;
  private userLearnings = new Map<string, UserLearnings>();
  private pendingEvents = new Map<string, SurfacingEvent>();

  /** Pending events older than this are auto-cleaned (30 minutes) */
  private static readonly PENDING_EVENT_TTL_MS = 30 * 60 * 1000;
  /** Cleanup interval (every 5 minutes) */
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  /** Cleanup interval handle */
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<LearningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Start automatic cleanup of stale pending events
    this.startPendingEventsCleanup();
  }

  // ==========================================================================
  // RECORDING EVENTS
  // ==========================================================================

  /**
   * Record that a memory was surfaced (call when showing memory to user)
   * Returns event ID for later recording reaction
   */
  recordSurfacing(
    userId: string,
    memory: MemoryItem,
    context: {
      surfacingMethod: SurfacingEvent['surfacingMethod'];
      conversationPhase: SurfacingEvent['conversationPhase'];
      userEmotionalState: SurfacingEvent['userEmotionalState'];
      timeSinceSessionStart: number;
    }
  ): string {
    const eventId = `surf_${userId}_${Date.now()}`;

    const event: SurfacingEvent = {
      id: eventId,
      userId,
      memoryId: memory.id,
      memoryType: memory.type,
      memoryTopics: memory.topics ?? [],
      emotionalWeight: memory.emotionalWeight,
      surfacingMethod: context.surfacingMethod,
      conversationPhase: context.conversationPhase,
      userEmotionalState: context.userEmotionalState,
      timeSinceSessionStart: context.timeSinceSessionStart,
      reaction: 'acknowledged', // Default, will be updated
      surfacedAt: new Date(),
    };

    this.pendingEvents.set(eventId, event);

    log.debug({ eventId, memoryId: memory.id, userId }, 'Recorded memory surfacing');

    return eventId;
  }

  /**
   * Record user's reaction to a surfaced memory
   */
  async recordReaction(eventId: string, reaction: MemoryReaction): Promise<void> {
    const event = this.pendingEvents.get(eventId);
    if (!event) {
      log.warn({ eventId }, 'No pending event found for reaction');
      return;
    }

    event.reaction = reaction;
    event.reactedAt = new Date();

    // Update user learnings
    await this.updateLearnings(event);

    // Persist event
    await this.persistEvent(event);

    // Remove from pending
    this.pendingEvents.delete(eventId);

    // Delegate to unified feedback store for cross-system analytics
    // Map memory reaction to feedback reaction
    const feedbackReaction = this.mapToFeedbackReaction(reaction);
    if (feedbackReaction) {
      void this.delegateToUnifiedStore(event, feedbackReaction).catch(() => {
        // Silent fail - unified store is optional
      });
    }

    log.debug({ eventId, reaction, userId: event.userId }, 'Recorded reaction');
  }

  /**
   * Map memory reaction to unified feedback reaction
   */
  private mapToFeedbackReaction(reaction: MemoryReaction): FeedbackReaction | null {
    switch (reaction) {
      case 'engaged':
      case 'grateful':
        return 'resonated';
      case 'acknowledged':
        return 'helpful';
      case 'ignored':
        return 'skipped';
      case 'negative':
        return 'too_much';
      default:
        return null;
    }
  }

  /**
   * Delegate to the unified ConversationFeedbackStore
   */
  private async delegateToUnifiedStore(
    event: SurfacingEvent,
    feedbackReaction: FeedbackReaction
  ): Promise<void> {
    try {
      const { createFeedbackPrompt, recordFeedbackReaction } =
        await import('../services/feedback/index.js');

      const result = await createFeedbackPrompt({
        userId: event.userId,
        sessionId: `memory_${event.memoryId}`,
        personaId: 'ferni',
        trigger: 'insight_moment',
        context: {
          lastAgentMessage: `Surfaced memory: ${event.memoryType}`,
          lastUserMessage: '',
          topic: event.memoryTopics[0] || 'memory',
          emotionalTone: event.userEmotionalState === 'negative' ? 'heavy' : 'neutral',
          turnCount: 0,
        },
      });

      if (result.ok) {
        await recordFeedbackReaction({
          feedbackId: result.feedbackId,
          userId: event.userId,
          reaction: feedbackReaction,
        });
      }
    } catch {
      // Silent fail - unified store is optional
    }
  }

  /**
   * Infer reaction from user's response
   * Called by the turn handler with user's response after memory surfacing
   */
  inferReaction(
    userResponse: string,
    changedTopic: boolean,
    expressedGratitude: boolean,
    expressedDiscomfort: boolean
  ): MemoryReaction {
    if (expressedDiscomfort) {
      return 'negative';
    }

    if (expressedGratitude) {
      return 'grateful';
    }

    if (changedTopic) {
      return 'ignored';
    }

    // Check response length as engagement proxy
    const wordCount = userResponse.trim().split(/\s+/).length;

    if (wordCount > 20) {
      return 'engaged'; // Detailed response = engaged
    }

    return 'acknowledged';
  }

  // ==========================================================================
  // LEARNING FROM EVENTS
  // ==========================================================================

  /**
   * Update user learnings based on a surfacing event
   */
  private async updateLearnings(event: SurfacingEvent): Promise<void> {
    let learnings: UserLearnings | undefined = this.userLearnings.get(event.userId);

    if (!learnings) {
      const loaded = await this.loadLearnings(event.userId);
      if (loaded) {
        learnings = loaded;
      } else {
        learnings = {
          ...DEFAULT_LEARNINGS,
          userId: event.userId,
          // Initialize with empty Maps
          topicReceptivity: new Map(),
          typeReceptivity: new Map(),
          preferredPhases: new Map(),
          emotionalReceptivity: new Map(),
        };
      }
      this.userLearnings.set(event.userId, learnings);
    }

    // Update overall stats
    learnings.totalSurfacings++;

    const isPositive = event.reaction === 'engaged' || event.reaction === 'grateful';
    const isNegative = event.reaction === 'negative';

    if (isPositive) learnings.positiveReactions++;
    if (isNegative) learnings.negativeReactions++;

    // Calculate reaction score: positive = +1, negative = -1, others = 0
    const reactionScore = isPositive ? 1 : isNegative ? -1 : 0;

    // Update topic receptivity
    for (const topic of event.memoryTopics) {
      const current = learnings.topicReceptivity.get(topic) ?? 0.5;
      const updated = this.adjustScore(current, reactionScore);
      learnings.topicReceptivity.set(topic, updated);
    }

    // Update type receptivity
    const currentTypeScore = learnings.typeReceptivity.get(event.memoryType) ?? 0.5;
    learnings.typeReceptivity.set(
      event.memoryType,
      this.adjustScore(currentTypeScore, reactionScore)
    );

    // Update phase preferences
    const currentPhaseScore = learnings.preferredPhases.get(event.conversationPhase) ?? 0.5;
    learnings.preferredPhases.set(
      event.conversationPhase,
      this.adjustScore(currentPhaseScore, reactionScore)
    );

    // Update emotional receptivity
    const currentEmotionalScore =
      learnings.emotionalReceptivity.get(event.userEmotionalState) ?? 0.5;
    learnings.emotionalReceptivity.set(
      event.userEmotionalState,
      this.adjustScore(currentEmotionalScore, reactionScore)
    );

    // Adjust thresholds if we have enough data
    if (learnings.totalSurfacings >= this.config.minEventsForLearning) {
      this.adjustThresholds(learnings);
    }

    learnings.lastUpdated = new Date();

    // Persist learnings
    await this.persistLearnings(learnings);
  }

  /**
   * Adjust a score based on reaction
   */
  private adjustScore(current: number, reactionScore: number): number {
    const adjustment = reactionScore * this.config.learningRate;
    return Math.max(0, Math.min(1, current + adjustment));
  }

  /**
   * Adjust user's thresholds based on overall patterns
   */
  private adjustThresholds(learnings: UserLearnings): void {
    const successRate = learnings.positiveReactions / learnings.totalSurfacings;
    const maxAdj = this.config.maxThresholdAdjustment;

    // If user frequently ignores/negatively reacts, raise confidence threshold
    if (successRate < 0.3) {
      learnings.adjustedThresholds.minConfidence = Math.min(
        0.9,
        0.6 + (0.3 - successRate) * maxAdj
      );
      learnings.adjustedThresholds.maxProactivePerSession = Math.max(
        1,
        3 - Math.floor((0.3 - successRate) * 3)
      );
    }
    // If user loves memory surfacing, lower threshold
    else if (successRate > 0.7) {
      learnings.adjustedThresholds.minConfidence = Math.max(
        0.4,
        0.6 - (successRate - 0.7) * maxAdj
      );
      learnings.adjustedThresholds.maxProactivePerSession = Math.min(
        6,
        3 + Math.floor((successRate - 0.7) * 3)
      );
    }

    log.debug(
      {
        userId: learnings.userId,
        successRate,
        newThresholds: learnings.adjustedThresholds,
      },
      'Adjusted user thresholds'
    );
  }

  // ==========================================================================
  // QUERYING LEARNINGS
  // ==========================================================================

  /**
   * Get user's adjusted timing thresholds
   */
  async getThresholds(userId: string): Promise<UserLearnings['adjustedThresholds']> {
    let learnings = this.userLearnings.get(userId);

    if (!learnings) {
      const loaded = await this.loadLearnings(userId);
      learnings = loaded ?? undefined;
    }

    return learnings?.adjustedThresholds ?? DEFAULT_LEARNINGS.adjustedThresholds;
  }

  /**
   * Score a potential memory surfacing based on user learnings
   * Returns 0-1 score (higher = more likely to be well-received)
   */
  async scoreProposedSurfacing(
    userId: string,
    memory: MemoryItem,
    context: {
      conversationPhase: SurfacingEvent['conversationPhase'];
      userEmotionalState: SurfacingEvent['userEmotionalState'];
    }
  ): Promise<{
    score: number;
    factors: Record<string, number>;
    recommendation: 'surface' | 'skip' | 'defer';
  }> {
    let learnings = this.userLearnings.get(userId);

    if (!learnings) {
      const loaded = await this.loadLearnings(userId);
      learnings = loaded ?? undefined;
    }

    // If no learnings, return default moderate score
    if (!learnings || learnings.totalSurfacings < this.config.minEventsForLearning) {
      return {
        score: 0.5,
        factors: { default: 0.5 },
        recommendation: 'surface',
      };
    }

    const factors: Record<string, number> = {};

    // Topic receptivity (average of memory topics)
    const topicScores = memory.topics?.map((t) => learnings!.topicReceptivity.get(t) ?? 0.5) ?? [
      0.5,
    ];
    factors.topic = topicScores.reduce((a, b) => a + b, 0) / topicScores.length;

    // Type receptivity
    factors.type = learnings.typeReceptivity.get(memory.type) ?? 0.5;

    // Phase preference
    factors.phase = learnings.preferredPhases.get(context.conversationPhase) ?? 0.5;

    // Emotional state receptivity
    factors.emotional = learnings.emotionalReceptivity.get(context.userEmotionalState) ?? 0.5;

    // Emotional sensitivity weighting
    const emotionalAdjustment =
      context.userEmotionalState === 'vulnerable'
        ? 1 - learnings.adjustedThresholds.emotionalSensitivity
        : 1;
    factors.emotionalAdjustment = emotionalAdjustment;

    // Calculate weighted score
    const score =
      (factors.topic * 0.3 + factors.type * 0.2 + factors.phase * 0.2 + factors.emotional * 0.3) *
      emotionalAdjustment;

    // Determine recommendation
    const threshold = learnings.adjustedThresholds.minConfidence;
    const recommendation: 'surface' | 'skip' | 'defer' =
      score >= threshold
        ? 'surface'
        : score >= threshold - 0.1
          ? 'defer' // Close to threshold
          : 'skip';

    return { score, factors, recommendation };
  }

  /**
   * Get summary of what we've learned about a user
   */
  async getLearningsSummary(userId: string): Promise<{
    hasLearnings: boolean;
    totalInteractions: number;
    successRate: number;
    topTopics: string[];
    avoidTopics: string[];
    bestPhase: string | null;
    thresholds: UserLearnings['adjustedThresholds'];
  }> {
    let learnings = this.userLearnings.get(userId);

    if (!learnings) {
      const loaded = await this.loadLearnings(userId);
      learnings = loaded ?? undefined;
    }

    if (!learnings || learnings.totalSurfacings === 0) {
      return {
        hasLearnings: false,
        totalInteractions: 0,
        successRate: 0,
        topTopics: [],
        avoidTopics: [],
        bestPhase: null,
        thresholds: DEFAULT_LEARNINGS.adjustedThresholds,
      };
    }

    // Find top and avoid topics
    const topicEntries = Array.from(learnings.topicReceptivity.entries());
    const topTopics = topicEntries
      .filter(([, score]) => score > 0.6)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    const avoidTopics = topicEntries
      .filter(([, score]) => score < 0.3)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([topic]) => topic);

    // Find best phase
    const phaseEntries = Array.from(learnings.preferredPhases.entries());
    const bestPhase =
      phaseEntries.length > 0 ? phaseEntries.sort((a, b) => b[1] - a[1])[0][0] : null;

    return {
      hasLearnings: true,
      totalInteractions: learnings.totalSurfacings,
      successRate: learnings.positiveReactions / learnings.totalSurfacings,
      topTopics,
      avoidTopics,
      bestPhase,
      thresholds: learnings.adjustedThresholds,
    };
  }

  // ==========================================================================
  // REINFORCEMENT
  // ==========================================================================

  /**
   * Reinforce a memory after positive interaction
   * Called when user engages positively with a surfaced memory
   */
  async reinforceMemory(
    userId: string,
    memoryId: string,
    reactionStrength = 1.0
  ): Promise<{
    previousStrength: number;
    newStrength: number;
    boostApplied: number;
  }> {
    // This would integrate with memory-decay.ts to boost strength
    // For now, return metadata about what would happen
    const boost = Math.min(0.3, reactionStrength * this.config.learningRate * 2);

    log.debug({ userId, memoryId, boost }, 'Would reinforce memory');

    return {
      previousStrength: 0.5, // Would read from actual memory
      newStrength: Math.min(1, 0.5 + boost),
      boostApplied: boost,
    };
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Load user learnings from Firestore
   */
  private async loadLearnings(userId: string): Promise<UserLearnings | null> {
    try {
      const db = getFirestoreDb();
      if (!db) {
        log.debug({ userId }, 'Firestore not available, returning null learnings');
        return null;
      }

      const doc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('learnings')
        .doc('memory')
        .get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data()!;

      // Convert stored objects back to Maps
      return {
        userId,
        totalSurfacings: data.totalSurfacings ?? 0,
        positiveReactions: data.positiveReactions ?? 0,
        negativeReactions: data.negativeReactions ?? 0,
        topicReceptivity: new Map(Object.entries(data.topicReceptivity ?? {})),
        typeReceptivity: new Map(Object.entries(data.typeReceptivity ?? {})),
        preferredPhases: new Map(Object.entries(data.preferredPhases ?? {})),
        emotionalReceptivity: new Map(Object.entries(data.emotionalReceptivity ?? {})),
        averageTimeToEngage: data.averageTimeToEngage ?? 5,
        adjustedThresholds: data.adjustedThresholds ?? DEFAULT_LEARNINGS.adjustedThresholds,
        lastUpdated: data.lastUpdated?.toDate() ?? new Date(),
      };
    } catch (error) {
      log.error({ error, userId }, 'Failed to load learnings');
      return null;
    }
  }

  /**
   * Persist user learnings to Firestore
   */
  private async persistLearnings(learnings: UserLearnings): Promise<void> {
    try {
      const db = getFirestoreDb();
      if (!db) {
        log.debug({ userId: learnings.userId }, 'Firestore not available, skipping persist');
        return;
      }

      // Convert Maps to objects for Firestore
      const data = {
        totalSurfacings: learnings.totalSurfacings,
        positiveReactions: learnings.positiveReactions,
        negativeReactions: learnings.negativeReactions,
        topicReceptivity: Object.fromEntries(learnings.topicReceptivity),
        typeReceptivity: Object.fromEntries(learnings.typeReceptivity),
        preferredPhases: Object.fromEntries(learnings.preferredPhases),
        emotionalReceptivity: Object.fromEntries(learnings.emotionalReceptivity),
        averageTimeToEngage: learnings.averageTimeToEngage,
        adjustedThresholds: learnings.adjustedThresholds,
        lastUpdated: new Date(),
      };

      await db
        .collection('bogle_users')
        .doc(learnings.userId)
        .collection('learnings')
        .doc('memory')
        .set(data, { merge: true });
    } catch (error) {
      log.error({ error, userId: learnings.userId }, 'Failed to persist learnings');
    }
  }

  /**
   * Persist a surfacing event for analytics
   */
  private async persistEvent(event: SurfacingEvent): Promise<void> {
    try {
      const db = getFirestoreDb();
      if (!db) {
        log.debug({ eventId: event.id }, 'Firestore not available, skipping event persist');
        return;
      }

      await db
        .collection('bogle_users')
        .doc(event.userId)
        .collection('surfacing_events')
        .doc(event.id)
        .set({
          ...event,
          surfacedAt: event.surfacedAt,
          reactedAt: event.reactedAt,
        });
    } catch (error) {
      log.error({ error, eventId: event.id }, 'Failed to persist event');
    }
  }

  // ==========================================================================
  // PENDING EVENT QUERIES
  // ==========================================================================

  /**
   * Get pending event IDs for a user
   * Used by unified-memory-service to expose pending events
   */
  getPendingEventIds(userId: string): string[] {
    const eventIds: string[] = [];
    for (const [eventId, event] of this.pendingEvents) {
      if (event.userId === userId) {
        eventIds.push(eventId);
      }
    }
    return eventIds;
  }

  /**
   * Get the most recent pending surfacing event for a user
   * Returns null if no pending events exist for the user
   */
  getMostRecentPendingEvent(userId: string): {
    id: string;
    memoryTopics: string[];
  } | null {
    let mostRecent: SurfacingEvent | null = null;

    for (const event of this.pendingEvents.values()) {
      if (event.userId === userId) {
        if (!mostRecent || event.surfacedAt > mostRecent.surfacedAt) {
          mostRecent = event;
        }
      }
    }

    if (!mostRecent) return null;

    return {
      id: mostRecent.id,
      memoryTopics: mostRecent.memoryTopics,
    };
  }

  // ==========================================================================
  // PENDING EVENTS CLEANUP
  // ==========================================================================

  /**
   * Start automatic cleanup of stale pending events
   */
  private startPendingEventsCleanup(): void {
    if (this.cleanupInterval) return; // Already running

    this.cleanupInterval = setInterval(() => {
      this.cleanupStalePendingEvents();
    }, LearningEngine.CLEANUP_INTERVAL_MS);

    log.debug(
      { intervalMs: LearningEngine.CLEANUP_INTERVAL_MS },
      '🕐 Started pending events cleanup interval'
    );
  }

  /**
   * Stop automatic cleanup (call on shutdown)
   */
  stopPendingEventsCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      log.debug('🛑 Stopped pending events cleanup interval');
    }
  }

  /**
   * Cleanup pending events older than PENDING_EVENT_TTL_MS
   * Treats unreacted events as "ignored" for learning purposes
   */
  private cleanupStalePendingEvents(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [eventId, event] of this.pendingEvents) {
      const eventAge = now - event.surfacedAt.getTime();
      if (eventAge > LearningEngine.PENDING_EVENT_TTL_MS) {
        // Event was surfaced but user never reacted - treat as "ignored"
        // Don't update learnings to avoid penalizing for abandoned sessions
        this.pendingEvents.delete(eventId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      log.debug(
        { cleanedCount, remaining: this.pendingEvents.size },
        '🧹 Cleaned up stale pending events'
      );
    }
  }

  /**
   * Clear all pending events for a user (call on session end)
   */
  clearPendingEventsForUser(userId: string): void {
    let clearedCount = 0;
    for (const [eventId, event] of this.pendingEvents) {
      if (event.userId === userId) {
        this.pendingEvents.delete(eventId);
        clearedCount++;
      }
    }
    if (clearedCount > 0) {
      log.debug({ userId, clearedCount }, '🧹 Cleared pending events for user');
    }
  }

  // ==========================================================================
  // MAINTENANCE
  // ==========================================================================

  /**
   * Apply decay to learnings (should run periodically)
   */
  async decayLearnings(userId: string): Promise<void> {
    const learnings = this.userLearnings.get(userId);
    if (!learnings) return;

    const daysSinceUpdate = (Date.now() - learnings.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.pow(1 - this.config.learningDecay, daysSinceUpdate);

    // Decay all scores toward 0.5 (neutral)
    for (const [topic, score] of learnings.topicReceptivity) {
      learnings.topicReceptivity.set(topic, 0.5 + (score - 0.5) * decayFactor);
    }

    // Similar for other receptivity maps...

    await this.persistLearnings(learnings);
  }

  /**
   * Clear learnings for a user (for testing or user request)
   */
  async clearLearnings(userId: string): Promise<void> {
    this.userLearnings.delete(userId);

    try {
      const db = getFirestoreDb();
      if (!db) {
        log.debug({ userId }, 'Firestore not available, only cleared in-memory learnings');
        return;
      }

      await db.collection('bogle_users').doc(userId).collection('learnings').doc('memory').delete();
    } catch (error) {
      log.error({ error, userId }, 'Failed to clear learnings');
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultLearningEngine: LearningEngine | null = null;

/**
 * Get the default learning engine
 */
export function getLearningEngine(config?: Partial<LearningConfig>): LearningEngine {
  if (!defaultLearningEngine) {
    defaultLearningEngine = new LearningEngine(config);
  }
  return defaultLearningEngine;
}

/**
 * Reset the learning engine (for testing)
 */
export function resetLearningEngine(): void {
  defaultLearningEngine = null;
}

export default {
  LearningEngine,
  getLearningEngine,
  resetLearningEngine,
};
