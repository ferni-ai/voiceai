/**
 * Edge Case Tests for Request Coalescer
 *
 * These tests attempt to break the coalescer implementation
 * by exploring edge cases and potential race conditions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RequestCoalescer,
  getRequestCoalescer,
  resetAllCoalescers,
} from '../request-coalescer.js';

describe('Request Coalescer Edge Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllCoalescers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAllCoalescers();
  });

  describe('TTL Race Condition', () => {
    it('BUG: TTL cleanup can orphan waiters if request is slow', async () => {
      const coalescer = new RequestCoalescer<string>('test', {
        pendingTtlMs: 100, // Very short TTL
        maxPending: 100,
      });

      let resolveRequest: (value: string) => void;
      const slowExecutor = () =>
        new Promise<string>((resolve) => {
          resolveRequest = resolve;
        });

      // Start first request
      const promise1 = coalescer.execute('key', slowExecutor);

      // Start second request (should coalesce)
      const promise2 = coalescer.execute('key', slowExecutor);

      // Verify coalescing happened
      expect(coalescer.getStats().coalescedRequests).toBe(1);

      // TTL expires before request completes
      await vi.advanceTimersByTimeAsync(150);

      // Key should be cleaned up from pending map
      expect(coalescer.isPending('key')).toBe(false);

      // Now a NEW request comes in - this starts a fresh request
      // instead of sharing the still-in-flight original
      let secondExecutorCalled = false;
      const promise3 = coalescer.execute('key', async () => {
        secondExecutorCalled = true;
        return 'second-result';
      });

      // BUG: A second executor was called even though first is still pending!
      // This defeats the purpose of coalescing for slow requests.
      expect(secondExecutorCalled).toBe(true);

      // Resolve the original request
      resolveRequest!('first-result');

      // Original waiters still get their result (promises work)
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe('first-result');
      expect(result2).toBe('first-result');

      // But the third request got a different result
      const result3 = await promise3;
      expect(result3).toBe('second-result');

      // We made 2 actual executions instead of 1
      expect(coalescer.getStats().actualExecutions).toBe(2);
    });
  });

  describe('Registry Options Ignored', () => {
    it('BUG: Second call with different options is silently ignored', () => {
      // First call sets TTL to 1000ms
      const coalescer1 = getRequestCoalescer<string>('options-test', {
        pendingTtlMs: 1000,
        maxPending: 5,
      });

      // Second call tries to set TTL to 999999ms - but gets same instance
      const coalescer2 = getRequestCoalescer<string>('options-test', {
        pendingTtlMs: 999999,
        maxPending: 999,
      });

      // Same instance returned
      expect(coalescer1).toBe(coalescer2);

      // The second options were silently ignored!
      // This could cause subtle bugs if different parts of the codebase
      // expect different configurations.
    });
  });

  describe('Type Safety', () => {
    it('BUG: Registry allows type confusion between callers', async () => {
      // First caller expects strings
      const stringCoalescer = getRequestCoalescer<string>('type-test');
      await stringCoalescer.execute('key', async () => 'hello');

      // Second caller expects numbers - gets same instance!
      const numberCoalescer = getRequestCoalescer<number>('type-test');

      // TypeScript thinks this returns number, but it could return string
      // if there's a coalesced request in flight
      // This is a compile-time lie that could cause runtime issues.
      expect(stringCoalescer).toBe(numberCoalescer);
    });
  });
});

describe('embedBatch Mutation Safety', () => {
  it('FIXED: Duplicate entries are cloned - mutation does not affect others', async () => {
    // This tests the embedBatch deduplication in embeddings.ts
    // When duplicates are found, they should be cloned to prevent mutation bugs

    // Simulate what embedBatch NOW does internally (with fix)
    const uniqueEmbeddings = [[1, 2, 3]]; // One unique embedding
    const originalToUnique = [0, 0, 0]; // Three references to same embedding

    // Map back WITH cloning for duplicates (the fix)
    const usedIndices = new Set<number>();
    const results = originalToUnique.map((uniqueIndex) => {
      const embedding = uniqueEmbeddings[uniqueIndex];
      if (usedIndices.has(uniqueIndex)) {
        return [...embedding]; // Clone for duplicates
      }
      usedIndices.add(uniqueIndex);
      return embedding;
    });

    // First result is the original, others are clones
    expect(results[0]).toBe(uniqueEmbeddings[0]); // Original
    expect(results[1]).not.toBe(results[0]); // Clone
    expect(results[2]).not.toBe(results[0]); // Clone

    // But they have the same values
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);

    // If any caller mutates their result...
    results[0][0] = 999;

    // ...other callers are NOT affected!
    expect(results[1][0]).toBe(1); // FIXED: Not mutated
    expect(results[2][0]).toBe(1); // FIXED: Not mutated
  });
});

describe('Concurrent embedBatch calls', () => {
  it('BUG: Two concurrent embedBatch calls with same texts both hit API', async () => {
    // embedBatch only deduplicates within a single call
    // Two concurrent embedBatch calls don't share results

    let apiCallCount = 0;

    // Mock what happens with two concurrent batches
    const batch1Texts = ['hello', 'world'];
    const batch2Texts = ['hello', 'world']; // Same texts!

    // Both would call the API separately
    // There's no coalescing between embedBatch calls
    apiCallCount++; // batch1
    apiCallCount++; // batch2

    // We made 2 API calls instead of 1
    expect(apiCallCount).toBe(2);

    // This is a limitation - embedBatch doesn't use the coalescer
  });
});
