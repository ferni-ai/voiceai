/**
 * Result Utilities Tests
 *
 * Tests for Result type helper functions:
 * - Conversion utilities (tryCatch, tryCatchAsync, wrapWithResult)
 * - Test utilities (expectSuccess, expectFailure, assertSuccessEquals, assertFailureType)
 * - Mock utilities (mockSuccess, mockFailure)
 * - Matcher utilities (toBeSuccess, toBeFailure, etc.)
 * - Pipeline utilities (pipe, executeAll, retryResult)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  tryCatch,
  tryCatchAsync,
  wrapWithResult,
  expectSuccess,
  expectFailure,
  assertSuccessEquals,
  assertFailureType,
  mockSuccess,
  mockFailure,
  resultMatchers,
  pipe,
  executeAll,
  retryResult,
} from '../types/result-utils.js';
import { success, failure, isSuccess, isFailure } from '../types/result.js';

// ============================================================================
// TESTS
// ============================================================================

describe('Result Utilities', () => {
  describe('tryCatch', () => {
    it('should return success for non-throwing function', () => {
      const result = tryCatch(() => 42);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toBe(42);
      }
    });

    it('should return failure when function throws Error', () => {
      const result = tryCatch(() => {
        throw new Error('test error');
      });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('test error');
      }
    });

    it('should wrap non-Error throws in Error', () => {
      const result = tryCatch(() => {
        throw 'string error';
      });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('string error');
      }
    });

    it('should work with complex return types', () => {
      const result = tryCatch(() => ({ name: 'test', value: 123 }));

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toEqual({ name: 'test', value: 123 });
      }
    });
  });

  describe('tryCatchAsync', () => {
    it('should return success for resolved promise', async () => {
      const result = await tryCatchAsync(Promise.resolve('hello'));

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toBe('hello');
      }
    });

    it('should return failure for rejected promise with Error', async () => {
      const result = await tryCatchAsync(Promise.reject(new Error('async error')));

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('async error');
      }
    });

    it('should wrap non-Error rejections', async () => {
      const result = await tryCatchAsync(Promise.reject('string rejection'));

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });

  describe('wrapWithResult', () => {
    it('should wrap async function to return Result on success', async () => {
      const asyncFn = async (x: number) => x * 2;
      const wrapped = wrapWithResult(asyncFn);

      const result = await wrapped(5);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toBe(10);
      }
    });

    it('should wrap async function to return Result on failure', async () => {
      const asyncFn = async () => {
        throw new Error('wrapped error');
      };
      const wrapped = wrapWithResult(asyncFn);

      const result = await wrapped();

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('wrapped error');
      }
    });

    it('should preserve function arguments', async () => {
      const asyncFn = async (a: string, b: number) => `${a}-${b}`;
      const wrapped = wrapWithResult(asyncFn);

      const result = await wrapped('test', 42);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toBe('test-42');
      }
    });
  });

  describe('expectSuccess', () => {
    it('should return data for success result', () => {
      const result = success({ id: 1, name: 'test' });

      const data = expectSuccess(result);

      expect(data).toEqual({ id: 1, name: 'test' });
    });

    it('should throw for failure result', () => {
      const result = failure(new Error('failed'));

      expect(() => expectSuccess(result)).toThrow('Expected success but got failure');
    });
  });

  describe('expectFailure', () => {
    it('should return error for failure result', () => {
      const error = new Error('test error');
      const result = failure(error);

      const returnedError = expectFailure(result);

      expect(returnedError).toBe(error);
    });

    it('should throw for success result', () => {
      const result = success('data');

      expect(() => expectFailure(result)).toThrow('Expected failure but got success');
    });
  });

  describe('assertSuccessEquals', () => {
    it('should not throw when data matches', () => {
      const result = success({ a: 1, b: 2 });

      expect(() => assertSuccessEquals(result, { a: 1, b: 2 })).not.toThrow();
    });

    it('should throw when data does not match', () => {
      const result = success({ a: 1 });

      expect(() => assertSuccessEquals(result, { a: 2 })).toThrow('Expected success data');
    });

    it('should throw for failure result', () => {
      const result = failure(new Error('error'));

      expect(() => assertSuccessEquals(result, 'anything')).toThrow();
    });
  });

  describe('assertFailureType', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }

    it('should not throw when error type matches', () => {
      const result = failure(new CustomError('custom'));

      expect(() => assertFailureType(result, CustomError)).not.toThrow();
    });

    it('should throw when error type does not match', () => {
      const result = failure(new Error('generic'));

      expect(() => assertFailureType(result, CustomError)).toThrow('Expected error type');
    });

    it('should throw for success result', () => {
      const result = success('data');

      expect(() => assertFailureType(result, Error)).toThrow();
    });
  });

  describe('mockSuccess', () => {
    it('should create a success result', () => {
      const mock = mockSuccess({ test: true });

      expect(isSuccess(mock)).toBe(true);
      expect(mock.data).toEqual({ test: true });
    });
  });

  describe('mockFailure', () => {
    it('should create a failure result', () => {
      const error = new Error('mock error');
      const mock = mockFailure(error);

      expect(isFailure(mock)).toBe(true);
      expect(mock.error).toBe(error);
    });
  });

  describe('resultMatchers', () => {
    describe('toBeSuccess', () => {
      it('should pass for success result', () => {
        const result = success('data');
        const matcherResult = resultMatchers.toBeSuccess(result);

        expect(matcherResult.pass).toBe(true);
      });

      it('should fail for failure result', () => {
        const result = failure(new Error('error'));
        const matcherResult = resultMatchers.toBeSuccess(result);

        expect(matcherResult.pass).toBe(false);
        expect(matcherResult.message()).toContain('Expected result to be success');
      });
    });

    describe('toBeFailure', () => {
      it('should pass for failure result', () => {
        const result = failure(new Error('error'));
        const matcherResult = resultMatchers.toBeFailure(result);

        expect(matcherResult.pass).toBe(true);
      });

      it('should fail for success result', () => {
        const result = success('data');
        const matcherResult = resultMatchers.toBeFailure(result);

        expect(matcherResult.pass).toBe(false);
        expect(matcherResult.message()).toContain('Expected result to be failure');
      });
    });

    describe('toSucceedWith', () => {
      it('should pass when data matches', () => {
        const result = success({ id: 1 });
        const matcherResult = resultMatchers.toSucceedWith(result, { id: 1 });

        expect(matcherResult.pass).toBe(true);
      });

      it('should fail when data does not match', () => {
        const result = success({ id: 1 });
        const matcherResult = resultMatchers.toSucceedWith(result, { id: 2 });

        expect(matcherResult.pass).toBe(false);
      });

      it('should fail for failure result', () => {
        const result = failure(new Error('error'));
        const matcherResult = resultMatchers.toSucceedWith(result, 'data');

        expect(matcherResult.pass).toBe(false);
      });
    });

    describe('toFailWithType', () => {
      class SpecificError extends Error {}

      it('should pass when error type matches', () => {
        const result = failure(new SpecificError('specific'));
        const matcherResult = resultMatchers.toFailWithType(result, SpecificError);

        expect(matcherResult.pass).toBe(true);
      });

      it('should fail when error type does not match', () => {
        const result = failure(new Error('generic'));
        const matcherResult = resultMatchers.toFailWithType(result, SpecificError);

        expect(matcherResult.pass).toBe(false);
      });

      it('should fail for success result', () => {
        const result = success('data');
        const matcherResult = resultMatchers.toFailWithType(result, Error);

        expect(matcherResult.pass).toBe(false);
      });
    });
  });

  describe('pipe', () => {
    it('should chain successful results', () => {
      const result = success(5);
      const piped = pipe(result, (n) => success(n * 2));

      expect(isSuccess(piped)).toBe(true);
      if (isSuccess(piped)) {
        expect(piped.data).toBe(10);
      }
    });

    it('should short-circuit on failure', () => {
      const result = failure<number, Error>(new Error('failed'));
      const fn = vi.fn((n: number) => success(n * 2));

      const piped = pipe(result, fn);

      expect(isFailure(piped)).toBe(true);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('executeAll', () => {
    it('should collect all successes', async () => {
      const operations = [
        async () => success(1),
        async () => success(2),
        async () => success(3),
      ];

      const result = await executeAll(operations);

      expect(result.successes).toEqual([1, 2, 3]);
      expect(result.failures).toEqual([]);
    });

    it('should collect all failures', async () => {
      const error1 = new Error('error1');
      const error2 = new Error('error2');
      const operations = [
        async () => failure(error1),
        async () => failure(error2),
      ];

      const result = await executeAll(operations);

      expect(result.successes).toEqual([]);
      expect(result.failures).toContain(error1);
      expect(result.failures).toContain(error2);
    });

    it('should collect both successes and failures', async () => {
      const error = new Error('error');
      const operations = [
        async () => success(1),
        async () => failure(error),
        async () => success(3),
      ];

      const result = await executeAll(operations);

      expect(result.successes).toEqual([1, 3]);
      expect(result.failures).toContain(error);
    });

    it('should handle empty operations array', async () => {
      const result = await executeAll([]);

      expect(result.successes).toEqual([]);
      expect(result.failures).toEqual([]);
    });
  });

  describe('retryResult', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should return success on first try', async () => {
      const operation = vi.fn(async () => success(42));

      const resultPromise = retryResult(operation, { maxAttempts: 3 });
      const result = await resultPromise;

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toBe(42);
      }
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const operation = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          return failure(new Error('retry'));
        }
        return success('done');
      });

      const resultPromise = retryResult(operation, { maxAttempts: 3, delayMs: 100 });
      
      // Advance through retries
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      
      const result = await resultPromise;

      expect(isSuccess(result)).toBe(true);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should return last failure after max attempts', async () => {
      const error = new Error('always fails');
      const operation = vi.fn(async () => failure(error));

      const resultPromise = retryResult(operation, { maxAttempts: 2, delayMs: 100 });
      
      await vi.advanceTimersByTimeAsync(100);
      
      const result = await resultPromise;

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toBe(error);
      }
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use shouldRetry to control delay between retries', async () => {
      const retryableError = new Error('retryable');
      const operation = vi.fn(async () => failure(retryableError));

      const resultPromise = retryResult(operation, {
        maxAttempts: 3,
        delayMs: 100,
        shouldRetry: (err) => err.message === 'retryable',
      });

      // Advance through delays (100ms * attempt number)
      await vi.advanceTimersByTimeAsync(100); // attempt 1 delay
      await vi.advanceTimersByTimeAsync(200); // attempt 2 delay

      const result = await resultPromise;

      expect(isFailure(result)).toBe(true);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    afterEach(() => {
      vi.useRealTimers();
    });
  });
});
