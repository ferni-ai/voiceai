/**
 * Semantic Memory Cache Tests
 *
 * Tests the "Better than Human" optimization that caches memory query
 * results with semantic similarity matching.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock embeddings
const mockEmbed = vi.fn();
const mockCosineSimilarity = vi.fn();

vi.mock('../embeddings.js', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  cosineSimilarity: (...args: unknown[]) => mockCosineSimilarity(...args),
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
    mockCosineSimilarity.mockReturnValue(0.5); // Default: below threshold
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

      // Search for a different query - similarity below threshold
      mockCosineSimilarity.mockReturnValue(0.5);
      const result = await findSimilarCached(testUserId, testQuery);

      expect(result.hit).toBe(false);
    });

    it('should return hit when similar cached query exists', async () => {
      // Store a query
      await storeInSemanticCache(testUserId, 'What are my interests?', testResult, mockEmbedding);

      // Search for similar query - similarity above threshold
      mockCosineSimilarity.mockReturnValue(0.9);
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

      // Store two queries
      await storeInSemanticCache(testUserId, 'Tell me about hobbies', result1, [0.1, 0.2]);
      await storeInSemanticCache(testUserId, 'What are your hobbies?', result2, [0.3, 0.4]);

      // Return different similarities for each
      mockCosineSimilarity.mockImplementation((_, cachedEmbed) => {
        if (cachedEmbed[0] === 0.1) return 0.86; // First query
        if (cachedEmbed[0] === 0.3) return 0.95; // Second query - higher
        return 0.5;
      });

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

      // Same embedding = very similar query (>0.95)
      mockCosineSimilarity.mockReturnValue(0.98);

      await storeInSemanticCache(testUserId, testQuery, result1, mockEmbedding);
      await storeInSemanticCache(testUserId, testQuery, result2, mockEmbedding);

      const info = getUserCacheInfo(testUserId);
      expect(info.entryCount).toBe(1); // Only one entry
    });

    it('should evict oldest entries when at capacity', async () => {
      configureSemanticCache({ maxEntriesPerUser: 3 });

      // Different embeddings = not similar
      mockCosineSimilarity.mockReturnValue(0.1);

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

      // First call - cache miss
      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);

      // Set high similarity for cache hit
      mockCosineSimilarity.mockReturnValue(0.92);

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
      mockCosineSimilarity.mockReturnValue(0.1); // Different queries

      await storeInSemanticCache(testUserId, 'What are my hobbies?', ['R1'], [0.1]);
      await storeInSemanticCache(testUserId, 'Tell me about my work', ['R2'], [0.2]);
      await storeInSemanticCache(testUserId, 'What hobbies do I have?', ['R3'], [0.3]);

      const invalidated = invalidateSemanticCache(testUserId, /hobbies/i);

      expect(invalidated).toBe(2);
      expect(getUserCacheInfo(testUserId).entryCount).toBe(1);
    });

    it('should clear all entries when no pattern provided', async () => {
      await storeInSemanticCache(testUserId, 'Query 1', ['R1'], [0.1]);
      await storeInSemanticCache(testUserId, 'Query 2', ['R2'], [0.2]);

      mockCosineSimilarity.mockReturnValue(0.1);
      const invalidated = invalidateSemanticCache(testUserId);

      expect(invalidated).toBe(2);
      expect(getUserCacheInfo(testUserId).entryCount).toBe(0);
    });
  });

  describe('getSemanticCacheStats', () => {
    it('should track hits and misses', async () => {
      // Store a query
      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);

      // Cache miss (different user)
      await findSimilarCached('other-user', testQuery);

      // Cache hit
      mockCosineSimilarity.mockReturnValue(0.9);
      await findSimilarCached(testUserId, testQuery);

      // Another miss
      mockCosineSimilarity.mockReturnValue(0.5);
      await findSimilarCached(testUserId, 'Unrelated query');

      const stats = getSemanticCacheStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(33.33, 1);
      expect(stats.avgSimilarity).toBe(0.9);
    });

    it('should track total entries and user count', async () => {
      await storeInSemanticCache('user-1', 'Query 1', ['R1'], [0.1]);
      await storeInSemanticCache('user-1', 'Query 2', ['R2'], [0.2]);
      await storeInSemanticCache('user-2', 'Query 1', ['R3'], [0.3]);

      mockCosineSimilarity.mockReturnValue(0.1); // Not similar

      const stats = getSemanticCacheStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.userCount).toBe(2);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      // Configure short TTL for testing
      configureSemanticCache({ ttlMs: 100 });

      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);

      // Immediately should find it
      mockCosineSimilarity.mockReturnValue(0.9);
      const before = await findSimilarCached(testUserId, testQuery);
      expect(before.hit).toBe(true);

      // Wait for TTL to expire
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 150);
      });

      // Should be expired now
      const after = await findSimilarCached(testUserId, testQuery);
      expect(after.hit).toBe(false);

      // Reset to default
      configureSemanticCache({ ttlMs: 5 * 60 * 1000 });
    });
  });

  describe('configuration', () => {
    it('should respect custom similarity threshold', async () => {
      configureSemanticCache({ similarityThreshold: 0.95 });

      await storeInSemanticCache(testUserId, testQuery, testResult, mockEmbedding);

      // 0.9 is now below threshold
      mockCosineSimilarity.mockReturnValue(0.9);
      const result = await findSimilarCached(testUserId, testQuery);

      expect(result.hit).toBe(false);

      // Reset
      configureSemanticCache({ similarityThreshold: 0.85 });
    });
  });

  describe('edge cases', () => {
    it('should handle embedding generation failure gracefully', async () => {
      mockEmbed.mockRejectedValue(new Error('Embedding API error'));

      const result = await findSimilarCached(testUserId, testQuery);

      expect(result.hit).toBe(false);
    });

    it('should handle empty query', async () => {
      await storeInSemanticCache(testUserId, '', testResult, mockEmbedding);
      mockCosineSimilarity.mockReturnValue(0.9);

      const result = await findSimilarCached(testUserId, '');

      expect(result.hit).toBe(true);
    });

    it('should isolate caches between users', async () => {
      await storeInSemanticCache('user-a', testQuery, ['Result A'], mockEmbedding);
      await storeInSemanticCache('user-b', testQuery, ['Result B'], mockEmbedding);

      mockCosineSimilarity.mockReturnValue(0.9);

      const resultA = await findSimilarCached('user-a', testQuery);
      const resultB = await findSimilarCached('user-b', testQuery);

      expect(resultA.result).toEqual(['Result A']);
      expect(resultB.result).toEqual(['Result B']);
    });
  });
});
