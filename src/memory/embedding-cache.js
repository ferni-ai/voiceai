/**
 * Embedding Cache
 *
 * Intelligent caching layer for embeddings to reduce API calls and latency.
 * Uses content hashing for deduplication and LRU eviction for memory management.
 *
 * Philosophy: Embeddings are expensive to generate but stable for the same text.
 * Cache aggressively, prefetch intelligently, and never regenerate unnecessarily.
 */
import { createHash } from 'crypto';
import { getLogger } from '../utils/safe-logger.js';
import { embed, embedBatch, getEmbeddingProvider } from './embeddings.js';
import { err, memoryError, ok } from './result.js';
import { noopMetrics, } from '../types/performance-metrics-types.js';
const log = getLogger();
const CACHE_NAME = 'embeddings';
// Performance metrics callbacks - injected at runtime to avoid architecture violation
let metrics = noopMetrics;
/**
 * Configure performance metrics callbacks.
 * Called by services layer during initialization.
 */
export function configureEmbeddingCacheMetrics(callbacks) {
    metrics = callbacks;
}
// ============================================================================
// EMBEDDING CACHE
// ============================================================================
export class EmbeddingCache {
    cache = new Map();
    config;
    stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        persistentHits: 0,
        persistentMisses: 0,
    };
    // Redis client (lazy-loaded)
    redisClient = null;
    redisInitPromise = null;
    REDIS_PREFIX = 'emb:';
    constructor(config) {
        this.config = {
            maxSize: 10000,
            ttlMs: 24 * 60 * 60 * 1000, // 24 hours
            persistentCache: false,
            minTextLength: 10,
            ...config,
        };
        // Initialize Redis if persistent cache is enabled
        if (this.config.persistentCache && this.config.redisUrl) {
            this.initRedis().catch((err) => {
                log.warn({ error: String(err) }, 'Failed to initialize Redis for embedding cache');
            });
        }
    }
    /**
     * Initialize Redis connection for persistent caching
     */
    async initRedis() {
        if (this.redisInitPromise)
            return this.redisInitPromise;
        this.redisInitPromise = (async () => {
            try {
                // Dynamic import to avoid loading redis unless needed
                const moduleName = 'ioredis';
                const importFn = new Function('m', 'return import(m)');
                const redisModule = (await importFn(moduleName).catch(() => null));
                if (!redisModule?.default) {
                    log.warn('ioredis module not available for persistent cache');
                    return false;
                }
                const Redis = redisModule.default;
                this.redisClient = new Redis(this.config.redisUrl);
                // Test connection
                const client = this.redisClient;
                await client.ping();
                log.info('Redis connected for persistent embedding cache');
                return true;
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Redis connection failed for embedding cache');
                this.redisClient = null;
                return false;
            }
        })();
        return this.redisInitPromise;
    }
    /**
     * Get embedding from Redis (persistent cache)
     */
    async getFromRedis(hash) {
        if (!this.redisClient)
            return null;
        try {
            const client = this.redisClient;
            const data = await client.get(this.REDIS_PREFIX + hash);
            if (data) {
                const cached = JSON.parse(data);
                this.stats.persistentHits++;
                return cached;
            }
            this.stats.persistentMisses++;
            return null;
        }
        catch (error) {
            log.debug({ error: String(error), hash }, 'Redis get failed');
            return null;
        }
    }
    /**
     * Store embedding in Redis (persistent cache)
     */
    async setInRedis(hash, cached) {
        if (!this.redisClient)
            return;
        try {
            const client = this.redisClient;
            const ttlSeconds = Math.floor(this.config.ttlMs / 1000);
            await client.set(this.REDIS_PREFIX + hash, JSON.stringify(cached), 'EX', ttlSeconds);
        }
        catch (error) {
            log.debug({ error: String(error), hash }, 'Redis set failed');
        }
    }
    /**
     * Get embedding with cache-first strategy
     * Checks: in-memory cache → Redis cache → generate new
     */
    async get(text) {
        const hash = this.hashText(text);
        // Check in-memory cache first (fastest)
        const cached = this.cache.get(hash);
        if (cached && !this.isExpired(cached)) {
            this.stats.hits++;
            metrics.recordCacheHit(CACHE_NAME); // Performance metrics
            cached.accessedAt = Date.now();
            cached.accessCount++;
            log.debug(`Embedding cache hit (memory): ${hash.slice(0, 8)}...`);
            return ok(cached.embedding);
        }
        // Check Redis persistent cache (if enabled)
        if (this.config.persistentCache && this.redisClient) {
            const redisCached = await this.getFromRedis(hash);
            if (redisCached && !this.isExpired(redisCached)) {
                // Promote to in-memory cache
                this.setInMemory(hash, redisCached);
                this.stats.hits++;
                metrics.recordCacheHit(CACHE_NAME);
                log.debug(`Embedding cache hit (Redis): ${hash.slice(0, 8)}...`);
                return ok(redisCached.embedding);
            }
        }
        // Cache miss - generate embedding
        this.stats.misses++;
        metrics.recordCacheMiss(CACHE_NAME); // Performance metrics
        log.debug(`Embedding cache miss: ${hash.slice(0, 8)}...`);
        try {
            const embedding = await embed(text);
            // Cache if text is long enough
            if (text.length >= this.config.minTextLength) {
                await this.set(hash, embedding, text.length);
            }
            return ok(embedding);
        }
        catch (error) {
            return err(memoryError('embedding_failed', `Failed to generate embedding: ${error}`, {
                retryable: true,
                cause: error instanceof Error ? error : undefined,
            }));
        }
    }
    /**
     * Get or compute multiple embeddings with batching optimization
     */
    async getBatch(texts) {
        const results = new Array(texts.length).fill(null);
        const uncached = [];
        // Check cache for each text
        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            const hash = this.hashText(text);
            const cached = this.cache.get(hash);
            if (cached && !this.isExpired(cached)) {
                this.stats.hits++;
                cached.accessedAt = Date.now();
                cached.accessCount++;
                results[i] = cached.embedding;
            }
            else {
                this.stats.misses++;
                uncached.push({ index: i, text, hash });
            }
        }
        // Batch generate uncached embeddings
        if (uncached.length > 0) {
            try {
                const uncachedTexts = uncached.map((u) => u.text);
                const embeddings = await embedBatch(uncachedTexts);
                // Store results and cache
                for (let i = 0; i < uncached.length; i++) {
                    const { index, text, hash } = uncached[i];
                    const embedding = embeddings[i];
                    results[index] = embedding;
                    if (text.length >= this.config.minTextLength) {
                        void this.set(hash, embedding, text.length);
                    }
                }
            }
            catch (error) {
                return err(memoryError('embedding_failed', `Batch embedding failed: ${error}`, {
                    retryable: true,
                    cause: error instanceof Error ? error : undefined,
                }));
            }
        }
        return ok(results);
    }
    /**
     * Prefetch embeddings for expected queries (e.g., during session start)
     */
    async prefetch(texts) {
        // Filter out already cached texts
        const uncached = texts.filter((text) => {
            const hash = this.hashText(text);
            const cached = this.cache.get(hash);
            return !cached || this.isExpired(cached);
        });
        if (uncached.length === 0) {
            log.debug('Prefetch: all texts already cached');
            return;
        }
        log.info(`Prefetching ${uncached.length} embeddings`);
        // Generate in batches of 100
        const BATCH_SIZE = 100;
        for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
            const batch = uncached.slice(i, i + BATCH_SIZE);
            await this.getBatch(batch);
        }
    }
    /**
     * Check if an embedding is cached (without fetching)
     */
    has(text) {
        const hash = this.hashText(text);
        const cached = this.cache.get(hash);
        return !!cached && !this.isExpired(cached);
    }
    /**
     * Invalidate a specific cached embedding
     */
    invalidate(text) {
        const hash = this.hashText(text);
        return this.cache.delete(hash);
    }
    /**
     * Clear all cached embeddings
     */
    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, evictions: 0, persistentHits: 0, persistentMisses: 0 };
        log.info('Embedding cache cleared');
    }
    /**
     * Get cache statistics
     */
    getStats() {
        const totalAccesses = this.stats.hits + this.stats.misses;
        // Estimate memory usage (each float64 = 8 bytes)
        let totalBytes = 0;
        for (const cached of this.cache.values()) {
            totalBytes += cached.embedding.length * 8;
        }
        return {
            size: this.cache.size,
            maxSize: this.config.maxSize,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: totalAccesses > 0 ? this.stats.hits / totalAccesses : 0,
            evictions: this.stats.evictions,
            totalBytesEstimate: totalBytes,
            persistentCacheEnabled: this.config.persistentCache && !!this.redisClient,
            persistentHits: this.stats.persistentHits,
            persistentMisses: this.stats.persistentMisses,
        };
    }
    /**
     * Close Redis connection (call on shutdown)
     */
    async close() {
        if (this.redisClient) {
            try {
                const client = this.redisClient;
                await client.quit();
                log.info('Embedding cache Redis connection closed');
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Failed to close Redis connection');
            }
            this.redisClient = null;
        }
    }
    /**
     * Warm up cache with common/important embeddings
     */
    async warmUp(texts) {
        const start = Date.now();
        await this.prefetch(texts);
        const duration = Date.now() - start;
        log.info(`Cache warmed up with ${texts.length} embeddings in ${duration}ms`);
        return texts.length;
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    /**
     * Set a cached embedding (both in-memory and Redis)
     */
    async set(hash, embedding, textLength) {
        const provider = getEmbeddingProvider();
        const cached = {
            embedding,
            hash,
            createdAt: Date.now(),
            accessedAt: Date.now(),
            accessCount: 1,
            model: provider.model,
            textLength,
        };
        // Store in memory
        this.setInMemory(hash, cached);
        // Store in Redis (non-blocking)
        if (this.config.persistentCache && this.redisClient) {
            this.setInRedis(hash, cached).catch((err) => {
                log.debug({ error: String(err), hash }, 'Failed to persist embedding to Redis');
            });
        }
    }
    /**
     * Set embedding in in-memory cache only
     */
    setInMemory(hash, cached) {
        // Evict if at capacity
        if (this.cache.size >= this.config.maxSize) {
            this.evictLRU();
        }
        this.cache.set(hash, cached);
    }
    /**
     * Check if a cached embedding is expired
     */
    isExpired(cached) {
        return Date.now() - cached.createdAt > this.config.ttlMs;
    }
    /**
     * Evict least recently used embeddings
     */
    evictLRU() {
        // Find the least recently accessed entry
        let oldest = null;
        for (const [hash, cached] of this.cache.entries()) {
            if (!oldest || cached.accessedAt < oldest.accessedAt) {
                oldest = { hash, accessedAt: cached.accessedAt };
            }
        }
        if (oldest) {
            this.cache.delete(oldest.hash);
            this.stats.evictions++;
            metrics.recordCacheEviction(CACHE_NAME); // Performance metrics
            log.debug(`Evicted LRU embedding: ${oldest.hash.slice(0, 8)}...`);
        }
    }
    /**
     * Generate content hash for text
     */
    hashText(text) {
        return createHash('sha256').update(text).digest('hex');
    }
    /**
     * Prune expired entries (run periodically)
     */
    pruneExpired() {
        let pruned = 0;
        for (const [hash, cached] of this.cache.entries()) {
            if (this.isExpired(cached)) {
                this.cache.delete(hash);
                pruned++;
            }
        }
        if (pruned > 0) {
            log.info(`Pruned ${pruned} expired embeddings from cache`);
        }
        return pruned;
    }
}
// ============================================================================
// SINGLETON (Thread-Safe)
// ============================================================================
let defaultCache = null;
let defaultCacheConfig;
/**
 * Get the default embedding cache instance (thread-safe)
 * Uses synchronous singleton pattern - safe because EmbeddingCache
 * constructor is synchronous. Multiple concurrent calls will get
 * the same instance after the first call completes.
 */
export function getEmbeddingCache(config) {
    // Fast path: instance already exists
    if (defaultCache) {
        return defaultCache;
    }
    // Slow path: create instance (synchronous, so thread-safe in JS)
    // Store config for potential future use
    defaultCacheConfig = config;
    defaultCache = new EmbeddingCache(config);
    return defaultCache;
}
/**
 * Reset the default cache (for testing)
 */
export function resetEmbeddingCache() {
    if (defaultCache) {
        defaultCache.clear();
        defaultCache = null;
    }
    defaultCacheConfig = undefined;
}
// ============================================================================
// CACHED EMBEDDING FUNCTIONS
// ============================================================================
/**
 * Get embedding with caching (drop-in replacement for embed)
 */
export async function embedCached(text) {
    return getEmbeddingCache().get(text);
}
/**
 * Get batch embeddings with caching
 */
export async function embedBatchCached(texts) {
    return getEmbeddingCache().getBatch(texts);
}
/**
 * Prefetch embeddings (non-blocking)
 * Returns immediately, computation happens in background
 */
export function prefetchEmbeddings(texts) {
    // Fire and forget - don't block the caller
    getEmbeddingCache()
        .prefetch(texts)
        .catch((err) => {
        log.warn({ error: String(err), count: texts.length }, 'Background embedding prefetch failed');
    });
}
// ============================================================================
// USER MEMORY PRECOMPUTATION
// ============================================================================
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
export function precomputeUserMemoryEmbeddings(userMemories, options) {
    const limit = options?.limit ?? 100;
    const priorityKeywords = options?.priorityKeywords ?? [];
    // Collect texts to precompute
    const texts = [];
    // Add priority keywords first (likely query terms)
    for (const keyword of priorityKeywords) {
        if (keyword.length >= 3) {
            texts.push(keyword);
        }
    }
    // Add memory contents (most recent first, assuming array is sorted)
    for (let i = 0; i < Math.min(userMemories.length, limit); i++) {
        const { content } = userMemories[i];
        if (content && content.length >= 10) {
            texts.push(content);
        }
    }
    if (texts.length === 0) {
        log.debug('No user memories to precompute');
        return;
    }
    log.info({ count: texts.length, keywords: priorityKeywords.length }, '🔥 Precomputing user memory embeddings in background');
    // Fire and forget
    prefetchEmbeddings(texts);
}
/**
 * Get cache statistics for monitoring
 */
export function getEmbeddingCacheStats() {
    return getEmbeddingCache().getStats();
}
export default {
    EmbeddingCache,
    getEmbeddingCache,
    resetEmbeddingCache,
    embedCached,
    embedBatchCached,
    prefetchEmbeddings,
    precomputeUserMemoryEmbeddings,
    getEmbeddingCacheStats,
};
//# sourceMappingURL=embedding-cache.js.map