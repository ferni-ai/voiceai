/**
 * Session Access Functions
 *
 * Functions for accessing and managing active sessions.
 * Uses branded SessionId type for type-safe session identification.
 *
 * @module session-manager/access
 */
import { createSessionId } from '../../types/branded.js';
import { getLogger } from '../../utils/safe-logger.js';
import { SHUTDOWN_TIMEOUT_MS } from './constants.js';
// Reference to active sessions map (injected from main module)
let activeSessionsRef = null;
/**
 * Initialize access module with reference to active sessions map
 */
export function initializeAccess(sessions) {
    activeSessionsRef = sessions;
}
/**
 * Get existing session services by session ID
 *
 * @param sessionId - Session identifier (string or branded SessionId)
 * @returns Session services if session exists
 */
export function getSessionServices(sessionId) {
    if (!activeSessionsRef)
        return undefined;
    const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
    return activeSessionsRef.get(brandedId);
}
/**
 * Check if a session exists
 */
export function hasSession(sessionId) {
    if (!activeSessionsRef)
        return false;
    const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
    return activeSessionsRef.has(brandedId);
}
/**
 * Get all active session IDs
 */
export function getActiveSessionIds() {
    return activeSessionsRef ? Array.from(activeSessionsRef.keys()) : [];
}
/**
 * Get count of active sessions
 */
export function getActiveSessionCount() {
    return activeSessionsRef?.size ?? 0;
}
/**
 * Clear all active sessions (for shutdown)
 * Properly ends each session before clearing to prevent data loss
 *
 * @returns Number of sessions that were cleared
 */
export async function clearAllSessions() {
    if (!activeSessionsRef) {
        return 0;
    }
    const count = activeSessionsRef.size;
    if (count === 0) {
        return 0;
    }
    const log = getLogger();
    log.info({ count }, 'Ending all active sessions');
    // End all sessions in parallel with timeout to prevent blocking shutdown
    const endPromises = [];
    for (const [sessionId, services] of activeSessionsRef) {
        const endPromise = Promise.race([
            services.endSession().catch((err) => {
                log.warn({ sessionId, error: String(err) }, 'Error ending session during shutdown');
            }),
            new Promise((resolve) => {
                setTimeout(() => {
                    log.warn({ sessionId }, 'Session end timed out during shutdown');
                    resolve();
                }, SHUTDOWN_TIMEOUT_MS);
            }),
        ]);
        endPromises.push(endPromise);
    }
    await Promise.all(endPromises);
    activeSessionsRef.clear();
    log.info({ count }, 'All sessions ended');
    return count;
}
//# sourceMappingURL=access.js.map