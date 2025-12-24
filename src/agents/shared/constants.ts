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
   * turn-handler.ts fires at 4s - this acts as a backup fallback only.
   * See turn-handler.ts:148 and session-state-handler.ts:451
   */
  EARLY_ACKNOWLEDGMENT_SECONDS: 5.0,
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
 */
export const PROCESSING_TIMEOUTS = {
  /**
   * STATIC fallback for filler injection timing (ms)
   *
   * ADAPTIVE ALTERNATIVE: Use shouldInjectFiller() from adaptive-timing.ts
   * which adjusts based on actual processing latency.
   *
   * Reduced from 4s to 2s for faster perceived response.
   * Research shows human turn-taking gaps are 200-500ms.
   */
  TURN_PROCESSING_SOFT_TIMEOUT: 2000,

  /**
   * Hard timeout for turn processing (ms)
   *
   * Reduced from 12s to 8s - if we can't respond in 8s,
   * we should fall back to simpler context rather than delay further.
   */
  TURN_PROCESSING_HARD_TIMEOUT: 8000,
} as const;

// ============================================================================
// PROGRESSIVE TOOL EXECUTION (Better than Human)
// ============================================================================

/**
 * Progressive tool execution timeouts
 *
 * "Better than Human" means responding faster than humans expect.
 * These timeouts are tuned for perceived responsiveness.
 */
export const PROGRESSIVE_TIMEOUTS = {
  /**
   * Duration to wait silently before any feedback (ms)
   * Fast responses need no acknowledgment - feels instant
   * Reduced from 1.5s to 1s for snappier feel
   */
  SILENT_WINDOW: 1000,

  /**
   * When to send first acknowledgment "Checking..." (ms)
   * User knows we're working on it
   * Reduced from 2s to 1.5s
   */
  ACKNOWLEDGMENT_AT: 1500,

  /**
   * When to send update "Still looking..." (ms)
   * Reassures user for slower operations
   * Reduced from 5s to 3.5s
   */
  UPDATE_AT: 3500,

  /**
   * Hard timeout for tool execution (ms)
   * After this, return cached/fallback data
   * Reduced from 10s to 6s - fail fast, use cache
   */
  TOOL_HARD_TIMEOUT: 6000,

  /**
   * Maximum age of cached data to accept as fallback (ms)
   * Stale data is better than no data for most use cases
   */
  CACHE_MAX_AGE: 30 * 60 * 1000, // 30 minutes
} as const;

// ============================================================================
// API TIMEOUTS
// ============================================================================

export const API_TIMEOUTS = {
  /** Default timeout for external API calls (ms) */
  DEFAULT: 10_000,

  /** Timeout for news API calls (ms) */
  NEWS: 12_000,

  /** Timeout for stock quote calls (ms) */
  STOCK_QUOTE: 8_000,

  /** Timeout for weather API calls (ms) */
  WEATHER: 8_000,

  /** Timeout for search API calls (ms) */
  SEARCH: 15_000,
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

export default {
  SILENCE_THRESHOLDS,
  PROCESSING_TIMEOUTS,
  PROGRESSIVE_TIMEOUTS,
  API_TIMEOUTS,
  RATE_LIMITS,
  CONVERSATION,
  AUDIO,
};
