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

export {
  ConversationStateManager,
  TOOL_CHAINS,
  ToolComposer,
  checkShouldWrapUp,
  cleanupStaleConversations,
  composeToolResult,
  createToolComposer,
  endConversation,
  getActiveSessionIds,
  getConversationState,
  getNextToolSuggestions,
  getSessionEmotionalContext,
  hasConversationState,
  type ComposeOptions,
  type ComposedResult,
  type ConversationState,
  type EmotionalContext,
  type FlowContext,
  type ToolChain,
  type TopicContext,
  type UserContext,
} from '../orchestration/index.js';
