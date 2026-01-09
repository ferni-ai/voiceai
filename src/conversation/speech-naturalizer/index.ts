/**
 * Speech Naturalizer Module
 *
 * Clean architecture refactoring of the speech naturalizer.
 *
 * @module @ferni/conversation/speech-naturalizer
 */

// Types
export type {
  DisfluencyConfig,
  DisfluencyPatterns,
  NaturalizationContext,
  RandomOptions,
  ThinkingPattern,
} from './types.js';

// Patterns
export {
  DEFAULT_DISFLUENCIES,
  getPatternsForPersona,
  HEDGES_BY_STRENGTH,
  PERSONA_DISFLUENCIES,
  TYPE_SPECIFIC_THINKING,
} from './patterns.js';

// Imperfections
export {
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
} from './imperfections.js';

// Engine
export { SpeechNaturalizer, default } from './engine.js';

// ============================================================================
// SINGLETON
// ============================================================================

import { SpeechNaturalizer } from './engine.js';

let naturalizer: SpeechNaturalizer | null = null;

export function getSpeechNaturalizer(): SpeechNaturalizer {
  if (!naturalizer) {
    naturalizer = new SpeechNaturalizer();
  }
  return naturalizer;
}

export function resetSpeechNaturalizer(): void {
  if (naturalizer) {
    naturalizer.reset();
  }
  naturalizer = null;
}
