/**
 * Emotion Arcs - Sentence-level Emotion Transitions
 *
 * Detects content shifts and injects appropriate emotion changes mid-sentence.
 * Humans don't speak with one emotion - they shift based on content.
 *
 * Now enhanced to leverage Cartesia Sonic-3's 60+ emotions for richer
 * emotional transitions that feel more nuanced and human.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 * @module speech/adaptive-ssml/alive-voice/emotion-arcs
 */
import type { AliveVoiceContext, EmotionArcPattern } from './types.js';
/**
 * Emotion transition patterns based on content shifts.
 * These patterns detect when emotion should change mid-sentence.
 *
 * Uses nuanced emotions from Cartesia's expanded emotion set:
 * - Primary: neutral, angry, excited, content, sad, scared
 * - Positive: elated, euphoric, triumphant, grateful, affectionate
 * - Reflective: nostalgic, wistful, contemplative, melancholic
 * - Empathetic: sympathetic, caring (→ affectionate), concerned (→ sympathetic)
 * - Confident: proud, confident, determined
 * - Playful: joking, flirtatious, sarcastic
 */
export declare const EMOTION_ARC_PATTERNS: EmotionArcPattern[];
/**
 * Apply sentence-level emotion arcs to text.
 * Detects content shifts and injects appropriate emotion changes.
 */
export declare function applyEmotionArcs(text: string, _context: AliveVoiceContext): string;
//# sourceMappingURL=emotion-arcs.d.ts.map