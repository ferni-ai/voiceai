/**
 * Proactive Calendar Intelligence Tests
 *
 * Tests for pre-meeting briefings, post-meeting follow-ups,
 * and smart recurring event suggestions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getUpcomingBriefings,
  getPostMeetingFollowUps,
  analyzeConflicts,
  suggestRecurringEvents,
  findBestTimeFor,
  type PreMeetingBriefing,
  type PostMeetingFollowUp,
  type ConflictAnalysis,
  type RecurringSuggestion,
} from '../proactive-calendar.js';
import * as calendarService from '../calendar-service.js';
import * as calendarIntelligence from '../calendar-intelligence.js';
import type { CalendarEvent, TimeSlot } from '../calendar-service.js';

// Mock calendar service
vi.mock('../calendar-service.js', () => ({
  getEventsForDay: vi.fn(),
  getDayOverview: vi.fn(),
  getWeekOverview: vi.fn(),
  findFreeTimeSlots: vi.fn(),
}));

// Mock calendar intelligence
vi.mock('../calendar-intelligence.js', () => ({
  detectCalendarAlerts: vi.fn(),
  analyzeCalendarPatterns: vi.fn(),
}));

describe('Proactive Calendar Intelligence', () => {
  const testUserId = 'test-user-123';
  const now = new Date('2025-03-17T10:00:00');

  // Mock meeting starting in 30 minutes
  const upcomingMeeting: CalendarEvent = {
    id: 'meeting-123',
    title: 'Project Review with Sarah',
    startTime: new Date('2025-03-17T10:30:00'),
    endTime: new Date('2025-03-17T11:30:00'),
    description: 'Review Q1 progress and plan Q2',
    isAllDay: false,
    attendees: ['sarah@example.com', 'john@example.com'],
    location: 'Conference Room A',
    status: 'confirmed' as const,
    calendarId: 'primary',
  };

  // Mock meeting that just ended
  const recentlyEndedMeeting: CalendarEvent = {
    id: 'meeting-456',
    title: '1:1 with Manager',
    startTime: new Date('2025-03-17T09:00:00'),
    endTime: new Date('2025-03-17T09:30:00'),
    description: 'Weekly sync',
    isAllDay: false,
    attendees: ['manager@example.com'],
    status: 'confirmed' as const,
    calendarId: 'primary',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getUpcomingBriefings', () => {
    it('should return briefings for upcoming meetings', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([upcomingMeeting]);

      const briefings = await getUpcomingBriefings(testUserId, 60);

      expect(briefings.length).toBe(1);
      expect(briefings[0].eventTitle).toBe('Project Review with Sarah');
      expect(briefings[0].minutesUntil).toBe(30);
    });

    it('should include prep tips in briefings', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([upcomingMeeting]);

      const briefings = await getUpcomingBriefings(testUserId, 60);

      expect(briefings[0].briefing.prepTips.length).toBeGreaterThan(0);
    });

    it('should not include meetings outside the window', async () => {
      const laterMeeting: CalendarEvent = {
        ...upcomingMeeting,
        startTime: new Date('2025-03-17T14:00:00'),
        endTime: new Date('2025-03-17T15:00:00'),
      };

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([laterMeeting]);

      const briefings = await getUpcomingBriefings(testUserId, 60);

      expect(briefings.length).toBe(0);
    });

    it('should calculate priority based on meeting type', async () => {
      const interviewMeeting: CalendarEvent = {
        ...upcomingMeeting,
        title: 'Interview with Candidate',
      };

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([interviewMeeting]);

      const briefings = await getUpcomingBriefings(testUserId, 60);

      expect(briefings[0].priority).toBe('high');
    });

    it('should return empty array when no upcoming meetings', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([]);

      const briefings = await getUpcomingBriefings(testUserId, 60);

      expect(briefings).toEqual([]);
    });
  });

  describe('getPostMeetingFollowUps', () => {
    it('should return follow-ups for recently ended meetings', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([recentlyEndedMeeting]);

      const followUps = await getPostMeetingFollowUps(testUserId, 60);

      expect(followUps.length).toBe(1);
      expect(followUps[0].eventTitle).toBe('1:1 with Manager');
    });

    it('should include prompts in follow-ups', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([recentlyEndedMeeting]);

      const followUps = await getPostMeetingFollowUps(testUserId, 60);

      expect(followUps[0].prompts.length).toBeGreaterThan(0);
      expect(followUps[0].prompts[0]).toContain('?');
    });

    it('should include suggested actions', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([recentlyEndedMeeting]);

      const followUps = await getPostMeetingFollowUps(testUserId, 60);

      expect(followUps[0].suggestedActions.length).toBeGreaterThan(0);
    });

    it('should not include low priority meetings', async () => {
      const lowPriorityMeeting: CalendarEvent = {
        ...recentlyEndedMeeting,
        title: 'Coffee break',
      };

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([lowPriorityMeeting]);

      const followUps = await getPostMeetingFollowUps(testUserId, 60);

      expect(followUps.length).toBe(0);
    });

    it('should return empty array when no recently ended meetings', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([]);

      const followUps = await getPostMeetingFollowUps(testUserId, 60);

      expect(followUps).toEqual([]);
    });
  });

  describe('analyzeConflicts', () => {
    it('should detect conflicts with existing events', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([upcomingMeeting]);
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2025-03-17T12:00:00'),
          end: new Date('2025-03-17T13:00:00'),
          durationMinutes: 60,
        },
      ]);

      const proposedStart = new Date('2025-03-17T10:30:00');
      const proposedEnd = new Date('2025-03-17T11:30:00');

      const result = await analyzeConflicts(testUserId, proposedStart, proposedEnd);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingEvents.length).toBe(1);
      expect(result.description).toContain('Project Review');
    });

    it('should suggest alternatives when conflicts detected', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([upcomingMeeting]);
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2025-03-17T12:00:00'),
          end: new Date('2025-03-17T13:00:00'),
          durationMinutes: 60,
        },
        {
          start: new Date('2025-03-17T14:00:00'),
          end: new Date('2025-03-17T15:00:00'),
          durationMinutes: 60,
        },
      ]);

      const proposedStart = new Date('2025-03-17T10:30:00');
      const proposedEnd = new Date('2025-03-17T11:30:00');

      const result = await analyzeConflicts(testUserId, proposedStart, proposedEnd);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0].alternativeTime).toBeDefined();
    });

    it('should return no conflict when time is free', async () => {
      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([upcomingMeeting]);

      const proposedStart = new Date('2025-03-17T14:00:00');
      const proposedEnd = new Date('2025-03-17T15:00:00');

      const result = await analyzeConflicts(testUserId, proposedStart, proposedEnd);

      expect(result.hasConflict).toBe(false);
      expect(result.conflictingEvents.length).toBe(0);
    });

    it('should determine severity based on conflicting events', async () => {
      const importantMeeting: CalendarEvent = {
        ...upcomingMeeting,
        title: 'Client Presentation',
        status: 'confirmed',
      };

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue([importantMeeting]);
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([]);

      const proposedStart = new Date('2025-03-17T10:30:00');
      const proposedEnd = new Date('2025-03-17T11:30:00');

      const result = await analyzeConflicts(testUserId, proposedStart, proposedEnd);

      expect(result.severity).toBe('hard');
    });
  });

  describe('suggestRecurringEvents', () => {
    it('should suggest focus time block for busy days', async () => {
      vi.mocked(calendarIntelligence.analyzeCalendarPatterns).mockResolvedValue({
        averageMeetingsPerDay: 5,
        busiestDayOfWeek: 'Monday',
        peakMeetingHours: { start: 10, end: 14 },
        backToBackFrequency: 0.5,
      } as ReturnType<typeof calendarIntelligence.analyzeCalendarPatterns> extends Promise<infer T>
        ? T
        : never);

      const suggestions = await suggestRecurringEvents(testUserId);

      expect(suggestions.length).toBeGreaterThan(0);
      const focusBlockSuggestion = suggestions.find((s) => s.title.toLowerCase().includes('focus'));
      expect(focusBlockSuggestion).toBeDefined();
    });

    it('should suggest daily planning for high meeting frequency', async () => {
      vi.mocked(calendarIntelligence.analyzeCalendarPatterns).mockResolvedValue({
        averageMeetingsPerDay: 3,
        busiestDayOfWeek: 'Tuesday',
        peakMeetingHours: { start: 9, end: 12 },
        backToBackFrequency: 0.2,
      } as ReturnType<typeof calendarIntelligence.analyzeCalendarPatterns> extends Promise<infer T>
        ? T
        : never);

      const suggestions = await suggestRecurringEvents(testUserId);

      const planningsSuggestion = suggestions.find((s) =>
        s.title.toLowerCase().includes('planning')
      );
      expect(planningsSuggestion).toBeDefined();
    });

    it('should suggest buffer time for frequent back-to-backs', async () => {
      vi.mocked(calendarIntelligence.analyzeCalendarPatterns).mockResolvedValue({
        averageMeetingsPerDay: 2,
        busiestDayOfWeek: 'Wednesday',
        peakMeetingHours: { start: 10, end: 14 },
        backToBackFrequency: 0.5,
      } as ReturnType<typeof calendarIntelligence.analyzeCalendarPatterns> extends Promise<infer T>
        ? T
        : never);

      const suggestions = await suggestRecurringEvents(testUserId);

      const bufferSuggestion = suggestions.find((s) => s.title.toLowerCase().includes('buffer'));
      expect(bufferSuggestion).toBeDefined();
    });

    it('should return empty array when no patterns detected', async () => {
      vi.mocked(calendarIntelligence.analyzeCalendarPatterns).mockResolvedValue({
        averageMeetingsPerDay: 0.5,
        busiestDayOfWeek: null,
        peakMeetingHours: { start: 0, end: 0 },
        backToBackFrequency: 0,
      } as ReturnType<typeof calendarIntelligence.analyzeCalendarPatterns> extends Promise<infer T>
        ? T
        : never);

      const suggestions = await suggestRecurringEvents(testUserId);

      expect(suggestions).toEqual([]);
    });
  });

  describe('findBestTimeFor', () => {
    it('should return scored time slots', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2025-03-17T10:00:00'),
          end: new Date('2025-03-17T11:00:00'),
          durationMinutes: 60,
        },
        {
          start: new Date('2025-03-17T14:00:00'),
          end: new Date('2025-03-17T15:00:00'),
          durationMinutes: 60,
        },
      ]);

      const results = await findBestTimeFor(testUserId, 60);

      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.time).toBeDefined();
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
        expect(r.reasoning).toBeDefined();
      });
    });

    it('should prefer morning when requested', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2025-03-17T10:00:00'),
          end: new Date('2025-03-17T11:00:00'),
          durationMinutes: 60,
        },
        {
          start: new Date('2025-03-17T15:00:00'),
          end: new Date('2025-03-17T16:00:00'),
          durationMinutes: 60,
        },
      ]);

      const results = await findBestTimeFor(testUserId, 60, { preferMorning: true });

      // First result should be morning slot with higher score
      expect(results[0].time.getHours()).toBeLessThanOrEqual(12);
    });

    it('should prefer afternoon when requested', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date('2025-03-17T10:00:00'),
          end: new Date('2025-03-17T11:00:00'),
          durationMinutes: 60,
        },
        {
          start: new Date('2025-03-17T14:00:00'),
          end: new Date('2025-03-17T15:00:00'),
          durationMinutes: 60,
        },
      ]);

      const results = await findBestTimeFor(testUserId, 60, { preferAfternoon: true });

      // First result should be afternoon slot with higher score
      expect(results[0].time.getHours()).toBeGreaterThanOrEqual(13);
    });

    it('should return empty array when no free slots', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([]);

      const results = await findBestTimeFor(testUserId, 60);

      expect(results).toEqual([]);
    });
  });
});
