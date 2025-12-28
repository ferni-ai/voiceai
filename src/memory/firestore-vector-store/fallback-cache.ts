/**
 * Firestore Vector Store Fallback Cache
 *
 * In-memory cache for when Firestore is unavailable.
 * Implements LRU-style eviction when cache is full.
 *
 * @module memory/firestore-vector-store/fallback-cache
 */

import { getLogger } from '../../utils/safe-logger.js';
import { cosineSimilarity } from '../embeddings.js';
import type {
  VectorDocument,
  VectorFilter,
  VectorSearchResult,
} from '../vector-store-interface.js';
import type { FallbackCacheEntry } from './types.js';
import { MAX_FALLBACK_CACHE_SIZE } from './types.js';
import { matchesFilter } from './helpers.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

/**
 * Manages the in-memory fallback cache for when Firestore is unavailable.
 */
export class FallbackCache {
  private cache = new Map<string, FallbackCacheEntry>();
  private maxSize: number;

  constructor(maxSize = MAX_FALLBACK_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Add document to cache with LRU-style eviction.
   */
  add(id: string, doc: VectorDocument, embedding: number[]): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const toEvict = Math.ceil(this.maxSize * 0.1);
      let evicted = 0;
      for (const key of this.cache.keys()) {
        if (evicted >= toEvict) break;
        this.cache.delete(key);
        evicted++;
      }
      getLogger().warn(
        { evicted, remaining: this.cache.size },
        'Evicted entries from fallback cache due to size limit'
      );
    }

    this.cache.set(id, { doc: { ...doc, embedding }, embedding });
  }

  /**
   * Get document from cache.
   */
  get(id: string): FallbackCacheEntry | undefined {
    return this.cache.get(id);
  }

  /**
   * Delete document from cache.
   */
  delete(id: string): boolean {
    return this.cache.delete(id);
  }

  /**
   * Check if document exists in cache.
   */
  has(id: string): boolean {
    return this.cache.has(id);
  }

  /**
   * Get cache size.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get all entries.
   */
  entries(): IterableIterator<[string, FallbackCacheEntry]> {
    return this.cache.entries();
  }

  /**
   * Get all values.
   */
  values(): IterableIterator<FallbackCacheEntry> {
    return this.cache.values();
  }

  /**
   * Get all keys.
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * Search fallback cache using cosine similarity.
   */
  search(
    queryEmbedding: number[],
    topK: number,
    filter?: VectorFilter,
    minScore = 0
  ): VectorSearchResult[] {
    const results: VectorSearchResult[] = [];

    for (const { doc, embedding } of this.cache.values()) {
      // Apply filters
      if (!matchesFilter(doc, filter)) continue;

      const score = cosineSimilarity(queryEmbedding, embedding);
      if (score >= minScore) {
        results.push({ document: doc, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * List documents matching filter.
   */
  list(filter?: VectorFilter): VectorDocument[] {
    const results: VectorDocument[] = [];
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
  getStats(): {
    count: number;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
  } {
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
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
