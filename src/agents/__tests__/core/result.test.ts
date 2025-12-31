/**
 * Result Type Tests
 *
 * Tests for the core Result<T,E> type and its utilities.
 *
 * @module agents/__tests__/core/result
 */

import { describe, expect, it } from 'vitest';
import { AgentError } from '../../core/errors.js';
import {
  andThen,
  collect,
  collectAll,
  err,
  fromPromise,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  orElse,
  unwrap,
  unwrapOr,
  type Result,
} from '../../core/result.js';

describe('Result Type', () => {
  describe('constructors', () => {
    it('should create Ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should create Err result', () => {
      const error = new AgentError('Test error', { code: 'TEST' });
      const result = err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('type guards', () => {
    it('isOk should identify Ok results', () => {
      const success = ok('hello');
      const failure = err(new Error('oops'));

      expect(isOk(success)).toBe(true);
      expect(isOk(failure)).toBe(false);
    });

    it('isErr should identify Err results', () => {
      const success = ok('hello');
      const failure = err(new Error('oops'));

      expect(isErr(success)).toBe(false);
      expect(isErr(failure)).toBe(true);
    });
  });

  describe('unwrap', () => {
    it('should unwrap Ok value', () => {
      const result = ok('success');
      expect(unwrap(result)).toBe('success');
    });

    it('should throw on Err', () => {
      const result = err(new Error('fail'));
      expect(() => unwrap(result)).toThrow('fail');
    });

    it('should return default for Err with unwrapOr', () => {
      const result = err(new Error('fail'));
      expect(unwrapOr(result, 'default')).toBe('default');
    });

    it('should return value for Ok with unwrapOr', () => {
      const result = ok('value');
      expect(unwrapOr(result, 'default')).toBe('value');
    });
  });

  describe('map', () => {
    it('should transform Ok value', () => {
      const result = ok(5);
      const mapped = map(result, (x) => x * 2);

      expect(mapped.ok).toBe(true);
      if (mapped.ok) {
        expect(mapped.value).toBe(10);
      }
    });

    it('should not transform Err', () => {
      const error = new Error('fail');
      const result = err(error);
      const mapped = map(result, (x: number) => x * 2);

      expect(mapped.ok).toBe(false);
      if (!mapped.ok) {
        expect(mapped.error).toBe(error);
      }
    });
  });

  describe('mapErr', () => {
    it('should transform Err value', () => {
      const result = err('original');
      const mapped = mapErr(result, (e) => `wrapped: ${e}`);

      expect(mapped.ok).toBe(false);
      if (!mapped.ok) {
        expect(mapped.error).toBe('wrapped: original');
      }
    });

    it('should not transform Ok', () => {
      const result = ok(42);
      const mapped = mapErr(result, () => 'error');

      expect(mapped.ok).toBe(true);
      if (mapped.ok) {
        expect(mapped.value).toBe(42);
      }
    });
  });

  describe('andThen', () => {
    it('should chain Ok results', () => {
      const result = ok(5);
      const chained = andThen(result, (x) => ok(x * 2));

      expect(chained.ok).toBe(true);
      if (chained.ok) {
        expect(chained.value).toBe(10);
      }
    });

    it('should short-circuit on Err', () => {
      const result = err(new Error('first'));
      const chained = andThen(result, () => ok(42));

      expect(chained.ok).toBe(false);
    });

    it('should propagate Err from chain', () => {
      const result = ok(5);
      const chained = andThen(result, () => err(new Error('chain error')));

      expect(chained.ok).toBe(false);
      if (!chained.ok) {
        expect(chained.error.message).toBe('chain error');
      }
    });
  });

  describe('orElse', () => {
    it('should provide alternative for Err', () => {
      const result = err(new Error('fail'));
      const recovered = orElse(result, () => ok('recovered'));

      expect(recovered.ok).toBe(true);
      if (recovered.ok) {
        expect(recovered.value).toBe('recovered');
      }
    });

    it('should not change Ok', () => {
      const result = ok('original');
      const recovered = orElse(result, () => ok('recovered'));

      expect(recovered.ok).toBe(true);
      if (recovered.ok) {
        expect(recovered.value).toBe('original');
      }
    });
  });

  describe('fromPromise', () => {
    it('should wrap resolved promise in Ok', async () => {
      const result = await fromPromise(Promise.resolve(42));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('should wrap rejected promise in Err', async () => {
      const result = await fromPromise(Promise.reject(new Error('async fail')));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('async fail');
      }
    });

    it('should use custom error mapper', async () => {
      // Note: `${e}` with an Error calls e.toString() which returns "Error: oops"
      const result = await fromPromise(
        Promise.reject(new Error('oops')),
        (e) => new Error(`Wrapped: ${e}`)
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Wrapped: Error: oops');
      }
    });
  });

  describe('collect', () => {
    it('should collect all Ok results', () => {
      const results: Array<Result<number, Error>> = [ok(1), ok(2), ok(3)];
      const collected = collect(results);

      expect(collected.ok).toBe(true);
      if (collected.ok) {
        expect(collected.value).toEqual([1, 2, 3]);
      }
    });

    it('should return first Err', () => {
      const results: Array<Result<number, Error>> = [ok(1), err(new Error('fail')), ok(3)];
      const collected = collect(results);

      expect(collected.ok).toBe(false);
      if (!collected.ok) {
        expect(collected.error.message).toBe('fail');
      }
    });
  });

  describe('collectAll', () => {
    it('should collect all Ok results', () => {
      const results: Array<Result<number, Error>> = [ok(1), ok(2), ok(3)];
      const collected = collectAll(results);

      expect(collected.ok).toBe(true);
      if (collected.ok) {
        expect(collected.value).toEqual([1, 2, 3]);
      }
    });

    it('should collect all Err results', () => {
      const results: Array<Result<number, Error>> = [
        ok(1),
        err(new Error('first')),
        err(new Error('second')),
      ];
      const collected = collectAll(results);

      expect(collected.ok).toBe(false);
      if (!collected.ok) {
        expect(collected.error).toHaveLength(2);
        expect(collected.error[0].message).toBe('first');
        expect(collected.error[1].message).toBe('second');
      }
    });
  });
});
