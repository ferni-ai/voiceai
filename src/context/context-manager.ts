/**
 * Context module public surface.
 *
 * Keep imports stable across the codebase by re-exporting from focused modules.
 */

export { ContextManager } from './context-manager.class.js';
export {
  clearAllContextManagers,
  getContextManager,
  getContextManagerCount,
  hasContextManager,
  removeContextManager,
} from './registry.js';
export { buildSpeechInsightsContext, formatSpeechInsightsForPrompt } from './speech-insights.js';

export type { ContextOptions, PromptContext, SpeechInsightsContext } from './types.js';

export { type ConversationState, type EmotionResult, type PhaseGuidance } from './types.js';

export { ContextManager as default } from './context-manager.class.js';
