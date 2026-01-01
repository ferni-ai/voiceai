/**
 * Generate Reply Gateway
 *
 * SINGLE POINT OF ENTRY for all generateReply calls.
 *
 * This module solves multiple architectural problems:
 * 1. Session readiness - verifies Gemini is ready before accepting calls
 * 2. Consistent error handling - all calls go through same safeguards
 * 3. Queuing - prevents concurrent calls that overwhelm the API
 * 4. Observability - centralized logging for all LLM interactions
 *
 * NEVER call session.generateReply() directly anywhere else!
 * Always use: gateway.generateReply(session, options)
 *
 * @module generate-reply-gateway
 */

import type { voice } from '@livekit/agents';
import { EventEmitter } from 'events';
import { getLogger } from '../../utils/safe-logger.js';
// Speech coordination for fallback TTS
import { coordinatedSay } from '../../speech/coordination/index.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface GatewayOptions {
  instructions: string;
  allowInterruptions?: boolean;
  context?: string;
  priority?: 'high' | 'normal' | 'low';
  /** If true, wait for audio playout. If false, returns after LLM response received */
  waitForPlayout?: boolean;
  /** Fallback message if generateReply fails */
  fallbackMessage?: string;
  /** Timeout in ms (default: 6000) */
  timeoutMs?: number;
}

export interface GatewayResult {
  success: boolean;
  usedFallback: boolean;
  error?: string;
  sessionNotReady?: boolean;
  queuePosition?: number;
  latencyMs?: number;
  /** True if the call was skipped (session not ready, low priority) */
  skipped?: boolean;
  /** True if the call was debounced (too rapid) */
  debounced?: boolean;
}

/** Type alias for external consumers */
export type GenerateReplyOptions = GatewayOptions;
export type GenerateReplyResult = GatewayResult;

interface SessionState {
  isReady: boolean;
  readyAt?: number;
  lastSuccessAt?: number;
  lastCallAt?: number;
  consecutiveFailures: number;
  circuitBreakerOpenedAt?: number; // Track when circuit breaker opened for half-open recovery
  pendingCallCount: number;
  // Statistics
  stats: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    debouncedCalls: number;
    skippedCalls: number;
  };
}

/** Minimum time between generateReply calls to prevent overwhelming the API */
const DEBOUNCE_MS = 500;

/** Time after which circuit breaker enters "half-open" state to allow recovery */
const CIRCUIT_BREAKER_RESET_MS = 10_000;

/** After this many consecutive failures, trigger graceful exit instead of leaving user in silence */
const GRACEFUL_EXIT_THRESHOLD = 5;

// ============================================================================
// ERROR ANALYSIS HELPERS
// ============================================================================

interface GeminiErrorDetails {
  errorType: 'timeout' | 'rate_limit' | 'auth' | 'connection' | 'api' | 'unknown';
  errorCode?: number | string;
  isRetryable: boolean;
  isGeminiDead: boolean;
  httpStatus?: number;
  rawErrorName?: string;
}

/**
 * Extract detailed error information from Gemini API errors.
 *
 * This helps diagnose WHY Gemini failed:
 * - 429 = Rate limit (temporary)
 * - 401/403 = Auth issue (permanent)
 * - ETIMEDOUT = Connection timeout
 * - "generation_created" timeout = Gemini session dead
 */
function extractGeminiErrorDetails(error: unknown): GeminiErrorDetails {
  const details: GeminiErrorDetails = {
    errorType: 'unknown',
    isRetryable: true,
    isGeminiDead: false,
  };

  if (!error) return details;

  const errorStr = String(error);
  const errorObj = error as Record<string, unknown>;

  // Check for Error instance properties
  if (error instanceof Error) {
    details.rawErrorName = error.name;

    // Extract error code if present
    if ('code' in error) {
      details.errorCode = (error as { code: unknown }).code as string | number;
    }
    if ('status' in error) {
      details.httpStatus = (error as { status: unknown }).status as number;
    }
    if ('statusCode' in error) {
      details.httpStatus = (error as { statusCode: unknown }).statusCode as number;
    }
  }

  // Classify error type based on message/code
  if (errorStr.includes('Gateway timeout') || errorStr.includes('Safe timeout')) {
    details.errorType = 'timeout';
    details.isGeminiDead = true; // Our timeout fired, Gemini didn't respond
  } else if (errorStr.includes('generation_created') || errorStr.includes('timed out waiting')) {
    details.errorType = 'timeout';
    details.isGeminiDead = true; // Gemini session is likely dead
  } else if (
    errorStr.includes('429') ||
    errorStr.includes('rate limit') ||
    errorStr.includes('RESOURCE_EXHAUSTED')
  ) {
    details.errorType = 'rate_limit';
    details.errorCode = 429;
    details.isRetryable = true;
  } else if (
    errorStr.includes('401') ||
    errorStr.includes('403') ||
    errorStr.includes('UNAUTHENTICATED') ||
    errorStr.includes('PERMISSION_DENIED')
  ) {
    details.errorType = 'auth';
    details.isRetryable = false; // Auth errors won't self-heal
  } else if (
    errorStr.includes('ETIMEDOUT') ||
    errorStr.includes('ECONNRESET') ||
    errorStr.includes('ENOTFOUND') ||
    errorStr.includes('WebSocket')
  ) {
    details.errorType = 'connection';
    details.isGeminiDead = true;
  } else if (errorStr.includes('500') || errorStr.includes('503') || errorStr.includes('INTERNAL')) {
    details.errorType = 'api';
    details.isRetryable = true;
  }

  // Check nested error objects (some APIs wrap errors)
  if (errorObj.response && typeof errorObj.response === 'object') {
    const response = errorObj.response as Record<string, unknown>;
    if (response.status) {
      details.httpStatus = response.status as number;
    }
    if (response.data && typeof response.data === 'object') {
      const data = response.data as Record<string, unknown>;
      if (data.error && typeof data.error === 'object') {
        const innerError = data.error as Record<string, unknown>;
        if (innerError.code) details.errorCode = innerError.code as string | number;
      }
    }
  }

  return details;
}

/**
 * Trigger a graceful exit when LLM is completely unresponsive.
 *
 * This says goodbye in a warm way and signals the frontend to disconnect,
 * rather than leaving the user in awkward silence.
 */
async function triggerGracefulExit(sessionId: string): Promise<void> {
  // Warm, human goodbye messages (not "I'm experiencing technical difficulties")
  const goodbyeMessages = [
    "Oh, looks like I need to step away for a moment. Talk to you soon!",
    "Hey, I think I need to take a quick break. Catch you in a bit!",
    "Hmm, something's up on my end. Let me reconnect - talk soon!",
    "I should probably step away for a sec. Be right back!",
  ];

  const goodbye = goodbyeMessages[Math.floor(Math.random() * goodbyeMessages.length)];

  log.warn({ sessionId, goodbye: goodbye.slice(0, 50) }, '👋 [GATEWAY] Speaking graceful exit');

  try {
    // Say goodbye using coordinatedSay (doesn't require generateReply)
    await coordinatedSay(sessionId, goodbye, { allowInterruptions: false });

    // Wait a moment for TTS to complete
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Signal frontend to disconnect
    const { sendFrontendSignal } = await import('../../services/frontend-signal.js');
    await sendFrontendSignal('conversation_end', {
      reason: 'graceful_exit_failures',
      disconnectDelay: 500, // Short delay since TTS already played
      timestamp: Date.now(),
    });

    log.info({ sessionId }, '👋 [GATEWAY] Graceful exit complete - frontend notified');
  } catch (err) {
    log.error(
      { error: String(err), sessionId },
      '👋 [GATEWAY] Graceful exit failed - user may be stuck'
    );
  }
}

// ============================================================================
// SESSION STATE TRACKING
// ============================================================================

const sessionStates = new Map<string, SessionState>();
const readinessEmitter = new EventEmitter();

// Track active sessions to detect orphaned operations
const activeSessions = new Set<string>();
const cancelledSessions = new Set<string>();

function getSessionState(sessionId: string): SessionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      isReady: false,
      consecutiveFailures: 0,
      pendingCallCount: 0,
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

/**
 * Check if session is ready to accept generateReply calls.
 */
export function isSessionReady(sessionId: string): boolean {
  const state = sessionStates.get(sessionId);
  return state?.isReady ?? false;
}

/**
 * Reset session state completely (for testing or cleanup).
 */
export function resetSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
  readinessEmitter.removeAllListeners(`ready:${sessionId}`);
  log.debug({ sessionId }, '🧹 [GATEWAY] Session state reset');
}

/**
 * Get gateway statistics for a session.
 */
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

/**
 * Mark a session as ready to accept generateReply calls.
 * Call this after successful prewarm or first successful generateReply.
 */
export function markSessionReady(sessionId: string): void {
  // SAFETY: Don't mark cancelled sessions as ready (prevents orphaned prewarm issues)
  if (cancelledSessions.has(sessionId)) {
    log.warn({ sessionId }, '⚠️ [GATEWAY] Ignoring markSessionReady for cancelled session');
    return;
  }

  const state = getSessionState(sessionId);
  state.isReady = true;
  state.readyAt = Date.now();
  state.consecutiveFailures = 0;

  // Track as active
  activeSessions.add(sessionId);

  log.info({ sessionId }, '✅ [GATEWAY] Session marked as READY');
  readinessEmitter.emit(`ready:${sessionId}`);
}

/**
 * Check if a session is still active (not cancelled).
 * @param sessionId - The session ID to check
 * @returns true if the session is active, false if cancelled
 */
export function isSessionActive(sessionId: string): boolean {
  return !cancelledSessions.has(sessionId);
}

/**
 * Mark a session as not ready (e.g., after connection failure).
 */
export function markSessionNotReady(sessionId: string, reason: string): void {
  const state = getSessionState(sessionId);
  state.isReady = false;

  log.warn({ sessionId, reason }, '⚠️ [GATEWAY] Session marked as NOT READY');
}

/**
 * Wait for session to become ready, with timeout.
 */
export async function waitForSessionReady(sessionId: string, timeoutMs = 20000): Promise<boolean> {
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

/**
 * Clean up session state when session ends.
 * IMPORTANT: This marks the session as cancelled to prevent orphaned prewarm operations.
 */
export function cleanupSessionState(sessionId: string): void {
  // Mark as cancelled BEFORE deleting state
  // This prevents orphaned prewarns from marking dead sessions as ready
  cancelledSessions.add(sessionId);
  activeSessions.delete(sessionId);

  sessionStates.delete(sessionId);
  readinessEmitter.removeAllListeners(`ready:${sessionId}`);

  log.debug({ sessionId }, '🧹 [GATEWAY] Session state cleaned up and marked cancelled');

  // Clean up cancelled sessions set after a delay (prevent memory leak)
  setTimeout(() => {
    cancelledSessions.delete(sessionId);
  }, 60000); // Keep for 60s to catch any late prewarm completions
}

// ============================================================================
// MAIN: Generate Reply Gateway
// ============================================================================

/**
 * Centralized generateReply with all safeguards.
 *
 * @example
 * ```ts
 * const result = await generateReply(session, sessionId, {
 *   instructions: 'Respond naturally',
 *   context: 'silence-handler',
 *   fallbackMessage: "I'm here.",
 * });
 *
 * if (!result.success && result.sessionNotReady) {
 *   // Session not warmed up yet - expected during startup
 * }
 * ```
 */
export async function generateReply(
  session: voice.AgentSession,
  sessionId: string,
  options: GatewayOptions
): Promise<GatewayResult> {
  const {
    instructions,
    allowInterruptions = true,
    context = 'unknown',
    priority = 'normal',
    waitForPlayout = true,
    fallbackMessage,
    timeoutMs = 6000,
  } = options;

  const startTime = Date.now();
  const state = getSessionState(sessionId);
  state.stats.totalCalls++;

  // -------------------------------------------------------------------------
  // SAFEGUARD 0: Debouncing (prevent rapid-fire calls)
  // -------------------------------------------------------------------------
  const timeSinceLastCall = state.lastCallAt ? Date.now() - state.lastCallAt : Infinity;
  if (timeSinceLastCall < DEBOUNCE_MS && priority !== 'high') {
    state.stats.debouncedCalls++;
    log.debug(
      { sessionId, context, timeSinceLastCall, debounceMs: DEBOUNCE_MS },
      '⏸️ [GATEWAY] Debouncing rapid call'
    );
    return {
      success: false,
      usedFallback: false,
      debounced: true,
      error: `Debounced: ${timeSinceLastCall}ms < ${DEBOUNCE_MS}ms`,
      latencyMs: Date.now() - startTime,
    };
  }
  state.lastCallAt = Date.now();

  // -------------------------------------------------------------------------
  // SAFEGUARD 1: Session readiness check
  // -------------------------------------------------------------------------
  if (!state.isReady) {
    log.debug(
      { sessionId, context, isReady: state.isReady },
      '⏳ [GATEWAY] Session not ready - queueing or rejecting'
    );

    // For high priority (e.g., user spoke), wait briefly for readiness
    if (priority === 'high') {
      const ready = await waitForSessionReady(sessionId, 5000);
      if (!ready) {
        log.warn({ sessionId, context }, '❌ [GATEWAY] Session not ready after wait');
        if (fallbackMessage) {
          try {
            coordinatedSay(sessionId, fallbackMessage, { allowInterruptions: true });
          } catch {
            /* ignore */
          }
        }
        return {
          success: false,
          usedFallback: !!fallbackMessage,
          sessionNotReady: true,
          error: 'Session not ready',
          latencyMs: Date.now() - startTime,
        };
      }
    } else {
      // Low/normal priority - skip if not ready
      state.stats.skippedCalls++;
      log.debug({ sessionId, context }, '⏭️ [GATEWAY] Skipping - session not ready');
      return {
        success: false,
        usedFallback: false,
        sessionNotReady: true,
        skipped: true,
        error: 'Session not ready (non-blocking skip)',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // -------------------------------------------------------------------------
  // SAFEGUARD 2: Circuit breaker with half-open recovery
  // -------------------------------------------------------------------------
  if (state.consecutiveFailures >= 3) {
    // Track when circuit breaker first opened
    if (!state.circuitBreakerOpenedAt) {
      state.circuitBreakerOpenedAt = Date.now();
    }

    const timeSinceOpen = Date.now() - state.circuitBreakerOpenedAt;
    const isHalfOpen = timeSinceOpen >= CIRCUIT_BREAKER_RESET_MS;

    if (!isHalfOpen) {
      const timeUntilRetryMs = CIRCUIT_BREAKER_RESET_MS - timeSinceOpen;
      log.debug(
        {
          sessionId,
          context,
          failures: state.consecutiveFailures,
          timeUntilRetryMs,
          retrySec: Math.ceil(timeUntilRetryMs / 1000),
        },
        `⚡ [GATEWAY] Circuit breaker OPEN - ${context} paused (auto-resets in ${Math.ceil(timeUntilRetryMs / 1000)}s)`
      );
      if (fallbackMessage) {
        try {
          coordinatedSay(sessionId, fallbackMessage, { allowInterruptions: true });
        } catch {
          /* ignore */
        }
      }
      return {
        success: false,
        usedFallback: !!fallbackMessage,
        error: 'Circuit breaker open',
        latencyMs: Date.now() - startTime,
      };
    }

    // Half-open: Allow ONE test call through
    log.info(
      { sessionId, context, timeSinceOpenMs: timeSinceOpen },
      '🔄 [GATEWAY] Circuit breaker HALF-OPEN - allowing test call'
    );
  }

  // -------------------------------------------------------------------------
  // SAFEGUARD 3: Concurrent call limit
  // -------------------------------------------------------------------------
  if (state.pendingCallCount >= 2) {
    log.warn(
      { sessionId, context, pendingCalls: state.pendingCallCount },
      '🚧 [GATEWAY] Too many pending calls - rejecting'
    );
    return {
      success: false,
      usedFallback: false,
      error: 'Too many pending calls',
      queuePosition: state.pendingCallCount,
      latencyMs: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // EXECUTE: Call generateReply with proper error handling
  // -------------------------------------------------------------------------
  state.pendingCallCount++;

  try {
    log.debug(
      {
        sessionId,
        context,
        instructionChars: instructions.length,
        estimatedTokens: Math.round(instructions.length / 4),
      },
      '🚀 [GATEWAY] Calling generateReply'
    );

    // Create our own timeout (fires before SDK's 15s timeout)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Gateway timeout (${timeoutMs}ms)`));
      }, timeoutMs);
    });

    // The actual generateReply call
    const replyPromise = (async () => {
      const handle = session.generateReply({ instructions, allowInterruptions });

      // CRITICAL: Attach catch handler to prevent unhandled rejection
      // when our timeout wins the race
      handle.waitForPlayout().catch((err: Error) => {
        log.debug(
          { error: err.message, context },
          '🔇 [GATEWAY] Swallowed dangling playout rejection'
        );
      });

      if (waitForPlayout) {
        await handle.waitForPlayout();
      }
    })();

    // Attach catch handler to replyPromise too
    replyPromise.catch((err: Error) => {
      log.debug(
        { error: err.message, context },
        '🔇 [GATEWAY] Swallowed dangling generateReply rejection'
      );
    });

    await Promise.race([replyPromise, timeoutPromise]);

    // SUCCESS! Reset circuit breaker
    const wasCircuitBreakerOpen = state.consecutiveFailures >= 3;
    state.consecutiveFailures = 0;
    state.circuitBreakerOpenedAt = undefined; // Reset circuit breaker timer
    state.lastSuccessAt = Date.now();
    state.stats.successfulCalls++;

    const latencyMs = Date.now() - startTime;
    if (wasCircuitBreakerOpen) {
      log.info(
        { sessionId, context, latencyMs },
        '✅ [GATEWAY] Circuit breaker CLOSED - recovered!'
      );
    } else {
      log.debug({ sessionId, context, latencyMs }, '✅ [GATEWAY] generateReply succeeded');
    }

    return {
      success: true,
      usedFallback: false,
      latencyMs,
    };
  } catch (error) {
    state.stats.failedCalls++;
    state.consecutiveFailures++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const latencyMs = Date.now() - startTime;

    // 🔍 ENHANCED ERROR LOGGING: Extract Gemini-specific error details
    const errorDetails = extractGeminiErrorDetails(error);
    log.error(
      {
        sessionId,
        context,
        error: errorMessage,
        ...errorDetails,
        consecutiveFailures: state.consecutiveFailures,
        latencyMs,
        stackPreview: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      },
      `🚨 [GATEWAY] Gemini error: ${errorDetails.errorType} - ${errorMessage.slice(0, 100)}`
    );

    // 🚨 GRACEFUL EXIT: Too many consecutive failures - Gemini is unrecoverable
    // Rather than leaving user in silence, say goodbye and disconnect
    if (state.consecutiveFailures >= GRACEFUL_EXIT_THRESHOLD) {
      log.error(
        {
          sessionId,
          context,
          consecutiveFailures: state.consecutiveFailures,
          threshold: GRACEFUL_EXIT_THRESHOLD,
        },
        '🚨 [GATEWAY] Too many failures - triggering graceful exit'
      );

      // Fire-and-forget graceful exit (don't block return)
      triggerGracefulExit(sessionId).catch((err) => {
        log.error({ error: String(err) }, 'Graceful exit failed');
      });

      return {
        success: false,
        usedFallback: false,
        error: `Graceful exit triggered after ${state.consecutiveFailures} failures`,
        latencyMs,
      };
    }

    // If we were in half-open state and this call failed, reset the timer
    if (state.circuitBreakerOpenedAt !== undefined && state.consecutiveFailures >= 3) {
      state.circuitBreakerOpenedAt = Date.now(); // Restart the timer
      log.warn(
        { sessionId, context, error: errorMessage, latencyMs },
        '⚡ [GATEWAY] Half-open test call failed - circuit breaker re-OPEN'
      );
    } else {
      log.warn(
        {
          sessionId,
          context,
          error: errorMessage,
          consecutiveFailures: state.consecutiveFailures,
          latencyMs,
        },
        '❌ [GATEWAY] generateReply failed'
      );
    }
    // Use fallback TTS
    if (fallbackMessage) {
      try {
        coordinatedSay(sessionId, fallbackMessage, { allowInterruptions: true });
        return {
          success: false,
          usedFallback: true,
          error: errorMessage,
          latencyMs,
        };
      } catch {
        /* ignore */
      }
    }

    return {
      success: false,
      usedFallback: false,
      error: errorMessage,
      latencyMs,
    };
  } finally {
    state.pendingCallCount--;
  }
}

// ============================================================================
// HELPERS: For specific use cases
// ============================================================================

/**
 * Prewarm the session - marks session as ready on success.
 * SAFETY: Checks for session cancellation to prevent orphaned prewarms.
 *
 * EXPERIMENTAL: Skip actual generateReply call, just mark ready after short delay.
 * The first real user interaction will establish the Gemini connection.
 */
export async function prewarmSession(
  session: voice.AgentSession,
  sessionId: string
): Promise<boolean> {
  const startTime = Date.now();

  // SAFETY CHECK: Don't prewarm cancelled sessions
  if (cancelledSessions.has(sessionId)) {
    log.warn({ sessionId }, '⚠️ [GATEWAY] Prewarm aborted - session already cancelled');
    return false;
  }

  // Determine prewarm mode:
  // SKIP_PREWARM_GENERATEREPLY=false → Full prewarm (calls generateReply to establish connection)
  // SKIP_PREWARM_GENERATEREPLY=true/unset → Quick mode (500ms delay, lazy connection)
  const SKIP_PREWARM_GENERATEREPLY = process.env.SKIP_PREWARM_GENERATEREPLY !== 'false';

  if (SKIP_PREWARM_GENERATEREPLY) {
    log.info({ sessionId }, '🔥 [GATEWAY] Starting session prewarm (QUICK MODE)...');
    // Just wait a minimal delay and mark ready
    // The Gemini connection will be established lazily on first real message
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50); // Was 500ms - reduced for snappier response
    });

    if (cancelledSessions.has(sessionId)) {
      log.warn({ sessionId }, '⚠️ [GATEWAY] Prewarm cancelled during delay');
      return false;
    }

    markSessionReady(sessionId);
    log.info(
      { sessionId, durationMs: Date.now() - startTime },
      '🔥 [GATEWAY] Prewarm complete (QUICK MODE - lazy connection)'
    );
    return true;
  }

  log.info({ sessionId }, '🔥 [GATEWAY] Starting FULL prewarm (establishing Gemini connection)...');

  try {
    // Call generateReply with minimal instruction to establish Gemini WebSocket
    // Reduced timeout from 20s to 5s since this is now synchronous in startup path
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Prewarm timeout (5s)')), 5000);
    });

    const prewarmPromise = (async () => {
      // Check cancellation before starting
      if (cancelledSessions.has(sessionId)) {
        throw new Error('Session cancelled during prewarm');
      }

      const handle = session.generateReply({
        instructions: ' ',
        allowInterruptions: true,
      });

      // Wait for generation_created event (implicit in waitForPlayout)
      await handle.waitForPlayout();
    })();

    // Attach catch handler
    prewarmPromise.catch((err: Error) => {
      log.debug({ error: err.message }, '🔇 [GATEWAY] Swallowed prewarm rejection');
    });

    await Promise.race([prewarmPromise, timeoutPromise]);

    // SAFETY CHECK: Don't mark as ready if session was cancelled during prewarm
    if (cancelledSessions.has(sessionId)) {
      log.warn(
        { sessionId, durationMs: Date.now() - startTime },
        '⚠️ [GATEWAY] Prewarm completed but session was cancelled - not marking ready'
      );
      return false;
    }

    // SUCCESS - Gemini connection is now established
    markSessionReady(sessionId);
    log.info(
      { sessionId, durationMs: Date.now() - startTime },
      '🔥 [GATEWAY] FULL prewarm complete - Gemini connection established'
    );
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    // Don't warn for cancellation - it's expected
    if (errorMsg.includes('cancelled')) {
      log.debug({ sessionId }, '🔇 [GATEWAY] Prewarm cancelled (session ended)');
    } else {
      log.warn({ sessionId, error: errorMsg }, '⚠️ [GATEWAY] Prewarm failed');
    }
    return false;
  }
}

/**
 * Fire-and-forget prewarm (for fast startup).
 * Marks session as ready in background when complete.
 * SAFETY: Won't prewarm cancelled sessions.
 */
export function prewarmSessionAsync(session: voice.AgentSession, sessionId: string): void {
  // SAFETY CHECK: Don't start async prewarm for cancelled sessions
  if (cancelledSessions.has(sessionId)) {
    log.debug({ sessionId }, '🔇 [GATEWAY] Skipping async prewarm - session cancelled');
    return;
  }

  log.info({ sessionId }, '🔥 [GATEWAY] Starting async prewarm...');

  prewarmSession(session, sessionId)
    .then((success) => {
      if (!success && !cancelledSessions.has(sessionId)) {
        // Only warn if session wasn't cancelled
        log.warn({ sessionId }, '⚠️ [GATEWAY] Async prewarm failed - session may be slow');
      }
    })
    .catch((err) => {
      log.debug({ error: String(err) }, '🔇 [GATEWAY] Async prewarm error');
    });
}
