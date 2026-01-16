/**
 * Embedding Coalescing Integration Tests
 *
 * Tests that the request coalescer properly integrates with the
 * embeddings module to prevent duplicate API calls.
 */

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  resetAllCoalescers,
  getAllCoalescerStats,
} from '../../utils/request-coalescer.js';
import {
  embed,
  embedBatch,
  setEmbeddingProvider,
  LocalEmbeddings,
  type EmbeddingProvider,
} from '../embeddings.js';

// Track API calls to verify coalescing behavior
let apiCallCount = 0;
let batchApiCallCount = 0;

/**
 * Mock embedding provider that tracks API calls
 */
class MockEmbeddingProvider extends LocalEmbeddings {
  async embed(text: string): Promise<number[]> {
    apiCallCount++;
    // Simulate some latency
    await new Promise((resolve) => setTimeout(resolve, 10));
    return super.embed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    batchApiCallCount++;
    // Simulate some latency
    await new Promise((resolve) => setTimeout(resolve, 10));
    return super.embedBatch(texts);
  }
}

describe('Embedding Coalescing Integration', () => {
  let mockProvider: EmbeddingProvider;

  beforeEach(() => {
    apiCallCount = 0;
    batchApiCallCount = 0;
    resetAllCoalescers();

    // Set up mock provider
    mockProvider = new MockEmbeddingProvider();
    setEmbeddingProvider(mockProvider);
  });

  afterEach(() => {
    resetAllCoalescers();
  });

  describe('embed() coalescing', () => {
    it('should coalesce concurrent embed() calls for same text', async () => {
      const text = 'What is the meaning of life?';

      // Start 5 concurrent requests for the same text
      const promises = Array(5)
        .fill(null)
        .map(() => embed(text));

      const results = await Promise.all(promises);

      // All should return the same embedding (arrays should be equal)
      const firstResult = results[0];
      for (const result of results) {
        expect(result).toEqual(firstResult);
      }

      // Check coalescer stats
      const stats = getAllCoalescerStats();
      const embeddingStats = stats.find((s) => s.name === 'embeddings');

      expect(embeddingStats).toBeDefined();
      if (embeddingStats) {
        expect(embeddingStats.totalRequests).toBe(5);
        // Should have coalesced - only 1 actual execution
        expect(embeddingStats.actualExecutions).toBe(1);
        expect(embeddingStats.coalescedRequests).toBe(4);
      }
    });

    it('should not coalesce requests for different texts', async () => {
      const texts = [
        'First unique text',
        'Second unique text',
        'Third unique text',
      ];

      const promises = texts.map((text) => embed(text));
      const results = await Promise.all(promises);

      // All results should be different (different texts = different hashes)
      expect(results[0]).not.toEqual(results[1]);
      expect(results[1]).not.toEqual(results[2]);

      // Check stats - should have 3 actual executions
      const stats = getAllCoalescerStats();
      const embeddingStats = stats.find((s) => s.name === 'embeddings');

      expect(embeddingStats).toBeDefined();
      if (embeddingStats) {
        expect(embeddingStats.totalRequests).toBe(3);
        expect(embeddingStats.actualExecutions).toBe(3);
        expect(embeddingStats.coalescedRequests).toBe(0);
      }
    });

    it('should allow subsequent requests after first completes', async () => {
      const text = 'Same text for sequential calls';

      // First request
      const result1 = await embed(text);

      // Second request (after first completes)
      const result2 = await embed(text);

      // Both should get embeddings
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1.length).toBeGreaterThan(0);
      expect(result2.length).toBeGreaterThan(0);

      // Should have 2 actual executions (since first completed before second started)
      const stats = getAllCoalescerStats();
      const embeddingStats = stats.find((s) => s.name === 'embeddings');

      expect(embeddingStats).toBeDefined();
      if (embeddingStats) {
        expect(embeddingStats.totalRequests).toBe(2);
        expect(embeddingStats.actualExecutions).toBe(2);
      }
    });
  });

  describe('embedBatch() deduplication', () => {
    it('should deduplicate texts within a single batch', async () => {
      // Same text repeated in batch
      const texts = [
        'duplicate text here',
        'unique text one',
        'duplicate text here', // duplicate
        'unique text two',
        'duplicate text here', // duplicate
      ];

      const results = await embedBatch(texts);

      // Should get 5 results
      expect(results).toHaveLength(5);

      // Duplicates should have identical embeddings
      expect(results[0]).toEqual(results[2]);
      expect(results[0]).toEqual(results[4]);

      // Unique texts should be different
      expect(results[0]).not.toEqual(results[1]);
      expect(results[1]).not.toEqual(results[3]);

      // Only 1 batch API call should have been made
      expect(batchApiCallCount).toBe(1);
    });

    it('should handle empty batch', async () => {
      const results = await embedBatch([]);
      expect(results).toEqual([]);
      expect(batchApiCallCount).toBe(0);
    });

    it('should handle single item batch', async () => {
      const results = await embedBatch(['single text']);
      expect(results).toHaveLength(1);
      expect(batchApiCallCount).toBe(1);
    });

    it('should clone duplicate embeddings to prevent mutation bugs', async () => {
      const texts = ['same text', 'same text', 'same text'];
      const results = await embedBatch(texts);

      // All results should have equal values
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);

      // But duplicates should be different array instances
      expect(results[0]).not.toBe(results[1]);
      expect(results[1]).not.toBe(results[2]);

      // Mutating one should not affect others
      const originalValue = results[1][0];
      results[0][0] = 999999;
      expect(results[1][0]).toBe(originalValue);
      expect(results[2][0]).toBe(originalValue);
    });
  });

  describe('Error handling', () => {
    it('should propagate provider errors to all concurrent waiters', async () => {
      // Create a provider that fails
      const failingProvider = {
        embed: async () => {
          throw new Error('Provider unavailable');
        },
        embedBatch: async () => {
          throw new Error('Provider unavailable');
        },
        dimensions: 768,
        model: 'failing-provider',
      } as EmbeddingProvider;

      setEmbeddingProvider(failingProvider);

      // Start concurrent requests - attach catch handlers immediately
      const promises = Array(3)
        .fill(null)
        .map(() => {
          const p = embed('test text');
          p.catch(() => {}); // Prevent unhandled rejection
          return p;
        });

      // Use allSettled to catch all rejections
      const results = await Promise.allSettled(promises);

      // All should have rejected
      for (const result of results) {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect((result.reason as Error).message).toBe('Provider unavailable');
        }
      }

      // Check that error was recorded in stats
      const stats = getAllCoalescerStats();
      const embeddingStats = stats.find((s) => s.name === 'embeddings');
      expect(embeddingStats?.errors).toBeGreaterThan(0);
    });
  });
});

describe('Coalescer Stats Observability', () => {
  beforeEach(() => {
    resetAllCoalescers();
    setEmbeddingProvider(new MockEmbeddingProvider());
  });

  afterEach(() => {
    resetAllCoalescers();
  });

  it('should expose coalescer stats for monitoring', async () => {
    // Generate some activity
    await embed('monitoring test text');

    const allStats = getAllCoalescerStats();

    // Should have at least the embeddings coalescer
    expect(allStats.length).toBeGreaterThan(0);

    // Find embeddings stats
    const embeddingStats = allStats.find((s) => s.name === 'embeddings');
    expect(embeddingStats).toBeDefined();

    // Verify stats structure
    if (embeddingStats) {
      expect(embeddingStats).toHaveProperty('name', 'embeddings');
      expect(embeddingStats).toHaveProperty('totalRequests');
      expect(embeddingStats).toHaveProperty('coalescedRequests');
      expect(embeddingStats).toHaveProperty('actualExecutions');
      expect(embeddingStats).toHaveProperty('coalesceRate');
      expect(embeddingStats).toHaveProperty('errors');
      expect(embeddingStats).toHaveProperty('currentPending');

      // Should have 1 request
      expect(embeddingStats.totalRequests).toBe(1);
      expect(embeddingStats.actualExecutions).toBe(1);
    }
  });

  it('should calculate coalesce rate correctly', async () => {
    // Generate 10 concurrent requests for same text
    const promises = Array(10)
      .fill(null)
      .map(() => embed('same text for rate calculation'));

    await Promise.all(promises);

    const stats = getAllCoalescerStats();
    const embeddingStats = stats.find((s) => s.name === 'embeddings');

    expect(embeddingStats).toBeDefined();
    if (embeddingStats) {
      // 10 total, 1 executed, 9 coalesced = 90% coalesce rate
      expect(embeddingStats.totalRequests).toBe(10);
      expect(embeddingStats.actualExecutions).toBe(1);
      expect(embeddingStats.coalescedRequests).toBe(9);
      expect(embeddingStats.coalesceRate).toBeCloseTo(0.9, 2);
    }
  });
});
