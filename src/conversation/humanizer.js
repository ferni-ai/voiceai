/**
 * Humanizer - Conversation Orchestration Layer
 *
 * ⚠️ This file has been refactored for clean architecture.
 * The implementation is now in the humanizer/ directory.
 *
 * This file re-exports everything for backward compatibility.
 *
 * @see humanizer/index.ts for the new module structure
 * @see unified-integration.ts for the new unified POST-LLM API
 *
 * @module @ferni/conversation/humanizer
 */
// Re-export everything from the new module
export { 
// Main class and factory
ConversationHumanizer, getConversationHumanizer, resetConversationHumanizer, default, } from './humanizer/index.js';
//# sourceMappingURL=humanizer.js.map