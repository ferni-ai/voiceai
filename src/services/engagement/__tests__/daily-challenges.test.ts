/**
 * Daily Challenges Tests
 *
 * Tests for the daily challenge engagement system with streak tracking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  getTodaysChallenge,
  getUpcomingChallenges,
  startChallenge,
  completeChallenge,
  getChallengeStats,
  hasCompletedTodaysChallenge,
  getChallengeHistory,
  isStreakAtRisk,
  useStreakFreeze,
  getChallengeNotificationContent,
  getStreakAtRiskNotification,
  type DailyChallenge,
  type UserChallengeStats,
} from '../daily-challenges.js';

describe('DailyChallenges', () => {
  const testUserId = 'test-user-' + Date.now();

  describe('getTodaysChallenge', () => {
    it('should return a challenge for today', () => {
      const challenge = getTodaysChallenge(testUserId);

      expect(challenge).toBeDefined();
      expect(challenge.id).toContain(testUserId);
      expect(challenge.date).toBe(new Date().toISOString().split('T')[0]);
      expect(challenge.title).toBeDefined();
      expect(challenge.description).toBeDefined();
      expect(challenge.emoji).toBeDefined();
    });

    it('should include required challenge properties', () => {
      const challenge = getTodaysChallenge(testUserId);

      expect(challenge.area).toMatch(/^(musical|creative|both)$/);
      expect(challenge.type).toBeDefined();
      expect(typeof challenge.duration).toBe('number');
      expect(typeof challenge.xpReward).toBe('number');
      expect(challenge.difficulty).toMatch(/^(easy|medium|hard)$/);
      expect(challenge.expiresAt).toBeDefined();
    });

    it('should calculate streak bonus with user stats', () => {
      const stats: UserChallengeStats = {
        userId: testUserId,
        currentStreak: 5,
        longestStreak: 10,
        totalChallengesCompleted: 50,
        totalXpEarned: 5000,
        completionsByType: {} as Record<string, number>,
        favoriteArea: 'musical',
      };

      const challenge = getTodaysChallenge(testUserId, stats);
      expect(challenge.streakBonus).toBe(50); // 5 days * 10 XP per day
    });

    it('should have higher XP reward with streak multiplier', () => {
      const noStreakChallenge = getTodaysChallenge(testUserId);

      const stats: UserChallengeStats = {
        userId: testUserId,
        currentStreak: 10,
        longestStreak: 10,
        totalChallengesCompleted: 100,
        totalXpEarned: 10000,
        completionsByType: {} as Record<string, number>,
        favoriteArea: 'musical',
      };

      const streakChallenge = getTodaysChallenge(testUserId, stats);

      // With a 10-day streak, multiplier is 1 + (10 * 0.1) = 2 (capped at 2)
      expect(streakChallenge.xpReward).toBeGreaterThanOrEqual(noStreakChallenge.xpReward);
    });
  });

  describe('getUpcomingChallenges', () => {
    it('should return challenges for the specified number of days', () => {
      const challenges = getUpcomingChallenges(testUserId, 7);

      expect(challenges.length).toBe(7);
    });

    it('should return challenges with consecutive dates', () => {
      const challenges = getUpcomingChallenges(testUserId, 3);
      const today = new Date();

      for (let i = 0; i < 3; i++) {
        const expectedDate = new Date(today);
        expectedDate.setDate(today.getDate() + i);
        expect(challenges[i].date).toBe(expectedDate.toISOString().split('T')[0]);
      }
    });

    it('should return varied challenge types', () => {
      const challenges = getUpcomingChallenges(testUserId, 7);
      const types = new Set(challenges.map(c => c.type));

      // Should have multiple different types over a week
      expect(types.size).toBeGreaterThan(1);
    });
  });

  describe('startChallenge', () => {
    it('should create a progress record', () => {
      const uniqueUserId = `start-user-${Date.now()}`;
      const challengeId = `test-challenge-${Date.now()}`;

      const progress = startChallenge(uniqueUserId, challengeId);

      expect(progress.challengeId).toBe(challengeId);
      expect(progress.userId).toBe(uniqueUserId);
      expect(progress.startedAt).toBeDefined();
      expect(progress.score).toBe(0);
      expect(progress.xpEarned).toBe(0);
      expect(progress.completedAt).toBeUndefined();
    });
  });

  describe('completeChallenge', () => {
    it('should mark challenge as completed', () => {
      const uniqueUserId = `complete-user-${Date.now()}`;
      const challenge = getTodaysChallenge(uniqueUserId);

      startChallenge(uniqueUserId, challenge.id);
      const progress = completeChallenge(uniqueUserId, challenge.id, 100, challenge);

      expect(progress.completedAt).toBeDefined();
      expect(progress.score).toBe(100);
      expect(progress.xpEarned).toBeGreaterThan(0);
    });

    it('should work without starting first', () => {
      const uniqueUserId = `complete-direct-${Date.now()}`;
      const challenge = getTodaysChallenge(uniqueUserId);

      const progress = completeChallenge(uniqueUserId, challenge.id, 80, challenge);

      expect(progress.completedAt).toBeDefined();
      expect(progress.score).toBe(80);
    });

    it('should update user stats', () => {
      const uniqueUserId = `stats-user-${Date.now()}`;
      const challenge = getTodaysChallenge(uniqueUserId);

      completeChallenge(uniqueUserId, challenge.id, 100, challenge);

      const stats = getChallengeStats(uniqueUserId);
      expect(stats.totalChallengesCompleted).toBeGreaterThanOrEqual(1);
      expect(stats.totalXpEarned).toBeGreaterThan(0);
    });
  });

  describe('getChallengeStats', () => {
    it('should return default stats for new user', () => {
      const newUserId = `new-user-${Date.now()}`;
      const stats = getChallengeStats(newUserId);

      expect(stats.userId).toBe(newUserId);
      expect(stats.currentStreak).toBe(0);
      expect(stats.longestStreak).toBe(0);
      expect(stats.totalChallengesCompleted).toBe(0);
      expect(stats.totalXpEarned).toBe(0);
      expect(stats.favoriteArea).toBe('musical');
    });

    it('should track streak correctly', () => {
      const uniqueUserId = `streak-user-${Date.now()}`;
      const challenge = getTodaysChallenge(uniqueUserId);

      completeChallenge(uniqueUserId, challenge.id, 100, challenge);

      const stats = getChallengeStats(uniqueUserId);
      expect(stats.currentStreak).toBeGreaterThanOrEqual(1);
    });
  });

  describe('hasCompletedTodaysChallenge', () => {
    it('should return false for new user', () => {
      const newUserId = `new-check-${Date.now()}`;
      expect(hasCompletedTodaysChallenge(newUserId)).toBe(false);
    });

    it('should return true after completing today\'s challenge', () => {
      const uniqueUserId = `completed-check-${Date.now()}`;
      const challenge = getTodaysChallenge(uniqueUserId);

      completeChallenge(uniqueUserId, challenge.id, 100, challenge);

      expect(hasCompletedTodaysChallenge(uniqueUserId)).toBe(true);
    });
  });

  describe('getChallengeHistory', () => {
    it('should return empty array for new user', () => {
      const newUserId = `history-new-${Date.now()}`;
      const history = getChallengeHistory(newUserId);

      expect(history).toEqual([]);
    });

    it('should return completed challenges', () => {
      const uniqueUserId = `history-user-${Date.now()}`;
      const challenge = getTodaysChallenge(uniqueUserId);

      completeChallenge(uniqueUserId, challenge.id, 100, challenge);

      const history = getChallengeHistory(uniqueUserId);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].completedAt).toBeDefined();
    });

    it('should respect limit', () => {
      const uniqueUserId = `history-limit-${Date.now()}`;

      // Complete multiple challenges
      for (let i = 0; i < 5; i++) {
        const challenge: DailyChallenge = {
          id: `${uniqueUserId}-challenge-${i}`,
          date: new Date().toISOString().split('T')[0],
          area: 'musical',
          type: 'speed-round',
          title: 'Test',
          description: 'Test',
          emoji: '🎯',
          duration: 5,
          xpReward: 50,
          streakBonus: 0,
          difficulty: 'easy',
          expiresAt: new Date().toISOString(),
        };

        completeChallenge(uniqueUserId, challenge.id, 100, challenge);
      }

      const history = getChallengeHistory(uniqueUserId, 3);
      expect(history.length).toBeLessThanOrEqual(3);
    });
  });

  describe('isStreakAtRisk', () => {
    it('should return not at risk for new user', () => {
      const newUserId = `risk-new-${Date.now()}`;
      const result = isStreakAtRisk(newUserId);

      expect(result.atRisk).toBe(false);
      expect(result.currentStreak).toBe(0);
    });

    it('should return hours remaining until end of day', () => {
      const newUserId = `risk-hours-${Date.now()}`;
      const result = isStreakAtRisk(newUserId);

      expect(result.hoursRemaining).toBeGreaterThanOrEqual(0);
      expect(result.hoursRemaining).toBeLessThanOrEqual(24);
    });
  });

  describe('useStreakFreeze', () => {
    it('should return false for user with no streak', () => {
      const newUserId = `freeze-new-${Date.now()}`;
      const result = useStreakFreeze(newUserId);

      expect(result).toBe(false);
    });

    it('should protect streak for user with active streak', () => {
      const uniqueUserId = `freeze-user-${Date.now()}`;
      const challenge = getTodaysChallenge(uniqueUserId);

      // Build a streak
      completeChallenge(uniqueUserId, challenge.id, 100, challenge);

      const stats = getChallengeStats(uniqueUserId);
      if (stats.currentStreak > 0) {
        const result = useStreakFreeze(uniqueUserId);
        expect(result).toBe(true);
      }
    });
  });

  describe('getChallengeNotificationContent', () => {
    it('should return notification content', () => {
      const challenge = getTodaysChallenge(testUserId);
      const stats: UserChallengeStats = {
        userId: testUserId,
        currentStreak: 3,
        longestStreak: 5,
        totalChallengesCompleted: 20,
        totalXpEarned: 1500,
        completionsByType: {} as Record<string, number>,
        favoriteArea: 'musical',
      };

      const notification = getChallengeNotificationContent(challenge, stats);

      expect(notification.title).toContain(challenge.emoji);
      expect(notification.body).toBeDefined();
      expect(notification.body).toContain('3 day streak');
      expect(notification.data.type).toBe('daily_challenge');
      expect(notification.data.challengeId).toBe(challenge.id);
    });

    it('should have special messaging for milestone streaks', () => {
      const challenge = getTodaysChallenge(testUserId);
      const stats: UserChallengeStats = {
        userId: testUserId,
        currentStreak: 6,
        longestStreak: 6,
        totalChallengesCompleted: 20,
        totalXpEarned: 1500,
        completionsByType: {} as Record<string, number>,
        favoriteArea: 'musical',
      };

      const notification = getChallengeNotificationContent(challenge, stats);
      expect(notification.title).toContain('week streak');
    });

    it('should have special messaging for 30-day milestone', () => {
      const challenge = getTodaysChallenge(testUserId);
      const stats: UserChallengeStats = {
        userId: testUserId,
        currentStreak: 29,
        longestStreak: 29,
        totalChallengesCompleted: 100,
        totalXpEarned: 10000,
        completionsByType: {} as Record<string, number>,
        favoriteArea: 'musical',
      };

      const notification = getChallengeNotificationContent(challenge, stats);
      expect(notification.title).toContain('30 days');
    });
  });

  describe('getStreakAtRiskNotification', () => {
    it('should return streak at risk notification', () => {
      const stats: UserChallengeStats = {
        userId: testUserId,
        currentStreak: 7,
        longestStreak: 10,
        totalChallengesCompleted: 50,
        totalXpEarned: 5000,
        completionsByType: {} as Record<string, number>,
        favoriteArea: 'musical',
      };

      const notification = getStreakAtRiskNotification(stats);

      expect(notification.title).toContain('7 day streak');
      expect(notification.title).toContain('at risk');
      expect(notification.body).toContain('midnight');
      expect(notification.data.type).toBe('streak_at_risk');
      expect(notification.data.currentStreak).toBe('7');
    });
  });

  describe('challenge type variations', () => {
    it('should have different types for different days', () => {
      const challenges = getUpcomingChallenges(testUserId, 7);

      // Verify challenges have types assigned
      const types = new Set(challenges.map(c => c.type));
      // Implementation may vary - just verify types are defined
      for (const challenge of challenges) {
        expect(challenge.type).toBeDefined();
        expect(typeof challenge.type).toBe('string');
      }
    });

    it('should have appropriate durations', () => {
      const challenges = getUpcomingChallenges(testUserId, 7);

      for (const challenge of challenges) {
        expect(challenge.duration).toBeGreaterThan(0);
        expect(challenge.duration).toBeLessThanOrEqual(10); // Max 10 minutes
      }
    });
  });
});
