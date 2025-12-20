/**
 * Calendar Intelligence Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../calendar-service.js', () => ({
  getEventsForDay: vi.fn(),
  getEventsForWeek: vi.fn(),
  getDayOverview: vi.fn(),
  getWeekOverview: vi.fn(),
  findFreeTimeSlots: vi.fn(),
}));

// Import after mocks
import {
  detectCalendarAlerts,
  suggestMeetingTimes,
  suggestFocusBlocks,
  generateDailyBriefing,
  analyzeCalendarPatterns,
} from '../calendar-intelligence.js';
import * as calendarService from '../calendar-service.js';

describe('Calendar Intelligence', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    // Use fake timers for consistent date testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-12-20T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('detectCalendarAlerts', () => {
    it('should detect overloaded days', async () => {
      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [],
        totalMeetings: 8,
        totalMeetingMinutes: 420, // 7 hours
        freeTimeMinutes: 60,
        isOverloaded: true,
        hasBackToBack: false,
      });

      const alerts = await detectCalendarAlerts(mockUserId, {
        start: new Date('2024-12-20'),
        end: new Date('2024-12-20'),
      });

      expect(alerts.some((a) => a.type === 'overload')).toBe(true);
      expect(alerts.find((a) => a.type === 'overload')?.severity).toBe('concern');
    });

    it('should detect back-to-back meetings', async () => {
      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [],
        totalMeetings: 4,
        totalMeetingMinutes: 240,
        freeTimeMinutes: 60,
        isOverloaded: false,
        hasBackToBack: true,
      });

      const alerts = await detectCalendarAlerts(mockUserId, {
        start: new Date('2024-12-20'),
        end: new Date('2024-12-20'),
      });

      expect(alerts.some((a) => a.type === 'back_to_back')).toBe(true);
      expect(alerts.find((a) => a.type === 'back_to_back')?.severity).toBe('warning');
    });

    it('should detect early morning meetings', async () => {
      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [],
        totalMeetings: 1,
        totalMeetingMinutes: 60,
        freeTimeMinutes: 420,
        isOverloaded: false,
        hasBackToBack: false,
        firstEvent: {
          id: 'early-1',
          title: 'Early Bird Meeting',
          startTime: new Date('2024-12-20T07:00:00'),
          endTime: new Date('2024-12-20T08:00:00'),
          isAllDay: false,
          attendees: [],
          status: 'confirmed' as const,
          calendarId: 'primary',
        },
      });

      const alerts = await detectCalendarAlerts(mockUserId, {
        start: new Date('2024-12-20'),
        end: new Date('2024-12-20'),
      });

      expect(alerts.some((a) => a.type === 'early_meeting')).toBe(true);
    });

    it('should detect days with no focus time', async () => {
      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [],
        totalMeetings: 5,
        totalMeetingMinutes: 300,
        freeTimeMinutes: 60, // Only 1 hour free
        isOverloaded: false,
        hasBackToBack: false,
      });

      const alerts = await detectCalendarAlerts(mockUserId, {
        start: new Date('2024-12-20'),
        end: new Date('2024-12-20'),
      });

      expect(alerts.some((a) => a.type === 'no_breaks')).toBe(true);
    });

    it('should skip weekends', async () => {
      // Saturday and Sunday - weekends should be skipped
      vi.setSystemTime(new Date('2024-12-21T10:00:00'));

      // Mock returns empty overview for any call (shouldn't be called for weekends)
      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-21'),
        events: [],
        totalMeetings: 0,
        totalMeetingMinutes: 0,
        freeTimeMinutes: 540,
        isOverloaded: false,
        hasBackToBack: false,
      });

      const alerts = await detectCalendarAlerts(mockUserId, {
        start: new Date('2024-12-21'), // Saturday
        end: new Date('2024-12-22'), // Sunday
      });

      // Even if getDayOverview is called, no alerts should be generated for weekends
      // because the implementation skips weekends in the analysis loop
      expect(alerts).toHaveLength(0);
    });
  });

  describe('suggestMeetingTimes', () => {
    it('should return suggestions sorted by score', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2024-12-20T10:00:00'),
          end: new Date('2024-12-20T12:00:00'),
          durationMinutes: 120,
        },
        {
          start: new Date('2024-12-20T14:00:00'),
          end: new Date('2024-12-20T16:00:00'),
          durationMinutes: 120,
        },
      ]);

      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [],
        totalMeetings: 2,
        totalMeetingMinutes: 120,
        freeTimeMinutes: 300,
        isOverloaded: false,
        hasBackToBack: false,
      });

      const suggestions = await suggestMeetingTimes(mockUserId, {
        durationMinutes: 60,
        withinDays: 1,
      });

      expect(suggestions.length).toBeGreaterThan(0);
      // Should be sorted by score descending
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].score).toBeGreaterThanOrEqual(suggestions[i].score);
      }
    });

    it('should prefer morning when requested', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2024-12-20T09:00:00'),
          end: new Date('2024-12-20T11:00:00'),
          durationMinutes: 120,
        },
        {
          start: new Date('2024-12-20T15:00:00'),
          end: new Date('2024-12-20T17:00:00'),
          durationMinutes: 120,
        },
      ]);

      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [],
        totalMeetings: 1,
        totalMeetingMinutes: 60,
        freeTimeMinutes: 420,
        isOverloaded: false,
        hasBackToBack: false,
      });

      const suggestions = await suggestMeetingTimes(mockUserId, {
        durationMinutes: 60,
        preferMorning: true,
        withinDays: 1,
      });

      // Morning slot should have higher score
      const morningSlot = suggestions.find((s) => s.slot.start.getHours() < 12);
      const afternoonSlot = suggestions.find((s) => s.slot.start.getHours() >= 12);

      if (morningSlot && afternoonSlot) {
        expect(morningSlot.score).toBeGreaterThan(afternoonSlot.score);
      }
    });

    it('should penalize heavy days when avoiding back-to-back', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2024-12-20T10:00:00'),
          end: new Date('2024-12-20T11:00:00'),
          durationMinutes: 60,
        },
      ]);

      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [],
        totalMeetings: 6,
        totalMeetingMinutes: 360,
        freeTimeMinutes: 60,
        isOverloaded: true,
        hasBackToBack: true,
      });

      const suggestions = await suggestMeetingTimes(mockUserId, {
        durationMinutes: 60,
        avoidBackToBack: true,
        withinDays: 1,
      });

      // Score should be penalized
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].considerations).toContain('day already has back-to-back meetings');
    });
  });

  describe('suggestFocusBlocks', () => {
    it('should find focus blocks of sufficient duration', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2024-12-20T09:00:00'),
          end: new Date('2024-12-20T11:30:00'),
          durationMinutes: 150,
        },
        {
          start: new Date('2024-12-20T14:00:00'),
          end: new Date('2024-12-20T14:30:00'),
          durationMinutes: 30, // Too short
        },
      ]);

      const blocks = await suggestFocusBlocks(mockUserId, {
        minDurationMinutes: 90,
        withinDays: 1,
      });

      expect(blocks.length).toBe(1);
      expect(blocks[0].durationMinutes).toBeGreaterThanOrEqual(90);
    });

    it('should return empty array when no focus blocks available', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2024-12-20T10:00:00'),
          end: new Date('2024-12-20T10:30:00'),
          durationMinutes: 30,
        },
      ]);

      const blocks = await suggestFocusBlocks(mockUserId, {
        minDurationMinutes: 120,
        withinDays: 1,
      });

      expect(blocks).toHaveLength(0);
    });
  });

  describe('generateDailyBriefing', () => {
    it('should generate briefing for clear day', async () => {
      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [],
        totalMeetings: 0,
        totalMeetingMinutes: 0,
        freeTimeMinutes: 540,
        isOverloaded: false,
        hasBackToBack: false,
      });

      const briefing = await generateDailyBriefing(mockUserId);

      expect(briefing.totalMeetings).toBe(0);
      expect(briefing.summary.toLowerCase()).toContain('clear');
      expect(briefing.suggestions.length).toBeGreaterThan(0);
    });

    it('should include alerts in briefing', async () => {
      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [],
        totalMeetings: 8,
        totalMeetingMinutes: 420,
        freeTimeMinutes: 60,
        isOverloaded: true,
        hasBackToBack: true,
      });

      const briefing = await generateDailyBriefing(mockUserId);

      expect(briefing.alerts.length).toBeGreaterThan(0);
    });

    it('should include first meeting info', async () => {
      const firstMeeting = {
        id: 'first-1',
        title: 'Morning Standup',
        startTime: new Date('2024-12-20T09:00:00'),
        endTime: new Date('2024-12-20T09:30:00'),
        isAllDay: false,
        attendees: [],
        status: 'confirmed' as const,
        calendarId: 'primary',
      };

      vi.mocked(calendarService.getDayOverview).mockResolvedValue({
        date: new Date('2024-12-20'),
        events: [firstMeeting],
        totalMeetings: 3,
        totalMeetingMinutes: 180,
        freeTimeMinutes: 300,
        isOverloaded: false,
        hasBackToBack: false,
        firstEvent: firstMeeting,
      });

      const briefing = await generateDailyBriefing(mockUserId);

      expect(briefing.firstMeeting).toBeDefined();
      expect(briefing.firstMeeting?.title).toBe('Morning Standup');
    });
  });

  describe('analyzeCalendarPatterns', () => {
    it('should analyze weekly patterns', async () => {
      // Mock 4 weeks of data
      vi.mocked(calendarService.getWeekOverview).mockResolvedValue({
        startDate: new Date('2024-12-16'),
        endDate: new Date('2024-12-22'),
        days: [
          { date: new Date('2024-12-16'), events: [], totalMeetings: 0, totalMeetingMinutes: 0, freeTimeMinutes: 540, isOverloaded: false, hasBackToBack: false },
          { date: new Date('2024-12-17'), events: [], totalMeetings: 5, totalMeetingMinutes: 300, freeTimeMinutes: 240, isOverloaded: false, hasBackToBack: true },
          { date: new Date('2024-12-18'), events: [], totalMeetings: 3, totalMeetingMinutes: 180, freeTimeMinutes: 360, isOverloaded: false, hasBackToBack: false },
          { date: new Date('2024-12-19'), events: [], totalMeetings: 4, totalMeetingMinutes: 240, freeTimeMinutes: 300, isOverloaded: false, hasBackToBack: false },
          { date: new Date('2024-12-20'), events: [], totalMeetings: 6, totalMeetingMinutes: 360, freeTimeMinutes: 180, isOverloaded: false, hasBackToBack: true },
          { date: new Date('2024-12-21'), events: [], totalMeetings: 0, totalMeetingMinutes: 0, freeTimeMinutes: 540, isOverloaded: false, hasBackToBack: false },
          { date: new Date('2024-12-22'), events: [], totalMeetings: 0, totalMeetingMinutes: 0, freeTimeMinutes: 540, isOverloaded: false, hasBackToBack: false },
        ],
        totalMeetings: 18,
        busiestDay: { day: 'Friday', meetings: 6 },
        lightestDay: { day: 'Monday', meetings: 0 },
        backToBackDays: ['Tuesday', 'Friday'],
        averageMeetingsPerDay: 3.6,
      });

      const patterns = await analyzeCalendarPatterns(mockUserId, 1);

      expect(patterns.busiestDayOfWeek).toBeDefined();
      expect(patterns.averageMeetingsPerDay).toBeGreaterThanOrEqual(0);
      expect(patterns.focusTimeRatio).toBeGreaterThanOrEqual(0);
      expect(patterns.focusTimeRatio).toBeLessThanOrEqual(1);
    });
  });
});

