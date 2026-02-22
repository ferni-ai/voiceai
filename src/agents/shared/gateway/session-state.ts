/**
 * Session state management for generate-reply gateway.
 * Tracks readiness, latency, and active response state per session.
 *
 * @module gateway/session-state
 */

import { EventEmitter } from 'events';
import { voice } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { coordinatedSay } from '../../../speech/coordination/index.js';
import {
  GATEWAY_BASE_TIMEOUT_MS,
  GATEWAY_MIN_TIMEOUT_MS,
  GATEWAY_MAX_TIMEOUT_MS,
  GATEWAY_TTFB_BUFFER_MS,
  QUICK_ACK_DELAY_MS,
} from '../../../config/timeouts.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface SessionState {
  isReady: boolean;
  readyAt?: number;
  lastSuccessAt?: number;
  lastCallAt?: number;
  consecutiveFailures: number;
  circuitBreakerOpenedAt?: number; // Track when circuit breaker opened for half-open recovery
  pendingCallCount: number;
  /**
   * Track if there's an active low-priority response (e.g., backchannel).
   * Used to prevent "conversation_already_has_active_response" errors from OpenAI.
   * When a new normal/high priority request comes in, we interrupt the low-priority one first.
   */
  hasActiveLowPriorityResponse: boolean;
  /** Timestamp when low-priority response started (for cleanup) */
  lowPriorityResponseStartedAt?: number;
  /** Session reference for interrupting active responses */
  activeSession?: voice.AgentSession;

  // =========================================================================
  // FIX: Track ALL active responses to prevent "conversation_already_has_active_response"
  // =========================================================================
  /** True if ANY response is currently in progress (any priority) */
  hasActiveResponse: boolean;
  /** Timestamp when active response started */
  activeResponseStartedAt?: number;
  /** Context of the active response (for debugging) */
  activeResponseContext?: string;
  /** Timestamp when user last interrupted (for grace period) */
  userInterruptedAt?: number;

  // =========================================================================
  // FIX (Jan 2026): Cooldown after "active_response" errors
  // =========================================================================
  /** Timestamp when last active_response error was received */
  lastActiveResponseErrorAt?: number;
  /** Count of active_response errors in current burst */
  activeResponseErrorCount: number;

  // =========================================================================
  // FIX (Jan 2026): Silence response deduplication
  // =========================================================================
  /** True if a silence response is currently pending */
  pendingSilenceResponse: boolean;
  /** Timestamp when silence response started */
  pendingSilenceResponseAt?: number;

  // =========================================================================
  // BETTER THAN HUMAN: Latency tracking for adaptive timeouts
  // =========================================================================
  /** Recent TTFB values (last 10) for adaptive timeout calculation */
  recentTTFBs: number[];
  /** Average TTFB for this session (rolling) */
  avgTTFB?: number;
  /** Whether quick acknowledgment was sent for current turn */
  quickAckSent: boolean;
  /** Timestamp when current request started (for quick ack timing) */
  currentRequestStartedAt?: number;

  // Statistics
  stats: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    debouncedCalls: number;
    skippedCalls: number;
  };
}

// ============================================================================
// SESSION STATE TRACKING
// ============================================================================

const sessionStates = new Map<string, SessionState>();
export const readinessEmitter = new EventEmitter();

// Increase max listeners to handle concurrent sessions
readinessEmitter.setMaxListeners(100);

// Track active sessions to detect orphaned operations
export const activeSessions = new Set<string>();
export const cancelledSessions = new Set<string>();

/** Number of recent TTFBs to track for averaging */
const TTFB_HISTORY_SIZE = 10;

/**
 * Quick acknowledgment phrases for when LLM is slow.
 * These are human-like filler phrases that buy time.
 */
export const QUICK_ACK_PHRASES = [
  'Mm-hmm...',
  'Let me think...',
  'One moment...',
  'Hmm...',
  "Let's see...",
];

export function getSessionState(sessionId: string): SessionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      isReady: false,
      consecutiveFailures: 0,
      pendingCallCount: 0,
      hasActiveLowPriorityResponse: false,
      hasActiveResponse: false,
      activeResponseErrorCount: 0,
      pendingSilenceResponse: false,
      recentTTFBs: [],
      quickAckSent: false,
      stats: {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        debouncedCalls: 0,
        skippedCalls: 0,
      },
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

/** Get the session states map - used by gateway for direct access when needed */
export function getSessionStatesMap(): Map<string, SessionState> {
  return sessionStates;
}

// ============================================================================
// BETTER THAN HUMAN: Adaptive Timeout & Quick Acknowledgment
// ============================================================================

/**
 * Calculate adaptive timeout based on session's latency history.
 * Uses rolling average of recent TTFBs plus a buffer.
 */
export function getAdaptiveTimeout(state: SessionState): number {
  if (state.recentTTFBs.length < 3) {
    return GATEWAY_BASE_TIMEOUT_MS;
  }

  const avgTTFB = state.avgTTFB || GATEWAY_BASE_TIMEOUT_MS / 2;
  const adaptive = avgTTFB * 2 + GATEWAY_TTFB_BUFFER_MS;
  return Math.max(
    GATEWAY_MIN_TIMEOUT_MS,
    Math.min(GATEWAY_MAX_TIMEOUT_MS, adaptive)
  );
}

/**
 * Record a TTFB measurement and update rolling average.
 */
export function recordTTFB(state: SessionState, ttfb: number): void {
  state.recentTTFBs.push(ttfb);

  while (state.recentTTFBs.length > TTFB_HISTORY_SIZE) {
    state.recentTTFBs.shift();
  }

  if (state.recentTTFBs.length > 0) {
    state.avgTTFB =
      state.recentTTFBs.reduce((a, b) => a + b, 0) / state.recentTTFBs.length;
  }
}

/**
 * Start the quick acknowledgment timer.
 * If LLM doesn't respond in QUICK_ACK_DELAY_MS, send a filler phrase.
 */
export function startQuickAckTimer(
  sessionId: string,
  state: SessionState
): ReturnType<typeof setTimeout> {
  state.currentRequestStartedAt = Date.now();
  state.quickAckSent = false;

  return setTimeout(() => {
    if (!state.quickAckSent && state.currentRequestStartedAt) {
      const elapsed = Date.now() - state.currentRequestStartedAt;
      if (elapsed >= QUICK_ACK_DELAY_MS) {
        state.quickAckSent = true;

        const phrase =
          QUICK_ACK_PHRASES[Math.floor(Math.random() * QUICK_ACK_PHRASES.length)];

        log.debug(
          { sessionId, elapsed, phrase },
          '⏳ [GATEWAY] LLM slow - sending quick acknowledgment'
        );

        coordinatedSay(sessionId, phrase, { allowInterruptions: true });
      }
    }
  }, QUICK_ACK_DELAY_MS);
}

// ============================================================================
// SESSION READINESS
// ============================================================================

export function isSessionReady(sessionId: string): boolean {
  const state = sessionStates.get(sessionId);
  return state?.isReady ?? false;
}

export function markSessionReady(sessionId: string): void {
  if (cancelledSessions.has(sessionId)) {
    log.warn({ sessionId }, '⚠️ [GATEWAY] Ignoring markSessionReady for cancelled session');
    return;
  }

  const state = getSessionState(sessionId);
  state.isReady = true;
  state.readyAt = Date.now();
  state.consecutiveFailures = 0;

  activeSessions.add(sessionId);

  log.info({ sessionId }, '✅ [GATEWAY] Session marked as READY');
  readinessEmitter.emit(`ready:${sessionId}`);
}

export function markSessionNotReady(sessionId: string, reason: string): void {
  const state = getSessionState(sessionId);
  state.isReady = false;

  log.warn({ sessionId, reason }, '⚠️ [GATEWAY] Session marked as NOT READY');
}

export async function waitForSessionReady(
  sessionId: string,
  timeoutMs = 20000
): Promise<boolean> {
  const state = getSessionState(sessionId);

  if (state.isReady) {
    return true;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      readinessEmitter.removeListener(`ready:${sessionId}`, onReady);
      log.warn({ sessionId, timeoutMs }, '⏱️ [GATEWAY] Timed out waiting for session ready');
      resolve(false);
    }, timeoutMs);

    const onReady = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    readinessEmitter.once(`ready:${sessionId}`, onReady);
  });
}

export function isSessionActive(sessionId: string): boolean {
  return !cancelledSessions.has(sessionId);
}

export function resetSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
  readinessEmitter.removeAllListeners(`ready:${sessionId}`);
  log.debug({ sessionId }, '🧹 [GATEWAY] Session state reset');
}

export function getGatewayStats(sessionId: string): SessionState['stats'] {
  const state = sessionStates.get(sessionId);
  return (
    state?.stats ?? {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      debouncedCalls: 0,
      skippedCalls: 0,
    }
  );
}

export function hasActiveResponsePending(sessionId: string): boolean {
  const state = sessionStates.get(sessionId);
  return state?.hasActiveResponse ?? false;
}

export function clearPendingLowPriorityResponse(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (!state) return;

  const hadActiveResponse = state.hasActiveResponse || state.hasActiveLowPriorityResponse;

  if (hadActiveResponse) {
    log.debug(
      {
        sessionId,
        hadLowPriority: state.hasActiveLowPriorityResponse,
        hadActive: state.hasActiveResponse,
        activeContext: state.activeResponseContext,
        timeSinceStart: state.activeResponseStartedAt
          ? Date.now() - state.activeResponseStartedAt
          : state.lowPriorityResponseStartedAt
            ? Date.now() - state.lowPriorityResponseStartedAt
            : 0,
      },
      '🧹 [GATEWAY] User speaking - clearing response flags and marking interruption'
    );

    state.hasActiveLowPriorityResponse = false;
    state.lowPriorityResponseStartedAt = undefined;
    state.hasActiveResponse = false;
    state.activeResponseStartedAt = undefined;
    state.activeResponseContext = undefined;
    state.userInterruptedAt = Date.now();

    if (state.activeSession) {
      try {
        state.activeSession.interrupt();
      } catch {
        // Ignore interrupt errors - session might already be done
      }
    }
  }
}

export function getSessionLatencyStats(sessionId: string): {
  avgTTFB: number | undefined;
  recentTTFBs: number[];
  adaptiveTimeout: number;
} {
  const state = sessionStates.get(sessionId);
  if (!state) {
    return {
      avgTTFB: undefined,
      recentTTFBs: [],
      adaptiveTimeout: GATEWAY_BASE_TIMEOUT_MS,
    };
  }

  return {
    avgTTFB: state.avgTTFB,
    recentTTFBs: [...state.recentTTFBs],
    adaptiveTimeout: getAdaptiveTimeout(state),
  };
}

/**
 * Clean up session state when session ends (state only - caller must also
 * unregister reconnection and cancel speculative execution).
 */
export function cleanupSessionStateInternal(sessionId: string): void {
  cancelledSessions.add(sessionId);
  activeSessions.delete(sessionId);

  sessionStates.delete(sessionId);
  readinessEmitter.removeAllListeners(`ready:${sessionId}`);

  log.debug({ sessionId }, '🧹 [GATEWAY] Session state cleaned up and marked cancelled');

  setTimeout(() => {
    cancelledSessions.delete(sessionId);
  }, 30000);
}
