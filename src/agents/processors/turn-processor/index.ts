/**
 * Turn Processor - Public API
 *
 * Re-exports all public functions and types for backward compatibility.
 * Consumers can import from './turn-processor/index.js' or via '../processors/index.js'.
 */

// Main entry points
export { processTurn } from './process-turn.js';
export { injectTurnContext, getCelebrationEvents } from './inject-context.js';

// Context injection building
export { buildContextInjections } from './context-injections.js';

// Helpers
export { enrichEmotionWithVoice } from './voice-biomarker.js';
export {
  recordTeamHuddleObservation,
  detectDomainRelevantPattern,
  buildConcernObservation,
  buildOpportunityObservation,
  buildPatternObservation,
} from './team-huddle-helpers.js';

// Constants
export { PERSONA_DOMAINS } from './constants.js';

// Local types
export type { ContextInjectionsResult } from './types.js';
