/**
 * Day Awareness Cache Tests
 *
 * Tests for the pre-warmed day awareness context system.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initDayAwarenessCache,
  getDayAwareness,
  getCachedWeather,
  formatDayAwarenessForLLM,
  getFullDayBriefing,
  stopDayAwarenessCache,
  getDayAwarenessCacheStats,
  type DayAwarenessContext,
} from '../day-awareness-cache.js';

describe('DayAwarenessCache', () => {
  beforeEach(() => {
    // Reset cache before each test
    stopDayAwarenessCache();
  });

  afterEach(() => {
    // Clean up timers
    stopDayAwarenessCache();
    vi.restoreAllMocks();
  });

  describe('getDayAwareness', () => {
    it('returns day context without initialization', () => {
      const context = getDayAwareness();

      expect(context).toBeDefined();
      expect(context.date).toBeDefined();
      expect(context.time).toBeDefined();
      expect(context.dayOfWeek).toBeDefined();
      expect(context.timeOfDay).toBeDefined();
      expect(context.season).toBeDefined();
      expect(context.vibe).toBeDefined();
    });

    it('returns correct day of week', () => {
      const context = getDayAwareness();
      const now = new Date();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      expect(context.dayOfWeek).toBe(days[now.getDay()]);
    });

    it('identifies weekends correctly', () => {
      const context = getDayAwareness();
      const now = new Date();
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;

      expect(context.isWeekend).toBe(isWeekend);
    });

    it('returns valid time of day category', () => {
      const context = getDayAwareness();
      const validCategories = [
        'early_morning',
        'morning',
        'midday',
        'afternoon',
        'evening',
        'late_night',
      ];

      expect(validCategories).toContain(context.timeOfDay);
    });

    it('returns valid season', () => {
      const context = getDayAwareness();
      const validSeasons = ['Spring', 'Summer', 'Fall', 'Winter'];

      expect(validSeasons).toContain(context.season);
    });

    it('generates vibe text', () => {
      const context = getDayAwareness();

      expect(context.vibe).toBeDefined();
      expect(context.vibe.length).toBeGreaterThan(10);
    });
  });

  describe('initDayAwarenessCache', () => {
    it('initializes without error', () => {
      expect(() => initDayAwarenessCache()).not.toThrow();
    });

    it('is idempotent (multiple calls are safe)', () => {
      initDayAwarenessCache();
      initDayAwarenessCache();
      initDayAwarenessCache();

      const stats = getDayAwarenessCacheStats();
      expect(stats.initialized).toBe(true);
    });

    it('sets initialized flag', () => {
      initDayAwarenessCache();

      const stats = getDayAwarenessCacheStats();
      expect(stats.initialized).toBe(true);
    });
  });

  describe('getCachedWeather', () => {
    it('returns null when city not cached', () => {
      const weather = getCachedWeather('Timbuktu');
      expect(weather).toBeNull();
    });

    it('is case-insensitive', () => {
      const weather1 = getCachedWeather('new york');
      const weather2 = getCachedWeather('NEW YORK');
      const weather3 = getCachedWeather('New York');

      // All should return the same result (either all null or all same cached value)
      expect(weather1).toEqual(weather2);
      expect(weather2).toEqual(weather3);
    });
  });

  describe('formatDayAwarenessForLLM', () => {
    it('includes date header', () => {
      const context = getDayAwareness();
      const formatted = formatDayAwarenessForLLM(context);

      expect(formatted).toContain('[YOUR AWARENESS');
      expect(formatted).toContain(context.date);
    });

    it('includes time and vibe', () => {
      const context = getDayAwareness();
      const formatted = formatDayAwarenessForLLM(context);

      expect(formatted).toContain(context.time);
      expect(formatted).toContain(context.vibe);
    });

    it('includes season info', () => {
      const context = getDayAwareness();
      const formatted = formatDayAwarenessForLLM(context);

      expect(formatted).toContain(context.season);
      expect(formatted).toContain(context.seasonalMood);
    });

    it('includes guidance note', () => {
      const context = getDayAwareness();
      const formatted = formatDayAwarenessForLLM(context);

      expect(formatted).toContain('Use this awareness naturally');
    });

    it('includes holiday info when present', () => {
      const context: DayAwarenessContext = {
        ...getDayAwareness(),
        holiday: {
          name: 'Test Holiday',
          acknowledgment: 'Happy Test Holiday!',
        },
      };
      const formatted = formatDayAwarenessForLLM(context);

      expect(formatted).toContain('Test Holiday');
      expect(formatted).toContain('Happy Test Holiday!');
    });
  });

  describe('getFullDayBriefing', () => {
    it('returns briefing without user context', () => {
      const briefing = getFullDayBriefing();

      expect(briefing).toBeDefined();
      expect(briefing.day).toBeDefined();
      expect(briefing.formatted).toBeDefined();
      expect(briefing.formatted.length).toBeGreaterThan(50);
    });

    it('includes user name when provided', () => {
      const briefing = getFullDayBriefing({
        name: 'TestUser',
      });

      expect(briefing.user?.name).toBe('TestUser');
      expect(briefing.formatted).toContain('TestUser');
    });

    it('includes last conversation when provided', () => {
      const briefing = getFullDayBriefing({
        lastConversation: { when: 'yesterday' },
      });

      expect(briefing.formatted).toContain('Last talked: yesterday');
    });

    it('handles timezone parameter', () => {
      // Test with a known timezone
      const briefingNY = getFullDayBriefing({
        timezone: 'America/New_York',
      });

      const briefingLA = getFullDayBriefing({
        timezone: 'America/Los_Angeles',
      });

      // Both should return valid context
      expect(briefingNY.day.date).toBeDefined();
      expect(briefingLA.day.date).toBeDefined();

      // They might have different times depending on current time
      // (we can't assert exact difference as it depends on DST)
    });

    it('handles invalid timezone gracefully', () => {
      // Should not throw, should fall back to server timezone
      const briefing = getFullDayBriefing({
        timezone: 'Invalid/Timezone',
      });

      expect(briefing).toBeDefined();
      expect(briefing.day.date).toBeDefined();
    });

    it('includes city in weather context when provided', () => {
      const briefing = getFullDayBriefing({
        city: 'Boston',
      });

      // Weather might not be cached, but the city should be stored
      expect(briefing.user?.city).toBe('Boston');
    });
  });

  describe('getDayAwarenessCacheStats', () => {
    it('returns stats object', () => {
      const stats = getDayAwarenessCacheStats();

      expect(stats).toBeDefined();
      expect(typeof stats.initialized).toBe('boolean');
      expect(typeof stats.hasCachedContext).toBe('boolean');
      expect(typeof stats.weatherCitiesCached).toBe('number');
    });

    it('reports not initialized before init', () => {
      stopDayAwarenessCache();
      const stats = getDayAwarenessCacheStats();

      expect(stats.initialized).toBe(false);
    });

    it('reports initialized after init', () => {
      initDayAwarenessCache();
      const stats = getDayAwarenessCacheStats();

      expect(stats.initialized).toBe(true);
    });

    it('reports context freshness', () => {
      getDayAwareness(); // Force context generation
      const stats = getDayAwarenessCacheStats();

      expect(['fresh', 'stale', 'expired', 'missing']).toContain(stats.contextFreshness);
    });
  });

  describe('stopDayAwarenessCache', () => {
    it('clears cache state', () => {
      initDayAwarenessCache();
      getDayAwareness();

      stopDayAwarenessCache();

      const stats = getDayAwarenessCacheStats();
      expect(stats.initialized).toBe(false);
      expect(stats.weatherCitiesCached).toBe(0);
    });

    it('is safe to call multiple times', () => {
      expect(() => {
        stopDayAwarenessCache();
        stopDayAwarenessCache();
        stopDayAwarenessCache();
      }).not.toThrow();
    });
  });

  describe('time of day categorization', () => {
    // These tests mock Date to test specific hours
    const originalDate = global.Date;

    afterEach(() => {
      global.Date = originalDate;
    });

    it('categorizes early morning (5-8)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T06:30:00'));

      const context = getDayAwareness();
      expect(context.timeOfDay).toBe('early_morning');

      vi.useRealTimers();
    });

    it('categorizes morning (9-11)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:30:00'));

      const context = getDayAwareness();
      expect(context.timeOfDay).toBe('morning');

      vi.useRealTimers();
    });

    it('categorizes midday (12-13)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T12:30:00'));

      const context = getDayAwareness();
      expect(context.timeOfDay).toBe('midday');

      vi.useRealTimers();
    });

    it('categorizes afternoon (14-16)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T15:30:00'));

      const context = getDayAwareness();
      expect(context.timeOfDay).toBe('afternoon');

      vi.useRealTimers();
    });

    it('categorizes evening (17-20)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T19:30:00'));

      const context = getDayAwareness();
      expect(context.timeOfDay).toBe('evening');

      vi.useRealTimers();
    });

    it('categorizes late night (21-4)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T23:30:00'));

      const context = getDayAwareness();
      expect(context.timeOfDay).toBe('late_night');

      vi.useRealTimers();
    });
  });

  describe('weekend detection', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('detects Saturday as weekend', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-17T12:00:00')); // Saturday

      const context = getDayAwareness();
      expect(context.isWeekend).toBe(true);
      expect(context.dayOfWeek).toBe('Saturday');

      vi.useRealTimers();
    });

    it('detects Sunday as weekend', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-18T12:00:00')); // Sunday

      const context = getDayAwareness();
      expect(context.isWeekend).toBe(true);
      expect(context.dayOfWeek).toBe('Sunday');

      vi.useRealTimers();
    });

    it('detects Wednesday as weekday', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-14T12:00:00')); // Wednesday

      const context = getDayAwareness();
      expect(context.isWeekend).toBe(false);
      expect(context.dayOfWeek).toBe('Wednesday');

      vi.useRealTimers();
    });
  });

  describe('holiday detection', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('detects Christmas', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-25T12:00:00'));

      const context = getDayAwareness();
      expect(context.holiday).toBeDefined();
      expect(context.holiday?.name).toBe('Christmas');

      vi.useRealTimers();
    });

    it('detects New Years Day', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T12:00:00'));

      const context = getDayAwareness();
      expect(context.holiday).toBeDefined();
      expect(context.holiday?.name).toBe("New Year's Day");

      vi.useRealTimers();
    });

    it('returns no holiday on regular day', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-15T12:00:00')); // Regular day

      const context = getDayAwareness();
      expect(context.holiday).toBeUndefined();

      vi.useRealTimers();
    });

    it('detects upcoming holidays', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-22T12:00:00')); // 3 days before Christmas

      const context = getDayAwareness();
      expect(context.upcomingHolidays.length).toBeGreaterThan(0);
      expect(context.upcomingHolidays[0].name).toBe('Christmas Eve');

      vi.useRealTimers();
    });
  });

  describe('season detection', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('detects Winter (January)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T12:00:00'));

      const context = getDayAwareness();
      expect(context.season).toBe('Winter');

      vi.useRealTimers();
    });

    it('detects Spring (April)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-15T12:00:00'));

      const context = getDayAwareness();
      expect(context.season).toBe('Spring');

      vi.useRealTimers();
    });

    it('detects Summer (July)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T12:00:00'));

      const context = getDayAwareness();
      expect(context.season).toBe('Summer');

      vi.useRealTimers();
    });

    it('detects Fall (October)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-15T12:00:00'));

      const context = getDayAwareness();
      expect(context.season).toBe('Fall');

      vi.useRealTimers();
    });
  });
});
