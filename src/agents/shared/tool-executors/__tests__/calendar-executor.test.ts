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

import {
  NOT_CONNECTED_READ,
  notConnectedCreate,
} from '../../../../services/calendar/not-connected-copy.js';

// Mock calendar service
vi.mock('../../../../services/calendar/calendar-service.js', () => ({
  getEventsForDay: vi.fn().mockResolvedValue([]),
  getEventsForWeek: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn().mockResolvedValue({ id: 'event-123' }),
  isTimeSlotAvailable: vi.fn().mockResolvedValue(true),
  isConnected: vi.fn().mockResolvedValue(true),
}));

// The chat executor asks the unified store whether any provider is connected (same check as the tools).

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

  describe('with no Google Calendar connected (#1547)', () => {
    it('getCalendarToday says no calendar is connected and reads nothing', async () => {
      const { getEventsForDay } = await import(
        '../../../../services/calendar/calendar-service.js'
      );
      const { isConnected } = await import(
        '../../../../services/calendar/calendar-service.js'
      );
      (isConnected as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const result = await calendarExecutor.execute('getCalendarToday', {}, createContext());

      expect(result).toBe(NOT_CONNECTED_READ);
    });

    it('getUpcomingAppointments and checkAvailability say no calendar is connected', async () => {
      const { getEventsForWeek, isTimeSlotAvailable } = await import(
        '../../../../services/calendar/calendar-service.js'
      );
      const { isConnected } = await import(
        '../../../../services/calendar/calendar-service.js'
      );
      (isConnected as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

      const upcoming = await calendarExecutor.execute('getUpcomingAppointments', {}, createContext());
      const free = await calendarExecutor.execute(
        'checkAvailability',
        { date: '2026-10-18', time: '12:00' },
        createContext()
      );

      expect(upcoming).toBe(NOT_CONNECTED_READ);
      expect(free).toBe(NOT_CONNECTED_READ);
      expect(getEventsForWeek).not.toHaveBeenCalled();
      expect(isTimeSlotAvailable).not.toHaveBeenCalled();
    });

    it('createCalendarEvent says nothing went to a calendar and names Ferni\'s own list', async () => {
      const { isConnected } = await import(
        '../../../../services/calendar/calendar-service.js'
      );
      (isConnected as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const result = await calendarExecutor.execute(
        'createCalendarEvent',
        { title: 'Lunch with Sam', date: '2026-10-18', time: '12:00' },
        createContext()
      );

      expect(result).toBe(notConnectedCreate('Lunch with Sam, 2026-10-18, 12:00'));
      expect(result).toMatch(/isn't on your calendar/);
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
