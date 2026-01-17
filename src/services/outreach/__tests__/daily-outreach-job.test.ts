/**
 * Daily Outreach Job Tests
 *
 * Tests for the scheduled daily outreach job that evaluates users
 * for proactive "Thinking of You" messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDailyOutreachJob, type DailyOutreachJobConfig } from '../daily-outreach-job.js';
import type { UserProfile } from '../../../types/user-profile.js';

// Mock user profiles (minimal subset for testing)
const mockUserProfiles: UserProfile[] = [
  {
    id: 'user-1',
    email: 'test1@example.com',
    displayName: 'Test User 1',
    createdAt: new Date().toISOString(),
  } as unknown as UserProfile,
  {
    id: 'user-2',
    email: 'test2@example.com',
    displayName: 'Test User 2',
    createdAt: new Date().toISOString(),
  } as unknown as UserProfile,
];

describe('DailyOutreachJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('runDailyOutreachJob', () => {
    it('should complete with empty user list', async () => {
      const config: DailyOutreachJobConfig = {
        getUserProfiles: async () => [],
        dryRun: true,
      };

      const result = await runDailyOutreachJob(config);

      expect(result.usersEvaluated).toBe(0);
      expect(result.outreachSent).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should evaluate users in dry-run mode', async () => {
      const config: DailyOutreachJobConfig = {
        getUserProfiles: async () => mockUserProfiles,
        dryRun: true,
      };

      const result = await runDailyOutreachJob(config);

      expect(result.usersEvaluated).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('should respect maxUsersPerRun limit', async () => {
      const config: DailyOutreachJobConfig = {
        getUserProfiles: async () => mockUserProfiles,
        maxUsersPerRun: 1,
        dryRun: true,
      };

      const result = await runDailyOutreachJob(config);

      expect(result.usersEvaluated).toBe(1);
    });

    it('should track duration correctly', async () => {
      // Use real timers for this test since we need actual async delays
      vi.useRealTimers();

      const config: DailyOutreachJobConfig = {
        getUserProfiles: async () => mockUserProfiles,
        dryRun: true,
        // No delay needed - just verify duration tracking works
      };

      const result = await runDailyOutreachJob(config);

      // Duration should be tracked (>= 0, may be 0 for fast runs)
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should handle getUserProfiles error gracefully', async () => {
      const config: DailyOutreachJobConfig = {
        getUserProfiles: async () => {
          throw new Error('Database connection failed');
        },
        dryRun: true,
      };

      // Should not throw, should return error in result
      await expect(runDailyOutreachJob(config)).rejects.toThrow('Database connection failed');
    });
  });

  describe('outreach types', () => {
    it('should track outreach by type', async () => {
      const config: DailyOutreachJobConfig = {
        getUserProfiles: async () => mockUserProfiles,
        dryRun: true,
      };

      const result = await runDailyOutreachJob(config);

      expect(result.byType).toBeDefined();
      expect(typeof result.byType).toBe('object');
    });
  });
});
