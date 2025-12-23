/**
 * Recovery Protection Service Tests
 *
 * Tests for the "Better Than Human" recovery protection service
 * that proactively protects user time and suggests recovery blocks.
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
  getDayOverview: vi.fn(),
  getWeekOverview: vi.fn(),
  findFreeTimeSlots: vi.fn(),
  createEvent: vi.fn(),
}));

vi.mock('../calendar-load-service.js', () => ({
  getCalendarLoadFactors: vi.fn(),
}));

// Import after mocks
import {
  detectRecoveryNeeds,
  autoBlockRecoveryTime,
  findRecoveryOpportunities,
  getRecoverySuggestions,
  buildRecoveryContext,
  type RecoveryRecommendation,
  type RecoverySettings,
} from '../recovery-protection.js';
import * as calendarService from '../calendar-service.js';
import * as calendarLoadService from '../calendar-load-service.js';

describe('Recovery Protection Service', () => {
  const mockUserId = 'test-user-123';

  // Helper to create a mock CalendarEvent
  const createMockEvent = (
    overrides: Partial<{
      id: string;
      title: string;
      isAllDay: boolean;
      startTime: Date;
      endTime: Date;
    }> = {}
  ) => ({
    id: overrides.id ?? `event-${Math.random().toString(36).slice(2)}`,
    title: overrides.title ?? 'Test Meeting',
    description: '',
    location: '',
    startTime: overrides.startTime ?? new Date(),
    endTime: overrides.endTime ?? new Date(),
    isAllDay: overrides.isAllDay ?? false,
    attendees: [] as string[],
    status: 'confirmed' as const,
    calendarId: 'primary',
  });

  // Helper to create mock day overview
  const createMockDayOverview = (
    overrides: Partial<{
      totalMeetings: number;
      totalMeetingMinutes: number;
      freeTimeMinutes: number;
      isOverloaded: boolean;
      hasBackToBack: boolean;
    }> = {}
  ) => ({
    date: new Date(),
    events: [] as ReturnType<typeof createMockEvent>[],
    totalMeetings: overrides.totalMeetings ?? 3,
    totalMeetingMinutes: overrides.totalMeetingMinutes ?? 180,
    freeTimeMinutes: overrides.freeTimeMinutes ?? 120,
    isOverloaded: overrides.isOverloaded ?? false,
    hasBackToBack: overrides.hasBackToBack ?? false,
    firstEvent: undefined,
    lastEvent: undefined,
  });

  // Helper to create mock load factors
  const createMockLoadFactors = (
    overrides: Partial<{
      weeklyMeetingHours: number;
      weeklyFocusTimeRatio: number;
      weeklyBackToBackPercentage: number;
      consecutiveMeetingStreak: number;
      consecutiveOverloadedDays: number;
      noRecoveryDays: number;
    }> = {}
  ) => ({
    weeklyMeetingHours: overrides.weeklyMeetingHours ?? 20,
    weeklyFocusTimeRatio: overrides.weeklyFocusTimeRatio ?? 0.5,
    weeklyBackToBackPercentage: overrides.weeklyBackToBackPercentage ?? 20,
    todayMeetingHours: 4,
    todayFocusTimeMinutes: 120,
    consecutiveMeetingStreak: overrides.consecutiveMeetingStreak ?? 0,
    meetingHoursTrend: 'stable' as const,
    previousWeekHours: 20,
    weekOverWeekChange: 0,
    heaviestDayThisWeek: 'Tuesday',
    lightestDayThisWeek: 'Friday',
    upcomingHeavyDays: [],
    consecutiveOverloadedDays: overrides.consecutiveOverloadedDays ?? 0,
    noRecoveryDays: overrides.noRecoveryDays ?? 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('detectRecoveryNeeds', () => {
    it('should return empty array when recovery protection disabled', async () => {
      const result = await detectRecoveryNeeds(mockUserId, { enabled: false });

      expect(result).toEqual([]);
    });

    it('should detect long meeting streak', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({ consecutiveMeetingStreak: 200 }) // 3+ hours
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(createMockDayOverview());

      const result = await detectRecoveryNeeds(mockUserId);

      expect(result.length).toBeGreaterThan(0);
      const blockTimeRec = result.find((r) => r.type === 'block_time');
      expect(blockTimeRec).toBeDefined();
      expect(blockTimeRec?.reason).toContain('meetings for');
      expect(blockTimeRec?.urgency).toBe('immediate');
      expect(blockTimeRec?.confidence).toBe(95);
    });

    it('should detect overloaded day', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors()
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(
        createMockDayOverview({ isOverloaded: true, totalMeetingMinutes: 420 }) // 7 hours
      );

      const result = await detectRecoveryNeeds(mockUserId);

      const declineRec = result.find((r) => r.type === 'decline_meeting');
      expect(declineRec).toBeDefined();
      expect(declineRec?.reason).toContain('meetings');
      expect(declineRec?.urgency).toBe('today');
    });

    it('should detect back-to-back with no free time', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors()
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(
        createMockDayOverview({ hasBackToBack: true, freeTimeMinutes: 15 })
      );

      const result = await detectRecoveryNeeds(mockUserId);

      const addBreakRec = result.find((r) => r.type === 'add_break');
      expect(addBreakRec).toBeDefined();
      expect(addBreakRec?.reason).toContain('No breaks');
      expect(addBreakRec?.urgency).toBe('today');
    });

    it('should detect heavy week', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({ weeklyMeetingHours: 35 })
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(createMockDayOverview());

      const result = await detectRecoveryNeeds(mockUserId);

      const blockTimeRec = result.find((r) => r.type === 'block_time' && r.urgency === 'this_week');
      expect(blockTimeRec).toBeDefined();
      expect(blockTimeRec?.reason).toContain('35h');
    });

    it('should detect no recovery days', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({ noRecoveryDays: 4 })
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(createMockDayOverview());

      const result = await detectRecoveryNeeds(mockUserId);

      const rescheduleRec = result.find((r) => r.type === 'reschedule');
      expect(rescheduleRec).toBeDefined();
      expect(rescheduleRec?.reason).toContain('4 days');
    });

    it('should detect consecutive overloaded days', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({ consecutiveOverloadedDays: 3 })
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(createMockDayOverview());

      const result = await detectRecoveryNeeds(mockUserId);

      const blockTimeRec = result.find(
        (r) => r.type === 'block_time' && r.reason.includes('consecutive')
      );
      expect(blockTimeRec).toBeDefined();
      expect(blockTimeRec?.urgency).toBe('immediate');
      expect(blockTimeRec?.confidence).toBe(90);
    });

    it('should sort recommendations by urgency then confidence', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({
          consecutiveMeetingStreak: 200, // immediate
          weeklyMeetingHours: 35, // this_week
        })
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(
        createMockDayOverview({ isOverloaded: true }) // today
      );

      const result = await detectRecoveryNeeds(mockUserId);

      // First should be immediate urgency
      expect(result[0].urgency).toBe('immediate');
      // Following should be today, then this_week
      const urgencies = result.map((r) => r.urgency);
      const immediateIndex = urgencies.indexOf('immediate');
      const todayIndex = urgencies.indexOf('today');
      const weekIndex = urgencies.indexOf('this_week');

      if (todayIndex !== -1) {
        expect(immediateIndex).toBeLessThan(todayIndex);
      }
      if (weekIndex !== -1 && todayIndex !== -1) {
        expect(todayIndex).toBeLessThan(weekIndex);
      }
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockRejectedValue(
        new Error('API Error')
      );

      const result = await detectRecoveryNeeds(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('autoBlockRecoveryTime', () => {
    it('should return null when disabled', async () => {
      const result = await autoBlockRecoveryTime(mockUserId, 200, { enabled: false });

      expect(result).toBeNull();
    });

    it('should return null when streak below threshold', async () => {
      const result = await autoBlockRecoveryTime(mockUserId, 120); // 2 hours, default threshold is 3

      expect(result).toBeNull();
    });

    it('should return null when no free slots available', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([]);

      const result = await autoBlockRecoveryTime(mockUserId, 200);

      expect(result).toBeNull();
    });

    it('should create recovery event when conditions met', async () => {
      const now = new Date();
      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([
        {
          start: new Date(now.getTime() + 30 * 60 * 1000),
          end: new Date(now.getTime() + 90 * 60 * 1000),
          durationMinutes: 60,
        },
      ]);
      vi.mocked(calendarService.createEvent).mockResolvedValue({
        id: 'recovery-event-1',
        title: '🧘 Recovery Time',
        startTime: new Date(),
        endTime: new Date(),
        isAllDay: false,
        status: 'confirmed',
        attendees: [],
        calendarId: 'primary',
      });

      const result = await autoBlockRecoveryTime(mockUserId, 200);

      expect(result).not.toBeNull();
      expect(calendarService.createEvent).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          title: '🧘 Recovery Time',
          description: expect.stringContaining('Auto-blocked by Ferni'),
        })
      );
    });

    it('should use next upcoming free slot', async () => {
      const now = new Date();
      const pastSlot = {
        start: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
        end: new Date(now.getTime() - 30 * 60 * 1000),
        durationMinutes: 30,
      };
      const futureSlot = {
        start: new Date(now.getTime() + 30 * 60 * 1000), // 30 min from now
        end: new Date(now.getTime() + 90 * 60 * 1000),
        durationMinutes: 60,
      };

      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([pastSlot, futureSlot]);
      vi.mocked(calendarService.createEvent).mockResolvedValue({
        id: 'recovery-event-1',
        title: '🧘 Recovery Time',
        startTime: futureSlot.start,
        endTime: futureSlot.end,
        isAllDay: false,
        status: 'confirmed',
        attendees: [],
        calendarId: 'primary',
      });

      await autoBlockRecoveryTime(mockUserId, 200);

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          startTime: futureSlot.start,
        })
      );
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(calendarService.findFreeTimeSlots).mockRejectedValue(new Error('API Error'));

      const result = await autoBlockRecoveryTime(mockUserId, 200);

      expect(result).toBeNull();
    });
  });

  describe('findRecoveryOpportunities', () => {
    it('should find recovery opportunities in the week', async () => {
      const monday = new Date('2024-12-16T09:00:00');
      const tuesday = new Date(monday.getTime() + 24 * 60 * 60 * 1000);
      vi.mocked(calendarService.getWeekOverview).mockResolvedValue({
        startDate: monday,
        endDate: tuesday,
        days: [
          {
            date: monday,
            events: [],
            totalMeetings: 2,
            totalMeetingMinutes: 120,
            freeTimeMinutes: 360,
            isOverloaded: false,
            hasBackToBack: false,
            firstEvent: undefined,
            lastEvent: undefined,
          },
          {
            date: tuesday,
            events: [],
            totalMeetings: 5,
            totalMeetingMinutes: 300,
            freeTimeMinutes: 180,
            isOverloaded: false,
            hasBackToBack: false,
            firstEvent: undefined,
            lastEvent: undefined,
          },
        ],
        totalMeetings: 7,
        busiestDay: { day: 'Tuesday', meetings: 5 },
        lightestDay: { day: 'Monday', meetings: 2 },
        backToBackDays: [],
        averageMeetingsPerDay: 3.5,
      });

      vi.mocked(calendarService.findFreeTimeSlots).mockImplementation(async (userId, date) => {
        const d = date as Date;
        const isMonday = d.getDay() === 1;
        if (isMonday) {
          return [
            {
              start: new Date(d.setHours(9, 0)),
              end: new Date(d.setHours(11, 0)),
              durationMinutes: 120,
            },
            {
              start: new Date(d.setHours(14, 0)),
              end: new Date(d.setHours(16, 0)),
              durationMinutes: 120,
            },
          ];
        }
        return [
          {
            start: new Date(d.setHours(16, 0)),
            end: new Date(d.setHours(17, 0)),
            durationMinutes: 60,
          },
        ];
      });

      const result = await findRecoveryOpportunities(mockUserId);

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((o) => ['excellent', 'good', 'fair'].includes(o.quality))).toBe(true);
    });

    it('should skip weekends', async () => {
      const saturday = new Date('2024-12-21T09:00:00'); // Saturday
      const sunday = new Date('2024-12-22T09:00:00'); // Sunday

      vi.mocked(calendarService.getWeekOverview).mockResolvedValue({
        startDate: saturday,
        endDate: sunday,
        days: [
          {
            date: saturday,
            events: [],
            totalMeetings: 0,
            totalMeetingMinutes: 0,
            freeTimeMinutes: 480,
            isOverloaded: false,
            hasBackToBack: false,
            firstEvent: undefined,
            lastEvent: undefined,
          },
          {
            date: sunday,
            events: [],
            totalMeetings: 0,
            totalMeetingMinutes: 0,
            freeTimeMinutes: 480,
            isOverloaded: false,
            hasBackToBack: false,
            firstEvent: undefined,
            lastEvent: undefined,
          },
        ],
        totalMeetings: 0,
        busiestDay: null,
        lightestDay: null,
        backToBackDays: [],
        averageMeetingsPerDay: 0,
      });

      const result = await findRecoveryOpportunities(mockUserId);

      expect(result).toHaveLength(0);
      expect(calendarService.findFreeTimeSlots).not.toHaveBeenCalled();
    });

    it('should rate morning and after-lunch slots as excellent on light days', async () => {
      // Use explicit Monday date with time component
      const monday = new Date('2024-12-16T12:00:00'); // Monday
      expect(monday.getDay()).toBe(1); // Verify it's Monday

      vi.mocked(calendarService.getWeekOverview).mockResolvedValue({
        startDate: monday,
        endDate: monday,
        days: [
          {
            date: monday,
            events: [],
            totalMeetings: 2,
            totalMeetingMinutes: 60,
            freeTimeMinutes: 420,
            isOverloaded: false,
            hasBackToBack: false,
            firstEvent: undefined,
            lastEvent: undefined,
          },
        ],
        totalMeetings: 2,
        busiestDay: null,
        lightestDay: { day: 'Monday', meetings: 2 },
        backToBackDays: [],
        averageMeetingsPerDay: 2,
      });

      // Morning slot at 9am - use explicit time construction
      const morningSlotStart = new Date('2024-12-16T09:00:00');
      const morningSlotEnd = new Date('2024-12-16T11:00:00');
      const morningSlot = {
        start: morningSlotStart,
        end: morningSlotEnd,
        durationMinutes: 120,
      };

      // Verify the hour is correct
      expect(morningSlotStart.getHours()).toBe(9);

      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue([morningSlot]);

      const result = await findRecoveryOpportunities(mockUserId);

      expect(result.length).toBeGreaterThan(0);
      // Light day (< 3 meetings) + 9am = excellent
      expect(result[0].quality).toBe('excellent');
    });

    it('should limit results to top 10', async () => {
      const monday = new Date('2024-12-16');

      vi.mocked(calendarService.getWeekOverview).mockResolvedValue({
        startDate: monday,
        endDate: new Date(monday.getTime() + 4 * 24 * 60 * 60 * 1000),
        days: Array(5)
          .fill(null)
          .map((_, i) => ({
            date: new Date(monday.getTime() + i * 24 * 60 * 60 * 1000),
            events: [],
            totalMeetings: 1,
            totalMeetingMinutes: 60,
            freeTimeMinutes: 420,
            isOverloaded: false,
            hasBackToBack: false,
            firstEvent: undefined,
            lastEvent: undefined,
          })),
        totalMeetings: 5,
        busiestDay: null,
        lightestDay: null,
        backToBackDays: [],
        averageMeetingsPerDay: 1,
      });

      vi.mocked(calendarService.findFreeTimeSlots).mockResolvedValue(
        Array(5)
          .fill(null)
          .map((_, i) => ({
            start: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 9 + i, 0),
            end: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 10 + i, 0),
            durationMinutes: 60,
          }))
      );

      const result = await findRecoveryOpportunities(mockUserId);

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(calendarService.getWeekOverview).mockRejectedValue(new Error('API Error'));

      const result = await findRecoveryOpportunities(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('getRecoverySuggestions', () => {
    it('should return human-readable suggestions', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({ consecutiveMeetingStreak: 200 })
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(
        createMockDayOverview({ isOverloaded: true })
      );

      const result = await getRecoverySuggestions(mockUserId);

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((s) => typeof s === 'string')).toBe(true);
    });

    it('should limit to 3 suggestions', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({
          consecutiveMeetingStreak: 200,
          weeklyMeetingHours: 35,
          noRecoveryDays: 4,
          consecutiveOverloadedDays: 3,
        })
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(
        createMockDayOverview({ isOverloaded: true, hasBackToBack: true, freeTimeMinutes: 15 })
      );

      const result = await getRecoverySuggestions(mockUserId);

      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe('buildRecoveryContext', () => {
    it('should return empty string when no recommendations', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors()
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(createMockDayOverview());

      const result = await buildRecoveryContext(mockUserId);

      expect(result).toBe('');
    });

    it('should build context with immediate attention section', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({ consecutiveMeetingStreak: 200 })
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(createMockDayOverview());

      const result = await buildRecoveryContext(mockUserId);

      expect(result).toContain('RECOVERY PROTECTION');
      expect(result).toContain('Immediate Attention Needed');
    });

    it('should include today section for today-urgency items', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors()
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(
        createMockDayOverview({ isOverloaded: true })
      );

      const result = await buildRecoveryContext(mockUserId);

      expect(result).toContain("Today's Recovery Needs");
    });

    it('should include proactive offer at end', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({ consecutiveMeetingStreak: 200 })
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(createMockDayOverview());

      const result = await buildRecoveryContext(mockUserId);

      expect(result).toContain('proactively offer');
    });
  });

  describe('Custom settings', () => {
    it('should respect custom autoBlockAfterMinutes threshold', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors({ consecutiveMeetingStreak: 100 }) // Below default 180 but above custom 60
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(createMockDayOverview());

      // With default settings, 100 minutes shouldn't trigger
      const defaultResult = await detectRecoveryNeeds(mockUserId);
      const defaultBlockRec = defaultResult.find(
        (r) => r.type === 'block_time' && r.reason.includes('meetings for')
      );
      expect(defaultBlockRec).toBeUndefined();

      // With custom settings (60 min threshold), it should trigger
      const customResult = await detectRecoveryNeeds(mockUserId, { autoBlockAfterMinutes: 60 });
      const customBlockRec = customResult.find(
        (r) => r.type === 'block_time' && r.reason.includes('meetings for')
      );
      expect(customBlockRec).toBeDefined();
    });

    it('should respect custom maxMeetingHoursPerDay', async () => {
      vi.mocked(calendarLoadService.getCalendarLoadFactors).mockResolvedValue(
        createMockLoadFactors()
      );
      vi.mocked(calendarService.getDayOverview).mockResolvedValue(
        createMockDayOverview({ isOverloaded: true, totalMeetingMinutes: 300 }) // 5 hours
      );

      const result = await detectRecoveryNeeds(mockUserId, { maxMeetingHoursPerDay: 4 });

      const declineRec = result.find((r) => r.type === 'decline_meeting');
      expect(declineRec?.reason).toContain('4h limit');
    });
  });
});
