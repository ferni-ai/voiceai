/**
 * Shared Constants for Voice Agents
 *
 * Centralizes magic numbers and timing values for maintainability.
 */

// ============================================================================
// HANDOFF TRANSITION DELAYS
// These control the delay before transitioning to a new agent
// ============================================================================

export const HANDOFF_DELAYS = {
  /** User tapped to switch - be snappy and responsive (Apple-style) */
  USER_INITIATED: 200, // Was 600ms - too slow for user-initiated!

  /** First time meeting this agent - brief theatrical pause */
  FIRST_MEETING: 400, // Was 1400ms - way too theatrical!

  /** Coming back to the coach - warm, familiar transition */
  RETURNING_TO_COACH: 300, // Was 1000ms - should feel instant

  /** Standard agent-suggested handoff */
  STANDARD: 350, // Was 1200ms - too slow!
} as const;

// ============================================================================
// SILENCE DETECTION
// ============================================================================

export const SILENCE_THRESHOLDS = {
  /** Minimum time before responding to silence (ms) */
  MIN_RESPONSE_INTERVAL: 10_000,

  /** Duration of silence before considering user inactive (seconds) */
  INACTIVE_THRESHOLD_SECONDS: 30,
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
  HANDOFF_DELAYS,
  SILENCE_THRESHOLDS,
  API_TIMEOUTS,
  RATE_LIMITS,
  CONVERSATION,
  AUDIO,
};
