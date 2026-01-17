/**
 * Handoff Module
 *
 * Unified exports for the coordinator-based handoff system.
 *
 * @deprecated This module is deprecated. Import from '../../handoff/index.js' instead.
 *
 * The handoff system has been consolidated into a single unified module at:
 * - src/handoff/index.ts (main entry point)
 * - src/handoff/unified-state.ts (state management)
 * - src/handoff/actions.ts (high-level actions)
 * - src/handoff/types.ts (type definitions)
 *
 * @module agents/shared/handoff
 */

// Types
export * from './types.js';

// Re-export from unified handoff module for backward compatibility
export {
  HANDOFF_TIMEOUT_MS,
  MAX_PENDING_HANDOFFS,
  PROGRESS_HEARTBEAT_MS,
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
  // Progress heartbeat
  startProgressHeartbeat,
  stopProgressHeartbeat,
  getHandoffPersonaInfo,
  type HandoffProgressInfo,
  // Message sequencing - use sync version for backward compatibility
  getNextMessageSeq,
  getNextMessageSeqSync,
} from './session-state.js';

// Cached module accessors
export {
  getVoiceManagerCached,
  getMusicPlayerCached,
  getPersonaAsyncCached,
  getBundleFunctionsCached,
  clearCachedModules,
} from './cached-modules.js';

// Coordinator-based handoff system
export {
  CoordinatorAdapter,
  createCoordinatorAdapter,
  getSessionAdapter,
  removeSessionAdapter,
  type CoordinatorAdapterConfig,
  type AdapterHandoffResult,
} from './coordinator-adapter.js';

// NEW: Event handler for voiceSwitch events (drop-in replacement for createHandoffHandler)
export {
  createEventHandler,
  createHandoffEventHandler,
  type EventHandlerConfig,
  type EventHandlerResult,
} from './event-handler.js';
