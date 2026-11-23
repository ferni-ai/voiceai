/**
 * Cognitive Intelligence Module
 *
 * > "Each persona should feel distinctly different, not just in personality but in HOW they think."
 *
 * Core Principle #4: Authentic Personality
 *
 * Exports for cognitive differentiation system.
 *
 * @module intelligence/cognitive
 */

// Engine functions
export {
  buildConstraints,
  buildCognitiveContext,
  buildCognitivePromptInjection,
  getPersonaQuestion,
  getInsightLeadIn,
  getDisagreementPhrase,
  clearCognitiveCache,
  warmCognitiveCache,
} from './engine.js';

// Types
export type {
  QuestioningStyle,
  SilenceInterpretation,
  SilenceHandling,
  DisagreementStyle,
  DisagreementApproach,
  InsightFramingStyle,
  InsightFraming,
  ResponsePacing,
  CognitiveProfile,
  CognitiveContext,
  CognitiveConstraints,
  CognitiveContextInput,
} from './types.js';
