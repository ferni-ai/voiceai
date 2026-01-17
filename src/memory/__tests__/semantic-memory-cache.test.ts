/**
 * Semantic Memory Cache Tests
 *
 * Tests the "Better than Human" optimization that caches memory query
 * results with semantic similarity matching.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger (must include getLogger for rust-accelerator.ts import)
vi.mock('../../utils/safe-logger.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    createLogger: () => logger,
    getLogger: () => logger,
  };
});

// Mock embeddings
const mockEmbed = vi.fn();

vi.mock('../embeddings.js', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
}));

// Mock rust-accelerator - the cache uses topKSimilar from here, NOT cosineSimilarity from embeddings
// This is the key mock that makes tests work correctly
const mockTopKSimilar = vi.fn();

vi.mock('../rust-accelerator.js', () => ({
  topKSimilar: (...args: unknown[]) => mockTopKSimilar(...args),
}));

// Import after mocks
import {
  findSimilarCached,
  storeInSemanticCache,
  withSemanticCache,
  clearUserSemanticCache,
  clearAllSemanticCaches,
  invalidateSemanticCache,
  getSemanticCacheStats,
  resetSemanticCacheStats,
  getUserCacheInfo,
  configureSemanticCache,
} from '../semantic-memory-cache.js';

describe('Semantic Memory Cache', () => {
  const testUserId = 'test-user-123';
  const testQuery = 'What are my hobbies?';
  const testResult = [{ memory: 'User loves hiking' }];
  const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSemanticCaches();
    resetSemanticCacheStats();

    // Default mock implementations
    mockEmbed.mockResolvedValue(mockEmbedding);
    // Default: no matches found (empty result)
    mockTopKSimilar.mockReturnValue({ indices: [], similarities: [] });
  });

  afterEach(() => {
    clearAllSemanticCaches();
  });

  describe('findSimilarCached', () => {
    it('should return miss for empty cache', async () => {
      const result = await findSimilarCached(testUserId, testQuery);

      expect(result.hit).toBe(false);
      expect(result.result).toBeUndefined();
    });

    it('should return miss when no similar cached queries exist', async () => {
      // Store a query first
      await storeInSemanticCache(testUserId, 'Different query', testResult, mockEmbedding);

      // Search for a different query - no matches above threshold
      mockTopKSimilar.mockReturnValue({ indices: [], similarities: [] });
      const result = await findSimilarCached(testUserId, testQuery);

      expect(result.hit).toBe(false);
    });

    it('should return hit when similar cached query exists', async () => {
      // Store a query
      await storeInSemanticCache(testUserId, 'What are my interests?', testResult, mockEmbedding);

      // Search for similar query - match found above threshold
      mockTopKSimilar.mockReturnValue({ indices: [0], similarities: [0.9] });
      const result = await findSimilarCached(testUserId, testQuery);

      expect(result.hit).toBe(true);
      expect(result.result).toEqual(testResult);
      expect(result.similarity).toBe(0.9);
      expect(result.matchedQuery).toBe('What are my interests?');
      expect(result.timeSavedMs).toBe(150);
    });

    it('should find the most similar cached query', async () => {
      const result1 = [{ memory: 'First result' }];
      const result2 = [{ memory: 'Second result - better match' }];

      // Store two queries (topKSimilar returns empty for duplicate check during store)
      await storeInSemanticCache(testUserId, 'Tell me about hobbies', result1, [0.1, 0.2]);
      await storeInSemanticCache(testUserId, 'What are your hobbies?', result2, [0.3, 0.4]);

      // topKSimilar returns the best match (index 1 with 0.95 similarity)
      mockTopKSimilar.mockReturnValue({ indices: [1], similarities: [0.95] });

      const result = await findSimilarCached(testUserId, testQuery);

      expect(result.hit).toBe(true);
      expect(result.result).toEqual(result2);
      expect(result.similarity).toBe(0.95);
    });
  });

  describe('storeInSemanticCache', () => {
    it('should store a query with its result', async () => {
      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);

      const info = getUserCacheInfo(testUserId);
      expect(info.entryCount).toBe(1);
      expect(info.queries).toContain(testQuery.slice(0, 50));
    });

    it('should generate embedding if not provided', async () => {
      await storeInSemanticCache(testUserId, testQuery, testResult);

      expect(mockEmbed).toHaveBeenCalledWith(testQuery);
      expect(getUserCacheInfo(testUserId).entryCount).toBe(1);
    });

    it('should update existing entry for very similar queries', async () => {
      const result1 = [{ memory: 'First' }];
      const result2 = [{ memory: 'Updated' }];

      // First store: cache is empty, so topKSimilar is NOT called
      // (duplicate check only happens when userCache.length > 0)
      await storeInSemanticCache(testUserId, testQuery, result1, mockEmbedding);

      // Second store: cache has 1 entry, topKSimilar IS called for duplicate check
      // >0.95 similarity triggers update instead of new entry
      mockTopKSimilar.mockReturnValueOnce({ indices: [0], similarities: [0.98] });
      await storeInSemanticCache(testUserId, testQuery, result2, mockEmbedding);

      const info = getUserCacheInfo(testUserId);
      expect(info.entryCount).toBe(1); // Only one entry
    });

    it('should evict oldest entries when at capacity', async () => {
      configureSemanticCache({ maxEntriesPerUser: 3 });

      // topKSimilar is only called when cache is non-empty (for duplicate check)
      // So: store 1 = no call, stores 2-4 = calls with no duplicates
      mockTopKSimilar
        .mockReturnValueOnce({ indices: [], similarities: [] }) // Store 2
        .mockReturnValueOnce({ indices: [], similarities: [] }) // Store 3
        .mockReturnValueOnce({ indices: [], similarities: [] }); // Store 4

      // Store 4 queries (capacity is 3)
      await storeInSemanticCache(testUserId, 'Query 1', ['R1'], [0.1]);
      await storeInSemanticCache(testUserId, 'Query 2', ['R2'], [0.2]);
      await storeInSemanticCache(testUserId, 'Query 3', ['R3'], [0.3]);
      await storeInSemanticCache(testUserId, 'Query 4', ['R4'], [0.4]);

      const info = getUserCacheInfo(testUserId);
      expect(info.entryCount).toBe(3);
      expect(info.queries).not.toContain('Query 1'); // Oldest evicted
      expect(info.queries).toContain('Query 4'); // Newest present
    });
  });

  describe('withSemanticCache', () => {
    it('should execute query function on cache miss', async () => {
      const queryFn = vi.fn().mockResolvedValue(testResult);

      const result = await withSemanticCache(testUserId, testQuery, queryFn);

      expect(queryFn).toHaveBeenCalled();
      expect(result.result).toEqual(testResult);
      expect(result.cached).toBe(false);
    });

    it('should return cached result on cache hit', async () => {
      const queryFn = vi.fn().mockResolvedValue([{ memory: 'Fresh result' }]);

      // Store in cache (cache empty, so topKSimilar NOT called)
      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);

      // findSimilarCached will call topKSimilar (cache has entries)
      mockTopKSimilar.mockReturnValueOnce({ indices: [0], similarities: [0.92] });

      const result = await withSemanticCache(testUserId, 'What are my hobbies?', queryFn);

      expect(queryFn).not.toHaveBeenCalled();
      expect(result.result).toEqual(testResult);
      expect(result.cached).toBe(true);
      expect(result.similarity).toBe(0.92);
    });
  });

  describe('clearUserSemanticCache', () => {
    it('should clear cache for specific user', async () => {
      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);
      await storeInSemanticCache('other-user', testQuery, testResult, mockEmbedding);

      clearUserSemanticCache(testUserId);

      expect(getUserCacheInfo(testUserId).entryCount).toBe(0);
      expect(getUserCacheInfo('other-user').entryCount).toBe(1);
    });
  });

  describe('invalidateSemanticCache', () => {
    it('should invalidate entries matching pattern', async () => {
      // No duplicates found (different queries)
      mockTopKSimilar.mockReturnValue({ indices: [], similarities: [] });

      await storeInSemanticCache(testUserId, 'What are my hobbies?', ['R1'], [0.1]);
      await storeInSemanticCache(testUserId, 'Tell me about my work', ['R2'], [0.2]);
      await storeInSemanticCache(testUserId, 'What hobbies do I have?', ['R3'], [0.3]);

      const invalidated = invalidateSemanticCache(testUserId, /hobbies/i);

      expect(invalidated).toBe(2);
      expect(getUserCacheInfo(testUserId).entryCount).toBe(1);
    });

    it('should clear all entries when no pattern provided', async () => {
      // No duplicates found (different queries)
      mockTopKSimilar.mockReturnValue({ indices: [], similarities: [] });

      await storeInSemanticCache(testUserId, 'Query 1', ['R1'], [0.1]);
      await storeInSemanticCache(testUserId, 'Query 2', ['R2'], [0.2]);

      const invalidated = invalidateSemanticCache(testUserId);

      expect(invalidated).toBe(2);
      expect(getUserCacheInfo(testUserId).entryCount).toBe(0);
    });
  });

  describe('getSemanticCacheStats', () => {
    it('should track hits and misses', async () => {
      // Store a query (cache empty, so topKSimilar NOT called)
      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);

      // Cache miss (different user - no entries, topKSimilar NOT called, returns early)
      await findSimilarCached('other-user', testQuery);

      // Cache hit (cache has entry, topKSimilar IS called)
      mockTopKSimilar.mockReturnValueOnce({ indices: [0], similarities: [0.9] });
      await findSimilarCached(testUserId, testQuery);

      // Another miss (topKSimilar IS called but no match found)
      mockTopKSimilar.mockReturnValueOnce({ indices: [], similarities: [] });
      await findSimilarCached(testUserId, 'Unrelated query');

      const stats = getSemanticCacheStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(33.33, 1);
      expect(stats.avgSimilarity).toBe(0.9);
    });

    it('should track total entries and user count', async () => {
      // topKSimilar only called when cache non-empty for that user:
      // user-1 Query 1: cache empty → no call
      // user-1 Query 2: cache has 1 → call (needs mock)
      // user-2 Query 1: cache empty for user-2 → no call
      mockTopKSimilar.mockReturnValueOnce({ indices: [], similarities: [] });

      await storeInSemanticCache('user-1', 'Query 1', ['R1'], [0.1]);
      await storeInSemanticCache('user-1', 'Query 2', ['R2'], [0.2]);
      await storeInSemanticCache('user-2', 'Query 1', ['R3'], [0.3]);

      const stats = getSemanticCacheStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.userCount).toBe(2);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      // Configure short TTL for testing
      configureSemanticCache({ ttlMs: 100 });

      // Store entry (cache empty, so topKSimilar NOT called)
      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);

      // Immediately should find it (cache has entry, topKSimilar IS called)
      mockTopKSimilar.mockReturnValueOnce({ indices: [0], similarities: [0.9] });
      const before = await findSimilarCached(testUserId, testQuery);
      expect(before.hit).toBe(true);

      // Wait for TTL to expire
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 150);
      });

      // Should be expired now (pruneExpiredEntries removes entry, then
      // findSimilarCached returns early because cache is empty - no topKSimilar call)
      const after = await findSimilarCached(testUserId, testQuery);
      expect(after.hit).toBe(false);

      // Reset to default
      configureSemanticCache({ ttlMs: 5 * 60 * 1000 });
    });
  });

  describe('configuration', () => {
    it('should respect custom similarity threshold', async () => {
      configureSemanticCache({ similarityThreshold: 0.95 });

      // Store entry (no duplicates)
      mockTopKSimilar.mockReturnValueOnce({ indices: [], similarities: [] });
      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);

      // topKSimilar with 0.95 threshold won't return 0.9 matches
      // (threshold is passed to topKSimilar as minSimilarity)
      mockTopKSimilar.mockReturnValue({ indices: [], similarities: [] });
      const result = await findSimilarCached(testUserId, testQuery);

      expect(result.hit).toBe(false);

      // Reset
      configureSemanticCache({ similarityThreshold: 0.85 });
    });
  });

  describe('edge cases', () => {
    it('should handle embedding generation failure gracefully', async () => {
      // Store an entry first so cache is non-empty for the lookup
      // Note: topKSimilar is NOT called during store when cache is empty
      await storeInSemanticCache(testUserId, 'some query', testResult, mockEmbedding);

      // Now fail embedding generation for the lookup
      mockEmbed.mockRejectedValue(new Error('Embedding API error'));

      const result = await findSimilarCached(testUserId, testQuery);

      expect(result.hit).toBe(false);
    });

    it('should handle empty query', async () => {
      // Store entry (cache empty, so topKSimilar NOT called)
      await storeInSemanticCache(testUserId, '', testResult, mockEmbedding);

      // Find it (cache has entry, topKSimilar IS called)
      mockTopKSimilar.mockReturnValueOnce({ indices: [0], similarities: [0.9] });
      const result = await findSimilarCached(testUserId, '');

      expect(result.hit).toBe(true);
    });

    it('should isolate caches between users', async () => {
      // Store for both users (both caches start empty, so topKSimilar NOT called)
      await storeInSemanticCache('user-a', testQuery, ['Result A'], mockEmbedding);
      await storeInSemanticCache('user-b', testQuery, ['Result B'], mockEmbedding);

      // Each user finds their own cache entry (topKSimilar IS called for each)
      mockTopKSimilar
        .mockReturnValueOnce({ indices: [0], similarities: [0.9] })
        .mockReturnValueOnce({ indices: [0], similarities: [0.9] });

      const resultA = await findSimilarCached('user-a', testQuery);
      const resultB = await findSimilarCached('user-b', testQuery);

      expect(resultA.result).toEqual(['Result A']);
      expect(resultB.result).toEqual(['Result B']);
    });
  });
});
