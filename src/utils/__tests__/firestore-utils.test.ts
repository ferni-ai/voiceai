/**
 * Firestore Utils Tests
 *
 * Tests for Firestore data cleaning and transformation.
 *
 * @module utils/__tests__/firestore-utils.test
 */

import { describe, it, expect, vi } from 'vitest';
import { FieldValue } from '@google-cloud/firestore';

// src/tests/setup.ts mocks this module for every test; test the real one.
vi.unmock('../firestore-utils.js');
import {
  removeUndefined,
  deepRemoveUndefined,
  cleanForFirestore,
  toSafeDate,
  toSafeDateOptional,
} from '../firestore-utils.js';

describe('Firestore Utils', () => {
  describe('removeUndefined', () => {
    it('should remove undefined values', () => {
      const result = removeUndefined({
        name: 'John',
        age: 30,
        email: undefined,
      });

      expect(result).toEqual({ name: 'John', age: 30 });
      expect('email' in result).toBe(false);
    });

    it('should keep null values', () => {
      const result = removeUndefined({
        name: 'John',
        email: null,
      });

      expect(result).toEqual({ name: 'John', email: null });
    });

    it('should keep empty strings', () => {
      const result = removeUndefined({
        name: '',
        value: 0,
      });

      expect(result).toEqual({ name: '', value: 0 });
    });

    it('should handle empty object', () => {
      expect(removeUndefined({})).toEqual({});
    });

    it('should handle all undefined', () => {
      const result = removeUndefined({
        a: undefined,
        b: undefined,
      });

      expect(result).toEqual({});
    });
  });

  describe('deepRemoveUndefined', () => {
    it('should remove nested undefined values', () => {
      const result = deepRemoveUndefined({
        user: {
          name: 'John',
          settings: {
            theme: undefined,
            lang: 'en',
          },
        },
      });

      expect(result).toEqual({
        user: {
          name: 'John',
          settings: {
            lang: 'en',
          },
        },
      });
    });

    it('should handle arrays', () => {
      const result = deepRemoveUndefined({
        items: [
          { id: 1, value: undefined },
          { id: 2, value: 'test' },
        ],
      });

      expect(result).toEqual({
        items: [{ id: 1 }, { id: 2, value: 'test' }],
      });
    });

    it('should handle null', () => {
      expect(deepRemoveUndefined(null)).toBeNull();
    });

    it('keeps Dates and other class instances (e.g. Firestore FieldValues) as they are', () => {
      class Vector {
        constructor(readonly values: number[]) {}
      }
      const when = new Date('2026-09-29T00:00:00Z');
      const vector = new Vector([0.1, 0.2]);
      const result = deepRemoveUndefined({ when, embedding: vector, meta: { a: undefined, b: 1 } });
      expect(result.when).toBe(when);
      expect(result.embedding).toBe(vector);
      expect(result.meta).toEqual({ b: 1 });
    });

    it('should handle undefined', () => {
      expect(deepRemoveUndefined(undefined)).toBeUndefined();
    });

    it('should handle primitives', () => {
      expect(deepRemoveUndefined('string')).toBe('string');
      expect(deepRemoveUndefined(123)).toBe(123);
      expect(deepRemoveUndefined(true)).toBe(true);
    });
  });

  describe('cleanForFirestore', () => {
    it('should remove undefined values', () => {
      const result = cleanForFirestore({
        name: 'John',
        age: undefined,
      });

      expect(result).toEqual({ name: 'John' });
    });

    it('should convert Date to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = cleanForFirestore({
        createdAt: date,
      });

      expect(result).toEqual({
        createdAt: '2024-01-15T10:30:00.000Z',
      });
    });

    it('should handle nested objects with dates', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = cleanForFirestore({
        user: {
          name: 'John',
          metadata: {
            lastLogin: date,
            preferences: undefined,
          },
        },
      });

      expect(result).toEqual({
        user: {
          name: 'John',
          metadata: {
            lastLogin: '2024-01-15T10:30:00.000Z',
          },
        },
      });
    });

    it('should handle arrays with dates', () => {
      const dates = [new Date('2024-01-01'), new Date('2024-02-01')];
      const result = cleanForFirestore({
        dates: dates,
      });

      expect(result.dates[0]).toBe(dates[0].toISOString());
      expect(result.dates[1]).toBe(dates[1].toISOString());
    });

    it('should handle null', () => {
      expect(cleanForFirestore(null)).toBeNull();
    });

    it('should handle undefined', () => {
      expect(cleanForFirestore(undefined)).toBeUndefined();
    });

    it('should preserve FieldValue sentinels (increment, serverTimestamp) by identity, even nested', () => {
      // Regression test for PR #175 critic review: cleanForFirestore special-cased
      // Date and Timestamp (.toDate()) but not FieldValue transforms. Rebuilding
      // one via Object.entries() turns it into a plain `{}`, silently losing the
      // server-side transform (serverTimestamp/increment/arrayUnion/arrayRemove/delete).
      const increment = FieldValue.increment(5);
      const serverTimestamp = FieldValue.serverTimestamp();
      const arrayUnion = FieldValue.arrayUnion('tag');
      const arrayRemove = FieldValue.arrayRemove('old-tag');
      const del = FieldValue.delete();

      const result = cleanForFirestore({
        topLevelIncrement: increment,
        nested: {
          deep: {
            counter: increment,
            updatedAt: serverTimestamp,
          },
          tags: arrayUnion,
          oldTags: arrayRemove,
          removedField: del,
        },
        events: [{ id: 'e1', occurrences: increment }, { id: 'e2', estimatedValueCents: undefined }],
      });

      // Identity preserved (`toBe`, not `toEqual`) - a rebuilt plain object
      // would fail this even if it happened to look structurally similar.
      expect(result.topLevelIncrement).toBe(increment);
      expect(result.nested.deep.counter).toBe(increment);
      expect(result.nested.deep.updatedAt).toBe(serverTimestamp);
      expect(result.nested.tags).toBe(arrayUnion);
      expect(result.nested.oldTags).toBe(arrayRemove);
      expect(result.nested.removedField).toBe(del);
      expect(result.events[0].occurrences).toBe(increment);

      // Still deep-cleans `undefined` as usual alongside the sentinels.
      expect(result.events[1]).not.toHaveProperty('estimatedValueCents');
      expect(result.events[1]).toEqual({ id: 'e2' });

      // instanceof still holds post-clean (not just reference equality).
      expect(result.topLevelIncrement instanceof FieldValue).toBe(true);
    });

    it('should handle complex nested structure', () => {
      const result = cleanForFirestore({
        id: '123',
        name: 'Test',
        optional: undefined,
        created: new Date('2024-01-01'),
        nested: {
          value: 42,
          removed: undefined,
          deep: {
            date: new Date('2024-06-15'),
          },
        },
        array: [
          { id: 1, date: new Date('2024-03-01') },
          { id: 2, removed: undefined },
        ],
      });

      expect(result).toEqual({
        id: '123',
        name: 'Test',
        created: '2024-01-01T00:00:00.000Z',
        nested: {
          value: 42,
          deep: {
            date: '2024-06-15T00:00:00.000Z',
          },
        },
        array: [{ id: 1, date: '2024-03-01T00:00:00.000Z' }, { id: 2 }],
      });
    });
  });

  describe('toSafeDate', () => {
    it('should return Date unchanged', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      expect(toSafeDate(date)).toEqual(date);
    });

    it('should handle Firestore Timestamp with toDate method', () => {
      const mockTimestamp = {
        toDate: () => new Date('2024-01-15T10:30:00.000Z'),
        seconds: 1705314600,
        nanoseconds: 0,
      };
      expect(toSafeDate(mockTimestamp)).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    });

    it('should handle serialized Timestamp with seconds (toJSON format)', () => {
      const serialized = { seconds: 1705314600, nanoseconds: 0 };
      const result = toSafeDate(serialized);
      expect(result.getTime()).toBe(1705314600000);
    });

    it('should handle serialized Timestamp with _seconds (JSON.stringify format)', () => {
      const serialized = { _seconds: 1705314600, _nanoseconds: 0 };
      const result = toSafeDate(serialized);
      expect(result.getTime()).toBe(1705314600000);
    });

    it('should handle nanoseconds precision', () => {
      const serialized = { _seconds: 1705314600, _nanoseconds: 500000000 };
      const result = toSafeDate(serialized);
      expect(result.getTime()).toBe(1705314600500);
    });

    it('should handle ISO string', () => {
      const result = toSafeDate('2024-01-15T10:30:00.000Z');
      expect(result).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    });

    it('should handle numeric timestamp', () => {
      const result = toSafeDate(1705314600000);
      expect(result.getTime()).toBe(1705314600000);
    });

    it('should return fallback for null/undefined', () => {
      const fallback = new Date('2024-01-01');
      expect(toSafeDate(null, fallback)).toEqual(fallback);
      expect(toSafeDate(undefined, fallback)).toEqual(fallback);
    });

    it('should return current date as default fallback', () => {
      const before = Date.now();
      const result = toSafeDate(null);
      const after = Date.now();
      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });

    it('should return fallback for invalid string', () => {
      const fallback = new Date('2024-01-01');
      expect(toSafeDate('not-a-date', fallback)).toEqual(fallback);
    });
  });

  describe('toSafeDateOptional', () => {
    it('should return undefined for null', () => {
      expect(toSafeDateOptional(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(toSafeDateOptional(undefined)).toBeUndefined();
    });

    it('should return Date for valid input', () => {
      const date = new Date('2024-01-15');
      expect(toSafeDateOptional(date)).toEqual(date);
    });

    it('should handle serialized Timestamp', () => {
      const serialized = { _seconds: 1705314600, _nanoseconds: 0 };
      const result = toSafeDateOptional(serialized);
      expect(result).toBeDefined();
      expect(result!.getTime()).toBe(1705314600000);
    });

    it('should handle ISO string', () => {
      const result = toSafeDateOptional('2024-01-15T10:30:00.000Z');
      expect(result).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    });
  });
});
