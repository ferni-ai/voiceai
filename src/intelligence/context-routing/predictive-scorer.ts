/**
 * Predictive Scorer - ML-Informed Builder Scoring
 *
 * Scores context builders based on:
 * - Historical ROI from Phase 1 feedback (40%)
 * - Mode relevance (30%)
 * - Recency boost (15%)
 * - User affinity (15%)
 *
 * Supports three modes:
 * - ML: Full data-driven scoring (>100 samples)
 * - Heuristic: Data + static rules (20-100 samples)
 * - Fallback: Pure static rules (<20 samples)
 *
 * @module context-routing/predictive-scorer
 */

import type {
  ConversationMode,
  PredictiveScore,
  ScoreFactors,
  ScoreSource,
  BuilderEffectiveness,
  UserBuilderPreferences,
  ContextInjection,
} from './types.js';
import {
  SCORE_WEIGHTS,
  MIN_SAMPLES_FOR_ML,
  MIN_SAMPLES_FOR_HEURISTIC,
} from './types.js';
import { CacheManager } from './cache-manager.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PredictiveScorer' });

// ============================================================================
// HEURISTIC CONSTANTS
// ============================================================================

/**
 * Mode-to-category relevance scores (0-100).
 * Used as fallback when no historical data exists.
 *
 * These values encode domain knowledge about what content matters
 * in each conversational context.
 */
export const MODE_CATEGORY_RELEVANCE: Record<ConversationMode, Record<string, number>> = {
  crisis: {
    safety: 100,
    crisis_response: 100,
    boundaries: 95,
    identity: 90,
    emotional: 80,
    humanizing: 70,
    voice: 60,
    memory: 50,
    empathy: 80,
    presence: 75,
    context: 30,
    coaching: 20,
    practical: 20,
    cognitive: 30,
    superhuman: 30,
    proactive: 10,
  },
  emotional: {
    emotional: 90,
    empathy: 95,
    presence: 85,
    humanizing: 80,
    voice: 75,
    memory: 80,
    callback: 85,
    relationship: 80,
    safety: 60,
    identity: 70,
    context: 50,
    coaching: 40,
    cognitive: 40,
    superhuman: 45,
    proactive: 30,
    practical: 30,
  },
  practical: {
    context: 90,
    coaching: 85,
    guidance: 80,
    engagement: 75,
    team: 70,
    practical: 90,
    memory: 50,
    emotional: 40,
    humanizing: 50,
    voice: 40,
    cognitive: 60,
    superhuman: 55,
    proactive: 50,
    safety: 40,
    identity: 50,
  },
  deep: {
    cognitive: 95,
    wisdom: 90,
    superhuman: 90,
    proactive: 80,
    memory: 85,
    relationship: 80,
    learning: 85,
    external: 75,
    emotional: 60,
    presence: 70,
    identity: 75,
    context: 50,
    coaching: 55,
    humanizing: 55,
    safety: 40,
  },
  casual: {
    humanizing: 85,
    engagement: 80,
    persona: 75,
    voice: 70,
    emotional: 60,
    context: 50,
    memory: 30,
    superhuman: 55,
    cognitive: 40,
    coaching: 35,
    safety: 30,
    practical: 40,
    proactive: 25,
    identity: 50,
    presence: 50,
  },
  unknown: {
    context: 70,
    emotional: 60,
    humanizing: 60,
    memory: 55,
    practical: 55,
    coaching: 50,
    superhuman: 55,
    cognitive: 50,
    identity: 60,
    safety: 50,
    voice: 45,
    presence: 50,
    engagement: 50,
    proactive: 40,
    persona: 45,
  },
};

/**
 * Default relevance for categories not in the mapping.
 */
const DEFAULT_CATEGORY_RELEVANCE = 40;

/**
 * Recency decay factor (how quickly old successes lose value).
 * Value of 0.9 means 90% of value is retained per time unit.
 */
const RECENCY_DECAY_FACTOR = 0.9;

/**
 * Maximum recency boost (capped to prevent runaway scores).
 */
const MAX_RECENCY_BOOST = 100;

// ============================================================================
// PREDICTIVE SCORER CLASS
// ============================================================================

export class PredictiveScorer {
  private readonly userId: string;
  private readonly sessionId: string;
  private readonly cacheManager: CacheManager;

  // Session-local tracking of recent successes
  private readonly recentSuccesses: Map<string, { count: number; lastSuccess: Date }> =
    new Map();

  constructor(userId: string, sessionId: string, cacheManager: CacheManager) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.cacheManager = cacheManager;
  }

  /**
   * Score all injections for the current context.
   */
  scoreInjections(
    injections: ContextInjection[],
    mode: ConversationMode,
    userPreferences: UserBuilderPreferences | null
  ): PredictiveScore[] {
    return injections.map((injection) =>
      this.scoreBuilder(injection.category, mode, userPreferences)
    );
  }

  /**
   * Score a single builder for the current context.
   */
  scoreBuilder(
    builderId: string,
    mode: ConversationMode,
    userPreferences: UserBuilderPreferences | null
  ): PredictiveScore {
    // Check cache first
    const cached = this.cacheManager.getScore(builderId);
    if (cached.score) {
      // Update mode relevance for current context
      return this.adjustScoreForMode(cached.score, mode);
    }

    // Compute fresh score
    const factors = this.computeFactors(builderId, mode, userPreferences);
    const source = this.determineSource(builderId);
    const confidence = this.computeConfidence(builderId, source);

    const score = this.computeCompositeScore(factors);

    const predictiveScore: PredictiveScore = {
      builderId,
      score,
      confidence,
      factors,
      source,
    };

    // Cache for this session
    this.cacheManager.setSessionScore(builderId, predictiveScore);

    return predictiveScore;
  }

  /**
   * Compute all scoring factors for a builder.
   */
  private computeFactors(
    builderId: string,
    mode: ConversationMode,
    userPreferences: UserBuilderPreferences | null
  ): ScoreFactors {
    return {
      roiScore: this.computeRoiScore(builderId),
      modeRelevance: this.computeModeRelevance(builderId, mode),
      recencyBoost: this.computeRecencyBoost(builderId),
      userAffinity: this.computeUserAffinity(builderId, userPreferences),
    };
  }

  /**
   * Compute ROI score from historical feedback.
   */
  private computeRoiScore(builderId: string): number {
    // Try to get from global effectiveness cache
    const effectiveness = CacheManager.getGlobalEffectiveness(builderId);
    if (effectiveness) {
      return effectiveness.roiScore;
    }

    // Fallback: neutral score
    return 50;
  }

  /**
   * Compute mode relevance score.
   */
  private computeModeRelevance(builderId: string, mode: ConversationMode): number {
    // Get effectiveness data for mode-specific scores
    const effectiveness = CacheManager.getGlobalEffectiveness(builderId);

    // If we have mode-specific historical data, use it
    if (effectiveness?.modeScores[mode] !== undefined) {
      return effectiveness.modeScores[mode]!;
    }

    // Fallback to heuristic mapping
    const categoryRelevance = MODE_CATEGORY_RELEVANCE[mode];

    // Check for exact match
    if (builderId in categoryRelevance) {
      return categoryRelevance[builderId];
    }

    // Check for prefix match (e.g., "emotional_guidance" matches "emotional")
    for (const [category, relevance] of Object.entries(categoryRelevance)) {
      if (builderId.startsWith(category) || builderId.includes(`_${category}`)) {
        return relevance;
      }
    }

    return DEFAULT_CATEGORY_RELEVANCE;
  }

  /**
   * Compute recency boost from recent successes.
   */
  private computeRecencyBoost(builderId: string): number {
    const recent = this.recentSuccesses.get(builderId);
    if (!recent) {
      return 0;
    }

    // Calculate time decay
    const ageMs = Date.now() - recent.lastSuccess.getTime();
    const ageMinutes = ageMs / (1000 * 60);

    // Exponential decay: value halves every 10 minutes
    const decayFactor = Math.pow(RECENCY_DECAY_FACTOR, ageMinutes / 10);
    const boost = recent.count * 20 * decayFactor;

    return Math.min(boost, MAX_RECENCY_BOOST);
  }

  /**
   * Compute user affinity score.
   */
  private computeUserAffinity(
    builderId: string,
    userPreferences: UserBuilderPreferences | null
  ): number {
    if (!userPreferences) {
      return 50; // Neutral
    }

    // Strong positive signal
    if (userPreferences.effectiveBuilders.includes(builderId)) {
      return 90;
    }

    // Strong negative signal
    if (userPreferences.ineffectiveBuilders.includes(builderId)) {
      return 10;
    }

    // Neutral
    return 50;
  }

  /**
   * Compute composite score from factors.
   */
  private computeCompositeScore(factors: ScoreFactors): number {
    return (
      factors.roiScore * SCORE_WEIGHTS.roiScore +
      factors.modeRelevance * SCORE_WEIGHTS.modeRelevance +
      factors.recencyBoost * SCORE_WEIGHTS.recencyBoost +
      factors.userAffinity * SCORE_WEIGHTS.userAffinity
    );
  }

  /**
   * Determine the source of the score (ML, heuristic, or fallback).
   */
  private determineSource(builderId: string): ScoreSource {
    const effectiveness = CacheManager.getGlobalEffectiveness(builderId);
    if (!effectiveness) {
      return 'fallback';
    }

    if (effectiveness.sampleCount >= MIN_SAMPLES_FOR_ML) {
      return 'ml';
    }

    if (effectiveness.sampleCount >= MIN_SAMPLES_FOR_HEURISTIC) {
      return 'heuristic';
    }

    return 'fallback';
  }

  /**
   * Compute confidence based on data availability.
   */
  private computeConfidence(builderId: string, source: ScoreSource): number {
    switch (source) {
      case 'ml':
        return 0.9;
      case 'heuristic': {
        const effectiveness = CacheManager.getGlobalEffectiveness(builderId);
        if (!effectiveness) return 0.4;
        // Scale from 0.4 to 0.7 based on sample count
        const progress =
          (effectiveness.sampleCount - MIN_SAMPLES_FOR_HEURISTIC) /
          (MIN_SAMPLES_FOR_ML - MIN_SAMPLES_FOR_HEURISTIC);
        return 0.4 + progress * 0.3;
      }
      case 'fallback':
        return 0.3;
      default:
        return 0.3;
    }
  }

  /**
   * Adjust a cached score for the current mode.
   * Mode relevance may have changed since caching.
   */
  private adjustScoreForMode(
    cachedScore: PredictiveScore,
    currentMode: ConversationMode
  ): PredictiveScore {
    const newModeRelevance = this.computeModeRelevance(cachedScore.builderId, currentMode);

    // If mode relevance is similar, return cached
    if (Math.abs(newModeRelevance - cachedScore.factors.modeRelevance) < 10) {
      return cachedScore;
    }

    // Recompute with new mode relevance
    const newFactors = {
      ...cachedScore.factors,
      modeRelevance: newModeRelevance,
    };

    return {
      ...cachedScore,
      factors: newFactors,
      score: this.computeCompositeScore(newFactors),
    };
  }

  // --------------------------------------------------------------------------
  // FEEDBACK INTEGRATION
  // --------------------------------------------------------------------------

  /**
   * Record a successful use of a builder (for recency boost).
   */
  recordSuccess(builderId: string): void {
    const existing = this.recentSuccesses.get(builderId);
    this.recentSuccesses.set(builderId, {
      count: (existing?.count ?? 0) + 1,
      lastSuccess: new Date(),
    });

    log.debug({ builderId, count: this.recentSuccesses.get(builderId)?.count }, 'Recorded success');
  }

  /**
   * Clear recency data (call on session end).
   */
  clearRecency(): void {
    this.recentSuccesses.clear();
  }

  // --------------------------------------------------------------------------
  // UTILITY METHODS
  // --------------------------------------------------------------------------

  /**
   * Get stats about scoring.
   */
  getStats(): {
    recentSuccessCount: number;
    cachedScoresCount: number;
  } {
    return {
      recentSuccessCount: this.recentSuccesses.size,
      cachedScoresCount: this.cacheManager.getAllSessionScores().size,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a predictive scorer for a session.
 */
export function createPredictiveScorer(
  userId: string,
  sessionId: string,
  cacheManager: CacheManager
): PredictiveScorer {
  return new PredictiveScorer(userId, sessionId, cacheManager);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get mode relevance for a category (for testing/debugging).
 */
export function getModeRelevance(category: string, mode: ConversationMode): number {
  const categoryRelevance = MODE_CATEGORY_RELEVANCE[mode];

  if (category in categoryRelevance) {
    return categoryRelevance[category];
  }

  // Check for prefix match
  for (const [cat, relevance] of Object.entries(categoryRelevance)) {
    if (category.startsWith(cat) || category.includes(`_${cat}`)) {
      return relevance;
    }
  }

  return DEFAULT_CATEGORY_RELEVANCE;
}

/**
 * Compute a score from factors (for testing).
 */
export function computeScore(factors: ScoreFactors): number {
  return (
    factors.roiScore * SCORE_WEIGHTS.roiScore +
    factors.modeRelevance * SCORE_WEIGHTS.modeRelevance +
    factors.recencyBoost * SCORE_WEIGHTS.recencyBoost +
    factors.userAffinity * SCORE_WEIGHTS.userAffinity
  );
}
