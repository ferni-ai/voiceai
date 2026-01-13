/**
 * Session Manager Constants
 *
 * Configuration constants for session management.
 * Supports environment variable overrides for production flexibility.
 *
 * @module session-manager/constants
 */
// ============================================================================
// HELPER: Parse duration from environment
// ============================================================================
/**
 * Parse duration from environment variable.
 * Supports formats: "4h", "30m", "60s", or plain milliseconds.
 *
 * @example
 * parseDurationMs("4h", 0)     // 14400000 (4 hours in ms)
 * parseDurationMs("30m", 0)    // 1800000 (30 minutes in ms)
 * parseDurationMs("60s", 0)    // 60000 (60 seconds in ms)
 * parseDurationMs("1000", 0)   // 1000 (raw milliseconds)
 * parseDurationMs(undefined, 5000) // 5000 (default)
 */
export function parseDurationMs(value, defaultMs) {
    if (!value)
        return defaultMs;
    // Plain number = milliseconds
    const numericValue = Number(value);
    if (!isNaN(numericValue))
        return numericValue;
    // Parse duration strings like "4h", "30m", "60s"
    const match = value.match(/^(\d+(?:\.\d+)?)(h|m|s)$/i);
    if (!match)
        return defaultMs;
    const amount = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
        case 'h':
            return amount * 60 * 60 * 1000;
        case 'm':
            return amount * 60 * 1000;
        case 's':
            return amount * 1000;
        default:
            return defaultMs;
    }
}
// ============================================================================
// SESSION LIFECYCLE
// ============================================================================
/**
 * Maximum session age before automatic cleanup.
 * Default: 4 hours. Override with SESSION_MAX_AGE env var (e.g., "4h", "240m", "14400000")
 */
export const SESSION_MAX_AGE_MS = parseDurationMs(process.env.SESSION_MAX_AGE, 4 * 60 * 60 * 1000 // 4 hours default
);
/**
 * Interval for checking orphaned sessions.
 * Default: 15 minutes. Override with SESSION_CLEANUP_INTERVAL env var.
 */
export const SESSION_CLEANUP_INTERVAL_MS = parseDurationMs(process.env.SESSION_CLEANUP_INTERVAL, 15 * 60 * 1000 // 15 minutes default
);
/** Timeout for session summarization during end (10 seconds) */
export const SUMMARIZE_TIMEOUT_MS = 10000;
/** Shutdown timeout for ending sessions (5 seconds) */
export const SHUTDOWN_TIMEOUT_MS = 5000;
/** Auto-save interval for intelligence state (30 seconds) */
export const AUTO_SAVE_INTERVAL_MS = 30000;
/** Maximum humanizing state updates per session */
export const MAX_HUMANIZING_UPDATES = 100;
// ============================================================================
// TRANSCRIPT RETENTION
// ============================================================================
/**
 * Transcript retention period in days.
 * Default: 90 days. Override with TRANSCRIPT_RETENTION_DAYS env var.
 * Used by scheduled cleanup jobs to remove old transcripts from Firestore.
 */
export const TRANSCRIPT_RETENTION_DAYS = parseInt(process.env.TRANSCRIPT_RETENTION_DAYS || '90', 10);
/**
 * Conversation summary retention in days.
 * Default: 365 days (1 year). Override with SUMMARY_RETENTION_DAYS env var.
 * Summaries are kept longer than raw transcripts for memory continuity.
 */
export const SUMMARY_RETENTION_DAYS = parseInt(process.env.SUMMARY_RETENTION_DAYS || '365', 10);
/**
 * Group conversation transcript retention in days.
 * Default: 180 days (6 months). Override with GROUP_TRANSCRIPT_RETENTION_DAYS env var.
 * Group transcripts may contain sensitive multi-party discussions.
 */
export const GROUP_TRANSCRIPT_RETENTION_DAYS = parseInt(process.env.GROUP_TRANSCRIPT_RETENTION_DAYS || '180', 10);
// ============================================================================
// VALIDATION
// ============================================================================
/** Minimum valid user ID length */
export const MIN_USER_ID_LENGTH = 4;
/** Maximum valid user ID length */
export const MAX_USER_ID_LENGTH = 128;
/** Regex pattern for valid user IDs */
export const USER_ID_PATTERN = /^[a-zA-Z0-9_\-.@:]+$/;
//# sourceMappingURL=constants.js.map