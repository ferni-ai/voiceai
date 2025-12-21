/**
 * Local Calendar Store Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firestore before imports
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
      doc: vi.fn().mockReturnValue({
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
}));

vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import {
  getLocalEventsForDay,
  getLocalEvents,
  createLocalEvent,
  updateLocalEvent,
  deleteLocalEvent,
  hasLocalEvents,
  clearLocalCache,
} from '../local-calendar-store.js';

describe('Local Calendar Store', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalCache(mockUserId); // Clear cache between tests
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createLocalEvent', () => {
    it('should create an event with generated ID', async () => {
      const event = await createLocalEvent(mockUserId, {
        title: 'Test Meeting',
        startTime: new Date('2024-12-20T10:00:00'),
        durationMinutes: 60,
      });

      expect(event).not.toBeNull();
      expect(event.id).toMatch(/^local_/);
      expect(event.title).toBe('Test Meeting');
      expect(event.calendarId).toBe('local');
      expect(event.status).toBe('confirmed');
    });

    it('should calculate end time from duration', async () => {
      const startTime = new Date('2024-12-20T10:00:00');
      const event = await createLocalEvent(mockUserId, {
        title: 'Test Meeting',
        startTime,
        durationMinutes: 90,
      });

      const expectedEnd = new Date(startTime.getTime() + 90 * 60 * 1000);
      expect(event.endTime.getTime()).toBe(expectedEnd.getTime());
    });

    it('should use provided end time over duration', async () => {
      const startTime = new Date('2024-12-20T10:00:00');
      const endTime = new Date('2024-12-20T12:00:00');

      const event = await createLocalEvent(mockUserId, {
        title: 'Test Meeting',
        startTime,
        endTime,
        durationMinutes: 60, // Should be ignored
      });

      expect(event.endTime.getTime()).toBe(endTime.getTime());
    });
  });

  describe('getLocalEventsForDay', () => {
    it('should return events for the specified day', async () => {
      // Create events - use explicit dates at start of day in local time
      const today = new Date();
      today.setHours(9, 0, 0, 0);
      const todayAfternoon = new Date(today);
      todayAfternoon.setHours(14, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      await createLocalEvent(mockUserId, {
        title: 'Morning Meeting',
        startTime: today,
      });
      await createLocalEvent(mockUserId, {
        title: 'Afternoon Meeting',
        startTime: todayAfternoon,
      });
      await createLocalEvent(mockUserId, {
        title: 'Tomorrow Meeting',
        startTime: tomorrow,
      });

      const events = await getLocalEventsForDay(mockUserId, today);

      expect(events.length).toBe(2);
      expect(events[0].title).toBe('Morning Meeting');
      expect(events[1].title).toBe('Afternoon Meeting');
    });

    it('should return empty array for days with no events', async () => {
      // Use a date far in the future with no events
      const farFuture = new Date('2099-12-25');
      const events = await getLocalEventsForDay(mockUserId, farFuture);
      expect(events).toEqual([]);
    });
  });

  describe('getLocalEvents', () => {
    it('should return events in date range', async () => {
      // Use dates relative to now to avoid timezone issues
      const now = new Date();
      const before = new Date(now);
      before.setDate(before.getDate() - 2);
      before.setHours(10, 0, 0, 0);

      const middle = new Date(now);
      middle.setHours(10, 0, 0, 0);

      const after = new Date(now);
      after.setDate(after.getDate() + 5);
      after.setHours(10, 0, 0, 0);

      await createLocalEvent(mockUserId, {
        title: 'Event Before',
        startTime: before,
      });
      await createLocalEvent(mockUserId, {
        title: 'Event Middle',
        startTime: middle,
      });
      await createLocalEvent(mockUserId, {
        title: 'Event After',
        startTime: after,
      });

      // Search range: yesterday to tomorrow
      const rangeStart = new Date(now);
      rangeStart.setDate(rangeStart.getDate() - 1);
      rangeStart.setHours(0, 0, 0, 0);

      const rangeEnd = new Date(now);
      rangeEnd.setDate(rangeEnd.getDate() + 2);
      rangeEnd.setHours(23, 59, 59, 999);

      const events = await getLocalEvents(mockUserId, rangeStart, rangeEnd);

      expect(events.length).toBe(1);
      expect(events[0].title).toBe('Event Middle');
    });
  });

  describe('updateLocalEvent', () => {
    it('should update event title', async () => {
      const event = await createLocalEvent(mockUserId, {
        title: 'Original Title',
        startTime: new Date('2024-12-20T10:00:00'),
      });

      const updated = await updateLocalEvent(mockUserId, event.id, {
        title: 'Updated Title',
      });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe('Updated Title');
    });

    it('should return null for non-existent event', async () => {
      const updated = await updateLocalEvent(mockUserId, 'non-existent-id', {
        title: 'Updated',
      });

      expect(updated).toBeNull();
    });
  });

  describe('deleteLocalEvent', () => {
    it('should delete an existing event', async () => {
      const event = await createLocalEvent(mockUserId, {
        title: 'To Delete',
        startTime: new Date('2024-12-20T10:00:00'),
      });

      const deleted = await deleteLocalEvent(mockUserId, event.id);
      expect(deleted).toBe(true);

      // Verify it's gone
      const events = await getLocalEventsForDay(mockUserId, new Date('2024-12-20'));
      expect(events.find((e) => e.id === event.id)).toBeUndefined();
    });

    it('should return false for non-existent event', async () => {
      const deleted = await deleteLocalEvent(mockUserId, 'non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('hasLocalEvents', () => {
    it('should return false when no events', async () => {
      const hasEvents = await hasLocalEvents(mockUserId);
      expect(hasEvents).toBe(false);
    });

    it('should return true when events exist', async () => {
      await createLocalEvent(mockUserId, {
        title: 'Test Event',
        startTime: new Date('2024-12-20T10:00:00'),
      });

      const hasEvents = await hasLocalEvents(mockUserId);
      expect(hasEvents).toBe(true);
    });
  });

  describe('clearLocalCache', () => {
    it('should clear cached events', async () => {
      await createLocalEvent(mockUserId, {
        title: 'Cached Event',
        startTime: new Date('2024-12-20T10:00:00'),
      });

      expect(await hasLocalEvents(mockUserId)).toBe(true);

      clearLocalCache(mockUserId);

      // After clearing, it should reload from (mocked empty) Firestore
      expect(await hasLocalEvents(mockUserId)).toBe(false);
    });
  });
});
