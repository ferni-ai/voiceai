/**
 * Feedback Aggregator - Firestore Persistence for Builder Effectiveness
 *
 * Bridges Phase 1 (injection tracking) with Phase 2 (smart selection).
 * Aggregates session feedback into Firestore for cross-session learning.
 *
 * Collections:
 * - builder_effectiveness/{builderId} - Global effectiveness metrics
 * - user_builder_preferences/{userId} - User-specific preferences
 *
 * @module context-routing/feedback-aggregator
 */

import type {
  BuilderEffectiveness,
  UserBuilderPreferences,
  ConversationMode,
  AggregatedFeedback,
  PredictiveScore,
} from './types.js';
import { CacheManager } from './cache-manager.js';
import { toSafeDate } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'FeedbackAggregator' });

// ============================================================================
// FIRESTORE COLLECTION NAMES
// ============================================================================

const BUILDER_EFFECTIVENESS_COLLECTION = 'builder_effectiveness';
const USER_PREFERENCES_COLLECTION = 'user_builder_preferences';

// ============================================================================
// ROI CALCULATION
// ============================================================================

/**
 * Calculate ROI score from metrics.
 * Formula: (alignment_rate × 50) + (positive_rate × 30) - (negative_rate × 20)
 */
export function calculateRoi(metrics: {
  deliveries: number;
  alignments: number;
  positiveReactions: number;
  negativeReactions: number;
}): number {
  if (metrics.deliveries === 0) return 50; // Neutral for no data

  const alignmentRate = metrics.alignments / metrics.deliveries;
  const positiveRate = metrics.positiveReactions / metrics.deliveries;
  const negativeRate = metrics.negativeReactions / metrics.deliveries;

  const roi = alignmentRate * 50 + positiveRate * 30 - negativeRate * 20;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, roi));
}

// ============================================================================
// FEEDBACK AGGREGATOR CLASS
// ============================================================================

export class FeedbackAggregator {
  private readonly firestore: FirebaseFirestore.Firestore | null;

  constructor(firestore?: FirebaseFirestore.Firestore) {
    this.firestore = firestore ?? null;
  }

  // --------------------------------------------------------------------------
  // BUILDER EFFECTIVENESS
  // --------------------------------------------------------------------------

  /**
   * Load builder effectiveness from Firestore.
   */
  async loadBuilderEffectiveness(builderId: string): Promise<BuilderEffectiveness | null> {
    if (!this.firestore) {
      log.debug('No Firestore available, returning null');
      return null;
    }

    try {
      const doc = await this.firestore
        .collection(BUILDER_EFFECTIVENESS_COLLECTION)
        .doc(builderId)
        .get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data()!;
      return {
        builderId: data.builderId,
        category: data.category,
        totalDeliveries: data.totalDeliveries,
        alignmentCount: data.alignmentCount,
        positiveReactions: data.positiveReactions,
        negativeReactions: data.negativeReactions,
        roiScore: data.roiScore,
        modeScores: data.modeScores ?? {},
        lastUpdated: toSafeDate(data.lastUpdated),
        sampleCount: data.sampleCount,
      };
    } catch (error) {
      log.error({ error: String(error), builderId }, 'Failed to load builder effectiveness');
      return null;
    }
  }

  /**
   * Load all builder effectiveness data.
   */
  async loadAllBuilderEffectiveness(): Promise<Map<string, BuilderEffectiveness>> {
    const result = new Map<string, BuilderEffectiveness>();

    if (!this.firestore) {
      return result;
    }

    try {
      const snapshot = await this.firestore.collection(BUILDER_EFFECTIVENESS_COLLECTION).get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        result.set(doc.id, {
          builderId: data.builderId,
          category: data.category,
          totalDeliveries: data.totalDeliveries,
          alignmentCount: data.alignmentCount,
          positiveReactions: data.positiveReactions,
          negativeReactions: data.negativeReactions,
          roiScore: data.roiScore,
          modeScores: data.modeScores ?? {},
          lastUpdated: toSafeDate(data.lastUpdated),
          sampleCount: data.sampleCount,
        });
      }

      log.debug({ count: result.size }, 'Loaded builder effectiveness');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to load builder effectiveness');
    }

    return result;
  }

  /**
   * Update builder effectiveness with new feedback.
   */
  async updateBuilderEffectiveness(
    builderId: string,
    category: string,
    feedback: {
      deliveries: number;
      alignments: number;
      positiveReactions: number;
      negativeReactions: number;
      mode?: ConversationMode;
    }
  ): Promise<void> {
    if (!this.firestore) {
      log.debug({ builderId }, 'No Firestore, skipping update');
      return;
    }

    try {
      const docRef = this.firestore.collection(BUILDER_EFFECTIVENESS_COLLECTION).doc(builderId);

      const doc = await docRef.get();
      const existing = doc.exists ? doc.data()! : null;

      // Compute new totals
      const totalDeliveries = (existing?.totalDeliveries ?? 0) + feedback.deliveries;
      const alignmentCount = (existing?.alignmentCount ?? 0) + feedback.alignments;
      const positiveReactions = (existing?.positiveReactions ?? 0) + feedback.positiveReactions;
      const negativeReactions = (existing?.negativeReactions ?? 0) + feedback.negativeReactions;
      const sampleCount = (existing?.sampleCount ?? 0) + feedback.deliveries;

      // Compute ROI
      const roiScore = calculateRoi({
        deliveries: totalDeliveries,
        alignments: alignmentCount,
        positiveReactions,
        negativeReactions,
      });

      // Update mode-specific scores
      const modeScores: Partial<Record<ConversationMode, number>> = existing?.modeScores ?? {};
      if (feedback.mode && feedback.deliveries > 0) {
        const modeRoi = calculateRoi({
          deliveries: feedback.deliveries,
          alignments: feedback.alignments,
          positiveReactions: feedback.positiveReactions,
          negativeReactions: feedback.negativeReactions,
        });
        // Exponential moving average with existing mode score
        const existingModeScore = modeScores[feedback.mode] ?? roiScore;
        modeScores[feedback.mode] = existingModeScore * 0.7 + modeRoi * 0.3;
      }

      await docRef.set({
        builderId,
        category,
        totalDeliveries,
        alignmentCount,
        positiveReactions,
        negativeReactions,
        roiScore,
        modeScores,
        lastUpdated: new Date(),
        sampleCount,
      });

      // Invalidate global cache
      CacheManager.invalidateGlobalCache();

      log.debug(
        {
          builderId,
          roiScore,
          sampleCount,
        },
        'Updated builder effectiveness'
      );
    } catch (error) {
      log.error({ error: String(error), builderId }, 'Failed to update builder effectiveness');
    }
  }

  // --------------------------------------------------------------------------
  // USER PREFERENCES
  // --------------------------------------------------------------------------

  /**
   * Load user builder preferences.
   */
  async loadUserPreferences(userId: string): Promise<UserBuilderPreferences | null> {
    if (!this.firestore) {
      return null;
    }

    try {
      const doc = await this.firestore.collection(USER_PREFERENCES_COLLECTION).doc(userId).get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data()!;
      return {
        userId: data.userId,
        effectiveBuilders: data.effectiveBuilders ?? [],
        ineffectiveBuilders: data.ineffectiveBuilders ?? [],
        modePreferences: data.modePreferences ?? {},
        updatedAt: toSafeDate(data.updatedAt),
      };
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to load user preferences');
      return null;
    }
  }

  /**
   * Update user builder preferences.
   */
  async updateUserPreferences(
    userId: string,
    builderId: string,
    isEffective: boolean,
    mode?: ConversationMode
  ): Promise<void> {
    if (!this.firestore) {
      return;
    }

    try {
      const docRef = this.firestore.collection(USER_PREFERENCES_COLLECTION).doc(userId);
      const doc = await docRef.get();
      const existing = doc.exists ? doc.data()! : null;

      const effectiveBuilders: string[] = existing?.effectiveBuilders ?? [];
      const ineffectiveBuilders: string[] = existing?.ineffectiveBuilders ?? [];
      const modePreferences: Partial<Record<ConversationMode, string[]>> =
        existing?.modePreferences ?? {};

      if (isEffective) {
        // Add to effective, remove from ineffective
        if (!effectiveBuilders.includes(builderId)) {
          effectiveBuilders.push(builderId);
        }
        const ineffIdx = ineffectiveBuilders.indexOf(builderId);
        if (ineffIdx >= 0) {
          ineffectiveBuilders.splice(ineffIdx, 1);
        }

        // Add to mode preferences
        if (mode) {
          if (!modePreferences[mode]) {
            modePreferences[mode] = [];
          }
          if (!modePreferences[mode]!.includes(builderId)) {
            modePreferences[mode]!.push(builderId);
          }
        }
      } else {
        // Add to ineffective, remove from effective
        if (!ineffectiveBuilders.includes(builderId)) {
          ineffectiveBuilders.push(builderId);
        }
        const effIdx = effectiveBuilders.indexOf(builderId);
        if (effIdx >= 0) {
          effectiveBuilders.splice(effIdx, 1);
        }
      }

      // Keep lists bounded (max 50 each)
      while (effectiveBuilders.length > 50) effectiveBuilders.shift();
      while (ineffectiveBuilders.length > 50) ineffectiveBuilders.shift();

      await docRef.set({
        userId,
        effectiveBuilders,
        ineffectiveBuilders,
        modePreferences,
        updatedAt: new Date(),
      });

      log.debug(
        {
          userId,
          builderId,
          isEffective,
        },
        'Updated user preferences'
      );
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to update user preferences');
    }
  }

  // --------------------------------------------------------------------------
  // BATCH AGGREGATION
  // --------------------------------------------------------------------------

  /**
   * Aggregate feedback from Phase 1 tracker.
   * Called at session end to persist builder effectiveness.
   *
   * @param sessionId - The session to aggregate feedback from
   * @param userId - The user ID for preference tracking
   * @param mode - The conversation mode for mode-specific scoring
   */
  async aggregateFromTracker(
    sessionId: string,
    userId: string,
    mode: ConversationMode
  ): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency
      const { getSessionFeedback, aggregateBuilderMetrics } =
        await import('../feedback/injection-tracker.js');

      // Get feedback items from the session tracker
      const feedbackItems = getSessionFeedback(sessionId);

      if (feedbackItems.length === 0) {
        log.debug({ sessionId }, 'No feedback items to aggregate');
        return;
      }

      // Aggregate into builder-level metrics
      const metrics = aggregateBuilderMetrics(feedbackItems);

      for (const [, metric] of metrics) {
        await this.updateBuilderEffectiveness(metric.builderName, metric.category, {
          deliveries: metric.deliveryCount,
          alignments: metric.alignmentCount,
          positiveReactions: metric.positiveReactionCount,
          negativeReactions: metric.negativeReactionCount,
          mode,
        });

        // Update user preferences based on ROI
        if (metric.deliveryCount >= 5) {
          const isEffective = metric.roiScore >= 50;
          await this.updateUserPreferences(userId, metric.builderName, isEffective, mode);
        }
      }

      log.info(
        {
          sessionId,
          userId,
          builderCount: metrics.size,
        },
        'Aggregated feedback from tracker'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to aggregate from tracker');
    }
  }

  // --------------------------------------------------------------------------
  // CACHE REFRESH
  // --------------------------------------------------------------------------

  /**
   * Refresh global cache from Firestore.
   */
  async refreshGlobalCache(): Promise<void> {
    const effectiveness = await this.loadAllBuilderEffectiveness();
    CacheManager.setGlobalCache(effectiveness);
  }

  /**
   * Get user data for cache warming.
   */
  async getUserDataForCache(userId: string): Promise<{
    scores: Map<string, PredictiveScore>;
    preferences: UserBuilderPreferences | null;
  }> {
    const preferences = await this.loadUserPreferences(userId);

    // Convert effectiveness to scores
    const scores = new Map<string, PredictiveScore>();
    const effectiveness = await this.loadAllBuilderEffectiveness();

    for (const [builderId, eff] of effectiveness) {
      scores.set(builderId, {
        builderId,
        score: eff.roiScore,
        confidence: Math.min(eff.sampleCount / 100, 1),
        factors: {
          roiScore: eff.roiScore,
          modeRelevance: 50, // Will be adjusted by scorer
          recencyBoost: 0,
          userAffinity: this.computeUserAffinity(builderId, preferences),
        },
        source: eff.sampleCount >= 100 ? 'ml' : eff.sampleCount >= 20 ? 'heuristic' : 'fallback',
      });
    }

    return { scores, preferences };
  }

  /**
   * Compute user affinity score.
   */
  private computeUserAffinity(
    builderId: string,
    preferences: UserBuilderPreferences | null
  ): number {
    if (!preferences) return 50;
    if (preferences.effectiveBuilders.includes(builderId)) return 90;
    if (preferences.ineffectiveBuilders.includes(builderId)) return 10;
    return 50;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a feedback aggregator.
 */
export function createFeedbackAggregator(
  firestore?: FirebaseFirestore.Firestore
): FeedbackAggregator {
  return new FeedbackAggregator(firestore);
}

// ============================================================================
// SINGLETON FOR GLOBAL ACCESS
// ============================================================================

let globalAggregator: FeedbackAggregator | null = null;

/**
 * Get or create the global feedback aggregator.
 */
export function getFeedbackAggregator(firestore?: FirebaseFirestore.Firestore): FeedbackAggregator {
  if (!globalAggregator) {
    globalAggregator = createFeedbackAggregator(firestore);
  }
  return globalAggregator;
}

/**
 * Initialize the feedback aggregator with Firestore.
 * Should be called at startup.
 */
export function initializeFeedbackAggregator(firestore: FirebaseFirestore.Firestore): void {
  globalAggregator = createFeedbackAggregator(firestore);
  log.info('Initialized feedback aggregator');
}
