/**
 * Async Utilities Tests
 *
 * Tests for debouncing, throttling, timeouts, retry, and parallel execution.
 *
 * @module utils/__tests__/async.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  debounceAsync,
  throttleAsync,
  withTimeout,
  retry,
  parallelLimit,
  sequence,
  sleep,
  defer,
  waitFor,
  TimeoutError,
} from '../async.js';

describe('async utilities', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sleep', () => {
    it('should wait for specified duration', async () => {
      vi.useFakeTimers();

      let resolved = false;
      const promise = sleep(100).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      vi.advanceTimersByTime(100);
      await promise;

      expect(resolved).toBe(true);
    });
  });

  describe('defer', () => {
    it('should create a deferred promise', async () => {
      const { promise, resolve } = defer<string>();

      let result: string | undefined;
      promise.then((r) => {
        result = r;
      });

      expect(result).toBeUndefined();

      resolve('hello');
      await promise;

      expect(result).toBe('hello');
    });

    it('should allow rejection', async () => {
      const { promise, reject } = defer<string>();

      reject(new Error('test error'));

      await expect(promise).rejects.toThrow('test error');
    });
  });

  describe('withTimeout', () => {
    it('should resolve if operation completes in time', async () => {
      const result = await withTimeout(Promise.resolve('success'), 1000, 'test');
      expect(result).toBe('success');
    });

    it('should reject with TimeoutError if operation takes too long', async () => {
      vi.useFakeTimers();

      const slowPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('late'), 2000);
      });

      const timeoutPromise = withTimeout(slowPromise, 100, 'test');

      vi.advanceTimersByTime(100);

      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
      await expect(timeoutPromise).rejects.toThrow('test timed out after 100ms');
    });

    it('should include timeout duration in error', async () => {
      vi.useFakeTimers();

      const slowPromise = new Promise<string>(() => {});
      const timeoutPromise = withTimeout(slowPromise, 500, 'operation');

      vi.advanceTimersByTime(500);

      try {
        await timeoutPromise;
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as TimeoutError).timeoutMs).toBe(500);
      }
    });
  });

  describe('retry', () => {
    it('should succeed on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      const result = await retry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        jitter: false,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('network error'));

      await expect(retry(fn, { maxRetries: 2, initialDelay: 10, jitter: false })).rejects.toThrow(
        'network error'
      );

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should call onRetry callback', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      await retry(fn, {
        maxRetries: 2,
        initialDelay: 10,
        jitter: false,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 10);
    });

    it('should respect shouldRetry predicate', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('non-retryable'));

      const shouldRetry = vi.fn().mockReturnValue(false);

      await expect(
        retry(fn, {
          maxRetries: 3,
          initialDelay: 10,
          shouldRetry,
        })
      ).rejects.toThrow('non-retryable');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalled();
    });
  });

  describe('parallelLimit', () => {
    it('should execute all tasks', async () => {
      const tasks = [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)];

      const results = await parallelLimit(tasks, 2);

      expect(results).toEqual([1, 2, 3]);
    });

    it('should respect concurrency limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array.from({ length: 10 }, (_, i) => async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await sleep(10);
        concurrent--;
        return i;
      });

      await parallelLimit(tasks, 3);

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should handle empty task array', async () => {
      const results = await parallelLimit([], 5);
      expect(results).toEqual([]);
    });
  });

  describe('sequence', () => {
    it('should execute tasks in order', async () => {
      const order: number[] = [];

      const tasks = [
        async () => {
          await sleep(30);
          order.push(1);
          return 1;
        },
        async () => {
          await sleep(10);
          order.push(2);
          return 2;
        },
        async () => {
          order.push(3);
          return 3;
        },
      ];

      const results = await sequence(tasks);

      expect(results).toEqual([1, 2, 3]);
      expect(order).toEqual([1, 2, 3]); // Sequential, not by completion time
    });
  });

  describe('debounceAsync', () => {
    it('should debounce multiple calls', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const debounced = debounceAsync(fn, 30);

      // Make several rapid calls - all return the same promise
      const p1 = debounced('a');
      const p2 = debounced('b');
      const p3 = debounced('c');

      // Wait for the debounced function to execute
      const result = await p3;

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c'); // Only last args used
      expect(result).toBe('result');

      // All promises should resolve with the same result
      expect(await p1).toBe('result');
      expect(await p2).toBe('result');
    });

    it('should execute function after delay with single call', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const debounced = debounceAsync(fn, 30);

      const result = await debounced('test');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('test');
      expect(result).toBe('result');
    });

    it('should support cancel', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const debounced = debounceAsync(fn, 100);

      const promise = debounced('a');
      debounced.cancel();

      await expect(promise).rejects.toThrow('cancelled');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should support flush', async () => {
      const fn = vi.fn().mockResolvedValue('flushed');
      const debounced = debounceAsync(fn, 1000);

      debounced('pending');
      const result = await debounced.flush();

      expect(fn).toHaveBeenCalledWith('pending');
      expect(result).toBe('flushed');
    });
  });

  describe('throttleAsync', () => {
    it('should throttle calls', async () => {
      vi.useFakeTimers();

      const fn = vi.fn().mockImplementation(async (x) => x);
      const throttled = throttleAsync(fn, 100);

      // First call executes immediately
      const first = await throttled('a');
      expect(first).toBe('a');

      // Subsequent calls within interval are throttled
      const secondPromise = throttled('b');

      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      await secondPromise;

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should support cancel', () => {
      vi.useFakeTimers();

      const fn = vi.fn().mockResolvedValue('result');
      const throttled = throttleAsync(fn, 100);

      throttled('a');
      throttled('b');

      throttled.cancel();

      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('waitFor', () => {
    it('should resolve when condition becomes true', async () => {
      let ready = false;
      setTimeout(() => {
        ready = true;
      }, 50);

      await expect(waitFor(() => ready, { timeout: 500, interval: 10 })).resolves.toBeUndefined();
    });

    it('should reject on timeout', async () => {
      const promise = waitFor(() => false, { timeout: 100, interval: 20 });

      await expect(promise).rejects.toThrow(TimeoutError);
    });

    it('should support async conditions', async () => {
      let callCount = 0;
      const asyncCondition = async () => {
        callCount++;
        return callCount >= 3;
      };

      await waitFor(asyncCondition, { timeout: 1000, interval: 10 });

      expect(callCount).toBeGreaterThanOrEqual(3);
    });
  });
});
