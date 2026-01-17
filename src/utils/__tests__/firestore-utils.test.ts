/**
 * Firestore Utils Tests
 *
 * Tests for Firestore data cleaning and transformation.
 *
 * @module utils/__tests__/firestore-utils.test
 */

import { describe, it, expect } from 'vitest';
import { removeUndefined, deepRemoveUndefined, cleanForFirestore } from '../firestore-utils.js';

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
        items: [{ id: 1, value: undefined }, { id: 2, value: 'test' }],
      });

      expect(result).toEqual({
        items: [{ id: 1 }, { id: 2, value: 'test' }],
      });
    });

    it('should handle null', () => {
      expect(deepRemoveUndefined(null)).toBeNull();
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
});
