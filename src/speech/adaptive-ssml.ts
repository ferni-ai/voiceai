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
 * - ./adaptive-ssml/emotion-adaptation.ts - Emotion matching
 */

// Re-export everything from the new module structure
export * from './adaptive-ssml/index.js';
