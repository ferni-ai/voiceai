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
import type { RapportScore, RapportScorerState, RepairStrategy, TurnObservation } from './types.js';
export declare const RAPPORT_CONFIG: {
    /** Signal weights (must sum to 1.0) */
    WEIGHTS: {
        turnBalance: number;
        interruptionQuality: number;
        engagement: number;
        emotionalAlignment: number;
        flowContinuity: number;
        trustSignals: number;
    };
    /** Rapport level thresholds */
    THRESHOLDS: {
        EXCELLENT: number;
        GOOD: number;
        NEEDS_ATTENTION: number;
        REPAIR_NEEDED: number;
    };
    /** EMA alpha for smoothing scores */
    EMA_ALPHA: number;
    /** Trend detection window (number of scores) */
    TREND_WINDOW: number;
    /** Minimum change to be considered a trend (points) */
    TREND_THRESHOLD: number;
    /** Maximum score history to keep */
    MAX_SCORE_HISTORY: number;
    /** Minimum observations before high confidence */
    MIN_OBSERVATIONS_HIGH_CONFIDENCE: number;
    /** Turn balance target ratio (agent:user) */
    TURN_BALANCE_TARGET: number;
    /** Acceptable interruption overlap (ms) */
    ACCEPTABLE_OVERLAP_MS: number;
    /** Comfortable silence range (ms) */
    COMFORTABLE_SILENCE: {
        MIN: number;
        MAX: number;
    };
};
/**
 * Get or create rapport scorer for a session
 */
export declare function getRapportScorer(sessionId: string): RapportScorer;
/**
 * Reset rapport scorer for a session
 */
export declare function resetRapportScorer(sessionId: string): void;
/**
 * Get count of active scorers
 */
export declare function getActiveRapportScorerCount(): number;
export declare class RapportScorer {
    private sessionId;
    private scoreHistory;
    private currentSignals;
    private repairState;
    private observationCount;
    private sessionStartedAt;
    constructor(sessionId: string);
    /**
     * Initialize signals with default values
     */
    private initializeSignals;
    /**
     * Record a turn observation
     */
    recordObservation(observation: TurnObservation): RapportScore;
    /**
     * Update turn balance signal
     */
    private updateTurnBalanceSignal;
    /**
     * Update interruption quality signal
     */
    private updateInterruptionSignal;
    /**
     * Update engagement signal
     */
    private updateEngagementSignal;
    /**
     * Update emotional alignment signal
     */
    private updateEmotionalAlignmentSignal;
    /**
     * Update flow continuity signal
     */
    private updateFlowContinuitySignal;
    /**
     * Update trust signal
     */
    private updateTrustSignal;
    /**
     * Update a signal with EMA smoothing
     */
    private updateSignal;
    /**
     * Calculate current rapport score
     */
    private calculateScore;
    /**
     * Calculate trend from recent scores
     */
    private calculateTrend;
    /**
     * Convert score to level
     */
    private scoreToLevel;
    /**
     * Calculate confidence in the score
     */
    private calculateConfidence;
    /**
     * Get recommended repair strategy
     */
    getRepairStrategy(): RepairStrategy;
    /**
     * Activate a repair strategy
     */
    activateRepairStrategy(strategy: RepairStrategy): void;
    /**
     * Deactivate current repair strategy
     */
    deactivateRepairStrategy(): void;
    /**
     * Get current score
     */
    getCurrentScore(): RapportScore;
    /**
     * Get full state
     */
    getState(): RapportScorerState;
    /**
     * Reset scorer
     */
    reset(): void;
}
export declare const rapportScorer: {
    get: typeof getRapportScorer;
    reset: typeof resetRapportScorer;
    getActiveCount: typeof getActiveRapportScorerCount;
    config: {
        /** Signal weights (must sum to 1.0) */
        WEIGHTS: {
            turnBalance: number;
            interruptionQuality: number;
            engagement: number;
            emotionalAlignment: number;
            flowContinuity: number;
            trustSignals: number;
        };
        /** Rapport level thresholds */
        THRESHOLDS: {
            EXCELLENT: number;
            GOOD: number;
            NEEDS_ATTENTION: number;
            REPAIR_NEEDED: number;
        };
        /** EMA alpha for smoothing scores */
        EMA_ALPHA: number;
        /** Trend detection window (number of scores) */
        TREND_WINDOW: number;
        /** Minimum change to be considered a trend (points) */
        TREND_THRESHOLD: number;
        /** Maximum score history to keep */
        MAX_SCORE_HISTORY: number;
        /** Minimum observations before high confidence */
        MIN_OBSERVATIONS_HIGH_CONFIDENCE: number;
        /** Turn balance target ratio (agent:user) */
        TURN_BALANCE_TARGET: number;
        /** Acceptable interruption overlap (ms) */
        ACCEPTABLE_OVERLAP_MS: number;
        /** Comfortable silence range (ms) */
        COMFORTABLE_SILENCE: {
            MIN: number;
            MAX: number;
        };
    };
};
//# sourceMappingURL=rapport-scorer.d.ts.map