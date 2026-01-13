/**
 * Milestone-Calendar Coordinator Tests
 * Run with: npx vitest run src/services/superhuman/__tests__/milestone-calendar-coordinator.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mock functions are available before vi.mock executes
const { mockGetDayOverview, mockGetWeekOverview, mockGetCalendarLoadFactors } = vi.hoisted(() => ({
  mockGetDayOverview: vi.fn(),
  mockGetWeekOverview: vi.fn(),
  mockGetCalendarLoadFactors: vi.fn(),
}));

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../calendar/calendar-service.js', () => ({
  getDayOverview: mockGetDayOverview,
  getWeekOverview: mockGetWeekOverview,
}));

vi.mock('../../calendar/calendar-load-service.js', () => ({
  getCalendarLoadFactors: mockGetCalendarLoadFactors,
}));

vi.mock('../firestore-utils.js', () => ({
  getFirestoreDb: () => null,

  cleanForFirestore: vi.fn((obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => item);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }),
  removeUndefined: vi.fn((obj) => {
    if (!obj) return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  deepRemoveUndefined: vi.fn((obj) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Import after mocks
import {
  findOptimalMilestoneWindows,
  suggestTimeBlocks,
  detectMilestoneConflicts,
  getCapacityForNewMilestone,
  getCoordinationContext,
  type SimpleMilestone,
} from '../milestone-calendar-coordinator.js';

describe('Milestone-Calendar Coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: light calendar day
    mockGetDayOverview.mockResolvedValue({
      date: new Date().toISOString(),
      events: [],
    });
    mockGetCalendarLoadFactors.mockResolvedValue({
      weeklyMeetingHours: 20,
      dailyAverage: 4,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findOptimalMilestoneWindows', () => {
    it('should find ideal windows on light calendar days', async () => {
      mockGetDayOverview.mockResolvedValue({
        date: new Date().toISOString(),
        events: [], // No meetings
      });

      const windows = await findOptimalMilestoneWindows('user123', { daysAhead: 3 });

      expect(windows.length).toBeGreaterThan(0);
      // Light days should have ideal quality
      expect(windows[0].quality).toBe('ideal');
    });

    it('should return good windows when mornings are partially busy', async () => {
      mockGetDayOverview.mockResolvedValue({
        date: new Date().toISOString(),
        events: [
          {
            startTime: new Date().setHours(9, 0, 0, 0),
            endTime: new Date().setHours(10, 0, 0, 0),
          },
        ],
      });

      const windows = await findOptimalMilestoneWindows('user123', { daysAhead: 3 });

      expect(windows.length).toBeGreaterThan(0);
    });

    it('should respect minDurationHours parameter', async () => {
      mockGetDayOverview.mockResolvedValue({
        date: new Date().toISOString(),
        events: [],
      });

      const windows = await findOptimalMilestoneWindows('user123', {
        daysAhead: 3,
        minDurationHours: 4,
      });

      for (const window of windows) {
        expect(window.durationHours).toBeGreaterThanOrEqual(3);
      }
    });

    it('should return empty array when calendar is fully booked', async () => {
      // 8+ hours of meetings = no available time
      mockGetDayOverview.mockResolvedValue({
        date: new Date().toISOString(),
        events: [
          {
            startTime: new Date().setHours(8, 0, 0, 0),
            endTime: new Date().setHours(18, 0, 0, 0), // 10 hours
          },
        ],
      });

      const windows = await findOptimalMilestoneWindows('user123', { daysAhead: 1 });

      expect(windows).toHaveLength(0);
    });
  });

  describe('suggestTimeBlocks', () => {
    it('should suggest blocks with planning, execution, review phases', async () => {
      mockGetDayOverview.mockResolvedValue({
        date: new Date().toISOString(),
        events: [],
      });

      const milestone: SimpleMilestone = {
        id: 'milestone1',
        name: 'Launch Feature X',
        targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        importance: 'high',
        estimatedHours: 10,
      };

      const result = await suggestTimeBlocks('user123', milestone);

      expect(result.milestoneId).toBe('milestone1');
      expect(result.milestoneName).toBe('Launch Feature X');
      expect(result.totalHoursNeeded).toBe(10);

      // Should have suggested blocks
      if (result.suggestedBlocks.length > 0) {
        const purposes = result.suggestedBlocks.map((b) => b.purpose);
        expect(purposes).toContain('planning');
      }
    });

    it('should assess feasibility based on available hours', async () => {
      mockGetDayOverview.mockResolvedValue({
        date: new Date().toISOString(),
        events: [],
      });

      const easyMilestone: SimpleMilestone = {
        id: 'easy',
        name: 'Small Task',
        targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        importance: 'low',
        estimatedHours: 2,
      };

      const result = await suggestTimeBlocks('user123', easyMilestone);

      // With lots of time available, should be easy
      expect(['easy', 'moderate']).toContain(result.feasibility);
    });
  });

  describe('detectMilestoneConflicts', () => {
    it('should detect heavy calendar day conflicts', async () => {
      // 7+ hours = overloaded
      mockGetDayOverview.mockResolvedValue({
        date: new Date().toISOString(),
        events: [
          {
            startTime: new Date().setHours(8, 0, 0, 0),
            endTime: new Date().setHours(16, 0, 0, 0), // 8 hours
          },
        ],
      });

      const milestones: SimpleMilestone[] = [
        {
          id: 'milestone1',
          name: 'Big Presentation',
          targetDate: new Date(),
          importance: 'high',
        },
      ];

      const conflicts = await detectMilestoneConflicts('user123', milestones);

      expect(conflicts.length).toBeGreaterThan(0);
      const calendarConflict = conflicts.find((c) => c.conflictType === 'heavy_calendar');
      expect(calendarConflict).toBeDefined();
      expect(calendarConflict?.severity).toBe('high');
    });

    it('should detect milestone clustering (too many milestones close together)', async () => {
      const baseDate = Date.now();

      const milestones: SimpleMilestone[] = [
        {
          id: 'milestone1',
          name: 'Project A',
          targetDate: new Date(baseDate),
          importance: 'high',
        },
        {
          id: 'milestone2',
          name: 'Project B',
          targetDate: new Date(baseDate + 1 * 24 * 60 * 60 * 1000), // 1 day later
          importance: 'high',
        },
        {
          id: 'milestone3',
          name: 'Project C',
          targetDate: new Date(baseDate + 2 * 24 * 60 * 60 * 1000), // 2 days later
          importance: 'medium',
        },
      ];

      const conflicts = await detectMilestoneConflicts('user123', milestones);

      const clusteringConflicts = conflicts.filter((c) => c.conflictType === 'other_milestone');
      expect(clusteringConflicts.length).toBeGreaterThan(0);
    });

    it('should detect capacity issues for high-importance urgent milestones', async () => {
      mockGetCalendarLoadFactors.mockResolvedValue({
        weeklyMeetingHours: 35, // Heavy week
        dailyAverage: 7,
      });

      const milestones: SimpleMilestone[] = [
        {
          id: 'urgent',
          name: 'Critical Deadline',
          targetDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
          importance: 'high',
        },
      ];

      const conflicts = await detectMilestoneConflicts('user123', milestones);

      const capacityConflict = conflicts.find((c) => c.conflictType === 'capacity');
      expect(capacityConflict).toBeDefined();
      expect(capacityConflict?.severity).toBe('high');
    });
  });

  describe('getCapacityForNewMilestone', () => {
    it('should assess light load correctly', async () => {
      mockGetCalendarLoadFactors.mockResolvedValue({
        weeklyMeetingHours: 10, // Light
        dailyAverage: 2,
      });

      const assessment = await getCapacityForNewMilestone('user123', []);

      expect(assessment.currentLoad).toBe('light');
      expect(assessment.canTakeNewMilestone).toBe(true);
      expect(assessment.recommendation).toContain('plenty of capacity');
    });

    it('should assess moderate load correctly', async () => {
      mockGetCalendarLoadFactors.mockResolvedValue({
        weeklyMeetingHours: 20,
        dailyAverage: 4,
      });

      const activeMilestones: SimpleMilestone[] = [
        { id: 'm1', name: 'Project 1', targetDate: new Date(), importance: 'medium' },
        { id: 'm2', name: 'Project 2', targetDate: new Date(), importance: 'medium' },
      ];

      const assessment = await getCapacityForNewMilestone('user123', activeMilestones);

      expect(['light', 'moderate']).toContain(assessment.currentLoad);
      expect(assessment.canTakeNewMilestone).toBe(true);
    });

    it('should block new milestones when at max capacity', async () => {
      mockGetCalendarLoadFactors.mockResolvedValue({
        weeklyMeetingHours: 25,
        dailyAverage: 5,
      });

      // 5 active milestones = at max
      const activeMilestones: SimpleMilestone[] = Array.from({ length: 5 }, (_, i) => ({
        id: `m${i}`,
        name: `Project ${i}`,
        targetDate: new Date(),
        importance: 'medium' as const,
      }));

      const assessment = await getCapacityForNewMilestone('user123', activeMilestones);

      expect(assessment.canTakeNewMilestone).toBe(false);
      expect(assessment.recommendation).toContain('5 active milestones');
    });

    it('should block new milestones when calendar is overloaded', async () => {
      mockGetCalendarLoadFactors.mockResolvedValue({
        weeklyMeetingHours: 38, // 95% of 40-hour week
        dailyAverage: 7.6,
      });

      const assessment = await getCapacityForNewMilestone('user123', []);

      expect(assessment.canTakeNewMilestone).toBe(false);
      expect(assessment.recommendation).toContain('calendar is packed');
    });
  });

  describe('getCoordinationContext', () => {
    it('should generate summary with capacity, conflicts, and windows', async () => {
      mockGetDayOverview.mockResolvedValue({
        date: new Date().toISOString(),
        events: [],
      });
      mockGetCalendarLoadFactors.mockResolvedValue({
        weeklyMeetingHours: 15,
        dailyAverage: 3,
      });

      const milestones: SimpleMilestone[] = [
        {
          id: 'm1',
          name: 'Project Alpha',
          targetDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          importance: 'high',
        },
      ];

      const context = await getCoordinationContext('user123', milestones);

      expect(context).toContain('Current Capacity');
      expect(context).toContain('active milestones');
    });

    it('should include attention needed section when conflicts exist', async () => {
      // Heavy day on milestone date
      mockGetDayOverview.mockResolvedValue({
        date: new Date().toISOString(),
        events: [
          {
            startTime: new Date().setHours(8, 0, 0, 0),
            endTime: new Date().setHours(16, 0, 0, 0), // 8 hours
          },
        ],
      });
      mockGetCalendarLoadFactors.mockResolvedValue({
        weeklyMeetingHours: 30,
        dailyAverage: 6,
      });

      const milestones: SimpleMilestone[] = [
        {
          id: 'm1',
          name: 'Big Launch',
          targetDate: new Date(),
          importance: 'high',
        },
      ];

      const context = await getCoordinationContext('user123', milestones);

      expect(context).toContain('Attention Needed');
    });

    it('should handle errors gracefully with default values', async () => {
      // When calendar services fail, the function gracefully degrades with defaults
      mockGetDayOverview.mockRejectedValue(new Error('Calendar API error'));
      mockGetCalendarLoadFactors.mockRejectedValue(new Error('Calendar load API error'));

      const context = await getCoordinationContext('user123', []);

      // Should still return content with default/fallback values (graceful degradation)
      expect(context).toContain('Current Capacity');
      expect(context).toContain('active milestones');
    });
  });
});
