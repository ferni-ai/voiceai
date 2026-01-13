/**
 * Persona Voice Fingerprints
 *
 * Distinct speaking patterns that make each persona unique:
 * - Base speed and pause multipliers
 * - Default emotions and emotion ranges
 * - Thinking sounds
 * - Special patterns (keywords that trigger pauses/speeds/emotions)
 *
 * @module speech/adaptive-ssml/alive-voice/persona-fingerprints
 */
import type { AliveVoiceContext, PersonaFingerprint } from './types.js';
/**
 * Voice fingerprint profiles for each persona.
 * These create distinct speaking patterns that make each persona unique.
 *
 * NOW UNIFIED: Values come from PERSONA_EMOTION_PROFILES (persona manifests)
 * to ensure consistency between manifests and TTS pipeline.
 */
export declare const PERSONA_FINGERPRINTS: Record<string, PersonaFingerprint>;
/**
 * Apply persona-specific voice fingerprint.
 * Makes each agent sound distinctly themselves.
 *
 * This function applies multiple layers of persona-specific processing:
 * 1. Detailed speech traits (catchphrases, vocabulary, cadence)
 * 2. Basic fingerprint (speed, emotion, special patterns)
 * 3. Contextual modifiers (late night, energy matching, laughter)
 */
export declare function applyPersonaFingerprint(text: string, context: AliveVoiceContext): string;
//# sourceMappingURL=persona-fingerprints.d.ts.map