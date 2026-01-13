/**
 * Tool Utility Exports
 *
 * Shared utilities for formatting, ID generation, validation,
 * and common patterns used across tools.
 */
export { bulletList, calculateProgress, camelToTitle, createResponse, formatCurrency, formatDate, formatPercent, formatRelativeTime, formatWithEmoji, generateId, generateUUID, getLogger, getUserData, getUserId, getUserName, isNonEmptyString, isPositiveNumber, numberedList, ordinal, progressBar, titleCase, truncate, type ToolExecutionContext, type ToolResponse, } from '../utils/index.js';
export { TOOL_CHAINS, ToolComposer, createToolComposer, type ComposeOptions, type ComposedResult, type ToolChain, } from '../orchestrator/tool-composer.js';
export { ConversationStateManager, cleanupStaleConversations, endConversation, getActiveSessionIds, getConversationState, hasConversationState, type ConversationState, type EmotionalContext, type FlowContext, type TopicContext, type UserContext, } from '../../services/conversation-state.js';
import { type ComposedResult as _ComposedResult } from '../orchestrator/tool-composer.js';
/** Quick helper to get suggested next tools for a session */
export declare function getNextToolSuggestions(sessionId: string): string[];
/** Quick helper to check if conversation should wrap up */
export declare function checkShouldWrapUp(sessionId: string): {
    should: boolean;
    reasons: string[];
};
/** Quick helper to get emotional context */
export declare function getSessionEmotionalContext(sessionId: string): Readonly<import("../../services/conversation-state.js").EmotionalContext>;
/** One-shot compose: create composer, compose result, return */
export declare function composeToolResult(sessionId: string, toolName: string, result: unknown, options?: {
    userId?: string;
    agentId?: string;
    shareContext?: boolean;
    extractFacts?: boolean;
}): _ComposedResult;
//# sourceMappingURL=utilities.d.ts.map