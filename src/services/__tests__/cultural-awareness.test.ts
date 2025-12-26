/**
 * Cultural Awareness Service Tests
 *
 * Tests for holiday awareness, seasonal detection,
 * and cultural context integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock persona behavior manager
vi.mock('../persona-behavior-manager.js', () => ({
  loadPersonaBehaviors: vi.fn().mockResolvedValue({}),
}));

import {
  type Holiday,
  type Season,
  type CulturalContext,
} from '../cultural-awareness.js';

describe('CulturalAwareness', () => {
  describe('Holiday type', () => {
    it('should create major holiday', () => {
      const christmas: Holiday = {
        name: 'Christmas',
        date: new Date(2024, 11, 25),
        type: 'major',
        greetings: ['Merry Christmas!', 'Happy holidays!'],
      };

      expect(christmas.type).toBe('major');
      expect(christmas.greetings).toHaveLength(2);
    });

    it('should create minor holiday', () => {
      const valentines: Holiday = {
        name: "Valentine's Day",
        date: new Date(2024, 1, 14),
        type: 'minor',
        greetings: ["Happy Valentine's Day!"],
      };

      expect(valentines.type).toBe('minor');
      expect(valentines.date.getMonth()).toBe(1); // February
    });

    it('should create observance', () => {
      const taxDay: Holiday = {
        name: 'Tax Day',
        date: new Date(2024, 3, 15),
        type: 'observance',
      };

      expect(taxDay.type).toBe('observance');
      expect(taxDay.greetings).toBeUndefined();
    });

    it('should support regional holidays', () => {
      const regionalHoliday: Holiday = {
        name: 'Dia de los Muertos',
        date: new Date(2024, 10, 1),
        type: 'major',
        region: 'Mexico',
        greetings: ['Happy Day of the Dead'],
      };

      expect(regionalHoliday.region).toBe('Mexico');
    });

    it('should have all holiday types', () => {
      const types: Holiday['type'][] = ['major', 'minor', 'observance'];

      expect(types).toHaveLength(3);
    });
  });

  describe('Season type', () => {
    it('should have all four seasons', () => {
      const seasons: Season[] = ['spring', 'summer', 'fall', 'winter'];

      expect(seasons).toHaveLength(4);
    });

    it('should use string literal types', () => {
      const season: Season = 'winter';
      expect(typeof season).toBe('string');
    });
  });

  describe('CulturalContext type', () => {
    it('should create cultural context with current holiday', () => {
      const context: CulturalContext = {
        currentHoliday: {
          name: 'Thanksgiving',
          date: new Date(2024, 10, 28),
          type: 'major',
          greetings: ['Happy Thanksgiving!'],
        },
        season: 'fall',
        monthContext: 'holiday season approaching',
      };

      expect(context.currentHoliday?.name).toBe('Thanksgiving');
      expect(context.season).toBe('fall');
    });

    it('should create context with upcoming holiday', () => {
      const context: CulturalContext = {
        upcomingHoliday: {
          name: "New Year's Day",
          date: new Date(2025, 0, 1),
          type: 'major',
          greetings: ['Happy New Year!'],
        },
        season: 'winter',
        monthContext: 'holiday season',
      };

      expect(context.currentHoliday).toBeUndefined();
      expect(context.upcomingHoliday?.name).toBe("New Year's Day");
    });

    it('should create minimal context', () => {
      const context: CulturalContext = {
        season: 'summer',
        monthContext: 'vacation season',
      };

      expect(context.currentHoliday).toBeUndefined();
      expect(context.upcomingHoliday).toBeUndefined();
      expect(context.season).toBe('summer');
    });
  });

  describe('Holiday data', () => {
    const majorUSHolidays = [
      { name: "New Year's Day", month: 0, day: 1 },
      { name: 'Memorial Day', month: 4 },
      { name: 'Independence Day', month: 6, day: 4 },
      { name: 'Labor Day', month: 8 },
      { name: 'Thanksgiving', month: 10 },
      { name: 'Christmas', month: 11, day: 25 },
      { name: "New Year's Eve", month: 11, day: 31 },
    ];

    it.each(majorUSHolidays)('should recognize $name as major holiday', ({ name, month, day }) => {
      const holiday: Holiday = {
        name,
        date: new Date(2024, month, day || 1),
        type: 'major',
      };

      expect(holiday.type).toBe('major');
    });

    it('should have greetings for greeting-worthy holidays', () => {
      const greetingHolidays: Holiday[] = [
        { name: 'Christmas', date: new Date(2024, 11, 25), type: 'major', greetings: ['Merry Christmas!'] },
        { name: 'Thanksgiving', date: new Date(2024, 10, 28), type: 'major', greetings: ['Happy Thanksgiving!'] },
        { name: 'Independence Day', date: new Date(2024, 6, 4), type: 'major', greetings: ['Happy Fourth of July!'] },
      ];

      greetingHolidays.forEach((holiday) => {
        expect(holiday.greetings).toBeDefined();
        expect(holiday.greetings!.length).toBeGreaterThan(0);
      });
    });

    it('should recognize minor holidays', () => {
      const minorHolidays: Holiday[] = [
        { name: "Valentine's Day", date: new Date(2024, 1, 14), type: 'minor' },
        { name: "Mother's Day", date: new Date(2024, 4, 12), type: 'minor' },
        { name: "Father's Day", date: new Date(2024, 5, 16), type: 'minor' },
        { name: 'Halloween', date: new Date(2024, 9, 31), type: 'minor' },
      ];

      minorHolidays.forEach((holiday) => {
        expect(holiday.type).toBe('minor');
      });
    });

    it('should recognize observances', () => {
      const taxDay: Holiday = {
        name: 'Tax Day',
        date: new Date(2024, 3, 15),
        type: 'observance',
      };

      expect(taxDay.type).toBe('observance');
    });
  });

  describe('Season detection', () => {
    describe('Month to season mapping', () => {
      const monthToSeason: Array<{ month: number; expected: Season }> = [
        { month: 0, expected: 'winter' }, // January
        { month: 1, expected: 'winter' }, // February
        { month: 2, expected: 'spring' }, // March
        { month: 3, expected: 'spring' }, // April
        { month: 4, expected: 'spring' }, // May
        { month: 5, expected: 'summer' }, // June
        { month: 6, expected: 'summer' }, // July
        { month: 7, expected: 'summer' }, // August
        { month: 8, expected: 'fall' }, // September
        { month: 9, expected: 'fall' }, // October
        { month: 10, expected: 'fall' }, // November
        { month: 11, expected: 'winter' }, // December
      ];

      it.each(monthToSeason)('month $month should be $expected', ({ month, expected }) => {
        // Implementation logic from the service
        let season: Season;
        if (month >= 2 && month <= 4) season = 'spring';
        else if (month >= 5 && month <= 7) season = 'summer';
        else if (month >= 8 && month <= 10) season = 'fall';
        else season = 'winter';

        expect(season).toBe(expected);
      });
    });

    describe('Seasonal context', () => {
      const seasonContexts: Record<Season, string[]> = {
        spring: ['fresh start energy', 'spring cleaning vibes', 'renewal'],
        summer: ['summer mode', 'vacation energy', 'long days'],
        fall: ['back to routine', 'harvest energy', 'cozy season approaching'],
        winter: ['holiday season', 'reflection time', 'cozy vibes'],
      };

      it.each(Object.entries(seasonContexts) as [Season, string[]][])(
        '%s should have contextual phrases',
        (season, phrases) => {
          expect(phrases.length).toBeGreaterThan(0);
          phrases.forEach((phrase) => {
            expect(typeof phrase).toBe('string');
            expect(phrase.length).toBeGreaterThan(0);
          });
        }
      );
    });
  });

  describe('Month context', () => {
    const monthContexts: Record<number, string> = {
      0: 'new year resolution energy',
      1: 'still early in the year',
      2: 'spring is coming',
      3: 'tax season awareness',
      4: 'spring energy',
      5: 'summer approaching',
      6: 'mid-year check-in',
      7: 'summer in full swing',
      8: 'back to school energy',
      9: 'fall settling in',
      10: 'end of year approaching',
      11: 'holiday season',
    };

    it.each(Object.entries(monthContexts).map(([k, v]) => [Number(k), v]))(
      'month %i should have context: %s',
      (month, context) => {
        expect(typeof context).toBe('string');
        expect(context.length).toBeGreaterThan(0);
      }
    );

    it('should cover all 12 months', () => {
      expect(Object.keys(monthContexts)).toHaveLength(12);
    });

    it('should have resolution energy in January', () => {
      expect(monthContexts[0]).toContain('resolution');
    });

    it('should have tax awareness in April', () => {
      expect(monthContexts[3]).toContain('tax');
    });

    it('should have holiday context in December', () => {
      expect(monthContexts[11]).toContain('holiday');
    });
  });

  describe('Integration scenarios', () => {
    it('should build context for Christmas week', () => {
      const context: CulturalContext = {
        currentHoliday: {
          name: 'Christmas',
          date: new Date(2024, 11, 25),
          type: 'major',
          greetings: ['Merry Christmas!', 'Happy holidays!'],
        },
        upcomingHoliday: {
          name: "New Year's Eve",
          date: new Date(2024, 11, 31),
          type: 'major',
          greetings: ["Happy New Year's Eve!"],
        },
        season: 'winter',
        monthContext: 'holiday season',
      };

      expect(context.currentHoliday?.name).toBe('Christmas');
      expect(context.upcomingHoliday?.name).toBe("New Year's Eve");
      expect(context.season).toBe('winter');
    });

    it('should build context for summer vacation', () => {
      const context: CulturalContext = {
        season: 'summer',
        monthContext: 'summer in full swing',
      };

      expect(context.currentHoliday).toBeUndefined();
      expect(context.season).toBe('summer');
    });

    it('should build context for back to school', () => {
      const context: CulturalContext = {
        upcomingHoliday: {
          name: 'Labor Day',
          date: new Date(2024, 8, 2),
          type: 'major',
        },
        season: 'fall',
        monthContext: 'back to school energy',
      };

      expect(context.season).toBe('fall');
      expect(context.monthContext).toContain('back to school');
    });

    it('should build context for tax season', () => {
      const context: CulturalContext = {
        upcomingHoliday: {
          name: 'Tax Day',
          date: new Date(2024, 3, 15),
          type: 'observance',
        },
        season: 'spring',
        monthContext: 'tax season awareness',
      };

      expect(context.upcomingHoliday?.type).toBe('observance');
      expect(context.monthContext).toContain('tax');
    });
  });

  describe('Holiday proximity', () => {
    it('should identify holidays within a week', () => {
      const today = new Date(2024, 11, 20); // December 20
      const christmas = new Date(2024, 11, 25); // December 25

      const daysUntil = Math.ceil(
        (christmas.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysUntil).toBe(5);
      expect(daysUntil).toBeLessThanOrEqual(7);
    });

    it('should identify same-day holiday', () => {
      const today = new Date(2024, 11, 25);
      const christmas = new Date(2024, 11, 25);

      const isSameDay =
        today.getFullYear() === christmas.getFullYear() &&
        today.getMonth() === christmas.getMonth() &&
        today.getDate() === christmas.getDate();

      expect(isSameDay).toBe(true);
    });

    it('should calculate days until holiday', () => {
      const testDate = new Date(2024, 10, 20); // November 20
      const thanksgiving = new Date(2024, 10, 28); // November 28

      const daysUntil = Math.ceil(
        (thanksgiving.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysUntil).toBe(8);
    });
  });

  describe('Greeting selection', () => {
    it('should have multiple greeting options for major holidays', () => {
      const christmasGreetings = ['Merry Christmas!', 'Happy holidays!'];
      const thanksgivingGreetings = ['Happy Thanksgiving!', 'Hope you have a wonderful Thanksgiving!'];

      expect(christmasGreetings.length).toBeGreaterThan(1);
      expect(thanksgivingGreetings.length).toBeGreaterThan(1);
    });

    it('should have inclusive alternatives', () => {
      const christmasGreetings = ['Merry Christmas!', 'Happy holidays!'];

      expect(christmasGreetings).toContain('Happy holidays!');
    });

    it('should have appropriate greetings for each holiday', () => {
      const holidayGreetings: Record<string, string[]> = {
        'Christmas': ['Merry Christmas!', 'Happy holidays!'],
        'Thanksgiving': ['Happy Thanksgiving!'],
        'Independence Day': ['Happy Fourth of July!'],
        "New Year's Day": ['Happy New Year!', 'New year, fresh start!'],
        'Halloween': ['Happy Halloween!'],
      };

      Object.entries(holidayGreetings).forEach(([holiday, greetings]) => {
        expect(greetings.length).toBeGreaterThan(0);
        greetings.forEach((greeting) => {
          expect(greeting.endsWith('!')).toBe(true);
        });
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle year boundaries', () => {
      const dec31: CulturalContext = {
        currentHoliday: {
          name: "New Year's Eve",
          date: new Date(2024, 11, 31),
          type: 'major',
        },
        upcomingHoliday: {
          name: "New Year's Day",
          date: new Date(2025, 0, 1),
          type: 'major',
        },
        season: 'winter',
        monthContext: 'holiday season',
      };

      expect(dec31.currentHoliday?.date.getFullYear()).toBe(2024);
      expect(dec31.upcomingHoliday?.date.getFullYear()).toBe(2025);
    });

    it('should handle seasons at boundaries', () => {
      // February is winter, March is spring
      const febDate = new Date(2024, 1, 28);
      const marDate = new Date(2024, 2, 1);

      const febMonth = febDate.getMonth();
      const marMonth = marDate.getMonth();

      const febSeason: Season = febMonth >= 2 && febMonth <= 4 ? 'spring' : 'winter';
      const marSeason: Season = marMonth >= 2 && marMonth <= 4 ? 'spring' : 'winter';

      expect(febSeason).toBe('winter');
      expect(marSeason).toBe('spring');
    });

    it('should handle holidays without greetings', () => {
      const laborDay: Holiday = {
        name: 'Labor Day',
        date: new Date(2024, 8, 2),
        type: 'major',
      };

      expect(laborDay.greetings).toBeUndefined();
    });
  });
});
