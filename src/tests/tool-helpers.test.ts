/**
 * Tool Helper Utilities Tests
 *
 * Tests for shared utility functions used across all tools:
 * - User context extraction
 * - ID generation
 * - Formatting utilities
 * - Progress calculations
 * - Response formatting
 * - String utilities
 * - Validation helpers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getUserId,
  getUserName,
  getUserData,
  generateId,
  generateUUID,
  formatCurrency,
  formatPercent,
  ordinal,
  formatDate,
  formatRelativeTime,
  calculateProgress,
  progressBar,
  createResponse,
  formatWithEmoji,
  bulletList,
  numberedList,
  truncate,
  titleCase,
  camelToTitle,
  isNonEmptyString,
  isPositiveNumber,
} from '../tools/utils/tool-helpers.js';

// ============================================================================
// USER CONTEXT EXTRACTION
// ============================================================================

describe('User Context Extraction', () => {
  describe('getUserId', () => {
    it('should extract userId from context', () => {
      const context = { ctx: { userData: { userId: 'user-123' } } };
      expect(getUserId(context)).toBe('user-123');
    });

    it('should return default fallback when userId is missing', () => {
      expect(getUserId({})).toBe('default');
      expect(getUserId({ ctx: {} })).toBe('default');
      expect(getUserId({ ctx: { userData: {} } })).toBe('default');
    });

    it('should use custom fallback when provided', () => {
      expect(getUserId({}, 'guest')).toBe('guest');
    });

    it('should handle null/undefined context gracefully', () => {
      expect(getUserId(null as unknown as { ctx?: unknown })).toBe('default');
      expect(getUserId(undefined as unknown as { ctx?: unknown })).toBe('default');
    });
  });

  describe('getUserName', () => {
    it('should extract name from context', () => {
      const context = { ctx: { userData: { name: 'John Doe' } } };
      expect(getUserName(context)).toBe('John Doe');
    });

    it('should return undefined when name is missing', () => {
      expect(getUserName({})).toBeUndefined();
      expect(getUserName({ ctx: { userData: {} } })).toBeUndefined();
    });
  });

  describe('getUserData', () => {
    it('should return full userData object', () => {
      const userData = { userId: 'u1', name: 'Test', custom: 'value' };
      const context = { ctx: { userData } };

      expect(getUserData(context)).toEqual(userData);
    });

    it('should return empty object when userData is missing', () => {
      expect(getUserData({})).toEqual({});
      expect(getUserData({ ctx: {} })).toEqual({});
    });
  });
});

// ============================================================================
// ID GENERATION
// ============================================================================

describe('ID Generation', () => {
  describe('generateId', () => {
    it('should generate ID with correct prefix', () => {
      const id = generateId('task');
      expect(id.startsWith('task_')).toBe(true);
    });

    it('should include timestamp in ID', () => {
      const before = Date.now();
      const id = generateId('habit');
      const after = Date.now();

      const parts = id.split('_');
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('test'));
      }
      expect(ids.size).toBe(100);
    });

    it('should have correct format: prefix_timestamp_random', () => {
      const id = generateId('goal');
      const parts = id.split('_');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('goal');
      expect(parts[1]).toMatch(/^\d+$/);
      expect(parts[2]).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID format', () => {
      const uuid = generateUUID();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });

    it('should have version 4 marker', () => {
      const uuid = generateUUID();
      expect(uuid[14]).toBe('4');
    });
  });
});

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

describe('Formatting Utilities', () => {
  describe('formatCurrency', () => {
    it('should format positive amounts', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
      expect(formatCurrency(1000)).toBe('$1,000');
    });

    it('should format zero', () => {
      expect(formatCurrency(0)).toBe('$0');
    });

    it('should format negative amounts', () => {
      expect(formatCurrency(-500)).toBe('-$500');
    });

    it('should format large numbers with commas', () => {
      expect(formatCurrency(1234567.89)).toBe('$1,234,567.89');
    });

    it('should respect currency parameter', () => {
      const result = formatCurrency(100, 'EUR');
      expect(result).toContain('100');
    });
  });

  describe('formatPercent', () => {
    it('should format percentages without decimals by default', () => {
      expect(formatPercent(75)).toBe('75%');
      expect(formatPercent(100)).toBe('100%');
    });

    it('should format percentages with decimals', () => {
      expect(formatPercent(75.5, 1)).toBe('75.5%');
      expect(formatPercent(33.333, 2)).toBe('33.33%');
    });

    it('should handle zero', () => {
      expect(formatPercent(0)).toBe('0%');
    });
  });

  describe('ordinal', () => {
    it('should format 1st, 2nd, 3rd correctly', () => {
      expect(ordinal(1)).toBe('1st');
      expect(ordinal(2)).toBe('2nd');
      expect(ordinal(3)).toBe('3rd');
    });

    it('should handle 11th, 12th, 13th special cases', () => {
      expect(ordinal(11)).toBe('11th');
      expect(ordinal(12)).toBe('12th');
      expect(ordinal(13)).toBe('13th');
    });

    it('should handle other numbers with th suffix', () => {
      expect(ordinal(4)).toBe('4th');
      expect(ordinal(10)).toBe('10th');
      expect(ordinal(20)).toBe('20th');
      expect(ordinal(100)).toBe('100th');
    });

    it('should handle 21st, 22nd, 23rd pattern', () => {
      expect(ordinal(21)).toBe('21st');
      expect(ordinal(22)).toBe('22nd');
      expect(ordinal(23)).toBe('23rd');
      expect(ordinal(24)).toBe('24th');
    });
  });

  describe('formatDate', () => {
    it('should format date in medium style by default', () => {
      // Use explicit time to avoid timezone issues
      const date = new Date(2024, 2, 15); // Month is 0-indexed
      const result = formatDate(date);
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('should format date in short style', () => {
      const date = new Date('2024-03-15');
      const result = formatDate(date, 'short');
      expect(result).toMatch(/\d+\/\d+/);
    });

    it('should format date in long style', () => {
      const date = new Date('2024-03-15');
      const result = formatDate(date, 'long');
      expect(result).toContain('2024');
      expect(result.length).toBeGreaterThan(10);
    });

    it('should accept string dates', () => {
      const result = formatDate('2024-03-15', 'medium');
      expect(result).toContain('2024');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should format "just now" for current time', () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe('just now');
    });

    it('should format minutes ago', () => {
      const past = new Date(Date.now() - 30 * 60 * 1000);
      expect(formatRelativeTime(past)).toBe('30 minutes ago');
    });

    it('should format hours ago', () => {
      const past = new Date(Date.now() - 5 * 60 * 60 * 1000);
      expect(formatRelativeTime(past)).toBe('5 hours ago');
    });

    it('should format yesterday', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(yesterday)).toBe('yesterday');
    });

    it('should format days ago', () => {
      const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(past)).toBe('3 days ago');
    });

    it('should format future times', () => {
      const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(future)).toBe('in 2 days');
    });

    it('should format tomorrow', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(tomorrow)).toBe('tomorrow');
    });
  });
});

// ============================================================================
// PROGRESS UTILITIES
// ============================================================================

describe('Progress Utilities', () => {
  describe('calculateProgress', () => {
    it('should calculate percentage correctly', () => {
      expect(calculateProgress(50, 100)).toBe(50);
      expect(calculateProgress(75, 100)).toBe(75);
      expect(calculateProgress(25, 50)).toBe(50);
    });

    it('should cap at 100%', () => {
      expect(calculateProgress(150, 100)).toBe(100);
    });

    it('should handle zero target', () => {
      expect(calculateProgress(50, 0)).toBe(0);
    });

    it('should round to nearest integer', () => {
      expect(calculateProgress(33, 100)).toBe(33);
      expect(calculateProgress(1, 3)).toBe(33);
    });
  });

  describe('progressBar', () => {
    it('should create progress bar with correct filled/empty ratio', () => {
      expect(progressBar(50)).toBe('█████░░░░░');
      expect(progressBar(100)).toBe('██████████');
      expect(progressBar(0)).toBe('░░░░░░░░░░');
    });

    it('should handle custom width', () => {
      expect(progressBar(50, 20).length).toBe(20);
      // 50% of 5 = 2.5, Math.round = 3 filled
      expect(progressBar(50, 5)).toBe('███░░');
    });

    it('should handle partial percentages', () => {
      expect(progressBar(75)).toBe('████████░░');
      // 25% of 10 = 2.5, Math.round = 3 filled
      expect(progressBar(25)).toBe('███░░░░░░░');
    });
  });
});

// ============================================================================
// RESPONSE FORMATTING
// ============================================================================

describe('Response Formatting', () => {
  describe('createResponse', () => {
    it('should create response with required fields', () => {
      const response = createResponse({ speech: 'Hello world' });

      expect(response.speech).toBe('Hello world');
      expect(response.emotion).toBe('neutral');
    });

    it('should create response with all optional fields', () => {
      const response = createResponse({
        speech: 'Great job!',
        display: '## Great Job!\nYou completed 5 tasks.',
        emotion: 'celebratory',
        suggestFollow: 'view_achievements',
        data: { tasksCompleted: 5 },
      });

      expect(response.speech).toBe('Great job!');
      expect(response.display).toContain('Great Job');
      expect(response.emotion).toBe('celebratory');
      expect(response.suggestFollow).toBe('view_achievements');
      expect(response.data).toEqual({ tasksCompleted: 5 });
    });
  });

  describe('formatWithEmoji', () => {
    it('should prefix message with emoji', () => {
      expect(formatWithEmoji('Task completed', '✅')).toBe('✅ Task completed');
    });

    it('should return message without emoji if not provided', () => {
      expect(formatWithEmoji('Task completed')).toBe('Task completed');
      expect(formatWithEmoji('Task completed', undefined)).toBe('Task completed');
    });
  });

  describe('bulletList', () => {
    it('should create bulleted list with default bullet', () => {
      const result = bulletList(['First', 'Second', 'Third']);
      expect(result).toBe('• First\n• Second\n• Third');
    });

    it('should create bulleted list with custom bullet', () => {
      const result = bulletList(['A', 'B', 'C'], '-');
      expect(result).toBe('- A\n- B\n- C');
    });

    it('should handle empty array', () => {
      expect(bulletList([])).toBe('');
    });
  });

  describe('numberedList', () => {
    it('should create numbered list', () => {
      const result = numberedList(['First', 'Second', 'Third']);
      expect(result).toBe('1. First\n2. Second\n3. Third');
    });

    it('should handle empty array', () => {
      expect(numberedList([])).toBe('');
    });
  });
});

// ============================================================================
// STRING UTILITIES
// ============================================================================

describe('String Utilities', () => {
  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('Hello World', 8)).toBe('Hello...');
    });

    it('should not truncate short strings', () => {
      expect(truncate('Hello', 10)).toBe('Hello');
    });

    it('should handle exact length', () => {
      expect(truncate('Hello', 5)).toBe('Hello');
    });

    it('should handle very short max length', () => {
      expect(truncate('Hello World', 5)).toBe('He...');
    });
  });

  describe('titleCase', () => {
    it('should capitalize first letter of each word', () => {
      expect(titleCase('hello world')).toBe('Hello World');
      expect(titleCase('this is a test')).toBe('This Is A Test');
    });

    it('should handle single word', () => {
      expect(titleCase('hello')).toBe('Hello');
    });

    it('should handle already capitalized text', () => {
      expect(titleCase('Hello World')).toBe('Hello World');
    });
  });

  describe('camelToTitle', () => {
    it('should convert camelCase to Title Case', () => {
      expect(camelToTitle('camelCase')).toBe('camel Case');
      expect(camelToTitle('getUserName')).toBe('get User Name');
    });

    it('should handle single word', () => {
      expect(camelToTitle('hello')).toBe('hello');
    });

    it('should handle consecutive capitals', () => {
      expect(camelToTitle('getHTMLContent')).toBe('get H T M L Content');
    });
  });
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

describe('Validation Helpers', () => {
  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('a')).toBe(true);
    });

    it('should return false for empty or whitespace strings', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString('\t\n')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
    });
  });

  describe('isPositiveNumber', () => {
    it('should return true for positive numbers', () => {
      expect(isPositiveNumber(1)).toBe(true);
      expect(isPositiveNumber(100)).toBe(true);
      expect(isPositiveNumber(0.5)).toBe(true);
    });

    it('should return false for zero and negative numbers', () => {
      expect(isPositiveNumber(0)).toBe(false);
      expect(isPositiveNumber(-1)).toBe(false);
      expect(isPositiveNumber(-0.5)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isPositiveNumber('1')).toBe(false);
      expect(isPositiveNumber(null)).toBe(false);
      expect(isPositiveNumber(undefined)).toBe(false);
      expect(isPositiveNumber(NaN)).toBe(false);
    });
  });
});
