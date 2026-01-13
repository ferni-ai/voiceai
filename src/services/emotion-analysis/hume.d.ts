/**
 * Voice Emotion Analysis Service
 *
 * Provides superhuman emotion detection from voice audio using Gemini.
 * Distinguishes anxiety from sadness from fatigue with high precision.
 *
 * "Better than human" - detects suppressed emotions, micro-expressions in voice,
 * and emotional trajectories that humans often miss.
 *
 * Originally designed for Hume AI, now uses Gemini multimodal for emotion analysis.
 * Uses existing GOOGLE_API_KEY - no additional API setup required.
 */
export interface HumeEmotionResult {
    /** Primary detected emotion */
    primary: HumeEmotion;
    /** Secondary emotions detected */
    secondary: HumeEmotion[];
    /** Confidence score 0-1 */
    confidence: number;
    /** Suppression indicator - detecting forced/fake emotions */
    suppression: number;
    /** Emotional arousal level (activation) 0-1 */
    arousal: number;
    /** Emotional valence (positive/negative) -1 to 1 */
    valence: number;
    /** Raw scores for all emotions */
    scores: Record<HumeEmotion, number>;
    /** Timestamp of analysis */
    timestamp: number;
}
export type HumeEmotion = 'admiration' | 'adoration' | 'aesthetic_appreciation' | 'amusement' | 'anger' | 'anxiety' | 'awe' | 'awkwardness' | 'boredom' | 'calmness' | 'concentration' | 'confusion' | 'contemplation' | 'contempt' | 'contentment' | 'craving' | 'determination' | 'disappointment' | 'disgust' | 'distress' | 'doubt' | 'ecstasy' | 'embarrassment' | 'empathic_pain' | 'entrancement' | 'envy' | 'excitement' | 'fear' | 'guilt' | 'horror' | 'interest' | 'joy' | 'love' | 'nostalgia' | 'pain' | 'pride' | 'realization' | 'relief' | 'romance' | 'sadness' | 'satisfaction' | 'desire' | 'shame' | 'surprise_negative' | 'surprise_positive' | 'sympathy' | 'tiredness' | 'triumph' | 'neutral';
export interface HumeEmotionTimeline {
    sessionId: string;
    points: HumeEmotionPoint[];
    trajectory: 'improving' | 'declining' | 'stable' | 'volatile';
    dominantEmotion: HumeEmotion;
    averageValence: number;
    averageArousal: number;
}
export interface HumeEmotionPoint {
    timestamp: number;
    emotion: HumeEmotion;
    valence: number;
    arousal: number;
    confidence: number;
}
/**
 * Analyze audio buffer for emotions using Gemini multimodal
 */
export declare function analyzeVoiceEmotion(audioBuffer: ArrayBuffer, sessionId: string): Promise<HumeEmotionResult | null>;
/**
 * Start real-time emotion streaming for a session
 *
 * Note: Gemini doesn't support streaming WebSocket for multimodal.
 * This uses periodic batch analysis instead.
 */
export declare function startEmotionStream(sessionId: string, onEmotion: (result: HumeEmotionResult) => void): Promise<{
    sendAudio: (audio: ArrayBuffer) => void;
    stop: () => void;
}>;
/**
 * Get emotion timeline for a session
 */
export declare function getEmotionTimeline(sessionId: string): HumeEmotionTimeline | null;
/**
 * Get the last emotion analysis for a session
 */
export declare function getLastEmotion(sessionId: string): HumeEmotionResult | null;
/**
 * Clear session state
 */
export declare function clearSession(sessionId: string): void;
/**
 * Detect suppressed emotions - when someone is "forcing" cheerfulness
 */
export declare function detectSuppression(result: HumeEmotionResult): {
    isSuppressing: boolean;
    suppressed: HumeEmotion | null;
    displayed: HumeEmotion;
    confidence: number;
};
/**
 * Distinguish anxiety from sadness from tiredness
 * These are commonly confused by humans
 */
export declare function distinguishNegativeEmotion(result: HumeEmotionResult): {
    emotion: 'anxiety' | 'sadness' | 'tiredness' | 'anger' | 'other';
    confidence: number;
    indicators: string[];
};
/**
 * Generate insight for context builder injection
 */
export declare function generateEmotionInsight(result: HumeEmotionResult): string | null;
declare const _default: {
    analyzeVoiceEmotion: typeof analyzeVoiceEmotion;
    startEmotionStream: typeof startEmotionStream;
    getEmotionTimeline: typeof getEmotionTimeline;
    getLastEmotion: typeof getLastEmotion;
    clearSession: typeof clearSession;
    detectSuppression: typeof detectSuppression;
    distinguishNegativeEmotion: typeof distinguishNegativeEmotion;
    generateEmotionInsight: typeof generateEmotionInsight;
};
export default _default;
//# sourceMappingURL=hume.d.ts.map