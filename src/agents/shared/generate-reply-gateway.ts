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
// BETTER THAN HUMAN: Health monitoring for proactive connection management
import {
  recordSuccessfulRequest,
  recordFailedRequest,
  isConnectionHealthy,
  shouldAttemptReconnection,
} from './openai-health-monitor.js';
// Response Orchestrator - coordinate with SDK state tracking
import { onGenerationStarted, onGenerationComplete } from './response-orchestrator.js';

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
  /** True if call succeeded but LLM returned empty/no-speech response (Jan 2026 fix) */
  noSpeechProduced?: boolean;
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
  // Prevents hammering OpenAI with response.create when one is already active
  // =========================================================================
  /** Timestamp when last active_response error was received */
  lastActiveResponseErrorAt?: number;
  /** Count of active_response errors in current burst */
  activeResponseErrorCount: number;

  // =========================================================================
  // FIX (Jan 2026): Silence response deduplication
  // Prevents multiple silence responses from queueing up when Gemini is slow
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

/**
 * Minimum time between generateReply calls to prevent overwhelming the API
 * UPDATED Jan 2026: Priority-based debouncing for human-like response times
 * - Normal/high priority: 300ms (was 500ms) - faster for real user messages
 * - Low priority (backchannels): 500ms - keep longer to prevent "mm-hmm" spam
 */
const DEBOUNCE_MS_NORMAL = 300;
const DEBOUNCE_MS_LOW = 500;

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

interface LLMErrorDetails {
  errorType:
    | 'timeout'
    | 'rate_limit'
    | 'auth'
    | 'connection'
    | 'api'
    | 'session_draining'
    | 'active_response'
    | 'audio_buffer'
    | 'websocket_stale'
    | 'unknown';
  errorCode?: number | string;
  isRetryable: boolean;
  isLLMDead: boolean;
  httpStatus?: number;
  rawErrorName?: string;
  /** Provider that generated the error (openai or gemini) */
  provider?: 'openai' | 'gemini' | 'unknown';
}

// LLMErrorDetails replaces the old GeminiErrorDetails type
// Now supports both OpenAI and Gemini with provider-specific error detection

/**
 * Extract detailed error information from LLM API errors (OpenAI or Gemini).
 *
 * This helps diagnose WHY the LLM failed:
 * - 429 = Rate limit (temporary)
 * - 401/403 = Auth issue (permanent)
 * - ETIMEDOUT = Connection timeout
 * - "generation_created" timeout = LLM session dead
 * - "conversation_already_has_active_response" = OpenAI race condition
 * - "input_audio_buffer" = OpenAI audio buffer error
 */
function extractLLMErrorDetails(error: unknown): LLMErrorDetails {
  const details: LLMErrorDetails = {
    errorType: 'unknown',
    isRetryable: true,
    isLLMDead: false,
    provider: 'unknown',
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

  // =========================================================================
  // OPENAI-SPECIFIC ERRORS (check first - more specific patterns)
  // =========================================================================

  // OpenAI: "conversation_already_has_active_response" - race condition
  // This happens when we try to generate while another response is in progress
  if (errorStr.includes('conversation_already_has_active_response')) {
    details.errorType = 'active_response';
    details.provider = 'openai';
    details.isRetryable = true; // Retry after interrupt + delay
    details.isLLMDead = false;
    return details;
  }

  // OpenAI: Audio buffer errors
  if (
    errorStr.includes('input_audio_buffer') ||
    errorStr.includes('audio_buffer_append') ||
    errorStr.includes('invalid_audio')
  ) {
    details.errorType = 'audio_buffer';
    details.provider = 'openai';
    details.isRetryable = true;
    details.isLLMDead = false;
    return details;
  }

  // OpenAI: WebSocket connection stale/closed
  if (
    errorStr.includes('WebSocket is not open') ||
    errorStr.includes('WebSocket connection') ||
    errorStr.includes('connection closed unexpectedly')
  ) {
    details.errorType = 'websocket_stale';
    details.provider = 'openai';
    details.isRetryable = false; // Need full reconnection
    details.isLLMDead = true;
    return details;
  }

  // OpenAI-specific rate limit format
  if (errorStr.includes('rate_limit_exceeded') || errorStr.includes('RateLimitError')) {
    details.errorType = 'rate_limit';
    details.provider = 'openai';
    details.errorCode = 429;
    details.isRetryable = true;
    details.isLLMDead = false;
    return details;
  }

  // =========================================================================
  // LIVEKIT SDK / SESSION ERRORS
  // =========================================================================

  // FIX: Detect "circular wait" error from LiveKit SDK
  // This occurs when trying to call waitForPlayout() after a handoff tool has completed
  if (
    errorStr.includes('waitForPlayout') &&
    (errorStr.includes('circular wait') || errorStr.includes('from inside the function tool'))
  ) {
    details.errorType = 'session_draining';
    details.isRetryable = false;
    details.isLLMDead = false;
    return details;
  }

  // FIX: Detect "AgentSession is not running" error from LiveKit SDK
  if (errorStr.includes('AgentSession is not running')) {
    details.errorType = 'session_draining';
    details.isRetryable = false;
    details.isLLMDead = false;
    return details;
  }

  // =========================================================================
  // GENERIC LLM ERRORS (both OpenAI and Gemini)
  // =========================================================================

  if (errorStr.includes('Gateway timeout') || errorStr.includes('Safe timeout')) {
    details.errorType = 'timeout';
    details.isLLMDead = true;
  } else if (errorStr.includes('generation_created') || errorStr.includes('timed out waiting')) {
    details.errorType = 'timeout';
    details.isLLMDead = true;
    details.provider = 'gemini'; // This is a Gemini-specific message
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
    details.isRetryable = false;
  } else if (
    errorStr.includes('ETIMEDOUT') ||
    errorStr.includes('ECONNRESET') ||
    errorStr.includes('ENOTFOUND') ||
    errorStr.includes('WebSocket')
  ) {
    details.errorType = 'connection';
    details.isLLMDead = true;
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

// extractLLMErrorDetails replaces the old extractGeminiErrorDetails function
// The new function handles both OpenAI and Gemini errors with provider detection

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
 * Generate a reply using only sessionId (looks up session from registry).
 *
 * This is a convenience function that matches the `coordinatedSay(sessionId, ...)` pattern.
 * Use this when you only have sessionId available (e.g., in turn-handler).
 *
 * @param sessionId - The session ID to generate reply for
 * @param options - Gateway options (instructions, fallback, etc.)
 * @returns GatewayResult with success/failure info
 *
 * @example
 * ```ts
 * // Instead of needing the full session:
 * await generateReplyBySessionId(sessionId, {
 *   instructions: 'Tool executed: playMusic. Acknowledge briefly.',
 *   context: 'ftis-tool-response',
 *   fallbackMessage: 'Done!',
 * });
 * ```
 */
export async function generateReplyBySessionId(
  sessionId: string,
  options: GatewayOptions
): Promise<GatewayResult> {
  const session = sessionObjects.get(sessionId);

  if (!session) {
    log.warn(
      { sessionId, context: options.context },
      '⚠️ [GATEWAY] generateReplyBySessionId: Session not found in registry'
    );

    // Fall back to speaking directly via coordinatedSay if fallback provided
    if (options.fallbackMessage) {
      try {
        coordinatedSay(sessionId, options.fallbackMessage, { allowInterruptions: true });
        return {
          success: false,
          usedFallback: true,
          error: 'Session not in registry',
        };
      } catch {
        // Ignore coordinatedSay errors
      }
    }

    return {
      success: false,
      usedFallback: false,
      error: 'Session not found in registry',
    };
  }

  return generateReply(session, sessionId, options);
}

/**
 * Handle Gemini death by attempting reconnection.
 *
 * CRITICAL FIX: This is called when isLLMDead is detected.
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

// ============================================================================
// BETTER THAN HUMAN: Adaptive Timeout & Quick Acknowledgment
// ============================================================================

/** Base timeout - used when we have no latency data yet */
const BASE_TIMEOUT_MS = 4000;
/** Minimum timeout - never go below this */
const MIN_TIMEOUT_MS = 2500;
/** Maximum timeout - never exceed this */
const MAX_TIMEOUT_MS = 8000;
/**
 * Timeout for tool response calls - needs more time because Gemini must:
 * 1. Parse the tool result
 * 2. Generate a contextually appropriate response
 * 3. Start streaming speech
 * Tool calls are fundamentally different from normal conversational turns.
 */
export const TOOL_RESPONSE_TIMEOUT_MS = 10000;
/** Time before sending quick acknowledgment (ms) */
const QUICK_ACK_DELAY_MS = 1200;
/** Number of recent TTFBs to track for averaging */
const TTFB_HISTORY_SIZE = 10;

/**
 * Quick acknowledgment phrases for when LLM is slow.
 * These are human-like filler phrases that buy time.
 */
const QUICK_ACK_PHRASES = [
  'Mm-hmm...',
  'Let me think...',
  'One moment...',
  'Hmm...',
  "Let's see...",
];

/**
 * Calculate adaptive timeout based on session's latency history.
 * Uses rolling average of recent TTFBs plus a buffer.
 */
function getAdaptiveTimeout(state: SessionState): number {
  if (state.recentTTFBs.length < 3) {
    // Not enough data - use base timeout
    return BASE_TIMEOUT_MS;
  }

  const avgTTFB = state.avgTTFB || BASE_TIMEOUT_MS / 2;

  // Timeout = 2x average TTFB + 500ms buffer (for TTS + processing)
  const adaptive = avgTTFB * 2 + 500;

  // Clamp to min/max range
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, adaptive));
}

/**
 * Record a TTFB measurement and update rolling average.
 */
function recordTTFB(state: SessionState, ttfb: number): void {
  state.recentTTFBs.push(ttfb);

  // Keep only the most recent measurements
  while (state.recentTTFBs.length > TTFB_HISTORY_SIZE) {
    state.recentTTFBs.shift();
  }

  // Update rolling average
  if (state.recentTTFBs.length > 0) {
    state.avgTTFB = state.recentTTFBs.reduce((a, b) => a + b, 0) / state.recentTTFBs.length;
  }
}

/**
 * Start the quick acknowledgment timer.
 * If LLM doesn't respond in QUICK_ACK_DELAY_MS, send a filler phrase.
 */
function startQuickAckTimer(sessionId: string, state: SessionState): ReturnType<typeof setTimeout> {
  state.currentRequestStartedAt = Date.now();
  state.quickAckSent = false;

  return setTimeout(() => {
    // Only send if we haven't gotten a response yet and haven't sent one already
    if (!state.quickAckSent && state.currentRequestStartedAt) {
      const elapsed = Date.now() - state.currentRequestStartedAt;
      if (elapsed >= QUICK_ACK_DELAY_MS) {
        state.quickAckSent = true;

        // Pick a random acknowledgment phrase
        const phrase = QUICK_ACK_PHRASES[Math.floor(Math.random() * QUICK_ACK_PHRASES.length)];

        log.debug(
          { sessionId, elapsed, phrase },
          '⏳ [GATEWAY] LLM slow - sending quick acknowledgment'
        );

        // Fire-and-forget TTS (don't await)
        coordinatedSay(sessionId, phrase, { allowInterruptions: true });
      }
    }
  }, QUICK_ACK_DELAY_MS);
}

/**
 * Get latency statistics for a session (for observability).
 */
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
      adaptiveTimeout: BASE_TIMEOUT_MS,
    };
  }

  return {
    avgTTFB: state.avgTTFB,
    recentTTFBs: [...state.recentTTFBs],
    adaptiveTimeout: getAdaptiveTimeout(state),
  };
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
 * Check if there's an active response being generated/played for this session.
 *
 * CRITICAL FIX: This helps prevent duplicate responses when:
 * 1. generateReply is called
 * 2. Response is streaming (TTS generating)
 * 3. BUT LiveKit's AgentStateChanged event hasn't fired yet
 * 4. So conversationManager.isAgentSpeaking() returns false
 * 5. Proactive response system fires ANOTHER generateReply
 *
 * Use this + isAgentSpeaking() to accurately detect if agent is responding.
 */
export function hasActiveResponsePending(sessionId: string): boolean {
  const state = sessionStates.get(sessionId);
  return state?.hasActiveResponse ?? false;
}

/**
 * Clear any pending response flags and mark user interruption for a session.
 * Call this when user starts speaking to ensure we can immediately respond after.
 * This is called from session-state-handler when user starts speaking.
 *
 * FIX: Now tracks user interruption time for grace period handling in generateReply.
 */
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

    // Clear all response flags
    state.hasActiveLowPriorityResponse = false;
    state.lowPriorityResponseStartedAt = undefined;
    state.hasActiveResponse = false;
    state.activeResponseStartedAt = undefined;
    state.activeResponseContext = undefined;

    // Mark user interruption time for grace period handling
    // This prevents new responses from being created too quickly after interruption
    state.userInterruptedAt = Date.now();

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
  // SAFEGUARD 0.5: Active response error cooldown (FIX Jan 2026)
  // After receiving "conversation_already_has_active_response" errors,
  // enforce a cooldown to prevent hammering OpenAI with 17+ rapid requests.
  // -------------------------------------------------------------------------
  const ACTIVE_RESPONSE_COOLDOWN_MS = 500; // 500ms cooldown after error
  const timeSinceActiveResponseError = state.lastActiveResponseErrorAt
    ? Date.now() - state.lastActiveResponseErrorAt
    : Infinity;

  if (timeSinceActiveResponseError < ACTIVE_RESPONSE_COOLDOWN_MS) {
    // During cooldown - only allow high priority requests (user spoke)
    if (priority !== 'high') {
      state.stats.debouncedCalls++;
      log.debug(
        {
          sessionId,
          context,
          priority,
          timeSinceError: timeSinceActiveResponseError,
          errorCount: state.activeResponseErrorCount,
        },
        '🛑 [GATEWAY] Blocked during active_response cooldown'
      );
      return {
        success: false,
        usedFallback: false,
        debounced: true,
        error: `Active response cooldown: ${timeSinceActiveResponseError}ms < ${ACTIVE_RESPONSE_COOLDOWN_MS}ms`,
        latencyMs: Date.now() - startTime,
      };
    }
  } else {
    // Cooldown expired - reset error count
    if (state.activeResponseErrorCount > 0) {
      log.debug(
        { sessionId, previousErrorCount: state.activeResponseErrorCount },
        '✅ [GATEWAY] Active response cooldown expired, resetting error count'
      );
      state.activeResponseErrorCount = 0;
    }
  }

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
  // SAFEGUARD 1.5: Connection health check (Better Than Human)
  // -------------------------------------------------------------------------
  if (!isConnectionHealthy(sessionId) && priority === 'high') {
    log.warn(
      { sessionId, context },
      '🏥 [GATEWAY] Connection unhealthy - will attempt request anyway for high priority'
    );
    // Continue anyway for high-priority requests - the user spoke and we should try
    // The health monitor will track the outcome
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
  // SAFEGUARD 3b: Silence response deduplication (Jan 2026)
  // Prevents multiple silence responses from queueing up when Gemini is slow.
  // When Gemini takes >5s to respond, multiple silence checks can queue up
  // calls that all timeout together, causing cascading unhandled rejections.
  // -------------------------------------------------------------------------
  const isSilenceContext = context.includes('silence');
  if (isSilenceContext && state.pendingSilenceResponse) {
    // Check for stale silence response (>15s = definitely stuck)
    const silenceAge = state.pendingSilenceResponseAt
      ? Date.now() - state.pendingSilenceResponseAt
      : 0;
    if (silenceAge < 15_000) {
      log.debug(
        { sessionId, context, silenceAgeMs: silenceAge },
        '🤫 [GATEWAY] Silence response already pending - skipping duplicate'
      );
      return {
        success: false,
        usedFallback: false,
        error: 'Silence response already pending',
        skipped: true,
        latencyMs: Date.now() - startTime,
      };
    }
    // Stale silence response - clear it and allow new one
    log.warn(
      { sessionId, context, silenceAgeMs: silenceAge },
      '🤫 [GATEWAY] Clearing stale silence response flag'
    );
    state.pendingSilenceResponse = false;
    state.pendingSilenceResponseAt = undefined;
  }

  // -------------------------------------------------------------------------
  // SAFEGUARD 4: Active response check (ANY priority)
  // Prevents "conversation_already_has_active_response" errors from OpenAI
  // FIX: This is a hard block - if a response is active, we MUST interrupt first
  // -------------------------------------------------------------------------
  if (state.hasActiveResponse) {
    const timeSinceActive = state.activeResponseStartedAt
      ? Date.now() - state.activeResponseStartedAt
      : 0;

    log.debug(
      { sessionId, context, priority, timeSinceActive, activeContext: state.activeResponseContext },
      '🛑 [GATEWAY] Active response detected - interrupting before new request'
    );

    try {
      session.interrupt();
      // FIX (Jan 2026): INCREASED from 350ms to 500ms to ensure OpenAI fully processes the interrupt
      // OpenAI Realtime API takes significant time to clear the active response state
      // Per OpenAI docs, must wait for response.done with status 'cancelled' before new response
      // 350ms was still causing "conversation_already_has_active_response" errors
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (interruptErr) {
      log.debug(
        { error: String(interruptErr) },
        'Active response interrupt failed (non-critical, continuing anyway)'
      );
    }

    // Clear the flag
    state.hasActiveResponse = false;
    state.activeResponseStartedAt = undefined;
    state.activeResponseContext = undefined;
  }

  // -------------------------------------------------------------------------
  // SAFEGUARD 4b: User interruption grace period
  // After user interrupts, wait before creating new response to let OpenAI
  // fully cancel the previous response
  // -------------------------------------------------------------------------
  if (state.userInterruptedAt) {
    const timeSinceInterrupt = Date.now() - state.userInterruptedAt;
    // FIX (Jan 2026): INCREASED from 300ms to 400ms to let OpenAI fully clear its state
    // Per OpenAI docs, response.cancel triggers response.done with status 'cancelled'
    // Must wait for that full cycle before creating new response
    const interruptGracePeriodMs = 400;

    if (timeSinceInterrupt < interruptGracePeriodMs) {
      const remainingMs = interruptGracePeriodMs - timeSinceInterrupt;
      log.debug(
        { sessionId, context, timeSinceInterrupt, remainingMs },
        '⏳ [GATEWAY] User just interrupted - waiting for grace period'
      );
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
    }
    // Clear the flag after grace period
    state.userInterruptedAt = undefined;
  }

  // -------------------------------------------------------------------------
  // SAFEGUARD 4c: Legacy low-priority response handling
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
      // FIX (Jan 2026): INCREASED from 300ms to 400ms to let OpenAI fully process the interrupt
      // OpenAI Realtime needs significant time to clear active response state
      // Per OpenAI docs, must wait for response.done with status 'cancelled'
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (interruptErr) {
      log.debug(
        { error: String(interruptErr) },
        'Low-priority interrupt failed (non-critical, continuing anyway)'
      );
    }

    // Clear the flag
    state.hasActiveLowPriorityResponse = false;
    state.lowPriorityResponseStartedAt = undefined;
  }

  // Store session reference for future interrupts
  state.activeSession = session;

  // -------------------------------------------------------------------------
  // EXECUTE: Call generateReply with proper error handling
  // -------------------------------------------------------------------------
  state.pendingCallCount++;

  // Mark this response as active (any priority)
  state.hasActiveResponse = true;
  state.activeResponseStartedAt = Date.now();
  state.activeResponseContext = context;

  // Mark if this is a low-priority response that shouldn't block future calls
  if (priority === 'low' && !waitForPlayout) {
    state.hasActiveLowPriorityResponse = true;
    state.lowPriorityResponseStartedAt = Date.now();
  }

  // Mark silence response as pending (deduplication)
  if (isSilenceContext) {
    state.pendingSilenceResponse = true;
    state.pendingSilenceResponseAt = Date.now();
  }

  // -------------------------------------------------------------------------
  // BETTER THAN HUMAN: Use adaptive timeout based on session latency history
  // -------------------------------------------------------------------------
  // CRITICAL FIX (Jan 2026): Tool response contexts need longer timeout!
  // Tool responses require Gemini to:
  //   1. Parse the tool result
  //   2. Generate contextually appropriate response
  //   3. Start streaming speech
  // This takes significantly longer than normal conversational turns.
  // Auto-detect tool context and enforce TOOL_RESPONSE_TIMEOUT_MS (10s) minimum.
  const isToolResponseContext =
    context.startsWith('json-tool-') ||
    context.startsWith('ftis-tool-') ||
    context.includes('tool-response');
  let effectiveTimeoutMs: number;

  if (isToolResponseContext) {
    // Tool responses: use at least TOOL_RESPONSE_TIMEOUT_MS, or caller's value if higher
    effectiveTimeoutMs = Math.max(timeoutMs, TOOL_RESPONSE_TIMEOUT_MS);
    log.debug(
      { context, requestedTimeout: timeoutMs, effectiveTimeoutMs },
      '🔧 [GATEWAY] Using extended timeout for tool response context'
    );
  } else if (timeoutMs !== 4000) {
    // Caller specified a custom timeout - use it
    effectiveTimeoutMs = timeoutMs;
  } else {
    // Default timeout - use adaptive based on session history
    effectiveTimeoutMs = getAdaptiveTimeout(state);
  }

  // Start quick acknowledgment timer (fires if LLM is slow)
  const quickAckTimerId = priority === 'high' ? startQuickAckTimer(sessionId, state) : null;

  try {
    log.debug(
      {
        sessionId,
        context,
        instructionChars: instructions.length,
        estimatedTokens: Math.round(instructions.length / 4),
        effectiveTimeoutMs,
        avgTTFB: state.avgTTFB,
      },
      '🚀 [GATEWAY] Calling generateReply'
    );

    // -------------------------------------------------------------------------
    // SPEECH-AWARE TIMEOUT: Don't interrupt while agent is actively speaking
    // -------------------------------------------------------------------------
    // Track if speech has started - we shouldn't cut off mid-sentence
    let speechStarted = false;
    let firstTokenReceivedAt: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Listen for agent speaking event - this is our ACTUAL TTFB indicator
    const speakingHandler = (event: { newState: string }) => {
      if (event.newState === 'speaking') {
        speechStarted = true;

        // BETTER THAN HUMAN: Cancel quick ack since we're about to speak
        if (quickAckTimerId) {
          clearTimeout(quickAckTimerId);
          state.quickAckSent = false;
        }
      }
    };
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, speakingHandler);

    // Create our own timeout (fires before SDK's 15s timeout)
    // CRITICAL: On timeout, only interrupt if agent hasn't started speaking
    // FIX (Jan 2026): ALWAYS reject on timeout so the caller's fallback can kick in.
    // The previous behavior silently returned when speechStarted was true, but that flag
    // could be set by ANOTHER concurrent generation (e.g., PREFIX text playing while
    // tool response is pending). This left the promise hanging forever.
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        // Check if speech started - but this could be from another concurrent generation
        // (e.g., PREFIX text was playing while we wait for the tool response LLM call)
        if (speechStarted) {
          log.debug(
            { sessionId, context, effectiveTimeoutMs },
            '⏸️ [GATEWAY] Timeout reached but agent may be speaking - rejecting but NOT interrupting'
          );
          // Don't interrupt (to avoid cutting off another speech), but DO reject
          // so the caller's fallback mechanism can trigger
          reject(new Error(`Gateway timeout (${effectiveTimeoutMs}ms) - speech may be active`));
          return;
        }

        // No speech yet - safe to interrupt and fail fast
        try {
          session.interrupt();
          log.debug(
            { sessionId, context, effectiveTimeoutMs },
            '🛑 [GATEWAY] Session interrupted on timeout (no speech started)'
          );
        } catch (interruptErr) {
          log.debug({ error: String(interruptErr) }, 'Session interrupt failed (non-critical)');
        }
        reject(new Error(`Gateway timeout (${effectiveTimeoutMs}ms)`));
      }, effectiveTimeoutMs);
    });

    // 📊 E2E LATENCY: Mark LLM request sent
    markLLMRequestSent(sessionId, context);
    const requestSentAt = Date.now();

    // Notify orchestrator that we're starting a generation
    // This ensures proactive systems know we're handling a response
    onGenerationStarted(sessionId, context);

    // The actual generateReply call
    const replyPromise = (async () => {
      // FIX (Jan 2026): Add diagnostic logging for tool response debugging
      const isToolResponse = context?.startsWith('json-tool-');
      if (isToolResponse) {
        log.info(
          { sessionId, context, instructionPreview: instructions.slice(0, 200), waitForPlayout },
          '🔧 [GATEWAY] Tool response generateReply STARTED'
        );
      }

      const handle = session.generateReply({ instructions, allowInterruptions });

      // BETTER THAN HUMAN: Track actual TTFB by listening for first content
      // We'll mark TTFB when speech starts (via the speakingHandler above)
      // as that's when we actually have content ready to deliver

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

        if (isToolResponse) {
          log.info(
            { sessionId, context, durationMs: Date.now() - requestSentAt },
            '✅ [GATEWAY] Tool response generateReply COMPLETED (with playout)'
          );
        }
      } else {
        // Without waitForPlayout, we just fire and return immediately
        if (isToolResponse) {
          log.info(
            { sessionId, context },
            '📤 [GATEWAY] Tool response generateReply FIRED (no playout wait)'
          );
        }
      }

      // Record when we got the response
      firstTokenReceivedAt = Date.now();
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
      if (quickAckTimerId) clearTimeout(quickAckTimerId);
    }

    // 📊 E2E LATENCY: Mark LLM complete and audio started
    markLLMComplete(sessionId);
    if (waitForPlayout) {
      markAudioStarted(sessionId); // Audio played out
    }

    // BETTER THAN HUMAN: Record TTFB for adaptive timeout calculation
    if (firstTokenReceivedAt) {
      const ttfb = firstTokenReceivedAt - requestSentAt;
      recordTTFB(state, ttfb);
      markLLMFirstToken(sessionId); // Update the latency tracker with actual time

      log.debug(
        { sessionId, ttfb, avgTTFB: state.avgTTFB, newAdaptiveTimeout: getAdaptiveTimeout(state) },
        '📊 [GATEWAY] TTFB recorded for adaptive timeout'
      );
    }

    // SUCCESS! Reset circuit breaker
    const wasCircuitBreakerOpen = state.consecutiveFailures >= 3;
    state.consecutiveFailures = 0;
    state.circuitBreakerOpenedAt = undefined; // Reset circuit breaker timer
    state.lastSuccessAt = Date.now();
    state.stats.successfulCalls++;

    const latencyMs = Date.now() - startTime;

    // BETTER THAN HUMAN: Record successful request for health monitoring
    recordSuccessfulRequest(sessionId, latencyMs);

    if (wasCircuitBreakerOpen) {
      log.info(
        { sessionId, context, latencyMs },
        '✅ [GATEWAY] Circuit breaker CLOSED - recovered!'
      );
    } else {
      log.debug({ sessionId, context, latencyMs }, '✅ [GATEWAY] generateReply succeeded');
    }

    // =========================================================================
    // FIX (Jan 2026): Detect when LLM responded but no speech was produced
    // This happens when OpenAI returns empty content or only a function call
    // without follow-up speech. Log a warning to help diagnose "no audio" issues.
    //
    // IMPORTANT: We can ONLY detect this reliably when waitForPlayout is true!
    // When waitForPlayout is false, the promise resolves immediately BEFORE
    // speech starts, so speechStarted will always be false (false positive).
    // =========================================================================
    const noSpeechProduced = waitForPlayout && !speechStarted && latencyMs < 500;
    if (noSpeechProduced) {
      // Very fast completion without speech = likely empty response or function call only
      log.warn(
        {
          sessionId,
          context,
          latencyMs,
          speechStarted,
          waitForPlayout,
        },
        '⚠️ [GATEWAY] Fast response but no speech started - OpenAI may have returned empty/function-only'
      );
    }

    // Notify orchestrator that generation completed successfully
    onGenerationComplete(sessionId);

    return {
      success: true,
      usedFallback: false,
      latencyMs,
      // FIX (Jan 2026): Let callers know if no speech was produced so they can use fallback
      noSpeechProduced,
    };
  } catch (error) {
    // Notify orchestrator that generation failed/completed
    onGenerationComplete(sessionId);

    state.stats.failedCalls++;
    // FIX: Don't increment consecutive failures for low-priority requests (e.g., backchannels)
    // This prevents optional operations from opening the circuit breaker
    if (priority !== 'low') {
      state.consecutiveFailures++;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    const latencyMs = Date.now() - startTime;

    // 🔍 ENHANCED ERROR LOGGING: Extract LLM-specific error details
    const errorDetails = extractLLMErrorDetails(error);

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

    // FIX (Jan 2026): Handle "conversation_already_has_active_response" errors specially
    // This prevents hammering OpenAI with 17+ rapid requests when one response is active.
    // Track the error and enter cooldown mode to prevent further requests.
    if (errorDetails.errorType === 'active_response') {
      state.activeResponseErrorCount++;
      state.lastActiveResponseErrorAt = Date.now();

      // Also mark hasActiveResponse=true since OpenAI told us one is active
      state.hasActiveResponse = true;
      state.activeResponseStartedAt = Date.now();
      state.activeResponseContext = 'external-active';

      // Only log the first few errors of a burst, not all 17
      if (state.activeResponseErrorCount <= 2) {
        log.warn(
          { sessionId, context, errorCount: state.activeResponseErrorCount, latencyMs },
          '🛑 [GATEWAY] OpenAI has active response - entering cooldown'
        );
      } else if (state.activeResponseErrorCount === 3) {
        log.warn(
          { sessionId, context, errorCount: state.activeResponseErrorCount },
          '🛑 [GATEWAY] Multiple active_response errors - suppressing further logs'
        );
      }

      // Don't count as consecutive failure since this is a race condition, not a real failure
      state.consecutiveFailures = Math.max(0, state.consecutiveFailures - 1);

      return {
        success: false,
        usedFallback: false,
        error: 'Active response in progress (cooldown activated)',
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

    // BETTER THAN HUMAN: Record failed request for health monitoring
    recordFailedRequest(sessionId, errorDetails.errorType);

    // BETTER THAN HUMAN: Check if health monitor recommends reconnection
    if (shouldAttemptReconnection(sessionId) && !errorDetails.isLLMDead) {
      log.info(
        { sessionId, context },
        '🏥 [GATEWAY] Health monitor recommends reconnection - triggering proactively'
      );
      // Will trigger reconnection via the existing path below
    }

    // 🔄 CRITICAL FIX: Proactive reconnection when LLM dies
    // Don't wait for graceful exit threshold - try to reconnect immediately
    if (errorDetails.isLLMDead && state.consecutiveFailures >= 2 && priority !== 'low') {
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

    // Clear active response flag - response is no longer in progress
    // FIX (Jan 2026): When waitForPlayout is false, we return success before OpenAI
    // actually generates anything. Keep hasActiveResponse=true for a grace period
    // to prevent competing response.create requests that OpenAI silently ignores.
    if (waitForPlayout) {
      // We waited for playout - safe to clear immediately
      state.hasActiveResponse = false;
      state.activeResponseStartedAt = undefined;
      state.activeResponseContext = undefined;
    } else {
      // Didn't wait for playout - keep flag set for 2 seconds to prevent
      // rapid-fire response.create requests that flood OpenAI
      // The flag will be cleared by:
      // 1. This timeout (2s)
      // 2. User starting to speak (clearPendingLowPriorityResponse)
      // 3. Next generateReply call (which will interrupt first)
      const capturedSessionId = sessionId;
      setTimeout(() => {
        const currentState = sessionStates.get(capturedSessionId);
        if (currentState && currentState.activeResponseContext === context) {
          currentState.hasActiveResponse = false;
          currentState.activeResponseStartedAt = undefined;
          currentState.activeResponseContext = undefined;
          log.debug(
            { sessionId: capturedSessionId, context },
            '⏰ [GATEWAY] Cleared hasActiveResponse after 2s grace period'
          );
        }
      }, 2000);
    }

    // Clear low-priority response flag if this was a low-priority call
    // (either completed successfully or failed/timed out)
    if (priority === 'low') {
      state.hasActiveLowPriorityResponse = false;
      state.lowPriorityResponseStartedAt = undefined;
    }

    // Clear silence response flag if this was a silence context
    if (isSilenceContext) {
      state.pendingSilenceResponse = false;
      state.pendingSilenceResponseAt = undefined;
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
  const envValue = process.env.SKIP_PREWARM_GENERATEREPLY;
  const SKIP_PREWARM_GENERATEREPLY = envValue !== 'false';

  process.stderr.write(
    `\n🔥 [PREWARM DEBUG] SKIP_PREWARM_GENERATEREPLY env="${envValue}" → mode=${SKIP_PREWARM_GENERATEREPLY ? 'QUICK' : 'FULL'}\n`
  );

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
  process.stderr.write(
    `\n⚠️ [PREWARM DEBUG] FULL prewarm starting - Gemini will receive audio during this phase!\n`
  );
  process.stderr.write(`⚠️ [PREWARM DEBUG] Any audio picked up now will trigger Gemini response\n`);

  // FIX (Jan 2026): Increased timeout from 3s to 5s - connection can take a while on cold start
  // Also properly interrupt the handle on timeout to prevent WritableStream errors
  const PREWARM_TIMEOUT_MS = 5000;
  let prewarmHandle: ReturnType<typeof session.generateReply> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    // Call generateReply with minimal instruction to establish Gemini WebSocket
    // Timeout set to 5s - if Gemini doesn't connect in 5s, use lazy connection
    // This prevents blocking session startup while still attempting early connection
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        // FIX: Interrupt the session to properly clean up the handle
        // This prevents the WritableStream is closed error from LiveKit telemetry
        if (prewarmHandle) {
          try {
            session.interrupt();
            log.debug({ sessionId }, '🛑 [GATEWAY] Prewarm handle interrupted on timeout');
          } catch (interruptErr) {
            log.debug(
              { error: String(interruptErr) },
              '🔇 [GATEWAY] Prewarm interrupt failed (non-critical)'
            );
          }
        }
        reject(new Error(`Prewarm timeout (${PREWARM_TIMEOUT_MS / 1000}s)`));
      }, PREWARM_TIMEOUT_MS);
    });

    const prewarmPromise = (async () => {
      // Check cancellation before starting
      if (cancelledSessions.has(sessionId)) {
        throw new Error('Session cancelled during prewarm');
      }

      prewarmHandle = session.generateReply({
        instructions: ' ',
        allowInterruptions: true,
      });

      // Wait for generation_created event (implicit in waitForPlayout)
      await prewarmHandle.waitForPlayout();
    })();

    // Attach catch handler to prevent unhandled rejection
    prewarmPromise.catch((err: Error) => {
      log.debug({ error: err.message }, '🔇 [GATEWAY] Swallowed prewarm rejection');
    });

    await Promise.race([prewarmPromise, timeoutPromise]);

    // Clear timeout on success to prevent memory leak
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

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
    // Clear timeout to prevent memory leak
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    // Don't warn for cancellation - it's expected
    if (errorMsg.includes('cancelled')) {
      log.debug({ sessionId }, '🔇 [GATEWAY] Prewarm cancelled (session ended)');
    } else if (errorMsg.includes('timeout')) {
      // Timeout is expected when connection is slow - mark session ready for lazy connection
      markSessionReady(sessionId);
      log.info(
        { sessionId, durationMs: Date.now() - startTime, error: errorMsg },
        '⚠️ [GATEWAY] Prewarm timeout - session marked ready for lazy connection'
      );
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
