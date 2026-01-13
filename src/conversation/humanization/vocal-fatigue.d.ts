/**
 * Vocal Fatigue Modeling
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Over long conversations, humans naturally show vocal fatigue:
 * - Voice energy decreases
 * - Pace slows slightly
 * - Pauses become longer
 * - Thinking markers increase
 *
 * This module models these natural patterns to make long sessions
 * feel more authentic and less robotic.
 *
 * **Key insight**: Fatigue isn't just about sounding tired—it's about
 * showing that the conversation has weight, that we're genuinely present
 * and processing, not just outputting infinite perfectly-energized responses.
 *
 * @module @ferni/humanization/vocal-fatigue
 */
export interface FatigueState {
    /** Session duration in minutes */
    sessionMinutes: number;
    /** Turn count */
    turnCount: number;
    /** Heavy topics discussed */
    heavyTopicCount: number;
    /** Accumulated emotional load (0-1) */
    emotionalLoad: number;
    /** Recent high-energy exchanges */
    highEnergyExchanges: number;
    /** Calculated fatigue level (0-1) */
    fatigueLevel: number;
    /** Fatigue trend */
    trend: 'increasing' | 'stable' | 'recovering';
}
export interface FatigueAdjustments {
    /** Speed reduction (0 to -0.15) */
    speedReduction: number;
    /** Pitch lowering (0 to -5%) */
    pitchReduction: string;
    /** Pause multiplier (1.0 to 1.4) */
    pauseMultiplier: number;
    /** Probability of thinking markers */
    thinkingMarkerProbability: number;
    /** Energy ceiling (caps enthusiasm) */
    energyCeiling: number;
    /** Should add fatigue expression? */
    addFatigueExpression: boolean;
    /** Fatigue expression if added */
    fatigueExpression: string | null;
}
export interface FatigueConfig {
    /** Time factor: minutes after which fatigue starts */
    fatigueOnsetMinutes: number;
    /** Time factor: minutes at which fatigue plateaus */
    fatiguePlateauMinutes: number;
    /** Turn factor: turns after which fatigue starts */
    fatigueOnsetTurns: number;
    /** Maximum fatigue level (0-1) */
    maxFatigueLevel: number;
    /** Heavy topic fatigue contribution */
    heavyTopicFatigueFactor: number;
    /** Emotional load fatigue contribution */
    emotionalLoadFatigueFactor: number;
    /** Recovery rate per turn of light content */
    recoveryRate: number;
}
/**
 * Events that reduce fatigue
 */
export declare const FATIGUE_RECOVERY_EVENTS: {
    laughter: number;
    topic_change: number;
    user_breakthrough: number;
    positive_emotion: number;
    brief_pause: number;
    user_excitement: number;
    light_topic: number;
};
/**
 * Events that increase fatigue
 */
export declare const FATIGUE_INCREASE_EVENTS: {
    heavy_topic: number;
    long_response: number;
    complex_explanation: number;
    emotional_support: number;
    user_distress: number;
    conflict_navigation: number;
};
export declare class VocalFatigueEngine {
    private state;
    private config;
    private sessionStartTime;
    private lastFatigueExpressionTurn;
    constructor(config?: Partial<FatigueConfig>);
    /**
     * Update fatigue state based on conversation events
     */
    update(context: {
        turnCount: number;
        topicWeight: 'light' | 'medium' | 'heavy';
        userEmotion?: string;
        userEnergy?: 'high' | 'medium' | 'low';
        responseWordCount: number;
        wasEmotionalSupport?: boolean;
    }): void;
    /**
     * Apply a recovery event
     */
    applyRecovery(event: keyof typeof FATIGUE_RECOVERY_EVENTS): void;
    /**
     * Get current fatigue adjustments for TTS
     */
    getAdjustments(): FatigueAdjustments;
    /**
     * Apply fatigue adjustments to SSML
     */
    applyToSsml(ssml: string): string;
    /**
     * Get current fatigue state
     */
    getState(): FatigueState;
    /**
     * Check if fatigue level is significant
     */
    isSignificant(): boolean;
    /**
     * Get fatigue level category
     */
    getFatigueCategory(): 'none' | 'subtle' | 'moderate' | 'pronounced';
    /**
     * Reset for new session
     */
    reset(): void;
    private createInitialState;
    private calculateBaseFatigue;
    private shouldExpressFatigue;
    private chooseFatigueExpression;
    private getFatigueExpressionSsml;
}
export declare function getVocalFatigueEngine(sessionId: string): VocalFatigueEngine;
export declare function resetVocalFatigueEngine(sessionId: string): void;
export declare function resetAllVocalFatigueEngines(): void;
export default VocalFatigueEngine;
//# sourceMappingURL=vocal-fatigue.d.ts.map