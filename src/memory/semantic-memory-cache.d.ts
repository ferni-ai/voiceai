/**
 * Semantic Memory Cache
 *
 * "Better than Human" optimization that caches memory query results
 * with semantic similarity matching. Instead of exact string matching,
 * this cache uses embeddings to find similar queries - so "What are my
 * hobbies?" can cache-hit on "Tell me about my interests."
 *
 * Target: 60-70% cache hit rate with 85% similarity threshold.
 *
 * @module SemanticMemoryCache
 */
export interface CachedQuery<T = unknown> {
    /** Original query string */
    query: string;
    /** Query embedding for similarity matching */
    embedding: number[];
    /** Cached result */
    result: T;
    /** When this was cached */
    timestamp: number;
    /** Hit count for analytics */
    hitCount: number;
}
export interface SemanticCacheConfig {
    /** Minimum cosine similarity for cache hit (0-1) */
    similarityThreshold: number;
    /** Time-to-live in milliseconds */
    ttlMs: number;
    /** Maximum entries per user */
    maxEntriesPerUser: number;
    /** Enable detailed logging */
    debug: boolean;
}
export interface CacheStats {
    /** Total cache hits */
    hits: number;
    /** Total cache misses */
    misses: number;
    /** Hit rate as percentage */
    hitRate: number;
    /** Average similarity score for hits */
    avgSimilarity: number;
    /** Total entries across all users */
    totalEntries: number;
    /** Number of users with cached data */
    userCount: number;
}
export interface CacheLookupResult<T> {
    /** Whether a cache hit occurred */
    hit: boolean;
    /** Cached result if hit */
    result?: T;
    /** Similarity score if hit */
    similarity?: number;
    /** Matched query if hit */
    matchedQuery?: string;
    /** Time saved in ms (estimated) */
    timeSavedMs?: number;
}
/**
 * Configure the semantic cache
 */
export declare function configureSemanticCache(options: Partial<SemanticCacheConfig>): void;
/**
 * Find similar cached query using embedding similarity
 *
 * @param userId - User ID to scope the cache
 * @param query - Query string to look up
 * @returns Cache lookup result with hit/miss and optional result
 */
export declare function findSimilarCached<T>(userId: string, query: string): Promise<CacheLookupResult<T>>;
/**
 * Store a query result in the semantic cache
 *
 * @param userId - User ID to scope the cache
 * @param query - Query string that was executed
 * @param result - Result to cache
 * @param embedding - Pre-computed embedding (optional, will generate if not provided)
 */
export declare function storeInSemanticCache<T>(userId: string, query: string, result: T, embedding?: number[]): Promise<void>;
/**
 * Wrapper function for memory queries with semantic caching
 *
 * @param userId - User ID
 * @param query - Query string
 * @param queryFn - Function that executes the actual query
 * @returns Query result (from cache or fresh)
 */
export declare function withSemanticCache<T>(userId: string, query: string, queryFn: () => Promise<T>): Promise<{
    result: T;
    cached: boolean;
    similarity?: number;
}>;
/**
 * Start automatic stale user cleanup
 */
export declare function startStaleUserCleanup(): void;
/**
 * Stop automatic stale user cleanup
 */
export declare function stopStaleUserCleanup(): void;
/**
 * Clear cache for a specific user (call on session end)
 */
export declare function clearUserSemanticCache(userId: string): void;
/**
 * Clear all semantic caches (use with caution)
 */
export declare function clearAllSemanticCaches(): void;
/**
 * Invalidate cache entries matching a pattern
 * Use when memory is updated and cached queries may be stale
 */
export declare function invalidateSemanticCache(userId: string, pattern?: string | RegExp): number;
/**
 * Get cache statistics
 */
export declare function getSemanticCacheStats(): CacheStats;
/**
 * Reset cache statistics (for testing)
 */
export declare function resetSemanticCacheStats(): void;
/**
 * Get detailed cache info for a user (for debugging)
 */
export declare function getUserCacheInfo(userId: string): {
    entryCount: number;
    queries: string[];
    oldestEntry: number | null;
    newestEntry: number | null;
};
declare const _default: {
    configureSemanticCache: typeof configureSemanticCache;
    findSimilarCached: typeof findSimilarCached;
    storeInSemanticCache: typeof storeInSemanticCache;
    withSemanticCache: typeof withSemanticCache;
    clearUserSemanticCache: typeof clearUserSemanticCache;
    clearAllSemanticCaches: typeof clearAllSemanticCaches;
    invalidateSemanticCache: typeof invalidateSemanticCache;
    getSemanticCacheStats: typeof getSemanticCacheStats;
    resetSemanticCacheStats: typeof resetSemanticCacheStats;
    getUserCacheInfo: typeof getUserCacheInfo;
    startStaleUserCleanup: typeof startStaleUserCleanup;
    stopStaleUserCleanup: typeof stopStaleUserCleanup;
};
export default _default;
//# sourceMappingURL=semantic-memory-cache.d.ts.map