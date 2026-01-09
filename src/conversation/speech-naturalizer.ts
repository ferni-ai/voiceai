/**
 * Speech Naturalizer
 *
 * ⚠️ This file has been refactored for clean architecture.
 * The implementation is now in the speech-naturalizer/ directory.
 *
 * This file re-exports everything for backward compatibility.
 *
 * @see speech-naturalizer/index.ts for the new module structure
 * @module @ferni/conversation/speech-naturalizer
 */

// Re-export everything from the new module
export {
  // Types
  type DisfluencyConfig,
  type DisfluencyPatterns,
  type NaturalizationContext,
  type RandomOptions,
  type ThinkingPattern,
  // Patterns
  DEFAULT_DISFLUENCIES,
  getPatternsForPersona,
  HEDGES_BY_STRENGTH,
  PERSONA_DISFLUENCIES,
  TYPE_SPECIFIC_THINKING,
  // Imperfections
  applyRandomImperfection,
  DOUBT_TO_CONVICTION,
  generateCourseCorrection,
  generateDoubtToConviction,
  generateFragment,
  generateGracefulUncertainty,
  generateSelfInterruption,
  generateThinkingOutLoud,
  GRACEFUL_UNCERTAINTY,
  MID_THOUGHT_CORRECTIONS,
  SELF_INTERRUPTIONS,
  shouldApplyImperfection,
  THINKING_OUT_LOUD,
  // Engine and singleton
  SpeechNaturalizer,
  getSpeechNaturalizer,
  resetSpeechNaturalizer,
  default,
} from './speech-naturalizer/index.js';
