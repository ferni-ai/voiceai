/**
 * Tool Utility Exports
 *
 * Shared utilities for formatting, ID generation, validation,
 * and common patterns used across tools.
 */

// ============================================================================
// SHARED UTILITIES
// ============================================================================

export {
  bulletList,
  calculateProgress,
  camelToTitle,
  createResponse,
  formatCurrency,
  formatDate,
  formatPercent,
  formatRelativeTime,
  formatWithEmoji,
  generateId,
  generateUUID,
  getLogger,
  getUserData,
  getUserId,
  getUserName,
  isNonEmptyString,
  isPositiveNumber,
  numberedList,
  ordinal,
  progressBar,
  titleCase,
  truncate,
  type ToolExecutionContext,
  type ToolResponse,
} from '../utils/index.js';

// ============================================================================
// TOOL ORCHESTRATION
// ============================================================================

// From orchestrator/ (canonical location)
export {
  TOOL_CHAINS,
  ToolComposer,
  createToolComposer,
  type ComposeOptions,
  type ComposedResult,
  type ToolChain,
} from '../orchestrator/tool-composer.js';

// From services/conversation-state.js (canonical location)
export {
  ConversationStateManager,
  cleanupStaleConversations,
  endConversation,
  getActiveSessionIds,
  getConversationState,
  hasConversationState,
  type ConversationState,
  type EmotionalContext,
  type FlowContext,
  type TopicContext,
  type UserContext,
} from '../../services/conversation-state.js';

// Convenience functions (inlined from deprecated orchestration/)
import { createToolComposer as _createToolComposer, type ComposedResult as _ComposedResult } from '../orchestrator/tool-composer.js';
import { getConversationState as _getConversationState } from '../../services/conversation-state.js';

/** Quick helper to get suggested next tools for a session */
export function getNextToolSuggestions(sessionId: string): string[] {
  const state = _getConversationState(sessionId);
  return state.getToolExecutionData().suggestedNextTools;
}

/** Quick helper to check if conversation should wrap up */
export function checkShouldWrapUp(sessionId: string): { should: boolean; reasons: string[] } {
  const state = _getConversationState(sessionId);
  return {
    should: state.getFlowContext().suggestWrapUp,
    reasons: state.getFlowContext().wrapUpReasons,
  };
}

/** Quick helper to get emotional context */
export function getSessionEmotionalContext(sessionId: string) {
  const state = _getConversationState(sessionId);
  return state.getEmotionalContext();
}

/** One-shot compose: create composer, compose result, return */
export function composeToolResult(
  sessionId: string,
  toolName: string,
  result: unknown,
  options?: {
    userId?: string;
    agentId?: string;
    shareContext?: boolean;
    extractFacts?: boolean;
  }
): _ComposedResult {
  const composer = _createToolComposer(sessionId, options?.userId, options?.agentId);
  return composer.compose(toolName, result, {
    shareContext: options?.shareContext ?? true,
    extractFacts: options?.extractFacts ?? true,
  });
}
