/**
 * Session Manager Constants
 *
 * Configuration constants for session management.
 *
 * @module session-manager/constants
 */

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/** Maximum session age before automatic cleanup (4 hours) */
export const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/** Interval for checking orphaned sessions (15 minutes) */
export const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/** Timeout for session summarization during end (10 seconds) */
export const SUMMARIZE_TIMEOUT_MS = 10000;

/** Shutdown timeout for ending sessions (5 seconds) */
export const SHUTDOWN_TIMEOUT_MS = 5000;

/** Auto-save interval for intelligence state (30 seconds) */
export const AUTO_SAVE_INTERVAL_MS = 30000;

/** Maximum humanizing state updates per session */
export const MAX_HUMANIZING_UPDATES = 100;

// ============================================================================
// VALIDATION
// ============================================================================

/** Minimum valid user ID length */
export const MIN_USER_ID_LENGTH = 4;

/** Maximum valid user ID length */
export const MAX_USER_ID_LENGTH = 128;

/** Regex pattern for valid user IDs */
export const USER_ID_PATTERN = /^[a-zA-Z0-9_\-.@:]+$/;
