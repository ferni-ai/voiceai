/**
 * Event Confirmation Flow Tests
 *
 * Tests for the multi-turn event creation with conflict handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseEventRequest,
  clarifyEventTime,
  confirmEvent,
  cancelPendingEvent,
  getPendingEvent,
  getUserPendingEvents,
} from '../event-confirmation.js';

// Mock calendar service
vi.mock('../calendar-service.js', () => ({
  isTimeSlotAvailable: vi.fn().mockResolvedValue(true),
  getEventsForDay: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn().mockResolvedValue({
    id: 'created-event-123',
    title: 'Test Event',
    startTime: new Date('2025-03-17T14:00:00'),
    endTime: new Date('2025-03-17T15:00:00'),
    isAllDay: false,
    attendees: [],
    status: 'confirmed',
    calendarId: 'primary',
  }),
  findFreeTimeSlots: vi.fn().mockResolvedValue([
    {
      start: new Date('2025-03-17T15:00:00'),
      end: new Date('2025-03-17T16:00:00'),
      durationMinutes: 60,
    },
  ]),
}));

// Mock natural date parser to return consistent results
vi.mock('../natural-date-parser.js', async () => {
  const actual = await vi.importActual('../natural-date-parser.js');
  return {
    ...actual,
    parseNaturalDate: vi.fn((input: string) => {
      if (input.includes('tomorrow')) {
        return {
          date: new Date('2025-03-17T14:00:00'),
          confidence: 'high',
          original: input,
          interpretation: 'Monday, March 17 at 2:00 PM',
          hasTime: input.includes('pm') || input.includes('am'),
          hasDate: true,
        };
      }
      if (input.includes('3pm')) {
        return {
          date: new Date('2025-03-17T15:00:00'),
          confidence: 'high',
          original: input,
          interpretation: 'Monday, March 17 at 3:00 PM',
          hasTime: true,
          hasDate: true,
        };
      }
      return null;
    }),
    suggestTimes: vi.fn().mockReturnValue([
      new Date('2025-03-17T10:00:00'),
      new Date('2025-03-17T14:00:00'),
    ]),
    isValidForScheduling: vi.fn().mockReturnValue({ valid: true }),
  };
});

describe('Event Confirmation Flow', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseEventRequest', () => {
    it('should parse simple event request', async () => {
      const result = await parseEventRequest(testUserId, 'schedule meeting with John tomorrow at 2pm');

      expect(result.success).toBe(true);
      expect(result.pendingEvent).toBeDefined();
      expect(result.pendingEvent!.title).toContain('John');
    });

    it('should ask for clarification when no time provided', async () => {
      // Mock parseNaturalDate to return null for this input
      const { parseNaturalDate } = await import('../natural-date-parser.js');
      vi.mocked(parseNaturalDate).mockReturnValueOnce(null);

      const result = await parseEventRequest(testUserId, 'schedule dentist appointment');

      expect(result.success).toBe(true);
      expect(result.needsClarification).toBe(true);
      expect(result.clarificationPrompt).toBeDefined();
    });

    it('should detect conflicts and suggest alternatives', async () => {
      const { isTimeSlotAvailable, getEventsForDay } = await import('../calendar-service.js');

      vi.mocked(isTimeSlotAvailable).mockResolvedValueOnce(false);
      vi.mocked(getEventsForDay).mockResolvedValueOnce([
        {
          id: 'conflict-1',
          title: 'Existing Meeting',
          startTime: new Date('2025-03-17T14:00:00'),
          endTime: new Date('2025-03-17T15:00:00'),
          isAllDay: false,
          attendees: [],
          status: 'confirmed' as const,
          calendarId: 'primary',
        },
      ]);

      const result = await parseEventRequest(testUserId, 'schedule call tomorrow at 2pm');

      expect(result.success).toBe(true);
      expect(result.hasConflict).toBe(true);
      expect(result.conflictDescription).toContain('Existing Meeting');
      expect(result.suggestedAlternatives).toBeDefined();
    });

    it('should return ready to confirm when no conflicts', async () => {
      const result = await parseEventRequest(testUserId, 'schedule call tomorrow at 2pm');

      expect(result.success).toBe(true);
      expect(result.readyToConfirm).toBe(true);
      expect(result.confirmationPrompt).toBeDefined();
    });
  });

  describe('clarifyEventTime', () => {
    it('should update pending event with clarified time', async () => {
      // First create a pending event
      const initial = await parseEventRequest(testUserId, 'schedule call tomorrow at 2pm');
      expect(initial.pendingEvent).toBeDefined();

      // Now clarify with a new time
      const result = await clarifyEventTime(initial.pendingEvent!.id, '3pm');

      expect(result.success).toBe(true);
      expect(result.readyToConfirm).toBe(true);
    });

    it('should handle unparseable time clarification', async () => {
      // First create a pending event
      const initial = await parseEventRequest(testUserId, 'schedule call tomorrow at 2pm');

      // Mock parseNaturalDate to return null
      const { parseNaturalDate } = await import('../natural-date-parser.js');
      vi.mocked(parseNaturalDate).mockReturnValueOnce(null);

      const result = await clarifyEventTime(initial.pendingEvent!.id, 'gibberish');

      expect(result.success).toBe(false);
      expect(result.needsClarification).toBe(true);
    });

    it('should return error for non-existent pending event', async () => {
      const result = await clarifyEventTime('nonexistent-id', '3pm');

      expect(result.success).toBe(false);
      expect(result.needsClarification).toBe(true);
      expect(result.clarificationPrompt).toContain('start over');
    });
  });

  describe('confirmEvent', () => {
    it('should create event when confirmed', async () => {
      // First create and prepare a pending event
      const initial = await parseEventRequest(testUserId, 'schedule call tomorrow at 2pm');
      expect(initial.pendingEvent).toBeDefined();
      expect(initial.readyToConfirm).toBe(true);

      // Now confirm
      const result = await confirmEvent(initial.pendingEvent!.id);

      expect(result.success).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.speakableResponse).toContain('scheduled');
    });

    it('should return error for non-existent pending event', async () => {
      const result = await confirmEvent('nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.speakableResponse).toContain('start over');
    });

    it('should return error for event not ready', async () => {
      // Create pending event that needs time clarification
      const { parseNaturalDate } = await import('../natural-date-parser.js');
      vi.mocked(parseNaturalDate).mockReturnValueOnce(null);

      const initial = await parseEventRequest(testUserId, 'schedule meeting');

      if (initial.pendingEvent) {
        const result = await confirmEvent(initial.pendingEvent.id);
        expect(result.success).toBe(false);
        expect(result.speakableResponse).toContain('time');
      }
    });
  });

  describe('cancelPendingEvent', () => {
    it('should cancel pending event', async () => {
      const initial = await parseEventRequest(testUserId, 'schedule call tomorrow at 2pm');
      expect(initial.pendingEvent).toBeDefined();

      const result = cancelPendingEvent(initial.pendingEvent!.id);

      expect(result.success).toBe(true);
      expect(result.speakableResponse).toContain("won't schedule");

      // Verify it's deleted
      const pending = getPendingEvent(initial.pendingEvent!.id);
      expect(pending).toBeUndefined();
    });

    it('should handle non-existent pending event gracefully', async () => {
      const result = cancelPendingEvent('nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.speakableResponse).toBeDefined();
    });
  });

  describe('getPendingEvent', () => {
    it('should return pending event by id', async () => {
      const initial = await parseEventRequest(testUserId, 'schedule call tomorrow at 2pm');
      expect(initial.pendingEvent).toBeDefined();

      const pending = getPendingEvent(initial.pendingEvent!.id);
      expect(pending).toBeDefined();
      expect(pending!.userId).toBe(testUserId);
    });

    it('should return undefined for non-existent id', () => {
      const pending = getPendingEvent('nonexistent-id');
      expect(pending).toBeUndefined();
    });
  });

  describe('getUserPendingEvents', () => {
    it('should return all pending events for user', async () => {
      // Create multiple pending events
      await parseEventRequest(testUserId, 'schedule call tomorrow at 2pm');
      await parseEventRequest(testUserId, 'schedule meeting tomorrow at 3pm');

      const pending = getUserPendingEvents(testUserId);
      expect(pending.length).toBeGreaterThanOrEqual(2);
      pending.forEach((e) => {
        expect(e.userId).toBe(testUserId);
      });
    });

    it('should return empty array for user with no pending events', () => {
      const pending = getUserPendingEvents('different-user');
      expect(pending).toEqual([]);
    });
  });
});
