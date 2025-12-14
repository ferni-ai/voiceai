/**
 * Handoff Module
 *
 * Agent handoff system for transitioning between team members.
 *
 * NEW SYSTEM (Agent-Agnostic):
 *   import { buildHandoffTools, executeHandoff } from './handoff/index.js';
 *   const { tools } = await buildHandoffTools('ferni');
 *
 * LEGACY SYSTEM (Deprecated):
 *   import { createHandoffTools } from './handoff/index.js';
 *   const tools = createHandoffTools();
 */

// Type exports
export type * from './types.js';

// =============================================================================
// NEW AGENT-AGNOSTIC SYSTEM
// =============================================================================

// Executor - Generic handoff execution
// NOTE: handoffEvents is no longer exported from executor.js - it's imported from state.js
// This ensures a single shared EventEmitter instance across the entire handoff system
export {
  executeHandoff,
  // handoffEvents removed - use the one from state.js exports below
  getCurrentAgent as getCurrentAgentNew,
  setCurrentAgent as setCurrentAgentNew,
  isSameAgent as isSameAgentNew,
  isHandoffAllowed as isHandoffAllowedNew,
  resetHandoffState as resetHandoffStateNew,
  captureHandoffContext as captureHandoffContextNew,
  getHandoffContext as getHandoffContextNew,
  getHandoffHistory as getHandoffHistoryNew,
  getLastHandoff as getLastHandoffNew,
  clearHandoffHistory as clearHandoffHistoryNew,
  type ExecuteHandoffOptions,
  type HandoffResult,
} from './executor.js';

// Factory - Dynamic tool generation
export {
  buildHandoffTools,
  getHandoffToolsForAgent,
  createHandoffTools as createHandoffToolDefinitions,
  getHandoffTool,
  getHandoffToolForAgent,
  findHandoffTarget,
  getHandoffToolNames,
  clearHandoffToolCache,
  isHandoffToolName,
  getAgentNameFromToolName,
  type HandoffToolDefinition,
  type HandoffToolSet,
  type BuildHandoffToolsOptions,
} from './handoff-factory.js';

// =============================================================================
// NOTE: Phrase exports have been removed
// Agent-specific phrases are now stored in persona manifests
// =============================================================================

// Detection exports
export {
  shouldHandoffToPeter,
  shouldHandoffToAlex,
  shouldHandoffToMaya,
  shouldHandoffToJordan,
  shouldHandoffToFerni,
  shouldHandoffToNayan,
} from './detection.js';

// State management exports (all from state.js - no more legacy re-exports!)
export {
  // Event emitter
  handoffEvents,
  // ID utilities
  toCanonicalId,
  normalizeAgentId,
  isSameAgent,
  isHandoffAllowed,
  // Current agent state
  getCurrentAgent,
  setCurrentAgent,
  isCurrentAgent,
  // Handoff history
  recordHandoff,
  getHandoffHistory,
  getLastHandoff,
  clearHandoffHistory,
  resetHandoffState,
  // Context
  captureHandoffContext,
  getHandoffContext,
  formatHandoffContextForAgent,
  getAgentContext,
  getAgentContextAsync,
  getAgentDisplayName,
  // Met personas tracking
  hasMetPersona,
  markPersonaAsMet,
  resetMetPersonas,
  getMetPersonas,
  // Analytics
  getHandoffAnalytics,
  logHandoffAnalytics,
  // User context functions
  updateUserContextForHandoff,
  getLastUserMessage,
  getLastEmotionAnalysis,
  initializeHandoffContext,
  getMeetingCounts,
  getLastTopicsPerPersona,
  setLastTopicForPersona,
  getLastTopicForPersona,
  incrementMeetingCount,
  getMeetingCount,
  // Handoff suggestions
  suggestHandoff,
  getTeamForHandoff,
} from './state.js';

// Tool creation (from factory)
export { createHandoffTools } from './handoff-factory.js';

// Re-export types and utilities
export type { HandoffAnalytics, HandoffEventData } from './types.js';
export { createHandoffEvent } from './types.js';

// =============================================================================
// SESSION-SCOPED STATE (NEW - Preferred for new code)
// =============================================================================

/**
 * Session-scoped state management for multi-session isolation.
 * Use these functions when you have access to a sessionId.
 *
 * @example
 * import { getSessionState } from './handoff/index.js';
 * const state = getSessionState(sessionId);
 * const agent = state.currentAgent;
 */
export {
  // Session state management
  getSessionState,
  hasSessionState,
  removeSessionState,
  getActiveSessionIds,
  // Session-scoped operations
  toCanonicalId as toCanonicalIdSession,
  isSameAgent as isSameAgentSession,
  isHandoffAllowed as isHandoffAllowedSession,
  getCurrentAgent as getCurrentAgentSession,
  setCurrentAgent as setCurrentAgentSession,
  recordHandoff as recordHandoffSession,
  captureHandoffContext as captureHandoffContextSession,
  hasMetPersona as hasMetPersonaSession,
  markPersonaAsMet as markPersonaAsMetSession,
  updateUserContext as updateUserContextSession,
  incrementMeetingCount as incrementMeetingCountSession,
  getMeetingCount as getMeetingCountSession,
  setLastTopic as setLastTopicSession,
  getLastTopic as getLastTopicSession,
  resetSessionState,
  initializeFromPersistent,
  exportForPersistence,
  getSessionAnalytics,
  // Type export
  type HandoffSessionState,
} from './session-state.js';
