/**
 * Memory Cache Manager
 *
 * Manages in-memory Maps with LRU eviction, TTL expiration, and memory pressure handling.
 * Prevents unbounded memory growth from caches that never get cleaned up.
 *
 * Philosophy: Memory is precious. Like a well-organized mind, we keep what's
 * frequently accessed and let rarely-used information fade gracefully.
 *
 * PERFORMANCE OPTIMIZATION (Jan 2026):
 * - Added RedisBackedCache for L2 caching with Redis
 * - L1 (memory) provides sub-ms access, L2 (Redis) provides cross-instance sharing
 * - Automatic fallback to memory-only if Redis is unavailable
 *
 * @module services/data-layer/memory-cache-manager
 */
interface CacheConfig {
    /** Maximum number of entries */
    maxEntries: number;
    /** TTL in milliseconds (0 = no TTL) */
    ttlMs: number;
    /** Whether to track access for LRU */
    trackAccess: boolean;
    /** Callback when entry is evicted */
    onEvict?: (key: string, value: unknown) => void;
}
interface CacheStats {
    entries: number;
    hits: number;
    misses: number;
    evictions: number;
    estimatedSizeBytes: number;
}
export declare class ManagedCache<K extends string, V> {
    private cache;
    private config;
    private stats;
    private name;
    constructor(name: string, config?: Partial<CacheConfig>);
    /**
     * Get a value from cache
     */
    get(key: K): V | undefined;
    /**
     * Set a value in cache
     */
    set(key: K, value: V): void;
    /**
     * Check if key exists (without updating access time)
     */
    has(key: K): boolean;
    /**
     * Delete a specific key
     */
    delete(key: K): boolean;
    /**
     * Clear all entries
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Cleanup expired entries (call periodically)
     */
    cleanup(): number;
    /**
     * Get all keys (for iteration)
     */
    keys(): K[];
    /**
     * Get size
     */
    get size(): number;
    private evictOne;
    private estimateSize;
}
interface RedisBackedCacheConfig extends CacheConfig {
    /** Redis key prefix for this cache */
    redisKeyPrefix: string;
    /** TTL for Redis entries in seconds (defaults to ttlMs / 1000) */
    redisTtlSeconds?: number;
    /** Whether to use compression for large values */
    useCompression?: boolean;
}
/**
 * Redis-backed cache with L1 (memory) + L2 (Redis) tiered caching.
 *
 * PERFORMANCE CHARACTERISTICS:
 * - L1 hit: ~0.001ms (in-memory Map access)
 * - L2 hit: ~1-5ms (Redis network call)
 * - L2 miss: ~1-5ms (Redis network call, then fallback)
 *
 * USE CASES:
 * - Cross-instance data sharing
 * - Persistence across container restarts
 * - Large datasets that benefit from distributed caching
 *
 * @example
 * const cache = await createRedisBackedCache<UserProfile>('user-profiles', {
 *   maxEntries: 1000,
 *   ttlMs: 5 * 60 * 1000,
 *   redisKeyPrefix: 'profile:',
 * });
 *
 * // Sync access (L1 only)
 * const profile = cache.get('user123');
 *
 * // Async access (L1 + L2)
 * const profile = await cache.getAsync('user123');
 */
export declare class RedisBackedCache<K extends string, V> extends ManagedCache<K, V> {
    private redis;
    private redisConfig;
    private redisStats;
    constructor(name: string, config: Partial<RedisBackedCacheConfig>);
    /**
     * Initialize Redis connection (call once after construction)
     */
    initializeRedis(): Promise<boolean>;
    /**
     * Check if Redis L2 is available
     */
    hasRedisL2(): boolean;
    /**
     * Get value (sync - L1 memory only, for latency-critical paths)
     */
    get(key: K): V | undefined;
    /**
     * Get value (async - L1 memory + L2 Redis)
     * Use this when latency is acceptable but cross-instance sharing is needed.
     */
    getAsync(key: K): Promise<V | undefined>;
    /**
     * Set value (writes to L1 memory and L2 Redis)
     */
    set(key: K, value: V): void;
    /**
     * Set value async (waits for Redis write confirmation)
     * Use when you need to ensure value is persisted before proceeding.
     */
    setAsync(key: K, value: V): Promise<void>;
    /**
     * Delete value (from L1 and L2)
     */
    delete(key: K): boolean;
    /**
     * Clear all entries (L1 and L2)
     * Note: L2 clear uses pattern delete which may be slow for large datasets
     */
    clear(): void;
    /**
     * Get extended stats including Redis L2 metrics
     */
    getExtendedStats(): CacheStats & {
        redisL2Enabled: boolean;
        l2Hits: number;
        l2Misses: number;
        l2Errors: number;
        l2HitRate: number;
    };
    private isValidEntry;
}
/**
 * Create a Redis-backed cache with automatic Redis initialization.
 * Falls back to memory-only if Redis is unavailable.
 */
export declare function createRedisBackedCache<V>(name: string, config?: Partial<RedisBackedCacheConfig>): Promise<RedisBackedCache<string, V>>;
/**
 * Create a Redis-backed user cache
 */
export declare function createRedisBackedUserCache<V>(name: string, options?: {
    maxUsers?: number;
    ttlMs?: number;
}): Promise<RedisBackedCache<string, V>>;
/**
 * Create a Redis-backed session cache
 */
export declare function createRedisBackedSessionCache<V>(name: string, options?: {
    maxSessions?: number;
    ttlMs?: number;
}): Promise<RedisBackedCache<string, V>>;
/**
 * Register a cache for management
 */
export declare function registerCache<K extends string, V>(name: string, config?: Partial<CacheConfig>): ManagedCache<K, V>;
/**
 * Get a registered cache by name
 */
export declare function getCache<K extends string, V>(name: string): ManagedCache<K, V> | undefined;
/**
 * Unregister and clear a cache
 */
export declare function unregisterCache(name: string): void;
/**
 * Start periodic cleanup of all registered caches
 */
export declare function startCacheCleanup(intervalMs?: number): void;
/**
 * Stop periodic cleanup
 */
export declare function stopCacheCleanup(): void;
/**
 * Clear all registered caches (for shutdown)
 */
export declare function clearAllCaches(): void;
/**
 * Get stats for all registered caches
 */
export declare function getAllCacheStats(): Record<string, CacheStats>;
/**
 * Get total memory estimate across all caches
 */
export declare function getTotalCacheMemory(): number;
/**
 * Clear all caches for a specific user (call at session end)
 * This handles the common pattern where cache keys are userId or userId_sessionId
 */
export declare function clearUserCaches(userId: string): number;
/**
 * Create a user-scoped cache (keys are userIds)
 */
export declare function createUserCache<V>(name: string, options?: {
    maxUsers?: number;
    ttlMs?: number;
}): ManagedCache<string, V>;
/**
 * Create a session-scoped cache (keys are sessionIds or userId_sessionId)
 */
export declare function createSessionCache<V>(name: string, options?: {
    maxSessions?: number;
    ttlMs?: number;
}): ManagedCache<string, V>;
/**
 * Create a short-lived cache for temporary data
 */
export declare function createTempCache<V>(name: string, options?: {
    maxEntries?: number;
    ttlMs?: number;
}): ManagedCache<string, V>;
export type { CacheConfig, CacheStats, RedisBackedCacheConfig };
//# sourceMappingURL=memory-cache-manager.d.ts.map