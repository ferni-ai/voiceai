/**
 * Firestore Vector Store Fallback Cache
 *
 * In-memory cache for when Firestore is unavailable.
 * Implements LRU-style eviction when cache is full.
 *
 * @module memory/firestore-vector-store/fallback-cache
 */
import { getLogger } from '../../utils/safe-logger.js';
// Centralized similarity operations - uses SIMD-ready implementation from rust-accelerator
import { topKSimilar } from '../rust-accelerator.js';
import { MAX_FALLBACK_CACHE_SIZE } from './types.js';
import { matchesFilter } from './helpers.js';
/**
 * Manages the in-memory fallback cache for when Firestore is unavailable.
 */
export class FallbackCache {
    cache = new Map();
    maxSize;
    constructor(maxSize = MAX_FALLBACK_CACHE_SIZE) {
        this.maxSize = maxSize;
    }
    /**
     * Add document to cache with LRU-style eviction.
     */
    add(id, doc, embedding) {
        // Evict oldest entries if at capacity
        if (this.cache.size >= this.maxSize) {
            const toEvict = Math.ceil(this.maxSize * 0.1);
            let evicted = 0;
            for (const key of this.cache.keys()) {
                if (evicted >= toEvict)
                    break;
                this.cache.delete(key);
                evicted++;
            }
            getLogger().warn({ evicted, remaining: this.cache.size }, 'Evicted entries from fallback cache due to size limit');
        }
        this.cache.set(id, { doc: { ...doc, embedding }, embedding });
    }
    /**
     * Get document from cache.
     */
    get(id) {
        return this.cache.get(id);
    }
    /**
     * Delete document from cache.
     */
    delete(id) {
        return this.cache.delete(id);
    }
    /**
     * Check if document exists in cache.
     */
    has(id) {
        return this.cache.has(id);
    }
    /**
     * Get cache size.
     */
    get size() {
        return this.cache.size;
    }
    /**
     * Clear all entries.
     */
    clear() {
        this.cache.clear();
    }
    /**
     * Get all entries.
     */
    entries() {
        return this.cache.entries();
    }
    /**
     * Get all values.
     */
    values() {
        return this.cache.values();
    }
    /**
     * Get all keys.
     */
    keys() {
        return this.cache.keys();
    }
    /**
     * Search fallback cache using cosine similarity.
     *
     * Uses SIMD-accelerated topKSimilar for batch similarity + ranking.
     */
    search(queryEmbedding, topK, filter, minScore = 0) {
        // Filter documents first and extract embeddings
        const candidateDocs = [];
        const candidateEmbeddings = [];
        for (const { doc, embedding } of this.cache.values()) {
            if (matchesFilter(doc, filter)) {
                candidateDocs.push(doc);
                candidateEmbeddings.push(embedding);
            }
        }
        if (candidateDocs.length === 0) {
            return [];
        }
        // Use SIMD-accelerated top-K search (computes all similarities + sorts + filters in one pass)
        const topKResult = topKSimilar(queryEmbedding, candidateEmbeddings, topK, minScore);
        // Map indices back to documents
        return topKResult.indices.map((idx, i) => ({
            document: candidateDocs[idx],
            score: topKResult.similarities[i],
        }));
    }
    /**
     * List documents matching filter.
     */
    list(filter) {
        const results = [];
        for (const { doc } of this.cache.values()) {
            if (matchesFilter(doc, filter)) {
                results.push(doc);
            }
        }
        return results;
    }
    /**
     * Get stats by source and category.
     */
    getStats() {
        const bySource = {};
        const byCategory = {};
        let count = 0;
        for (const { doc } of this.cache.values()) {
            count++;
            bySource[doc.metadata.source] = (bySource[doc.metadata.source] || 0) + 1;
            if (doc.metadata.category) {
                byCategory[doc.metadata.category] = (byCategory[doc.metadata.category] || 0) + 1;
            }
        }
        return { count, bySource, byCategory };
    }
}
//# sourceMappingURL=fallback-cache.js.map