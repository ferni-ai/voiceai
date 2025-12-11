/**
 * Tests for Embedding Cache
 *
 * Validates the LRU caching behavior for embeddings,
 * including hit/miss tracking, deduplication, and batch operations.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingCache, getEmbeddingCache, resetEmbeddingCache } from '../embedding-cache.js';

// Mock the embeddings module
vi.mock('../embeddings.js', () => ({
  embed: vi.fn(async (text: string) => {
    // Return a simple hash-based mock embedding
    const hash = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return [hash % 1, (hash * 2) % 1, (hash * 3) % 1];
  }),
  embedBatch: vi.fn(async (texts: string[]) => {
    return texts.map((text) => {
      const hash = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return [hash % 1, (hash * 2) % 1, (hash * 3) % 1];
    });
  }),
  getEmbeddingProvider: vi.fn(() => 'mock'),
}));

describe('EmbeddingCache', () => {
  beforeEach(() => {
    resetEmbeddingCache();
    vi.clearAllMocks();
  });

  describe('singleton management', () => {
    it('should return the same instance via getEmbeddingCache', () => {
      const cache1 = getEmbeddingCache();
      const cache2 = getEmbeddingCache();
      expect(cache1).toBe(cache2);
    });

    it('should create new instance after reset', () => {
      const cache1 = getEmbeddingCache();
      resetEmbeddingCache();
      const cache2 = getEmbeddingCache();
      expect(cache1).not.toBe(cache2);
    });
  });

  describe('get operations', () => {
    it('should store and retrieve embeddings', async () => {
      const cache = new EmbeddingCache({ maxSize: 100 });
      const text = 'hello world test text';

      // First call generates embedding
      const result = await cache.get(text);
      expect(result.ok).toBe(true);

      // Second call should be a cache hit
      const result2 = await cache.get(text);
      expect(result2.ok).toBe(true);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should evict oldest entries when at capacity', async () => {
      const cache = new EmbeddingCache({ maxSize: 3, minTextLength: 1 });

      // Fill cache
      await cache.get('text one');
      await cache.get('text two');
      await cache.get('text three');

      // All should be misses
      let stats = cache.getStats();
      expect(stats.misses).toBe(3);
      expect(stats.size).toBe(3);

      // Add one more - should evict oldest
      await cache.get('text four');
      stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThanOrEqual(1);
    });
  });

  describe('statistics tracking', () => {
    it('should track cache hits and misses', async () => {
      const cache = new EmbeddingCache({ maxSize: 100, minTextLength: 5 });

      // Initial stats
      let stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);

      // Miss
      await cache.get('hello world');
      stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);

      // Hit
      await cache.get('hello world');
      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('batch operations', () => {
    it('should handle mixed cached/uncached items', async () => {
      const cache = new EmbeddingCache({ maxSize: 100, minTextLength: 5 });

      // Pre-cache one item
      await cache.get('cached text here');

      // Batch request with cached and new items
      const result = await cache.getBatch(['cached text here', 'new text one', 'new text two']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
      }
    });

    it('should batch generate uncached embeddings efficiently', async () => {
      const cache = new EmbeddingCache({ maxSize: 100, minTextLength: 5 });

      const result = await cache.getBatch([
        'first text here',
        'second text here',
        'third text here',
      ]);

      expect(result.ok).toBe(true);
      const stats = cache.getStats();
      expect(stats.misses).toBe(3);
    });
  });

  describe('content hashing', () => {
    it('should produce consistent hashes for same text', async () => {
      const cache = new EmbeddingCache({ maxSize: 100 });

      // Same text should produce same embedding
      await cache.get('hello world test');
      await cache.get('hello world test');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1); // Second call should be a hit
    });
  });

  describe('TTL expiration', () => {
    it('should have configurable TTL', () => {
      const cache = new EmbeddingCache({
        maxSize: 100,
        ttlMs: 1000, // 1 second TTL
      });

      // Just verify configuration is accepted
      expect(cache).toBeDefined();
    });
  });

  describe('minTextLength filtering', () => {
    it('should not cache very short texts', async () => {
      const cache = new EmbeddingCache({
        maxSize: 100,
        minTextLength: 20,
      });

      // Short text - should not be cached
      await cache.get('short');
      await cache.get('short');

      const stats = cache.getStats();
      // Both should be misses since text is too short to cache
      expect(stats.misses).toBe(2);
      expect(stats.hits).toBe(0);
    });
  });
});
