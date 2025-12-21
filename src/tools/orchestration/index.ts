/**
 * Tool Orchestration Module
 *
 * @deprecated This module has been consolidated into orchestrator/
 * Import from '../orchestrator/index.js' instead.
 *
 * This file remains for backward compatibility.
 */

// Re-export from consolidated location
export {
  // Main composer
  ToolComposer,
  createToolComposer,

  // Tool chains configuration
  TOOL_CHAINS,

  // Types
  type ComposedResult,
  type ToolChain,
  type ComposeOptions,
} from '../orchestrator/tool-composer.js';

// Re-export conversation state for convenience
export {
  getConversationState,
  hasConversationState,
  endConversation,
  getActiveSessionIds,
  cleanupStaleConversations,
  ConversationStateManager,
  type ConversationState,
  type EmotionalContext,
  type TopicContext,
  type FlowContext,
  type UserContext,
} from '../../services/conversation-state.js';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import { createToolComposer, type ComposedResult } from '../orchestrator/tool-composer.js';
import { getConversationState } from '../../services/conversation-state.js';

/**
 * Quick helper to get suggested next tools for a session
 */
export function getNextToolSuggestions(sessionId: string): string[] {
  const state = getConversationState(sessionId);
  return state.getToolExecutionData().suggestedNextTools;
}

/**
 * Quick helper to check if conversation should wrap up
 */
export function checkShouldWrapUp(sessionId: string): { should: boolean; reasons: string[] } {
  const state = getConversationState(sessionId);
  return {
    should: state.getFlowContext().suggestWrapUp,
    reasons: state.getFlowContext().wrapUpReasons,
  };
}

/**
 * Quick helper to get emotional context
 */
export function getSessionEmotionalContext(sessionId: string) {
  const state = getConversationState(sessionId);
  return state.getEmotionalContext();
}

/**
 * One-shot compose: create composer, compose result, return
 */
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
): ComposedResult {
  const composer = createToolComposer(sessionId, options?.userId, options?.agentId);
  return composer.compose(toolName, result, {
    shareContext: options?.shareContext ?? true,
    extractFacts: options?.extractFacts ?? true,
  });
}
