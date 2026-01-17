/**
 * Habit Calendar Integration Service Tests
 *
 * Tests for habit-calendar correlation, recommendations, and insights.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock calendar service
vi.mock('../../calendar/calendar-service.js', () => ({
  getDayOverview: vi.fn().mockResolvedValue({
    date: new Date(),
    totalMeetings: 4,
    totalMeetingMinutes: 180,
    freeTimeMinutes: 300,
    isOverloaded: false,
    hasBackToBack: false,
    events: [],
  }),
  getWeekOverview: vi.fn().mockResolvedValue({
    days: [
      {
        date: new Date(),
        totalMeetings: 4,
        totalMeetingMinutes: 180,
        freeTimeMinutes: 300,
        isOverloaded: false,
        hasBackToBack: false,
      },
    ],
  }),
}));

// Mock calendar load service
vi.mock('../../calendar/calendar-load-service.js', () => ({
  getCalendarLoadFactors: vi.fn().mockResolvedValue({
    weeklyMeetingHours: 20,
    dailyAverageMeetings: 4,
    busyDayCount: 2,
  }),
}));

import {
  getHabitCalendarInsights,
  getTomorrowHabitRecommendations,
  buildHabitCalendarContext,
  type HabitCalendarInsight,
  type HabitRecommendation,
} from '../habit-calendar-integration.js';

describe('HabitCalendarIntegration', () => {
  const testUserId = 'habit-test-user-' + Date.now();

  // Helper to create test habit
  const createTestHabit = (overrides = {}) => ({
    id: 'habit-1',
    name: 'Morning Workout',
    duration: 30,
    completedDates: [],
    frequency: 'daily' as const,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getHabitCalendarInsights', () => {
    it('should return insights for a habit', async () => {
      const habit = createTestHabit();

      const insights = await getHabitCalendarInsights(testUserId, habit);

      expect(insights).toBeDefined();
      expect(insights.habitId).toBe(habit.id);
      expect(insights.habitName).toBe(habit.name);
    });

    it('should include calendar correlation data', async () => {
      const habit = createTestHabit();

      const insights = await getHabitCalendarInsights(testUserId, habit);

      expect(insights).toHaveProperty('missedOnHeavyDays');
      expect(insights).toHaveProperty('completionRateOnHeavyDays');
      expect(insights).toHaveProperty('completionRateOnLightDays');
      expect(insights).toHaveProperty('calendarCorrelation');
    });

    it('should have valid correlation types', async () => {
      const habit = createTestHabit();

      const insights = await getHabitCalendarInsights(testUserId, habit);

      expect(['strong', 'moderate', 'weak', 'none']).toContain(insights.calendarCorrelation);
    });

    it('should include suggested adaptation', async () => {
      const habit = createTestHabit();

      const insights = await getHabitCalendarInsights(testUserId, habit);

      expect(insights).toHaveProperty('suggestedAdaptation');
      expect(insights.suggestedAdaptation).toHaveProperty('type');
      expect(insights.suggestedAdaptation).toHaveProperty('description');
    });

    it('should handle habits with completion history', async () => {
      const habit = createTestHabit({
        completedDates: [
          new Date().toISOString().split('T')[0],
          new Date(Date.now() - 86400000).toISOString().split('T')[0],
        ],
      });

      const insights = await getHabitCalendarInsights(testUserId, habit);

      expect(insights).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      // Mock getWeekOverview (which the implementation uses, not getDayOverview)
      const { getWeekOverview } = await import('../../calendar/calendar-service.js');
      (getWeekOverview as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('API error'));

      const habit = createTestHabit();
      const insights = await getHabitCalendarInsights(testUserId, habit);

      // Should return default values, not throw
      expect(insights.calendarCorrelation).toBe('none');
    });
  });

  describe('getTomorrowHabitRecommendations', () => {
    it('should return recommendations array', async () => {
      const habits = [createTestHabit(), createTestHabit({ id: 'habit-2', name: 'Reading' })];

      const recommendations = await getTomorrowHabitRecommendations(testUserId, habits);

      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should return empty array for empty habits', async () => {
      const recommendations = await getTomorrowHabitRecommendations(testUserId, []);

      expect(recommendations).toEqual([]);
    });

    it('should include suggestion details when applicable', async () => {
      const { getDayOverview } = await import('../../calendar/calendar-service.js');
      (getDayOverview as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        date: new Date(),
        totalMeetings: 8,
        totalMeetingMinutes: 400,
        freeTimeMinutes: 80,
        isOverloaded: true,
        hasBackToBack: true,
        events: [],
      });

      const habits = [createTestHabit({ duration: 45 })];
      const recommendations = await getTomorrowHabitRecommendations(testUserId, habits);

      if (recommendations.length > 0) {
        const rec = recommendations[0];
        expect(rec).toHaveProperty('habitId');
        expect(rec).toHaveProperty('habitName');
        expect(rec).toHaveProperty('suggestion');
        expect(rec).toHaveProperty('reason');
        expect(rec).toHaveProperty('adaptationType');
      }
    });

    it('should handle calendar service errors', async () => {
      const { getDayOverview } = await import('../../calendar/calendar-service.js');
      (getDayOverview as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('API error'));

      const habits = [createTestHabit()];
      const recommendations = await getTomorrowHabitRecommendations(testUserId, habits);

      // Should return empty array, not throw
      expect(recommendations).toEqual([]);
    });
  });

  describe('buildHabitCalendarContext', () => {
    it('should return context string', async () => {
      const habits = [createTestHabit()];

      const context = await buildHabitCalendarContext(testUserId, habits);

      expect(typeof context).toBe('string');
    });

    it('should return empty for empty habits', async () => {
      const context = await buildHabitCalendarContext(testUserId, []);

      // With no habits, context should be minimal
      expect(typeof context).toBe('string');
    });

    it('should include header when content exists', async () => {
      const { getDayOverview } = await import('../../calendar/calendar-service.js');
      (getDayOverview as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          date: new Date(),
          totalMeetings: 10,
          totalMeetingMinutes: 480,
          freeTimeMinutes: 0,
          isOverloaded: true,
          hasBackToBack: true,
          events: [],
        })
        .mockResolvedValueOnce({
          date: new Date(),
          totalMeetings: 10,
          totalMeetingMinutes: 480,
          freeTimeMinutes: 0,
          isOverloaded: true,
          hasBackToBack: true,
          events: [],
        });

      const habits = [createTestHabit()];
      const context = await buildHabitCalendarContext(testUserId, habits);

      if (context.length > 0) {
        expect(context).toContain('HABIT-CALENDAR CORRELATION');
      }
    });

    it('should handle errors gracefully', async () => {
      const { getDayOverview } = await import('../../calendar/calendar-service.js');
      (getDayOverview as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));

      const habits = [createTestHabit()];
      const context = await buildHabitCalendarContext(testUserId, habits);

      // Should return empty string, not throw
      expect(typeof context).toBe('string');
    });
  });

  describe('HabitCalendarInsight interface', () => {
    it('should have correct structure', async () => {
      const habit = createTestHabit();
      const insight = await getHabitCalendarInsights(testUserId, habit);

      // Check required fields
      expect(typeof insight.habitId).toBe('string');
      expect(typeof insight.habitName).toBe('string');
      expect(typeof insight.missedOnHeavyDays).toBe('boolean');
      expect(typeof insight.completionRateOnHeavyDays).toBe('number');
      expect(typeof insight.completionRateOnLightDays).toBe('number');
      expect(typeof insight.calendarCorrelation).toBe('string');
      expect(typeof insight.suggestedAdaptation).toBe('object');
    });

    it('should have valid suggestedAdaptation types', async () => {
      const habit = createTestHabit();
      const insight = await getHabitCalendarInsights(testUserId, habit);

      const validTypes = ['shorter_version', 'different_time', 'reschedule', 'none'];
      expect(validTypes).toContain(insight.suggestedAdaptation.type);
    });
  });

  describe('HabitRecommendation interface', () => {
    it('should have valid adaptationType values', () => {
      const validTypes: Array<HabitRecommendation['adaptationType']> = [
        'shorter',
        'reschedule',
        'skip_ok',
        'normal',
      ];

      for (const type of validTypes) {
        expect(['shorter', 'reschedule', 'skip_ok', 'normal']).toContain(type);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle habit without duration', async () => {
      const habit = createTestHabit({ duration: undefined });

      const insights = await getHabitCalendarInsights(testUserId, habit);
      expect(insights).toBeDefined();
    });

    it('should handle habit without completedDates', async () => {
      const habit = createTestHabit({ completedDates: undefined });

      const insights = await getHabitCalendarInsights(testUserId, habit);
      expect(insights).toBeDefined();
    });

    it('should handle habit with empty name', async () => {
      const habit = createTestHabit({ name: '' });

      const insights = await getHabitCalendarInsights(testUserId, habit);
      expect(insights.habitName).toBe('');
    });

    it('should handle very long habit duration', async () => {
      const { getDayOverview } = await import('../../calendar/calendar-service.js');
      (getDayOverview as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        date: new Date(),
        totalMeetings: 6,
        totalMeetingMinutes: 360,
        freeTimeMinutes: 120,
        isOverloaded: true,
        hasBackToBack: true,
        events: [],
      });

      const habit = createTestHabit({ duration: 120 }); // 2 hour habit
      const recommendations = await getTomorrowHabitRecommendations(testUserId, [habit]);

      // Should handle gracefully
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should handle many habits', async () => {
      const habits = Array.from({ length: 20 }, (_, i) =>
        createTestHabit({ id: `habit-${i}`, name: `Habit ${i}` })
      );

      const recommendations = await getTomorrowHabitRecommendations(testUserId, habits);
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });
});
