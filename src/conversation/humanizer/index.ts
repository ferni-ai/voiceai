/**
 * Humanizer Module
 *
 * Clean architecture refactoring of the conversation humanizer.
 * Split into focused modules:
 * - types.ts: Type definitions
 * - utils.ts: Deterministic trigger helper
 * - pre-llm.ts: Pre-LLM processing (context guidance, pre-response actions)
 * - humanizer.ts: Main facade class
 *
 * @module @ferni/conversation/humanizer
 */

// Types
export type { ContextGuidance, HumanizationContext, PreResponseActions } from './types.js';

// Utilities
export { createDeterministicTrigger } from './utils.js';

// Processor
export { PreLlmProcessor } from './pre-llm.js';

// Main class and factory
export {
  ConversationHumanizer,
  getConversationHumanizer,
  resetConversationHumanizer,
  default,
} from './humanizer.js';
