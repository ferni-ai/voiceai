/**
 * Alive Voice Module
 *
 * Makes agents come alive through:
 * 1. Sentence-level emotion arcs - emotions shift mid-sentence based on content
 * 2. Dynamic pause scaling - longer pauses for heavier topics
 * 3. Speed variation - slow for emphasis, fast for asides
 * 4. Pre-response micro-sounds - "Oh!", "Hmm...", "Wow!" openings
 * 5. Persona voice fingerprints - distinct SSML patterns per persona
 * 6. Contextual laughter - knows when a laugh would feel natural
 *
 * Philosophy: Humans don't speak with one emotion. They shift, hesitate,
 * speed up when excited, slow down when serious. This module brings
 * that natural variation to AI speech.
 *
 * @module speech/adaptive-ssml/alive-voice
 */
import type { AliveVoiceContext, AliveVoiceResult } from './types.js';
export type { AliveVoiceContext, AliveVoiceResult, PersonaFingerprint, OpeningSoundOption, EmotionArcPattern, SpeedVariationPattern, PauseScale, TopicWeight, } from './types.js';
export { EMOTION_ARC_PATTERNS, applyEmotionArcs } from './emotion-arcs.js';
export { PAUSE_SCALES, applyDynamicPauses } from './pauses.js';
export { SPEED_VARIATION_PATTERNS, applySpeedVariation } from './speed-variation.js';
export { OPENING_SOUNDS, addOpeningSound } from './opening-sounds.js';
export { PERSONA_FINGERPRINTS, applyPersonaFingerprint } from './persona-fingerprints.js';
export { NONVERBAL_CONFIG, getNonverbal, isNonverbalSupported, type NonverbalType, } from './nonverbals.js';
export { detectContentContext } from './context-detection.js';
/**
 * Apply all alive voice enhancements to text.
 * This is the main entry point that orchestrates all features.
 *
 * @param text - The text to enhance
 * @param context - Context about the conversation
 * @returns Enhanced text with all alive voice features
 */
export declare function makeVoiceAlive(text: string, context?: AliveVoiceContext): AliveVoiceResult;
export default makeVoiceAlive;
//# sourceMappingURL=index.d.ts.map