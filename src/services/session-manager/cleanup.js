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
import { getLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import { SESSION_MAX_AGE_MS, SESSION_CLEANUP_INTERVAL_MS } from './constants.js';
// Re-export for backward compatibility
export { SESSION_MAX_AGE_MS, SESSION_CLEANUP_INTERVAL_MS };
// ============================================================================
// STATE
// ============================================================================
let sessionCleanupInterval = null;
// Reference to active sessions map (injected from main module)
let activeSessionsRef = null;
/**
 * Initialize cleanup with reference to active sessions map
 */
export function initializeCleanup(sessions) {
    activeSessionsRef = sessions;
}
// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================
/**
 * Start periodic cleanup of orphaned sessions
 * Sessions older than SESSION_MAX_AGE_MS are automatically ended
 */
export function startSessionCleanup() {
    if (sessionCleanupInterval) {
        return; // Already running
    }
    registerInterval('session-manager-cleanup', () => {
        void cleanupOrphanedSessions();
    }, SESSION_CLEANUP_INTERVAL_MS);
    sessionCleanupInterval = 1; // Marker
    getLogger().info('🧹 Session cleanup scheduler started');
}
/**
 * Stop periodic session cleanup (for shutdown)
 */
export function stopSessionCleanup() {
    if (sessionCleanupInterval) {
        clearNamedInterval('session-manager-cleanup');
        sessionCleanupInterval = null;
        getLogger().info('🧹 Session cleanup scheduler stopped');
    }
}
/**
 * Clean up sessions that have exceeded their maximum age
 * This prevents memory leaks from clients that disconnect without properly ending sessions
 */
export async function cleanupOrphanedSessions() {
    if (!activeSessionsRef) {
        getLogger().warn('Session cleanup called before initialization');
        return 0;
    }
    const now = Date.now();
    let cleanedCount = 0;
    const orphanedSessions = [];
    for (const [sessionId, services] of activeSessionsRef) {
        const sessionAge = now - services.sessionStartTime;
        if (sessionAge > SESSION_MAX_AGE_MS) {
            orphanedSessions.push({
                sessionId,
                ageMinutes: Math.round(sessionAge / 60000),
            });
        }
    }
    if (orphanedSessions.length === 0) {
        return 0;
    }
    getLogger().warn({ orphanedCount: orphanedSessions.length, sessions: orphanedSessions }, '🧹 Cleaning up orphaned sessions');
    for (const { sessionId } of orphanedSessions) {
        const services = activeSessionsRef.get(sessionId);
        if (services) {
            try {
                await services.endSession();
                cleanedCount++;
            }
            catch (error) {
                // Force removal if endSession fails
                getLogger().error({ sessionId, error: String(error) }, 'Error ending orphaned session, force removing');
                activeSessionsRef.delete(sessionId);
                cleanedCount++;
            }
        }
    }
    getLogger().info({ cleanedCount }, '🧹 Orphaned session cleanup complete');
    return cleanedCount;
}
/**
 * Check if cleanup scheduler is running
 */
export function isCleanupRunning() {
    return sessionCleanupInterval !== null;
}
//# sourceMappingURL=cleanup.js.map