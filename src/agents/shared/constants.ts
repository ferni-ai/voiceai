/**
 * Shared Constants for Voice Agents
 *
 * Centralizes magic numbers and timing values for maintainability.
 */

// ============================================================================
// HANDOFF TIMING
// NOTE: Canonical source is src/config/handoff-timing.ts
// Re-exported here for convenience but prefer importing directly from source
// ============================================================================

// Re-export handoff timing from canonical source
export {
  HANDOFF_TIMING,
  getTransitionDelay,
  isHandoffAllowed,
  type TransitionStyle,
} from '../../config/handoff-timing.js';

/**
 * @deprecated Use HANDOFF_TIMING from ../../config/handoff-timing.js instead
 * This alias maintains backward compatibility
 */
export { HANDOFF_TIMING as HANDOFF_DELAYS } from '../../config/handoff-timing.js';

// ============================================================================
// SILENCE DETECTION
// ============================================================================

export const SILENCE_THRESHOLDS = {
  /** Minimum time before responding to silence (ms) */
  MIN_RESPONSE_INTERVAL: 10_000,

  /** Duration of silence before considering user inactive (seconds) */
  INACTIVE_THRESHOLD_SECONDS: 30,

  /**
   * Early silence threshold for quick acknowledgment (seconds)
   * DEAD AIR FIX: If processing takes too long, acknowledge at this point
   *
   * NOTE: This MUST be > TURN_PROCESSING_SOFT_TIMEOUT to avoid duplicate fillers!
   * turn-handler.ts fires at 2s - this acts as a backup fallback only.
   * See turn-handler.ts:148 and session-state-handler.ts:451
   *
   * REDUCED Jan 2026: 5.0s → 3.0s - 5 seconds of silence feels like an eternity
   * Research shows users perceive delays > 2s as "slow"
   */
  EARLY_ACKNOWLEDGMENT_SECONDS: 3.0,

  /**
   * Response intervals for progressive silence handling (seconds)
   * First response at INTERVALS[0], second at INTERVALS[1], etc.
   * Values are randomized ±20% for natural feel.
   *
   * Configurable via SILENCE_INTERVALS env var (comma-separated):
   * e.g., SILENCE_INTERVALS=6,15,30 for faster responses
   *
   * Default: [10, 22, 38] - First response at ~10s, second at ~22s, third at ~38s
   * Faster: [6, 15, 30] - More responsive for active conversations
   * Slower: [15, 35, 60] - More patient for contemplative conversations
   */
  get intervals(): number[] {
    const envValue = process.env.SILENCE_INTERVALS;
    if (envValue) {
      const parsed = envValue.split(',').map((s) => parseInt(s.trim(), 10));
      if (parsed.length > 0 && parsed.every((n) => !isNaN(n) && n > 0)) {
        return parsed;
      }
    }
    return [10, 22, 38]; // Default: first at 10s, second at 22s, third at 38s
  },
} as const;

// ============================================================================
// IDLE TIMEOUT - Auto-disconnect on extended silence
// ============================================================================

export const IDLE_TIMEOUT = {
  /**
   * Duration of silence before warning the user (seconds)
   * At this point, we gently check if they're still there
   */
  WARNING_THRESHOLD_SECONDS: 90,

  /**
   * Duration of silence before auto-disconnecting (seconds)
   * After 2 minutes of complete silence, we assume they've stepped away
   */
  DISCONNECT_THRESHOLD_SECONDS: 120,

  /**
   * Delay after saying goodbye before disconnecting (ms)
   * Gives the TTS time to finish speaking
   */
  DISCONNECT_DELAY_MS: 3000,
} as const;

// ============================================================================
// RESPONSE PROCESSING
// ============================================================================

/**
 * Static processing timeouts - FALLBACK ONLY
 *
 * PREFER: Use getAdaptiveTimeouts() from ./performance/adaptive-timing.ts
 * for dynamic timeouts based on actual session performance.
 *
 * These static values are used:
 * 1. During first few turns before we have latency data
 * 2. As absolute maximums that adaptive timing won't exceed
 *
 * "BETTER THAN HUMAN" PHILOSOPHY (Jan 2026):
 * - Humans perceive delays > 1s as "slow"
 * - Delays > 2s feel like "waiting"
 * - Delays > 3s feel like "something's wrong"
 * - We aim for < 1s response start, < 3s complete response
 */
export const PROCESSING_TIMEOUTS = {
  /**
   * STATIC fallback for filler injection timing (ms)
   *
   * ADAPTIVE ALTERNATIVE: Use shouldInjectFiller() from adaptive-timing.ts
   * which adjusts based on actual processing latency.
   *
   * REDUCED Jan 2026: 2s → 800ms for "Better than Human"
   * Research shows human turn-taking gaps are 200-500ms.
   * A thinking sound at 800ms shows presence without awkward silence.
   */
  TURN_PROCESSING_SOFT_TIMEOUT: 800,

  /**
   * Hard timeout for turn processing (ms)
   *
   * REDUCED Jan 2026: 8s → 4s - fail fast, use fallback
   * If we can't respond in 4s, we're doing something wrong.
   * Fall back to simpler context rather than make user wait.
   */
  TURN_PROCESSING_HARD_TIMEOUT: 4000,
} as const;

// ============================================================================
// PROGRESSIVE TOOL EXECUTION (Better than Human)
// ============================================================================

/**
 * Progressive tool execution timeouts
 *
 * "Better than Human" means responding faster than humans expect.
 * These timeouts are tuned for perceived responsiveness.
 *
 * PHILOSOPHY (Jan 2026): Silence is the enemy. Better a quick "Hmm, let me check"
 * than 2 seconds of dead air. Users forgive slowness if they know you're working.
 */
export const PROGRESSIVE_TIMEOUTS = {
  /**
   * Duration to wait silently before any feedback (ms)
   * Fast responses need no acknowledgment - feels instant
   * REDUCED Jan 2026: 1s → 500ms - silence >500ms feels awkward
   */
  SILENT_WINDOW: 500,

  /**
   * When to send first acknowledgment "Checking..." (ms)
   * User knows we're working on it
   * REDUCED Jan 2026: 1.5s → 800ms - show presence quickly
   */
  ACKNOWLEDGMENT_AT: 800,

  /**
   * When to send update "Still looking..." (ms)
   * Reassures user for slower operations
   * REDUCED Jan 2026: 3.5s → 2s - keep them engaged
   */
  UPDATE_AT: 2000,

  /**
   * Hard timeout for tool execution (ms)
   * After this, return cached/fallback data
   * REDUCED Jan 2026: 6s → 4s - fail fast, use cache, apologize later
   */
  TOOL_HARD_TIMEOUT: 4000,

  /**
   * Maximum age of cached data to accept as fallback (ms)
   * Stale data is better than no data for most use cases
   */
  CACHE_MAX_AGE: 30 * 60 * 1000, // 30 minutes
} as const;

// ============================================================================
// API TIMEOUTS
// ============================================================================

/**
 * API Timeouts - "Better than Human" Edition
 *
 * If an external API can't respond fast, we use cache/fallback.
 * Users prefer a quick "based on what I know" over waiting 10+ seconds.
 */
export const API_TIMEOUTS = {
  /** Default timeout for external API calls (ms) - REDUCED from 10s */
  DEFAULT: 5_000,

  /** Timeout for news API calls (ms) - REDUCED from 12s */
  NEWS: 6_000,

  /** Timeout for stock quote calls (ms) - REDUCED from 8s */
  STOCK_QUOTE: 4_000,

  /** Timeout for weather API calls (ms) - REDUCED from 8s */
  WEATHER: 4_000,

  /** Timeout for search API calls (ms) - REDUCED from 15s */
  SEARCH: 6_000,
} as const;

// ============================================================================
// RATE LIMITING
// ============================================================================

export const RATE_LIMITS = {
  /** Minimum interval between handoffs (ms) */
  MIN_HANDOFF_INTERVAL: 1_000,

  /** Rate limit window (ms) */
  WINDOW_MS: 60_000,

  /** Max requests per window */
  MAX_REQUESTS_PER_WINDOW: 100,
} as const;

// ============================================================================
// CONVERSATION SETTINGS
// ============================================================================

export const CONVERSATION = {
  /** Maximum turns to keep in memory */
  MAX_TURNS_IN_MEMORY: 100,

  /** Turn history for immediate context */
  RECENT_TURNS_COUNT: 20,

  /** Maximum summaries to retrieve */
  MAX_SUMMARIES: 10,
} as const;

// ============================================================================
// AUDIO SETTINGS
// ============================================================================

export const AUDIO = {
  /** Default audio sample rate */
  SAMPLE_RATE: 48_000,

  /** Audio buffer size */
  BUFFER_SIZE: 4_096,

  /** Fade duration for audio transitions (ms) */
  FADE_DURATION: 500,
} as const;

// ============================================================================
// VOICE ACTIVITY DETECTION (VAD) SETTINGS
// Controls sensitivity to background noise
// ============================================================================

/**
 * VAD Configuration for OpenAI Realtime API
 *
 * The threshold controls how sensitive the agent is to sounds:
 * - Lower values (0.3-0.5): More sensitive, triggers on quieter sounds
 * - Higher values (0.6-0.8): Less sensitive, requires clearer speech
 *
 * Configurable via environment variables for different environments:
 * - VAD_THRESHOLD: Speech detection threshold (default: 0.65)
 * - VAD_PREFIX_PADDING_MS: Audio to include before detected speech (default: 300)
 * - VAD_SILENCE_DURATION_MS: How long to wait after silence (default: 600)
 */
export const VAD_CONFIG = {
  /**
   * Speech detection threshold (0.0-1.0)
   * Higher = less sensitive to background noise
   * Default increased from 0.5 to 0.65 to reduce false triggers
   *
   * Recommended values:
   * - 0.5: Very sensitive (quiet environments only)
   * - 0.65: Balanced (default, works in most environments)
   * - 0.75: Low sensitivity (noisy environments)
   * - 0.85: Very low sensitivity (very noisy environments)
   */
  get threshold(): number {
    const envValue = process.env.VAD_THRESHOLD;
    if (envValue) {
      const parsed = parseFloat(envValue);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
    return 0.65; // Default: balanced sensitivity
  },

  /**
   * Audio to include before detected speech starts (ms)
   * Captures the beginning of words that might be cut off
   *
   * UPDATED Dec 2024: Reduced from 300ms → 200ms for faster response
   * while still capturing word beginnings
   */
  get prefixPaddingMs(): number {
    const envValue = process.env.VAD_PREFIX_PADDING_MS;
    if (envValue) {
      const parsed = parseInt(envValue, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return 200; // Default: 200ms padding (reduced from 300ms)
  },

  /**
   * Duration of silence required to end speech detection (ms)
   * Lower = faster response, Higher = more tolerant of natural pauses
   *
   * UPDATED Jan 2026: Reduced from 400ms → 300ms for human-like turn-taking
   * Research: Human turn-taking gaps are 200-500ms
   */
  get silenceDurationMs(): number {
    const envValue = process.env.VAD_SILENCE_DURATION_MS;
    if (envValue) {
      const parsed = parseInt(envValue, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return 300; // Default: 300ms silence before turn end (human-like turn-taking)
  },

  /** Whether to create a response after speech ends */
  createResponse: true,

  /** Whether the user can interrupt the agent */
  interruptResponse: true,
} as const;

// ============================================================================
// GREETING CONFIGURATION
// Human-like opening with space for the user to settle in
// ============================================================================

/**
 * Greeting Phase Configuration
 *
 * The greeting is the most important moment - it sets the tone for everything.
 * We want it to feel like a friend opening the door, not a robot starting a script.
 *
 * Key principles:
 * 1. CLARITY - The greeting must be fully audible before we start listening
 * 2. BREATHING ROOM - Natural pause after greeting for user to settle
 * 3. WARMTH - No aggressive listening that makes user feel rushed
 */
export const GREETING_CONFIG = {
  /**
   * Grace period AFTER greeting finishes before full VAD sensitivity (ms)
   * This gives the user a moment to:
   * - Process what was said
   * - Settle into the conversation
   * - Prepare their response
   *
   * Think of it like a friend saying "Hey, how are you?" and then
   * giving you a moment rather than staring expectantly.
   */
  get graceperiodMs(): number {
    const envValue = process.env.GREETING_GRACE_PERIOD_MS;
    if (envValue) {
      const parsed = parseInt(envValue, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return 1200; // Default: 1.2 seconds of breathing room after greeting
  },

  /**
   * Higher silence duration during greeting phase (ms)
   * More tolerant of pauses while user is settling in
   */
  get silenceDurationMs(): number {
    const envValue = process.env.GREETING_SILENCE_DURATION_MS;
    if (envValue) {
      const parsed = parseInt(envValue, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return 900; // Default: 900ms - more patient during opening
  },

  /**
   * Slightly higher threshold during greeting phase
   * Less likely to trigger on settling-in sounds (adjusting mic, etc.)
   */
  get threshold(): number {
    const envValue = process.env.GREETING_VAD_THRESHOLD;
    if (envValue) {
      const parsed = parseFloat(envValue);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
    return 0.7; // Default: slightly less sensitive during opening
  },
} as const;

export default {
  SILENCE_THRESHOLDS,
  PROCESSING_TIMEOUTS,
  PROGRESSIVE_TIMEOUTS,
  API_TIMEOUTS,
  RATE_LIMITS,
  CONVERSATION,
  AUDIO,
  VAD_CONFIG,
  GREETING_CONFIG,
};
