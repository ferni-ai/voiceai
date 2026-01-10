/**
 * Date Parser Tests
 *
 * Tests for the natural language date/time parser.
 *
 * Run with: pnpm vitest run src/tests/date-parser.test.ts
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

import { parseNaturalDateTime, containsDateTime } from '../utils/date-parser.js';

describe('Date Parser', () => {
  // Use a fixed reference date for consistent tests
  const referenceDate = new Date('2025-01-15T10:00:00.000Z');

  describe('parseNaturalDateTime', () => {
    describe('relative times', () => {
      it('should parse "in 2 hours"', () => {
        const result = parseNaturalDateTime('in 2 hours', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getTime()).toBe(referenceDate.getTime() + 2 * 60 * 60 * 1000);
      });

      it('should parse "in 30 minutes"', () => {
        const result = parseNaturalDateTime('in 30 minutes', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getTime()).toBe(referenceDate.getTime() + 30 * 60 * 1000);
      });

      it('should parse "in 3 days"', () => {
        const result = parseNaturalDateTime('in 3 days', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getDate()).toBe(referenceDate.getDate() + 3);
      });
    });

    describe('relative days', () => {
      it('should parse "today"', () => {
        const result = parseNaturalDateTime('today at 5pm', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getDate()).toBe(referenceDate.getDate());
        expect(result!.getHours()).toBe(17);
      });

      it('should parse "tomorrow"', () => {
        const result = parseNaturalDateTime('tomorrow', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getDate()).toBe(referenceDate.getDate() + 1);
      });

      it('should parse "tomorrow at 9am"', () => {
        const result = parseNaturalDateTime('tomorrow at 9am', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getDate()).toBe(referenceDate.getDate() + 1);
        expect(result!.getHours()).toBe(9);
      });
    });

    describe('weekdays', () => {
      it('should parse "Sunday"', () => {
        // Reference is Wednesday Jan 15, so Sunday is Jan 19
        const result = parseNaturalDateTime('Sunday', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getDay()).toBe(0); // Sunday
      });

      it('should parse "next Monday"', () => {
        const result = parseNaturalDateTime('next Monday', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getDay()).toBe(1); // Monday
        // Should be in the future
        expect(result!.getTime()).toBeGreaterThan(referenceDate.getTime());
      });

      it('should parse "this Friday"', () => {
        const result = parseNaturalDateTime('this Friday', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getDay()).toBe(5); // Friday
      });
    });

    describe('times of day', () => {
      it('should parse "morning"', () => {
        const result = parseNaturalDateTime('tomorrow morning', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getHours()).toBe(9);
      });

      it('should parse "afternoon"', () => {
        const result = parseNaturalDateTime('tomorrow afternoon', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getHours()).toBe(14);
      });

      it('should parse "evening"', () => {
        const result = parseNaturalDateTime('tomorrow evening', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getHours()).toBe(18);
      });

      it('should parse "noon"', () => {
        const result = parseNaturalDateTime('tomorrow noon', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getHours()).toBe(12);
      });
    });

    describe('exact times', () => {
      it('should parse "5pm"', () => {
        const result = parseNaturalDateTime('tomorrow at 5pm', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getHours()).toBe(17);
        expect(result!.getMinutes()).toBe(0);
      });

      it('should parse "5:30pm"', () => {
        const result = parseNaturalDateTime('tomorrow at 5:30pm', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getHours()).toBe(17);
        expect(result!.getMinutes()).toBe(30);
      });

      it('should parse "9am"', () => {
        const result = parseNaturalDateTime('tomorrow at 9am', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getHours()).toBe(9);
      });

      it('should assume PM for ambiguous single-digit hours', () => {
        const result = parseNaturalDateTime('tomorrow at 5', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getHours()).toBe(17); // Should be 5pm, not 5am
      });
    });

    describe('combined expressions', () => {
      it('should parse "Sunday at 5pm"', () => {
        const result = parseNaturalDateTime('Sunday at 5pm', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getDay()).toBe(0); // Sunday
        expect(result!.getHours()).toBe(17);
      });

      it('should parse "next Friday morning"', () => {
        const result = parseNaturalDateTime('next Friday morning', referenceDate);
        expect(result).not.toBeNull();
        expect(result!.getDay()).toBe(5); // Friday
        expect(result!.getHours()).toBe(9);
      });
    });

    describe('edge cases', () => {
      it('should return null for empty string', () => {
        const result = parseNaturalDateTime('', referenceDate);
        // Should still return something (defaults to 9am)
        expect(result).not.toBeNull();
      });

      it('should handle gibberish gracefully', () => {
        const result = parseNaturalDateTime('asdfasdfasdf', referenceDate);
        // Should still return a date (defaults)
        expect(result).not.toBeNull();
      });
    });
  });

  describe('containsDateTime', () => {
    it('should detect "tomorrow"', () => {
      expect(containsDateTime('tomorrow')).toBe(true);
      expect(containsDateTime('see you tomorrow')).toBe(true);
    });

    it('should detect "today"', () => {
      expect(containsDateTime('today')).toBe(true);
    });

    it('should detect weekdays', () => {
      expect(containsDateTime('on Monday')).toBe(true);
      expect(containsDateTime('next Sunday')).toBe(true);
    });

    it('should detect times', () => {
      expect(containsDateTime('at 5pm')).toBe(true);
      expect(containsDateTime('at 3:30')).toBe(true);
    });

    it('should detect relative times', () => {
      expect(containsDateTime('in 2 hours')).toBe(true);
      expect(containsDateTime('in 30 minutes')).toBe(true);
    });

    it('should detect time of day keywords', () => {
      expect(containsDateTime('this morning')).toBe(true);
      expect(containsDateTime('tomorrow evening')).toBe(true);
    });

    it('should return false for no date/time', () => {
      expect(containsDateTime('hello world')).toBe(false);
      expect(containsDateTime('the quick brown fox')).toBe(false);
    });
  });
});
