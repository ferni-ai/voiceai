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

import { voice } from '@livekit/agents';
import { EventEmitter } from 'events';
import { getLogger } from '../../utils/safe-logger.js';
// Speech coordination for fallback TTS
import { coordinatedSay } from '../../speech/coordination/index.js';
// E2E Latency tracking - diagnose OpenAI vs TTS vs our code
import {
  markLLMRequestSent,
  markLLMFirstToken,
  markLLMComplete,
  markAudioStarted,
} from './e2e-latency-tracker.js';

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
  /** Timeout in ms (default: 4000 - reduced for human-like latency) */
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
  /**
   * Track if there's an active low-priority response (e.g., backchannel).
   * Used to prevent "conversation_already_has_active_response" errors from OpenAI.
   * When a new normal/high priority request comes in, we interrupt the low-priority one first.
   */
  hasActiveLowPriorityResponse: boolean;
  /** Timestamp when low-priority response started (for cleanup) */
  lowPriorityResponseStartedAt?: number;
  /** Timer to clear low-priority response flag after a short window */
  lowPriorityResponseClearTimer?: ReturnType<typeof setTimeout>;
  /** Session reference for interrupting active responses */
  activeSession?: voice.AgentSession;
  // Statistics
  stats: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    debouncedCalls: number;
    skippedCalls: number;
  };
}

/**
 * Minimum time between generateReply calls to prevent overwhelming the API
 * UPDATED Jan 2026: Priority-based debouncing for human-like response times
 * - Normal/high priority: 300ms (was 500ms) - faster for real user messages
 * - Low priority (backchannels): 500ms - keep longer to prevent "mm-hmm" spam
 */
const DEBOUNCE_MS_NORMAL = 300;
const DEBOUNCE_MS_LOW = 500;
/**
 * Keep low-priority response flagged briefly so we can interrupt it before
 * starting a real response. Prevents "conversation_already_has_active_response".
 */
const LOW_PRIORITY_ACTIVE_WINDOW_MS = 4000;

/** Time after which circuit breaker enters "half-open" state to allow recovery */
const CIRCUIT_BREAKER_RESET_MS = 10_000;

/**
 * After this many consecutive failures, trigger graceful exit instead of leaving user in silence.
 * CRITICAL FIX: Reduced from 5 to 3 - user was stuck in silence for 14 min with 4 failures.
 */
const GRACEFUL_EXIT_THRESHOLD = 3;

// ============================================================================
// ERROR ANALYSIS HELPERS
// ============================================================================

interface GeminiErrorDetails {
  errorType:
    | 'timeout'
    | 'rate_limit'
    | 'auth'
    | 'connection'
    | 'api'
    | 'session_draining'
    | 'unknown';
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

  // FIX: Detect "circular wait" error from LiveKit SDK
  // This occurs when trying to call waitForPlayout() after a handoff tool has completed
  // The old session is draining but the SDK still thinks we're in the tool context
  // This is NOT a Gemini error - it's a session lifecycle issue that should be ignored
  if (
    errorStr.includes('waitForPlayout') &&
    (errorStr.includes('circular wait') || errorStr.includes('from inside the function tool'))
  ) {
    details.errorType = 'session_draining' as GeminiErrorDetails['errorType'];
    details.isRetryable = false; // Don't retry - session is closing
    details.isGeminiDead = false; // Gemini is fine, it's the session that's draining
    return details; // Return early - this is expected during handoffs
  }

  // FIX: Detect "AgentSession is not running" error from LiveKit SDK
  // This occurs when participant disconnects but music transitions or other async
  // operations are still trying to generate replies. This is expected and should
  // be handled gracefully without logging as an error.
  if (errorStr.includes('AgentSession is not running')) {
    details.errorType = 'session_draining' as GeminiErrorDetails['errorType'];
    details.isRetryable = false; // Don't retry - session is closed
    details.isGeminiDead = false; // Gemini is fine, it's the session that's closed
    return details; // Return early - this is expected after disconnect
  }

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
  } else if (
    errorStr.includes('500') ||
    errorStr.includes('503') ||
    errorStr.includes('INTERNAL')
  ) {
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

// ============================================================================
// GEMINI RECONNECTION LOGIC
// ============================================================================

/** Track active sessions for reconnection attempts */
const sessionObjects = new Map<string, voice.AgentSession>();

/** Track reconnection attempts to prevent loops */
const reconnectionAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_RECONNECTION_ATTEMPTS = 2;
const RECONNECTION_COOLDOWN_MS = 30_000; // 30s between reconnection attempts

/**
 * Register a session object for potential reconnection.
 * Call this when creating a new session.
 */
export function registerSessionForReconnection(
  sessionId: string,
  session: voice.AgentSession
): void {
  sessionObjects.set(sessionId, session);
}

/**
 * Unregister a session (on cleanup).
 */
export function unregisterSessionForReconnection(sessionId: string): void {
  sessionObjects.delete(sessionId);
  reconnectionAttempts.delete(sessionId);
}

/**
 * Handle Gemini death by attempting reconnection.
 *
 * CRITICAL FIX: This is called when isGeminiDead is detected.
 * Instead of just waiting for circuit breaker, we actively try to reconnect.
 */
async function handleGeminiDeath(sessionId: string): Promise<boolean> {
  const attempts = reconnectionAttempts.get(sessionId) || { count: 0, lastAttempt: 0 };
  const now = Date.now();

  // Check cooldown and attempt limit
  if (attempts.count >= MAX_RECONNECTION_ATTEMPTS) {
    log.warn(
      { sessionId, attempts: attempts.count },
      '💀 [GATEWAY] Max reconnection attempts reached - giving up'
    );
    return false;
  }

  if (now - attempts.lastAttempt < RECONNECTION_COOLDOWN_MS && attempts.count > 0) {
    log.debug(
      { sessionId, cooldownRemainingMs: RECONNECTION_COOLDOWN_MS - (now - attempts.lastAttempt) },
      '💀 [GATEWAY] Reconnection on cooldown'
    );
    return false;
  }

  // Update attempt tracking
  reconnectionAttempts.set(sessionId, { count: attempts.count + 1, lastAttempt: now });

  log.warn(
    { sessionId, attempt: attempts.count + 1 },
    '💀 [GATEWAY] Gemini dead - attempting reconnection...'
  );

  const session = sessionObjects.get(sessionId);
  if (!session) {
    log.error({ sessionId }, '💀 [GATEWAY] No session object for reconnection');
    return false;
  }

  try {
    // Notify user we're reconnecting (use TTS fallback since Gemini is dead)
    // Note: coordinatedSay is fire-and-forget (returns void)
    coordinatedSay(sessionId, 'One moment...', { allowInterruptions: false });

    // Brief delay to let TTS start
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Try a minimal generateReply to re-establish the connection
    // This often works because the SDK will reconnect the WebSocket
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Reconnection timeout')), 8000);
    });

    const reconnectPromise = (async () => {
      const handle = session.generateReply({
        instructions: ' ', // Minimal instruction
        allowInterruptions: true,
      });
      await handle.waitForPlayout();
    })();

    await Promise.race([reconnectPromise, timeoutPromise]);

    // SUCCESS! Reset failure counters
    const state = sessionStates.get(sessionId);
    if (state) {
      state.consecutiveFailures = 0;
      state.circuitBreakerOpenedAt = undefined;
      state.isReady = true;
    }

    log.info({ sessionId }, '✅ [GATEWAY] Gemini reconnection successful!');

    // Notify user we're back
    coordinatedSay(sessionId, "I'm back! What were you saying?", { allowInterruptions: true });

    return true;
  } catch (err) {
    log.error(
      { sessionId, error: String(err), attempt: attempts.count + 1 },
      '💀 [GATEWAY] Gemini reconnection failed'
    );
    return false;
  }
}

/**
 * Trigger a graceful exit when LLM is completely unresponsive.
 *
 * CRITICAL FIX: Now attempts reconnection FIRST before giving up.
 * Only disconnects if reconnection also fails.
 */
async function triggerGracefulExit(sessionId: string): Promise<void> {
  // FIRST: Try to reconnect Gemini
  const reconnected = await handleGeminiDeath(sessionId);
  if (reconnected) {
    log.info({ sessionId }, '🔄 [GATEWAY] Reconnected during graceful exit - continuing session');
    return; // Don't exit!
  }

  // Reconnection failed - proceed with graceful exit
  // Warm, human goodbye messages (not "I'm experiencing technical difficulties")
  const goodbyeMessages = [
    'Oh, looks like I need to step away for a moment. Talk to you soon!',
    'Hey, I think I need to take a quick break. Catch you in a bit!',
    "Hmm, something's up on my end. Let me reconnect - talk soon!",
    'I should probably step away for a sec. Be right back!',
  ];

  const goodbye = goodbyeMessages[Math.floor(Math.random() * goodbyeMessages.length)];

  log.warn({ sessionId, goodbye: goodbye.slice(0, 50) }, '👋 [GATEWAY] Speaking graceful exit');

  try {
    // Say goodbye using coordinatedSay (doesn't require generateReply)
    await coordinatedSay(sessionId, goodbye, { allowInterruptions: false });

    // Wait a moment for TTS to complete
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Signal frontend to disconnect
    const { sendFrontendSignal } = await import('../../services/pubsub/frontend-signal.js');
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

// Increase max listeners to handle concurrent sessions
// Each session adds one listener during prewarm/wait, removed on ready or timeout
// Default is 10 which can cause warnings during high concurrency
readinessEmitter.setMaxListeners(100);

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
      hasActiveLowPriorityResponse: false,
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
 * Clear any pending low-priority response flag for a session.
 * Call this when user starts speaking to ensure we can immediately respond after.
 * This is a backup mechanism - the main interrupt happens in generateReply().
 */
export function clearPendingLowPriorityResponse(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (state?.hasActiveLowPriorityResponse) {
    log.debug(
      {
        sessionId,
        timeSinceStart: state.lowPriorityResponseStartedAt
          ? Date.now() - state.lowPriorityResponseStartedAt
          : 0,
      },
      '🧹 [GATEWAY] Clearing pending low-priority response flag (user speaking)'
    );
    state.hasActiveLowPriorityResponse = false;
    state.lowPriorityResponseStartedAt = undefined;
    if (state.lowPriorityResponseClearTimer) {
      clearTimeout(state.lowPriorityResponseClearTimer);
      state.lowPriorityResponseClearTimer = undefined;
    }

    // Also interrupt the session to cancel any active response
    if (state.activeSession) {
      try {
        state.activeSession.interrupt();
      } catch {
        // Ignore interrupt errors - session might already be done
      }
    }
  }
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

  // Clean up reconnection tracking
  unregisterSessionForReconnection(sessionId);

  log.debug({ sessionId }, '🧹 [GATEWAY] Session state cleaned up and marked cancelled');

  // Clean up cancelled sessions set after a delay (prevent memory leak)
  // Reduced from 60s to 30s - prewarm timeout is 3s, so 30s is more than enough
  // to catch any late completions while not holding memory unnecessarily
  setTimeout(() => {
    cancelledSessions.delete(sessionId);
  }, 30000);
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
    timeoutMs = 4000, // Reduced from 6000 for human-like response latency
  } = options;

  const startTime = Date.now();
  const state = getSessionState(sessionId);
  state.stats.totalCalls++;

  // -------------------------------------------------------------------------
  // SAFEGUARD 0: Debouncing (prevent rapid-fire calls)
  // Priority-based: high skips, normal=300ms, low=500ms
  // -------------------------------------------------------------------------
  const timeSinceLastCall = state.lastCallAt ? Date.now() - state.lastCallAt : Infinity;
  const debounceMs = priority === 'low' ? DEBOUNCE_MS_LOW : DEBOUNCE_MS_NORMAL;
  if (timeSinceLastCall < debounceMs && priority !== 'high') {
    state.stats.debouncedCalls++;
    log.debug(
      { sessionId, context, timeSinceLastCall, debounceMs, priority },
      '⏸️ [GATEWAY] Debouncing rapid call'
    );
    return {
      success: false,
      usedFallback: false,
      debounced: true,
      error: `Debounced: ${timeSinceLastCall}ms < ${debounceMs}ms`,
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
  // SAFEGUARD 4: Interrupt active low-priority response before starting new one
  // Prevents "conversation_already_has_active_response" errors from OpenAI
  // -------------------------------------------------------------------------
  if (state.hasActiveLowPriorityResponse && priority !== 'low') {
    // A backchannel or other low-priority response is still active
    // Interrupt it before starting our new response
    const timeSinceLowPriority = state.lowPriorityResponseStartedAt
      ? Date.now() - state.lowPriorityResponseStartedAt
      : 0;

    log.debug(
      { sessionId, context, priority, timeSinceLowPriority },
      '🛑 [GATEWAY] Interrupting active low-priority response before new request'
    );

    try {
      session.interrupt();
      // Small delay to let OpenAI process the interrupt
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (interruptErr) {
      log.debug(
        { error: String(interruptErr) },
        'Low-priority interrupt failed (non-critical, continuing anyway)'
      );
    }

    // Clear the flag
    state.hasActiveLowPriorityResponse = false;
    state.lowPriorityResponseStartedAt = undefined;
    if (state.lowPriorityResponseClearTimer) {
      clearTimeout(state.lowPriorityResponseClearTimer);
      state.lowPriorityResponseClearTimer = undefined;
    }
  }

  // Store session reference for future interrupts
  state.activeSession = session;

  // -------------------------------------------------------------------------
  // EXECUTE: Call generateReply with proper error handling
  // -------------------------------------------------------------------------
  state.pendingCallCount++;

  // Mark if this is a low-priority response that shouldn't block future calls
  if (priority === 'low' && !waitForPlayout) {
    state.hasActiveLowPriorityResponse = true;
    state.lowPriorityResponseStartedAt = Date.now();
    if (state.lowPriorityResponseClearTimer) {
      clearTimeout(state.lowPriorityResponseClearTimer);
    }
    state.lowPriorityResponseClearTimer = setTimeout(() => {
      const currentState = sessionStates.get(sessionId);
      if (!currentState) return;
      if (!currentState.hasActiveLowPriorityResponse) return;
      currentState.hasActiveLowPriorityResponse = false;
      currentState.lowPriorityResponseStartedAt = undefined;
      currentState.lowPriorityResponseClearTimer = undefined;
      log.debug({ sessionId }, '🧹 [GATEWAY] Cleared low-priority response flag (timeout)');
    }, LOW_PRIORITY_ACTIVE_WINDOW_MS);
  }

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

    // -------------------------------------------------------------------------
    // SPEECH-AWARE TIMEOUT: Don't interrupt while agent is actively speaking
    // -------------------------------------------------------------------------
    // Track if speech has started - we shouldn't cut off mid-sentence
    let speechStarted = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Listen for agent speaking event
    const speakingHandler = (event: { newState: string }) => {
      if (event.newState === 'speaking') {
        speechStarted = true;
      }
    };
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, speakingHandler);

    // Create our own timeout (fires before SDK's 15s timeout)
    // CRITICAL: On timeout, only interrupt if agent hasn't started speaking
    let timeoutTriggered = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        // FIX: Don't interrupt if agent is actively speaking!
        // This prevents cutting off Ferni mid-sentence when audio playout takes longer than timeout
        if (speechStarted) {
          log.debug(
            { sessionId, context, timeoutMs },
            '⏸️ [GATEWAY] Timeout reached but agent is speaking - allowing playout to complete'
          );
          // Don't reject or interrupt - let the playout promise handle completion naturally
          // The Promise.race will wait for replyPromise since we're not rejecting
          return;
        }

        // No speech yet - safe to interrupt and fail fast
        timeoutTriggered = true;
        try {
          session.interrupt();
          log.debug(
            { sessionId, context, timeoutMs },
            '🛑 [GATEWAY] Session interrupted on timeout (no speech started)'
          );
        } catch (interruptErr) {
          log.debug({ error: String(interruptErr) }, 'Session interrupt failed (non-critical)');
        }
        reject(new Error(`Gateway timeout (${timeoutMs}ms)`));
      }, timeoutMs);
    });

    // 📊 E2E LATENCY: Mark LLM request sent
    markLLMRequestSent(sessionId, context);

    // The actual generateReply call
    const replyPromise = (async () => {
      const handle = session.generateReply({ instructions, allowInterruptions });

      // 📊 E2E LATENCY: Mark first token when we start getting a response
      // The SDK fires generation_created event when OpenAI responds
      // For now, we mark it here since we're about to wait for playout
      markLLMFirstToken(sessionId);

      // Only call waitForPlayout when requested
      // CRITICAL: Do NOT call waitForPlayout() at all when waitForPlayout is false
      // because calling it from inside a function tool context creates a circular wait error
      // (the SDK throws even if we just attach a catch handler)
      if (waitForPlayout) {
        // Attach catch handler to prevent unhandled rejection when our timeout wins the race
        handle.waitForPlayout().catch((err: Error) => {
          log.debug(
            { error: err.message, context },
            '🔇 [GATEWAY] Swallowed dangling playout rejection'
          );
        });
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

    try {
      await Promise.race([replyPromise, timeoutPromise]);
    } finally {
      // Clean up event listener and timeout
      session.off(voice.AgentSessionEventTypes.AgentStateChanged, speakingHandler);
      clearTimeout(timeoutId!);
    }

    // 📊 E2E LATENCY: Mark LLM complete and audio started
    markLLMComplete(sessionId);
    if (waitForPlayout) {
      markAudioStarted(sessionId); // Audio played out
    }

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
    // FIX: Don't increment consecutive failures for low-priority requests (e.g., backchannels)
    // This prevents optional operations from opening the circuit breaker
    if (priority !== 'low') {
      state.consecutiveFailures++;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    const latencyMs = Date.now() - startTime;

    // 🔍 ENHANCED ERROR LOGGING: Extract Gemini-specific error details
    const errorDetails = extractGeminiErrorDetails(error);

    // FIX: Session draining errors are expected during handoffs - don't log as errors
    // These occur when the old agent's operations try to run after handoff completes
    if (errorDetails.errorType === 'session_draining') {
      log.debug(
        { sessionId, context, error: errorMessage, latencyMs },
        '🔄 [GATEWAY] Session draining (post-handoff) - skipping gracefully'
      );
      // Reset failure count for this session - it's not a real failure
      state.consecutiveFailures = Math.max(0, state.consecutiveFailures - 1);
      return {
        success: false,
        usedFallback: false,
        error: 'Session draining after handoff',
        latencyMs,
      };
    }

    const logData = {
      sessionId,
      context,
      error: errorMessage,
      ...errorDetails,
      consecutiveFailures: state.consecutiveFailures,
      latencyMs,
      priority,
      stackPreview:
        priority === 'low'
          ? undefined
          : error instanceof Error
            ? error.stack?.slice(0, 500)
            : undefined,
    };
    const logMessage = `${priority === 'low' ? '⏭️' : '🚨'} [GATEWAY] Gemini ${priority === 'low' ? 'low-priority skip' : 'error'}: ${errorDetails.errorType} - ${errorMessage.slice(0, 100)}`;

    // FIX: Use debug level for low-priority failures (backchannels) - they're optional
    if (priority === 'low') {
      log.debug(logData, logMessage);
    } else {
      log.error(logData, logMessage);
    }

    // 🔄 CRITICAL FIX: Proactive reconnection when Gemini dies
    // Don't wait for graceful exit threshold - try to reconnect immediately
    if (errorDetails.isGeminiDead && state.consecutiveFailures >= 2 && priority !== 'low') {
      log.warn(
        { sessionId, context, consecutiveFailures: state.consecutiveFailures },
        '💀 [GATEWAY] Gemini appears dead - attempting proactive reconnection'
      );

      // Fire-and-forget reconnection attempt (don't block this response)
      handleGeminiDeath(sessionId)
        .then((reconnected) => {
          if (reconnected) {
            log.info({ sessionId }, '✅ [GATEWAY] Proactive reconnection succeeded');
          }
        })
        .catch((err) => {
          log.error({ error: String(err) }, 'Proactive reconnection failed');
        });
    }

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

    // Clear low-priority response flag if this was a low-priority call
    // (either completed successfully or failed/timed out)
    if (priority === 'low' && waitForPlayout) {
      state.hasActiveLowPriorityResponse = false;
      state.lowPriorityResponseStartedAt = undefined;
      if (state.lowPriorityResponseClearTimer) {
        clearTimeout(state.lowPriorityResponseClearTimer);
        state.lowPriorityResponseClearTimer = undefined;
      }
    }
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
    // Timeout set to 3s - if Gemini doesn't connect in 3s, use lazy connection
    // This prevents blocking session startup while still attempting early connection
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Prewarm timeout (3s)')), 3000);
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
