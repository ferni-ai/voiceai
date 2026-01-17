/**
 * Async Singleton Tests
 *
 * Tests for thread-safe async singleton pattern implementations.
 *
 * @module utils/__tests__/async-singleton.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAsyncSingleton,
  createNullableAsyncSingleton,
  createResettableAsyncSingleton,
} from '../async-singleton.js';

describe('Async Singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAsyncSingleton', () => {
    it('should return same instance for multiple calls', async () => {
      let initCount = 0;
      const getInstance = createAsyncSingleton(
        async () => {
          initCount++;
          return { id: 'test' };
        },
        { name: 'test' }
      );

      const [a, b, c] = await Promise.all([getInstance(), getInstance(), getInstance()]);

      expect(a).toBe(b);
      expect(b).toBe(c);
      expect(initCount).toBe(1);
    });

    it('should handle concurrent initialization requests', async () => {
      const initDelay = 50;
      let initCount = 0;

      const getInstance = createAsyncSingleton(
        async () => {
          initCount++;
          await new Promise((r) => setTimeout(r, initDelay));
          return { value: initCount };
        },
        { name: 'concurrent-test' }
      );

      // Fire multiple concurrent requests
      const promises = Array.from({ length: 10 }, () => getInstance());
      const results = await Promise.all(promises);

      // All should get the same instance
      const firstResult = results[0];
      results.forEach((result) => {
        expect(result).toBe(firstResult);
      });

      // Initializer should only be called once
      expect(initCount).toBe(1);
    });

    it('should call onSuccess callback', async () => {
      const onSuccess = vi.fn();

      const getInstance = createAsyncSingleton(async () => ({ test: true }), {
        name: 'success-callback',
        onSuccess,
      });

      await getInstance();

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith({ test: true });
    });

    it('should retry on error with retryOnError=true', async () => {
      let callCount = 0;

      const getInstance = createAsyncSingleton(
        async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('first call fails');
          }
          return { success: true };
        },
        { name: 'retry-test', retryOnError: true }
      );

      // First call should fail
      await expect(getInstance()).rejects.toThrow('first call fails');

      // Second call should succeed
      const result = await getInstance();
      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });

    it('should call onError callback on failure', async () => {
      const onError = vi.fn();
      const error = new Error('test error');

      const getInstance = createAsyncSingleton(
        async () => {
          return Promise.reject(error);
        },
        { name: 'error-callback', onError, retryOnError: true }
      );

      await expect(getInstance()).rejects.toThrow('test error');
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('createNullableAsyncSingleton', () => {
    it('should return null result from initializer', async () => {
      const getInstance = createNullableAsyncSingleton(async () => null, {
        name: 'nullable-null',
      });

      const result = await getInstance();
      expect(result).toBe(null);

      // Subsequent calls should also return null (cached)
      const result2 = await getInstance();
      expect(result2).toBe(null);
    });

    it('should return value when initializer succeeds', async () => {
      const getInstance = createNullableAsyncSingleton(async () => ({ value: 42 }), {
        name: 'nullable-value',
      });

      const result = await getInstance();
      expect(result).toEqual({ value: 42 });
    });

    it('should return null on error instead of throwing', async () => {
      const onError = vi.fn();

      const getInstance = createNullableAsyncSingleton(
        async () => {
          return Promise.reject(new Error('init failed'));
        },
        { name: 'nullable-error', onError }
      );

      const result = await getInstance();
      expect(result).toBe(null);
      expect(onError).toHaveBeenCalled();
    });

    it('should call onSuccess for non-null results', async () => {
      const onSuccess = vi.fn();

      const getInstance = createNullableAsyncSingleton(async () => ({ id: 1 }), {
        name: 'nullable-success',
        onSuccess,
      });

      await getInstance();
      expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
    });

    it('should NOT call onSuccess for null results', async () => {
      const onSuccess = vi.fn();

      const getInstance = createNullableAsyncSingleton(async () => null, {
        name: 'nullable-null-success',
        onSuccess,
      });

      await getInstance();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('createResettableAsyncSingleton', () => {
    it('should support reset', async () => {
      let initCount = 0;

      const { get, reset } = createResettableAsyncSingleton(
        async () => {
          initCount++;
          return { count: initCount };
        },
        { name: 'resettable' }
      );

      const first = await get();
      expect(first.count).toBe(1);

      const second = await get();
      expect(second.count).toBe(1);
      expect(second).toBe(first);

      // Reset
      reset();

      const third = await get();
      expect(third.count).toBe(2);
      expect(third).not.toBe(first);
    });

    it('should handle concurrent calls after reset', async () => {
      let initCount = 0;

      const { get, reset } = createResettableAsyncSingleton(
        async () => {
          initCount++;
          await new Promise((r) => setTimeout(r, 10));
          return { count: initCount };
        },
        { name: 'resettable-concurrent' }
      );

      await get();
      reset();

      // Concurrent calls after reset
      const promises = Array.from({ length: 5 }, () => get());
      const results = await Promise.all(promises);

      // All should be same instance
      const first = results[0];
      results.forEach((r) => expect(r).toBe(first));

      // Should have initialized twice total (once before reset, once after)
      expect(initCount).toBe(2);
    });
  });
});
