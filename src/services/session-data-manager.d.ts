/**
 * Session Data Manager
 *
 * Unified lifecycle management for all session-scoped user data caches.
 * Ensures Node stays stateless by:
 * 1. Tracking all services that cache user data
 * 2. Cleaning up on session disconnect
 * 3. TTL-based auto-eviction as safety net
 * 4. Memory monitoring and alerts
 *
 * Philosophy: "Node should be stateless - user data belongs in the database"
 *
 * @module SessionDataManager
 */
/**
 * Interface for services that cache user data
 */
export interface SessionDataService {
    /** Unique name for this service */
    name: string;
    /** Clear all cached data for a specific user */
    clearUserData: (userId: string) => void | Promise<void>;
    /** Clear ALL cached data (for shutdown) */
    clearAllData: () => void | Promise<void>;
    /** Get current cache statistics */
    getStats: () => {
        users: number;
        entries: number;
        sizeEstimate?: number;
    };
}
interface TrackedSession {
    userId: string;
    startedAt: number;
    lastActivity: number;
    services: Set<string>;
}
interface ManagerConfig {
    /** Max age for session data before auto-eviction (ms). Default: 4 hours */
    maxSessionAge: number;
    /** Interval for checking stale sessions (ms). Default: 5 minutes */
    evictionCheckInterval: number;
    /** Memory threshold (MB) to trigger aggressive cleanup. Default: 512MB */
    memoryThresholdMB: number;
    /** Enable verbose logging */
    verbose: boolean;
}
declare class SessionDataManagerImpl {
    private services;
    private sessions;
    private config;
    private isShuttingDown;
    constructor(config?: Partial<ManagerConfig>);
    /**
     * Register a service that caches user data.
     * All registered services will be cleaned up on session end.
     */
    registerService(service: SessionDataService): void;
    /**
     * Unregister a service (for testing or dynamic unloading)
     */
    unregisterService(name: string): void;
    /**
     * Mark that a session has started for a user.
     * Call this when a voice session connects.
     */
    sessionStarted(userId: string): void;
    /**
     * Mark that a service has cached data for a user.
     * This helps track which services need cleanup.
     */
    markServiceActive(userId: string, serviceName: string): void;
    /**
     * Clean up ALL cached data for a user.
     * Call this when a voice session disconnects.
     */
    sessionEnded(userId: string): Promise<{
        cleaned: string[];
        errors: string[];
    }>;
    /**
     * Update last activity time for a user.
     * Call this periodically during active sessions to prevent premature eviction.
     */
    touchSession(userId: string): void;
    /**
     * Start the automatic eviction timer.
     * This is a safety net for sessions that disconnect without proper cleanup.
     */
    startAutoEviction(): void;
    /**
     * Stop auto-eviction (for shutdown)
     */
    stopAutoEviction(): void;
    /**
     * Evict sessions that have been inactive too long.
     */
    evictStaleSessions(): Promise<number>;
    /**
     * Check memory usage and trigger tiered cleanup if needed.
     * Uses aggressive multi-level cleanup strategy:
     * - Level 1 (70%): Light cleanup - evict oldest 10% of sessions
     * - Level 2 (80%): Medium cleanup - evict oldest 25% + force GC
     * - Level 3 (90%): Aggressive cleanup - evict 50% + clear all service caches + force GC
     * - Level 4 (95%): Emergency cleanup - clear ALL caches
     */
    checkMemoryPressure(): Promise<{
        triggered: boolean;
        level: number;
        evicted: number;
        freedMB?: number;
    }>;
    /**
     * Start periodic memory pressure monitoring.
     * Checks more frequently than session eviction.
     */
    startMemoryMonitoring(intervalMs?: number): void;
    stopMemoryMonitoring(): void;
    /**
     * Get comprehensive statistics about all caches.
     */
    getStats(): {
        activeSessions: number;
        services: Record<string, {
            users: number;
            entries: number;
            sizeEstimate?: number;
        }>;
        memory: {
            heapUsedMB: number;
            heapMaxMB: number;
            percentUsed: number;
            rss: number;
        };
        oldestSessionAge: number | null;
    };
    /**
     * Graceful shutdown - flush and clear all caches.
     */
    shutdown(): Promise<void>;
}
/**
 * Get the singleton SessionDataManager instance.
 */
export declare function getSessionDataManager(): SessionDataManagerImpl;
/**
 * Initialize the SessionDataManager with config and start auto-eviction.
 */
export declare function initializeSessionDataManager(config?: Partial<ManagerConfig>): SessionDataManagerImpl;
/**
 * Shutdown the SessionDataManager.
 */
export declare function shutdownSessionDataManager(): Promise<void>;
/**
 * Creates a Map-like cache that automatically registers with SessionDataManager.
 * Use this as a drop-in replacement for module-level Maps that store user data.
 */
export declare function createSessionCache<T>(serviceName: string, options?: {
    /** Extract userId from a cache key (default: assumes key IS userId) */
    getUserIdFromKey?: (key: string) => string;
    /** Called when data for a user is cleared */
    onClear?: (userId: string) => void;
}): {
    get: (key: string) => T | undefined;
    set: (key: string, value: T) => void;
    delete: (key: string) => boolean;
    has: (key: string) => boolean;
    clear: () => void;
    size: number;
    entries: () => IterableIterator<[string, T]>;
    values: () => IterableIterator<T>;
    keys: () => IterableIterator<string>;
};
export type { ManagerConfig, TrackedSession };
declare const _default: {
    getSessionDataManager: typeof getSessionDataManager;
    initializeSessionDataManager: typeof initializeSessionDataManager;
    shutdownSessionDataManager: typeof shutdownSessionDataManager;
    createSessionCache: typeof createSessionCache;
};
export default _default;
//# sourceMappingURL=session-data-manager.d.ts.map