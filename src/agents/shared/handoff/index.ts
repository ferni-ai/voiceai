/**
 * Handoff Module
 *
 * Unified exports for handoff functionality.
 * The main handler is still in handoff-handler.ts for backward compatibility.
 *
 * @module agents/shared/handoff
 */

// Types
export * from './types.js';

// Session state management
export {
  HANDOFF_TIMEOUT_MS,
  MAX_PENDING_HANDOFFS,
  getHandoffSessionState,
  clearHandoffSessionState,
  isHandoffInProgress,
  startHandoff,
  completeHandoff,
  queueHandoff,
  dequeueHandoff,
  hasPendingHandoffs,
  getPendingHandoffCount,
  clearPendingHandoffs,
  getHandoffStateSummary,
  getActiveHandoffSessions,
} from './session-state.js';

// Cached module accessors
export {
  getVoiceManagerCached,
  getMusicPlayerCached,
  getPersonaAsyncCached,
  getBundleFunctionsCached,
  clearCachedModules,
} from './cached-modules.js';
