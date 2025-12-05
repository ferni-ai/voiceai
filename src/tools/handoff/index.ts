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
export * from './types.js';

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
  getCurrentAgentFrontendId,
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

// Re-export analytics type
export type { HandoffAnalytics } from './types.js';
