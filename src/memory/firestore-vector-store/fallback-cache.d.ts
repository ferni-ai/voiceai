/**
 * Firestore Vector Store Fallback Cache
 *
 * In-memory cache for when Firestore is unavailable.
 * Implements LRU-style eviction when cache is full.
 *
 * @module memory/firestore-vector-store/fallback-cache
 */
import type { VectorDocument, VectorFilter, VectorSearchResult } from '../vector-store-interface.js';
import type { FallbackCacheEntry } from './types.js';
/**
 * Manages the in-memory fallback cache for when Firestore is unavailable.
 */
export declare class FallbackCache {
    private cache;
    private maxSize;
    constructor(maxSize?: number);
    /**
     * Add document to cache with LRU-style eviction.
     */
    add(id: string, doc: VectorDocument, embedding: number[]): void;
    /**
     * Get document from cache.
     */
    get(id: string): FallbackCacheEntry | undefined;
    /**
     * Delete document from cache.
     */
    delete(id: string): boolean;
    /**
     * Check if document exists in cache.
     */
    has(id: string): boolean;
    /**
     * Get cache size.
     */
    get size(): number;
    /**
     * Clear all entries.
     */
    clear(): void;
    /**
     * Get all entries.
     */
    entries(): IterableIterator<[string, FallbackCacheEntry]>;
    /**
     * Get all values.
     */
    values(): IterableIterator<FallbackCacheEntry>;
    /**
     * Get all keys.
     */
    keys(): IterableIterator<string>;
    /**
     * Search fallback cache using cosine similarity.
     *
     * Uses SIMD-accelerated topKSimilar for batch similarity + ranking.
     */
    search(queryEmbedding: number[], topK: number, filter?: VectorFilter, minScore?: number): VectorSearchResult[];
    /**
     * List documents matching filter.
     */
    list(filter?: VectorFilter): VectorDocument[];
    /**
     * Get stats by source and category.
     */
    getStats(): {
        count: number;
        bySource: Record<string, number>;
        byCategory: Record<string, number>;
    };
}
//# sourceMappingURL=fallback-cache.d.ts.map