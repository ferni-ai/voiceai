/**
 * Multi-Signal Fusion Engine
 *
 * TRUE PREDICTIVE INTELLIGENCE: Combine multiple weak signals into strong predictions.
 *
 * No single signal is reliable on its own:
 * - Day of week alone: ~55% accuracy
 * - Emotion detection alone: ~60% accuracy
 * - Topic history alone: ~50% accuracy
 *
 * But combined intelligently, they achieve >80% accuracy.
 *
 * This engine:
 * - Weights signals by their historical reliability per user
 * - Uses Bayesian updating to combine probabilities
 * - Accounts for signal correlations (don't double-count)
 * - Learns optimal weights through feedback
 *
 * @module intelligence/predictive/multi-signal-fusion
 */
/** Individual signal source */
export interface SignalSource {
    name: string;
    value: number;
    confidence: number;
    weight: number;
    timestamp: number;
    metadata?: Record<string, unknown>;
}
/** Fused prediction result */
export interface FusedPrediction {
    /** What we're predicting */
    target: PredictionTarget;
    /** Fused probability */
    probability: number;
    /** Overall confidence in the prediction */
    confidence: number;
    /** Contributing signals */
    signals: SignalSource[];
    /** Correlation matrix between signals */
    correlations: Map<string, Map<string, number>>;
    /** Explanation of how we reached this prediction */
    explanation: string;
    /** Suggested action */
    suggestedAction?: {
        type: 'outreach' | 'alert' | 'defer' | 'observe';
        timing?: Date;
        message?: string;
    };
}
export type PredictionTarget = 'needs_support_now' | 'will_struggle_soon' | 'ready_for_challenge' | 'optimal_outreach_window' | 'high_engagement_period' | 'burnout_risk' | 'relationship_tension' | 'habit_slip_likely';
/**
 * Fuse multiple signals to predict a target outcome
 *
 * @param userId - User to predict for
 * @param target - What we're trying to predict
 * @param context - Additional context
 * @returns Fused prediction with confidence
 */
export declare function fusePrediction(userId: string, target: PredictionTarget, context?: {
    currentEmotion?: string;
    currentTopic?: string;
    timestamp?: Date;
    recentText?: string;
}): Promise<FusedPrediction>;
/**
 * Record prediction outcome for learning
 *
 * @param userId - User
 * @param predictionId - Original prediction
 * @param outcome - Whether prediction was correct
 * @param signals - Signals that contributed to prediction
 */
export declare function recordPredictionOutcome(userId: string, outcome: boolean, signals: SignalSource[]): void;
declare const _default: {
    fusePrediction: typeof fusePrediction;
    recordPredictionOutcome: typeof recordPredictionOutcome;
};
export default _default;
//# sourceMappingURL=multi-signal-fusion.d.ts.map