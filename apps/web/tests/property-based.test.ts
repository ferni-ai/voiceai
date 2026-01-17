/**
 * Property-Based Testing with fast-check
 *
 * Property-based testing verifies that certain properties hold for ALL possible
 * inputs, not just the examples you thought of. This catches edge cases that
 * example-based tests miss.
 *
 * Philosophy:
 * - Test PROPERTIES, not examples
 * - The framework generates thousands of random inputs
 * - If a property fails, fast-check finds the smallest failing case (shrinking)
 *
 * Common Properties to Look For:
 * - Roundtrip: encode then decode gives original (f(g(x)) === x)
 * - Idempotence: doing twice equals doing once (f(f(x)) === f(x))
 * - Invariants: something always true (length >= 0)
 * - Commutativity: order doesn't matter (a + b === b + a)
 * - Associativity: grouping doesn't matter ((a + b) + c === a + (b + c))
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  compact,
  safeGet,
  first,
  last,
  firstDefined,
  isNonEmptyString,
  isPositiveNumber,
  isNonNegativeNumber,
  isNonEmptyArray,
  isPlainObject,
  invariant,
  assertDefined,
} from '@/utils/guards.js';

import {
  ok,
  err,
  isOk,
  isErr,
  unwrapOr,
  map,
  mapErr,
  chain,
  combine,
  partition,
  fromThrowable,
  type Result,
} from '@/types/result.js';

// ============================================================================
// GUARD UTILITIES - PROPERTY TESTS
// ============================================================================

describe('Guards: Property-Based Tests', () => {
  describe('compact', () => {
    it('never includes null or undefined in output', () => {
      fc.assert(
        fc.property(
          fc.array(fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined))),
          (arr) => {
            const result = compact(arr);
            return result.every((item) => item !== null && item !== undefined);
          }
        )
      );
    });

    it('preserves order of defined elements', () => {
      fc.assert(
        fc.property(fc.array(fc.string()), (arr) => {
          // For an array with no nulls, compact should preserve it exactly
          const result = compact(arr);
          expect(result).toEqual(arr);
        })
      );
    });

    it('is idempotent: compact(compact(arr)) === compact(arr)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.oneof(fc.integer(), fc.constant(null), fc.constant(undefined))),
          (arr) => {
            const once = compact(arr);
            const twice = compact(once);
            expect(twice).toEqual(once);
          }
        )
      );
    });

    it('output length is always <= input length', () => {
      fc.assert(
        fc.property(
          fc.array(fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined))),
          (arr) => {
            const result = compact(arr);
            return result.length <= arr.length;
          }
        )
      );
    });
  });

  describe('safeGet', () => {
    it('returns undefined for negative indices', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string()),
          fc.integer({ max: -1 }),
          (arr, index) => {
            return safeGet(arr, index) === undefined;
          }
        )
      );
    });

    it('returns undefined for out-of-bounds indices', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 0, maxLength: 100 }),
          (arr) => {
            // Index equal to or greater than length is out of bounds
            return safeGet(arr, arr.length) === undefined;
          }
        )
      );
    });

    it('returns the element for valid indices', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1 }),
          (arr) => {
            // Generate a valid index
            const index = Math.floor(Math.random() * arr.length);
            return safeGet(arr, index) === arr[index];
          }
        )
      );
    });

    it('first() is equivalent to safeGet(arr, 0)', () => {
      fc.assert(
        fc.property(fc.array(fc.integer()), (arr) => {
          expect(first(arr)).toBe(safeGet(arr, 0));
        })
      );
    });

    it('last() is equivalent to safeGet(arr, arr.length - 1)', () => {
      fc.assert(
        fc.property(fc.array(fc.integer()), (arr) => {
          expect(last(arr)).toBe(safeGet(arr, arr.length - 1));
        })
      );
    });
  });

  describe('firstDefined', () => {
    it('returns first non-null/undefined value', () => {
      fc.assert(
        fc.property(
          fc.array(fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)), {
            minLength: 0,
            maxLength: 10,
          }),
          (arr) => {
            const result = firstDefined(...arr);
            const expected = arr.find((x) => x !== null && x !== undefined);
            return result === expected;
          }
        )
      );
    });

    it('returns undefined for all-null/undefined array', () => {
      fc.assert(
        fc.property(
          fc.array(fc.oneof(fc.constant(null), fc.constant(undefined))),
          (arr) => {
            return firstDefined(...arr) === undefined;
          }
        )
      );
    });
  });

  describe('type guards', () => {
    describe('isNonEmptyString', () => {
      it('is true for all non-empty strings', () => {
        fc.assert(
          fc.property(fc.string({ minLength: 1 }), (str) => {
            return isNonEmptyString(str) === true;
          })
        );
      });

      it('is false for empty string', () => {
        expect(isNonEmptyString('')).toBe(false);
      });

      it('is false for non-strings', () => {
        fc.assert(
          fc.property(
            fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
            (value) => {
              return isNonEmptyString(value) === false;
            }
          )
        );
      });
    });

    describe('isPositiveNumber', () => {
      it('is true for positive numbers', () => {
        fc.assert(
          fc.property(fc.double({ min: 0.0001, noNaN: true, noDefaultInfinity: true }), (n) => {
            return isPositiveNumber(n) === true;
          })
        );
      });

      it('is false for zero', () => {
        expect(isPositiveNumber(0)).toBe(false);
      });

      it('is false for negative numbers', () => {
        fc.assert(
          fc.property(fc.double({ max: -0.0001, noNaN: true }), (n) => {
            return isPositiveNumber(n) === false;
          })
        );
      });

      it('is false for NaN', () => {
        expect(isPositiveNumber(NaN)).toBe(false);
      });
    });

    describe('isNonNegativeNumber', () => {
      it('is true for positive numbers', () => {
        fc.assert(
          fc.property(fc.double({ min: 0, noNaN: true, noDefaultInfinity: true }), (n) => {
            return isNonNegativeNumber(n) === true;
          })
        );
      });

      it('is true for zero', () => {
        expect(isNonNegativeNumber(0)).toBe(true);
      });

      it('is false for negative numbers', () => {
        fc.assert(
          fc.property(fc.double({ max: -0.0001, noNaN: true }), (n) => {
            return isNonNegativeNumber(n) === false;
          })
        );
      });
    });

    describe('isNonEmptyArray', () => {
      it('is true for non-empty arrays', () => {
        fc.assert(
          fc.property(fc.array(fc.anything(), { minLength: 1 }), (arr) => {
            return isNonEmptyArray(arr) === true;
          })
        );
      });

      it('is false for empty arrays', () => {
        expect(isNonEmptyArray([])).toBe(false);
      });

      it('is false for non-arrays', () => {
        fc.assert(
          fc.property(
            fc.oneof(fc.string(), fc.integer(), fc.object(), fc.constant(null)),
            (value) => {
              return isNonEmptyArray(value) === false;
            }
          )
        );
      });
    });

    describe('isPlainObject', () => {
      it('is true for plain objects', () => {
        fc.assert(
          fc.property(fc.object(), (obj) => {
            return isPlainObject(obj) === true;
          })
        );
      });

      it('is false for arrays', () => {
        fc.assert(
          fc.property(fc.array(fc.anything()), (arr) => {
            return isPlainObject(arr) === false;
          })
        );
      });

      it('is false for null', () => {
        expect(isPlainObject(null)).toBe(false);
      });

      it('is false for primitives', () => {
        fc.assert(
          fc.property(
            fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(undefined)),
            (value) => {
              return isPlainObject(value) === false;
            }
          )
        );
      });
    });
  });
});

// ============================================================================
// RESULT MONAD - PROPERTY TESTS
// ============================================================================

describe('Result Monad: Property-Based Tests', () => {
  describe('constructors and guards', () => {
    it('ok creates result where isOk is true', () => {
      fc.assert(
        fc.property(fc.anything(), (value) => {
          const result = ok(value);
          return isOk(result) === true && isErr(result) === false;
        })
      );
    });

    it('err creates result where isErr is true', () => {
      fc.assert(
        fc.property(fc.string(), (error) => {
          const result = err(error);
          return isErr(result) === true && isOk(result) === false;
        })
      );
    });

    it('isOk and isErr are mutually exclusive', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.anything().map((v) => ok(v)),
            fc.string().map((e) => err(e))
          ),
          (result: Result<unknown, string>) => {
            return isOk(result) !== isErr(result);
          }
        )
      );
    });

    it('ok preserves the value', () => {
      fc.assert(
        fc.property(fc.anything(), (value) => {
          const result = ok(value);
          if (isOk(result)) {
            return result.value === value;
          }
          return false;
        })
      );
    });

    it('err preserves the error', () => {
      fc.assert(
        fc.property(fc.string(), (error) => {
          const result = err(error);
          if (isErr(result)) {
            return result.error === error;
          }
          return false;
        })
      );
    });
  });

  describe('unwrapOr', () => {
    it('returns value for ok result', () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), (value, defaultValue) => {
          const result = ok(value);
          return unwrapOr(result, defaultValue) === value;
        })
      );
    });

    it('returns default for err result', () => {
      fc.assert(
        fc.property(fc.string(), fc.integer(), (error, defaultValue) => {
          const result = err(error);
          return unwrapOr(result, defaultValue) === defaultValue;
        })
      );
    });
  });

  describe('map - functor laws', () => {
    it('identity: map(result, x => x) === result', () => {
      fc.assert(
        fc.property(fc.integer(), (value) => {
          const result = ok(value);
          const mapped = map(result, (x) => x);
          if (isOk(mapped) && isOk(result)) {
            return mapped.value === result.value;
          }
          return false;
        })
      );
    });

    it('composition: map(map(r, f), g) === map(r, x => g(f(x)))', () => {
      const f = (x: number) => x * 2;
      const g = (x: number) => x + 1;

      fc.assert(
        fc.property(fc.integer(), (value) => {
          const result = ok(value);
          const left = map(map(result, f), g);
          const right = map(result, (x) => g(f(x)));

          if (isOk(left) && isOk(right)) {
            return left.value === right.value;
          }
          return false;
        })
      );
    });

    it('preserves err: map(err(e), f) === err(e)', () => {
      fc.assert(
        fc.property(fc.string(), (error) => {
          const result: Result<number, string> = err(error);
          const mapped = map(result, (x) => x * 2);

          if (isErr(mapped) && isErr(result)) {
            return mapped.error === result.error;
          }
          return false;
        })
      );
    });
  });

  describe('mapErr', () => {
    it('transforms error for err result', () => {
      fc.assert(
        fc.property(fc.string(), (error) => {
          const result: Result<number, string> = err(error);
          const mapped = mapErr(result, (e) => e.toUpperCase());

          if (isErr(mapped)) {
            return mapped.error === error.toUpperCase();
          }
          return false;
        })
      );
    });

    it('preserves ok: mapErr(ok(v), f) === ok(v)', () => {
      fc.assert(
        fc.property(fc.integer(), (value) => {
          const result: Result<number, string> = ok(value);
          const mapped = mapErr(result, (e) => e.toUpperCase());

          if (isOk(mapped) && isOk(result)) {
            return mapped.value === result.value;
          }
          return false;
        })
      );
    });
  });

  describe('chain - monad laws', () => {
    it('left identity: chain(ok(a), f) === f(a)', () => {
      const f = (x: number): Result<number, string> => ok(x * 2);

      fc.assert(
        fc.property(fc.integer(), (value) => {
          const left = chain(ok(value), f);
          const right = f(value);

          if (isOk(left) && isOk(right)) {
            return left.value === right.value;
          }
          return isErr(left) && isErr(right);
        })
      );
    });

    it('right identity: chain(m, ok) === m', () => {
      fc.assert(
        fc.property(fc.integer(), (value) => {
          const m: Result<number, string> = ok(value);
          const result = chain(m, ok);

          if (isOk(m) && isOk(result)) {
            return m.value === result.value;
          }
          return isErr(m) && isErr(result);
        })
      );
    });

    it('short-circuits on err: chain(err(e), f) === err(e)', () => {
      const f = (x: number): Result<number, string> => ok(x * 2);

      fc.assert(
        fc.property(fc.string(), (error) => {
          const result: Result<number, string> = err(error);
          const chained = chain(result, f);

          if (isErr(chained) && isErr(result)) {
            return chained.error === result.error;
          }
          return false;
        })
      );
    });
  });

  describe('combine', () => {
    it('all ok returns ok with array of values', () => {
      fc.assert(
        fc.property(fc.array(fc.integer(), { maxLength: 10 }), (values) => {
          const results = values.map((v) => ok(v));
          const combined = combine(results);

          if (isOk(combined)) {
            return (
              combined.value.length === values.length &&
              combined.value.every((v, i) => v === values[i])
            );
          }
          return false;
        })
      );
    });

    it('any err returns first err', () => {
      // Create an array with at least one error
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 1, maxLength: 5 }),
          fc.integer({ min: 0, max: 4 }),
          fc.string({ minLength: 1 }),
          (values, errorIndex, errorMsg) => {
            const results: Array<Result<number, string>> = values.map((v) => ok(v));
            const safeIndex = Math.min(errorIndex, results.length - 1);
            results[safeIndex] = err(errorMsg);

            const combined = combine(results);

            // Should be an error
            if (isErr(combined)) {
              // Should be the error we inserted
              return combined.error === errorMsg;
            }
            return false;
          }
        )
      );
    });

    it('empty array returns ok([])', () => {
      const combined = combine([]);
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([]);
      }
    });
  });

  describe('partition', () => {
    it('maintains count: successes.length + errors.length === results.length', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.integer().map((v) => ok(v)),
              fc.string().map((e) => err(e))
            ),
            { maxLength: 20 }
          ),
          (results: Array<Result<number, string>>) => {
            const { successes, errors } = partition(results);
            return successes.length + errors.length === results.length;
          }
        )
      );
    });

    it('successes contains only values from ok results', () => {
      fc.assert(
        fc.property(fc.array(fc.integer(), { maxLength: 10 }), (values) => {
          const results = values.map((v) => ok(v));
          const { successes, errors } = partition(results);

          return (
            successes.length === values.length &&
            successes.every((s, i) => s === values[i]) &&
            errors.length === 0
          );
        })
      );
    });

    it('errors contains only values from err results', () => {
      fc.assert(
        fc.property(fc.array(fc.string(), { maxLength: 10 }), (errorMsgs) => {
          const results: Array<Result<number, string>> = errorMsgs.map((e) => err(e));
          const { successes, errors } = partition(results);

          return (
            errors.length === errorMsgs.length &&
            errors.every((e, i) => e === errorMsgs[i]) &&
            successes.length === 0
          );
        })
      );
    });
  });

  describe('fromThrowable', () => {
    it('returns ok for non-throwing functions', () => {
      fc.assert(
        fc.property(fc.integer(), (value) => {
          const result = fromThrowable(() => value);
          return isOk(result) && result.value === value;
        })
      );
    });

    it('returns err for throwing functions', () => {
      fc.assert(
        fc.property(fc.string(), (errorMsg) => {
          const result = fromThrowable(() => {
            throw new Error(errorMsg);
          });
          return isErr(result) && (result.error as Error).message === errorMsg;
        })
      );
    });

    it('uses error mapper when provided', () => {
      fc.assert(
        fc.property(fc.string(), (errorMsg) => {
          const result = fromThrowable<number, string>(
            () => {
              throw new Error(errorMsg);
            },
            (e) => (e as Error).message.toUpperCase()
          );
          return isErr(result) && result.error === errorMsg.toUpperCase();
        })
      );
    });
  });
});

// ============================================================================
// EDGE CASES & STRESS TESTS
// ============================================================================

describe('Edge Cases', () => {
  it('compact handles very large arrays', () => {
    const largeArray = Array(10000)
      .fill(null)
      .map((_, i) => (i % 3 === 0 ? null : i));
    const result = compact(largeArray);
    expect(result.every((x) => x !== null)).toBe(true);
  });

  it('combine handles deeply nested results', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 100 }),
        (values) => {
          const results = values.map((v) => ok(v));
          const combined = combine(results);
          return isOk(combined) && combined.value.length === values.length;
        }
      ),
      { numRuns: 50 } // Fewer runs for performance
    );
  });

  it('invariant throws for falsy conditions', () => {
    expect(() => invariant(false, 'should throw')).toThrow('Invariant violation');
    expect(() => invariant(0, 'should throw')).toThrow('Invariant violation');
    expect(() => invariant(null, 'should throw')).toThrow('Invariant violation');
    expect(() => invariant(undefined, 'should throw')).toThrow('Invariant violation');
    expect(() => invariant('', 'should throw')).toThrow('Invariant violation');
  });

  it('assertDefined throws for null/undefined only', () => {
    expect(() => assertDefined(null, 'null')).toThrow();
    expect(() => assertDefined(undefined, 'undefined')).toThrow();

    // These should NOT throw
    expect(assertDefined(0, 'zero')).toBe(0);
    expect(assertDefined('', 'empty string')).toBe('');
    expect(assertDefined(false, 'false')).toBe(false);
  });
});
