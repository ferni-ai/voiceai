/**
 * Humanizer Module
 *
 * Clean architecture refactoring of the conversation humanizer.
 * Split into focused modules:
 * - types.ts: Type definitions
 * - utils.ts: Shared utilities
 * - pre-llm.ts: Pre-LLM processing (context guidance, pre-response actions)
 * - post-llm.ts: Post-LLM processing (humanization, modifications)
 * - humanizer.ts: Main facade class
 *
 * @module @ferni/conversation/humanizer
 */
export type { BetterThanHumanStage, ContextGuidance, HumanizationContext, HumanizationSignals, HumanizedResponse, PreResponseActions, RelationshipStage, TimeOfDay, } from './types.js';
export { COMFORT_LEVELS, RELATIONSHIP_STAGE_MAP } from './types.js';
export { applySsmlEnhancements, createDeterministicTrigger, getComfortLevel, getTimeOfDay, mapRelationshipStage, shouldAddUncertainty, stripSsml, } from './utils.js';
export { PreLlmProcessor } from './pre-llm.js';
export { PostLlmProcessor } from './post-llm.js';
export { ConversationHumanizer, getConversationHumanizer, resetConversationHumanizer, default, } from './humanizer.js';
//# sourceMappingURL=index.d.ts.map