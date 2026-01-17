/**
 * Time-Aware Content Service Tests
 *
 * Tests for time-based content adaptation on landing page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  getTimeMode,
  getTimeAwareContent,
  getTimeAwareContentWithOccasions,
  getTimeAwareClasses,
  type TimeMode,
  type TimeAwareContent,
} from '../time-aware.js';

describe('TimeAware', () => {
  describe('getTimeMode', () => {
    it('should return late-night for 12am-5am', () => {
      expect(getTimeMode(0)).toBe('late-night');
      expect(getTimeMode(1)).toBe('late-night');
      expect(getTimeMode(2)).toBe('late-night');
      expect(getTimeMode(3)).toBe('late-night');
      expect(getTimeMode(4)).toBe('late-night');
    });

    it('should return early-morning for 5am-8am', () => {
      expect(getTimeMode(5)).toBe('early-morning');
      expect(getTimeMode(6)).toBe('early-morning');
      expect(getTimeMode(7)).toBe('early-morning');
    });

    it('should return morning for 8am-12pm', () => {
      expect(getTimeMode(8)).toBe('morning');
      expect(getTimeMode(9)).toBe('morning');
      expect(getTimeMode(10)).toBe('morning');
      expect(getTimeMode(11)).toBe('morning');
    });

    it('should return afternoon for 12pm-5pm', () => {
      expect(getTimeMode(12)).toBe('afternoon');
      expect(getTimeMode(13)).toBe('afternoon');
      expect(getTimeMode(14)).toBe('afternoon');
      expect(getTimeMode(15)).toBe('afternoon');
      expect(getTimeMode(16)).toBe('afternoon');
    });

    it('should return evening for 5pm-9pm', () => {
      expect(getTimeMode(17)).toBe('evening');
      expect(getTimeMode(18)).toBe('evening');
      expect(getTimeMode(19)).toBe('evening');
      expect(getTimeMode(20)).toBe('evening');
    });

    it('should return night for 9pm-12am', () => {
      expect(getTimeMode(21)).toBe('night');
      expect(getTimeMode(22)).toBe('night');
      expect(getTimeMode(23)).toBe('night');
    });

    it('should use current time when no hour provided', () => {
      const mode = getTimeMode();
      const expectedModes: TimeMode[] = [
        'late-night',
        'early-morning',
        'morning',
        'afternoon',
        'evening',
        'night',
      ];

      expect(expectedModes).toContain(mode);
    });
  });

  describe('getTimeAwareContent', () => {
    it('should return late-night content at 2am', () => {
      const content = getTimeAwareContent(2);

      expect(content.mode).toBe('late-night');
      expect(content.hero.tagline).toContain("Can't sleep");
      expect(content.visualMode).toBe('dark');
      expect(content.backgroundTreatment).toBe('dim');
    });

    it('should return early-morning content at 6am', () => {
      const content = getTimeAwareContent(6);

      expect(content.mode).toBe('early-morning');
      expect(content.hero.tagline).toBe('Good morning.');
      expect(content.emphasizeSection).toBe('use-cases');
    });

    it('should return morning content at 10am', () => {
      const content = getTimeAwareContent(10);

      expect(content.mode).toBe('morning');
      expect(content.hero.tagline).toBe('Better than human.');
      expect(content.visualMode).toBe('light');
    });

    it('should return afternoon content at 2pm', () => {
      const content = getTimeAwareContent(14);

      expect(content.mode).toBe('afternoon');
      expect(content.emphasizeSection).toBe('team');
    });

    it('should return evening content at 7pm', () => {
      const content = getTimeAwareContent(19);

      expect(content.mode).toBe('evening');
      expect(content.hero.tagline).toContain('End of a long day');
      expect(content.backgroundTreatment).toBe('warm');
    });

    it('should return night content at 10pm', () => {
      const content = getTimeAwareContent(22);

      expect(content.mode).toBe('night');
      expect(content.hero.tagline).toContain('Winding down');
      expect(content.backgroundTreatment).toBe('calming');
    });

    it('should have all required hero fields', () => {
      for (let hour = 0; hour < 24; hour++) {
        const content = getTimeAwareContent(hour);

        expect(content.hero).toHaveProperty('tagline');
        expect(content.hero).toHaveProperty('headline');
        expect(content.hero).toHaveProperty('subhead');
        expect(typeof content.hero.tagline).toBe('string');
        expect(typeof content.hero.headline).toBe('string');
        expect(typeof content.hero.subhead).toBe('string');
      }
    });

    it('should have valid visual mode for all times', () => {
      const validModes = ['light', 'dark', 'auto'];

      for (let hour = 0; hour < 24; hour++) {
        const content = getTimeAwareContent(hour);
        expect(validModes).toContain(content.visualMode);
      }
    });

    it('should have valid background treatment for all times', () => {
      const validTreatments = ['default', 'dim', 'warm', 'calming'];

      for (let hour = 0; hour < 24; hour++) {
        const content = getTimeAwareContent(hour);
        expect(validTreatments).toContain(content.backgroundTreatment);
      }
    });

    it('should have chat greeting for all times', () => {
      for (let hour = 0; hour < 24; hour++) {
        const content = getTimeAwareContent(hour);
        expect(content.chatGreeting).toBeTruthy();
        expect(typeof content.chatGreeting).toBe('string');
      }
    });

    it('should have emphasize section for all times', () => {
      for (let hour = 0; hour < 24; hour++) {
        const content = getTimeAwareContent(hour);
        expect(content.emphasizeSection).toBeTruthy();
      }
    });
  });

  describe('CTA overrides', () => {
    it('should have CTA override for late-night', () => {
      const content = getTimeAwareContent(2);

      expect(content.ctaOverride).toBeDefined();
      expect(content.ctaOverride?.text).toBe("I'm Here");
      expect(content.ctaOverride?.style).toBe('primary');
    });

    it('should have CTA override for early-morning', () => {
      const content = getTimeAwareContent(6);

      expect(content.ctaOverride).toBeDefined();
      expect(content.ctaOverride?.text).toBe('Start My Day');
    });

    it('should not have CTA override for afternoon', () => {
      const content = getTimeAwareContent(14);

      expect(content.ctaOverride).toBeUndefined();
    });

    it('should have secondary style CTA for evening', () => {
      const content = getTimeAwareContent(19);

      expect(content.ctaOverride?.style).toBe('secondary');
    });
  });

  describe('getTimeAwareClasses', () => {
    it('should include time mode class', () => {
      const content = getTimeAwareContent(2);
      const classes = getTimeAwareClasses(content);

      expect(classes).toContain('time-mode--late-night');
    });

    it('should include dark theme class when visual mode is dark', () => {
      const content = getTimeAwareContent(2);
      const classes = getTimeAwareClasses(content);

      expect(classes).toContain('theme--dark');
    });

    it('should not include dark theme class for light mode', () => {
      const content = getTimeAwareContent(10);
      const classes = getTimeAwareClasses(content);

      expect(classes).not.toContain('theme--dark');
    });

    it('should include background treatment class when not default', () => {
      const content = getTimeAwareContent(2);
      const classes = getTimeAwareClasses(content);

      expect(classes).toContain('bg-treatment--dim');
    });

    it('should not include background treatment class for default', () => {
      const content = getTimeAwareContent(10);
      const classes = getTimeAwareClasses(content);

      expect(classes.some((c) => c.startsWith('bg-treatment--'))).toBe(false);
    });
  });

  describe('getTimeAwareContentWithOccasions', () => {
    // We need to mock Date for special occasion tests
    let originalDate: DateConstructor;

    beforeEach(() => {
      originalDate = global.Date;
    });

    afterEach(() => {
      global.Date = originalDate;
    });

    it('should return normal content when no special occasion', () => {
      // Mock a regular Tuesday at 10am
      const mockDate = new Date('2024-12-24T10:00:00');
      vi.setSystemTime(mockDate);

      const content = getTimeAwareContentWithOccasions(10);

      expect(content.mode).toBe('morning');
      expect(content.hero.tagline).toBe('Better than human.');
    });

    it('should have new year content on January 1st', () => {
      const mockDate = new Date('2025-01-01T10:00:00');
      vi.setSystemTime(mockDate);

      const content = getTimeAwareContentWithOccasions(10);

      expect(content.hero.tagline).toBe('New Year, Same Me.');
      expect(content.chatGreeting).toContain('Happy New Year');
    });

    it('should have Monday morning content on Monday 8am', () => {
      // Find a Monday
      const mockDate = new Date('2024-12-23T08:00:00'); // This is a Monday
      vi.setSystemTime(mockDate);

      const content = getTimeAwareContentWithOccasions(8);

      expect(content.hero.tagline).toBe('Monday again.');
      expect(content.chatGreeting).toContain('Monday mornings');
    });

    it('should have Friday evening content on Friday 6pm', () => {
      const mockDate = new Date('2024-12-27T18:00:00'); // This is a Friday
      vi.setSystemTime(mockDate);

      const content = getTimeAwareContentWithOccasions(18);

      expect(content.hero.tagline).toBe('Friday made it.');
      expect(content.chatGreeting).toContain('Friday');
    });

    it('should have Sunday evening content on Sunday 7pm', () => {
      const mockDate = new Date('2024-12-29T19:00:00'); // This is a Sunday
      vi.setSystemTime(mockDate);

      const content = getTimeAwareContentWithOccasions(19);

      expect(content.hero.tagline).toBe('Sunday scaries?');
    });

    it('should preserve base content fields when applying occasion override', () => {
      const mockDate = new Date('2025-01-01T10:00:00');
      vi.setSystemTime(mockDate);

      const content = getTimeAwareContentWithOccasions(10);

      // Should have base morning content fields
      expect(content.visualMode).toBe('light');
      expect(content.mode).toBe('morning');
      // But with new year hero
      expect(content.hero.tagline).toBe('New Year, Same Me.');
    });
  });

  describe('Time mode transitions', () => {
    it('should transition at exact boundary times', () => {
      // Test exact transitions
      expect(getTimeMode(4)).toBe('late-night');
      expect(getTimeMode(5)).toBe('early-morning');

      expect(getTimeMode(7)).toBe('early-morning');
      expect(getTimeMode(8)).toBe('morning');

      expect(getTimeMode(11)).toBe('morning');
      expect(getTimeMode(12)).toBe('afternoon');

      expect(getTimeMode(16)).toBe('afternoon');
      expect(getTimeMode(17)).toBe('evening');

      expect(getTimeMode(20)).toBe('evening');
      expect(getTimeMode(21)).toBe('night');

      expect(getTimeMode(23)).toBe('night');
      expect(getTimeMode(0)).toBe('late-night');
    });
  });

  describe('Brand consistency', () => {
    it('should mention 2am in late-night content', () => {
      const content = getTimeAwareContent(2);

      // At 2am, the messaging should emphasize the "2am presence" brand
      expect(content.hero.subhead).toContain('right now');
    });

    it('should use warm/human language in all times', () => {
      const humanWords = [
        'together',
        'someone',
        'you',
        'here',
        'listen',
        'talk',
        'feel',
        'day',
        'moment',
      ];

      for (let hour = 0; hour < 24; hour += 4) {
        const content = getTimeAwareContent(hour);
        const allText =
          `${content.hero.tagline} ${content.hero.headline} ${content.hero.subhead} ${content.chatGreeting}`.toLowerCase();

        const hasHumanWord = humanWords.some((word) => allText.includes(word));
        expect(hasHumanWord).toBe(true);
      }
    });

    it('should use dark mode at night for user comfort', () => {
      // Night hours should use dark mode
      expect(getTimeAwareContent(22).visualMode).toBe('dark');
      expect(getTimeAwareContent(2).visualMode).toBe('dark');

      // Day hours should use light mode
      expect(getTimeAwareContent(10).visualMode).toBe('light');
      expect(getTimeAwareContent(14).visualMode).toBe('light');
    });
  });

  describe('Edge Cases', () => {
    it('should return night as default for negative hours', () => {
      // Negative hours don't match any condition, fall through to 'night'
      const mode = getTimeMode(-1);
      expect(mode).toBe('night');
    });

    it('should return night as default for hour > 23', () => {
      // Hours > 23 don't match any condition, fall through to 'night'
      const mode = getTimeMode(25);
      expect(mode).toBe('night');
    });

    it('should handle decimal hours', () => {
      const mode = getTimeMode(10.5);
      expect(mode).toBe('morning');
    });
  });
});
