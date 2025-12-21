/**
 * Calendar Service Tests
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

vi.mock('../../identity/google-calendar-oauth.js', () => ({
  getValidAccessToken: vi.fn(),
  getEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getFreeBusy: vi.fn(),
  isCalendarConfigured: vi.fn(),
}));

// Import after mocks
import {
  isConnected,
  isGoogleCalendarConnected,
  getCalendarMode,
  getEventsForDay,
  createEvent,
  findFreeTimeSlots,
  getDayOverview,
  formatEventForSpeech,
  type CalendarEvent,
  type CreateEventInput,
} from '../calendar-service.js';
import * as googleCalendarOAuth from '../../identity/google-calendar-oauth.js';

describe('Calendar Service', () => {
  const mockUserId = 'test-user-123';
  const mockAccessToken = 'mock-access-token';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(googleCalendarOAuth.getValidAccessToken).mockResolvedValue(mockAccessToken);
    vi.mocked(googleCalendarOAuth.isCalendarConfigured).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isConnected', () => {
    it('should return true when calendar is configured', async () => {
      vi.mocked(googleCalendarOAuth.isCalendarConfigured).mockResolvedValue(true);

      const result = await isConnected(mockUserId);

      expect(result).toBe(true);
      expect(googleCalendarOAuth.isCalendarConfigured).toHaveBeenCalledWith(mockUserId);
    });

    it('should return true even when Google not configured (local fallback)', async () => {
      vi.mocked(googleCalendarOAuth.isCalendarConfigured).mockResolvedValue(false);

      const result = await isConnected(mockUserId);

      // Now returns true because local calendar is always available
      expect(result).toBe(true);
    });
  });

  describe('isGoogleCalendarConnected', () => {
    it('should return true when Google Calendar is configured', async () => {
      vi.mocked(googleCalendarOAuth.isCalendarConfigured).mockResolvedValue(true);

      const result = await isGoogleCalendarConnected(mockUserId);

      expect(result).toBe(true);
    });

    it('should return false when Google Calendar is not configured', async () => {
      vi.mocked(googleCalendarOAuth.isCalendarConfigured).mockResolvedValue(false);

      const result = await isGoogleCalendarConnected(mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('getCalendarMode', () => {
    it('should return google when Google Calendar is configured', async () => {
      vi.mocked(googleCalendarOAuth.isCalendarConfigured).mockResolvedValue(true);

      const result = await getCalendarMode(mockUserId);

      expect(result).toBe('google');
    });

    it('should return local when Google Calendar is not configured', async () => {
      vi.mocked(googleCalendarOAuth.isCalendarConfigured).mockResolvedValue(false);

      const result = await getCalendarMode(mockUserId);

      expect(result).toBe('local');
    });
  });

  describe('getEventsForDay', () => {
    it('should return empty array when no access token', async () => {
      vi.mocked(googleCalendarOAuth.getValidAccessToken).mockResolvedValue(null);

      const result = await getEventsForDay(mockUserId);

      expect(result).toEqual([]);
    });

    it('should convert Google events to CalendarEvent format', async () => {
      const mockGoogleEvents = [
        {
          id: 'event-1',
          summary: 'Team Meeting',
          description: 'Weekly sync',
          location: 'Room A',
          start: { dateTime: '2024-12-20T10:00:00Z' },
          end: { dateTime: '2024-12-20T11:00:00Z' },
          attendees: [{ email: 'john@example.com' }],
          status: 'confirmed' as const,
        },
      ];

      vi.mocked(googleCalendarOAuth.getEvents).mockResolvedValue(mockGoogleEvents);

      const result = await getEventsForDay(mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('event-1');
      expect(result[0].title).toBe('Team Meeting');
      expect(result[0].description).toBe('Weekly sync');
      expect(result[0].location).toBe('Room A');
      expect(result[0].attendees).toEqual(['john@example.com']);
    });

    it('should handle events without titles', async () => {
      const mockGoogleEvents = [
        {
          id: 'event-1',
          summary: '', // Empty summary
          start: { dateTime: '2024-12-20T10:00:00Z' },
          end: { dateTime: '2024-12-20T11:00:00Z' },
          status: 'confirmed' as const,
        },
      ];

      vi.mocked(googleCalendarOAuth.getEvents).mockResolvedValue(mockGoogleEvents);

      const result = await getEventsForDay(mockUserId);

      expect(result[0].title).toBe('(No title)');
    });
  });

  describe('createEvent', () => {
    it('should fall back to local calendar when no access token', async () => {
      vi.mocked(googleCalendarOAuth.getValidAccessToken).mockResolvedValue(null);
      vi.mocked(googleCalendarOAuth.isCalendarConfigured).mockResolvedValue(false);

      const input: CreateEventInput = {
        title: 'Test Meeting',
        startTime: new Date(),
      };

      const result = await createEvent(mockUserId, input);

      // Now falls back to local calendar instead of returning null
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test Meeting');
      expect(result?.calendarId).toBe('local');
    });

    it('should create event with correct parameters', async () => {
      const mockCreatedEvent = {
        id: 'new-event-1',
        summary: 'Test Meeting',
        start: { dateTime: '2024-12-20T14:00:00Z' },
        end: { dateTime: '2024-12-20T15:00:00Z' },
        status: 'confirmed' as const,
      };

      vi.mocked(googleCalendarOAuth.createEvent).mockResolvedValue(mockCreatedEvent);

      const input: CreateEventInput = {
        title: 'Test Meeting',
        startTime: new Date('2024-12-20T14:00:00Z'),
        durationMinutes: 60,
      };

      const result = await createEvent(mockUserId, input);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test Meeting');
      expect(googleCalendarOAuth.createEvent).toHaveBeenCalledWith(
        mockAccessToken,
        'primary',
        expect.objectContaining({
          summary: 'Test Meeting',
        })
      );
    });
  });

  describe('findFreeTimeSlots', () => {
    it('should return full day as free when no events', async () => {
      vi.mocked(googleCalendarOAuth.getEvents).mockResolvedValue([]);

      const result = await findFreeTimeSlots(mockUserId, new Date('2024-12-20'));

      expect(result).toHaveLength(1);
      expect(result[0].durationMinutes).toBeGreaterThan(0);
    });

    it('should find gaps between events', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Morning Meeting',
          start: { dateTime: '2024-12-20T09:00:00' },
          end: { dateTime: '2024-12-20T10:00:00' },
          status: 'confirmed' as const,
        },
        {
          id: 'event-2',
          summary: 'Afternoon Meeting',
          start: { dateTime: '2024-12-20T14:00:00' },
          end: { dateTime: '2024-12-20T15:00:00' },
          status: 'confirmed' as const,
        },
      ];

      vi.mocked(googleCalendarOAuth.getEvents).mockResolvedValue(mockEvents);

      const result = await findFreeTimeSlots(mockUserId, new Date('2024-12-20'), {
        minDurationMinutes: 30,
        workDayOnly: true,
      });

      // Should have slots before first meeting, between meetings, and after last
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter slots by minimum duration', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Meeting 1',
          start: { dateTime: '2024-12-20T09:00:00' },
          end: { dateTime: '2024-12-20T09:20:00' },
          status: 'confirmed' as const,
        },
        {
          id: 'event-2',
          summary: 'Meeting 2',
          start: { dateTime: '2024-12-20T09:30:00' },
          end: { dateTime: '2024-12-20T10:00:00' },
          status: 'confirmed' as const,
        },
      ];

      vi.mocked(googleCalendarOAuth.getEvents).mockResolvedValue(mockEvents);

      const result = await findFreeTimeSlots(mockUserId, new Date('2024-12-20'), {
        minDurationMinutes: 60,
        workDayOnly: true,
      });

      // 10-minute gap should not appear
      expect(result.every((slot) => slot.durationMinutes >= 60)).toBe(true);
    });
  });

  describe('getDayOverview', () => {
    it('should return overview with zero meetings when no events', async () => {
      vi.mocked(googleCalendarOAuth.getEvents).mockResolvedValue([]);

      const result = await getDayOverview(mockUserId);

      expect(result.totalMeetings).toBe(0);
      expect(result.isOverloaded).toBe(false);
      expect(result.hasBackToBack).toBe(false);
    });

    it('should detect overloaded days', async () => {
      // Create 7 hours of meetings
      const mockEvents = [];
      for (let i = 9; i < 16; i++) {
        mockEvents.push({
          id: `event-${i}`,
          summary: `Meeting ${i}`,
          start: { dateTime: `2024-12-20T${i.toString().padStart(2, '0')}:00:00` },
          end: { dateTime: `2024-12-20T${(i + 1).toString().padStart(2, '0')}:00:00` },
          status: 'confirmed' as const,
        });
      }

      vi.mocked(googleCalendarOAuth.getEvents).mockResolvedValue(mockEvents);

      const result = await getDayOverview(mockUserId);

      expect(result.isOverloaded).toBe(true);
      expect(result.totalMeetingMinutes).toBeGreaterThanOrEqual(360);
    });

    it('should detect back-to-back meetings', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Meeting 1',
          start: { dateTime: '2024-12-20T10:00:00' },
          end: { dateTime: '2024-12-20T11:00:00' },
          status: 'confirmed' as const,
        },
        {
          id: 'event-2',
          summary: 'Meeting 2',
          start: { dateTime: '2024-12-20T11:05:00' }, // Only 5 min gap
          end: { dateTime: '2024-12-20T12:00:00' },
          status: 'confirmed' as const,
        },
      ];

      vi.mocked(googleCalendarOAuth.getEvents).mockResolvedValue(mockEvents);

      const result = await getDayOverview(mockUserId);

      expect(result.hasBackToBack).toBe(true);
    });
  });

  describe('formatEventForSpeech', () => {
    it('should format basic event', () => {
      const event: CalendarEvent = {
        id: 'test-1',
        title: 'Team Standup',
        startTime: new Date('2024-12-20T09:00:00'),
        endTime: new Date('2024-12-20T09:30:00'),
        isAllDay: false,
        attendees: [],
        status: 'confirmed',
        calendarId: 'primary',
      };

      const result = formatEventForSpeech(event);

      expect(result).toContain('Team Standup');
      expect(result).toMatch(/from.*to/i);
    });

    it('should include location when present', () => {
      const event: CalendarEvent = {
        id: 'test-1',
        title: 'Client Meeting',
        location: 'Conference Room B',
        startTime: new Date('2024-12-20T14:00:00'),
        endTime: new Date('2024-12-20T15:00:00'),
        isAllDay: false,
        attendees: [],
        status: 'confirmed',
        calendarId: 'primary',
      };

      const result = formatEventForSpeech(event);

      expect(result).toContain('Conference Room B');
    });

    it('should include attendee count', () => {
      const event: CalendarEvent = {
        id: 'test-1',
        title: 'Planning Session',
        startTime: new Date('2024-12-20T10:00:00'),
        endTime: new Date('2024-12-20T11:00:00'),
        isAllDay: false,
        attendees: ['alice@example.com', 'bob@example.com'],
        status: 'confirmed',
        calendarId: 'primary',
      };

      const result = formatEventForSpeech(event);

      expect(result).toContain('2 attendees');
    });
  });
});
