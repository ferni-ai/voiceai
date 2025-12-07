/**
 * Type Guards Tests
 *
 * Tests for the type guard module that validates:
 * - UserProfile structures
 * - ConversationSummary structures
 * - KeyMoment structures
 * - FinancialGoal structures
 * - Safe parsing utilities
 *
 * @module tests/type-guards
 */

import { describe, it, expect, vi } from 'vitest';

import {
  isValidUserProfile,
  parseUserProfile,
  isValidConversationSummary,
  parseConversationSummary,
  isValidKeyMoment,
  parseKeyMoment,
  isValidFinancialGoal,
  parseFinancialGoal,
  safeParse,
  safeParseArray,
} from '../memory/type-guards.js';

// ============================================================================
// TESTS
// ============================================================================

describe('Type Guards', () => {
  // --------------------------------------------------------------------------
  // UserProfile Validation
  // --------------------------------------------------------------------------

  describe('isValidUserProfile()', () => {
    it('should return true for valid profile with id', () => {
      const profile = { id: 'user-123' };
      expect(isValidUserProfile(profile)).toBe(true);
    });

    it('should return true for profile with optional fields', () => {
      const profile = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
      };
      expect(isValidUserProfile(profile)).toBe(true);
    });

    it('should return true for profile with date fields', () => {
      const profile = {
        id: 'user-123',
        firstContact: new Date(),
        lastContact: '2024-01-01T00:00:00Z',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isValidUserProfile(profile)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidUserProfile(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidUserProfile('string')).toBe(false);
      expect(isValidUserProfile(123)).toBe(false);
      expect(isValidUserProfile(undefined)).toBe(false);
    });

    it('should return false for missing id', () => {
      expect(isValidUserProfile({ name: 'John' })).toBe(false);
    });

    it('should return false for non-string id', () => {
      expect(isValidUserProfile({ id: 123 })).toBe(false);
    });

    it('should return false for invalid optional field types', () => {
      expect(isValidUserProfile({ id: 'test', name: 123 })).toBe(false);
      expect(isValidUserProfile({ id: 'test', email: [] })).toBe(false);
    });

    it('should handle Firestore timestamp format', () => {
      const profile = {
        id: 'user-123',
        createdAt: { _seconds: 1704067200 },
      };
      expect(isValidUserProfile(profile)).toBe(true);
    });
  });

  describe('parseUserProfile()', () => {
    it('should return profile for valid data', () => {
      const data = { id: 'user-123', name: 'Test' };
      const result = parseUserProfile(data);
      expect(result).toEqual(data);
    });

    it('should return null for invalid data', () => {
      expect(parseUserProfile({ name: 'No ID' })).toBeNull();
      expect(parseUserProfile(null)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // ConversationSummary Validation
  // --------------------------------------------------------------------------

  describe('isValidConversationSummary()', () => {
    it('should return true for valid summary with id', () => {
      const summary = { id: 'summary-123' };
      expect(isValidConversationSummary(summary)).toBe(true);
    });

    it('should return true for summary with string arrays', () => {
      const summary = {
        id: 'summary-123',
        mainTopics: ['finance', 'retirement'],
        keyPoints: ['point 1', 'point 2'],
      };
      expect(isValidConversationSummary(summary)).toBe(true);
    });

    it('should return true for summary with emotionalArc', () => {
      const summary = {
        id: 'summary-123',
        emotionalArc: 'positive to neutral',
      };
      expect(isValidConversationSummary(summary)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidConversationSummary(null)).toBe(false);
    });

    it('should return false for missing id', () => {
      expect(isValidConversationSummary({ mainTopics: [] })).toBe(false);
    });

    it('should return false for non-string arrays', () => {
      expect(isValidConversationSummary({ id: 'test', mainTopics: [1, 2, 3] })).toBe(false);
      expect(isValidConversationSummary({ id: 'test', keyPoints: 'not an array' })).toBe(false);
    });

    it('should return false for non-string emotionalArc', () => {
      expect(isValidConversationSummary({ id: 'test', emotionalArc: 123 })).toBe(false);
    });
  });

  describe('parseConversationSummary()', () => {
    it('should return summary for valid data', () => {
      const data = { id: 'summary-123', mainTopics: ['test'] };
      const result = parseConversationSummary(data);
      expect(result).toEqual(data);
    });

    it('should return null for invalid data', () => {
      expect(parseConversationSummary({ mainTopics: [] })).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // KeyMoment Validation
  // --------------------------------------------------------------------------

  describe('isValidKeyMoment()', () => {
    it('should return true for valid moment', () => {
      const moment = { type: 'breakthrough', content: 'User had insight' };
      expect(isValidKeyMoment(moment)).toBe(true);
    });

    it('should return true for moment with optional fields', () => {
      const moment = {
        id: 'moment-123',
        type: 'emotional',
        content: 'Expressed gratitude',
        timestamp: new Date(),
        importance: 0.8,
      };
      expect(isValidKeyMoment(moment)).toBe(true);
    });

    it('should return true for string timestamp', () => {
      const moment = {
        type: 'decision',
        content: 'Made choice',
        timestamp: '2024-01-01T00:00:00Z',
      };
      expect(isValidKeyMoment(moment)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidKeyMoment(null)).toBe(false);
    });

    it('should return false for missing type', () => {
      expect(isValidKeyMoment({ content: 'text' })).toBe(false);
    });

    it('should return false for missing content', () => {
      expect(isValidKeyMoment({ type: 'test' })).toBe(false);
    });

    it('should return false for non-string id', () => {
      expect(isValidKeyMoment({ type: 'test', content: 'text', id: 123 })).toBe(false);
    });

    it('should return false for non-number importance', () => {
      expect(isValidKeyMoment({ type: 'test', content: 'text', importance: 'high' })).toBe(false);
    });
  });

  describe('parseKeyMoment()', () => {
    it('should return moment for valid data', () => {
      const data = { type: 'insight', content: 'Test moment' };
      const result = parseKeyMoment(data);
      expect(result).toEqual(data);
    });

    it('should return null for invalid data', () => {
      expect(parseKeyMoment({ type: 'test' })).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // FinancialGoal Validation
  // --------------------------------------------------------------------------

  describe('isValidFinancialGoal()', () => {
    it('should return true for valid goal', () => {
      const goal = {
        id: 'goal-123',
        name: 'Emergency Fund',
        type: 'savings',
      };
      expect(isValidFinancialGoal(goal)).toBe(true);
    });

    it('should return true for goal with amounts', () => {
      const goal = {
        id: 'goal-123',
        name: 'Retirement',
        type: 'retirement',
        targetAmount: 1000000,
        currentAmount: 50000,
      };
      expect(isValidFinancialGoal(goal)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidFinancialGoal(null)).toBe(false);
    });

    it('should return false for missing required fields', () => {
      expect(isValidFinancialGoal({ id: 'test' })).toBe(false);
      expect(isValidFinancialGoal({ id: 'test', name: 'Test' })).toBe(false);
      expect(isValidFinancialGoal({ name: 'Test', type: 'savings' })).toBe(false);
    });

    it('should return false for non-number amounts', () => {
      expect(
        isValidFinancialGoal({
          id: 'test',
          name: 'Test',
          type: 'savings',
          targetAmount: '1000',
        })
      ).toBe(false);
    });

    it('should return false for NaN amounts', () => {
      expect(
        isValidFinancialGoal({
          id: 'test',
          name: 'Test',
          type: 'savings',
          currentAmount: NaN,
        })
      ).toBe(false);
    });
  });

  describe('parseFinancialGoal()', () => {
    it('should return goal for valid data', () => {
      const data = { id: 'goal-1', name: 'Save', type: 'savings' };
      const result = parseFinancialGoal(data);
      expect(result).toEqual(data);
    });

    it('should return null for invalid data', () => {
      expect(parseFinancialGoal({ id: 'test' })).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // safeParse Utility
  // --------------------------------------------------------------------------

  describe('safeParse()', () => {
    it('should return parsed data when valid', () => {
      const data = { id: 'test-123' };
      const result = safeParse(data, isValidUserProfile);
      expect(result).toEqual(data);
    });

    it('should return null when invalid', () => {
      const result = safeParse({ name: 'No ID' }, isValidUserProfile);
      expect(result).toBeNull();
    });

    it('should apply hydrate function when provided', () => {
      const data = { id: 'test-123' };
      const hydrate = (d: typeof data) => ({ ...d, hydrated: true });
      const result = safeParse(data, isValidUserProfile, hydrate as any);
      expect(result).toEqual({ id: 'test-123', hydrated: true });
    });

    it('should not apply hydrate when validation fails', () => {
      const hydrate = vi.fn();
      const result = safeParse({ name: 'No ID' }, isValidUserProfile, hydrate as any);
      expect(result).toBeNull();
      expect(hydrate).not.toHaveBeenCalled();
    });
  });

  describe('safeParseArray()', () => {
    it('should parse all valid items', () => {
      const items = [{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }];
      const result = safeParseArray(items, isValidUserProfile);
      expect(result).toHaveLength(3);
    });

    it('should filter out invalid items', () => {
      const items = [
        { id: 'user-1' },
        { name: 'No ID' }, // Invalid
        { id: 'user-3' },
      ];
      const result = safeParseArray(items, isValidUserProfile);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'user-1' });
      expect(result[1]).toEqual({ id: 'user-3' });
    });

    it('should return empty array when all items invalid', () => {
      const items = [{ name: 'No ID' }, { email: 'test@example.com' }];
      const result = safeParseArray(items, isValidUserProfile);
      expect(result).toEqual([]);
    });

    it('should apply hydrate function to valid items', () => {
      const items = [{ id: 'user-1' }, { id: 'user-2' }];
      const hydrate = (d: any) => ({ ...d, hydrated: true });
      const result = safeParseArray(items, isValidUserProfile, hydrate);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'user-1', hydrated: true });
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      expect(isValidUserProfile({})).toBe(false);
      expect(isValidConversationSummary({})).toBe(false);
      expect(isValidKeyMoment({})).toBe(false);
      expect(isValidFinancialGoal({})).toBe(false);
    });

    it('should handle arrays as input', () => {
      expect(isValidUserProfile([])).toBe(false);
      expect(isValidConversationSummary([])).toBe(false);
    });

    it('should handle undefined values in optional fields', () => {
      const profile = {
        id: 'test',
        name: undefined,
        email: undefined,
      };
      expect(isValidUserProfile(profile)).toBe(true);
    });

    it('should handle objects with extra fields', () => {
      const profile = {
        id: 'test',
        extraField: 'value',
        anotherExtra: 123,
      };
      expect(isValidUserProfile(profile)).toBe(true);
    });
  });
});

