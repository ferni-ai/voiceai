/**
 * Meaningful Silence System
 *
 * Re-exports from the original meaningful-silence.ts for backward compatibility.
 * Types and content are now in separate modules for better organization.
 *
 * @module personas/meaningful-silence
 */

// Export types from dedicated types module (single source of truth for types)
export type {
  SilenceContext,
  SilenceResponseType,
  SilenceResponse,
  SilenceResponseWithIntent,
  LLMSilenceInstructions,
  QuestionContext,
  GeneratedQuestion,
} from './types.js';

// Export content constants from dedicated content module
export * from './content.js';

// Re-export functions and classes from the main module (excluding duplicate types)
export {
  getMeaningfulSilenceResponse,
  getMicroStoryAsync,
  getThoughtfulQuestionAsync,
  getMusicOfferingAsync,
  getTimeAwareResponseAsync,
  SilenceHandler,
  extractMemorableMoments,
  mergeMemorableMoments,
  playAmbientMusicDuringSilence,
  stopAmbientMusic,
  getMeaningfulSilenceResponseAsync,
  buildLLMSilenceInstructions,
  buildLLMSilenceInstructionsAsync,
  getLLMSilenceInstructions,
  getLLMSilenceInstructionsAsync,
  preloadSilenceContent,
  clearSilenceContentCache,
  getDynamicThoughtfulQuestion,
  silenceContextToQuestionContext,
  getSilenceContent,
} from '../meaningful-silence.js';
export { default } from '../meaningful-silence.js';

