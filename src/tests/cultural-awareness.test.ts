/**
 * Cultural Awareness Service Tests
 *
 * Tests for cultural context including:
 * - Season detection
 * - Holiday context
 * - Seasonal adjustments
 * - Financially relevant dates
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getCulturalContext,
  getHolidayGreeting,
  getUpcomingHolidayMention,
  getSeasonalAdjustment,
  getCulturalMoment,
  isFinanciallyRelevantDate,
  CulturalAwarenessService,
  type CulturalContext,
  type Season,
} from '../services/cultural-awareness.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock persona behavior manager
vi.mock('../services/persona-behavior-manager.js', () => ({
  loadPersonaBehaviors: vi.fn().mockResolvedValue(null),
}));

describe('Cultural Awareness Service', () => {
  describe('getCulturalContext', () => {
    it('should return cultural context object', () => {
      const context = getCulturalContext();

      expect(context).toBeDefined();
      expect(typeof context.season).toBe('string');
      expect(typeof context.monthContext).toBe('string');
    });

    it('should have valid season', () => {
      const context = getCulturalContext();
      const validSeasons: Season[] = ['spring', 'summer', 'fall', 'winter'];

      expect(validSeasons).toContain(context.season);
    });

    it('should have month context', () => {
      const context = getCulturalContext();

      expect(context.monthContext.length).toBeGreaterThan(0);
    });

    it('should detect current holiday when applicable', () => {
      const context = getCulturalContext();

      // currentHoliday may or may not be defined depending on date
      if (context.currentHoliday) {
        expect(context.currentHoliday.name).toBeDefined();
        expect(context.currentHoliday.date).toBeDefined();
        expect(['major', 'minor', 'observance']).toContain(context.currentHoliday.type);
      }
    });

    it('should detect upcoming holiday', () => {
      const context = getCulturalContext();

      // upcomingHoliday may or may not be defined
      if (context.upcomingHoliday) {
        expect(context.upcomingHoliday.name).toBeDefined();
        expect(context.upcomingHoliday.date).toBeInstanceOf(Date);
      }
    });
  });

  describe('getHolidayGreeting', () => {
    it('should return string or null', () => {
      const greeting = getHolidayGreeting();

      expect(greeting === null || typeof greeting === 'string').toBe(true);
    });

    it('should not throw', () => {
      expect(() => getHolidayGreeting()).not.toThrow();
    });
  });

  describe('getUpcomingHolidayMention', () => {
    it('should return string or null', () => {
      const mention = getUpcomingHolidayMention();

      expect(mention === null || typeof mention === 'string').toBe(true);
    });

    it('should include days until if not null', () => {
      const mention = getUpcomingHolidayMention();

      if (mention !== null) {
        expect(typeof mention).toBe('string');
        expect(mention.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getSeasonalAdjustment', () => {
    it('should return adjustment object', () => {
      const adjustment = getSeasonalAdjustment();

      expect(adjustment).toBeDefined();
      expect(typeof adjustment.energyModifier).toBe('number');
      expect(Array.isArray(adjustment.topicSuggestions)).toBe(true);
    });

    it('should have valid energy modifier range', () => {
      const adjustment = getSeasonalAdjustment();

      expect(adjustment.energyModifier).toBeGreaterThan(0.5);
      expect(adjustment.energyModifier).toBeLessThan(2);
    });

    it('should have topic suggestions', () => {
      const adjustment = getSeasonalAdjustment();

      expect(adjustment.topicSuggestions.length).toBeGreaterThan(0);
      adjustment.topicSuggestions.forEach((topic) => {
        expect(typeof topic).toBe('string');
      });
    });
  });

  describe('getCulturalMoment', () => {
    it('should return null when no behaviors loaded', async () => {
      const result = await getCulturalMoment('ferni');

      expect(result).toBeNull();
    });

    it('should not throw for unknown persona', async () => {
      await expect(getCulturalMoment('unknown-persona')).resolves.not.toThrow();
    });
  });

  describe('isFinanciallyRelevantDate', () => {
    it('should return relevance object', () => {
      const result = isFinanciallyRelevantDate();

      expect(result).toBeDefined();
      expect(typeof result.relevant).toBe('boolean');
    });

    it('should have reason when relevant', () => {
      const result = isFinanciallyRelevantDate();

      if (result.relevant) {
        expect(result.reason).toBeDefined();
        expect(typeof result.reason).toBe('string');
      }
    });

    it('should detect weekends', () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const month = now.getMonth();
      const day = now.getDate();

      const result = isFinanciallyRelevantDate();

      // If it's a weekend, should be marked as relevant
      // Note: other conditions (tax season, end of quarter) take priority in the implementation
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        expect(result.relevant).toBe(true);
        // Weekend reason only applies if no other condition is true
        const isTaxSeason = (month === 2 && day >= 15) || (month === 3 && day <= 15);
        const isEndOfQuarter =
          (month === 2 || month === 5 || month === 8 || month === 11) && day >= 25;
        if (!isTaxSeason && !isEndOfQuarter) {
          expect(result.reason).toBe('market closed for weekend');
        }
      }
    });
  });

  describe('CulturalAwarenessService object', () => {
    it('should expose getContext method', () => {
      expect(typeof CulturalAwarenessService.getContext).toBe('function');
    });

    it('should expose getHolidayGreeting method', () => {
      expect(typeof CulturalAwarenessService.getHolidayGreeting).toBe('function');
    });

    it('should expose getUpcomingHolidayMention method', () => {
      expect(typeof CulturalAwarenessService.getUpcomingHolidayMention).toBe('function');
    });

    it('should expose getSeasonalAdjustment method', () => {
      expect(typeof CulturalAwarenessService.getSeasonalAdjustment).toBe('function');
    });

    it('should expose getCulturalMoment method', () => {
      expect(typeof CulturalAwarenessService.getCulturalMoment).toBe('function');
    });

    it('should expose isFinanciallyRelevantDate method', () => {
      expect(typeof CulturalAwarenessService.isFinanciallyRelevantDate).toBe('function');
    });

    it('should expose getSeason method', () => {
      expect(typeof CulturalAwarenessService.getSeason).toBe('function');
    });

    it('should work via service object', () => {
      const context = CulturalAwarenessService.getContext();
      expect(context).toBeDefined();
      expect(context.season).toBeDefined();

      const adjustment = CulturalAwarenessService.getSeasonalAdjustment();
      expect(adjustment).toBeDefined();
      expect(adjustment.energyModifier).toBeDefined();
    });
  });

  describe('Season consistency', () => {
    it('should return consistent season for same call', () => {
      const season1 = CulturalAwarenessService.getSeason();
      const season2 = CulturalAwarenessService.getSeason();

      expect(season1).toBe(season2);
    });

    it('should match context season', () => {
      const season = CulturalAwarenessService.getSeason();
      const context = getCulturalContext();

      expect(season).toBe(context.season);
    });
  });

  describe('Holiday data integrity', () => {
    it('should have valid holiday types', () => {
      const context = getCulturalContext();

      if (context.currentHoliday) {
        expect(['major', 'minor', 'observance']).toContain(context.currentHoliday.type);
      }

      if (context.upcomingHoliday) {
        expect(['major', 'minor', 'observance']).toContain(context.upcomingHoliday.type);
      }
    });

    it('should have future date for upcoming holiday', () => {
      const context = getCulturalContext();

      if (context.upcomingHoliday) {
        expect(context.upcomingHoliday.date.getTime()).toBeGreaterThan(Date.now() - 86400000);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple calls without error', () => {
      for (let i = 0; i < 10; i++) {
        expect(() => getCulturalContext()).not.toThrow();
        expect(() => getSeasonalAdjustment()).not.toThrow();
        expect(() => isFinanciallyRelevantDate()).not.toThrow();
      }
    });

    it('should handle concurrent calls', async () => {
      const promises = Array(5)
        .fill(null)
        .map(() => getCulturalMoment('ferni'));

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result === null || typeof result === 'string').toBe(true);
      });
    });
  });
});

describe('Seasonal Adjustments by Season', () => {
  // Can't easily test specific seasons without mocking Date, but we can verify structure
  it('should have proper structure regardless of current season', () => {
    const adjustment = getSeasonalAdjustment();

    expect(adjustment.energyModifier).toBeGreaterThanOrEqual(0.95);
    expect(adjustment.energyModifier).toBeLessThanOrEqual(1.1);
    expect(adjustment.topicSuggestions.length).toBe(3);
  });
});

describe('Financial Relevance Detection', () => {
  it('should identify tax season dates', () => {
    // This test may vary based on current date
    const result = isFinanciallyRelevantDate();

    // Basic structure check
    expect(typeof result.relevant).toBe('boolean');
    if (result.relevant && result.reason === 'tax season') {
      const now = new Date();
      const month = now.getMonth();
      const day = now.getDate();

      // Should be between March 15 and April 15
      const isTaxSeason = (month === 2 && day >= 15) || (month === 3 && day <= 15);
      expect(isTaxSeason).toBe(true);
    }
  });

  it('should identify end of quarter', () => {
    const result = isFinanciallyRelevantDate();

    if (result.relevant && result.reason === 'end of quarter') {
      const now = new Date();
      const month = now.getMonth();
      const day = now.getDate();

      // Should be end of quarter month (2, 5, 8, 11) with day >= 25
      const isEOQ = [2, 5, 8, 11].includes(month) && day >= 25;
      expect(isEOQ).toBe(true);
    }
  });
});
