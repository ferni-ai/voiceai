/**
 * Ambient Calendar Awareness Tests
 *
 * Tests for the "Better Than Human" ambient calendar awareness service
 * that provides real-time awareness of calendar context during conversations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../calendar-service.js', () => ({
  getEventsForDay: vi.fn(),
  getDayOverview: vi.fn(),
  isConnected: vi.fn(),
}));

// Import after mocks
import {
  getAmbientCalendarContext,
  generateAmbientContextInjection,
  generateAmbientSummaryForUser,
  shouldInterruptForCalendar,
  type AmbientCalendarContext,
} from '../ambient-calendar-awareness.js';
import * as calendarService from '../calendar-service.js';

describe('Ambient Calendar Awareness', () => {
  const mockUserId = 'test-user-123';

  // Helper to create mock events (with all required CalendarEvent properties)
  const createMockEvent = (
    overrides: Partial<{
      id: string;
      title: string;
      startTime: Date;
      endTime: Date;
      isAllDay: boolean;
      description: string;
    }> = {}
  ) => ({
    id: overrides.id || 'event-1',
    userId: mockUserId,
    title: overrides.title || 'Test Meeting',
    startTime: overrides.startTime || new Date(),
    endTime: overrides.endTime || new Date(Date.now() + 60 * 60 * 1000),
    isAllDay: overrides.isAllDay || false,
    description: overrides.description || '',
    location: '',
    attendees: [] as string[],
    status: 'confirmed' as const,
    calendarId: 'primary',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Set current time to 10:00 AM on a weekday
    vi.setSystemTime(new Date('2024-12-20T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getAmbientCalendarContext', () => {
    it('should return empty context when calendar not connected', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(false);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.isCalendarConnected).toBe(false);
      expect(result.nextMeeting.event).toBeNull();
      expect(result.justEndedMeeting.event).toBeNull();
      expect(result.currentlyInMeeting).toBe(false);
    });

    it('should detect upcoming meeting within warning window', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const meetingStart = new Date(now.getTime() + 8 * 60 * 1000); // 8 minutes from now
      const meetingEnd = new Date(meetingStart.getTime() + 60 * 60 * 1000);

      const mockEvents = [
        createMockEvent({
          title: 'Upcoming Meeting',
          startTime: meetingStart,
          endTime: meetingEnd,
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.isCalendarConnected).toBe(true);
      expect(result.nextMeeting.event).not.toBeNull();
      expect(result.nextMeeting.event?.title).toBe('Upcoming Meeting');
      expect(result.nextMeeting.minutesUntil).toBe(8);
      expect(result.nextMeeting.shouldWarnUser).toBe(true); // Within 10 min threshold
    });

    it('should detect meeting that just ended', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const meetingStart = new Date(now.getTime() - 60 * 60 * 1000); // Started 1 hour ago
      const meetingEnd = new Date(now.getTime() - 5 * 60 * 1000); // Ended 5 min ago

      const mockEvents = [
        createMockEvent({
          title: 'Just Ended Interview',
          startTime: meetingStart,
          endTime: meetingEnd,
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.justEndedMeeting.event).not.toBeNull();
      expect(result.justEndedMeeting.event?.title).toBe('Just Ended Interview');
      expect(result.justEndedMeeting.minutesSince).toBe(5);
      expect(result.justEndedMeeting.followUpPrompt).toBe('How did the interview go?');
    });

    it('should detect current meeting in progress', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const meetingStart = new Date(now.getTime() - 30 * 60 * 1000); // Started 30 min ago
      const meetingEnd = new Date(now.getTime() + 30 * 60 * 1000); // Ends in 30 min

      const mockEvents = [
        createMockEvent({
          title: 'Current Meeting',
          startTime: meetingStart,
          endTime: meetingEnd,
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.currentlyInMeeting).toBe(true);
      expect(result.currentMeeting?.title).toBe('Current Meeting');
    });

    it('should calculate remaining meetings today', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const mockEvents = [
        createMockEvent({
          id: 'event-1',
          title: 'Meeting 1',
          startTime: new Date(now.getTime() + 60 * 60 * 1000),
          endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        }),
        createMockEvent({
          id: 'event-2',
          title: 'Meeting 2',
          startTime: new Date(now.getTime() + 3 * 60 * 60 * 1000),
          endTime: new Date(now.getTime() + 4 * 60 * 60 * 1000),
        }),
        createMockEvent({
          id: 'event-3',
          title: 'Meeting 3',
          startTime: new Date(now.getTime() + 5 * 60 * 60 * 1000),
          endTime: new Date(now.getTime() + 6 * 60 * 60 * 1000),
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.remainingMeetingsToday).toBe(3);
      expect(result.totalRemainingMeetingMinutes).toBe(180); // 3 hours
    });

    it('should exclude all-day events from timed calculations', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const mockEvents = [
        createMockEvent({
          id: 'all-day',
          title: 'All Day Event',
          isAllDay: true,
        }),
        createMockEvent({
          id: 'timed',
          title: 'Timed Meeting',
          startTime: new Date(now.getTime() + 60 * 60 * 1000),
          endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      // Should only count timed meeting
      expect(result.remainingMeetingsToday).toBe(1);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);
      vi.mocked(calendarService.getEventsForDay).mockRejectedValue(new Error('API Error'));

      const result = await getAmbientCalendarContext(mockUserId);

      // isCalendarConnected is set before the error (from isConnected check)
      // so it remains true even on API error
      expect(result.isCalendarConnected).toBe(true);
      // But other fields should be empty/default
      expect(result.nextMeeting.event).toBeNull();
      expect(result.currentlyInMeeting).toBe(false);
    });
  });

  describe('generateAmbientContextInjection', () => {
    it('should return null when calendar not connected', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: false,
        nextMeeting: {
          event: null,
          minutesUntil: null,
          shouldWarnUser: false,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 0,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 0,
      };

      const result = generateAmbientContextInjection(context);

      expect(result).toBeNull();
    });

    it('should generate urgent warning for meeting in 2 minutes', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: createMockEvent({ title: 'Important Call' }),
          minutesUntil: 2,
          shouldWarnUser: true,
          wrapUpSuggestion: 'Wrap up now',
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 1,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 60,
      };

      const result = generateAmbientContextInjection(context);

      expect(result).toContain('STARTING IN 2 MINUTES');
      expect(result).toContain('Wrap up NOW');
    });

    it('should generate context for meeting in 5 minutes', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: createMockEvent({ title: 'Team Sync' }),
          minutesUntil: 5,
          shouldWarnUser: true,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 1,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 60,
      };

      const result = generateAmbientContextInjection(context);

      expect(result).toContain('in 5 minutes');
      expect(result).toContain('Be concise');
    });

    it('should note when user is currently in a meeting', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: null,
          minutesUntil: null,
          shouldWarnUser: false,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: true,
        currentMeeting: createMockEvent({ title: 'Board Meeting' }),
        remainingMeetingsToday: 0,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 0,
      };

      const result = generateAmbientContextInjection(context);

      expect(result).toContain('currently in "Board Meeting"');
      expect(result).toContain('extra concise');
    });

    it('should suggest follow-up for high priority meeting that just ended', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: null,
          minutesUntil: null,
          shouldWarnUser: false,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: {
          event: createMockEvent({ title: 'Client Presentation' }),
          minutesSince: 5,
          followUpPrompt: 'How did your presentation go?',
        },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 0,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 0,
      };

      const result = generateAmbientContextInjection(context);

      expect(result).toContain('just finished "Client Presentation"');
      expect(result).toContain('How did your presentation go?');
    });

    it('should warn about heavy remaining day', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: null,
          minutesUntil: null,
          shouldWarnUser: false,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 5,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 240, // 4 hours
      };

      const result = generateAmbientContextInjection(context);

      expect(result).toContain('5 more meetings');
      expect(result).toContain('4h');
      expect(result).toContain('energy');
    });
  });

  describe('generateAmbientSummaryForUser', () => {
    it('should return null when calendar not connected', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: false,
        nextMeeting: {
          event: null,
          minutesUntil: null,
          shouldWarnUser: false,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 0,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 0,
      };

      const result = generateAmbientSummaryForUser(context);

      expect(result).toBeNull();
    });

    it('should return summary for imminent meeting', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: createMockEvent({ title: 'Quick Sync' }),
          minutesUntil: 3,
          shouldWarnUser: true,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 1,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 30,
      };

      const result = generateAmbientSummaryForUser(context);

      expect(result).toContain('Quick Sync');
      expect(result).toContain('3 minutes');
    });

    it('should return null when no imminent meeting', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: createMockEvent({ title: 'Later Meeting' }),
          minutesUntil: 60,
          shouldWarnUser: false,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 1,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 60,
      };

      const result = generateAmbientSummaryForUser(context);

      expect(result).toBeNull();
    });
  });

  describe('shouldInterruptForCalendar', () => {
    it('should return true for meeting in 3 minutes or less', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: createMockEvent({ title: 'Urgent' }),
          minutesUntil: 2,
          shouldWarnUser: true,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 1,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 60,
      };

      expect(shouldInterruptForCalendar(context)).toBe(true);
    });

    it('should return false for meeting more than 3 minutes away', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: createMockEvent({ title: 'Not Urgent' }),
          minutesUntil: 5,
          shouldWarnUser: true,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 1,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 60,
      };

      expect(shouldInterruptForCalendar(context)).toBe(false);
    });

    it('should return false when no warning needed', () => {
      const context: AmbientCalendarContext = {
        isCalendarConnected: true,
        nextMeeting: {
          event: createMockEvent({ title: 'Later' }),
          minutesUntil: 60,
          shouldWarnUser: false,
          wrapUpSuggestion: null,
        },
        justEndedMeeting: { event: null, minutesSince: null, followUpPrompt: null },
        currentlyInMeeting: false,
        currentMeeting: null,
        remainingMeetingsToday: 1,
        nextBreakDuration: null,
        totalRemainingMeetingMinutes: 60,
      };

      expect(shouldInterruptForCalendar(context)).toBe(false);
    });
  });

  describe('Follow-up prompt generation', () => {
    it('should generate interview follow-up prompt', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const mockEvents = [
        createMockEvent({
          title: 'Job Interview with Google',
          startTime: new Date(now.getTime() - 60 * 60 * 1000),
          endTime: new Date(now.getTime() - 5 * 60 * 1000),
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.justEndedMeeting.followUpPrompt).toBe('How did the interview go?');
    });

    it('should generate presentation follow-up prompt', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const mockEvents = [
        createMockEvent({
          title: 'Quarterly Presentation',
          startTime: new Date(now.getTime() - 60 * 60 * 1000),
          endTime: new Date(now.getTime() - 5 * 60 * 1000),
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.justEndedMeeting.followUpPrompt).toBe('How did your presentation go?');
    });

    it('should generate 1:1 follow-up prompt', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const mockEvents = [
        createMockEvent({
          title: '1:1 with Manager',
          startTime: new Date(now.getTime() - 60 * 60 * 1000),
          endTime: new Date(now.getTime() - 5 * 60 * 1000),
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.justEndedMeeting.followUpPrompt).toBe('How was your 1:1?');
    });

    it('should generate client meeting follow-up prompt', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const mockEvents = [
        createMockEvent({
          title: 'Client Kickoff Call',
          startTime: new Date(now.getTime() - 60 * 60 * 1000),
          endTime: new Date(now.getTime() - 5 * 60 * 1000),
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.justEndedMeeting.followUpPrompt).toBe('How did the client meeting go?');
    });
  });

  describe('Wrap-up suggestion generation', () => {
    it('should generate interview wrap-up suggestion', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const mockEvents = [
        createMockEvent({
          title: 'Interview with Candidate',
          startTime: new Date(now.getTime() + 4 * 60 * 1000), // 4 min from now
          endTime: new Date(now.getTime() + 64 * 60 * 1000),
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      expect(result.nextMeeting.wrapUpSuggestion).toContain('interview');
      expect(result.nextMeeting.wrapUpSuggestion).toContain('Good luck');
    });

    it('should generate presentation wrap-up suggestion', async () => {
      vi.mocked(calendarService.isConnected).mockResolvedValue(true);

      const now = new Date();
      const mockEvents = [
        createMockEvent({
          title: 'Product Demo',
          startTime: new Date(now.getTime() + 3 * 60 * 1000),
          endTime: new Date(now.getTime() + 33 * 60 * 1000),
        }),
      ];

      vi.mocked(calendarService.getEventsForDay).mockResolvedValue(mockEvents);

      const result = await getAmbientCalendarContext(mockUserId);

      // "demo" matches the presentation/demo pattern which returns the presentation message
      expect(result.nextMeeting.wrapUpSuggestion).toContain('presentation');
      expect(result.nextMeeting.wrapUpSuggestion).toContain('center yourself');
    });
  });
});
