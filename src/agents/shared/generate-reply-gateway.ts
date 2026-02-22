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
// Higgs full loop: when transcript is provided and TTS is Higgs pipeline
import { getHiggsPipelineProvider } from '../../speech/tts-gateway/providers/higgs-pipeline.js';
// Convert raw PCM to AudioFrames for session.output.audio.captureFrame()
import { splitCachedAudioIntoFrames } from './greeting-audio-cache.js';
import {
  resolveSpeculativeExecution,
  cancelSpeculativeExecution,
} from './performance/speculative-llm.js';
import {
  DEBOUNCE_MS_NORMAL,
  DEBOUNCE_MS_LOW,
  RECONNECT_DELAY_MS,
  RECONNECT_TIMEOUT_MS,
  GRACEFUL_EXIT_TTS_WAIT_MS,
  DISCONNECT_DELAY_MS,
  GATEWAY_BASE_TIMEOUT_MS,
  GATEWAY_MIN_TIMEOUT_MS,
  GATEWAY_MAX_TIMEOUT_MS,
  GATEWAY_TTFB_BUFFER_MS,
  ACTIVE_RESPONSE_COOLDOWN_MS,
  WAIT_FOR_READY_MS,
  INTERRUPT_GRACE_PERIOD_MS,
  PREWARM_TIMEOUT_MS,
  CIRCUIT_BREAKER_RESET_MS,
  TOOL_RESPONSE_TIMEOUT_MS,
  QUICK_ACK_DELAY_MS,
} from '../../config/timeouts.js';
import { extractLLMErrorDetails } from './gateway/error-analysis.js';
import {
  getSessionState,
  getAdaptiveTimeout,
  recordTTFB,
  startQuickAckTimer,
  getSessionLatencyStats,
  isSessionReady,
  markSessionReady,
  markSessionNotReady,
  waitForSessionReady,
  isSessionActive,
  resetSessionState,
  getGatewayStats,
  hasActiveResponsePending,
  clearPendingLowPriorityResponse,
  cleanupSessionStateInternal,
  cancelledSessions,
  getSessionStatesMap,
} from './gateway/session-state.js';
import {
  sessionObjects,
  registerSessionForReconnection,
  unregisterSessionForReconnection,
  generateReplyBySessionId,
  handleGeminiDeath,
  triggerGracefulExit,
  setReconnectionCallbacks,
} from './gateway/reconnection.js';

export { TOOL_RESPONSE_TIMEOUT_MS };

const log = getLogger();

// ============================================================================
// HIGGS FULL LOOP: Raw audio playback (for generate_reply → play to session)
// ============================================================================
// When TTS is Higgs pipeline and generate_reply is available, we can call
// Higgs generateReply(transcript) and get reply audio. To play it we need
// a handler that can push raw PCM to the session's track. Register via
// registerRawAudioPlayHandler(sessionId, handler). If no handler is
// registered, we fall back to session.generateReply().

const rawAudioPlayHandlers = new Map<
  string,
  (buffer: ArrayBuffer, sampleRate?: number) => Promise<boolean>
>();

/**
 * Register a handler to play raw PCM audio for a session (e.g. from Higgs generate_reply).
 * When generateReply() is called with options.transcript and Higgs full loop is available,
 * the gateway will call Higgs generateReply(transcript), then invoke this handler with
 * the reply audio buffer and sample rate. Handler should return true if audio was played, false otherwise.
 * Used to wire Higgs full loop when the agent has access to the session's audio track.
 */
export function registerRawAudioPlayHandler(
  sessionId: string,
  handler: (buffer: ArrayBuffer, sampleRate?: number) => Promise<boolean>
): void {
  rawAudioPlayHandlers.set(sessionId, handler);
}

/**
 * Unregister raw audio play handler for a session (e.g. on session end).
 */
export function unregisterRawAudioPlayHandler(sessionId: string): void {
  rawAudioPlayHandlers.delete(sessionId);
}

/** Higgs reply audio sample rate (must match Higgs AudioStart). */
const HIGGS_REPLY_SAMPLE_RATE = 24000;

/** Frame duration in ms for streaming (20ms matches typical TTS chunking). */
const HIGGS_REPLY_FRAME_MS = 20;

/**
 * Register the Higgs full-loop raw-audio handler for a session.
 * Call this when TTS_PROVIDER=higgs-pipeline and the session is registered.
 * The handler pushes PCM from Higgs generateReply into the session's audio output.
 */
/** Max attempts to wait for output.audio when it is not yet set (e.g. right after session start). */
const HIGGS_RAW_AUDIO_WAIT_ATTEMPTS = 3;
/** Delay in ms between attempts. */
const HIGGS_RAW_AUDIO_WAIT_MS = 50;

export function registerHiggsRawAudioPlayHandler(sessionId: string): void {
  const handler = async (
    buffer: ArrayBuffer,
    sampleRate?: number
  ): Promise<boolean> => {
    const rate = sampleRate ?? HIGGS_REPLY_SAMPLE_RATE;
    let session = sessionObjects.get(sessionId);
    let audio = session?.output?.audio;
    for (let attempt = 0; attempt < HIGGS_RAW_AUDIO_WAIT_ATTEMPTS && !audio; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, HIGGS_RAW_AUDIO_WAIT_MS));
      }
      session = sessionObjects.get(sessionId);
      audio = session?.output?.audio;
    }
    if (!audio || typeof audio.captureFrame !== 'function') {
      log.debug(
        { sessionId, hasSession: !!session, hasAudio: !!audio },
        'Higgs full loop: no session or output.audio yet, skipping raw play'
      );
      return false;
    }
    try {
      for (const frame of splitCachedAudioIntoFrames(
        buffer,
        rate,
        HIGGS_REPLY_FRAME_MS
      )) {
        await audio.captureFrame(frame);
      }
      if (typeof audio.flush === 'function') {
        audio.flush();
      }
      return true;
    } catch (err) {
      log.warn(
        { sessionId, error: String(err) },
        'Higgs full loop: captureFrame failed'
      );
      return false;
    }
  };
  registerRawAudioPlayHandler(sessionId, handler);
}

// Wire reconnection callbacks for Higgs raw-audio (avoids circular imports)
setReconnectionCallbacks({
  onSessionRegistered: (id) => {
    if (process.env.TTS_PROVIDER?.toLowerCase() === 'higgs-pipeline') {
      registerHiggsRawAudioPlayHandler(id);
    }
  },
  onSessionUnregistered: unregisterRawAudioPlayHandler,
});

async function playRawAudioToSession(
  sessionId: string,
  buffer: ArrayBuffer,
  sampleRate?: number
): Promise<boolean> {
  const handler = rawAudioPlayHandlers.get(sessionId);
  if (!handler) {
    return false;
  }
  try {
    return await handler(buffer, sampleRate);
  } catch (err) {
    log.warn(
      { sessionId, error: String(err) },
      'Higgs full loop: raw audio play handler failed'
    );
    return false;
  }
}

// ============================================================================
// TYPES
// ============================================================================

import type { GatewayOptions, GatewayResult } from './gateway/types.js';
export type { GatewayOptions, GatewayResult };

/** Type alias for external consumers */
export type GenerateReplyOptions = GatewayOptions;
export type GenerateReplyResult = GatewayResult;

/**
 * After this many consecutive failures, trigger graceful exit instead of leaving user in silence.
 * CRITICAL FIX: Reduced from 5 to 3 - user was stuck in silence for 14 min with 4 failures.
 */
const GRACEFUL_EXIT_THRESHOLD = 3;

// Re-exports from gateway modules for backward compatibility
export {
  registerSessionForReconnection,
  unregisterSessionForReconnection,
  generateReplyBySessionId,
};
export {
  getSessionLatencyStats,
  isSessionReady,
  markSessionReady,
  markSessionNotReady,
  waitForSessionReady,
  isSessionActive,
  resetSessionState,
  getGatewayStats,
  hasActiveResponsePending,
  clearPendingLowPriorityResponse,
};

/**
 * Clean up session state when session ends.
 * Composes internal cleanup with reconnection unregister and speculative execution cancel.
 */
export function cleanupSessionState(sessionId: string): void {
  cleanupSessionStateInternal(sessionId);
  unregisterSessionForReconnection(sessionId);
  cancelSpeculativeExecution(sessionId);
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
  // Cooldown after active_response error - see config/timeouts.js
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
      const ready = await waitForSessionReady(sessionId, WAIT_FOR_READY_MS);
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
    if (timeSinceInterrupt < INTERRUPT_GRACE_PERIOD_MS) {
      const remainingMs = INTERRUPT_GRACE_PERIOD_MS - timeSinceInterrupt;
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
      await new Promise((resolve) => setTimeout(resolve, INTERRUPT_GRACE_PERIOD_MS));
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
  // HIGGS FULL LOOP: When transcript is provided and TTS is Higgs pipeline,
  // call Higgs generateReply(transcript) and play reply audio if a handler
  // is registered; otherwise fall back to session.generateReply().
  // -------------------------------------------------------------------------
  const useHiggsFullLoop =
    options.transcript &&
    process.env.TTS_PROVIDER?.toLowerCase() === 'higgs-pipeline';

  if (useHiggsFullLoop) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const higgs = getHiggsPipelineProvider() as any;
      if (typeof higgs.isGenerateReplyAvailable === 'function' && await higgs.isGenerateReplyAvailable()) {
        // HYBRID PATH: Higgs has LLM but not TTS — use Ollama for text, Cartesia for speech
        const ttsAvailable = typeof higgs.isTtsAvailable === 'function' ? await higgs.isTtsAvailable() : false;
        if (!ttsAvailable) {
          const { ollamaGenerate } = await import('./ollama-client.js');
          const prompt = [
            options.context || '',
            '\n\nUser said: ',
            options.transcript!.trim(),
            '\n\nReply:',
          ].join('');
          let replyText = await ollamaGenerate(prompt);

          // Tool-call handling (same as Higgs full loop)
          const { looksLikeJsonFunctionCall } = await import('./sanitizer/detectors/leakage-detector.js');
          if (looksLikeJsonFunctionCall(replyText)) {
            const { parseJsonFunctionCall, executeJsonFunction } = await import('./json-function-executor.js');
            const toolCall = parseJsonFunctionCall(replyText);
            if (toolCall) {
              log.info(
                { sessionId, context, fn: toolCall.fn },
                'Owned stack hybrid: LLM emitted tool call, executing and re-calling'
              );
              const toolResult = await executeJsonFunction(toolCall, {
                userId: undefined,
                sessionId,
                personaId: 'ferni',
              });
              const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
              const followUpContext = [
                options.context || '',
                `\nTool "${toolCall.fn}" was called with ${JSON.stringify(toolCall.args)}. Result: ${resultStr}`,
                '\nNow reply to the user naturally using this information. Do not output JSON.',
              ].join('');
              const followUpPrompt = [followUpContext, '\n\nUser said: ', options.transcript!.trim(), '\n\nReply:'].join('');
              replyText = await ollamaGenerate(followUpPrompt);
            }
          }

          const trimmed = replyText.trim();
          if (trimmed) {
            coordinatedSay(sessionId, trimmed, { allowInterruptions: true });
            recordSuccessfulRequest(sessionId, Date.now() - startTime);
            state.pendingCallCount--;
            state.hasActiveResponse = false;
            state.activeResponseStartedAt = undefined;
            state.activeResponseContext = undefined;
            if (isSilenceContext) {
              state.pendingSilenceResponse = false;
              state.pendingSilenceResponseAt = undefined;
            }
            onGenerationComplete(sessionId);
            const latencyMs = Date.now() - startTime;
            markLLMFirstToken(sessionId);
            markLLMComplete(sessionId);
            markAudioStarted(sessionId);
            log.info(
              { sessionId, context, latencyMs },
              'Owned stack hybrid: Ollama reply spoken via Cartesia'
            );
            return { success: true, usedFallback: false, latencyMs };
          }
        }

        const { buffer, sampleRate, text: replyText } = await higgs.generateReply(options.transcript!, {
          context: options.context,
        });

        // OWNED STACK TOOL CALLING: If the LLM reply contains a JSON tool call,
        // execute it and re-call generateReply with the tool result instead of playing audio.
        if (replyText) {
          const { looksLikeJsonFunctionCall } = await import('./sanitizer/detectors/leakage-detector.js');
          if (looksLikeJsonFunctionCall(replyText)) {
            const { parseJsonFunctionCall, executeJsonFunction } = await import('./json-function-executor.js');
            const toolCall = parseJsonFunctionCall(replyText);
            if (toolCall) {
              log.info(
                { sessionId, context, fn: toolCall.fn },
                'Owned stack: LLM emitted tool call, executing and re-calling'
              );
              const toolResult = await executeJsonFunction(toolCall, {
                userId: undefined,
                sessionId,
                personaId: 'ferni',
              });
              const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
              // Re-call with tool result so the LLM can form a natural reply
              state.pendingCallCount--;
              state.hasActiveResponse = false;
              state.activeResponseStartedAt = undefined;
              state.activeResponseContext = undefined;
              const followUpContext = [
                options.context || '',
                `\nTool "${toolCall.fn}" was called with ${JSON.stringify(toolCall.args)}. Result: ${resultStr}`,
                '\nNow reply to the user naturally using this information. Do not output JSON.',
              ].join('');
              const { buffer: followUpBuffer, sampleRate: followUpRate } = await higgs.generateReply(
                options.transcript!,
                { context: followUpContext }
              );
              if (followUpBuffer.byteLength > 0) {
                const played = await playRawAudioToSession(sessionId, followUpBuffer, followUpRate);
                if (played) {
                  recordSuccessfulRequest(sessionId, Date.now() - startTime);
                  onGenerationComplete(sessionId);
                  const latencyMs = Date.now() - startTime;
                  markLLMFirstToken(sessionId);
                  markLLMComplete(sessionId);
                  markAudioStarted(sessionId);
                  log.info(
                    { sessionId, context, latencyMs, toolFn: toolCall.fn },
                    'Owned stack: tool call executed, follow-up reply played'
                  );
                  return { success: true, usedFallback: false, latencyMs };
                }
              }
            }
          }
        }

        if (buffer.byteLength > 0) {
          const played = await playRawAudioToSession(sessionId, buffer, sampleRate);
          if (played) {
            recordSuccessfulRequest(sessionId, Date.now() - startTime);
            state.pendingCallCount--;
            state.hasActiveResponse = false;
            state.activeResponseStartedAt = undefined;
            state.activeResponseContext = undefined;
            if (isSilenceContext) {
              state.pendingSilenceResponse = false;
              state.pendingSilenceResponseAt = undefined;
            }
            onGenerationComplete(sessionId);
            const latencyMs = Date.now() - startTime;
            markLLMFirstToken(sessionId);
            markLLMComplete(sessionId);
            markAudioStarted(sessionId);
            log.debug(
              { sessionId, context, latencyMs, audioBytes: buffer.byteLength, sampleRate },
              'Higgs full loop: reply played via raw audio'
            );
            return {
              success: true,
              usedFallback: false,
              latencyMs,
            };
          }
        }
      }
    } catch (higgsErr) {
      log.warn(
        { sessionId, context, error: String(higgsErr) },
        'Higgs full loop failed, falling back to session.generateReply()'
      );
    }
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
        const currentState = getSessionStatesMap().get(capturedSessionId);
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
