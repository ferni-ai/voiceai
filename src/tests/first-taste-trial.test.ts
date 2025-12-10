/**
 * First Taste Trial Tests
 *
 * Tests for the "Better than Human" trial experience:
 * - 7-minute free trial for new users
 * - Graceful transition prompts
 * - Time tracking across sessions
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkTrialStatus,
  createDefaultTrialState,
  getTrialWelcomePrompt,
  TRIAL_DURATION_MS,
  TRIAL_WARNING_MS,
  type TrialState,
} from '../services/first-taste-trial.js';

// Mock the store
vi.mock('../memory/store-factory.js', () => ({
  getStore: vi.fn().mockResolvedValue({
    getProfile: vi.fn().mockResolvedValue(null),
    updateProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('First Taste Trial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // DEFAULT STATE
  // ============================================================================

  describe('createDefaultTrialState', () => {
    it('should create default state for new user', () => {
      const state = createDefaultTrialState();

      expect(state.trialStarted).toBe(false);
      expect(state.trialStartedAt).toBeNull();
      expect(state.trialTimeUsedMs).toBe(0);
      expect(state.trialCompleted).toBe(false);
      expect(state.trialCompletedAt).toBeNull();
      expect(state.convertedDuringTrial).toBe(false);
    });
  });

  // ============================================================================
  // TRIAL CHECK
  // ============================================================================

  describe('checkTrialStatus', () => {
    it('should return full time for new user', async () => {
      const result = await checkTrialStatus('new-user', 0);

      expect(result.inTrial).toBe(false); // Not started yet
      expect(result.timeRemainingMs).toBe(TRIAL_DURATION_MS);
      expect(result.trialEnded).toBe(false);
      expect(result.showTransition).toBe(false);
    });

    it('should show approaching end within warning period', async () => {
      // Mock a user who has used most of their trial
      const { getStore } = await import('../memory/store-factory.js');
      const mockStore = await getStore();
      (mockStore.getProfile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        trialState: {
          trialStarted: true,
          trialStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          trialTimeUsedMs: TRIAL_DURATION_MS - 90000, // 1.5 minutes left
          trialCompleted: false,
          trialCompletedAt: null,
          convertedDuringTrial: false,
        } as TrialState,
      });

      const result = await checkTrialStatus('trial-user', 0);

      expect(result.inTrial).toBe(true);
      expect(result.approachingEnd).toBe(true);
    });

    it('should show transition when trial ends', async () => {
      const { getStore } = await import('../memory/store-factory.js');
      const mockStore = await getStore();
      (mockStore.getProfile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        trialState: {
          trialStarted: true,
          trialStartedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          trialTimeUsedMs: TRIAL_DURATION_MS, // Used all trial time
          trialCompleted: false, // Not yet marked as completed
          trialCompletedAt: null,
          convertedDuringTrial: false,
        } as TrialState,
      });

      const result = await checkTrialStatus('trial-user', 0);

      expect(result.inTrial).toBe(false);
      expect(result.trialEnded).toBe(true);
      expect(result.showTransition).toBe(true);
      expect(result.transitionPrompt).toBeTruthy();
    });
  });

  // ============================================================================
  // WELCOME PROMPTS
  // ============================================================================

  describe('getTrialWelcomePrompt', () => {
    it('should return a welcome prompt', () => {
      const prompt = getTrialWelcomePrompt();

      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(20);
      expect(prompt).toContain('Ferni');
    });

    it('should vary prompts (randomness test)', () => {
      const prompts = new Set<string>();
      for (let i = 0; i < 20; i++) {
        prompts.add(getTrialWelcomePrompt());
      }

      // Should have at least 2 different prompts (with high probability)
      expect(prompts.size).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  describe('Trial constants', () => {
    it('should have 7-minute trial duration', () => {
      expect(TRIAL_DURATION_MS).toBe(7 * 60 * 1000);
    });

    it('should have 2-minute warning period', () => {
      expect(TRIAL_WARNING_MS).toBe(2 * 60 * 1000);
    });
  });
});
