/**
 * Centralized timeout and delay constants (ms unless noted).
 *
 * Single source of truth for all magic timeout numbers used across
 * generate-reply-gateway, session-state-handler, tts-wrapper, cartesia, gce-voice-worker.
 *
 * @see docs/plans/BEYOND-NARROW-BTH-PLAN.md
 */

// ============================================================================
// GENERATE-REPLY-GATEWAY
// ============================================================================

/** Debounce for normal/high priority (faster for real user messages) */
export const DEBOUNCE_MS_NORMAL = 300;

/** Debounce for low priority (e.g. backchannels) - longer to prevent spam */
export const DEBOUNCE_MS_LOW = 500;

/** Delay before trying reconnect after "One moment..." TTS */
export const RECONNECT_DELAY_MS = 500;

/** Max wait for Gemini reconnection attempt */
export const RECONNECT_TIMEOUT_MS = 8000;

/** Wait for TTS to complete before signalling disconnect on graceful exit */
export const GRACEFUL_EXIT_TTS_WAIT_MS = 2500;

/** Short delay when signalling frontend to disconnect (TTS already played) */
export const DISCONNECT_DELAY_MS = 500;

/** Base timeout when no latency data yet */
export const GATEWAY_BASE_TIMEOUT_MS = 4000;

/** Minimum adaptive timeout - never go below */
export const GATEWAY_MIN_TIMEOUT_MS = 2500;

/** Maximum adaptive timeout - never exceed */
export const GATEWAY_MAX_TIMEOUT_MS = 8000;

/** Buffer added to 2× avg TTFB for adaptive timeout (TTS + processing) */
export const GATEWAY_TTFB_BUFFER_MS = 500;

/** Cooldown after "active response" error to prevent hammering */
export const ACTIVE_RESPONSE_COOLDOWN_MS = 500;

/** Max wait for session ready when priority is high */
export const WAIT_FOR_READY_MS = 5000;

/** Grace period after user interrupt before creating new response (OpenAI clear state) */
export const INTERRUPT_GRACE_PERIOD_MS = 400;

/** Prewarm timeout - if Gemini doesn't connect in this time, use lazy connection */
export const PREWARM_TIMEOUT_MS = 5000;

/** Tool response timeout - tool calls need more time for parse + generate + stream */
export const TOOL_RESPONSE_TIMEOUT_MS = 10000;

/** Quick acknowledgment delay before sending filler phrase */
export const QUICK_ACK_DELAY_MS = 1200;

/** Time after which circuit breaker enters "half-open" state */
export const CIRCUIT_BREAKER_RESET_MS = 10_000;

// ============================================================================
// SESSION-STATE-HANDLER
// ============================================================================

/** If no agent speech by this time, trigger recovery (empty response watchdog) */
export const EMPTY_RESPONSE_WATCHDOG_MS = 3000;

/** Min interval between backchannels (avoid robotic "mm-hmm" spam) */
export const BACKCHANNEL_MIN_INTERVAL_MS = 12000;

/** Pause duration before triggering backchannel */
export const BACKCHANNEL_TRIGGER_MS = 4000;

/** Min interval between live backchannels */
export const LIVE_BACKCHANNEL_MIN_INTERVAL_MS = 15000;

/** User must speak this long before live backchannel is considered */
export const MIN_SPEECH_FOR_LIVE_BACKCHANNEL_MS = 5000;

/** Min speech duration to filter noise (clicks, pops); "Hi" is ~150–200ms */
export const MIN_SPEECH_DURATION_MS = 150;

/** Backchannel request timeout - should be quick or skipped */
export const BACKCHANNEL_TIMEOUT_MS = 3000;

/** Breath pause check interval */
export const BREATH_PAUSE_CHECK_MS = 200;

/** Max time to wait for breath pause detection */
export const BREATH_PAUSE_MAX_WAIT_MS = 30000;

/** Window after last backchannel to avoid duplicate reaction */
export const BACKCHANNEL_REACTION_WINDOW_MS = 10000;

/** Min silence before considering backchannel after user stopped */
export const SILENCE_FOR_BACKCHANNEL_MS = 5000;

/** Min silence before triggering silence handler (e.g. filler) */
export const SILENCE_HANDLER_MIN_MS = 1500;

/** Default utterance duration when unknown */
export const DEFAULT_UTTERANCE_DURATION_MS = 1000;

/** Interval for silence-handling / early acknowledgment check */
export const SILENCE_CHECK_INTERVAL_MS = 10000;

/** Delay before checking for feedback opportunity after agent stops speaking */
export const FEEDBACK_PROMPT_DELAY_MS = 1000;

/** Max time to keep early-ack cleanup handler attached (prevents leaks) */
export const EARLY_ACK_CLEANUP_MS = 10000;

// ============================================================================
// TTS / CARTESIA
// ============================================================================

/** Cartesia SSE abort timeout (per request) */
export const CARTESIA_SSE_ABORT_MS = 5000;

/** Default Cartesia API request timeout */
export const CARTESIA_DEFAULT_TIMEOUT_MS = 30000;

// ============================================================================
// GCE VOICE WORKER
// ============================================================================

/** Delay between worker startup steps */
export const GCE_WORKER_STARTUP_DELAY_MS = 1000;

/** Short delay for readiness / health checks */
export const GCE_WORKER_READINESS_DELAY_MS = 100;
