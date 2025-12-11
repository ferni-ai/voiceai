/**
 * Tests for Result Type Pattern
 *
 * Validates the type-safe error handling utilities for memory operations.
 */

import { describe, expect, it } from 'vitest';
import {
  all,
  allSettled,
  andThen,
  err,
  isErr,
  isOk,
  map,
  mapError,
  memoryError,
  ok,
  retry,
  tryAsync,
  trySync,
  unwrap,
  unwrapOr,
  type MemoryError,
  type Result,
} from '../result.js';

describe('Result Type Utilities', () => {
  describe('ok/err constructors', () => {
    it('should create successful results', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect((result as { ok: true; value: number }).value).toBe(42);
    });

    it('should create error results', () => {
      const error = memoryError('document_not_found', 'Item not found');
      const result = err(error);
      expect(result.ok).toBe(false);
      expect((result as { ok: false; error: MemoryError }).error.message).toBe('Item not found');
    });
  });

  describe('memoryError factory', () => {
    it('should create error with all fields', () => {
      const error = memoryError('embedding_failed', 'Failed to retrieve', {
        retryable: true,
        context: { userId: '123' },
        cause: new Error('network error'),
      });

      expect(error.type).toBe('embedding_failed');
      expect(error.message).toBe('Failed to retrieve');
      expect(error.retryable).toBe(true);
      expect(error.context).toEqual({ userId: '123' });
      expect(error.cause).toBeInstanceOf(Error);
    });

    it('should default retryable to false', () => {
      const error = memoryError('document_not_found', 'Not found');
      expect(error.retryable).toBe(false);
    });
  });

  describe('isOk/isErr type guards', () => {
    it('should correctly identify ok results', () => {
      const result = ok('hello');
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('should correctly identify error results', () => {
      const result = err(memoryError('document_not_found', 'Not found'));
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('map', () => {
    it('should transform successful values', () => {
      const result = ok(5);
      const mapped = map(result, (x) => x * 2);
      expect(isOk(mapped)).toBe(true);
      expect((mapped as { ok: true; value: number }).value).toBe(10);
    });

    it('should pass through errors unchanged', () => {
      const error = memoryError('document_not_found', 'Not found');
      const result = err(error);
      const mapped = map(result, (x: number) => x * 2);
      expect(isErr(mapped)).toBe(true);
      expect((mapped as { ok: false; error: MemoryError }).error).toEqual(error);
    });
  });

  describe('mapError', () => {
    it('should pass through successful values unchanged', () => {
      const result = ok(42);
      const mapped = mapError(result, (e: MemoryError) => ({ ...e, message: 'modified' }));
      expect(isOk(mapped)).toBe(true);
      expect((mapped as { ok: true; value: number }).value).toBe(42);
    });

    it('should transform errors', () => {
      const result = err(memoryError('document_not_found', 'Original'));
      const mapped = mapError(result, (e) => memoryError(e.type, 'Modified'));
      expect(isErr(mapped)).toBe(true);
      expect((mapped as { ok: false; error: MemoryError }).error.message).toBe('Modified');
    });
  });

  describe('andThen (flatMap)', () => {
    it('should chain successful operations', () => {
      const parseNumber = (s: string): Result<number, MemoryError> => {
        const n = parseInt(s, 10);
        return isNaN(n) ? err(memoryError('validation_failed', 'Not a number')) : ok(n);
      };

      const double = (n: number): Result<number, MemoryError> => ok(n * 2);

      const result = andThen(parseNumber('21'), double);
      expect(isOk(result)).toBe(true);
      expect((result as { ok: true; value: number }).value).toBe(42);
    });

    it('should short-circuit on error', () => {
      const fail = err(memoryError('document_not_found', 'First error'));
      const result = andThen(fail, () => ok(100));
      expect(isErr(result)).toBe(true);
    });
  });

  describe('unwrapOr', () => {
    it('should return value for success', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('should return default for error', () => {
      const result = err(memoryError('document_not_found', 'Not found'));
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });

  describe('unwrap', () => {
    it('should return value for success', () => {
      expect(unwrap(ok('hello'))).toBe('hello');
    });

    it('should throw for error', () => {
      const result = err(memoryError('document_not_found', 'Item not found'));
      expect(() => unwrap(result)).toThrow('Item not found');
    });
  });

  describe('all', () => {
    it('should return array of values when all succeed', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = all(results);
      expect(isOk(combined)).toBe(true);
      expect((combined as { ok: true; value: number[] }).value).toEqual([1, 2, 3]);
    });

    it('should return first error when any fails', () => {
      const results: Result<number, MemoryError>[] = [
        ok(1),
        err(memoryError('document_not_found', 'First')),
        err(memoryError('document_not_found', 'Second')),
      ];
      const combined = all(results);
      expect(isErr(combined)).toBe(true);
      expect((combined as { ok: false; error: MemoryError }).error.message).toBe('First');
    });
  });

  describe('allSettled', () => {
    it('should separate successes and errors', () => {
      const results: Result<number, MemoryError>[] = [
        ok(1),
        err(memoryError('document_not_found', 'Error 1')),
        ok(2),
        err(memoryError('document_not_found', 'Error 2')),
      ];
      const { successes, errors } = allSettled(results);
      expect(successes).toEqual([1, 2]);
      expect(errors).toHaveLength(2);
    });
  });

  describe('trySync', () => {
    it('should wrap successful sync operation', () => {
      const result = trySync(() => 42);
      expect(isOk(result)).toBe(true);
      expect((result as { ok: true; value: number }).value).toBe(42);
    });

    it('should catch sync errors', () => {
      const result = trySync(() => {
        throw new Error('sync error');
      });
      expect(isErr(result)).toBe(true);
      expect((result as { ok: false; error: MemoryError }).error.message).toBe('sync error');
    });
  });

  describe('tryAsync', () => {
    it('should wrap successful async operation', async () => {
      const result = await tryAsync(async () => 42);
      expect(isOk(result)).toBe(true);
      expect((result as { ok: true; value: number }).value).toBe(42);
    });

    it('should catch async errors', async () => {
      const result = await tryAsync(async () => {
        throw new Error('async error');
      });
      expect(isErr(result)).toBe(true);
      expect((result as { ok: false; error: MemoryError }).error.message).toBe('async error');
    });
  });

  describe('retry', () => {
    it('should succeed on first try', async () => {
      let attempts = 0;
      const result = await retry(async () => {
        attempts++;
        return ok(42);
      });
      expect(isOk(result)).toBe(true);
      expect(attempts).toBe(1);
    });

    it('should retry on retryable error', async () => {
      let attempts = 0;
      const result = await retry(
        async () => {
          attempts++;
          if (attempts < 3) {
            return err({ ...memoryError('embedding_failed', 'Retry'), retryable: true });
          }
          return ok('success');
        },
        { maxAttempts: 5, baseDelayMs: 1 }
      );
      expect(isOk(result)).toBe(true);
      expect(attempts).toBe(3);
    });

    it('should not retry non-retryable errors', async () => {
      let attempts = 0;
      const result = await retry(
        async () => {
          attempts++;
          return err({ ...memoryError('document_not_found', 'Not found'), retryable: false });
        },
        { maxAttempts: 5, baseDelayMs: 1 }
      );
      expect(isErr(result)).toBe(true);
      expect(attempts).toBe(1);
    });
  });
});
