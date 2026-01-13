/**
 * Session Cleanup Service
 *
 * Handles cleanup of orphaned sessions to prevent memory leaks.
 * Sessions older than SESSION_MAX_AGE_MS are automatically ended.
 *
 * TTL Configuration:
 * - SESSION_MAX_AGE: Maximum session age (default: "4h")
 * - SESSION_CLEANUP_INTERVAL: Cleanup check interval (default: "15m")
 *
 * @module session-manager/cleanup
 */
import type { SessionServices } from '../types.js';
import { SESSION_MAX_AGE_MS, SESSION_CLEANUP_INTERVAL_MS } from './constants.js';
export { SESSION_MAX_AGE_MS, SESSION_CLEANUP_INTERVAL_MS };
/**
 * Initialize cleanup with reference to active sessions map
 */
export declare function initializeCleanup(sessions: Map<string, SessionServices>): void;
/**
 * Start periodic cleanup of orphaned sessions
 * Sessions older than SESSION_MAX_AGE_MS are automatically ended
 */
export declare function startSessionCleanup(): void;
/**
 * Stop periodic session cleanup (for shutdown)
 */
export declare function stopSessionCleanup(): void;
/**
 * Clean up sessions that have exceeded their maximum age
 * This prevents memory leaks from clients that disconnect without properly ending sessions
 */
export declare function cleanupOrphanedSessions(): Promise<number>;
/**
 * Check if cleanup scheduler is running
 */
export declare function isCleanupRunning(): boolean;
//# sourceMappingURL=cleanup.d.ts.map