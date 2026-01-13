/**
 * Session Manager Constants
 *
 * Configuration constants for session management.
 * Supports environment variable overrides for production flexibility.
 *
 * @module session-manager/constants
 */
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
export declare function parseDurationMs(value: string | undefined, defaultMs: number): number;
/**
 * Maximum session age before automatic cleanup.
 * Default: 4 hours. Override with SESSION_MAX_AGE env var (e.g., "4h", "240m", "14400000")
 */
export declare const SESSION_MAX_AGE_MS: number;
/**
 * Interval for checking orphaned sessions.
 * Default: 15 minutes. Override with SESSION_CLEANUP_INTERVAL env var.
 */
export declare const SESSION_CLEANUP_INTERVAL_MS: number;
/** Timeout for session summarization during end (10 seconds) */
export declare const SUMMARIZE_TIMEOUT_MS = 10000;
/** Shutdown timeout for ending sessions (5 seconds) */
export declare const SHUTDOWN_TIMEOUT_MS = 5000;
/** Auto-save interval for intelligence state (30 seconds) */
export declare const AUTO_SAVE_INTERVAL_MS = 30000;
/** Maximum humanizing state updates per session */
export declare const MAX_HUMANIZING_UPDATES = 100;
/**
 * Transcript retention period in days.
 * Default: 90 days. Override with TRANSCRIPT_RETENTION_DAYS env var.
 * Used by scheduled cleanup jobs to remove old transcripts from Firestore.
 */
export declare const TRANSCRIPT_RETENTION_DAYS: number;
/**
 * Conversation summary retention in days.
 * Default: 365 days (1 year). Override with SUMMARY_RETENTION_DAYS env var.
 * Summaries are kept longer than raw transcripts for memory continuity.
 */
export declare const SUMMARY_RETENTION_DAYS: number;
/**
 * Group conversation transcript retention in days.
 * Default: 180 days (6 months). Override with GROUP_TRANSCRIPT_RETENTION_DAYS env var.
 * Group transcripts may contain sensitive multi-party discussions.
 */
export declare const GROUP_TRANSCRIPT_RETENTION_DAYS: number;
/** Minimum valid user ID length */
export declare const MIN_USER_ID_LENGTH = 4;
/** Maximum valid user ID length */
export declare const MAX_USER_ID_LENGTH = 128;
/** Regex pattern for valid user IDs */
export declare const USER_ID_PATTERN: RegExp;
//# sourceMappingURL=constants.d.ts.map