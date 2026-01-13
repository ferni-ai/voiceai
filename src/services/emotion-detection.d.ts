/**
 * Emotion Detection Service
 *
 * Detects user emotions from text to enable emotional mirroring and adaptive responses.
 */
export type EmotionCategory = 'distressed' | 'excited' | 'sad' | 'angry' | 'anxious' | 'happy' | 'frustrated' | 'confused' | 'grateful' | 'neutral';
export type EnergyLevel = 'low' | 'medium' | 'high';
export interface EmotionResult {
    primary: EmotionCategory;
    secondary?: EmotionCategory;
    confidence: number;
    energy: EnergyLevel;
    keywords: string[];
}
/**
 * Detect emotion from user text
 */
export declare function detectEmotion(text: string): EmotionResult;
/**
 * Check if user seems distressed (high priority detection)
 */
export declare function isUserDistressed(text: string): boolean;
/**
 * Check if user seems excited (for matching energy)
 */
export declare function isUserExcited(text: string): boolean;
/**
 * Get appropriate response style based on detected emotion
 */
export declare function getResponseStyle(emotion: EmotionResult): {
    pace: 'slow' | 'normal' | 'fast';
    tone: 'gentle' | 'warm' | 'enthusiastic' | 'supportive';
    pauseMultiplier: number;
};
/**
 * Analyze conversation for emotional patterns over time
 */
export declare function analyzeConversationEmotion(messages: string[]): {
    dominantEmotion: EmotionCategory;
    emotionalArc: 'improving' | 'declining' | 'stable';
    averageEnergy: EnergyLevel;
};
export declare const EmotionDetectionService: {
    detect: typeof detectEmotion;
    isDistressed: typeof isUserDistressed;
    isExcited: typeof isUserExcited;
    getResponseStyle: typeof getResponseStyle;
    analyzeConversation: typeof analyzeConversationEmotion;
};
export default EmotionDetectionService;
//# sourceMappingURL=emotion-detection.d.ts.map