/**
 * Context Module
 *
 * Manages conversation context for prompt injection and continuity.
 */

export {
  ContextManager,
  getContextManager,
  removeContextManager,
  type ContextOptions,
  type PromptContext,
  type SpeechInsightsContext,
} from './context-manager.js';
