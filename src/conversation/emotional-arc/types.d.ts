/**
 * Emotional Arc Types
 *
 * Types for emotional trajectory tracking.
 *
 * @module @ferni/conversation/emotional-arc/types
 */
export interface EmotionalSnapshot {
    timestamp: number;
    textEmotion: string;
    textIntensity: number;
    voiceEmotion?: string;
    voiceArousal?: number;
    voiceValence?: number;
    combinedValence: number;
    combinedArousal: number;
}
export interface EmotionalArc {
    currentEmotion: string;
    currentValence: number;
    currentArousal: number;
    trajectory: 'improving' | 'stable' | 'declining' | 'volatile' | 'unknown';
    trajectoryConfidence: number;
    valenceMomentum: number;
    arousalMomentum: number;
    conversationTemperature: number;
    smoothedValence: number;
    smoothedArousal: number;
    turnsSinceEmotionalPeak: number;
    turnsSinceDistress: number;
    needsEmotionalSupport: boolean;
    emotionStabilizing: boolean;
    suddenShiftDetected: boolean;
}
export interface EmotionalResponse {
    suggestedTone: 'match' | 'calm' | 'uplift' | 'celebrate' | 'support';
    speedAdjust: number;
    volumeAdjust: number;
    warmthLevel: 'high' | 'medium' | 'low';
    pauseFrequency: 'more' | 'normal' | 'less';
    guidance: string;
    suggestedEmotion: string;
    suggestedBreaks: boolean;
}
/**
 * Narrative arc phase - the dramatic structure of a conversation
 */
export type NarrativePhase = 'opening' | 'building' | 'peak' | 'release' | 'closing';
/**
 * Cross-session emotional arc summary
 */
export interface CrossSessionArcSummary {
    sessionCount: number;
    lastSessionDate: number;
    emotionalBaseline: {
        valence: number;
        arousal: number;
    };
    emotionalTriggers: Array<{
        topic: string;
        avgValence: number;
        avgArousal: number;
        occurrences: number;
    }>;
    growthTrajectory: 'improving' | 'stable' | 'struggling';
    dominantEmotions: string[];
}
/**
 * Emotion to valence mapping
 */
export declare const EMOTION_VALENCE_MAP: Record<string, number>;
//# sourceMappingURL=types.d.ts.map