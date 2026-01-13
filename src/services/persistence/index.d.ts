/**
 * Unified Persistence Layer
 *
 * Provides a consistent pattern for persisting in-memory data to Firestore.
 * All services that need persistence should use this layer.
 *
 * Features:
 * - Debounced batch writes for efficiency
 * - Graceful shutdown with flush
 * - Startup rehydration
 * - Memory cleanup utilities
 * - Write-through for critical data
 *
 * @module PersistenceLayer
 */
export interface PersistenceConfig {
    /** Collection name in Firestore (under bogle_users/{userId}) */
    collection: string;
    /** Document ID (defaults to 'data') */
    documentId?: string;
    /** How often to batch sync (ms) - default 5000 */
    syncIntervalMs?: number;
    /** Max pending changes before forcing sync - default 20 */
    maxPendingChanges?: number;
    /** Whether to use root collection (not under bogle_users) */
    useRootCollection?: boolean;
}
export interface PersistenceStore<T> {
    /** Get data for a user */
    get: (userId: string) => Promise<T | null>;
    /** Set data for a user (queued for batch write) */
    set: (userId: string, data: T) => void;
    /** Set data and write immediately */
    setImmediate: (userId: string, data: T) => Promise<void>;
    /** Delete data for a user */
    delete: (userId: string) => Promise<void>;
    /** Mark data as dirty (needs sync) */
    markDirty: (userId: string) => void;
    /** Flush all pending changes */
    flush: () => Promise<void>;
    /** Flush changes for a specific user */
    flushUser: (userId: string) => Promise<void>;
    /** Load data from Firestore into memory */
    load: (userId: string) => Promise<T | null>;
    /** Clear memory cache for user */
    clearCache: (userId: string) => void;
    /** Clear all memory caches */
    clearAllCaches: () => void;
    /** Get stats about memory usage */
    getStats: () => {
        cached: number;
        dirty: number;
    };
    /** Shutdown (flush and cleanup) */
    shutdown: () => Promise<void>;
}
/**
 * Create a persistence store for a specific data type
 */
export declare function createPersistenceStore<T>(config: PersistenceConfig): PersistenceStore<T>;
/**
 * Initialize all persistence stores
 * Call this at application startup
 */
export declare function initializePersistence(): Promise<void>;
/**
 * Shutdown all persistence stores
 * Call this at application shutdown
 */
export declare function shutdownPersistence(): Promise<void>;
/**
 * Flush all pending changes across all stores
 */
export declare function flushAllStores(): Promise<void>;
/**
 * Get stats for all stores
 */
export declare function getAllStats(): Record<string, {
    cached: number;
    dirty: number;
}>;
declare const _default: {
    createPersistenceStore: typeof createPersistenceStore;
    initializePersistence: typeof initializePersistence;
    shutdownPersistence: typeof shutdownPersistence;
    flushAllStores: typeof flushAllStores;
    getAllStats: typeof getAllStats;
};
export default _default;
//# sourceMappingURL=index.d.ts.map