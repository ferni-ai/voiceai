/**
 * Vector Search Result Cache
 *
 * Caches search results to avoid repeated Firestore queries and similarity calculations.
 * Uses a combination of query hash + filter hash for cache key.
 *
 * Key insight: Within a session, similar semantic queries occur repeatedly
 * (e.g., context retrieval for the same topic). Caching results avoids:
 * 1. Embedding generation (even with embedding cache, there's still lookup overhead)
 * 2. Firestore findNearest queries
 * 3. SIMD similarity calculations
 *
 * @module memory/firestore-vector-store/search-cache
 */
import { createHash } from 'crypto';
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger();
const DEFAULT_CONFIG = {
    maxSize: 500,
    ttlMs: 5 * 60 * 1000, // 5 minutes
    enableFuzzyMatch: true,
    fuzzyThreshold: 0.95,
};
// ============================================================================
// SEARCH CACHE CLASS
// ============================================================================
export class VectorSearchCache {
    cache = new Map();
    config;
    stats = {
        hits: 0,
        misses: 0,
        fuzzyHits: 0,
        evictions: 0,
    };
    // Index for fuzzy matching (query embeddings)
    embeddingIndex = [];
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Generate cache key from query + filter + options
     */
    generateKey(query, filter, options) {
        const keyData = {
            query: query.toLowerCase().trim(),
            filter: filter ? JSON.stringify(filter) : '',
            topK: options?.topK || 5,
            minScore: options?.minScore || 0,
        };
        return createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
    }
    /**
     * Check if entry is expired
     */
    isExpired(entry) {
        return Date.now() - entry.createdAt > this.config.ttlMs;
    }
    /**
     * Cosine similarity between two embeddings
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length)
            return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0)
            return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    /**
     * Find fuzzy match (semantically similar query)
     */
    findFuzzyMatch(queryEmbedding, filter, options) {
        if (!this.config.enableFuzzyMatch || this.embeddingIndex.length === 0) {
            return null;
        }
        const topK = options?.topK || 5;
        const minScore = options?.minScore || 0;
        let bestMatch = null;
        let bestSimilarity = 0;
        for (const { key, embedding } of this.embeddingIndex) {
            const cached = this.cache.get(key);
            if (!cached || this.isExpired(cached))
                continue;
            // Check if options match
            if (cached.options.topK !== topK || cached.options.minScore !== minScore)
                continue;
            // Check if filter matches
            const filterMatch = JSON.stringify(filter || {}) === JSON.stringify(cached.filter || {});
            if (!filterMatch)
                continue;
            // Calculate similarity
            const similarity = this.cosineSimilarity(queryEmbedding, embedding);
            if (similarity >= this.config.fuzzyThreshold && similarity > bestSimilarity) {
                bestMatch = cached;
                bestSimilarity = similarity;
            }
        }
        return bestMatch;
    }
    /**
     * Get cached search results
     */
    get(query, queryEmbedding, filter, options) {
        // Exact match first
        const key = this.generateKey(query, filter, options);
        const cached = this.cache.get(key);
        if (cached && !this.isExpired(cached)) {
            this.stats.hits++;
            cached.accessedAt = Date.now();
            cached.accessCount++;
            log.debug({ key: key.slice(0, 8), query: query.slice(0, 30) }, 'Search cache hit (exact)');
            return cached.results;
        }
        // Try fuzzy match
        const fuzzyMatch = this.findFuzzyMatch(queryEmbedding, filter, options);
        if (fuzzyMatch) {
            this.stats.hits++;
            this.stats.fuzzyHits++;
            fuzzyMatch.accessedAt = Date.now();
            fuzzyMatch.accessCount++;
            log.debug({ key: fuzzyMatch.key.slice(0, 8), originalQuery: query.slice(0, 30), matchedQuery: fuzzyMatch.query.slice(0, 30) }, 'Search cache hit (fuzzy)');
            return fuzzyMatch.results;
        }
        this.stats.misses++;
        return null;
    }
    /**
     * Cache search results
     */
    set(query, queryEmbedding, results, filter, options) {
        const key = this.generateKey(query, filter, options);
        // Evict if at capacity
        if (this.cache.size >= this.config.maxSize) {
            this.evictLRU();
        }
        const entry = {
            key,
            query,
            queryEmbedding,
            filter,
            options: {
                topK: options?.topK || 5,
                minScore: options?.minScore || 0,
            },
            results,
            createdAt: Date.now(),
            accessedAt: Date.now(),
            accessCount: 1,
        };
        this.cache.set(key, entry);
        // Add to embedding index for fuzzy matching
        this.embeddingIndex.push({ key, embedding: queryEmbedding });
        log.debug({ key: key.slice(0, 8), query: query.slice(0, 30), resultCount: results.length }, 'Search cached');
    }
    /**
     * Evict least recently used entry
     */
    evictLRU() {
        let oldest = null;
        for (const [key, entry] of this.cache.entries()) {
            if (!oldest || entry.accessedAt < oldest.accessedAt) {
                oldest = { key, accessedAt: entry.accessedAt };
            }
        }
        if (oldest) {
            this.cache.delete(oldest.key);
            // Remove from embedding index
            this.embeddingIndex = this.embeddingIndex.filter((e) => e.key !== oldest.key);
            this.stats.evictions++;
            log.debug({ key: oldest.key.slice(0, 8) }, 'Search cache evicted');
        }
    }
    /**
     * Invalidate cache for a specific user (e.g., when their data changes)
     */
    invalidateForUser(userId) {
        let invalidated = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (entry.filter?.userId === userId) {
                this.cache.delete(key);
                invalidated++;
            }
        }
        // Rebuild embedding index
        if (invalidated > 0) {
            this.embeddingIndex = this.embeddingIndex.filter((e) => this.cache.has(e.key));
            log.debug({ userId, invalidated }, 'Search cache invalidated for user');
        }
        return invalidated;
    }
    /**
     * Clear all cached searches
     */
    clear() {
        this.cache.clear();
        this.embeddingIndex = [];
        this.stats = { hits: 0, misses: 0, fuzzyHits: 0, evictions: 0 };
        log.info('Search cache cleared');
    }
    /**
     * Prune expired entries
     */
    pruneExpired() {
        let pruned = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (this.isExpired(entry)) {
                this.cache.delete(key);
                pruned++;
            }
        }
        if (pruned > 0) {
            this.embeddingIndex = this.embeddingIndex.filter((e) => this.cache.has(e.key));
            log.debug({ pruned }, 'Search cache pruned');
        }
        return pruned;
    }
    /**
     * Get cache statistics
     */
    getStats() {
        const totalAccesses = this.stats.hits + this.stats.misses;
        return {
            size: this.cache.size,
            maxSize: this.config.maxSize,
            hits: this.stats.hits,
            misses: this.stats.misses,
            fuzzyHits: this.stats.fuzzyHits,
            hitRate: totalAccesses > 0 ? this.stats.hits / totalAccesses : 0,
            evictions: this.stats.evictions,
        };
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultSearchCache = null;
/**
 * Get the default search cache instance
 */
export function getVectorSearchCache(config) {
    if (!defaultSearchCache) {
        defaultSearchCache = new VectorSearchCache(config);
    }
    return defaultSearchCache;
}
/**
 * Reset the search cache (for testing)
 */
export function resetVectorSearchCache() {
    if (defaultSearchCache) {
        defaultSearchCache.clear();
        defaultSearchCache = null;
    }
}
//# sourceMappingURL=search-cache.js.map