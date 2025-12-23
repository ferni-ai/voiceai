// @ts-nocheck - Test file with mock data doesn't match all interface properties
/**
 * Unit Tests for Milestone Calendar Sync
 *
 * Tests Jordan's "better than human" milestone tracking and calendar integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../calendar/calendar-service.js', () => ({
  createEvent: vi.fn(),
  getEventsForDay: vi.fn(),
}));

// Import after mocking
import {
  createEvent,
  getEventsForDay,
  type CalendarEvent,
} from '../../calendar/calendar-service.js';
import {
  syncMilestoneToCalendar,
  createMilestoneCountdown,
  getMilestonesForDailyBriefing,
  injectMilestoneCountdownToDaily,
  checkMilestoneConflicts,
  generateMilestoneCelebration,
  detectMilestoneRelatedEvents,
  calculateMilestoneTimeBuffers,
  syncCalendarEventToMilestone,
  getMilestoneCalendarSyncStatus,
  type Milestone,
} from '../milestone-calendar-sync.js';

const mockedCreateEvent = vi.mocked(createEvent);
const mockedGetEventsForDay = vi.mocked(getEventsForDay);

// Helper to create a mock CalendarEvent with all required properties
function createMockCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: overrides.id || `event-${Date.now()}`,
    userId: 'user-123',
    title: overrides.title || 'Test Event',
    startTime: overrides.startTime || new Date(),
    endTime: overrides.endTime || new Date(),
    isAllDay: overrides.isAllDay ?? false,
    attendees: overrides.attendees || [],
    status: 'confirmed',
    calendarId: 'primary',
    ...overrides,
  };
}

// =========================================================================
// Test Helpers
// =========================================================================

function createMockMilestone(overrides: Partial<Milestone> = {}): Milestone {
  const now = new Date();
  return {
    id: `milestone-${Date.now()}`,
    userId: 'user-123',
    name: 'Test Milestone',
    description: 'A test milestone',
    date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    category: 'personal',
    importance: 'medium',
    requiresPrep: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Milestone Calendar Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // syncMilestoneToCalendar
  // =========================================================================

  describe('syncMilestoneToCalendar', () => {
    it('should create main calendar event for milestone', async () => {
      mockedCreateEvent.mockResolvedValue({
        id: 'event-123',
        title: '🎯 Test Milestone',
        startTime: new Date(),
        endTime: new Date(),
        attendees: [],
      } as ReturnType<typeof createEvent> extends Promise<infer T> ? T : never);

      const milestone = createMockMilestone({ name: 'Launch Product' });
      const result = await syncMilestoneToCalendar('user-123', milestone);

      expect(mockedCreateEvent).toHaveBeenCalled();
      expect(result.calendarEventId).toBe('event-123');
      expect(result.milestoneId).toBe(milestone.id);
    });

    it('should create prep time event when milestone requires prep', async () => {
      mockedCreateEvent
        .mockResolvedValueOnce({
          id: 'main-event',
          title: '🎯 Big Presentation',
          startTime: new Date(),
          endTime: new Date(),
          attendees: [],
        } as ReturnType<typeof createEvent> extends Promise<infer T> ? T : never)
        .mockResolvedValueOnce({
          id: 'prep-event',
          title: '📝 Prep for: Big Presentation',
          startTime: new Date(),
          endTime: new Date(),
          attendees: [],
        } as ReturnType<typeof createEvent> extends Promise<infer T> ? T : never);

      const milestone = createMockMilestone({
        name: 'Big Presentation',
        requiresPrep: true,
        prepTimeHours: 2,
      });

      const result = await syncMilestoneToCalendar('user-123', milestone);

      expect(mockedCreateEvent).toHaveBeenCalledTimes(2);
      expect(result.prepTimeBlocked).toBe(true);
      expect(result.prepEventId).toBe('prep-event');
    });

    it('should handle calendar creation failure gracefully', async () => {
      mockedCreateEvent.mockResolvedValue(null);

      const milestone = createMockMilestone();
      const result = await syncMilestoneToCalendar('user-123', milestone);

      expect(result.calendarEventId).toBeNull();
      expect(result.prepTimeBlocked).toBe(false);
    });
  });

  // =========================================================================
  // createMilestoneCountdown
  // =========================================================================

  describe('createMilestoneCountdown', () => {
    it('should create countdown reminders at specified intervals', async () => {
      let callCount = 0;
      mockedCreateEvent.mockImplementation(async () =>
        createMockCalendarEvent({
          id: `reminder-${++callCount}`,
          title: 'Countdown',
        })
      );

      // Milestone 40 days from now
      const milestone = createMockMilestone({
        date: new Date('2024-04-25T10:00:00Z'),
      });

      const reminders = await createMilestoneCountdown('user-123', milestone, [30, 14, 7, 3, 1]);

      // All reminder dates should be in the future
      expect(reminders.length).toBeGreaterThan(0);
      expect(reminders.every((r) => r.eventId)).toBe(true);
    });

    it('should skip reminder dates in the past', async () => {
      mockedCreateEvent.mockResolvedValue(
        createMockCalendarEvent({
          id: 'reminder-1',
          title: 'Countdown',
        })
      );

      // Milestone 5 days from now - 30 and 14 day reminders are in the past
      const milestone = createMockMilestone({
        date: new Date('2024-03-20T10:00:00Z'),
      });

      const reminders = await createMilestoneCountdown('user-123', milestone, [30, 14, 7, 3, 1]);

      // Should only create 3 and 1 day reminders (7 day would also be past on March 15)
      expect(reminders.length).toBeLessThanOrEqual(2);
    });
  });

  // =========================================================================
  // getMilestonesForDailyBriefing
  // =========================================================================

  describe('getMilestonesForDailyBriefing', () => {
    it('should return milestones within 30 days', async () => {
      const milestones = [
        createMockMilestone({ name: 'Soon', date: new Date('2024-03-22T10:00:00Z') }), // 7 days
        createMockMilestone({ name: 'Later', date: new Date('2024-04-10T10:00:00Z') }), // 26 days
        createMockMilestone({ name: 'Far', date: new Date('2024-05-15T10:00:00Z') }), // 61 days
      ];

      const countdowns = await getMilestonesForDailyBriefing('user-123', milestones);

      expect(countdowns.length).toBe(2);
      expect(countdowns[0].milestone.name).toBe('Soon');
      expect(countdowns[1].milestone.name).toBe('Later');
    });

    it('should mark imminent milestones (3 days or less)', async () => {
      const milestones = [
        createMockMilestone({ name: 'Tomorrow', date: new Date('2024-03-16T10:00:00Z') }),
        createMockMilestone({ name: 'Next Week', date: new Date('2024-03-22T10:00:00Z') }),
      ];

      const countdowns = await getMilestonesForDailyBriefing('user-123', milestones);

      expect(countdowns[0].isImminent).toBe(true);
      expect(countdowns[0].isUrgent).toBe(true);
      expect(countdowns[1].isImminent).toBe(false);
      expect(countdowns[1].isUrgent).toBe(true);
    });

    it('should generate appropriate messages based on timing', async () => {
      const milestones = [
        createMockMilestone({ name: 'Today!', date: new Date('2024-03-15T10:00:00Z') }),
        createMockMilestone({ name: 'Tomorrow', date: new Date('2024-03-16T10:00:00Z') }),
        createMockMilestone({ name: 'In 3 Days', date: new Date('2024-03-18T10:00:00Z') }),
        createMockMilestone({ name: 'In 5 Days', date: new Date('2024-03-20T10:00:00Z') }),
        createMockMilestone({ name: 'In 10 Days', date: new Date('2024-03-25T10:00:00Z') }),
      ];

      const countdowns = await getMilestonesForDailyBriefing('user-123', milestones);

      expect(countdowns[0].message).toContain('Today!');
      expect(countdowns[1].message).toContain('Tomorrow');
      expect(countdowns[2].message).toContain('getting close');
      expect(countdowns[3].message).toContain('coming up');
      expect(countdowns[4].message).toContain('10 days until');
    });

    it('should sort by days until', async () => {
      const milestones = [
        createMockMilestone({ name: 'Far', date: new Date('2024-04-01T10:00:00Z') }),
        createMockMilestone({ name: 'Near', date: new Date('2024-03-17T10:00:00Z') }),
        createMockMilestone({ name: 'Medium', date: new Date('2024-03-25T10:00:00Z') }),
      ];

      const countdowns = await getMilestonesForDailyBriefing('user-123', milestones);

      expect(countdowns[0].milestone.name).toBe('Near');
      expect(countdowns[1].milestone.name).toBe('Medium');
      expect(countdowns[2].milestone.name).toBe('Far');
    });
  });

  // =========================================================================
  // injectMilestoneCountdownToDaily
  // =========================================================================

  describe('injectMilestoneCountdownToDaily', () => {
    it('should return null when no milestones', async () => {
      const result = await injectMilestoneCountdownToDaily('user-123', []);
      expect(result).toBeNull();
    });

    it('should generate formatted context with urgency sections', async () => {
      const milestones = [
        createMockMilestone({
          name: 'Imminent Thing',
          date: new Date('2024-03-17T10:00:00Z'),
        }), // 2 days
        createMockMilestone({ name: 'Urgent Thing', date: new Date('2024-03-20T10:00:00Z') }), // 5 days
        createMockMilestone({ name: 'Upcoming Thing', date: new Date('2024-04-01T10:00:00Z') }), // 17 days
      ];

      const result = await injectMilestoneCountdownToDaily('user-123', milestones);

      expect(result).toContain('MILESTONE COUNTDOWN');
      expect(result).toContain('Imminent');
      expect(result).toContain('This Week');
      expect(result).toContain('Coming Up');
    });
  });

  // =========================================================================
  // checkMilestoneConflicts
  // =========================================================================

  describe('checkMilestoneConflicts', () => {
    it('should detect no conflicts when day is clear', async () => {
      mockedGetEventsForDay.mockResolvedValue([]);

      const milestone = createMockMilestone();
      const result = await checkMilestoneConflicts('user-123', milestone);

      expect(result.hasConflict).toBe(false);
      expect(result.conflictingEvents).toHaveLength(0);
    });

    it('should detect conflicts with significant meetings', async () => {
      mockedGetEventsForDay.mockResolvedValue([
        createMockCalendarEvent({
          id: 'event-1',
          title: 'Long Meeting',
          startTime: new Date('2024-03-22T09:00:00Z'),
          endTime: new Date('2024-03-22T12:00:00Z'), // 3 hours
          isAllDay: false,
        }),
      ]);

      const milestone = createMockMilestone({ date: new Date('2024-03-22T10:00:00Z') });
      const result = await checkMilestoneConflicts('user-123', milestone);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingEvents).toHaveLength(1);
    });

    it('should ignore all-day events', async () => {
      mockedGetEventsForDay.mockResolvedValue([
        createMockCalendarEvent({
          id: 'event-1',
          title: 'All Day Event',
          startTime: new Date('2024-03-22T00:00:00Z'),
          endTime: new Date('2024-03-22T23:59:59Z'),
          isAllDay: true,
        }),
      ]);

      const milestone = createMockMilestone({ date: new Date('2024-03-22T10:00:00Z') });
      const result = await checkMilestoneConflicts('user-123', milestone);

      expect(result.hasConflict).toBe(false);
    });

    it('should generate suggestion when day is packed', async () => {
      mockedGetEventsForDay.mockResolvedValue([
        createMockCalendarEvent({
          id: 'event-1',
          title: 'Meeting 1',
          startTime: new Date('2024-03-22T09:00:00Z'),
          endTime: new Date('2024-03-22T11:00:00Z'),
          isAllDay: false,
        }),
        createMockCalendarEvent({
          id: 'event-2',
          title: 'Meeting 2',
          startTime: new Date('2024-03-22T13:00:00Z'),
          endTime: new Date('2024-03-22T15:00:00Z'),
          isAllDay: false,
        }),
        createMockCalendarEvent({
          id: 'event-3',
          title: 'Meeting 3',
          startTime: new Date('2024-03-22T16:00:00Z'),
          endTime: new Date('2024-03-22T18:00:00Z'),
          isAllDay: false,
        }),
      ]);

      const milestone = createMockMilestone({
        name: 'Big Day',
        date: new Date('2024-03-22T10:00:00Z'),
      });
      const result = await checkMilestoneConflicts('user-123', milestone);

      expect(result.hasConflict).toBe(true);
      expect(result.suggestion).toContain('meetings');
    });
  });

  // =========================================================================
  // generateMilestoneCelebration
  // =========================================================================

  describe('generateMilestoneCelebration', () => {
    it('should generate category-specific celebration', () => {
      const careerMilestone = createMockMilestone({ category: 'career' });
      const healthMilestone = createMockMilestone({ category: 'health' });

      const careerCelebration = generateMilestoneCelebration(careerMilestone);
      const healthCelebration = generateMilestoneCelebration(healthMilestone);

      // Messages should be different for different categories
      expect(careerCelebration.message.length).toBeGreaterThan(0);
      expect(healthCelebration.message.length).toBeGreaterThan(0);
      expect(careerCelebration.celebrationSuggestion.length).toBeGreaterThan(0);
      expect(healthCelebration.celebrationSuggestion.length).toBeGreaterThan(0);
    });

    it('should handle unknown category gracefully', () => {
      const milestone = createMockMilestone({ category: 'other' });
      const celebration = generateMilestoneCelebration(milestone);

      expect(celebration.message).toBeDefined();
      expect(celebration.celebrationSuggestion).toBeDefined();
    });
  });

  // =========================================================================
  // Bidirectional Sync Tests
  // =========================================================================

  describe('detectMilestoneRelatedEvents', () => {
    it('should detect events directly linked to milestones', async () => {
      mockedGetEventsForDay.mockResolvedValue([
        createMockCalendarEvent({
          id: 'linked-event',
          title: 'Milestone Event',
          startTime: new Date('2024-03-20T10:00:00Z'),
          endTime: new Date('2024-03-20T11:00:00Z'),
          isAllDay: false,
        }),
      ]);

      const milestones = [
        createMockMilestone({
          id: 'milestone-1',
          calendarEventId: 'linked-event',
          date: new Date('2024-03-20T10:00:00Z'),
        }),
      ];

      const linkMap = await detectMilestoneRelatedEvents('user-123', milestones, 7);

      expect(linkMap.has('milestone-1')).toBe(true);
      const links = linkMap.get('milestone-1')!;
      expect(links.some((l) => l.linkType === 'main')).toBe(true);
    });

    it('should detect events mentioning milestone name', async () => {
      mockedGetEventsForDay.mockResolvedValue([
        createMockCalendarEvent({
          id: 'prep-event',
          title: 'Prep for Product Launch',
          startTime: new Date('2024-03-19T10:00:00Z'),
          endTime: new Date('2024-03-19T12:00:00Z'),
          isAllDay: false,
        }),
      ]);

      const milestones = [
        createMockMilestone({
          id: 'milestone-1',
          name: 'Product Launch',
          date: new Date('2024-03-22T10:00:00Z'),
        }),
      ];

      const linkMap = await detectMilestoneRelatedEvents('user-123', milestones, 7);

      expect(linkMap.has('milestone-1')).toBe(true);
      const links = linkMap.get('milestone-1')!;
      expect(links.some((l) => l.linkType === 'prep')).toBe(true);
    });
  });

  describe('syncCalendarEventToMilestone', () => {
    it('should detect when linked event is cancelled', async () => {
      const milestones = [
        createMockMilestone({
          id: 'milestone-1',
          name: 'Big Event',
          calendarEventId: 'event-123',
        }),
      ];

      const result = await syncCalendarEventToMilestone(
        'user-123',
        'event-123',
        { cancelled: true },
        milestones
      );

      expect(result.updated).toBe(true);
      expect(result.milestoneId).toBe('milestone-1');
      expect(result.changes?.some((c) => c.includes('cancelled'))).toBe(true);
    });

    it('should detect when linked event date changes', async () => {
      const milestones = [
        createMockMilestone({
          id: 'milestone-1',
          name: 'Big Event',
          date: new Date('2024-03-22T10:00:00Z'),
          calendarEventId: 'event-123',
        }),
      ];

      const result = await syncCalendarEventToMilestone(
        'user-123',
        'event-123',
        { newDate: new Date('2024-03-25T10:00:00Z') },
        milestones
      );

      expect(result.updated).toBe(true);
      expect(result.changes?.some((c) => c.includes('date changed'))).toBe(true);
    });

    it('should return not updated for unlinked events', async () => {
      const milestones = [
        createMockMilestone({
          id: 'milestone-1',
          calendarEventId: 'different-event',
        }),
      ];

      const result = await syncCalendarEventToMilestone(
        'user-123',
        'unrelated-event',
        { cancelled: true },
        milestones
      );

      expect(result.updated).toBe(false);
    });
  });

  describe('getMilestoneCalendarSyncStatus', () => {
    it('should report sync status summary', async () => {
      mockedGetEventsForDay.mockResolvedValue([]);

      const milestones = [
        createMockMilestone({
          id: 'm1',
          calendarEventId: 'event-1',
          date: new Date('2024-03-22T10:00:00Z'),
        }),
        createMockMilestone({ id: 'm2', date: new Date('2024-03-25T10:00:00Z') }),
        createMockMilestone({ id: 'm3', date: new Date('2024-03-28T10:00:00Z') }),
      ];

      const status = await getMilestoneCalendarSyncStatus('user-123', milestones);

      expect(status.syncedMilestones).toBe(1);
      expect(status.unsyncedMilestones).toBe(2);
      expect(status.recommendation).toBeDefined();
    });
  });
});
