/**
 * Adaptive SSML Tagger Module
 *
 * Wraps the existing SSML tagger with adaptive parameters based on speech context.
 * Adjusts speed, pauses, laughter, and emotion based on user and conversation state.
 *
 * Now supports persona-aware SSML via the new modular ssml/ system.
 *
 * @module adaptive-ssml
 */

// ============================================================================
// TYPES
// ============================================================================

export type { CognitiveSsmlOptions, PersonalityTagOptions } from './types.js';

// ============================================================================
// CORE ADAPTATION
// ============================================================================

export { tagTextWithSsmlAdaptive } from './adaptation.js';

// ============================================================================
// EMOTION ADAPTATION
// ============================================================================

export { applyEmotionAdaptation } from './emotion-adaptation.js';

// ============================================================================
// SPECIALIZED TAGGERS
// ============================================================================

export {
  tagAdvice,
  tagGreeting,
  tagStory,
  tagSupportResponse,
  tagWrapUp,
} from './specialized-taggers.js';

// ============================================================================
// PHASE-SPECIFIC PERSONALITY
// ============================================================================

export {
  applyPhasePersonality,
  tagAdviceWithPersonality,
  tagGreetingWithPersonality,
  tagSupportWithPersonality,
  tagWrapUpWithPersonality,
} from './phase-personality.js';

// ============================================================================
// COGNITIVE-AWARE SSML
// ============================================================================

export {
  clearCognitiveSpeechState,
  getCognitiveSpeechStats,
  tagTextWithCognitiveSsml,
} from './cognitive-ssml.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  tagTextWithSsmlAdaptive: (await import('./adaptation.js')).tagTextWithSsmlAdaptive,
  tagTextWithCognitiveSsml: (await import('./cognitive-ssml.js')).tagTextWithCognitiveSsml,
  tagGreeting: (await import('./specialized-taggers.js')).tagGreeting,
  tagSupportResponse: (await import('./specialized-taggers.js')).tagSupportResponse,
  tagAdvice: (await import('./specialized-taggers.js')).tagAdvice,
  tagStory: (await import('./specialized-taggers.js')).tagStory,
  tagWrapUp: (await import('./specialized-taggers.js')).tagWrapUp,
  applyPhasePersonality: (await import('./phase-personality.js')).applyPhasePersonality,
  tagGreetingWithPersonality: (await import('./phase-personality.js')).tagGreetingWithPersonality,
  tagSupportWithPersonality: (await import('./phase-personality.js')).tagSupportWithPersonality,
  tagAdviceWithPersonality: (await import('./phase-personality.js')).tagAdviceWithPersonality,
  tagWrapUpWithPersonality: (await import('./phase-personality.js')).tagWrapUpWithPersonality,
};
