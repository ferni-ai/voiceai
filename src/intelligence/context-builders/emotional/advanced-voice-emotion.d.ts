/**
 * Advanced Voice Emotion Context Builder
 *
 * Integrates Hume AI for superhuman emotional intelligence from voice.
 * "Better than Human" - detect emotions humans often miss.
 *
 * Superhuman Capabilities:
 * - Distinguish anxiety from sadness from fatigue
 * - Detect suppressed emotions (forcing cheerfulness)
 * - Identify micro-expressions in voice
 * - Track emotional arc through conversation
 *
 * @module intelligence/context-builders/advanced-voice-emotion
 */
import { type ContextBuilder } from '../index.js';
/**
 * Advanced Voice Emotion Context Builder
 *
 * Priority: 25 (early - informs how to approach the conversation)
 */
export declare const advancedVoiceEmotionBuilder: ContextBuilder;
/**
 * Clear session emotional arc on session end
 */
export declare function clearEmotionalArc(sessionId: string): void;
export default advancedVoiceEmotionBuilder;
//# sourceMappingURL=advanced-voice-emotion.d.ts.map