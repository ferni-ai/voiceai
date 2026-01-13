/**
 * Edge Cache Service
 *
 * Caches common data at the edge for reduced latency.
 * Particularly useful for persona bundles and configuration.
 *
 * Key Features:
 * - LRU cache with TTL support
 * - Stale-while-revalidate pattern
 * - Memory pressure handling
 * - Cache warming strategies
 *
 * @module EdgeCache
 */
export interface CacheConfig {
    /** Maximum number of entries (default: 1000) */
    maxSize?: number;
    /** Default TTL in ms (default: 300000 = 5 minutes) */
    defaultTtlMs?: number;
    /** Enable stale-while-revalidate (default: true) */
    staleWhileRevalidate?: boolean;
    /** Stale grace period in ms (default: 60000 = 1 minute) */
    staleTtlMs?: number;
    /** Enable compression for large values (default: false) */
    enableCompression?: boolean;
}
export interface CacheEntry<T> {
    value: T;
    createdAt: number;
    expiresAt: number;
    accessCount: number;
    lastAccessedAt: number;
    size: number;
    isStale: boolean;
}
export interface CacheStats {
    hits: number;
    misses: number;
    staleHits: number;
    evictions: number;
    currentSize: number;
    maxSize: number;
    hitRate: number;
    avgAccessCount: number;
}
type FetchFunction<T> = () => Promise<T>;
/**
 * LRU Cache with TTL and stale-while-revalidate support
 */
export declare class EdgeCache<T = unknown> {
    private cache;
    private config;
    private stats;
    private revalidating;
    constructor(config?: CacheConfig);
    /**
     * Get a value from cache
     */
    get(key: string): T | null;
    /**
     * Set a value in cache
     */
    set(key: string, value: T, ttlMs?: number): void;
    /**
     * Get or fetch with caching
     */
    getOrFetch(key: string, fetchFn: FetchFunction<T>, options?: {
        ttlMs?: number;
        forceRefresh?: boolean;
    }): Promise<T>;
    /**
     * Revalidate a cache entry in the background
     */
    private revalidateInBackground;
    /**
     * Delete a cache entry
     */
    delete(key: string): boolean;
    /**
     * Check if key exists and is valid
     */
    has(key: string): boolean;
    /**
     * Clear all entries
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Warm cache with multiple entries
     */
    warmCache(entries: Array<{
        key: string;
        fetchFn: FetchFunction<T>;
        ttlMs?: number;
    }>): Promise<{
        success: number;
        failed: number;
    }>;
    /**
     * Get all keys (for debugging/monitoring)
     */
    keys(): string[];
    private evictOldest;
    private estimateSize;
    private updateAccessStats;
    private updateHitRate;
}
/**
 * Get persona bundle cache instance
 */
export declare function getPersonaBundleCache(): EdgeCache;
/**
 * Cache a persona bundle
 */
export declare function cachePersonaBundle(personaId: string, bundle: unknown): void;
/**
 * Get cached persona bundle
 */
export declare function getCachedPersonaBundle(personaId: string): unknown | null;
/**
 * Get or load persona bundle with caching
 */
export declare function getOrLoadPersonaBundle<T>(personaId: string, loadFn: () => Promise<T>): Promise<T>;
/**
 * Get configuration cache instance
 */
export declare function getConfigCache(): EdgeCache;
/**
 * Cache a configuration value
 */
export declare function cacheConfig(key: string, value: unknown): void;
/**
 * Get cached configuration
 */
export declare function getCachedConfig<T>(key: string): T | null;
/**
 * Warm commonly-used caches on startup
 */
export declare function warmCommonCaches(): Promise<void>;
export {};
//# sourceMappingURL=edge-cache.d.ts.map