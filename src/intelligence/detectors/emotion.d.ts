/**
 * Emotion Detector
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Analyzes text for emotional content to enable empathetic responses.
 * Uses keyword matching, pattern recognition, and linguistic markers.
 *
 * Empathy starts with understanding. Before we can respond with care,
 * we need to truly *hear* what someone is feeling. This module is our
 * emotional awareness - the foundation of genuine connection.
 */
/**
 * Primary emotion categories
 */
export type PrimaryEmotion = 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'disgust' | 'trust' | 'anticipation' | 'anxiety' | 'regret' | 'neutral';
/**
 * Emotional valence (positive/negative/neutral)
 */
export type Valence = 'positive' | 'negative' | 'neutral';
/**
 * Detected emotion with metadata
 */
export interface EmotionResult {
    primary: PrimaryEmotion;
    secondary?: PrimaryEmotion;
    intensity: number;
    valence: Valence;
    distressLevel: number;
    confidence: number;
    markers: string[];
    suggestedTone: 'warm' | 'gentle' | 'enthusiastic' | 'calm' | 'serious' | 'friendly' | 'reassuring' | 'informative' | 'measured';
}
/**
 * Emotion Detector class
 */
export declare class EmotionDetector {
    private emotionHistory;
    /**
     * Detect emotion from text
     */
    detect(text: string): EmotionResult;
    /**
     * Get valence for an emotion
     */
    private getValence;
    /**
     * Get suggested tone based on detected emotion
     */
    private getSuggestedTone;
    /**
     * Get emotional trajectory (how emotions have changed)
     */
    getEmotionalTrajectory(): {
        trend: 'improving' | 'stable' | 'declining' | 'unknown';
        averageDistress: number;
        dominantEmotion: PrimaryEmotion;
    };
    /**
     * Convert valence to numeric score
     */
    private getAverageValenceScore;
    /**
     * Check if user needs emotional support
     */
    needsEmotionalSupport(): boolean;
    /**
     * Clear emotion history
     */
    clearHistory(): void;
    /**
     * Enhance detection with LLM inference for ambiguous cases
     *
     * This is an optional enhancement that:
     * 1. Uses keyword detection first (fast, reliable)
     * 2. Falls back to LLM only when confidence is low
     * 3. Never blocks on LLM failure
     *
     * @param text - The user message to analyze
     * @param llmCall - Optional async function to call LLM
     * @returns Enhanced emotion result with potentially higher confidence
     */
    detectWithLLM(text: string, llmCall?: (prompt: string) => Promise<string>): Promise<EmotionResult>;
    /**
     * Parse valence string to Valence type
     */
    private parseValence;
}
/**
 * Get the default emotion detector
 */
export declare function getEmotionDetector(): EmotionDetector;
/**
 * Quick detect function
 */
export declare function detectEmotion(text: string): EmotionResult;
export default EmotionDetector;
//# sourceMappingURL=emotion.d.ts.map