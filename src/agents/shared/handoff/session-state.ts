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
 * Reduced from 10s to 5s for better voice UX - users notice delays > 3s.
 * If handoff fails, we fall back to current voice gracefully.
 */
export const HANDOFF_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Maximum pending handoffs in queue
 */
export const MAX_PENDING_HANDOFFS = 10;

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
    };
    handoffSessionStates.set(sessionId, state);
  }
  return state;
}

/**
 * Clear handoff session state - call on session disconnect
 */
export function clearHandoffSessionState(sessionId: string): void {
  const state = handoffSessionStates.get(sessionId);
  if (state?.timeoutTimer) {
    clearTimeout(state.timeoutTimer);
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
 * Start a handoff - sets in-progress flag and starts timeout
 */
export function startHandoff(
  sessionId: string,
  onTimeout: () => void
): { timeoutTimer: ReturnType<typeof setTimeout> } {
  const state = getHandoffSessionState(sessionId);

  // Clear any existing timeout
  if (state.timeoutTimer) {
    clearTimeout(state.timeoutTimer);
  }

  state.isHandoffInProgress = true;
  state.handoffStartTime = Date.now();

  // Set timeout for handoff
  state.timeoutTimer = setTimeout(() => {
    getLogger().warn({ sessionId }, `Handoff timed out after ${HANDOFF_TIMEOUT_MS}ms`);
    completeHandoff(sessionId);
    onTimeout();
  }, HANDOFF_TIMEOUT_MS);

  return { timeoutTimer: state.timeoutTimer };
}

/**
 * Complete a handoff - clears in-progress flag and timeout
 */
export function completeHandoff(sessionId: string): { durationMs: number } {
  const state = handoffSessionStates.get(sessionId);

  let durationMs = 0;
  if (state) {
    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
      state.timeoutTimer = null;
    }

    if (state.handoffStartTime) {
      durationMs = Date.now() - state.handoffStartTime;
    }

    state.isHandoffInProgress = false;
    state.handoffStartTime = null;
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
