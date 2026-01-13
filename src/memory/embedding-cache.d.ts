/**
 * Embedding Cache
 *
 * Intelligent caching layer for embeddings to reduce API calls and latency.
 * Uses content hashing for deduplication and LRU eviction for memory management.
 *
 * Philosophy: Embeddings are expensive to generate but stable for the same text.
 * Cache aggressively, prefetch intelligently, and never regenerate unnecessarily.
 */
import { type MemoryError, type Result } from './result.js';
import { type PerformanceMetricsCallbacks } from '../types/performance-metrics-types.js';
/**
 * Configure performance metrics callbacks.
 * Called by services layer during initialization.
 */
export declare function configureEmbeddingCacheMetrics(callbacks: PerformanceMetricsCallbacks): void;
export interface CachedEmbedding {
    embedding: number[];
    hash: string;
    createdAt: number;
    accessedAt: number;
    accessCount: number;
    model: string;
    textLength: number;
}
export interface EmbeddingCacheConfig {
    /** Maximum number of embeddings to cache (default: 10000) */
    maxSize: number;
    /** TTL in milliseconds (default: 24 hours) */
    ttlMs: number;
    /** Enable persistent cache to Redis/Firestore (default: false) */
    persistentCache: boolean;
    /** Minimum text length to cache (short texts may not be worth caching) */
    minTextLength: number;
    /** Redis URL for persistent cache (optional) */
    redisUrl?: string;
    /** Firestore collection for persistent cache (optional) */
    firestoreCollection?: string;
}
export interface CacheStats {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    totalBytesEstimate: number;
    persistentCacheEnabled: boolean;
    persistentHits: number;
    persistentMisses: number;
}
export declare class EmbeddingCache {
    private cache;
    private config;
    private stats;
    private redisClient;
    private redisInitPromise;
    private readonly REDIS_PREFIX;
    constructor(config?: Partial<EmbeddingCacheConfig>);
    /**
     * Initialize Redis connection for persistent caching
     */
    private initRedis;
    /**
     * Get embedding from Redis (persistent cache)
     */
    private getFromRedis;
    /**
     * Store embedding in Redis (persistent cache)
     */
    private setInRedis;
    /**
     * Get embedding with cache-first strategy
     * Checks: in-memory cache → Redis cache → generate new
     */
    get(text: string): Promise<Result<number[], MemoryError>>;
    /**
     * Get or compute multiple embeddings with batching optimization
     */
    getBatch(texts: string[]): Promise<Result<number[][], MemoryError>>;
    /**
     * Prefetch embeddings for expected queries (e.g., during session start)
     */
    prefetch(texts: string[]): Promise<void>;
    /**
     * Check if an embedding is cached (without fetching)
     */
    has(text: string): boolean;
    /**
     * Invalidate a specific cached embedding
     */
    invalidate(text: string): boolean;
    /**
     * Clear all cached embeddings
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Close Redis connection (call on shutdown)
     */
    close(): Promise<void>;
    /**
     * Warm up cache with common/important embeddings
     */
    warmUp(texts: string[]): Promise<number>;
    /**
     * Set a cached embedding (both in-memory and Redis)
     */
    private set;
    /**
     * Set embedding in in-memory cache only
     */
    private setInMemory;
    /**
     * Check if a cached embedding is expired
     */
    private isExpired;
    /**
     * Evict least recently used embeddings
     */
    private evictLRU;
    /**
     * Generate content hash for text
     */
    private hashText;
    /**
     * Prune expired entries (run periodically)
     */
    pruneExpired(): number;
}
/**
 * Get the default embedding cache instance (thread-safe)
 * Uses synchronous singleton pattern - safe because EmbeddingCache
 * constructor is synchronous. Multiple concurrent calls will get
 * the same instance after the first call completes.
 */
export declare function getEmbeddingCache(config?: Partial<EmbeddingCacheConfig>): EmbeddingCache;
/**
 * Reset the default cache (for testing)
 */
export declare function resetEmbeddingCache(): void;
/**
 * Get embedding with caching (drop-in replacement for embed)
 */
export declare function embedCached(text: string): Promise<Result<number[], MemoryError>>;
/**
 * Get batch embeddings with caching
 */
export declare function embedBatchCached(texts: string[]): Promise<Result<number[][], MemoryError>>;
/**
 * Prefetch embeddings (non-blocking)
 * Returns immediately, computation happens in background
 */
export declare function prefetchEmbeddings(texts: string[]): void;
/**
 * Precompute embeddings for user memories on session start
 *
 * Call this at session start to warm the cache with likely queries.
 * Non-blocking - returns immediately and computes in background.
 *
 * Performance: Eliminates embedding latency during conversation
 * - First turn latency: ~200ms saved
 * - Memory recall latency: ~100-200ms saved per query
 */
export declare function precomputeUserMemoryEmbeddings(userMemories: Array<{
    content: string;
}>, options?: {
    /** Max memories to precompute (default: 100) */
    limit?: number;
    /** Priority keywords to include (e.g., recent topics) */
    priorityKeywords?: string[];
}): void;
/**
 * Get cache statistics for monitoring
 */
export declare function getEmbeddingCacheStats(): CacheStats;
declare const _default: {
    EmbeddingCache: typeof EmbeddingCache;
    getEmbeddingCache: typeof getEmbeddingCache;
    resetEmbeddingCache: typeof resetEmbeddingCache;
    embedCached: typeof embedCached;
    embedBatchCached: typeof embedBatchCached;
    prefetchEmbeddings: typeof prefetchEmbeddings;
    precomputeUserMemoryEmbeddings: typeof precomputeUserMemoryEmbeddings;
    getEmbeddingCacheStats: typeof getEmbeddingCacheStats;
};
export default _default;
//# sourceMappingURL=embedding-cache.d.ts.map