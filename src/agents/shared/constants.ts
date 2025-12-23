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

export const PROCESSING_TIMEOUTS = {
  /**
   * Maximum time to wait for turn processing before speaking a filler (ms)
   * DEAD AIR FIX: Prevents long silences during LLM processing
   * After this timeout, we speak a thinking filler and continue processing
   *
   * NOTE: 2.5s was too aggressive - LLM + tool calls often take 3-4s
   * Increased to 4s to reduce unnecessary fillers while still preventing dead air
   */
  TURN_PROCESSING_SOFT_TIMEOUT: 4000,

  /**
   * Hard timeout for turn processing - if exceeded, skip context building (ms)
   * This is the absolute maximum before we give up on rich context
   *
   * NOTE: Increased from 7s to 12s to allow progressive tool execution.
   * Tools now provide progressive feedback ("Checking...", "Still looking...")
   * so users know we're working on it. See src/tools/execution/ for details.
   */
  TURN_PROCESSING_HARD_TIMEOUT: 12000,
} as const;

// ============================================================================
// PROGRESSIVE TOOL EXECUTION (Better than Human)
// ============================================================================

export const PROGRESSIVE_TIMEOUTS = {
  /**
   * Duration to wait silently before any feedback (ms)
   * Fast responses (< 1.5s) need no acknowledgment - feels instant
   */
  SILENT_WINDOW: 1500,

  /**
   * When to send first acknowledgment "Checking..." (ms)
   * User knows we're working on it
   */
  ACKNOWLEDGMENT_AT: 2000,

  /**
   * When to send update "Still looking..." (ms)
   * Reassures user for slower operations
   */
  UPDATE_AT: 5000,

  /**
   * Hard timeout for tool execution (ms)
   * After this, return cached/fallback data
   */
  TOOL_HARD_TIMEOUT: 10000,

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
