/**
 * ContextManager Registry
 *
 * Per-session singleton instances with automatic cleanup.
 *
 * Features:
 * - Per-session singleton pattern
 * - TTL-based automatic cleanup (30 min default)
 * - Max cache size limit (1000 sessions default)
 * - LRU eviction when cache is full
 *
 * @module context/registry
 */
import { createSessionId } from '../types/branded.js';
import { getLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../utils/interval-manager.js';
import { ContextManager } from './context-manager.class.js';
// ============================================================================
// CONFIGURATION
// ============================================================================
/** Session TTL in milliseconds (30 minutes) */
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Maximum number of cached context managers */
const MAX_CACHE_SIZE = 1000;
/** Cleanup interval in milliseconds (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
// ============================================================================
// STATE
// ============================================================================
const contextManagers = new Map();
const sessionTimestamps = new Map();
let cleanupIntervalId = null;
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Get or create a ContextManager for a session.
 * Automatically updates the session's last-accessed timestamp.
 */
export function getContextManager(sessionId, userProfile) {
    const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
    // Update timestamp (touch)
    sessionTimestamps.set(brandedId, Date.now());
    let manager = contextManagers.get(brandedId);
    if (!manager) {
        // Evict oldest if at capacity
        if (contextManagers.size >= MAX_CACHE_SIZE) {
            evictOldestSession();
        }
        manager = new ContextManager(brandedId, userProfile);
        contextManagers.set(brandedId, manager);
        getLogger().debug({ sessionId: brandedId }, 'Created new ContextManager');
    }
    else if (userProfile) {
        manager.setUserProfile(userProfile);
    }
    return manager;
}
/**
 * Check if a ContextManager exists for a session.
 */
export function hasContextManager(sessionId) {
    const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
    return contextManagers.has(brandedId);
}
/**
 * Remove a specific session's ContextManager.
 */
export function removeContextManager(sessionId) {
    const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
    if (contextManagers.has(brandedId)) {
        contextManagers.delete(brandedId);
        sessionTimestamps.delete(brandedId);
        getLogger().debug({ sessionId: brandedId }, 'Removed ContextManager');
    }
}
/**
 * Get the count of active context managers.
 */
export function getContextManagerCount() {
    return contextManagers.size;
}
/**
 * Clear all context managers (useful for testing).
 */
export function clearAllContextManagers() {
    const count = contextManagers.size;
    contextManagers.clear();
    sessionTimestamps.clear();
    if (count > 0) {
        getLogger().debug({ count }, 'Cleared all ContextManagers');
    }
}
/**
 * Touch a session to update its last-accessed time.
 * Useful when you want to keep a session alive without getting the manager.
 */
export function touchSession(sessionId) {
    const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
    if (contextManagers.has(brandedId)) {
        sessionTimestamps.set(brandedId, Date.now());
    }
}
/**
 * Get statistics about the registry.
 */
export function getRegistryStats() {
    let oldestAge = null;
    const now = Date.now();
    for (const timestamp of sessionTimestamps.values()) {
        const age = now - timestamp;
        if (oldestAge === null || age > oldestAge) {
            oldestAge = age;
        }
    }
    return {
        activeCount: contextManagers.size,
        maxSize: MAX_CACHE_SIZE,
        ttlMs: SESSION_TTL_MS,
        oldestSessionAgeMs: oldestAge,
    };
}
// ============================================================================
// CLEANUP
// ============================================================================
/**
 * Start the automatic cleanup interval.
 * Should be called during application startup.
 */
export function startRegistryCleanup() {
    if (cleanupIntervalId !== null) {
        return; // Already running
    }
    const clearFn = registerInterval('context-registry-cleanup', () => {
        cleanupExpiredSessions();
    }, CLEANUP_INTERVAL_MS);
    // Store a marker so we know cleanup is running (registerInterval handles tracking)
    cleanupIntervalId = 1;
    getLogger().debug('Started ContextManager registry cleanup interval');
}
/**
 * Stop the automatic cleanup interval.
 * Should be called during application shutdown.
 */
export function stopRegistryCleanup() {
    if (cleanupIntervalId !== null) {
        clearNamedInterval('context-registry-cleanup');
        cleanupIntervalId = null;
        getLogger().debug('Stopped ContextManager registry cleanup interval');
    }
}
/**
 * Manually trigger cleanup of expired sessions.
 * Removes sessions that haven't been accessed within TTL.
 */
export function cleanupExpiredSessions() {
    const now = Date.now();
    const expiredIds = [];
    for (const [id, timestamp] of sessionTimestamps.entries()) {
        if (now - timestamp > SESSION_TTL_MS) {
            expiredIds.push(id);
        }
    }
    for (const id of expiredIds) {
        contextManagers.delete(id);
        sessionTimestamps.delete(id);
    }
    if (expiredIds.length > 0) {
        getLogger().debug({ count: expiredIds.length }, 'Cleaned up expired ContextManagers');
    }
    return expiredIds.length;
}
// ============================================================================
// INTERNAL HELPERS
// ============================================================================
/**
 * Evict the oldest (least recently accessed) session to make room for new ones.
 */
function evictOldestSession() {
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [id, timestamp] of sessionTimestamps.entries()) {
        if (timestamp < oldestTime) {
            oldestTime = timestamp;
            oldestId = id;
        }
    }
    if (oldestId !== null) {
        contextManagers.delete(oldestId);
        sessionTimestamps.delete(oldestId);
        getLogger().debug({ sessionId: oldestId }, 'Evicted oldest ContextManager (cache full)');
    }
}
//# sourceMappingURL=registry.js.map