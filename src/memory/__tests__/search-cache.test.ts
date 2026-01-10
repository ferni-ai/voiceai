/**
 * Vector Search Cache Tests
 *
 * Tests for the search result caching system that reduces repeated
 * Firestore vector queries for semantically similar searches.
 *
 * @module memory/__tests__/search-cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VectorSearchCache,
  getVectorSearchCache,
  resetVectorSearchCache,
} from '../firestore-vector-store/search-cache.js';
import type { VectorSearchResult } from '../vector-store-interface.js';

// Helper to create mock embeddings
function createMockEmbedding(seed: number, dimension = 768): number[] {
  // Create a deterministic embedding based on seed
  const embedding: number[] = [];
  for (let i = 0; i < dimension; i++) {
    // Simple hash-like function for deterministic values
    embedding.push(Math.sin(seed * (i + 1) * 0.01) * 0.5);
  }
  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  return embedding.map((x) => x / norm);
}

// Helper to create mock search results
function createMockResults(count: number): VectorSearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    document: {
      id: `doc-${i}`,
      text: `Document content ${i}`,
      embedding: createMockEmbedding(i),
      metadata: { source: 'test', userId: 'user-1' },
    },
    score: 0.9 - i * 0.1,
  }));
}

describe('VectorSearchCache', () => {
  let cache: VectorSearchCache;

  beforeEach(() => {
    // Reset singleton and create fresh cache
    resetVectorSearchCache();
    cache = new VectorSearchCache({
      maxSize: 100,
      ttlMs: 60_000,
      enableFuzzyMatch: true,
      fuzzyThreshold: 0.95,
    });
  });

  describe('Exact Match Caching', () => {
    it('should return null for uncached query', () => {
      const embedding = createMockEmbedding(1);
      const result = cache.get('test query', embedding);
      expect(result).toBeNull();
    });

    it('should cache and retrieve results by exact query', () => {
      const query = 'What do we know about Mike?';
      const embedding = createMockEmbedding(1);
      const results = createMockResults(3);

      cache.set(query, embedding, results);

      const cached = cache.get(query, embedding);
      expect(cached).not.toBeNull();
      expect(cached).toHaveLength(3);
      expect(cached![0].document.id).toBe('doc-0');
    });

    it('should differentiate by filter', () => {
      const query = 'test query';
      const embedding = createMockEmbedding(1);
      const results1 = createMockResults(2);
      const results2 = createMockResults(3);

      cache.set(query, embedding, results1, { userId: 'user-1' });
      cache.set(query, embedding, results2, { userId: 'user-2' });

      const cached1 = cache.get(query, embedding, { userId: 'user-1' });
      const cached2 = cache.get(query, embedding, { userId: 'user-2' });

      expect(cached1).toHaveLength(2);
      expect(cached2).toHaveLength(3);
    });

    it('should differentiate by topK', () => {
      const query = 'test query';
      const embedding = createMockEmbedding(1);
      const results5 = createMockResults(5);
      const results10 = createMockResults(10);

      cache.set(query, embedding, results5, undefined, { topK: 5 });
      cache.set(query, embedding, results10, undefined, { topK: 10 });

      const cached5 = cache.get(query, embedding, undefined, { topK: 5 });
      const cached10 = cache.get(query, embedding, undefined, { topK: 10 });

      expect(cached5).toHaveLength(5);
      expect(cached10).toHaveLength(10);
    });
  });

  describe('Fuzzy Match Caching', () => {
    it('should return fuzzy match for similar embeddings', () => {
      const query1 = 'What do we know about Mike?';
      const query2 = 'Tell me about Mike';
      const embedding1 = createMockEmbedding(1);
      // Create very similar embedding (same seed, should be identical)
      const embedding2 = createMockEmbedding(1);
      const results = createMockResults(3);

      cache.set(query1, embedding1, results);

      // Should match because embeddings are identical (>0.95 similarity)
      const cached = cache.get(query2, embedding2);
      expect(cached).not.toBeNull();
      expect(cached).toHaveLength(3);
    });

    it('should not return fuzzy match for different embeddings', () => {
      const query1 = 'What do we know about Mike?';
      const query2 = 'What is the weather today?';
      const embedding1 = createMockEmbedding(1);
      // Completely different embedding
      const embedding2 = createMockEmbedding(100);
      const results = createMockResults(3);

      cache.set(query1, embedding1, results);

      // Should NOT match because embeddings are very different
      const cached = cache.get(query2, embedding2);
      expect(cached).toBeNull();
    });

    it('should respect filter constraints in fuzzy matching', () => {
      const query = 'test query';
      const embedding = createMockEmbedding(1);
      const results = createMockResults(3);

      cache.set(query, embedding, results, { userId: 'user-1' });

      // Same embedding but different filter - should not match
      const cached = cache.get(query, embedding, { userId: 'user-2' });
      expect(cached).toBeNull();
    });
  });

  describe('Cache Eviction', () => {
    it('should evict LRU entry when max size reached', () => {
      // Disable fuzzy matching for this test to avoid cross-query matching
      const smallCache = new VectorSearchCache({
        maxSize: 3,
        ttlMs: 60_000,
        enableFuzzyMatch: false,
      });

      // Fill cache (use seeds 1-3 to avoid seed=0 which produces NaN)
      for (let i = 1; i <= 3; i++) {
        smallCache.set(`query-${i}`, createMockEmbedding(i), createMockResults(1));
      }

      // Access first entry to make it more recently used
      smallCache.get('query-1', createMockEmbedding(1));

      // Add one more - should evict query-2 (LRU - oldest accessed)
      smallCache.set('query-4', createMockEmbedding(4), createMockResults(1));

      expect(smallCache.get('query-1', createMockEmbedding(1))).not.toBeNull();
      expect(smallCache.get('query-2', createMockEmbedding(2))).toBeNull(); // evicted (oldest)
      expect(smallCache.get('query-3', createMockEmbedding(3))).not.toBeNull();
      expect(smallCache.get('query-4', createMockEmbedding(4))).not.toBeNull();
    });
  });

  describe('User Invalidation', () => {
    it('should invalidate cache entries for a specific user', () => {
      const embedding = createMockEmbedding(1);
      const results = createMockResults(3);

      cache.set('query-1', embedding, results, { userId: 'user-1' });
      cache.set('query-2', embedding, results, { userId: 'user-2' });
      cache.set('query-3', embedding, results, { userId: 'user-1' });

      const invalidated = cache.invalidateForUser('user-1');

      expect(invalidated).toBe(2);
      expect(cache.get('query-1', embedding, { userId: 'user-1' })).toBeNull();
      expect(cache.get('query-2', embedding, { userId: 'user-2' })).not.toBeNull();
      expect(cache.get('query-3', embedding, { userId: 'user-1' })).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    it('should track hits, misses, and fuzzy hits', () => {
      const embedding = createMockEmbedding(1);
      const results = createMockResults(3);

      // Miss
      cache.get('query-1', embedding);

      // Set and hit
      cache.set('query-1', embedding, results);
      cache.get('query-1', embedding); // exact hit
      cache.get('query-1', embedding); // exact hit

      // Fuzzy hit (same embedding)
      cache.get('similar query', embedding);

      const stats = cache.getStats();

      expect(stats.hits).toBe(3); // 2 exact + 1 fuzzy
      expect(stats.misses).toBe(1);
      expect(stats.fuzzyHits).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.75, 2); // 3 hits / 4 total
    });

    it('should track evictions', () => {
      const smallCache = new VectorSearchCache({ maxSize: 2, ttlMs: 60_000 });

      smallCache.set('q1', createMockEmbedding(1), createMockResults(1));
      smallCache.set('q2', createMockEmbedding(2), createMockResults(1));
      smallCache.set('q3', createMockEmbedding(3), createMockResults(1)); // triggers eviction

      const stats = smallCache.getStats();
      expect(stats.evictions).toBe(1);
      expect(stats.size).toBe(2);
    });
  });

  describe('Clear and Prune', () => {
    it('should clear all cached entries', () => {
      cache.set('q1', createMockEmbedding(1), createMockResults(1));
      cache.set('q2', createMockEmbedding(2), createMockResults(2));

      cache.clear();

      expect(cache.get('q1', createMockEmbedding(1))).toBeNull();
      expect(cache.get('q2', createMockEmbedding(2))).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });

    it('should prune expired entries', async () => {
      // Create cache with very short TTL
      const shortTtlCache = new VectorSearchCache({ maxSize: 100, ttlMs: 10 });

      shortTtlCache.set('q1', createMockEmbedding(1), createMockResults(1));

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 20));

      const pruned = shortTtlCache.pruneExpired();
      expect(pruned).toBe(1);
      expect(shortTtlCache.getStats().size).toBe(0);
    });
  });

  describe('Singleton Factory', () => {
    it('should return same instance from factory', () => {
      resetVectorSearchCache();

      const instance1 = getVectorSearchCache();
      const instance2 = getVectorSearchCache();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton correctly', () => {
      const instance1 = getVectorSearchCache();
      instance1.set('test', createMockEmbedding(1), createMockResults(1));

      resetVectorSearchCache();

      const instance2 = getVectorSearchCache();
      expect(instance2.get('test', createMockEmbedding(1))).toBeNull();
    });
  });
});
