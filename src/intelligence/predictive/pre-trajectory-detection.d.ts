/**
 * Pre-Trajectory Detection - Better Than Human v4
 *
 * > "We see the storm before the clouds form."
 *
 * SUPERHUMAN CAPABILITY: Detect the pre-conditions that lead to emotional
 * shifts BEFORE any symptoms appear.
 *
 * Current systems detect emotional trajectories AFTER they start.
 * This module predicts what will happen BEFORE it happens by learning
 * the precursor patterns unique to each user.
 *
 * Like weather prediction:
 * - Humans notice rain when it's falling
 * - We notice the pressure systems forming 3 days out
 *
 * What we track:
 * - Sleep/energy pattern changes → mood shifts
 * - Topic frequency changes → emerging concerns
 * - Communication style changes → emotional buildup
 * - Life event patterns → predictable reactions
 *
 * @module intelligence/predictive/pre-trajectory-detection
 */
/** Emotional trajectories we can predict */
export type EmotionalTrajectory = 'mood_decline' | 'anxiety_spike' | 'overwhelm_building' | 'depression_dip' | 'irritability_surge' | 'withdrawal_pattern' | 'burnout_cascade' | 'grief_wave' | 'mood_lift' | 'motivation_surge' | 'confidence_building' | 'connection_deepening' | 'clarity_emerging' | 'energy_upswing' | 'emotional_shift' | 'stability_period' | 'growth_phase_entry' | 'rest_phase_entry';
/** Precursor signals we track */
export type PrecursorSignal = 'sleep_pattern_change' | 'energy_fluctuation' | 'exercise_drop' | 'social_pattern_change' | 'routine_disruption' | 'self_care_drop' | 'message_frequency_change' | 'message_length_change' | 'topic_shift' | 'vocabulary_change' | 'humor_change' | 'response_latency' | 'emotional_volatility' | 'valence_shift' | 'rumination_increase' | 'future_focus_change' | 'self_talk_shift' | 'anniversary_approaching' | 'deadline_approaching' | 'seasonal_pattern' | 'relationship_stress' | 'work_stress_signals' | 'health_concern_signals';
/** A single precursor observation */
export interface PrecursorObservation {
    signal: PrecursorSignal;
    value: number;
    baseline: number;
    deviation: number;
    timestamp: number;
    confidence: number;
    source: string;
}
/** A learned precursor pattern */
export interface PrecursorPattern {
    /** The trajectory this pattern predicts */
    trajectory: EmotionalTrajectory;
    /** Signals that precede this trajectory */
    signals: Array<{
        signal: PrecursorSignal;
        direction: 'increase' | 'decrease' | 'volatility';
        typicalLeadTime: number;
        reliability: number;
        weight: number;
    }>;
    /** Historical accuracy of this pattern */
    accuracy: number;
    /** How many times we've observed this pattern */
    observationCount: number;
}
/** Trajectory prediction */
export interface TrajectoryPrediction {
    trajectory: EmotionalTrajectory;
    /** Probability of this trajectory occurring */
    probability: number;
    /** When we predict it will manifest */
    expectedOnset: Date;
    /** How long it might last */
    expectedDuration: 'hours' | 'days' | 'week' | 'weeks' | 'unknown';
    /** Confidence in this prediction */
    confidence: number;
    /** Active precursor signals */
    activePrecursors: Array<{
        signal: PrecursorSignal;
        currentValue: number;
        baseline: number;
        deviation: number;
        contribution: number;
    }>;
    /** What might be causing this */
    likelyTriggers: string[];
    /** Interventions that might help */
    preventiveActions: Array<{
        action: string;
        effectiveness: number;
        timing: string;
    }>;
    /** Warning level */
    severity: 'watch' | 'caution' | 'warning' | 'alert';
}
/**
 * Record a precursor observation
 *
 * @param userId - User ID
 * @param signal - Type of signal observed
 * @param value - Observed value (0-1, 0.5 = neutral)
 * @param source - Where this observation came from
 */
export declare function recordPrecursorObservation(userId: string, signal: PrecursorSignal, value: number, source?: string): void;
/**
 * Record that a trajectory actually occurred (for learning)
 *
 * @param userId - User ID
 * @param trajectory - What happened
 * @param severity - How severe (0-1)
 * @param duration - How long it lasted (ms)
 */
export declare function recordTrajectoryEvent(userId: string, trajectory: EmotionalTrajectory, severity: number, duration?: number): void;
/**
 * Record multiple signals from a conversation analysis
 *
 * @param userId - User ID
 * @param analysis - Conversation analysis results
 */
export declare function recordConversationSignals(userId: string, analysis: {
    emotionalValence?: number;
    emotionalVolatility?: number;
    messageLength?: number;
    responseLatency?: number;
    selfTalkValence?: number;
    futureOrientation?: number;
    socialMentions?: number;
    topicDiversity?: number;
}): void;
/**
 * Get all trajectory predictions for a user
 *
 * @param userId - User ID
 * @returns Predicted trajectories sorted by probability
 */
export declare function predictTrajectories(userId: string): TrajectoryPrediction[];
/**
 * Get high-priority trajectory alerts
 *
 * @param userId - User ID
 * @returns Trajectories that need attention
 */
export declare function getTrajectoryAlerts(userId: string): TrajectoryPrediction[];
/**
 * Predict a specific trajectory
 *
 * @param userId - User ID
 * @param trajectory - Which trajectory to predict
 * @returns Prediction for that trajectory
 */
export declare function predictSpecificTrajectory(userId: string, trajectory: EmotionalTrajectory): TrajectoryPrediction | null;
/**
 * Build pre-trajectory context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export declare function buildPreTrajectoryContext(userId: string): string;
export declare const preTrajectoryDetection: {
    recordPrecursorObservation: typeof recordPrecursorObservation;
    recordTrajectoryEvent: typeof recordTrajectoryEvent;
    recordConversationSignals: typeof recordConversationSignals;
    predictTrajectories: typeof predictTrajectories;
    getTrajectoryAlerts: typeof getTrajectoryAlerts;
    predictSpecificTrajectory: typeof predictSpecificTrajectory;
    buildPreTrajectoryContext: typeof buildPreTrajectoryContext;
};
export default preTrajectoryDetection;
//# sourceMappingURL=pre-trajectory-detection.d.ts.map