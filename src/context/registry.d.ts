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
import { type SessionId } from '../types/branded.js';
import type { UserProfile } from '../types/user-profile.js';
import { ContextManager } from './context-manager.class.js';
/**
 * Get or create a ContextManager for a session.
 * Automatically updates the session's last-accessed timestamp.
 */
export declare function getContextManager(sessionId: string | SessionId, userProfile?: UserProfile): ContextManager;
/**
 * Check if a ContextManager exists for a session.
 */
export declare function hasContextManager(sessionId: string | SessionId): boolean;
/**
 * Remove a specific session's ContextManager.
 */
export declare function removeContextManager(sessionId: string | SessionId): void;
/**
 * Get the count of active context managers.
 */
export declare function getContextManagerCount(): number;
/**
 * Clear all context managers (useful for testing).
 */
export declare function clearAllContextManagers(): void;
/**
 * Touch a session to update its last-accessed time.
 * Useful when you want to keep a session alive without getting the manager.
 */
export declare function touchSession(sessionId: string | SessionId): void;
/**
 * Get statistics about the registry.
 */
export declare function getRegistryStats(): {
    activeCount: number;
    maxSize: number;
    ttlMs: number;
    oldestSessionAgeMs: number | null;
};
/**
 * Start the automatic cleanup interval.
 * Should be called during application startup.
 */
export declare function startRegistryCleanup(): void;
/**
 * Stop the automatic cleanup interval.
 * Should be called during application shutdown.
 */
export declare function stopRegistryCleanup(): void;
/**
 * Manually trigger cleanup of expired sessions.
 * Removes sessions that haven't been accessed within TTL.
 */
export declare function cleanupExpiredSessions(): number;
//# sourceMappingURL=registry.d.ts.map