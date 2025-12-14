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
  captureHandoffContext as captureHandoffContextNew,
  clearHandoffHistory as clearHandoffHistoryNew,
  executeHandoff,
  // handoffEvents removed - use the one from state.js exports below
  getCurrentAgent as getCurrentAgentNew,
  getHandoffContext as getHandoffContextNew,
  getHandoffHistory as getHandoffHistoryNew,
  getLastHandoff as getLastHandoffNew,
  isHandoffAllowed as isHandoffAllowedNew,
  isSameAgent as isSameAgentNew,
  resetHandoffState as resetHandoffStateNew,
  setCurrentAgent as setCurrentAgentNew,
  type ExecuteHandoffOptions,
  type HandoffResult,
} from './executor.js';

// Factory - Dynamic tool generation
export {
  buildHandoffTools,
  clearHandoffToolCache,
  createHandoffTools as createHandoffToolDefinitions,
  findHandoffTarget,
  getAgentNameFromToolName,
  getHandoffTool,
  getHandoffToolForAgent,
  getHandoffToolNames,
  getHandoffToolsForAgent,
  isHandoffToolName,
  type BuildHandoffToolsOptions,
  type HandoffToolDefinition,
  type HandoffToolSet,
} from './handoff-factory.js';

// =============================================================================
// NOTE: Phrase exports have been removed
// Agent-specific phrases are now stored in persona manifests
// =============================================================================

// Detection exports
export {
  shouldHandoffToAlex,
  shouldHandoffToFerni,
  shouldHandoffToJordan,
  shouldHandoffToMaya,
  shouldHandoffToNayan,
  shouldHandoffToPeter,
} from './detection.js';

// State management exports (all from state.js - no more legacy re-exports!)
export {
  cameoUnlockEvents,
  // Context
  captureHandoffContext,
  clearHandoffHistory,
  formatHandoffContextForAgent,
  getAgentContext,
  getAgentContextAsync,
  getAgentDisplayName,
  // Current agent state
  getCurrentAgent,
  // Analytics
  getHandoffAnalytics,
  getHandoffContext,
  getHandoffHistory,
  getLastEmotionAnalysis,
  getLastHandoff,
  getLastTopicForPersona,
  getLastTopicsPerPersona,
  getLastUserMessage,
  getMeetingCount,
  getMeetingCounts,
  getMetPersonas,
  getTeamForHandoff,
  // Event emitters
  handoffEvents,
  // Met personas tracking
  hasMetPersona,
  incrementMeetingCount,
  initializeHandoffContext,
  isCurrentAgent,
  isHandoffAllowed,
  isSameAgent,
  logHandoffAnalytics,
  markPersonaAsMet,
  normalizeAgentId,
  // Handoff history
  recordHandoff,
  resetHandoffState,
  resetMetPersonas,
  setCurrentAgent,
  setLastTopicForPersona,
  // Handoff suggestions
  suggestHandoff, // CAMEO UNLOCK: For team member introductions
  // ID utilities
  toCanonicalId,
  // User context functions
  updateUserContextForHandoff,
} from './state.js';

// Tool creation (from factory)
export { createHandoffTools } from './handoff-factory.js';

// Re-export types and utilities
export { createHandoffEvent } from './types.js';
export type { HandoffAnalytics, HandoffEventData } from './types.js';

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
  captureHandoffContext as captureHandoffContextSession,
  exportForPersistence,
  getActiveSessionIds,
  getCurrentAgent as getCurrentAgentSession,
  getLastTopic as getLastTopicSession,
  getMeetingCount as getMeetingCountSession,
  getSessionAnalytics,
  // Session state management
  getSessionState,
  hasMetPersona as hasMetPersonaSession,
  hasSessionState,
  incrementMeetingCount as incrementMeetingCountSession,
  initializeFromPersistent,
  isHandoffAllowed as isHandoffAllowedSession,
  isSameAgent as isSameAgentSession,
  markPersonaAsMet as markPersonaAsMetSession,
  recordHandoff as recordHandoffSession,
  removeSessionState,
  resetSessionState,
  setCurrentAgent as setCurrentAgentSession,
  setLastTopic as setLastTopicSession,
  // Session-scoped operations
  toCanonicalId as toCanonicalIdSession,
  updateUserContext as updateUserContextSession,
  // Type export
  type HandoffSessionState,
} from './session-state.js';
