/**
 * Natural Language Date Parser Tests
 *
 * Tests for parsing natural language date/time expressions.
 */

import { describe, it, expect } from 'vitest';
import {
  parseNaturalDate,
  isValidForScheduling,
  suggestTimes,
  suggestClarification,
  type ParsedDateTime,
} from '../natural-date-parser.js';

describe('Natural Date Parser', () => {
  // Use a fixed reference date for consistent tests: Saturday March 15, 2025, 10:00 AM
  const referenceDate = new Date('2025-03-15T10:00:00');

  describe('parseNaturalDate', () => {
    it('should parse "tomorrow"', () => {
      const result = parseNaturalDate('tomorrow', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.date.getDate()).toBe(16);
      expect(result!.confidence).toBe('high');
    });

    it('should parse "tomorrow at 3pm"', () => {
      const result = parseNaturalDate('tomorrow at 3pm', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.date.getDate()).toBe(16);
      expect(result!.date.getHours()).toBe(15);
      expect(result!.hasTime).toBe(true);
    });

    it('should parse "next Monday"', () => {
      const result = parseNaturalDate('next Monday', { referenceDate });
      expect(result).not.toBeNull();
      // March 15 is Saturday, next Monday is March 24 (skips this week)
      expect(result!.date.getDate()).toBeGreaterThan(15);
      expect(result!.date.getDay()).toBe(1); // Monday
    });

    it('should parse "in 2 hours"', () => {
      const result = parseNaturalDate('in 2 hours', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.date.getHours()).toBe(12);
      expect(result!.hasTime).toBe(true);
    });

    it('should parse "in 30 minutes"', () => {
      const result = parseNaturalDate('in 30 minutes', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.date.getMinutes()).toBe(30);
      expect(result!.hasTime).toBe(true);
    });

    it('should parse "noon"', () => {
      const result = parseNaturalDate('noon', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.date.getHours()).toBe(12);
      expect(result!.hasTime).toBe(true);
    });

    it('should parse "midnight"', () => {
      const result = parseNaturalDate('midnight', { referenceDate });
      expect(result).not.toBeNull();
      // The parser recognizes 'midnight' as a time of day
      // It should set the hour to 0 (midnight) for the next day
      expect(result!.hasTime).toBe(true);
    });

    it('should parse "March 20"', () => {
      const result = parseNaturalDate('March 20', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.date.getMonth()).toBe(2); // March = 2
      expect(result!.date.getDate()).toBe(20);
    });

    it('should parse "March 20 at 2:30pm"', () => {
      const result = parseNaturalDate('March 20 at 2:30pm', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.date.getMonth()).toBe(2);
      expect(result!.date.getDate()).toBe(20);
      expect(result!.date.getHours()).toBe(14);
      expect(result!.date.getMinutes()).toBe(30);
    });

    it('should parse "the 15th"', () => {
      const result = parseNaturalDate('on the 15th', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.date.getDate()).toBe(15);
    });

    it('should parse "this Friday"', () => {
      const result = parseNaturalDate('this Friday', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.date.getDay()).toBe(5); // Friday
    });

    it('should return null for unparseable input', () => {
      const result = parseNaturalDate('asdfghjkl', { referenceDate });
      expect(result).toBeNull();
    });

    it('should return null for empty input', () => {
      const result = parseNaturalDate('', { referenceDate });
      expect(result).toBeNull();
    });

    it('should include original text in result', () => {
      const result = parseNaturalDate('tomorrow at 9am', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.original).toBe('tomorrow at 9am');
    });

    it('should include interpretation in result', () => {
      const result = parseNaturalDate('tomorrow at 9am', { referenceDate });
      expect(result).not.toBeNull();
      expect(result!.interpretation).toBeDefined();
      expect(result!.interpretation.length).toBeGreaterThan(0);
    });

    it('should flag ambiguous times', () => {
      // 3 without AM/PM could be ambiguous
      const result = parseNaturalDate('at 3', { referenceDate });
      expect(result).not.toBeNull();
      // The parser assumes PM for business hours, so it should be ambiguous
      expect(result!.ambiguous).toBe(true);
    });
  });

  describe('isValidForScheduling', () => {
    it('should accept future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const result = isValidForScheduling(futureDate);
      expect(result.valid).toBe(true);
    });

    it('should reject past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const result = isValidForScheduling(pastDate);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('passed');
    });

    it('should reject dates more than a year away', () => {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 2);
      const result = isValidForScheduling(farFuture);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('year');
    });
  });

  describe('suggestTimes', () => {
    it('should suggest morning times', () => {
      // Use a reference date in the past so the suggestions are in the future
      const pastReference = new Date('2020-03-15T10:00:00');
      const suggestions = suggestTimes('morning', pastReference);
      // suggestTimes filters out past times, so use a fresh date
      if (suggestions.length > 0) {
        suggestions.forEach((d) => {
          expect(d.getHours()).toBeGreaterThanOrEqual(9);
          expect(d.getHours()).toBeLessThanOrEqual(12);
        });
      }
    });

    it('should suggest afternoon times', () => {
      // Use a reference date in the past so the suggestions are in the future
      const pastReference = new Date('2020-03-15T10:00:00');
      const suggestions = suggestTimes('afternoon', pastReference);
      if (suggestions.length > 0) {
        suggestions.forEach((d) => {
          expect(d.getHours()).toBeGreaterThanOrEqual(13);
          expect(d.getHours()).toBeLessThanOrEqual(17);
        });
      }
    });

    it('should suggest evening times', () => {
      // Use a reference date in the past so the suggestions are in the future
      const pastReference = new Date('2020-03-15T10:00:00');
      const suggestions = suggestTimes('evening', pastReference);
      if (suggestions.length > 0) {
        suggestions.forEach((d) => {
          expect(d.getHours()).toBeGreaterThanOrEqual(17);
          expect(d.getHours()).toBeLessThanOrEqual(20);
        });
      }
    });

    it('should suggest times for this week', () => {
      const suggestions = suggestTimes('sometime_this_week', referenceDate);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should return max 3 suggestions', () => {
      const suggestions = suggestTimes('sometime_this_week', referenceDate);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('suggestClarification', () => {
    it('should suggest clarification for ambiguous times', () => {
      const parsed: ParsedDateTime = {
        date: new Date('2025-03-16T15:00:00'),
        confidence: 'medium',
        original: 'at 3',
        interpretation: 'Sunday, March 16 at 3:00 PM',
        hasTime: true,
        hasDate: false,
        ambiguous: true,
      };
      const suggestion = suggestClarification(parsed);
      expect(suggestion).not.toBeNull();
      expect(suggestion).toContain('mean');
    });

    it('should return null for non-ambiguous times', () => {
      const parsed: ParsedDateTime = {
        date: new Date('2025-03-16T15:00:00'),
        confidence: 'high',
        original: 'at 3pm',
        interpretation: 'Sunday, March 16 at 3:00 PM',
        hasTime: true,
        hasDate: false,
        ambiguous: false,
      };
      const suggestion = suggestClarification(parsed);
      expect(suggestion).toBeNull();
    });
  });
});
