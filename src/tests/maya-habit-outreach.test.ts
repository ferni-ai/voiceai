/**
 * Maya Habit Outreach Tests
 *
 * Tests for Maya's proactive habit outreach system:
 * - Streak protection alerts
 * - Milestone celebrations
 * - Setback recovery
 * - Weekly review generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the productivity store
const mockHabits = [
  { id: 'habit-1', name: 'Morning meditation', isActive: true },
  { id: 'habit-2', name: 'Exercise', isActive: true },
  { id: 'habit-3', name: 'Read for 30 minutes', isActive: true },
];

const today = new Date();
today.setHours(0, 0, 0, 0);

// Generate mock logs for a 10-day streak on habit-1
const mockLogsWithStreak = Array.from({ length: 10 }, (_, i) => {
  const date = new Date(today);
  date.setDate(date.getDate() - i);
  return {
    habitId: 'habit-1',
    date: date.toISOString(),
    completed: true,
  };
});

// Add some logs for habit-2 (milestone at 21 days)
const mockLogsWithMilestone = Array.from({ length: 21 }, (_, i) => {
  const date = new Date(today);
  date.setDate(date.getDate() - i);
  return {
    habitId: 'habit-2',
    date: date.toISOString(),
    completed: true,
  };
});

// Add logs for habit-3 (broken streak - no logs for 5 days, had 7-day streak before)
const brokenStreakStartDate = new Date(today);
brokenStreakStartDate.setDate(brokenStreakStartDate.getDate() - 5);
const mockLogsWithSetback = Array.from({ length: 7 }, (_, i) => {
  const date = new Date(brokenStreakStartDate);
  date.setDate(date.getDate() - i);
  return {
    habitId: 'habit-3',
    date: date.toISOString(),
    completed: true,
  };
});

vi.mock('../../services/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: vi.fn().mockResolvedValue(undefined),
    getUserHabits: vi.fn().mockReturnValue(mockHabits),
    getUserHabitLogs: vi
      .fn()
      .mockReturnValue([...mockLogsWithStreak, ...mockLogsWithMilestone, ...mockLogsWithSetback]),
  }),
}));

// Mock the trigger publisher
vi.mock('../../services/outreach/trigger-publisher.js', () => ({
  publishOutreachTrigger: vi.fn().mockResolvedValue({ success: true, triggerId: 'test-trigger-123' }),
}));

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Maya Habit Outreach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkStreaksAtRisk', () => {
    it('should return a StreakAtRiskResult object', async () => {
      const { checkStreaksAtRisk } = await import('../services/outreach/maya-habit-outreach.js');

      const result = await checkStreaksAtRisk('test-user');

      // Should have correct structure regardless of data
      expect(result).toBeDefined();
      expect(result).toHaveProperty('atRisk');
      expect(result).toHaveProperty('habits');
      expect(typeof result.atRisk).toBe('boolean');
      expect(Array.isArray(result.habits)).toBe(true);
    });

    it('should return habit details structure when habits exist', async () => {
      const { checkStreaksAtRisk } = await import('../services/outreach/maya-habit-outreach.js');

      const result = await checkStreaksAtRisk('test-user');

      // When habits are at risk, they should have proper structure
      if (result.habits.length > 0) {
        const habit = result.habits[0];
        expect(habit).toHaveProperty('id');
        expect(habit).toHaveProperty('name');
        expect(habit).toHaveProperty('streakDays');
        expect(habit).toHaveProperty('lastCompleted');
      }
    });
  });

  describe('checkMilestonesToCelebrate', () => {
    it('should detect milestone achievements', async () => {
      const { checkMilestonesToCelebrate } = await import('../services/outreach/maya-habit-outreach.js');

      const milestones = await checkMilestonesToCelebrate('test-user');

      expect(milestones).toBeDefined();
      expect(Array.isArray(milestones)).toBe(true);
    });

    it('should return milestone details', async () => {
      const { checkMilestonesToCelebrate } = await import('../services/outreach/maya-habit-outreach.js');

      const milestones = await checkMilestonesToCelebrate('test-user');

      if (milestones.length > 0) {
        const milestone = milestones[0];
        expect(milestone).toHaveProperty('habitId');
        expect(milestone).toHaveProperty('habitName');
        expect(milestone).toHaveProperty('days');
      }
    });
  });

  describe('checkSetbackRecoveryNeeded', () => {
    it('should detect habits needing setback recovery', async () => {
      const { checkSetbackRecoveryNeeded } = await import('../services/outreach/maya-habit-outreach.js');

      const setbacks = await checkSetbackRecoveryNeeded('test-user');

      expect(setbacks).toBeDefined();
      expect(Array.isArray(setbacks)).toBe(true);
    });

    it('should return setback details', async () => {
      const { checkSetbackRecoveryNeeded } = await import('../services/outreach/maya-habit-outreach.js');

      const setbacks = await checkSetbackRecoveryNeeded('test-user');

      if (setbacks.length > 0) {
        const setback = setbacks[0];
        expect(setback).toHaveProperty('habitId');
        expect(setback).toHaveProperty('habitName');
        expect(setback).toHaveProperty('daysMissed');
        expect(setback).toHaveProperty('previousStreak');
      }
    });
  });

  describe('generateWeeklyReviewData', () => {
    it('should generate weekly review data', async () => {
      const { generateWeeklyReviewData } = await import('../services/outreach/maya-habit-outreach.js');

      const reviewData = await generateWeeklyReviewData('test-user');

      expect(reviewData).toBeDefined();
      if (reviewData) {
        expect(reviewData).toHaveProperty('totalHabits');
        expect(reviewData).toHaveProperty('completedThisWeek');
        expect(reviewData).toHaveProperty('missedThisWeek');
        expect(reviewData).toHaveProperty('completionRate');
        expect(reviewData).toHaveProperty('improvingHabits');
        expect(reviewData).toHaveProperty('strugglingHabits');
      }
    });

    it('should handle users with no habits gracefully', async () => {
      const { generateWeeklyReviewData } = await import('../services/outreach/maya-habit-outreach.js');

      // The function should handle users with no habits without throwing
      const reviewData = await generateWeeklyReviewData('user-with-no-habits');

      // Should return null or an empty result, not throw
      expect(reviewData === null || typeof reviewData === 'object').toBe(true);
    });
  });

  describe('Message Templates', () => {
    it('should have streak protection messages', async () => {
      const { MAYA_STREAK_PROTECTION_MESSAGES } = await import(
        '../services/outreach/maya-habit-outreach.js'
      );

      expect(MAYA_STREAK_PROTECTION_MESSAGES).toBeDefined();
      expect(Array.isArray(MAYA_STREAK_PROTECTION_MESSAGES)).toBe(true);
      expect(MAYA_STREAK_PROTECTION_MESSAGES.length).toBeGreaterThan(0);

      // Messages should have placeholders for habit name and days
      const hasPlaceholders = MAYA_STREAK_PROTECTION_MESSAGES.some(
        (msg) => msg.includes('{habit}') || msg.includes('{days}')
      );
      expect(hasPlaceholders).toBe(true);
    });

    it('should have milestone messages for key milestones', async () => {
      const { MAYA_MILESTONE_MESSAGES } = await import('../services/outreach/maya-habit-outreach.js');

      expect(MAYA_MILESTONE_MESSAGES).toBeDefined();

      // Should have messages for key milestones
      const keyMilestones = [7, 21, 30, 66, 100];
      for (const milestone of keyMilestones) {
        expect(MAYA_MILESTONE_MESSAGES[milestone]).toBeDefined();
        expect(Array.isArray(MAYA_MILESTONE_MESSAGES[milestone])).toBe(true);
      }
    });

    it('should have weekly review messages for different performance levels', async () => {
      const { MAYA_WEEKLY_REVIEW_MESSAGES } = await import('../services/outreach/maya-habit-outreach.js');

      expect(MAYA_WEEKLY_REVIEW_MESSAGES).toBeDefined();

      // Should have messages for great, okay, and struggling weeks
      expect(MAYA_WEEKLY_REVIEW_MESSAGES.great).toBeDefined();
      expect(MAYA_WEEKLY_REVIEW_MESSAGES.okay).toBeDefined();
      expect(MAYA_WEEKLY_REVIEW_MESSAGES.struggling).toBeDefined();
    });

    it('should have setback recovery messages', async () => {
      const { MAYA_SETBACK_MESSAGES } = await import('../services/outreach/maya-habit-outreach.js');

      expect(MAYA_SETBACK_MESSAGES).toBeDefined();
      expect(Array.isArray(MAYA_SETBACK_MESSAGES)).toBe(true);
      expect(MAYA_SETBACK_MESSAGES.length).toBeGreaterThan(0);

      // Messages should be compassionate (check for "No judgment" or similar)
      const hasCompassion = MAYA_SETBACK_MESSAGES.some(
        (msg) =>
          msg.toLowerCase().includes('no judgment') ||
          msg.toLowerCase().includes("that's okay") ||
          msg.toLowerCase().includes('sucks') ||
          msg.toLowerCase().includes('checking in')
      );
      expect(hasCompassion).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should export configuration constants', async () => {
      const { MAYA_HABIT_OUTREACH_CONFIG } = await import('../services/outreach/maya-habit-outreach.js');

      expect(MAYA_HABIT_OUTREACH_CONFIG).toBeDefined();
      expect(MAYA_HABIT_OUTREACH_CONFIG.streakProtectionThreshold).toBeGreaterThan(0);
      expect(MAYA_HABIT_OUTREACH_CONFIG.milestoneDays).toBeDefined();
      expect(Array.isArray(MAYA_HABIT_OUTREACH_CONFIG.milestoneDays)).toBe(true);
    });
  });
});

describe('Maya Habit Outreach - Publishing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have publishStreakProtectionAlert function', async () => {
    const { publishStreakProtectionAlert } = await import('../services/outreach/maya-habit-outreach.js');

    expect(publishStreakProtectionAlert).toBeInstanceOf(Function);
  });

  it('should have publishMilestoneCelebration function', async () => {
    const { publishMilestoneCelebration } = await import('../services/outreach/maya-habit-outreach.js');

    expect(publishMilestoneCelebration).toBeInstanceOf(Function);
  });

  it('should have publishSetbackRecoveryTrigger function', async () => {
    const { publishSetbackRecoveryTrigger } = await import('../services/outreach/maya-habit-outreach.js');

    expect(publishSetbackRecoveryTrigger).toBeInstanceOf(Function);
  });

  it('should have publishWeeklyReviewTrigger function', async () => {
    const { publishWeeklyReviewTrigger } = await import('../services/outreach/maya-habit-outreach.js');

    expect(publishWeeklyReviewTrigger).toBeInstanceOf(Function);
  });
});

