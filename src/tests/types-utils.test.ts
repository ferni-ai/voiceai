/**
 * Tests for types/utils.ts
 *
 * Tests utility functions for type-safe operations.
 */

import { describe, it, expect } from 'vitest';
import {
  isNonEmptyArray,
  isNonEmptyString,
  assertNonEmptyString,
  assertDefined,
  assert,
  exhaustiveCheck,
  hasTag,
  createTimestamp,
  timestampToDate,
  typedKeys,
  typedEntries,
  typedFromEntries,
  pick,
  omit,
  type NonEmptyString,
  type Timestamp,
  type Tagged,
} from '../types/utils.js';

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

describe('isNonEmptyArray', () => {
  it('returns true for non-empty arrays', () => {
    expect(isNonEmptyArray([1])).toBe(true);
    expect(isNonEmptyArray([1, 2, 3])).toBe(true);
    expect(isNonEmptyArray(['a', 'b'])).toBe(true);
    expect(isNonEmptyArray([{ key: 'value' }])).toBe(true);
  });

  it('returns false for empty arrays', () => {
    expect(isNonEmptyArray([])).toBe(false);
  });

  it('works with mixed type arrays', () => {
    expect(isNonEmptyArray([1, 'two', null])).toBe(true);
  });
});

// ============================================================================
// STRING UTILITIES
// ============================================================================

describe('isNonEmptyString', () => {
  it('returns true for non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString('a')).toBe(true);
    expect(isNonEmptyString('  hello  ')).toBe(true);
  });

  it('returns false for empty strings', () => {
    expect(isNonEmptyString('')).toBe(false);
  });

  it('returns false for whitespace-only strings', () => {
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString('\t')).toBe(false);
    expect(isNonEmptyString('\n')).toBe(false);
    expect(isNonEmptyString('  \t\n  ')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(123)).toBe(false);
    expect(isNonEmptyString({})).toBe(false);
    expect(isNonEmptyString([])).toBe(false);
  });
});

describe('assertNonEmptyString', () => {
  it('returns the string for valid non-empty strings', () => {
    const result = assertNonEmptyString('hello');
    expect(result).toBe('hello');
  });

  it('throws for empty strings', () => {
    expect(() => assertNonEmptyString('')).toThrow('value must be a non-empty string');
  });

  it('throws for whitespace-only strings', () => {
    expect(() => assertNonEmptyString('   ')).toThrow('value must be a non-empty string');
  });

  it('includes custom name in error message', () => {
    expect(() => assertNonEmptyString('', 'userId')).toThrow('userId must be a non-empty string');
  });

  it('preserves the original string value', () => {
    const input = '  trimmed  ';
    const result = assertNonEmptyString(input);
    expect(result).toBe('  trimmed  ');
  });
});

// ============================================================================
// ASSERTION UTILITIES
// ============================================================================

describe('assertDefined', () => {
  it('returns the value for defined values', () => {
    expect(assertDefined('hello')).toBe('hello');
    expect(assertDefined(0)).toBe(0);
    expect(assertDefined(false)).toBe(false);
    expect(assertDefined('')).toBe('');
    expect(assertDefined({})).toEqual({});
  });

  it('throws for null', () => {
    expect(() => assertDefined(null)).toThrow('value must be defined');
  });

  it('throws for undefined', () => {
    expect(() => assertDefined(undefined)).toThrow('value must be defined');
  });

  it('includes custom name in error message', () => {
    expect(() => assertDefined(null, 'config')).toThrow('config must be defined');
  });
});

describe('assert', () => {
  it('does not throw for true conditions', () => {
    expect(() => assert(true, 'should not throw')).not.toThrow();
    expect(() => assert(1 === 1, 'should not throw')).not.toThrow();
  });

  it('throws for false conditions', () => {
    expect(() => assert(false, 'condition failed')).toThrow('condition failed');
    expect(() => assert(1 === 2, 'numbers not equal')).toThrow('numbers not equal');
  });
});

describe('exhaustiveCheck', () => {
  it('throws with the unhandled value', () => {
    // This simulates what happens when a switch case is missing
    const testValue = 'unexpected' as never;
    expect(() => exhaustiveCheck(testValue)).toThrow('Unhandled value: "unexpected"');
  });

  it('stringifies objects in error', () => {
    const testValue = { type: 'unknown' } as never;
    expect(() => exhaustiveCheck(testValue)).toThrow('Unhandled value: {"type":"unknown"}');
  });
});

// ============================================================================
// DISCRIMINATED UNION HELPERS
// ============================================================================

describe('hasTag', () => {
  type SuccessResult = Tagged<'success', { data: string }>;
  type ErrorResult = Tagged<'error', { message: string }>;
  type Result = SuccessResult | ErrorResult;

  it('returns true when tag matches', () => {
    const success: Result = { tag: 'success', data: 'hello' };
    expect(hasTag(success, 'success')).toBe(true);

    const error: Result = { tag: 'error', message: 'failed' };
    expect(hasTag(error, 'error')).toBe(true);
  });

  it('returns false when tag does not match', () => {
    const success: Result = { tag: 'success', data: 'hello' };
    expect(hasTag(success, 'error')).toBe(false);

    const error: Result = { tag: 'error', message: 'failed' };
    expect(hasTag(error, 'success')).toBe(false);
  });

  it('narrows the type correctly', () => {
    const result: Result = { tag: 'success', data: 'hello' };

    if (hasTag(result, 'success')) {
      // TypeScript should know this is SuccessResult
      expect(result.data).toBe('hello');
    }
  });
});

// ============================================================================
// TIMESTAMP UTILITIES
// ============================================================================

describe('createTimestamp', () => {
  it('creates timestamp from current time when no date provided', () => {
    const before = Date.now();
    const timestamp = createTimestamp();
    const after = Date.now();

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('creates timestamp from provided date', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    const timestamp = createTimestamp(date);

    expect(timestamp).toBe(date.getTime());
  });

  it('returns branded timestamp type', () => {
    const timestamp = createTimestamp();
    // Type check: can be used as a number
    const asNumber: number = timestamp;
    expect(typeof asNumber).toBe('number');
  });
});

describe('timestampToDate', () => {
  it('converts timestamp to Date object', () => {
    const originalDate = new Date('2024-01-15T12:00:00Z');
    const timestamp = createTimestamp(originalDate);
    const result = timestampToDate(timestamp);

    expect(result.getTime()).toBe(originalDate.getTime());
  });

  it('creates valid Date objects', () => {
    const timestamp = createTimestamp();
    const date = timestampToDate(timestamp);

    expect(date instanceof Date).toBe(true);
    expect(isNaN(date.getTime())).toBe(false);
  });
});

// ============================================================================
// OBJECT HELPERS
// ============================================================================

describe('typedKeys', () => {
  it('returns keys of object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const keys = typedKeys(obj);

    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).toContain('c');
    expect(keys.length).toBe(3);
  });

  it('returns empty array for empty object', () => {
    expect(typedKeys({})).toEqual([]);
  });

  it('works with mixed value types', () => {
    const obj = { name: 'test', count: 5, active: true };
    const keys = typedKeys(obj);

    expect(keys).toContain('name');
    expect(keys).toContain('count');
    expect(keys).toContain('active');
  });
});

describe('typedEntries', () => {
  it('returns entries of object', () => {
    const obj = { a: 1, b: 2 };
    const entries = typedEntries(obj);

    expect(entries).toContainEqual(['a', 1]);
    expect(entries).toContainEqual(['b', 2]);
    expect(entries.length).toBe(2);
  });

  it('returns empty array for empty object', () => {
    expect(typedEntries({})).toEqual([]);
  });

  it('preserves value types', () => {
    const obj = { name: 'test', count: 5 };
    const entries = typedEntries(obj);

    const nameEntry = entries.find(([key]) => key === 'name');
    const countEntry = entries.find(([key]) => key === 'count');

    expect(nameEntry?.[1]).toBe('test');
    expect(countEntry?.[1]).toBe(5);
  });
});

describe('typedFromEntries', () => {
  it('creates object from entries', () => {
    const entries: Array<['a' | 'b', number]> = [
      ['a', 1],
      ['b', 2],
    ];
    const obj = typedFromEntries(entries);

    expect(obj).toEqual({ a: 1, b: 2 });
  });

  it('creates empty object from empty entries', () => {
    const entries: Array<[string, number]> = [];
    const obj = typedFromEntries(entries);

    expect(obj).toEqual({});
  });

  it('handles string values', () => {
    const entries: Array<['name' | 'city', string]> = [
      ['name', 'John'],
      ['city', 'NYC'],
    ];
    const obj = typedFromEntries(entries);

    expect(obj).toEqual({ name: 'John', city: 'NYC' });
  });
});

describe('pick', () => {
  it('picks specified keys from object', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const picked = pick(obj, ['a', 'c']);

    expect(picked).toEqual({ a: 1, c: 3 });
  });

  it('returns empty object when picking no keys', () => {
    const obj = { a: 1, b: 2 };
    const picked = pick(obj, []);

    expect(picked).toEqual({});
  });

  it('ignores missing keys', () => {
    const obj = { a: 1, b: 2 };
    // @ts-expect-error - Testing runtime behavior with invalid key
    const picked = pick(obj, ['a', 'missing']);

    expect(picked).toEqual({ a: 1 });
  });

  it('preserves value types', () => {
    const obj = { name: 'test', count: 5, active: true };
    const picked = pick(obj, ['name', 'active']);

    expect(picked).toEqual({ name: 'test', active: true });
  });
});

describe('omit', () => {
  it('omits specified keys from object', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const omitted = omit(obj, ['b', 'd']);

    expect(omitted).toEqual({ a: 1, c: 3 });
  });

  it('returns copy of object when omitting no keys', () => {
    const obj = { a: 1, b: 2 };
    const omitted = omit(obj, []);

    expect(omitted).toEqual({ a: 1, b: 2 });
    expect(omitted).not.toBe(obj); // Should be a new object
  });

  it('handles omitting all keys', () => {
    const obj = { a: 1, b: 2 };
    const omitted = omit(obj, ['a', 'b']);

    expect(omitted).toEqual({});
  });

  it('does not modify original object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const original = { ...obj };
    omit(obj, ['b']);

    expect(obj).toEqual(original);
  });

  it('preserves value types', () => {
    const obj = { name: 'test', count: 5, active: true, data: { nested: 'value' } };
    const omitted = omit(obj, ['count', 'active']);

    expect(omitted).toEqual({ name: 'test', data: { nested: 'value' } });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Type utilities together', () => {
  it('combines pick and typedKeys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const keysToKeep = typedKeys(obj).filter((k) => k !== 'b');
    const picked = pick(obj, keysToKeep as ('a' | 'c')[]);

    expect(picked).toEqual({ a: 1, c: 3 });
  });

  it('combines assertDefined and isNonEmptyString', () => {
    const getValue = (): string | null => 'hello';
    const value = assertDefined(getValue(), 'value');

    if (isNonEmptyString(value)) {
      expect(value).toBe('hello');
    }
  });

  it('combines timestamp functions', () => {
    const now = new Date();
    const timestamp = createTimestamp(now);
    const roundTrip = timestampToDate(timestamp);

    expect(roundTrip.getTime()).toBe(now.getTime());
  });

  it('combines entries and fromEntries', () => {
    const original = { x: 10, y: 20, z: 30 };
    const entries = typedEntries(original);
    const doubled = entries.map(([k, v]) => [k, v * 2] as [keyof typeof original, number]);
    const result = typedFromEntries(doubled);

    expect(result).toEqual({ x: 20, y: 40, z: 60 });
  });
});
