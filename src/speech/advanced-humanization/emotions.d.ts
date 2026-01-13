/**
 * Emotion Mapping for TTS
 *
 * Maps conversational contexts to appropriate Cartesia emotions
 * for natural, context-aware voice synthesis.
 *
 * @module advanced-humanization/emotions
 */
import type { CartesiaEmotion, EmotionContext } from './types.js';
/**
 * Map conversation context to appropriate Cartesia emotion
 *
 * Uses nuanced emotion selection based on:
 * - Agent's intent
 * - User's emotional state
 * - Topic weight
 * - Relationship depth
 *
 * @param context - The emotion context to map
 * @returns The most appropriate Cartesia emotion
 */
export declare function mapContextToEmotion(context: EmotionContext): CartesiaEmotion;
/**
 * Get emotion transition for smoother delivery.
 *
 * Instead of jumping between emotions, we create a transition path
 * with appropriate pauses for more natural-sounding speech.
 *
 * @param fromEmotion - The starting emotion (or null if starting fresh)
 * @param toEmotion - The target emotion
 * @returns Array of emotion transitions with SSML break hints
 */
export declare function getEmotionTransition(fromEmotion: CartesiaEmotion | null, toEmotion: CartesiaEmotion): Array<{
    emotion: CartesiaEmotion;
    breakBefore: string;
}>;
//# sourceMappingURL=emotions.d.ts.map