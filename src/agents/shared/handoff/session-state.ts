/**
 * Handoff Session State Management
 *
 * Manages per-session handoff state including queue and timeout handling.
 * Extracted from handoff-handler.ts for modularity.
 *
 * @module agents/shared/handoff/session-state
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { HandoffEventPayload, HandoffSessionState } from './types.js';

// ============================================================================
// SESSION STATE STORAGE
// ============================================================================

const handoffSessionStates = new Map<string, HandoffSessionState>();

/**
 * Handoff timeout in milliseconds.
 * Set to 8s to align with UI timeout (10s) with 2s buffer.
 * Voice should timeout before UI to ensure consistent error messaging.
 * If handoff fails, we fall back to current voice gracefully.
 */
export const HANDOFF_TIMEOUT_MS = 8000; // 8 seconds (UI is 10s)

/**
 * Maximum pending handoffs in queue
 */
export const MAX_PENDING_HANDOFFS = 10;

/**
 * Alias for consistency with other modules
 * FIX BUG #10: Export both names for backwards compatibility
 */
export const MAX_HANDOFF_QUEUE_SIZE = MAX_PENDING_HANDOFFS;

// ============================================================================
// STATE ACCESSORS
// ============================================================================

/**
 * Get or create handoff session state
 */
export function getHandoffSessionState(sessionId: string): HandoffSessionState {
  let state = handoffSessionStates.get(sessionId);
  if (!state) {
    state = {
      isHandoffInProgress: false,
      pendingHandoffs: [],
      timeoutTimer: null,
      handoffStartTime: null,
      progressInterval: null,
      targetPersonaId: null,
      previousPersonaId: null,
      messageSeq: 0,
    };
    handoffSessionStates.set(sessionId, state);
  }
  return state;
}

/**
 * Get the next message sequence number (atomically increments)
 * Used by handoff messages to allow frontend to detect out-of-order delivery
 *
 * RACE CONDITION FIX: Use a lock to prevent concurrent increments from
 * returning the same sequence number. This is critical for handoff reliability.
 */
const messageSeqLocks = new Map<string, Promise<void>>();

export async function getNextMessageSeq(sessionId: string): Promise<number> {
  // Wait for any pending operation on this session
  const pendingLock = messageSeqLocks.get(sessionId);
  if (pendingLock) {
    await pendingLock;
  }

  // Create a new lock for this operation
  let resolveLock: () => void;
  const lock = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  messageSeqLocks.set(sessionId, lock);

  try {
    const state = getHandoffSessionState(sessionId);
    state.messageSeq += 1;
    return state.messageSeq;
  } finally {
    resolveLock!();
    // Clean up lock if it's still ours
    if (messageSeqLocks.get(sessionId) === lock) {
      messageSeqLocks.delete(sessionId);
    }
  }
}

/**
 * Synchronous version for non-critical paths where async isn't feasible.
 * WARNING: May have race conditions under high concurrency. Prefer async version.
 */
export function getNextMessageSeqSync(sessionId: string): number {
  const state = getHandoffSessionState(sessionId);
  state.messageSeq += 1;
  return state.messageSeq;
}

/**
 * Clear handoff session state - call on session disconnect
 */
export function clearHandoffSessionState(sessionId: string): void {
  const state = handoffSessionStates.get(sessionId);
  if (state?.timeoutTimer) {
    clearTimeout(state.timeoutTimer);
  }
  if (state?.progressInterval) {
    clearInterval(state.progressInterval);
  }
  handoffSessionStates.delete(sessionId);
  getLogger().debug({ sessionId }, 'Handoff session state cleared');
}

// ============================================================================
// HANDOFF QUEUE MANAGEMENT
// ============================================================================

/**
 * Check if a handoff is currently in progress
 */
export function isHandoffInProgress(sessionId: string): boolean {
  const state = handoffSessionStates.get(sessionId);
  return state?.isHandoffInProgress ?? false;
}

/**
 * Progress heartbeat interval in milliseconds
 */
export const PROGRESS_HEARTBEAT_MS = 2000; // 2 seconds

/**
 * Start a handoff - sets in-progress flag and starts timeout
 */
export function startHandoff(
  sessionId: string,
  onTimeout: () => void,
  options?: {
    targetPersonaId?: string;
    previousPersonaId?: string;
  }
): { timeoutTimer: ReturnType<typeof setTimeout> } {
  const state = getHandoffSessionState(sessionId);

  // Clear any existing timeout and interval
  if (state.timeoutTimer) {
    clearTimeout(state.timeoutTimer);
  }
  if (state.progressInterval) {
    clearInterval(state.progressInterval);
  }

  state.isHandoffInProgress = true;
  state.handoffStartTime = Date.now();
  state.targetPersonaId = options?.targetPersonaId ?? null;
  state.previousPersonaId = options?.previousPersonaId ?? null;

  // Set timeout for handoff
  state.timeoutTimer = setTimeout(() => {
    getLogger().warn({ sessionId }, `Handoff timed out after ${HANDOFF_TIMEOUT_MS}ms`);
    completeHandoff(sessionId);
    onTimeout();
  }, HANDOFF_TIMEOUT_MS);

  return { timeoutTimer: state.timeoutTimer };
}

/**
 * Complete a handoff - clears in-progress flag, timeout, and progress heartbeat
 */
export function completeHandoff(sessionId: string): { durationMs: number } {
  const state = handoffSessionStates.get(sessionId);

  let durationMs = 0;
  if (state) {
    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
      state.timeoutTimer = null;
    }

    if (state.progressInterval) {
      clearInterval(state.progressInterval);
      state.progressInterval = null;
    }

    if (state.handoffStartTime) {
      durationMs = Date.now() - state.handoffStartTime;
    }

    state.isHandoffInProgress = false;
    state.handoffStartTime = null;
    state.targetPersonaId = null;
    state.previousPersonaId = null;
  }

  return { durationMs };
}

/**
 * Queue a handoff for later execution
 */
export function queueHandoff(sessionId: string, payload: HandoffEventPayload): boolean {
  const state = getHandoffSessionState(sessionId);

  if (state.pendingHandoffs.length >= MAX_PENDING_HANDOFFS) {
    getLogger().warn(
      { sessionId, queueSize: state.pendingHandoffs.length },
      'Handoff queue full, dropping oldest'
    );
    state.pendingHandoffs.shift(); // Remove oldest
  }

  state.pendingHandoffs.push(payload);
  return true;
}

/**
 * Get next queued handoff
 */
export function dequeueHandoff(sessionId: string): HandoffEventPayload | undefined {
  const state = handoffSessionStates.get(sessionId);
  return state?.pendingHandoffs.shift();
}

/**
 * Check if there are pending handoffs
 */
export function hasPendingHandoffs(sessionId: string): boolean {
  const state = handoffSessionStates.get(sessionId);
  return (state?.pendingHandoffs.length ?? 0) > 0;
}

/**
 * Get pending handoff count
 */
export function getPendingHandoffCount(sessionId: string): number {
  const state = handoffSessionStates.get(sessionId);
  return state?.pendingHandoffs.length ?? 0;
}

/**
 * Clear all pending handoffs
 */
export function clearPendingHandoffs(sessionId: string): number {
  const state = handoffSessionStates.get(sessionId);
  if (!state) return 0;

  const count = state.pendingHandoffs.length;
  state.pendingHandoffs = [];
  return count;
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Get handoff state summary for diagnostics
 */
export function getHandoffStateSummary(sessionId: string): {
  isInProgress: boolean;
  pendingCount: number;
  durationMs: number | null;
  hasTimeout: boolean;
} {
  const state = handoffSessionStates.get(sessionId);

  return {
    isInProgress: state?.isHandoffInProgress ?? false,
    pendingCount: state?.pendingHandoffs.length ?? 0,
    durationMs: state?.handoffStartTime ? Date.now() - state.handoffStartTime : null,
    hasTimeout: state?.timeoutTimer !== null,
  };
}

/**
 * Get all active session IDs with handoffs
 */
export function getActiveHandoffSessions(): string[] {
  const sessions: string[] = [];
  for (const [sessionId, state] of handoffSessionStates) {
    if (state.isHandoffInProgress || state.pendingHandoffs.length > 0) {
      sessions.push(sessionId);
    }
  }
  return sessions;
}

// ============================================================================
// PROGRESS HEARTBEAT
// ============================================================================

/**
 * Progress info sent in heartbeat messages
 */
export interface HandoffProgressInfo {
  elapsedMs: number;
  targetPersonaId: string | null;
  previousPersonaId: string | null;
  timeoutMs: number;
}

/**
 * Start progress heartbeat - sends updates every PROGRESS_HEARTBEAT_MS
 *
 * @param sessionId - The session ID
 * @param onProgress - Callback called with progress info every interval
 * @returns Cleanup function to stop the heartbeat
 */
export function startProgressHeartbeat(
  sessionId: string,
  onProgress: (info: HandoffProgressInfo) => void
): () => void {
  const state = handoffSessionStates.get(sessionId);
  if (!state) {
    return () => {}; // No-op cleanup
  }

  // Clear any existing interval
  if (state.progressInterval) {
    clearInterval(state.progressInterval);
  }

  // Start the heartbeat interval
  state.progressInterval = setInterval(() => {
    const elapsed = state.handoffStartTime ? Date.now() - state.handoffStartTime : 0;

    onProgress({
      elapsedMs: elapsed,
      targetPersonaId: state.targetPersonaId,
      previousPersonaId: state.previousPersonaId,
      timeoutMs: HANDOFF_TIMEOUT_MS,
    });
  }, PROGRESS_HEARTBEAT_MS);

  // Return cleanup function
  return () => {
    if (state.progressInterval) {
      clearInterval(state.progressInterval);
      state.progressInterval = null;
    }
  };
}

/**
 * Stop progress heartbeat for a session
 */
export function stopProgressHeartbeat(sessionId: string): void {
  const state = handoffSessionStates.get(sessionId);
  if (state?.progressInterval) {
    clearInterval(state.progressInterval);
    state.progressInterval = null;
  }
}

/**
 * Get persona info for the current handoff (for rollback messages)
 */
export function getHandoffPersonaInfo(sessionId: string): {
  targetPersonaId: string | null;
  previousPersonaId: string | null;
} {
  const state = handoffSessionStates.get(sessionId);
  return {
    targetPersonaId: state?.targetPersonaId ?? null,
    previousPersonaId: state?.previousPersonaId ?? null,
  };
}
