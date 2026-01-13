/**
 * Emotion Detection Constants
 * Keywords for detecting emotional content to apply SSML emotion tags
 *
 * @module ssml/constants/emotions
 */
/**
 * Keywords mapped to Cartesia-supported emotions
 * Format: keyword → emotion (for easy lookup during detection)
 */
export declare const EMOTION_KEYWORDS: Record<string, string>;
/**
 * Default emotion when no keywords match
 */
export declare const DEFAULT_EMOTION = "neutral";
/**
 * Emotion intensity modifiers
 * Detect these words near emotion keywords to adjust intensity
 */
export declare const INTENSITY_MODIFIERS: {
    high: string[];
    low: string[];
};
//# sourceMappingURL=emotions.d.ts.map