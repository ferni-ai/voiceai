/**
 * SSML Tag Helpers
 *
 * Helper functions for generating valid Cartesia Sonic-3 SSML tags.
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 *
 * @module ssml/tags
 */
import { type CartesiaEmotion } from './types.js';
/**
 * Clamp speed to Cartesia's valid range (0.6 - 1.5)
 */
export declare function clampSpeed(speed: number): number;
/**
 * Clamp volume to Cartesia's valid range (0.5 - 2.0)
 */
export declare function clampVolume(volume: number): number;
/**
 * Generate SSML speed tag with clamped value
 * @param ratio - Speed ratio (will be clamped to 0.6-1.5)
 */
export declare function speedTag(ratio: number): string;
/**
 * Generate SSML volume tag with clamped value
 * @param ratio - Volume ratio (will be clamped to 0.5-2.0)
 */
export declare function volumeTag(ratio: number): string;
/**
 * Generate SSML break tag
 * @param time - Time in ms or s (e.g., "500ms", "1s", "1.5s")
 */
export declare function breakTag(time: string): string;
/**
 * Generate SSML emotion tag (only for Cartesia-supported emotions)
 * Returns empty string if emotion is not directly supported
 * @param emotion - Emotion value
 */
export declare function emotionTag(emotion: string): string;
/**
 * Generate SSML spell tag for letter-by-letter pronunciation
 * @param text - Text to spell out (typically acronyms)
 */
export declare function spellTag(text: string): string;
/**
 * Map detected emotions to Cartesia-supported emotions
 * Falls back to 'neutral' for unsupported emotions
 */
export declare function mapToCartesiaEmotion(detected: string): CartesiaEmotion;
/**
 * Get contextual emotion based on text content and base emotion
 * Analyzes text for emotional cues and returns appropriate Cartesia emotion
 */
export declare function getContextualEmotion(text: string, baseEmotion: string): CartesiaEmotion;
/**
 * Detect emotion from text using keyword analysis
 * Returns the dominant emotion found in the text
 */
export declare function detectEmotionFromKeywords(text: string): CartesiaEmotion;
//# sourceMappingURL=tags.d.ts.map