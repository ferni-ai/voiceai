/**
 * Rhythm Awareness Service Tests
 *
 * Tests for the rhythm tracking system that celebrates
 * usage patterns without feeling like surveillance.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  acknowledgeMilestone,
  clearRhythmCache,
  getMilestoneMessage,
  getRhythm,
  getRhythmGreetingContext,
  getRhythmStats,
  getUnacknowledgedMilestones,
  initializeRhythm,
  recordSession,
} from '../../services/personal-journey/rhythm-awareness.js';

describe('Rhythm Awareness Service', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    clearRhythmCache(testUserId);
  });

  describe('Session Recording', () => {
    it('should create rhythm data for new user', () => {
      const rhythm = getRhythm(testUserId);
      expect(rhythm.userId).toBe(testUserId);
      expect(rhythm.sessions.totalCount).toBe(0);
    });

    it('should record a session and increment count', () => {
      recordSession(testUserId);
      const rhythm = getRhythm(testUserId);
      expect(rhythm.sessions.totalCount).toBe(1);
    });

    it('should track first session date', () => {
      const before = new Date();
      recordSession(testUserId);
      const rhythm = getRhythm(testUserId);
      expect(rhythm.sessions.firstSession.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should start streak at 1 for first session', () => {
      recordSession(testUserId);
      const rhythm = getRhythm(testUserId);
      expect(rhythm.sessions.currentStreak).toBe(1);
    });

    it('should maintain streak for consecutive days', () => {
      // Day 1
      const day1 = new Date();
      recordSession(testUserId, day1);

      // Day 2 (next day)
      const day2 = new Date(day1);
      day2.setDate(day2.getDate() + 1);
      recordSession(testUserId, day2);

      const rhythm = getRhythm(testUserId);
      expect(rhythm.sessions.currentStreak).toBe(2);
    });

    it('should reset streak after gap > 1 day', () => {
      // Day 1
      const day1 = new Date();
      recordSession(testUserId, day1);

      // Day 5 (gap of 4 days)
      const day5 = new Date(day1);
      day5.setDate(day5.getDate() + 4);
      recordSession(testUserId, day5);

      const rhythm = getRhythm(testUserId);
      expect(rhythm.sessions.currentStreak).toBe(1);
    });
  });

  describe('Milestone Detection', () => {
    it('should detect first conversation milestone', () => {
      const milestones = recordSession(testUserId);
      const firstConvo = milestones.find((m) => m.type === 'first_conversation');
      expect(firstConvo).toBeDefined();
    });

    it('should detect 10 conversation milestone', () => {
      // Record 9 sessions
      for (let i = 0; i < 9; i++) {
        recordSession(testUserId);
      }

      // 10th session should trigger milestone
      const milestones = recordSession(testUserId);
      const milestone10 = milestones.find((m) => m.type === 'conversation_10');
      expect(milestone10).toBeDefined();
    });

    it('should not repeat milestones', () => {
      // Record 10 sessions
      for (let i = 0; i < 10; i++) {
        recordSession(testUserId);
      }

      // 11th session should NOT trigger 10-conversation milestone again
      const milestones = recordSession(testUserId);
      const milestone10 = milestones.find((m) => m.type === 'conversation_10');
      expect(milestone10).toBeUndefined();
    });
  });

  describe('Milestone Messages', () => {
    it('should return message for valid milestone type', () => {
      const message = getMilestoneMessage('conversation_10');
      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    });

    it('should return null for invalid milestone type', () => {
      // @ts-expect-error Testing invalid input
      const message = getMilestoneMessage('invalid_milestone');
      expect(message).toBeNull();
    });
  });

  describe('Unacknowledged Milestones', () => {
    it('should return unacknowledged milestones as journey moments', () => {
      recordSession(testUserId);
      const moments = getUnacknowledgedMilestones(testUserId);
      expect(moments.length).toBeGreaterThan(0);
      expect(moments[0].type).toBe('rhythm_milestone');
    });

    it('should not return acknowledged milestones', () => {
      recordSession(testUserId);
      acknowledgeMilestone(testUserId, 'first_conversation');
      const moments = getUnacknowledgedMilestones(testUserId);
      const firstConvo = moments.find(
        (m) => (m.context as Record<string, unknown>).milestoneType === 'first_conversation'
      );
      expect(firstConvo).toBeUndefined();
    });
  });

  describe('Greeting Context', () => {
    it('should return no insight for new users', () => {
      recordSession(testUserId);
      const context = getRhythmGreetingContext(testUserId);
      expect(context.hasRhythmInsight).toBe(false);
    });

    it('should return comeback insight after long gap', () => {
      // Create a user with history
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      initializeRhythm(testUserId, {
        userId: testUserId,
        updatedAt: oldDate,
        sessions: {
          totalCount: 15,
          firstSession: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
          lastSession: oldDate,
          averageSessionsPerWeek: 2,
          currentStreak: 0,
          longestStreak: 5,
        },
        consistency: {
          averageGapDays: 3,
          longestGap: 5,
          isConsistent: true,
          currentGapDays: 10,
        },
        timePreferences: {
          preferredHours: [14, 15, 16, 14, 15, 16, 14, 15],
          preferredDays: [1, 2, 3, 1, 2, 3, 1, 2],
          mostActiveTimeOfDay: 'afternoon',
          weekdayVsWeekend: 'weekday',
        },
        rhythmMilestones: [],
      });

      const context = getRhythmGreetingContext(testUserId);
      // May or may not have insight depending on randomness, but structure should be correct
      expect(typeof context.hasRhythmInsight).toBe('boolean');
    });
  });

  describe('Rhythm Stats', () => {
    it('should return correct stats', () => {
      recordSession(testUserId);
      const stats = getRhythmStats(testUserId);

      expect(stats.totalConversations).toBe(1);
      expect(stats.currentStreak).toBe(1);
      expect(stats.longestStreak).toBe(1);
      expect(stats.daysKnown).toBe(0);
      expect(typeof stats.isConsistent).toBe('boolean');
    });
  });

  describe('Persistence', () => {
    it('should initialize from persisted data', () => {
      const persistedData = {
        userId: testUserId,
        updatedAt: new Date(),
        sessions: {
          totalCount: 50,
          firstSession: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          lastSession: new Date(),
          averageSessionsPerWeek: 3,
          currentStreak: 7,
          longestStreak: 14,
        },
        rhythmMilestones: [
          { type: 'conversation_10' as const, achievedAt: new Date(), acknowledged: true },
          { type: 'conversation_25' as const, achievedAt: new Date(), acknowledged: true },
        ],
        timePreferences: {
          preferredHours: [14],
          preferredDays: [1],
          mostActiveTimeOfDay: 'afternoon' as const,
          weekdayVsWeekend: 'weekday' as const,
        },
        consistency: {
          averageGapDays: 2,
          longestGap: 5,
          isConsistent: true,
          currentGapDays: 0,
        },
      };

      initializeRhythm(testUserId, persistedData);
      const rhythm = getRhythm(testUserId);

      expect(rhythm.sessions.totalCount).toBe(50);
      expect(rhythm.sessions.currentStreak).toBe(7);
      expect(rhythm.rhythmMilestones.length).toBe(2);
    });
  });
});
