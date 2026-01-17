/**
 * Request Coalescer Vulnerability Tests
 *
 * This test suite attempts to break the coalescer implementation by testing:
 * 1. Data structure edge cases
 * 2. Race conditions
 * 3. Distributed system limitations
 * 4. Error handling edge cases
 *
 * These tests document known limitations and verify correct behavior under stress.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RequestCoalescer,
  getRequestCoalescer,
  resetAllCoalescers,
  hashContent,
  configureCoalescerMetrics,
  resetCoalescerMetrics,
} from '../request-coalescer.js';

// Suppress logs during tests
vi.mock('../safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Request Coalescer Vulnerabilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllCoalescers();
    resetCoalescerMetrics();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // DATA STRUCTURE ISSUES
  // ===========================================================================

  describe('Data Structure Issues', () => {
    it('BUG: shallow cloning does not protect nested objects', async () => {
      // This demonstrates that shallow cloning is insufficient for deeply nested objects
      interface DeepResult {
        data: {
          nested: {
            value: number;
          };
        };
      }

      const coalescer = new RequestCoalescer<DeepResult>('deep-clone-test', {
        // Shallow clone - only copies first level
        cloneResult: (r) => ({ ...r, data: { ...r.data } }),
      });

      let callCount = 0;
      const executor = async (): Promise<DeepResult> => {
        callCount++;
        return { data: { nested: { value: 42 } } };
      };

      // Two concurrent requests
      const [result1, result2] = await Promise.all([
        coalescer.execute('key1', executor),
        coalescer.execute('key1', executor),
      ]);

      // Only one execution
      expect(callCount).toBe(1);

      // BUG: The nested object is shared between results!
      // Mutating one affects the other
      result1.data.nested.value = 999;

      // This FAILS - they share the same nested object reference
      // In production, use structuredClone for deep objects
      expect(result2.data.nested.value).toBe(999); // BUG: Should be 42 but is 999
    });

    it('LIMITATION: type safety is not enforced across registry lookups', async () => {
      // First caller creates a string coalescer
      const stringCoalescer = getRequestCoalescer<string>('type-unsafe');

      // Second caller gets the SAME coalescer but with different type annotation
      // TypeScript won't catch this - it's a runtime type confusion
      const numberCoalescer = getRequestCoalescer<number>('type-unsafe');

      // They're the same instance
      expect(stringCoalescer).toBe(numberCoalescer);

      // This could cause runtime issues if actual types don't match
      // The cloneResult function would receive wrong type
    });

    it('stats counters could theoretically overflow', async () => {
      const coalescer = new RequestCoalescer<number>('overflow-test');

      // In JavaScript, Number.MAX_SAFE_INTEGER is 9007199254740991
      // After that, incrementing loses precision
      // This is unlikely to happen in practice but is a theoretical limit

      const stats = coalescer.getStats();
      expect(stats.totalRequests).toBe(0);

      // Note: We can't actually test overflow without running 9 quadrillion requests
    });

    it('EDGE: metadata field in VectorFilter could contain non-serializable values', () => {
      // The vector search coalescer uses JSON.stringify for the key
      // This can fail for certain values

      const key1 = hashContent(JSON.stringify({
        query: 'test',
        filter: { metadata: { date: new Date('2024-01-01') } },
      }));

      const key2 = hashContent(JSON.stringify({
        query: 'test',
        filter: { metadata: { date: new Date('2024-01-01') } },
      }));

      // These match because Date.toJSON() is called by JSON.stringify
      expect(key1).toBe(key2);

      // But this would fail:
      const circular: Record<string, unknown> = { a: 1 };
      circular['self'] = circular;

      expect(() => {
        JSON.stringify({ query: 'test', filter: { metadata: circular } });
      }).toThrow(); // Circular reference error
    });
  });

  // ===========================================================================
  // RACE CONDITIONS
  // ===========================================================================

  describe('Race Conditions', () => {
    it('SAFE: JavaScript event loop prevents true race conditions', async () => {
      // JavaScript is single-threaded, so "check-then-act" patterns are safe
      // This test verifies that concurrent awaits don't cause issues

      const coalescer = new RequestCoalescer<number>('race-test');
      let executionCount = 0;

      const executor = async () => {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return executionCount;
      };

      // Launch many concurrent requests
      const promises = Array.from({ length: 100 }, () =>
        coalescer.execute('same-key', executor)
      );

      vi.advanceTimersByTime(200);
      const results = await Promise.all(promises);

      // Only one execution happened
      expect(executionCount).toBe(1);

      // All got the same result
      expect(new Set(results).size).toBe(1);
    });

    it('BUG: cloneResult throwing leaves waiters in inconsistent state', async () => {
      let cloneCallCount = 0;
      const coalescer = new RequestCoalescer<number[]>('clone-error-test', {
        cloneResult: (arr) => {
          cloneCallCount++;
          if (cloneCallCount === 2) {
            throw new Error('Clone failed for second waiter');
          }
          return [...arr];
        },
      });

      const executor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return [1, 2, 3];
      };

      const promise1 = coalescer.execute('key', executor);
      const promise2 = coalescer.execute('key', executor);

      vi.advanceTimersByTime(100);

      // First waiter succeeds
      const result1 = await promise1;
      expect(result1).toEqual([1, 2, 3]);

      // Second waiter fails due to clone error
      await expect(promise2).rejects.toThrow('Clone failed for second waiter');

      // The entry was still cleaned up (this is actually correct behavior)
      expect(coalescer.isPending('key')).toBe(false);
    });

    it('FIXED: onComplete callback throwing does not affect cleanup', async () => {
      configureCoalescerMetrics({
        onComplete: () => {
          throw new Error('Metrics callback exploded');
        },
      });

      const coalescer = new RequestCoalescer<number>('metrics-error-test');
      const executor = async () => 42;

      // This should work despite metrics callback throwing - callback is wrapped in try-catch
      const result = await coalescer.execute('key', executor);
      expect(result).toBe(42);

      // Entry cleanup should have happened correctly
      expect(coalescer.isPending('key')).toBe(false);
    });

    it('FIXED: onCoalesce callback throwing does not affect coalescing', async () => {
      configureCoalescerMetrics({
        onCoalesce: () => {
          throw new Error('onCoalesce exploded');
        },
      });

      const coalescer = new RequestCoalescer<number>('coalesce-callback-test');
      let callCount = 0;
      const executor = async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 42;
      };

      // Start two concurrent requests - second should coalesce
      const promise1 = coalescer.execute('key', executor);
      const promise2 = coalescer.execute('key', executor);

      vi.advanceTimersByTime(100);

      // Both should succeed despite callback throwing
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe(42);
      expect(result2).toBe(42);

      // Only one execution should have happened
      expect(callCount).toBe(1);
    });

    it('FIXED: onCapacityWarning callback throwing does not affect execution', async () => {
      configureCoalescerMetrics({
        onCapacityWarning: () => {
          throw new Error('onCapacityWarning exploded');
        },
      });

      const coalescer = new RequestCoalescer<number>('capacity-callback-test', {
        maxPending: 10,
      });

      // Fill up to 80% capacity (8 entries) to trigger warning
      const promises: Promise<number>[] = [];
      for (let i = 0; i < 9; i++) {
        promises.push(
          coalescer.execute(`key${i}`, async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return i;
          })
        );
      }

      vi.advanceTimersByTime(200);

      // All should complete despite callback throwing
      const results = await Promise.all(promises);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('SAFE: TTL expiration and completion don\'t interfere', async () => {
      const coalescer = new RequestCoalescer<number>('ttl-race-test', {
        pendingTtlMs: 100,
      });

      let resolveExecutor: (value: number) => void;
      const executor = () =>
        new Promise<number>((resolve) => {
          resolveExecutor = resolve;
        });

      const promise = coalescer.execute('key', executor);

      // TTL expires
      vi.advanceTimersByTime(150);

      // Entry should be marked expired
      // New request should NOT coalesce
      const secondPromise = coalescer.execute('key', async () => 999);

      // Now resolve the first one
      resolveExecutor!(42);

      const result1 = await promise;
      const result2 = await secondPromise;

      expect(result1).toBe(42);
      expect(result2).toBe(999); // Different execution
    });

    it('EDGE: rapid TTL expiration and replacement', async () => {
      const coalescer = new RequestCoalescer<number>('rapid-ttl-test', {
        pendingTtlMs: 10,
      });

      const executors: Array<(value: number) => void> = [];

      // Create first request
      const promise1 = coalescer.execute('key', () =>
        new Promise<number>((resolve) => {
          executors.push(resolve);
        })
      );

      // Expire TTL
      vi.advanceTimersByTime(15);

      // Create second request (should NOT coalesce with expired first)
      const promise2 = coalescer.execute('key', () =>
        new Promise<number>((resolve) => {
          executors.push(resolve);
        })
      );

      // We should have 2 executors
      expect(executors.length).toBe(2);

      // Resolve them
      executors[0](100);
      executors[1](200);

      const result1 = await promise1;
      const result2 = await promise2;

      expect(result1).toBe(100);
      expect(result2).toBe(200);
    });
  });

  // ===========================================================================
  // DISTRIBUTED SYSTEM LIMITATIONS
  // ===========================================================================

  describe('Distributed System Limitations', () => {
    it('LIMITATION: coalescing is per-process only', () => {
      // This is a documentation test - not an actual test
      // In a multi-instance deployment:
      //
      // Instance A: coalescer.execute('key', () => apiCall())
      // Instance B: coalescer.execute('key', () => apiCall())
      //
      // Both instances will make the API call because they don't share state.
      // Solutions:
      // 1. Distributed locking (Redis SETNX)
      // 2. Request routing (consistent hashing to same instance)
      // 3. Accept the duplication (often fine for read operations)

      expect(true).toBe(true); // Documentation test
    });

    it('LIMITATION: process restart loses all pending requests', () => {
      // If the process crashes or restarts while requests are pending:
      // 1. All waiters' promises will never resolve (memory leak in callers)
      // 2. The actual executor's result is lost
      // 3. Callers must implement their own timeout/retry logic

      expect(true).toBe(true); // Documentation test
    });

    it('LIMITATION: stats are lost on restart', () => {
      const coalescer = new RequestCoalescer<number>('stats-test');

      // Simulate some activity
      coalescer.execute('key1', async () => 1);
      coalescer.execute('key1', async () => 1);

      vi.advanceTimersByTime(100);

      const stats = coalescer.getStats();
      expect(stats.totalRequests).toBe(2);

      // If process restarts, this is lost
      // Would need to persist to Redis/DB for cross-restart stats
    });
  });

  // ===========================================================================
  // ERROR HANDLING EDGE CASES
  // ===========================================================================

  describe('Error Handling Edge Cases', () => {
    it('executor throwing synchronously is handled', async () => {
      const coalescer = new RequestCoalescer<number>('sync-throw-test');

      const executor = (): Promise<number> => {
        throw new Error('Synchronous throw');
      };

      // The async wrapper should catch this
      await expect(coalescer.execute('key', executor)).rejects.toThrow(
        'Synchronous throw'
      );
    });

    it('executor returning non-promise is handled', async () => {
      const coalescer = new RequestCoalescer<number>('non-promise-test');

      // TypeScript prevents this, but JavaScript doesn't
      const executor = (() => 42) as () => Promise<number>;

      // Should still work because await handles non-promises
      const result = await coalescer.execute('key', executor);
      expect(result).toBe(42);
    });

    it('all waiters receive the same error', async () => {
      const coalescer = new RequestCoalescer<number>('error-propagation-test');

      const executor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error('API failed');
      };

      const promise1 = coalescer.execute('key', executor);
      const promise2 = coalescer.execute('key', executor);
      const promise3 = coalescer.execute('key', executor);

      vi.advanceTimersByTime(100);

      // All should reject with the same error
      await expect(promise1).rejects.toThrow('API failed');
      await expect(promise2).rejects.toThrow('API failed');
      await expect(promise3).rejects.toThrow('API failed');

      // Error count should only be 1 (one execution failed)
      const stats = coalescer.getStats();
      expect(stats.errors).toBe(1);
    });

    it('capacity limit rejects immediately without queuing', async () => {
      const coalescer = new RequestCoalescer<number>('capacity-test', {
        maxPending: 2,
      });

      // Create 2 pending requests (at capacity)
      const longExecutor = () =>
        new Promise<number>((resolve) => setTimeout(() => resolve(1), 1000));

      coalescer.execute('key1', longExecutor);
      coalescer.execute('key2', longExecutor);

      // Third request should fail immediately
      await expect(coalescer.execute('key3', longExecutor)).rejects.toThrow(
        'Too many pending requests'
      );

      // Note: There's no backpressure or queueing - just immediate failure
      // This could cause request storms if callers retry immediately
    });

    it('EDGE: hashContent with very long strings', () => {
      // SHA256 should handle any string length
      const longString = 'x'.repeat(10_000_000); // 10MB string

      const hash = hashContent(longString);
      expect(hash).toHaveLength(64); // SHA256 hex is 64 chars

      // Same input = same output
      expect(hashContent(longString)).toBe(hash);
    });

    it('EDGE: hashContent with unicode and special characters', () => {
      const special = '你好世界 🌍 \u0000 \n\r\t "\'';
      const hash = hashContent(special);
      expect(hash).toHaveLength(64);

      // Consistent hashing
      expect(hashContent(special)).toBe(hash);
    });
  });

  // ===========================================================================
  // SEMANTIC ROUTER SPECIFIC ISSUES
  // ===========================================================================

  describe('Semantic Router Coalescing Issues', () => {
    it('LIMITATION: conversationHistory check is shallow', () => {
      // The router only coalesces if conversationHistory is empty or undefined
      // This means:
      // - First turn: coalesced (good)
      // - Second turn with context: not coalesced (correct, context differs)
      // - But two identical second turns with same context: not coalesced (suboptimal)

      // The check is: context?.conversationHistory?.length === 0
      // This doesn't handle the case where two requests have identical history

      expect(true).toBe(true); // Documentation test
    });

    it('EDGE: normalizeText differences cause cache misses', () => {
      // If normalizeText changes between versions, cached keys become invalid
      // This isn't a bug per se, but could cause unexpected behavior during deploys

      expect(true).toBe(true); // Documentation test
    });
  });

  // ===========================================================================
  // VECTOR SEARCH SPECIFIC ISSUES
  // ===========================================================================

  describe('Vector Search Coalescing Issues', () => {
    it('LIMITATION: filter with arrays may not coalesce correctly', () => {
      // JSON.stringify of arrays is order-dependent
      // { source: ['a', 'b'] } !== { source: ['b', 'a'] }
      // even though they might produce the same results

      const key1 = hashContent(JSON.stringify({ source: ['a', 'b'] }));
      const key2 = hashContent(JSON.stringify({ source: ['b', 'a'] }));

      // These are different keys even though semantically equivalent
      expect(key1).not.toBe(key2);
    });

    it('LIMITATION: floating point minScore precision', () => {
      // Floating point comparison in JSON.stringify should be safe
      // but edge cases with precision could cause misses

      const key1 = hashContent(JSON.stringify({ minScore: 0.1 + 0.2 }));
      const key2 = hashContent(JSON.stringify({ minScore: 0.3 }));

      // 0.1 + 0.2 !== 0.3 in JavaScript due to floating point
      expect(key1).not.toBe(key2);
    });
  });

  // ===========================================================================
  // GLOBAL STATE ISSUES
  // ===========================================================================

  describe('Global State Issues', () => {
    it('metricsCallbacks is global mutable state', () => {
      // One test/module configuring metrics affects all coalescers
      // This is intentional for observability but can cause test interference

      let callCount = 0;
      configureCoalescerMetrics({
        onCoalesce: () => {
          callCount++;
        },
      });

      const coalescer1 = new RequestCoalescer<number>('global1');
      const coalescer2 = new RequestCoalescer<number>('global2');

      // Both coalescers will trigger the same callback
      coalescer1.execute('key', async () => 1);
      coalescer1.execute('key', async () => 1);

      coalescer2.execute('key', async () => 2);
      coalescer2.execute('key', async () => 2);

      vi.advanceTimersByTime(100);

      // 2 coalesce events (one per coalescer)
      expect(callCount).toBe(2);
    });

    it('registry is global singleton', () => {
      // Two different modules calling getRequestCoalescer with same name
      // get the same instance - this is intentional but requires coordination

      const coalescer1 = getRequestCoalescer<string>('shared');
      const coalescer2 = getRequestCoalescer<string>('shared');

      expect(coalescer1).toBe(coalescer2);

      // If module A clears it, module B's in-flight requests are affected
      coalescer1.clear();

      expect(coalescer2.getStats().currentPending).toBe(0);
    });
  });
});
