/**
 * Handoff Session State Management
 *
 * @deprecated This module is deprecated. Import from '../../../handoff/index.js' instead.
 *
 * This file now re-exports from the unified handoff module for backward compatibility.
 * All state management has been consolidated into src/handoff/unified-state.ts.
 *
 * Migration guide:
 * ```typescript
 * // Old (deprecated)
 * import { getHandoffSessionState, isHandoffInProgress } from '../agents/shared/handoff/session-state.js';
 *
 * // New (preferred)
 * import { getHandoffQueueState, isHandoffInProgress } from '../handoff/index.js';
 * ```
 *
 * @module agents/shared/handoff/session-state
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { HandoffEventPayload } from './types.js';

// Re-export constants from the unified handoff module
export {
  HANDOFF_TIMEOUT_MS,
  MAX_PENDING_HANDOFFS,
  MAX_HANDOFF_QUEUE_SIZE,
  PROGRESS_HEARTBEAT_INTERVAL_MS as PROGRESS_HEARTBEAT_MS,
} from '../../../handoff/constants.js';

// Re-export state management from the unified handoff module
export {
  // State accessors
  getHandoffQueueState as getHandoffSessionState,
  isHandoffInProgress,
  getCurrentAgent,
  setCurrentAgent,

  // Queue management
  queueHandoff,
  dequeueHandoff,
  setHandoffTimeout,
  setProgressInterval,

  // Message sequencing
  getNextMessageSeq,
  getNextMessageSeqSync,

  // Lifecycle - use unified-state for startHandoff
  markHandoffStarted as startHandoff,
  clearSession as clearHandoffSessionState,
} from '../../../handoff/unified-state.js';

// completeHandoff needs the right signature (returns { durationMs })
export { completeHandoff } from '../../../handoff/actions.js';

const log = getLogger();

// ============================================================================
// ADDITIONAL EXPORTS (not in unified module)
// These functions are specific to this module's interface
// ============================================================================

/**
 * @deprecated Use getHandoffQueueState instead
 */
export function hasPendingHandoffs(sessionId: string): boolean {
  const { getHandoffQueueState } = require('../../../handoff/index.js');
  const state = getHandoffQueueState(sessionId);
  return state.pendingHandoffs.length > 0;
}

/**
 * @deprecated Use getHandoffQueueState instead
 */
export function getPendingHandoffCount(sessionId: string): number {
  const { getHandoffQueueState } = require('../../../handoff/index.js');
  const state = getHandoffQueueState(sessionId);
  return state.pendingHandoffs.length;
}

/**
 * @deprecated Use clearSession + loop instead
 */
export function clearPendingHandoffs(sessionId: string): void {
  log.warn({ sessionId }, 'clearPendingHandoffs is deprecated');
  // Note: In the unified module, clearing session clears everything
  // If you just want to clear pending handoffs, access state directly
}

/**
 * Get handoff state summary for debugging.
 */
export function getHandoffStateSummary(sessionId: string): {
  isInProgress: boolean;
  pendingCount: number;
  targetPersonaId: string | null;
  previousPersonaId: string | null;
  messageSeq: number;
} {
  const { getHandoffQueueState } = require('../../../handoff/index.js');
  const state = getHandoffQueueState(sessionId);
  return {
    isInProgress: state.isHandoffInProgress,
    pendingCount: state.pendingHandoffs.length,
    targetPersonaId: state.targetPersonaId,
    previousPersonaId: state.previousPersonaId,
    messageSeq: state.messageSeq,
  };
}

/**
 * Get all active handoff sessions (for debugging/monitoring).
 */
export function getActiveHandoffSessions(): string[] {
  log.warn('getActiveHandoffSessions is deprecated - use unified handoff module instead');
  // This is no longer easily accessible from the unified module
  // Return empty for backward compatibility
  return [];
}

// ============================================================================
// PROGRESS HEARTBEAT
// These are specific to the old implementation and not in unified module
// ============================================================================

/**
 * @deprecated Progress heartbeat is now managed by the unified module
 */
export function startProgressHeartbeat(
  sessionId: string,
  callback: () => void,
  intervalMs = 2000
): void {
  const { setProgressInterval } = require('../../../handoff/index.js');
  const interval = setInterval(callback, intervalMs);
  setProgressInterval(sessionId, interval);
}

/**
 * @deprecated Use clearSession instead
 */
export function stopProgressHeartbeat(sessionId: string): void {
  // Progress interval is cleared when handoff completes
  log.warn({ sessionId }, 'stopProgressHeartbeat is deprecated');
}

/**
 * Get persona info for handoff (used by progress reporting).
 */
export function getHandoffPersonaInfo(sessionId: string): {
  targetPersonaId: string | null;
  previousPersonaId: string | null;
} {
  const { getHandoffQueueState } = require('../../../handoff/index.js');
  const state = getHandoffQueueState(sessionId);
  return {
    targetPersonaId: state.targetPersonaId,
    previousPersonaId: state.previousPersonaId,
  };
}

/**
 * Progress info type for handoff status reporting.
 */
export interface HandoffProgressInfo {
  isInProgress: boolean;
  targetPersonaId: string | null;
  previousPersonaId: string | null;
  elapsedMs: number | null;
  pendingCount: number;
}
