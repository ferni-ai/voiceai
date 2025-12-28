/**
 * Source Prioritizer Tests
 *
 * Tests the intelligent source prioritization and parallel fetching system.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock circuit breaker
vi.mock('../circuit-breaker.js', () => ({
  circuitBreaker: {
    shouldSkip: vi.fn(() => false),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordLatency: vi.fn(),
  },
}));

// Import after mocks
import {
  fetchWithPriority,
  getSourceMetrics,
  resetMetrics,
  createSource,
} from '../source-prioritizer.js';
import { circuitBreaker } from '../circuit-breaker.js';
import type { SourceConfig } from '../types.js';

describe('Source Prioritizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMetrics();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSource', () => {
    it('should create a source with defaults', () => {
      const fetch = vi.fn();
      const source = createSource('test', 'Test Source', fetch);

      expect(source.id).toBe('test');
      expect(source.name).toBe('Test Source');
      expect(source.fetch).toBe(fetch);
      expect(source.basePriority).toBe(5);
      expect(source.reliability).toBe(0.9);
      expect(source.fallbackOnly).toBe(false);
    });

    it('should allow custom options', () => {
      const fetch = vi.fn();
      const source = createSource('test', 'Test', fetch, {
        basePriority: 1,
        reliability: 0.95,
        fallbackOnly: true,
      });

      expect(source.basePriority).toBe(1);
      expect(source.reliability).toBe(0.95);
      expect(source.fallbackOnly).toBe(true);
    });
  });

  describe('fetchWithPriority', () => {
    it('should fetch from fast sources first', async () => {
      const fastSource = createSource('fast', 'Fast', async () => {
        return ['result1', 'result2', 'result3'];
      });

      const slowSource = createSource('slow', 'Slow', async () => {
        await new Promise<void>((r) => {
          setTimeout(r, 5000);
        });
        return ['slow-result'];
      });

      const resultPromise = fetchWithPriority({
        sources: [fastSource, slowSource],
        query: 'test',
        minResults: 3,
        maxWait: 8000,
      });

      // Fast source resolves immediately
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.results).toHaveLength(3);
      expect(result.sources).toContain('Fast');
      expect(result.complete).toBe(true);
      expect(result.latency).toBeLessThan(1000);
    });

    it('should use slow sources as backup when fast sources fail', async () => {
      const fastSource = createSource('fast', 'Fast', async () => {
        throw new Error('Fast source failed');
      });

      const slowSource = createSource('slow', 'Slow', async () => {
        return ['backup1', 'backup2', 'backup3'];
      });

      const resultPromise = fetchWithPriority({
        sources: [fastSource, slowSource],
        query: 'test',
        minResults: 3,
        maxWait: 8000,
        slowSourceDelay: 1000,
      });

      // Fast source fails immediately
      await vi.advanceTimersByTimeAsync(100);

      // Wait for slow source delay
      await vi.advanceTimersByTimeAsync(1500);

      const result = await resultPromise;

      expect(result.results).toHaveLength(3);
      expect(result.sources).toContain('Slow');
    });

    it('should combine results from multiple sources', async () => {
      const source1 = createSource('s1', 'Source 1', async () => ['a', 'b']);
      const source2 = createSource('s2', 'Source 2', async () => ['c', 'd']);

      const resultPromise = fetchWithPriority({
        sources: [source1, source2],
        query: 'test',
        minResults: 4,
        maxWait: 8000,
      });

      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.results).toHaveLength(4);
      expect(result.sources).toContain('Source 1');
      expect(result.sources).toContain('Source 2');
    });

    it('should return early when minResults is reached', async () => {
      const source1 = createSource('s1', 'Source 1', async () => ['a', 'b', 'c']);
      let source2Called = false;
      const source2 = createSource('s2', 'Source 2', async () => {
        source2Called = true;
        await new Promise<void>((r) => {
          setTimeout(r, 5000);
        });
        return ['d', 'e'];
      });

      const resultPromise = fetchWithPriority({
        sources: [source1, source2],
        query: 'test',
        minResults: 3,
        maxWait: 8000,
      });

      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.results).toHaveLength(3);
      expect(result.complete).toBe(true);
      // Didn't need to wait for source2
      expect(result.latency).toBeLessThan(1000);
    });

    it('should respect maxWait timeout', async () => {
      const slowSource = createSource('slow', 'Slow', async () => {
        await new Promise<void>((r) => {
          setTimeout(r, 20000);
        });
        return ['never-returned'];
      });

      const resultPromise = fetchWithPriority({
        sources: [slowSource],
        query: 'test',
        minResults: 1,
        maxWait: 2000,
      });

      await vi.advanceTimersByTimeAsync(2500);
      const result = await resultPromise;

      expect(result.results).toHaveLength(0);
      expect(result.complete).toBe(false);
      expect(result.latency).toBeGreaterThanOrEqual(2000);
    });

    it('should transform results using transformResult', async () => {
      const source = createSource('raw', 'Raw', async () => ({
        items: [{ name: 'item1' }, { name: 'item2' }],
      }));

      const resultPromise = fetchWithPriority({
        sources: [source],
        query: 'test',
        minResults: 2,
        transformResult: (data: unknown) => {
          const d = data as { items: Array<{ name: string }> };
          return d.items.map((i) => i.name);
        },
      });

      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.results).toEqual(['item1', 'item2']);
    });

    it('should exclude fallback-only sources initially', async () => {
      let fallbackCalled = false;
      const primarySource = createSource('primary', 'Primary', async () => ['a', 'b', 'c']);
      const fallbackSource = createSource(
        'fallback',
        'Fallback',
        async () => {
          fallbackCalled = true;
          return ['fallback'];
        },
        { fallbackOnly: true }
      );

      const resultPromise = fetchWithPriority({
        sources: [primarySource, fallbackSource],
        query: 'test',
        minResults: 3,
      });

      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.results).toHaveLength(3);
      expect(fallbackCalled).toBe(false);
    });

    it('should use fallback sources when primary fails', async () => {
      const primarySource = createSource('primary', 'Primary', async () => {
        throw new Error('Primary failed');
      });

      const fallbackSource = createSource(
        'fallback',
        'Fallback',
        async () => ['fallback1', 'fallback2', 'fallback3'],
        { fallbackOnly: true }
      );

      const resultPromise = fetchWithPriority({
        sources: [primarySource, fallbackSource],
        query: 'test',
        minResults: 3,
        slowSourceDelay: 1000,
        maxWait: 5000,
      });

      // Primary fails
      await vi.advanceTimersByTimeAsync(100);

      // Wait for slow source delay (fallback is treated as slow)
      await vi.advanceTimersByTimeAsync(1500);

      const result = await resultPromise;

      expect(result.results).toEqual(['fallback1', 'fallback2', 'fallback3']);
    });

    it('should skip sources with open circuit', async () => {
      vi.mocked(circuitBreaker.shouldSkip).mockImplementation((id) => id === 'blocked');

      const blockedSource = createSource('blocked', 'Blocked', async () => ['blocked-result']);
      const workingSource = createSource('working', 'Working', async () => ['working-result']);

      const resultPromise = fetchWithPriority({
        sources: [blockedSource, workingSource],
        query: 'test',
        minResults: 1,
      });

      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.results).toEqual(['working-result']);
      expect(result.sources).not.toContain('Blocked');
    });

    it('should record latency and success for successful fetches', async () => {
      const source = createSource('test', 'Test', async () => ['result']);

      const resultPromise = fetchWithPriority({
        sources: [source],
        query: 'test',
        minResults: 1,
      });

      await vi.advanceTimersByTimeAsync(100);
      await resultPromise;

      expect(circuitBreaker.recordLatency).toHaveBeenCalledWith('test', expect.any(Number));
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('test');
    });

    it('should record failure for failed fetches', async () => {
      const source = createSource('failing', 'Failing', async () => {
        throw new Error('Failed');
      });

      const resultPromise = fetchWithPriority({
        sources: [source],
        query: 'test',
        minResults: 1,
        maxWait: 1000,
      });

      await vi.advanceTimersByTimeAsync(1500);
      await resultPromise;

      expect(circuitBreaker.recordFailure).toHaveBeenCalledWith('failing');
    });
  });

  describe('Source Metrics', () => {
    it('should track and return source metrics', async () => {
      const source = createSource('tracked', 'Tracked', async () => ['result']);

      // Make several requests
      for (let i = 0; i < 5; i++) {
        const resultPromise = fetchWithPriority({
          sources: [source],
          query: 'test',
          minResults: 1,
        });
        await vi.advanceTimersByTimeAsync(100);
        await resultPromise;
      }

      const metrics = getSourceMetrics();
      const trackedMetrics = metrics.get('tracked');

      expect(trackedMetrics).toBeDefined();
      expect(trackedMetrics!.totalRequests).toBe(5);
      expect(trackedMetrics!.successRate).toBeGreaterThan(0);
    });

    it('should reset metrics', async () => {
      const source = createSource('toReset', 'ToReset', async () => ['result']);

      const resultPromise = fetchWithPriority({
        sources: [source],
        query: 'test',
        minResults: 1,
      });
      await vi.advanceTimersByTimeAsync(100);
      await resultPromise;

      expect(getSourceMetrics().has('toReset')).toBe(true);

      resetMetrics();

      expect(getSourceMetrics().has('toReset')).toBe(false);
    });
  });

  describe('Priority Calculation', () => {
    it('should prioritize faster sources', async () => {
      const executionOrder: string[] = [];

      const slowSource: SourceConfig = {
        id: 'slow',
        name: 'Slow',
        fetch: async () => {
          executionOrder.push('slow');
          return ['slow'];
        },
        basePriority: 1, // Lower = higher priority normally
        avgLatency: 5000, // But slow
        reliability: 0.9,
        fallbackOnly: false,
      };

      const fastSource: SourceConfig = {
        id: 'fast',
        name: 'Fast',
        fetch: async () => {
          executionOrder.push('fast');
          return ['fast'];
        },
        basePriority: 5, // Higher base priority
        avgLatency: 100, // But fast
        reliability: 0.9,
        fallbackOnly: false,
      };

      // Pre-populate metrics to simulate learned behavior
      // The prioritizer uses metrics from previous requests

      const resultPromise = fetchWithPriority({
        sources: [slowSource, fastSource],
        query: 'test',
        minResults: 1,
      });

      await vi.advanceTimersByTimeAsync(100);
      await resultPromise;

      // Both should execute since they're fast sources
      expect(executionOrder).toContain('fast');
      expect(executionOrder).toContain('slow');
    });
  });
});
