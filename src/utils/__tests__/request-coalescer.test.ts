/**
 * Request Coalescer Tests
 *
 * Tests for the request coalescing utility that prevents duplicate
 * concurrent API calls by sharing in-flight request promises.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RequestCoalescer,
  getRequestCoalescer,
  getAllCoalescerStats,
  resetAllCoalescers,
  hashContent,
  configureCoalescerMetrics,
  resetCoalescerMetrics,
  type CoalescerStats,
  type CoalescerMetricsCallbacks,
} from '../request-coalescer.js';

describe('RequestCoalescer', () => {
  let coalescer: RequestCoalescer<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetAllCoalescers();
    coalescer = new RequestCoalescer<string>('test', {
      pendingTtlMs: 60000,
      maxPending: 100,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    coalescer.clear();
  });

  describe('Basic Coalescing', () => {
    it('should coalesce concurrent requests with the same key', async () => {
      let executionCount = 0;
      const executor = async () => {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'result';
      };

      // Start 5 concurrent requests with the same key
      const promises = Array(5)
        .fill(null)
        .map(() => coalescer.execute('same-key', executor));

      // Advance timers to let the request complete
      await vi.advanceTimersByTimeAsync(200);

      // All should resolve to the same result
      const results = await Promise.all(promises);
      expect(results).toEqual(['result', 'result', 'result', 'result', 'result']);

      // But the executor should only have been called once
      expect(executionCount).toBe(1);
    });

    it('should not coalesce requests with different keys', async () => {
      let executionCount = 0;
      const executor = async (key: string) => {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return `result-${key}`;
      };

      // Start concurrent requests with different keys
      const promises = [
        coalescer.execute('key-1', () => executor('key-1')),
        coalescer.execute('key-2', () => executor('key-2')),
        coalescer.execute('key-3', () => executor('key-3')),
      ];

      await vi.advanceTimersByTimeAsync(200);
      const results = await Promise.all(promises);

      expect(results).toEqual(['result-key-1', 'result-key-2', 'result-key-3']);
      expect(executionCount).toBe(3);
    });

    it('should allow new request after previous completes', async () => {
      let executionCount = 0;
      const executor = async () => {
        executionCount++;
        return `result-${executionCount}`;
      };

      // First request
      const result1 = await coalescer.execute('key', executor);
      expect(result1).toBe('result-1');

      // Second request (should execute again since first completed)
      const result2 = await coalescer.execute('key', executor);
      expect(result2).toBe('result-2');

      expect(executionCount).toBe(2);
    });
  });

  describe('Error Propagation', () => {
    it('should propagate errors to all waiters', async () => {
      const executor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error('API Error');
      };

      // Start 3 concurrent requests, immediately attach catch handlers
      // to prevent unhandled rejection warnings
      const promises = Array(3)
        .fill(null)
        .map(() => {
          const p = coalescer.execute('error-key', executor);
          // Attach a no-op catch to prevent unhandled rejection
          p.catch(() => {});
          return p;
        });

      await vi.advanceTimersByTimeAsync(200);

      // All should reject with the same error
      await expect(Promise.allSettled(promises)).resolves.toEqual([
        { status: 'rejected', reason: expect.any(Error) },
        { status: 'rejected', reason: expect.any(Error) },
        { status: 'rejected', reason: expect.any(Error) },
      ]);

      // Verify all errors have the same message
      const results = await Promise.allSettled(promises);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect((result.reason as Error).message).toBe('API Error');
        }
      }
    });

    it('should allow retry after error (key is cleared)', async () => {
      let callCount = 0;
      const executor = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First call fails');
        }
        return 'success';
      };

      // First call fails
      await expect(coalescer.execute('retry-key', executor)).rejects.toThrow('First call fails');

      // Second call should succeed (key was cleared after error)
      const result = await coalescer.execute('retry-key', executor);
      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });
  });

  describe('TTL Cleanup', () => {
    it('should mark pending requests as expired after TTL but keep for waiters', async () => {
      // Create a request that never resolves
      const neverResolves = () => new Promise<string>(() => {});

      // Start the request (but don't await)
      void coalescer.execute('ttl-key', neverResolves);

      // Initially the key should be pending
      expect(coalescer.isPending('ttl-key')).toBe(true);

      // Advance time past TTL
      await vi.advanceTimersByTimeAsync(61000);

      // Key should STILL be pending (marked expired but not deleted)
      // This ensures existing waiters can still receive results
      expect(coalescer.isPending('ttl-key')).toBe(true);

      // But new requests should NOT coalesce with expired entries
      let newExecutorCalled = false;
      void coalescer.execute('ttl-key', async () => {
        newExecutorCalled = true;
        return 'new-result';
      });

      expect(newExecutorCalled).toBe(true);
    });
  });

  describe('Capacity Limits', () => {
    it('should enforce maxPending limit', async () => {
      const smallCoalescer = new RequestCoalescer<string>('small', {
        maxPending: 3,
        pendingTtlMs: 60000,
      });

      // Create requests that don't resolve immediately
      const neverResolves = () => new Promise<string>(() => {});

      // Fill up to capacity
      void smallCoalescer.execute('key-1', neverResolves);
      void smallCoalescer.execute('key-2', neverResolves);
      void smallCoalescer.execute('key-3', neverResolves);

      // Fourth request should fail
      await expect(smallCoalescer.execute('key-4', neverResolves)).rejects.toThrow(
        'Too many pending requests'
      );

      smallCoalescer.clear();
    });
  });

  describe('Stats Tracking', () => {
    it('should track coalescing stats', async () => {
      const executor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'result';
      };

      // Execute 5 concurrent requests (4 should be coalesced)
      const promises = Array(5)
        .fill(null)
        .map(() => coalescer.execute('stats-key', executor));

      await vi.advanceTimersByTimeAsync(100);
      await Promise.all(promises);

      const stats = coalescer.getStats();
      expect(stats.totalRequests).toBe(5);
      expect(stats.coalescedRequests).toBe(4);
      expect(stats.actualExecutions).toBe(1);
      expect(stats.coalesceRate).toBeCloseTo(0.8, 2);
    });

    it('should track errors in stats', async () => {
      const executor = async () => {
        throw new Error('fail');
      };

      await expect(coalescer.execute('error-key', executor)).rejects.toThrow();

      const stats = coalescer.getStats();
      expect(stats.errors).toBe(1);
    });
  });

  describe('Clone Result', () => {
    it('should clone results when cloneResult is provided', async () => {
      const arrayCoalescer = new RequestCoalescer<number[]>('array-test', {
        pendingTtlMs: 60000,
        maxPending: 100,
        cloneResult: (arr) => [...arr],
      });

      let executionCount = 0;
      const executor = async () => {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return [1, 2, 3];
      };

      // Start 3 concurrent requests
      const promises = [
        arrayCoalescer.execute('clone-key', executor),
        arrayCoalescer.execute('clone-key', executor),
        arrayCoalescer.execute('clone-key', executor),
      ];

      await vi.advanceTimersByTimeAsync(100);
      const results = await Promise.all(promises);

      // All should have same values
      expect(results[0]).toEqual([1, 2, 3]);
      expect(results[1]).toEqual([1, 2, 3]);
      expect(results[2]).toEqual([1, 2, 3]);

      // But they should be different array instances
      expect(results[0]).not.toBe(results[1]);
      expect(results[1]).not.toBe(results[2]);
      expect(results[0]).not.toBe(results[2]);

      // Executor only called once
      expect(executionCount).toBe(1);

      arrayCoalescer.clear();
    });

    it('should allow mutation of cloned results without affecting others', async () => {
      const arrayCoalescer = new RequestCoalescer<number[]>('mutation-test', {
        pendingTtlMs: 60000,
        maxPending: 100,
        cloneResult: (arr) => [...arr],
      });

      const executor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return [1, 2, 3];
      };

      // Start 2 concurrent requests
      const promise1 = arrayCoalescer.execute('mutation-key', executor);
      const promise2 = arrayCoalescer.execute('mutation-key', executor);

      await vi.advanceTimersByTimeAsync(100);
      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Mutate the first result
      result1.push(4);

      // Second result should not be affected
      expect(result1).toEqual([1, 2, 3, 4]);
      expect(result2).toEqual([1, 2, 3]);

      arrayCoalescer.clear();
    });

    it('should work with structuredClone for complex objects', async () => {
      interface ComplexObject {
        id: number;
        nested: { value: string };
      }

      const objectCoalescer = new RequestCoalescer<ComplexObject>('object-test', {
        pendingTtlMs: 60000,
        maxPending: 100,
        cloneResult: (obj) => structuredClone(obj),
      });

      const executor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { id: 1, nested: { value: 'test' } };
      };

      // Start 2 concurrent requests
      const promises = [
        objectCoalescer.execute('obj-key', executor),
        objectCoalescer.execute('obj-key', executor),
      ];

      await vi.advanceTimersByTimeAsync(100);
      const [result1, result2] = await Promise.all(promises);

      // Deep equality
      expect(result1).toEqual({ id: 1, nested: { value: 'test' } });
      expect(result2).toEqual({ id: 1, nested: { value: 'test' } });

      // Different instances
      expect(result1).not.toBe(result2);
      expect(result1.nested).not.toBe(result2.nested);

      objectCoalescer.clear();
    });
  });

  describe('Observability Metrics Callbacks', () => {
    beforeEach(() => {
      resetCoalescerMetrics();
    });

    afterEach(() => {
      resetCoalescerMetrics();
    });

    it('should call onCoalesce when requests are coalesced', async () => {
      const onCoalesce = vi.fn();
      configureCoalescerMetrics({ onCoalesce });

      const metricsCoalescer = new RequestCoalescer<string>('metrics-coalesce', {
        pendingTtlMs: 60000,
        maxPending: 100,
      });

      const executor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'result';
      };

      // Start 3 concurrent requests
      const promises = [
        metricsCoalescer.execute('key', executor),
        metricsCoalescer.execute('key', executor),
        metricsCoalescer.execute('key', executor),
      ];

      await vi.advanceTimersByTimeAsync(150);
      await Promise.all(promises);

      // onCoalesce should be called twice (for 2nd and 3rd requests)
      expect(onCoalesce).toHaveBeenCalledTimes(2);
      expect(onCoalesce).toHaveBeenCalledWith('metrics-coalesce', 'key', 2); // 2nd waiter
      expect(onCoalesce).toHaveBeenCalledWith('metrics-coalesce', 'key', 3); // 3rd waiter

      metricsCoalescer.clear();
    });

    it('should call onComplete when request completes successfully', async () => {
      const onComplete = vi.fn();
      configureCoalescerMetrics({ onComplete });

      const metricsCoalescer = new RequestCoalescer<string>('metrics-complete', {
        pendingTtlMs: 60000,
        maxPending: 100,
      });

      const executor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'result';
      };

      const promise = metricsCoalescer.execute('key', executor);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      // onComplete should be called once with success=true
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith('metrics-complete', 'key', expect.any(Number), true);

      metricsCoalescer.clear();
    });

    it('should call onComplete with success=false when request fails', async () => {
      const onComplete = vi.fn();
      configureCoalescerMetrics({ onComplete });

      const metricsCoalescer = new RequestCoalescer<string>('metrics-error', {
        pendingTtlMs: 60000,
        maxPending: 100,
      });

      const executor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error('test error');
      };

      const promise = metricsCoalescer.execute('key', executor);
      promise.catch(() => {}); // Suppress unhandled rejection

      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).rejects.toThrow('test error');

      // onComplete should be called once with success=false
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith('metrics-error', 'key', expect.any(Number), false);

      metricsCoalescer.clear();
    });

    it('should call onCapacityWarning when approaching capacity', async () => {
      const onCapacityWarning = vi.fn();
      configureCoalescerMetrics({ onCapacityWarning });

      const smallCoalescer = new RequestCoalescer<string>('metrics-capacity', {
        pendingTtlMs: 60000,
        maxPending: 10, // Small capacity for testing
      });

      const neverResolves = () => new Promise<string>(() => {});

      // Fill to 80% capacity (threshold for warning)
      for (let i = 1; i <= 8; i++) {
        void smallCoalescer.execute(`key-${i}`, neverResolves);
      }

      // Warning should be triggered for keys 9 and 10 (at 80% and above)
      void smallCoalescer.execute('key-9', neverResolves);
      expect(onCapacityWarning).toHaveBeenCalledWith('metrics-capacity', 8, 10);

      void smallCoalescer.execute('key-10', neverResolves);
      expect(onCapacityWarning).toHaveBeenCalledWith('metrics-capacity', 9, 10);

      smallCoalescer.clear();
    });
  });
});

describe('hashContent', () => {
  it('should generate consistent hashes for same content', () => {
    const hash1 = hashContent('Hello, World!');
    const hash2 = hashContent('Hello, World!');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different content', () => {
    const hash1 = hashContent('Hello, World!');
    const hash2 = hashContent('Goodbye, World!');
    expect(hash1).not.toBe(hash2);
  });

  it('should return hex string of correct length (SHA256 = 64 chars)', () => {
    const hash = hashContent('test');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Registry Functions', () => {
  beforeEach(() => {
    resetAllCoalescers();
  });

  describe('getRequestCoalescer', () => {
    it('should return same instance for same name', () => {
      const coalescer1 = getRequestCoalescer<string>('test');
      const coalescer2 = getRequestCoalescer<string>('test');
      expect(coalescer1).toBe(coalescer2);
    });

    it('should return different instances for different names', () => {
      const coalescer1 = getRequestCoalescer<string>('test-1');
      const coalescer2 = getRequestCoalescer<string>('test-2');
      expect(coalescer1).not.toBe(coalescer2);
    });
  });

  describe('getAllCoalescerStats', () => {
    it('should return stats for all registered coalescers', async () => {
      const c1 = getRequestCoalescer<string>('embeddings');
      const c2 = getRequestCoalescer<string>('other-api');

      // Generate some activity
      await c1.execute('key', async () => 'result1');
      await c2.execute('key', async () => 'result2');

      const allStats = getAllCoalescerStats();
      expect(allStats).toHaveLength(2);
      expect(allStats.map((s) => s.name)).toContain('embeddings');
      expect(allStats.map((s) => s.name)).toContain('other-api');
    });
  });

  describe('resetAllCoalescers', () => {
    it('should clear all coalescers', async () => {
      const c1 = getRequestCoalescer<string>('test-1');
      await c1.execute('key', async () => 'result');

      resetAllCoalescers();

      const stats = getAllCoalescerStats();
      expect(stats).toHaveLength(0);
    });
  });
});
