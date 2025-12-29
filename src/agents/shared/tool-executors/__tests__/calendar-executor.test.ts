/**
 * Calendar Executor Tests
 *
 * Tests for calendar tools: getCalendarToday, getSchedule, createCalendarEvent,
 * scheduleEvent, sendMeetingInvite, getUpcomingAppointments, checkAvailability.
 * Covers alias resolution and Google Calendar integration.
 *
 * @module agents/shared/tool-executors/__tests__/calendar-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calendarExecutor } from '../calendar-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock calendar service
vi.mock('../../../../services/calendar/calendar-service.js', () => ({
  getEventsForDay: vi.fn().mockResolvedValue([]),
  getEventsForWeek: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn().mockResolvedValue({ id: 'event-123' }),
  isTimeSlotAvailable: vi.fn().mockResolvedValue(true),
}));

describe('CalendarExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(calendarExecutor.domain).toBe('calendar');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'getcalendartoday',
        'getschedule',
        'createcalendarevent',
        'scheduleevent',
        'sendmeetinginvite',
        'getupcomingappointments',
        'checkavailability',
        'getcalendar',
        'getevents',
      ];

      for (const tool of expectedTools) {
        expect(calendarExecutor.handles).toContain(tool);
      }
    });
  });

  describe('tool alias resolution', () => {
    it('should resolve getCalendar to getCalendarToday', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute('getCalendar', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve getEvents to getCalendarToday', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute('getEvents', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await calendarExecutor.execute('GETCALENDAR', {}, ctx);
      const result2 = await calendarExecutor.execute('GetCalendar', {}, ctx);
      const result3 = await calendarExecutor.execute('getcalendar', {}, ctx);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe('getCalendarToday', () => {
    it('should return calendar clear message when no events', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute('getCalendarToday', {}, ctx);

      expect(result).toContain('clear');
    });

    it('should prompt to connect calendar without userId', async () => {
      const ctx = createContext({ userId: undefined });
      const result = await calendarExecutor.execute('getCalendarToday', {}, ctx);

      expect(result).toContain('connect');
    });

    it('should format events when available', async () => {
      const { getEventsForDay } = await import('../../../../services/calendar/calendar-service.js');
      (getEventsForDay as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 'event-1',
          title: 'Team standup',
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T09:30:00'),
          isAllDay: false,
        },
        {
          id: 'event-2',
          title: 'Lunch',
          startTime: new Date('2024-01-15T12:00:00'),
          endTime: new Date('2024-01-15T13:00:00'),
          isAllDay: false,
        },
      ]);

      const ctx = createContext();
      const result = await calendarExecutor.execute('getCalendarToday', {}, ctx);

      expect(result).toContain('Team standup');
      expect(result).toContain('Lunch');
    });
  });

  describe('createCalendarEvent', () => {
    it('should create an event with title', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute(
        'createCalendarEvent',
        { title: 'Doctor appointment' },
        ctx
      );

      expect(result).toContain('Doctor appointment');
    });

    it('should prompt for title if missing', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute('createCalendarEvent', {}, ctx);

      expect(result).toContain('schedule');
    });

    it('should handle date and time', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute(
        'createCalendarEvent',
        {
          title: 'Meeting',
          date: '2024-01-20',
          time: '14:00',
        },
        ctx
      );

      expect(result).toContain('Meeting');
      expect(result).toContain('2024-01-20');
    });

    it('should work with scheduleEvent alias', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute('scheduleEvent', { title: 'Team lunch' }, ctx);

      expect(result).toContain('Team lunch');
    });
  });

  describe('sendMeetingInvite', () => {
    it('should acknowledge meeting invite request', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute(
        'sendMeetingInvite',
        {
          title: 'Project sync',
          attendees: ['john@example.com'],
          time: '3pm',
        },
        ctx
      );

      expect(result).toContain('Project sync');
    });

    it('should prompt for title if missing', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute('sendMeetingInvite', {}, ctx);

      expect(result).toContain('meeting');
    });

    it('should handle array of attendees', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute(
        'sendMeetingInvite',
        {
          title: 'Team meeting',
          attendees: ['alice@example.com', 'bob@example.com'],
        },
        ctx
      );

      expect(result).toContain('Team meeting');
    });
  });

  describe('getUpcomingAppointments', () => {
    it('should return upcoming appointments', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute('getUpcomingAppointments', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should accept days parameter', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute('getUpcomingAppointments', { days: 14 }, ctx);

      expect(result).toBeDefined();
    });

    it('should prompt to connect calendar without userId', async () => {
      const ctx = createContext({ userId: undefined });
      const result = await calendarExecutor.execute('getUpcomingAppointments', {}, ctx);

      expect(result).toContain('Connect');
    });
  });

  describe('checkAvailability', () => {
    it('should check availability for a time slot', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute(
        'checkAvailability',
        {
          date: '2024-01-20',
          time: '14:00',
        },
        ctx
      );

      expect(result).toContain('free');
    });

    it('should indicate when busy', async () => {
      const { isTimeSlotAvailable } =
        await import('../../../../services/calendar/calendar-service.js');
      (isTimeSlotAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const ctx = createContext();
      const result = await calendarExecutor.execute(
        'checkAvailability',
        {
          date: '2024-01-20',
          time: '14:00',
        },
        ctx
      );

      expect(result).toContain('busy');
    });

    it('should prompt to connect calendar without userId', async () => {
      const ctx = createContext({ userId: undefined });
      const result = await calendarExecutor.execute('checkAvailability', {}, ctx);

      expect(result).toContain('Connect');
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await calendarExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['playMusic', 'addTask', 'handoffToMaya'];

      for (const tool of otherDomainTools) {
        const result = await calendarExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });
});
