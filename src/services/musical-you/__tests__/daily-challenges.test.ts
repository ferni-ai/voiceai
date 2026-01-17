/**
 * Daily Challenges Unit Tests
 *
 * Tests for daily challenge generation, progress tracking,
 * and XP rewards.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDailyChallenge,
  getUpcomingChallenges,
  getUserChallengeProgress,
  startDailyChallenge,
  completeDailyChallenge,
  getUserChallengeStats,
} from '../daily-challenges.js';

describe('Daily Challenges', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDailyChallenge', () => {
    it("should return today's challenge", async () => {
      const challenge = await getDailyChallenge();

      expect(challenge).toBeDefined();
      expect(challenge.id).toBeDefined();
      expect(challenge.date).toBeDefined();
      expect(challenge.type).toBeDefined();
      expect(challenge.title).toBeDefined();
      expect(challenge.description).toBeDefined();
      expect(challenge.instructions).toBeDefined();
      expect(challenge.xpReward).toBeGreaterThan(0);
    });

    it('should return consistent challenge for the same day', async () => {
      const challenge1 = await getDailyChallenge();
      const challenge2 = await getDailyChallenge();

      expect(challenge1.id).toBe(challenge2.id);
      expect(challenge1.date).toBe(challenge2.date);
    });

    it("should return a specific date's challenge", async () => {
      const specificDate = new Date('2024-01-15');
      const challenge = await getDailyChallenge(specificDate);

      expect(challenge).toBeDefined();
      expect(challenge.date).toBe('2024-01-15');
    });
  });

  describe('getUpcomingChallenges', () => {
    it('should return upcoming challenges by default', () => {
      const challenges = getUpcomingChallenges();

      expect(challenges).toBeDefined();
      expect(challenges.length).toBeGreaterThanOrEqual(1);
    });

    it('should return specified number of days of upcoming challenges', () => {
      const challenges = getUpcomingChallenges(undefined, 5);

      expect(challenges).toBeDefined();
      expect(challenges.length).toBeGreaterThanOrEqual(5);
    });

    it('should return challenges in chronological order', () => {
      const challenges = getUpcomingChallenges(undefined, 3);

      for (let i = 1; i < challenges.length; i++) {
        const prevDate = new Date(challenges[i - 1].date);
        const currDate = new Date(challenges[i].date);
        expect(currDate.getTime()).toBeGreaterThan(prevDate.getTime());
      }
    });
  });

  describe('getUserChallengeProgress', () => {
    it('should return progress object for new users', async () => {
      const challenge = await getDailyChallenge();
      const progress = await getUserChallengeProgress(mockUserId, challenge.id);

      expect(progress).toBeDefined();
      if (progress) {
        expect(progress.status).toBeDefined();
        expect(typeof progress.xpEarned).toBe('number');
      }
    });
  });

  describe('startDailyChallenge', () => {
    it('should start a challenge for a user', async () => {
      const challenge = await getDailyChallenge();
      const progress = await startDailyChallenge(mockUserId, challenge.id);

      expect(progress).toBeDefined();
      expect(progress.status).toBe('in-progress');
    });
  });

  describe('completeDailyChallenge', () => {
    it('should complete a challenge with score', async () => {
      const challenge = await getDailyChallenge();
      await startDailyChallenge(mockUserId, challenge.id);

      const result = await completeDailyChallenge(mockUserId, challenge.id, 85);

      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.score).toBe(85);
      expect(result.xpEarned).toBeGreaterThan(0);
    });

    it('should award XP for completion', async () => {
      const challenge = await getDailyChallenge();
      await startDailyChallenge(mockUserId, challenge.id);

      const result = await completeDailyChallenge(mockUserId, challenge.id, 95);

      expect(result.xpEarned).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getUserChallengeStats', () => {
    it('should return user challenge statistics', async () => {
      const stats = await getUserChallengeStats(mockUserId);

      expect(stats).toBeDefined();
      expect(typeof stats.totalCompleted).toBe('number');
      expect(typeof stats.currentStreak).toBe('number');
      expect(typeof stats.totalXpEarned).toBe('number');
      expect(stats.totalCompleted).toBeGreaterThanOrEqual(0);
      expect(stats.currentStreak).toBeGreaterThanOrEqual(0);
      expect(stats.totalXpEarned).toBeGreaterThanOrEqual(0);
    });
  });
});
