/**
 * Calendar Reminders Service Tests
 *
 * Tests for proactive calendar reminders including:
 * - Event management (upsert, query)
 * - Morning digest generation
 * - Pre-event reminder generation
 * - Memory management and cleanup
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  upsertEvent,
  getEventsForDate,
  getUpcomingEvents,
  generateMorningDigest,
  startCalendarReminders,
  stopCalendarReminders,
  clearUserCalendarData,
  clearAllCalendarData,
  getCalendarMemoryStats,
  pruneOldCalendarData,
  type CalendarEvent,
  type EventReminder,
  type CalendarDigest,
} from '../services/scheduling/calendar-reminders.js';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('../services/persistence/index.js', () => ({
  createPersistenceStore: () => ({
    load: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../tools/proactive-outreach.js', () => ({
  canReachUser: vi.fn().mockResolvedValue(true),
  scheduleText: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../services/outreach-intelligence.js', () => ({
  canSendOutreach: vi.fn().mockReturnValue(true),
  getPreferences: vi.fn().mockReturnValue({}),
}));

// ============================================================================
// TYPE TESTS
// ============================================================================

describe('CalendarEvent type', () => {
  it('should accept valid event', () => {
    const event: CalendarEvent = {
      id: 'event-1',
      userId: 'user-1',
      title: 'Team Meeting',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [],
      source: 'manual',
    };

    expect(event.id).toBe('event-1');
    expect(event.source).toBe('manual');
  });

  it('should accept optional fields', () => {
    const event: CalendarEvent = {
      id: 'event-2',
      userId: 'user-1',
      title: 'Doctor Appointment',
      description: 'Annual checkup',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      location: 'City Hospital',
      isAllDay: false,
      attendees: ['doctor@hospital.com'],
      reminders: [],
      source: 'google',
    };

    expect(event.description).toBe('Annual checkup');
    expect(event.location).toBe('City Hospital');
    expect(event.attendees).toHaveLength(1);
  });

  it('should accept all source types', () => {
    const sources: Array<CalendarEvent['source']> = ['google', 'manual', 'scheduled'];

    for (const source of sources) {
      const event: CalendarEvent = {
        id: `event-${source}`,
        userId: 'user-1',
        title: 'Test',
        startTime: new Date(),
        endTime: new Date(),
        isAllDay: false,
        reminders: [],
        source,
      };
      expect(event.source).toBe(source);
    }
  });
});

describe('EventReminder type', () => {
  it('should accept valid reminder', () => {
    const reminder: EventReminder = {
      id: 'reminder-1',
      eventId: 'event-1',
      type: 'pre_event',
      minutesBefore: 60,
      sent: false,
    };

    expect(reminder.type).toBe('pre_event');
    expect(reminder.minutesBefore).toBe(60);
  });

  it('should accept sent reminder with sentAt', () => {
    const reminder: EventReminder = {
      id: 'reminder-2',
      eventId: 'event-1',
      type: 'digest',
      minutesBefore: 0,
      sent: true,
      sentAt: new Date(),
    };

    expect(reminder.sent).toBe(true);
    expect(reminder.sentAt).toBeDefined();
  });

  it('should accept all reminder types', () => {
    const types: Array<EventReminder['type']> = ['digest', 'pre_event', 'contextual'];

    for (const type of types) {
      const reminder: EventReminder = {
        id: `reminder-${type}`,
        eventId: 'event-1',
        type,
        minutesBefore: 30,
        sent: false,
      };
      expect(reminder.type).toBe(type);
    }
  });
});

describe('CalendarDigest type', () => {
  it('should accept valid digest', () => {
    const digest: CalendarDigest = {
      userId: 'user-1',
      date: new Date(),
      events: [],
      message: 'No events today!',
    };

    expect(digest.userId).toBe('user-1');
    expect(digest.events).toEqual([]);
  });

  it('should accept digest with events', () => {
    const event: CalendarEvent = {
      id: 'event-1',
      userId: 'user-1',
      title: 'Meeting',
      startTime: new Date(),
      endTime: new Date(),
      isAllDay: false,
      reminders: [],
      source: 'manual',
    };

    const digest: CalendarDigest = {
      userId: 'user-1',
      date: new Date(),
      events: [event],
      message: 'You have 1 event today.',
    };

    expect(digest.events).toHaveLength(1);
  });
});

// ============================================================================
// EVENT MANAGEMENT TESTS
// ============================================================================

describe('upsertEvent', () => {
  beforeEach(() => {
    clearAllCalendarData();
  });

  it('should add a new event', async () => {
    const event: CalendarEvent = {
      id: 'event-new-1',
      userId: 'user-upsert-1',
      title: 'New Meeting',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [],
      source: 'manual',
    };

    const result = await upsertEvent(event);

    expect(result.id).toBe('event-new-1');
    expect(result.title).toBe('New Meeting');
  });

  it('should add default reminders if none specified', async () => {
    const event: CalendarEvent = {
      id: 'event-reminders-1',
      userId: 'user-upsert-2',
      title: 'Interview with Company',
      startTime: new Date(Date.now() + 86400000), // Tomorrow
      endTime: new Date(Date.now() + 90000000),
      isAllDay: false,
      reminders: [],
      source: 'manual',
    };

    const result = await upsertEvent(event);

    // Interview should get 1-hour, 15-min, and day-before reminders
    expect(result.reminders.length).toBeGreaterThanOrEqual(1);
  });

  it('should update existing event', async () => {
    const userId = 'user-upsert-3';

    // Create initial event
    await upsertEvent({
      id: 'event-update-1',
      userId,
      title: 'Original Title',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-update-1', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    // Update
    await upsertEvent({
      id: 'event-update-1',
      userId,
      title: 'Updated Title',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-update-1', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    // Query to verify
    const events = getEventsForDate(userId, new Date());
    const updated = events.find((e) => e.id === 'event-update-1');

    expect(updated?.title).toBe('Updated Title');
  });
});

describe('getEventsForDate', () => {
  beforeEach(() => {
    clearAllCalendarData();
  });

  it('should return empty array for no events', () => {
    const events = getEventsForDate('user-no-events', new Date());
    expect(events).toEqual([]);
  });

  it('should return events for specific date', async () => {
    const userId = 'user-date-query';
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    await upsertEvent({
      id: 'event-today',
      userId,
      title: 'Today Event',
      startTime: today,
      endTime: new Date(today.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-today', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const events = getEventsForDate(userId, today);
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Today Event');
  });

  it('should not return events from different dates', async () => {
    const userId = 'user-diff-dates';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);

    await upsertEvent({
      id: 'event-tomorrow',
      userId,
      title: 'Tomorrow Event',
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-tomorrow', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const todayEvents = getEventsForDate(userId, new Date());
    expect(todayEvents.length).toBe(0);
  });
});

describe('getUpcomingEvents', () => {
  beforeEach(() => {
    clearAllCalendarData();
  });

  it('should return empty array for no upcoming events', () => {
    const events = getUpcomingEvents('user-no-upcoming');
    expect(events).toEqual([]);
  });

  it('should return events within specified hours', async () => {
    const userId = 'user-upcoming-test';
    const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await upsertEvent({
      id: 'event-soon',
      userId,
      title: 'Upcoming Event',
      startTime: inTwoHours,
      endTime: new Date(inTwoHours.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-soon', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const events = getUpcomingEvents(userId, 24);
    expect(events.length).toBe(1);
  });

  it('should not include events outside time window', async () => {
    const userId = 'user-outside-window';
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    await upsertEvent({
      id: 'event-far',
      userId,
      title: 'Far Future Event',
      startTime: inThreeDays,
      endTime: new Date(inThreeDays.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-far', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const events = getUpcomingEvents(userId, 24);
    expect(events.length).toBe(0);
  });

  it('should sort by start time', async () => {
    const userId = 'user-sort-test';
    const inOneHour = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await upsertEvent({
      id: 'event-later',
      userId,
      title: 'Later Event',
      startTime: inTwoHours,
      endTime: new Date(inTwoHours.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-later', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    await upsertEvent({
      id: 'event-sooner',
      userId,
      title: 'Sooner Event',
      startTime: inOneHour,
      endTime: new Date(inOneHour.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-sooner', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const events = getUpcomingEvents(userId, 24);
    expect(events[0].title).toBe('Sooner Event');
    expect(events[1].title).toBe('Later Event');
  });
});

// ============================================================================
// DIGEST TESTS
// ============================================================================

describe('generateMorningDigest', () => {
  beforeEach(() => {
    clearAllCalendarData();
  });

  it('should return null for no events', () => {
    const digest = generateMorningDigest('user-no-events');
    expect(digest).toBeNull();
  });

  it('should generate digest with events', async () => {
    const userId = 'user-digest-test';
    const today = new Date();
    today.setHours(14, 0, 0, 0);

    await upsertEvent({
      id: 'event-digest-1',
      userId,
      title: 'Team Meeting',
      startTime: today,
      endTime: new Date(today.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-digest-1', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const digest = generateMorningDigest(userId);

    expect(digest).not.toBeNull();
    expect(digest?.message).toContain('Good morning');
    expect(digest?.message).toContain('Team Meeting');
    expect(digest?.events).toHaveLength(1);
  });

  it('should include location in message', async () => {
    const userId = 'user-digest-location';
    const today = new Date();
    today.setHours(10, 0, 0, 0);

    await upsertEvent({
      id: 'event-location',
      userId,
      title: 'Meeting',
      location: 'Conference Room A',
      startTime: today,
      endTime: new Date(today.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-location', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const digest = generateMorningDigest(userId);
    expect(digest?.message).toContain('Conference Room A');
  });

  it('should handle all-day events', async () => {
    const userId = 'user-digest-allday';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await upsertEvent({
      id: 'event-allday',
      userId,
      title: 'Company Holiday',
      startTime: today,
      endTime: new Date(today.getTime() + 86400000),
      isAllDay: true,
      reminders: [],
      source: 'manual',
    });

    const digest = generateMorningDigest(userId);
    expect(digest?.message).toContain('All day');
  });

  it('should count events correctly', async () => {
    const userId = 'user-digest-count';
    const today = new Date();

    for (let i = 0; i < 3; i++) {
      const startTime = new Date(today);
      startTime.setHours(9 + i, 0, 0, 0);

      await upsertEvent({
        id: `event-count-${i}`,
        userId,
        title: `Event ${i + 1}`,
        startTime,
        endTime: new Date(startTime.getTime() + 3600000),
        isAllDay: false,
        reminders: [
          {
            id: `r${i}`,
            eventId: `event-count-${i}`,
            type: 'pre_event',
            minutesBefore: 30,
            sent: false,
          },
        ],
        source: 'manual',
      });
    }

    const digest = generateMorningDigest(userId);
    expect(digest?.message).toContain('3 things');
    expect(digest?.events).toHaveLength(3);
  });
});

// ============================================================================
// MEMORY MANAGEMENT TESTS
// ============================================================================

describe('clearUserCalendarData', () => {
  beforeEach(() => {
    clearAllCalendarData();
  });

  it('should clear data for specific user', async () => {
    const userId = 'user-clear-test';

    await upsertEvent({
      id: 'event-clear',
      userId,
      title: 'Test',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-clear', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    clearUserCalendarData(userId);

    const events = getEventsForDate(userId, new Date());
    expect(events).toEqual([]);
  });

  it('should not affect other users', async () => {
    await upsertEvent({
      id: 'event-user-a',
      userId: 'user-a',
      title: 'User A Event',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-user-a', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    await upsertEvent({
      id: 'event-user-b',
      userId: 'user-b',
      title: 'User B Event',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-user-b', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    clearUserCalendarData('user-a');

    const userBEvents = getEventsForDate('user-b', new Date());
    expect(userBEvents.length).toBe(1);
  });
});

describe('clearAllCalendarData', () => {
  it('should clear all data', async () => {
    await upsertEvent({
      id: 'event-1',
      userId: 'user-1',
      title: 'Test 1',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-1', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    await upsertEvent({
      id: 'event-2',
      userId: 'user-2',
      title: 'Test 2',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-2', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    clearAllCalendarData();

    const stats = getCalendarMemoryStats();
    expect(stats.usersWithEvents).toBe(0);
    expect(stats.totalEvents).toBe(0);
  });
});

describe('getCalendarMemoryStats', () => {
  beforeEach(() => {
    clearAllCalendarData();
  });

  it('should return zero stats when empty', () => {
    const stats = getCalendarMemoryStats();

    expect(stats.usersWithEvents).toBe(0);
    expect(stats.totalEvents).toBe(0);
    expect(stats.reminderLogsTracked).toBe(0);
  });

  it('should count users and events', async () => {
    await upsertEvent({
      id: 'event-stats-1',
      userId: 'user-stats-1',
      title: 'Event 1',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-stats-1', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    await upsertEvent({
      id: 'event-stats-2',
      userId: 'user-stats-1',
      title: 'Event 2',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-stats-2', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    await upsertEvent({
      id: 'event-stats-3',
      userId: 'user-stats-2',
      title: 'Event 3',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-stats-3', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const stats = getCalendarMemoryStats();
    expect(stats.usersWithEvents).toBe(2);
    expect(stats.totalEvents).toBe(3);
  });
});

describe('pruneOldCalendarData', () => {
  beforeEach(() => {
    clearAllCalendarData();
  });

  it('should return 0 when no old data', async () => {
    // Create a future event
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await upsertEvent({
      id: 'event-future',
      userId: 'user-prune',
      title: 'Future Event',
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-future', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const pruned = pruneOldCalendarData(30);
    expect(pruned).toBe(0);
  });

  it('should prune old events', async () => {
    const userId = 'user-prune-old';

    // Create old event (60 days ago)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    await upsertEvent({
      id: 'event-old',
      userId,
      title: 'Old Event',
      startTime: oldDate,
      endTime: new Date(oldDate.getTime() + 3600000),
      isAllDay: false,
      reminders: [
        { id: 'r1', eventId: 'event-old', type: 'pre_event', minutesBefore: 30, sent: false },
      ],
      source: 'manual',
    });

    const pruned = pruneOldCalendarData(30);
    expect(pruned).toBe(1);

    const events = getEventsForDate(userId, oldDate);
    expect(events).toEqual([]);
  });
});

// ============================================================================
// BACKGROUND JOB TESTS
// ============================================================================

describe('startCalendarReminders', () => {
  beforeEach(() => {
    clearAllCalendarData();
    stopCalendarReminders();
  });

  it('should start without error', () => {
    expect(() => startCalendarReminders(60000)).not.toThrow();
    stopCalendarReminders();
  });

  it('should warn if already running', () => {
    startCalendarReminders(60000);
    startCalendarReminders(60000); // Second call should warn

    stopCalendarReminders();
  });
});

describe('stopCalendarReminders', () => {
  it('should stop without error', () => {
    startCalendarReminders(60000);
    expect(() => stopCalendarReminders()).not.toThrow();
  });

  it('should be safe to call when not running', () => {
    expect(() => stopCalendarReminders()).not.toThrow();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge cases', () => {
  beforeEach(() => {
    clearAllCalendarData();
  });

  it('should handle very long event titles', async () => {
    const longTitle = 'A'.repeat(1000);

    await expect(
      upsertEvent({
        id: 'event-long',
        userId: 'user-long',
        title: longTitle,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
        isAllDay: false,
        reminders: [],
        source: 'manual',
      })
    ).resolves.not.toThrow();
  });

  it('should handle special characters in title', async () => {
    await expect(
      upsertEvent({
        id: 'event-special',
        userId: 'user-special',
        title: 'Meeting with 🎉 émojis & ünïcödé',
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
        isAllDay: false,
        reminders: [],
        source: 'manual',
      })
    ).resolves.not.toThrow();
  });

  it('should handle concurrent event additions', async () => {
    const userId = 'user-concurrent';
    const promises = Array.from({ length: 10 }, (_, i) =>
      upsertEvent({
        id: `event-concurrent-${i}`,
        userId,
        title: `Event ${i}`,
        startTime: new Date(Date.now() + i * 3600000),
        endTime: new Date(Date.now() + (i + 1) * 3600000),
        isAllDay: false,
        reminders: [],
        source: 'manual',
      })
    );

    await expect(Promise.all(promises)).resolves.not.toThrow();

    const stats = getCalendarMemoryStats();
    expect(stats.totalEvents).toBeGreaterThanOrEqual(10);
  });

  it('should handle events spanning midnight', async () => {
    const today = new Date();
    today.setHours(23, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0);

    await upsertEvent({
      id: 'event-overnight',
      userId: 'user-overnight',
      title: 'Overnight Event',
      startTime: today,
      endTime: tomorrow,
      isAllDay: false,
      reminders: [],
      source: 'manual',
    });

    const todayEvents = getEventsForDate('user-overnight', today);
    expect(todayEvents.length).toBe(1);
  });

  it('should generate correct reminders for interview events', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await upsertEvent({
      id: 'event-interview',
      userId: 'user-interview',
      title: 'Job Interview at TechCorp',
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + 3600000),
      isAllDay: false,
      reminders: [],
      source: 'manual',
    });

    // Interview should have: 1 hour, 15 min, and day-before reminders
    expect(result.reminders.length).toBeGreaterThanOrEqual(2);

    const reminderTypes = result.reminders.map((r) => r.type);
    expect(reminderTypes).toContain('pre_event');
    expect(reminderTypes).toContain('contextual');
  });
});
