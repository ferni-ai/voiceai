/**
 * Memory Feedback Loop
 *
 * Implements a feedback loop that adjusts memory significance based on usage:
 * - Boost: Memories that are attributed get higher scores
 * - Decay: Memories that are never used get lower scores over time
 * - Track: Usage patterns are stored for analysis
 *
 * This creates a self-improving memory system where the most useful memories
 * naturally rise to the top.
 *
 * @module memory/retrieval/memory-feedback
 */

import { createLogger } from '../../utils/safe-logger.js';
import { markAnchorRecalled, isSpannerReady } from '../spanner-graph/index.js';
import type { AttributionResult } from './recall-attribution.js';

const log = createLogger({ module: 'MemoryFeedback' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Boost factor for explicit attribution (tag found in response) */
const EXPLICIT_BOOST = 0.05;

/** Boost factor for implicit attribution (fuzzy match) */
const IMPLICIT_BOOST = 0.02;

/** Decay factor per day for unused memories */
const DECAY_PER_DAY = 0.01;

/** Maximum boost cap (prevent runaway scores) */
const MAX_BOOST_TOTAL = 0.3;

/** Minimum significance floor (prevent memories from disappearing) */
const MIN_SIGNIFICANCE = 0.2;

// ============================================================================
// FEEDBACK FUNCTIONS
// ============================================================================

/**
 * Update memory scores based on attribution results
 *
 * Call this after parsing attributions from an LLM response.
 *
 * @param userId - User ID
 * @param attributions - Attributions parsed from response
 */
export async function applyAttributionFeedback(
  userId: string,
  attributions: AttributionResult[]
): Promise<void> {
  if (!isSpannerReady() || attributions.length === 0) return;

  for (const attr of attributions) {
    try {
      if (attr.type === 'anchor') {
        // Update anchor recall count in Spanner
        await markAnchorRecalled(userId, attr.fullId);

        log.debug(
          {
            userId,
            anchorId: attr.fullId,
            explicit: attr.explicit,
            confidence: attr.confidence,
          },
          '📈 Updated anchor recall count'
        );
      }

      // Thread attribution tracking is handled by the thread's session count
      // Semantic matches don't need persistent tracking (they're dynamic)
    } catch (error) {
      log.debug({ error: String(error), attr }, 'Failed to apply feedback for attribution');
    }
  }
}

/**
 * Calculate significance boost based on usage patterns
 *
 * @param recallCount - Number of times the memory was recalled
 * @param daysSinceLastRecall - Days since last recall (null if never)
 * @param baseSignificance - Original significance score
 * @returns Adjusted significance score
 */
export function calculateSignificanceBoost(
  recallCount: number,
  daysSinceLastRecall: number | null,
  baseSignificance: number
): number {
  // Base boost from recall count (diminishing returns)
  const recallBoost = Math.min(EXPLICIT_BOOST * Math.log2(recallCount + 1), MAX_BOOST_TOTAL);

  // Recency boost (more recent recalls matter more)
  let recencyBoost = 0;
  if (daysSinceLastRecall !== null) {
    if (daysSinceLastRecall < 1) {
      recencyBoost = 0.1; // Recalled today
    } else if (daysSinceLastRecall < 7) {
      recencyBoost = 0.05; // Recalled this week
    } else if (daysSinceLastRecall < 30) {
      recencyBoost = 0.02; // Recalled this month
    }
  }

  // Calculate boosted significance
  const boosted = baseSignificance + recallBoost + recencyBoost;

  // Cap at 1.0, floor at MIN_SIGNIFICANCE
  return Math.max(MIN_SIGNIFICANCE, Math.min(1.0, boosted));
}

/**
 * Calculate significance decay for unused memories
 *
 * @param daysSinceLastRecall - Days since last recall
 * @param daysSinceCreated - Days since memory was created
 * @param baseSignificance - Original significance score
 * @returns Decayed significance score
 */
export function calculateSignificanceDecay(
  daysSinceLastRecall: number | null,
  daysSinceCreated: number,
  baseSignificance: number
): number {
  // No decay if recalled recently
  if (daysSinceLastRecall !== null && daysSinceLastRecall < 30) {
    return baseSignificance;
  }

  // Decay based on age and lack of recall
  const daysUnused = daysSinceLastRecall ?? daysSinceCreated;
  const decayFactor = Math.min(daysUnused * DECAY_PER_DAY, 0.3);

  const decayed = baseSignificance - decayFactor;

  // Floor at MIN_SIGNIFICANCE
  return Math.max(MIN_SIGNIFICANCE, decayed);
}

/**
 * Adjust ranking score based on usage patterns
 *
 * Use this in ranking functions to boost frequently-used memories.
 *
 * @param baseScore - The original relevance/ranking score
 * @param recallCount - Number of times recalled
 * @param daysSinceLastRecall - Days since last recall
 * @returns Adjusted score
 */
export function adjustScoreForUsage(
  baseScore: number,
  recallCount: number,
  daysSinceLastRecall: number | null
): number {
  // Recall count boost (logarithmic to prevent runaway)
  const recallBoost = recallCount > 0 ? 0.1 * Math.log10(recallCount + 1) : 0;

  // Recency boost
  let recencyBoost = 0;
  if (daysSinceLastRecall !== null) {
    if (daysSinceLastRecall < 7) recencyBoost = 0.1;
    else if (daysSinceLastRecall < 30) recencyBoost = 0.05;
  }

  return Math.min(1.0, baseScore + recallBoost + recencyBoost);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Apply decay to all memories for a user
 *
 * Call this periodically (e.g., daily) to decay unused memories.
 * This is a heavy operation - use sparingly.
 */
export async function applyDecayForUser(_userId: string): Promise<void> {
  // Note: This would require a Spanner batch update query.
  // For now, decay is applied at retrieval time using calculateSignificanceDecay.
  // A background job could implement this later for true persistence.
  log.debug('Decay is applied at retrieval time, not persisted');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  applyAttributionFeedback,
  calculateSignificanceBoost,
  calculateSignificanceDecay,
  adjustScoreForUsage,
};
