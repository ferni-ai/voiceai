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
import type { VectorSearchResult, VectorFilter } from '../vector-store-interface.js';
interface SearchCacheConfig {
    /** Max cached queries (default: 500) */
    maxSize: number;
    /** TTL in milliseconds (default: 5 minutes) */
    ttlMs: number;
    /** Enable fuzzy matching for similar queries (default: true) */
    enableFuzzyMatch: boolean;
    /** Similarity threshold for fuzzy match (0-1, default: 0.95) */
    fuzzyThreshold: number;
}
interface SearchCacheStats {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    fuzzyHits: number;
    hitRate: number;
    evictions: number;
}
export declare class VectorSearchCache {
    private cache;
    private config;
    private stats;
    private embeddingIndex;
    constructor(config?: Partial<SearchCacheConfig>);
    /**
     * Generate cache key from query + filter + options
     */
    private generateKey;
    /**
     * Check if entry is expired
     */
    private isExpired;
    /**
     * Cosine similarity between two embeddings
     */
    private cosineSimilarity;
    /**
     * Find fuzzy match (semantically similar query)
     */
    private findFuzzyMatch;
    /**
     * Get cached search results
     */
    get(query: string, queryEmbedding: number[], filter?: VectorFilter, options?: {
        topK?: number;
        minScore?: number;
    }): VectorSearchResult[] | null;
    /**
     * Cache search results
     */
    set(query: string, queryEmbedding: number[], results: VectorSearchResult[], filter?: VectorFilter, options?: {
        topK?: number;
        minScore?: number;
    }): void;
    /**
     * Evict least recently used entry
     */
    private evictLRU;
    /**
     * Invalidate cache for a specific user (e.g., when their data changes)
     */
    invalidateForUser(userId: string): number;
    /**
     * Clear all cached searches
     */
    clear(): void;
    /**
     * Prune expired entries
     */
    pruneExpired(): number;
    /**
     * Get cache statistics
     */
    getStats(): SearchCacheStats;
}
/**
 * Get the default search cache instance
 */
export declare function getVectorSearchCache(config?: Partial<SearchCacheConfig>): VectorSearchCache;
/**
 * Reset the search cache (for testing)
 */
export declare function resetVectorSearchCache(): void;
export {};
//# sourceMappingURL=search-cache.d.ts.map