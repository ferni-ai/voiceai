/**
 * Adaptive SSML Tagger
 *
 * Wraps the existing SSML tagger with adaptive parameters based on speech context.
 * Adjusts speed, pauses, laughter, and emotion based on user and conversation state.
 *
 * Now supports persona-aware SSML via the new modular ssml/ system.
 *
 * NOTE: This file is a re-export wrapper for backward compatibility.
 * The implementation has been split into:
 * - ./adaptive-ssml/types.ts - Type definitions
 * - ./adaptive-ssml/adaptation.ts - Core adaptive tagging
 * - ./adaptive-ssml/emotion-adaptation.ts - Emotion matching
 * - ./adaptive-ssml/specialized-taggers.ts - Purpose-specific taggers
 * - ./adaptive-ssml/phase-personality.ts - Phase-specific personality
 * - ./adaptive-ssml/cognitive-ssml.ts - Cognitive-aware SSML
 */
export * from './adaptive-ssml/index.js';
export { default } from './adaptive-ssml/index.js';
//# sourceMappingURL=adaptive-ssml.d.ts.map