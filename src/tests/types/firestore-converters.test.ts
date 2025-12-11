/**
 * Tests for Firestore Converters
 *
 * Tests the type-safe Firestore converters with branded types.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  createFirestoreConverter,
  createUserProfileConverter,
  createSessionConverter,
  convertTimestampsToDate,
  convertDatesForFirestore,
  toBrandedId,
  createPartialUpdate,
  createNestedUpdate,
  validateForFirestore,
  safeParseFromFirestore,
} from '../../types/firestore/index.js';

// ============================================================================
// MOCK FIRESTORE TYPES
// ============================================================================

interface MockTimestamp {
  toDate(): Date;
  seconds: number;
  nanoseconds: number;
}

function createMockTimestamp(date: Date): MockTimestamp {
  return {
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: (date.getTime() % 1000) * 1_000_000,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Firestore Converters', () => {
  describe('convertTimestampsToDate', () => {
    it('should convert Firestore Timestamp to Date', () => {
      const now = new Date();
      const timestamp = createMockTimestamp(now);

      const result = convertTimestampsToDate(timestamp);

      expect(result).toEqual(now);
    });

    it('should convert nested timestamps', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-06-01');

      const data = {
        name: 'Test',
        createdAt: createMockTimestamp(date1),
        nested: {
          updatedAt: createMockTimestamp(date2),
        },
      };

      const result = convertTimestampsToDate(data);

      expect(result.name).toBe('Test');
      expect(result.createdAt).toEqual(date1);
      expect(result.nested.updatedAt).toEqual(date2);
    });

    it('should convert timestamps in arrays', () => {
      const date = new Date('2024-03-15');
      const data = {
        events: [
          { name: 'Event 1', at: createMockTimestamp(date) },
          { name: 'Event 2', at: createMockTimestamp(date) },
        ],
      };

      const result = convertTimestampsToDate(data);

      expect(result.events[0].at).toEqual(date);
      expect(result.events[1].at).toEqual(date);
    });

    it('should handle null and undefined', () => {
      expect(convertTimestampsToDate(null)).toBe(null);
      expect(convertTimestampsToDate(undefined)).toBe(undefined);
    });

    it('should preserve non-timestamp values', () => {
      const data = {
        string: 'hello',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
      };

      const result = convertTimestampsToDate(data);

      expect(result).toEqual(data);
    });
  });

  describe('convertDatesForFirestore', () => {
    it('should preserve Date objects', () => {
      const date = new Date('2024-01-01');
      const data = { createdAt: date };

      const result = convertDatesForFirestore(data);

      expect(result.createdAt).toEqual(date);
    });

    it('should handle nested dates', () => {
      const date = new Date('2024-01-01');
      const data = {
        outer: {
          inner: {
            date: date,
          },
        },
      };

      const result = convertDatesForFirestore(data);

      expect(result.outer.inner.date).toEqual(date);
    });

    it('should handle null and undefined', () => {
      expect(convertDatesForFirestore(null)).toBe(null);
      expect(convertDatesForFirestore(undefined)).toBe(undefined);
    });
  });

  describe('toBrandedId', () => {
    it('should create UserId', () => {
      const id = toBrandedId('user_123', 'UserId');
      expect(id).toBe('user_123');
      // TypeScript ensures the type is UserId
    });

    it('should create SessionId', () => {
      const id = toBrandedId('session_456', 'SessionId');
      expect(id).toBe('session_456');
    });

    it('should create GoalId', () => {
      const id = toBrandedId('goal_789', 'GoalId');
      expect(id).toBe('goal_789');
    });

    it('should create MemoryId', () => {
      const id = toBrandedId('memory_abc', 'MemoryId');
      expect(id).toBe('memory_abc');
    });

    it('should create OrganizationId', () => {
      const id = toBrandedId('org_def', 'OrganizationId');
      expect(id).toBe('org_def');
    });
  });

  describe('createFirestoreConverter', () => {
    const TestSchema = z.object({
      id: z.string(),
      name: z.string(),
      age: z.number().optional(),
      createdAt: z.date().optional(),
    });

    type TestType = z.infer<typeof TestSchema>;

    it('should create a valid converter', () => {
      const converter = createFirestoreConverter<TestType>();

      expect(converter).toHaveProperty('toFirestore');
      expect(converter).toHaveProperty('fromFirestore');
    });

    it('should convert to Firestore format', () => {
      const converter = createFirestoreConverter<TestType>();
      const data: TestType = {
        id: 'test_1',
        name: 'Test',
        age: 25,
        createdAt: new Date('2024-01-01'),
      };

      const result = converter.toFirestore(data);

      expect(result.id).toBe('test_1');
      expect(result.name).toBe('Test');
      expect(result.age).toBe(25);
    });

    it('should remove undefined values', () => {
      const converter = createFirestoreConverter<TestType>();
      const data: TestType = {
        id: 'test_1',
        name: 'Test',
        age: undefined,
      };

      const result = converter.toFirestore(data);

      expect(result).not.toHaveProperty('age');
    });

    it('should convert from Firestore format', () => {
      const converter = createFirestoreConverter<TestType>(undefined, 'UserId');

      const snapshot = {
        id: 'user_123',
        data: () => ({
          name: 'Test',
          age: 30,
          createdAt: createMockTimestamp(new Date('2024-01-01')),
        }),
        exists: true,
      };

      const result = converter.fromFirestore(snapshot);

      expect(result.id).toBe('user_123');
      expect(result.name).toBe('Test');
      expect(result.age).toBe(30);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should validate on read when enabled', () => {
      const converter = createFirestoreConverter(TestSchema, undefined, {
        validateOnRead: true,
      });

      const snapshot = {
        id: 'test_1',
        data: () => ({
          id: 'test_1', // Include id in data for schema validation
          name: 'Test',
          age: 25,
        }),
        exists: true,
      };

      // Should not throw for valid data
      expect(() => converter.fromFirestore(snapshot)).not.toThrow();
    });

    it('should exclude specified fields', () => {
      const converter = createFirestoreConverter<TestType>(undefined, undefined, {
        excludeFields: ['age'],
      });

      const data: TestType = {
        id: 'test_1',
        name: 'Test',
        age: 25,
      };

      const result = converter.toFirestore(data);

      expect(result).not.toHaveProperty('age');
      expect(result.name).toBe('Test');
    });
  });

  describe('createUserProfileConverter', () => {
    it('should create a user profile converter', () => {
      const converter = createUserProfileConverter();

      expect(converter).toHaveProperty('toFirestore');
      expect(converter).toHaveProperty('fromFirestore');
    });
  });

  describe('createSessionConverter', () => {
    it('should create a session converter', () => {
      const converter = createSessionConverter();

      expect(converter).toHaveProperty('toFirestore');
      expect(converter).toHaveProperty('fromFirestore');
    });
  });

  describe('createPartialUpdate', () => {
    it('should create partial update object', () => {
      const update = createPartialUpdate({
        name: 'New Name',
        age: 30,
      });

      expect(update.name).toBe('New Name');
      expect(update.age).toBe(30);
    });

    it('should remove undefined values', () => {
      const update = createPartialUpdate({
        name: 'New Name',
        age: undefined,
      });

      expect(update.name).toBe('New Name');
      expect(update).not.toHaveProperty('age');
    });

    it('should convert dates', () => {
      const date = new Date('2024-01-01');
      const update = createPartialUpdate({
        updatedAt: date,
      });

      expect(update.updatedAt).toEqual(date);
    });
  });

  describe('createNestedUpdate', () => {
    it('should create nested field paths', () => {
      const update = createNestedUpdate('communication', {
        style: 'casual',
        pace: 'moderate',
      });

      expect(update['communication.style']).toBe('casual');
      expect(update['communication.pace']).toBe('moderate');
    });

    it('should handle deep paths', () => {
      const update = createNestedUpdate('profile.settings', {
        theme: 'dark',
        language: 'en',
      });

      expect(update['profile.settings.theme']).toBe('dark');
      expect(update['profile.settings.language']).toBe('en');
    });

    it('should exclude undefined values', () => {
      const update = createNestedUpdate('settings', {
        theme: 'dark',
        color: undefined,
      });

      expect(update['settings.theme']).toBe('dark');
      expect(update).not.toHaveProperty('settings.color');
    });
  });

  describe('validateForFirestore', () => {
    const TestSchema = z.object({
      name: z.string().min(1),
      age: z.number().positive(),
    });

    it('should return valid for correct data', () => {
      const result = validateForFirestore({ name: 'Test', age: 25 }, TestSchema);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.name).toBe('Test');
      }
    });

    it('should return errors for invalid data', () => {
      const result = validateForFirestore({ name: '', age: -5 }, TestSchema);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('safeParseFromFirestore', () => {
    const TestSchema = z.object({
      name: z.string(),
      createdAt: z.date(),
    });

    it('should parse valid data with timestamps', () => {
      const data = {
        name: 'Test',
        createdAt: createMockTimestamp(new Date('2024-01-01')),
      };

      const result = safeParseFromFirestore(data, TestSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Test');
        expect(result.data.createdAt).toBeInstanceOf(Date);
      }
    });

    it('should return error for invalid data', () => {
      const data = {
        name: 123, // Wrong type
        createdAt: createMockTimestamp(new Date()),
      };

      const result = safeParseFromFirestore(data, TestSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
