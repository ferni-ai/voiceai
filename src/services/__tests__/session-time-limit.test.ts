/**
 * Session Time Limit Service Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock subscription types
vi.mock('../../types/subscription.js', () => ({
  FREE_SESSION_DURATION_MS: 7 * 60 * 1000, // 7 minutes
  SESSION_GRACE_MS: 30 * 1000, // 30 seconds
  SESSION_WARNING_MS: 60 * 1000, // 1 minute
  TIER_CONFIGS: {
    free: { sessionMinutes: 7 },
    friend: { sessionMinutes: null }, // unlimited (Founding Member)
    partner: { sessionMinutes: null }, // unlimited (Founding Patron)
  },
}));

import {
  startSessionTimer,
  getSessionState,
  checkSessionTime,
  endSessionTimer,
  canContinueSession,
  shouldPromptUpgrade,
  getApproachingEndPrompt,
  getSessionEndPrompt,
} from '../session-time-limit.js';

describe('SessionTimeLimit', () => {
  const userId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Clean up any existing session
    endSessionTimer(userId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    endSessionTimer(userId);
  });

  describe('startSessionTimer', () => {
    it('should start timer for free user with time limit', () => {
      const state = startSessionTimer(userId, 'free');

      expect(state.tier).toBe('free');
      expect(state.timeLimitMs).toBe(7 * 60 * 1000);
      expect(state.warningShown).toBe(false);
      expect(state.sessionEnded).toBe(false);
    });

    it('should start timer for premium user without time limit', () => {
      const state = startSessionTimer(userId + '-premium', 'partner');

      expect(state.tier).toBe('partner');
      expect(state.timeLimitMs).toBeNull();
    });

    it('should record session start time', () => {
      const now = Date.now();
      const state = startSessionTimer(userId, 'free');

      expect(state.sessionStartedAt).toBeGreaterThanOrEqual(now);
    });
  });

  describe('getSessionState', () => {
    it('should return state for active session', () => {
      startSessionTimer(userId, 'free');

      const state = getSessionState(userId);

      expect(state).not.toBeNull();
      expect(state?.tier).toBe('free');
    });

    it('should return null for unknown user', () => {
      const state = getSessionState('unknown-user');

      expect(state).toBeNull();
    });
  });

  describe('checkSessionTime', () => {
    it('should show unlimited for premium users', () => {
      startSessionTimer(userId, 'partner');

      const check = checkSessionTime(userId);

      expect(check.isUnlimited).toBe(true);
      expect(check.remainingMs).toBeNull();
      expect(check.approachingLimit).toBe(false);
      expect(check.limitReached).toBe(false);
    });

    it('should track elapsed time for free users', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(60 * 1000); // 1 minute

      const check = checkSessionTime(userId);

      expect(check.elapsedMs).toBeGreaterThanOrEqual(60 * 1000);
      expect(check.remainingMs).toBeLessThan(7 * 60 * 1000);
    });

    it('should indicate approaching limit within warning threshold', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(6 * 60 * 1000 + 30 * 1000); // 6.5 minutes

      const check = checkSessionTime(userId);

      expect(check.approachingLimit).toBe(true);
      expect(check.showWarning).toBe(true);
    });

    it('should only show warning once', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(6 * 60 * 1000 + 30 * 1000);

      const firstCheck = checkSessionTime(userId);
      const secondCheck = checkSessionTime(userId);

      expect(firstCheck.showWarning).toBe(true);
      expect(secondCheck.showWarning).toBe(false);
    });

    it('should indicate limit reached after time expires', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(7 * 60 * 1000 + 1000); // 7 minutes + 1 second

      const check = checkSessionTime(userId);

      expect(check.limitReached).toBe(true);
      expect(check.remainingMs).toBe(0);
    });

    it('should indicate grace period after limit but before grace expires', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(7 * 60 * 1000 + 15 * 1000); // 7 min + 15 seconds

      const check = checkSessionTime(userId);

      expect(check.limitReached).toBe(true);
      expect(check.inGracePeriod).toBe(true);
    });

    it('should format time remaining as mm:ss', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes

      const check = checkSessionTime(userId);

      // 2 minutes remaining
      expect(check.timeRemainingText).toMatch(/2:00/);
    });

    it('should format seconds remaining when under a minute', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(6 * 60 * 1000 + 30 * 1000); // 6.5 minutes

      const check = checkSessionTime(userId);

      expect(check.timeRemainingText).toMatch(/seconds/);
    });
  });

  describe('endSessionTimer', () => {
    it('should remove session state', () => {
      startSessionTimer(userId, 'free');
      endSessionTimer(userId);

      const state = getSessionState(userId);

      expect(state).toBeNull();
    });

    it('should handle ending non-existent session gracefully', () => {
      expect(() => endSessionTimer('nonexistent-user')).not.toThrow();
    });
  });

  describe('canContinueSession', () => {
    it('should return true for unlimited sessions', () => {
      startSessionTimer(userId, 'partner');

      expect(canContinueSession(userId)).toBe(true);
    });

    it('should return true when time remaining', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(3 * 60 * 1000); // 3 minutes

      expect(canContinueSession(userId)).toBe(true);
    });

    it('should return true during grace period', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(7 * 60 * 1000 + 15 * 1000); // 7 min + 15 sec

      expect(canContinueSession(userId)).toBe(true);
    });

    it('should return false after grace period', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(7 * 60 * 1000 + 35 * 1000); // 7 min + 35 sec

      expect(canContinueSession(userId)).toBe(false);
    });
  });

  describe('shouldPromptUpgrade', () => {
    it('should return false for premium users', () => {
      startSessionTimer(userId, 'partner');
      vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      expect(shouldPromptUpgrade(userId)).toBe(false);
    });

    it('should return false for free users early in session', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(3 * 60 * 1000); // 3 minutes

      expect(shouldPromptUpgrade(userId)).toBe(false);
    });

    it('should return true for free users approaching limit', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(6 * 60 * 1000 + 30 * 1000); // 6.5 minutes

      expect(shouldPromptUpgrade(userId)).toBe(true);
    });

    it('should return true for free users at limit', () => {
      startSessionTimer(userId, 'free');
      vi.advanceTimersByTime(7 * 60 * 1000); // 7 minutes

      expect(shouldPromptUpgrade(userId)).toBe(true);
    });
  });

  describe('Prompt Generation', () => {
    it('getApproachingEndPrompt should return warm message', () => {
      const prompt = getApproachingEndPrompt();

      expect(prompt.length).toBeGreaterThan(20);
      expect(prompt).not.toContain('ERROR');
    });

    it('getSessionEndPrompt should return warm farewell', () => {
      const prompt = getSessionEndPrompt();

      expect(prompt.length).toBeGreaterThan(20);
      expect(prompt).toMatch(/conversation|talking|chat/i);
    });

    it('should have variety in prompts', () => {
      const prompts = new Set<string>();

      // Get multiple prompts
      for (let i = 0; i < 20; i++) {
        prompts.add(getApproachingEndPrompt());
        prompts.add(getSessionEndPrompt());
      }

      // Should have some variety (at least 2 different prompts per type)
      expect(prompts.size).toBeGreaterThan(2);
    });
  });

  describe('Multiple Sessions', () => {
    it('should track separate sessions for different users', () => {
      startSessionTimer('user-1', 'free');
      startSessionTimer('user-2', 'partner');

      const state1 = getSessionState('user-1');
      const state2 = getSessionState('user-2');

      expect(state1?.tier).toBe('free');
      expect(state2?.tier).toBe('partner');
      expect(state1?.timeLimitMs).not.toBeNull();
      expect(state2?.timeLimitMs).toBeNull();
    });

    it('should end one session without affecting others', () => {
      startSessionTimer('user-1', 'free');
      startSessionTimer('user-2', 'free');

      endSessionTimer('user-1');

      expect(getSessionState('user-1')).toBeNull();
      expect(getSessionState('user-2')).not.toBeNull();
    });
  });
});
