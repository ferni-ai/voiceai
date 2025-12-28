/**
 * Rapport Scorer
 *
 * Unified real-time conversational health metric combining multiple signals.
 * Triggers repair strategies when rapport drops below thresholds.
 *
 * Key principle: Catch declining rapport early and repair gently.
 * - Monitor 6 signal types with weighted scoring
 * - Detect trends (improving, declining, stable)
 * - Recommend repair strategies when needed
 *
 * @module rapport/rapport-scorer
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  EngagementObservation,
  EmotionalAlignmentObservation,
  FlowContinuityObservation,
  InterruptionObservation,
  RapportLevel,
  RapportScore,
  RapportScorerState,
  RapportSignal,
  RepairState,
  RepairStrategy,
  TrustSignalObservation,
  TurnBalanceObservation,
  TurnObservation,
} from './types.js';
import { selectRepairStrategy } from './repair-strategies.js';

const log = createLogger({ module: 'RapportScorer' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export const RAPPORT_CONFIG = {
  /** Signal weights (must sum to 1.0) */
  WEIGHTS: {
    turnBalance: 0.15,
    interruptionQuality: 0.15,
    engagement: 0.25,
    emotionalAlignment: 0.2,
    flowContinuity: 0.1,
    trustSignals: 0.15,
  },

  /** Rapport level thresholds */
  THRESHOLDS: {
    EXCELLENT: 85,
    GOOD: 70,
    NEEDS_ATTENTION: 55,
    REPAIR_NEEDED: 40,
    // Below 40 is CRITICAL
  },

  /** EMA alpha for smoothing scores */
  EMA_ALPHA: 0.3,

  /** Trend detection window (number of scores) */
  TREND_WINDOW: 5,

  /** Minimum change to be considered a trend (points) */
  TREND_THRESHOLD: 3,

  /** Maximum score history to keep */
  MAX_SCORE_HISTORY: 20,

  /** Minimum observations before high confidence */
  MIN_OBSERVATIONS_HIGH_CONFIDENCE: 10,

  /** Turn balance target ratio (agent:user) */
  TURN_BALANCE_TARGET: 0.6, // Agent should talk slightly less

  /** Acceptable interruption overlap (ms) */
  ACCEPTABLE_OVERLAP_MS: 500,

  /** Comfortable silence range (ms) */
  COMFORTABLE_SILENCE: {
    MIN: 200,
    MAX: 1500,
  },
};

// ============================================================================
// SESSION-SCOPED SCORERS
// ============================================================================

const scorers = new Map<string, RapportScorer>();

/**
 * Get or create rapport scorer for a session
 */
export function getRapportScorer(sessionId: string): RapportScorer {
  if (!scorers.has(sessionId)) {
    scorers.set(sessionId, new RapportScorer(sessionId));
  }
  return scorers.get(sessionId)!;
}

/**
 * Reset rapport scorer for a session
 */
export function resetRapportScorer(sessionId: string): void {
  const scorer = scorers.get(sessionId);
  if (scorer) {
    log.debug(
      { sessionId, observations: scorer.getState().observationCount },
      'Resetting rapport scorer'
    );
  }
  scorers.delete(sessionId);
}

/**
 * Get count of active scorers
 */
export function getActiveRapportScorerCount(): number {
  return scorers.size;
}

// ============================================================================
// RAPPORT SCORER CLASS
// ============================================================================

export class RapportScorer {
  private sessionId: string;
  private scoreHistory: RapportScore[] = [];
  private currentSignals = new Map<string, RapportSignal>();
  private repairState: RepairState;
  private observationCount = 0;
  private sessionStartedAt: number;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sessionStartedAt = Date.now();
    this.repairState = {
      activeStrategy: null,
      turnsSinceRepairStarted: 0,
      isImproving: false,
      recentStrategies: [],
    };

    // Initialize with neutral signals
    this.initializeSignals();

    log.debug({ sessionId }, 'RapportScorer initialized');
  }

  /**
   * Initialize signals with default values
   */
  private initializeSignals(): void {
    const now = Date.now();
    const weights = RAPPORT_CONFIG.WEIGHTS;

    this.currentSignals.set('turnBalance', {
      name: 'turnBalance',
      value: 0.7, // Default neutral-good
      weight: weights.turnBalance,
      contribution: 0.7 * weights.turnBalance * 100,
      lastUpdatedAt: now,
    });

    this.currentSignals.set('interruptionQuality', {
      name: 'interruptionQuality',
      value: 0.8, // Default good (no interruptions)
      weight: weights.interruptionQuality,
      contribution: 0.8 * weights.interruptionQuality * 100,
      lastUpdatedAt: now,
    });

    this.currentSignals.set('engagement', {
      name: 'engagement',
      value: 0.6, // Default moderate
      weight: weights.engagement,
      contribution: 0.6 * weights.engagement * 100,
      lastUpdatedAt: now,
    });

    this.currentSignals.set('emotionalAlignment', {
      name: 'emotionalAlignment',
      value: 0.7, // Default aligned
      weight: weights.emotionalAlignment,
      contribution: 0.7 * weights.emotionalAlignment * 100,
      lastUpdatedAt: now,
    });

    this.currentSignals.set('flowContinuity', {
      name: 'flowContinuity',
      value: 0.7, // Default flowing
      weight: weights.flowContinuity,
      contribution: 0.7 * weights.flowContinuity * 100,
      lastUpdatedAt: now,
    });

    this.currentSignals.set('trustSignals', {
      name: 'trustSignals',
      value: 0.5, // Default neutral (no trust signals yet)
      weight: weights.trustSignals,
      contribution: 0.5 * weights.trustSignals * 100,
      lastUpdatedAt: now,
    });
  }

  /**
   * Record a turn observation
   */
  recordObservation(observation: TurnObservation): RapportScore {
    this.observationCount++;
    const now = Date.now();

    // Update individual signals
    if (observation.turnBalance) {
      this.updateTurnBalanceSignal(observation.turnBalance, now);
    }
    if (observation.interruption) {
      this.updateInterruptionSignal(observation.interruption, now);
    }
    if (observation.engagement) {
      this.updateEngagementSignal(observation.engagement, now);
    }
    if (observation.emotionalAlignment) {
      this.updateEmotionalAlignmentSignal(observation.emotionalAlignment, now);
    }
    if (observation.flowContinuity) {
      this.updateFlowContinuitySignal(observation.flowContinuity, now);
    }
    if (observation.trustSignals) {
      this.updateTrustSignal(observation.trustSignals, now);
    }

    // Calculate new score
    const score = this.calculateScore();

    // Update history
    this.scoreHistory.push(score);
    if (this.scoreHistory.length > RAPPORT_CONFIG.MAX_SCORE_HISTORY) {
      this.scoreHistory.shift();
    }

    // Update repair state
    if (this.repairState.activeStrategy) {
      this.repairState.turnsSinceRepairStarted++;
      this.repairState.isImproving = score.trend === 'improving';
    }

    // Log significant changes
    if (score.level === 'repair_needed' || score.level === 'critical') {
      log.warn(
        {
          sessionId: this.sessionId,
          score: score.score.toFixed(1),
          level: score.level,
          trend: score.trend,
        },
        '⚠️ Rapport needs attention'
      );
    }

    return score;
  }

  /**
   * Update turn balance signal
   */
  private updateTurnBalanceSignal(obs: TurnBalanceObservation, now: number): void {
    const totalWords = obs.agentWordCount + obs.userWordCount;
    if (totalWords === 0) return;

    // Calculate agent's share of talking
    const agentShare = obs.agentWordCount / totalWords;

    // Score based on how close to target ratio
    // Target is 0.6 (agent talks slightly less), so 0.4 agent share is ideal
    const targetShare = 1 - RAPPORT_CONFIG.TURN_BALANCE_TARGET;
    const deviation = Math.abs(agentShare - targetShare);
    const rawValue = Math.max(0, 1 - deviation * 2); // 0.5 deviation = 0 score

    this.updateSignal('turnBalance', rawValue, now);
  }

  /**
   * Update interruption quality signal
   */
  private updateInterruptionSignal(obs: InterruptionObservation, now: number): void {
    let rawValue = 1.0; // Start with perfect score

    // Agent interruption is worse than user interruption
    if (obs.agentInterrupted && !obs.wasCollaborative) {
      rawValue -= 0.4;
    } else if (obs.agentInterrupted && obs.wasCollaborative) {
      rawValue -= 0.1; // Collaborative interruptions are okay
    }

    // User interruption might indicate they want control
    if (obs.userInterrupted) {
      rawValue -= 0.2;
    }

    // Long overlaps are worse
    if (obs.overlapMs > RAPPORT_CONFIG.ACCEPTABLE_OVERLAP_MS) {
      const excessMs = obs.overlapMs - RAPPORT_CONFIG.ACCEPTABLE_OVERLAP_MS;
      rawValue -= Math.min(0.3, excessMs / 2000);
    }

    this.updateSignal('interruptionQuality', Math.max(0, rawValue), now);
  }

  /**
   * Update engagement signal
   */
  private updateEngagementSignal(obs: EngagementObservation, now: number): void {
    let rawValue = 0.3; // Base score

    // Response length
    if (obs.responseLength === 'medium') rawValue += 0.2;
    if (obs.responseLength === 'long') rawValue += 0.3;

    // High engagement behaviors
    if (obs.userAskedQuestion) rawValue += 0.15;
    if (obs.userElaborated) rawValue += 0.15;
    if (obs.userIntroducedTopic) rawValue += 0.1;
    if (obs.userShowedEmotion) rawValue += 0.1;

    this.updateSignal('engagement', Math.min(1, rawValue), now);
  }

  /**
   * Update emotional alignment signal
   */
  private updateEmotionalAlignmentSignal(obs: EmotionalAlignmentObservation, now: number): void {
    let rawValue = 0.5; // Neutral baseline

    // Alignment is key
    if (obs.isAligned) {
      rawValue += 0.3;
    } else {
      rawValue -= 0.2;
    }

    // Energy matching (within 0.3 is good)
    const energyDiff = Math.abs(obs.userEnergy - obs.agentEnergy);
    if (energyDiff < 0.3) {
      rawValue += 0.2;
    } else if (energyDiff > 0.5) {
      rawValue -= 0.2;
    }

    this.updateSignal('emotionalAlignment', Math.max(0, Math.min(1, rawValue)), now);
  }

  /**
   * Update flow continuity signal
   */
  private updateFlowContinuitySignal(obs: FlowContinuityObservation, now: number): void {
    let rawValue = 0.7; // Good baseline

    // Natural silence is good, too long or too short is bad
    const { MIN, MAX } = RAPPORT_CONFIG.COMFORTABLE_SILENCE;
    if (obs.silenceDurationMs < MIN) {
      rawValue -= 0.1; // Too rushed
    } else if (obs.silenceDurationMs > MAX) {
      const excessMs = obs.silenceDurationMs - MAX;
      rawValue -= Math.min(0.3, excessMs / 3000);
    }

    // Topic shifts hurt flow
    if (obs.topicShift && !obs.smoothTransition) {
      rawValue -= 0.2;
    }

    // Smooth transitions help
    if (obs.smoothTransition) {
      rawValue += 0.1;
    }

    if (obs.naturalPacing) {
      rawValue += 0.1;
    }

    this.updateSignal('flowContinuity', Math.max(0, Math.min(1, rawValue)), now);
  }

  /**
   * Update trust signal
   */
  private updateTrustSignal(obs: TrustSignalObservation, now: number): void {
    let rawValue = 0.5; // Neutral baseline

    // Positive trust signals
    if (obs.userDisclosed) rawValue += 0.15;
    if (obs.userShowedVulnerability) rawValue += 0.2;
    if (obs.userAskedForHelp) rawValue += 0.15;

    // Negative signals
    if (obs.userExpressedSkepticism) rawValue -= 0.2;

    // Blend with comfort level
    rawValue = rawValue * 0.6 + obs.comfortLevel * 0.4;

    this.updateSignal('trustSignals', Math.max(0, Math.min(1, rawValue)), now);
  }

  /**
   * Update a signal with EMA smoothing
   */
  private updateSignal(name: string, newValue: number, now: number): void {
    const signal = this.currentSignals.get(name);
    if (!signal) return;

    // EMA smoothing
    const smoothedValue =
      RAPPORT_CONFIG.EMA_ALPHA * newValue + (1 - RAPPORT_CONFIG.EMA_ALPHA) * signal.value;

    this.currentSignals.set(name, {
      ...signal,
      value: smoothedValue,
      contribution: smoothedValue * signal.weight * 100,
      lastUpdatedAt: now,
    });
  }

  /**
   * Calculate current rapport score
   */
  private calculateScore(): RapportScore {
    const now = Date.now();
    const signals = Array.from(this.currentSignals.values());

    // Sum contributions
    let totalScore = 0;
    for (const signal of signals) {
      totalScore += signal.contribution;
    }

    // Calculate trend
    const { trend, trendRate } = this.calculateTrend(totalScore);

    // Determine level
    const level = this.scoreToLevel(totalScore);

    // Calculate confidence
    const confidence = this.calculateConfidence();

    return {
      score: totalScore,
      level,
      signals,
      confidence,
      trend,
      trendRate,
      calculatedAt: now,
    };
  }

  /**
   * Calculate trend from recent scores
   */
  private calculateTrend(currentScore: number): {
    trend: 'improving' | 'declining' | 'stable';
    trendRate: number;
  } {
    if (this.scoreHistory.length < RAPPORT_CONFIG.TREND_WINDOW) {
      return { trend: 'stable', trendRate: 0 };
    }

    const recentScores = this.scoreHistory.slice(-RAPPORT_CONFIG.TREND_WINDOW);
    const avgRecent = recentScores.reduce((sum, s) => sum + s.score, 0) / recentScores.length;
    const change = currentScore - avgRecent;
    const trendRate = change / RAPPORT_CONFIG.TREND_WINDOW;

    if (change > RAPPORT_CONFIG.TREND_THRESHOLD) {
      return { trend: 'improving', trendRate };
    } else if (change < -RAPPORT_CONFIG.TREND_THRESHOLD) {
      return { trend: 'declining', trendRate };
    }

    return { trend: 'stable', trendRate };
  }

  /**
   * Convert score to level
   */
  private scoreToLevel(score: number): RapportLevel {
    const t = RAPPORT_CONFIG.THRESHOLDS;
    if (score >= t.EXCELLENT) return 'excellent';
    if (score >= t.GOOD) return 'good';
    if (score >= t.NEEDS_ATTENTION) return 'needs_attention';
    if (score >= t.REPAIR_NEEDED) return 'repair_needed';
    return 'critical';
  }

  /**
   * Calculate confidence in the score
   */
  private calculateConfidence(): number {
    // More observations = higher confidence
    const obsConfidence = Math.min(
      1,
      this.observationCount / RAPPORT_CONFIG.MIN_OBSERVATIONS_HIGH_CONFIDENCE
    );

    // Recent updates across signals = higher confidence
    const now = Date.now();
    let recentSignals = 0;
    for (const signal of this.currentSignals.values()) {
      if (now - signal.lastUpdatedAt < 30000) {
        recentSignals++;
      }
    }
    const recencyConfidence = recentSignals / this.currentSignals.size;

    return 0.5 + 0.25 * obsConfidence + 0.25 * recencyConfidence;
  }

  /**
   * Get recommended repair strategy
   */
  getRepairStrategy(): RepairStrategy {
    const score = this.getCurrentScore();
    return selectRepairStrategy(score, this.repairState);
  }

  /**
   * Activate a repair strategy
   */
  activateRepairStrategy(strategy: RepairStrategy): void {
    if (strategy.type === 'none') {
      this.repairState.activeStrategy = null;
      return;
    }

    this.repairState.activeStrategy = strategy;
    this.repairState.turnsSinceRepairStarted = 0;
    this.repairState.isImproving = false;
    this.repairState.recentStrategies.push(strategy.type);

    // Keep only last 5 strategies
    if (this.repairState.recentStrategies.length > 5) {
      this.repairState.recentStrategies.shift();
    }

    log.info(
      {
        sessionId: this.sessionId,
        strategy: strategy.type,
        reason: strategy.reason,
      },
      '🔧 Activating repair strategy'
    );
  }

  /**
   * Deactivate current repair strategy
   */
  deactivateRepairStrategy(): void {
    if (this.repairState.activeStrategy) {
      log.debug(
        {
          sessionId: this.sessionId,
          strategy: this.repairState.activeStrategy.type,
          turnsActive: this.repairState.turnsSinceRepairStarted,
          improved: this.repairState.isImproving,
        },
        '✓ Repair strategy completed'
      );
    }
    this.repairState.activeStrategy = null;
    this.repairState.turnsSinceRepairStarted = 0;
  }

  /**
   * Get current score
   */
  getCurrentScore(): RapportScore {
    return this.calculateScore();
  }

  /**
   * Get full state
   */
  getState(): RapportScorerState {
    return {
      sessionId: this.sessionId,
      currentScore: this.getCurrentScore(),
      scoreHistory: [...this.scoreHistory],
      repairState: { ...this.repairState },
      observationCount: this.observationCount,
      sessionStartedAt: this.sessionStartedAt,
    };
  }

  /**
   * Reset scorer
   */
  reset(): void {
    this.scoreHistory = [];
    this.currentSignals.clear();
    this.initializeSignals();
    this.repairState = {
      activeStrategy: null,
      turnsSinceRepairStarted: 0,
      isImproving: false,
      recentStrategies: [],
    };
    this.observationCount = 0;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const rapportScorer = {
  get: getRapportScorer,
  reset: resetRapportScorer,
  getActiveCount: getActiveRapportScorerCount,
  config: RAPPORT_CONFIG,
};
