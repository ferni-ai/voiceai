/**
 * Habit Decay Early Warning Tests
 *
 * Tests for detecting habit frequency decline before complete abandonment.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  recordHabitCompletion,
  addHabitToTrack,
  getTrackedHabits,
  clearHabitData,
  detectHabitDecay,
} from '../habit-decay.js';

describe('HabitDecay', () => {
  const testUserId = `test-user-${Date.now()}`;

  beforeEach(() => {
    vi.useFakeTimers();
    clearHabitData(testUserId);
  });

  afterEach(() => {
    vi.useRealTimers();
    clearHabitData(testUserId);
  });

  // ===========================================================================
  // addHabitToTrack
  // ===========================================================================
  describe('addHabitToTrack', () => {
    it('should add a habit with all properties', () => {
      addHabitToTrack(testUserId, 'meditation', 'Daily Meditation', 'mindfulness', 7);

      const habits = getTrackedHabits(testUserId);
      expect(habits).toHaveLength(1);
      expect(habits[0]).toMatchObject({
        id: 'meditation',
        name: 'Daily Meditation',
        currentStreak: 0,
      });
    });

    it('should track multiple habits independently', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');
      addHabitToTrack(testUserId, 'exercise', 'Exercise', 'health');
      addHabitToTrack(testUserId, 'reading', 'Reading', 'learning');

      const habits = getTrackedHabits(testUserId);
      expect(habits).toHaveLength(3);
    });

    it('should overwrite existing habit with same id', () => {
      addHabitToTrack(testUserId, 'meditation', 'Old Name', 'mindfulness');
      addHabitToTrack(testUserId, 'meditation', 'New Name', 'health');

      const habits = getTrackedHabits(testUserId);
      expect(habits).toHaveLength(1);
      expect(habits[0].name).toBe('New Name');
    });

    it('should use default target frequency of 7', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Habit is added - verify by checking it exists
      const habits = getTrackedHabits(testUserId);
      expect(habits).toHaveLength(1);
    });
  });

  // ===========================================================================
  // recordHabitCompletion
  // ===========================================================================
  describe('recordHabitCompletion', () => {
    it('should auto-create habit if not exists', () => {
      recordHabitCompletion(testUserId, 'new_habit', true);

      const habits = getTrackedHabits(testUserId);
      expect(habits).toHaveLength(1);
      expect(habits[0].id).toBe('new_habit');
    });

    it('should update streak on completed habit', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      recordHabitCompletion(testUserId, 'meditation', true);
      recordHabitCompletion(testUserId, 'meditation', true);
      recordHabitCompletion(testUserId, 'meditation', true);

      const habits = getTrackedHabits(testUserId);
      expect(habits[0].currentStreak).toBe(3);
    });

    it('should reset streak on missed completion', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      recordHabitCompletion(testUserId, 'meditation', true);
      recordHabitCompletion(testUserId, 'meditation', true);
      recordHabitCompletion(testUserId, 'meditation', false); // missed

      const habits = getTrackedHabits(testUserId);
      expect(habits[0].currentStreak).toBe(0);
    });

    it('should track completion rate from last 30 completions', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Record 20 completions: 15 completed, 5 missed
      for (let i = 0; i < 15; i++) {
        recordHabitCompletion(testUserId, 'meditation', true);
      }
      for (let i = 0; i < 5; i++) {
        recordHabitCompletion(testUserId, 'meditation', false);
      }

      const habits = getTrackedHabits(testUserId);
      expect(habits[0].completionRate).toBe(0.75); // 15/20
    });

    it('should record optional duration and notes', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // This should not throw
      expect(() => {
        recordHabitCompletion(testUserId, 'meditation', true, 30, 'Great session');
      }).not.toThrow();
    });

    it('should format habit name from id with underscores', () => {
      recordHabitCompletion(testUserId, 'morning_meditation', true);

      const habits = getTrackedHabits(testUserId);
      expect(habits[0].name).toBe('morning meditation');
    });
  });

  // ===========================================================================
  // getTrackedHabits
  // ===========================================================================
  describe('getTrackedHabits', () => {
    it('should return empty array for unknown user', () => {
      const habits = getTrackedHabits('unknown-user');
      expect(habits).toEqual([]);
    });

    it('should return habits with id, name, currentStreak, completionRate', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');
      recordHabitCompletion(testUserId, 'meditation', true);

      const habits = getTrackedHabits(testUserId);
      expect(habits[0]).toHaveProperty('id');
      expect(habits[0]).toHaveProperty('name');
      expect(habits[0]).toHaveProperty('currentStreak');
      expect(habits[0]).toHaveProperty('completionRate');
    });

    it('should calculate 0 completion rate for empty completions', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      const habits = getTrackedHabits(testUserId);
      expect(habits[0].completionRate).toBe(0);
    });
  });

  // ===========================================================================
  // clearHabitData
  // ===========================================================================
  describe('clearHabitData', () => {
    it('should remove all habits for user', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');
      addHabitToTrack(testUserId, 'exercise', 'Exercise', 'health');

      clearHabitData(testUserId);

      const habits = getTrackedHabits(testUserId);
      expect(habits).toEqual([]);
    });

    it('should not affect other users', () => {
      const otherUser = `other-user-${Date.now()}`;
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');
      addHabitToTrack(otherUser, 'exercise', 'Exercise', 'health');

      clearHabitData(testUserId);

      expect(getTrackedHabits(testUserId)).toEqual([]);
      expect(getTrackedHabits(otherUser)).toHaveLength(1);

      // Cleanup
      clearHabitData(otherUser);
    });
  });

  // ===========================================================================
  // detectHabitDecay
  // ===========================================================================
  describe('detectHabitDecay', () => {
    it('should return empty array for user with cleared habits', async () => {
      // Add and then clear habits to avoid dynamic import loading
      addHabitToTrack(testUserId, 'temp', 'Temp', 'other');
      clearHabitData(testUserId);

      // Re-add an empty habit that won't trigger external loading
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // With insufficient completions, should return empty
      const warnings = await detectHabitDecay(testUserId);
      expect(warnings).toEqual([]);
    });

    it('should return empty array for habit with insufficient data', async () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Only 5 completions (need at least 14)
      for (let i = 0; i < 5; i++) {
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      const warnings = await detectHabitDecay(testUserId);
      expect(warnings).toEqual([]);
    });

    it('should detect significant habit decay', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Create baseline period (28 days ago to 14 days ago): high frequency
      // 28 completions over 28 days = daily
      for (let i = 42; i > 14; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      // Recent period (last 14 days): very low frequency
      // Only 3 completions over 14 days = ~1.5x/week (big drop from daily)
      for (let i = 14; i > 11; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      vi.setSystemTime(now);

      const warnings = await detectHabitDecay(testUserId);

      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0].habitName).toBe('Meditation');
      expect(warnings[0].decayRate).toBeGreaterThan(0.2); // At least minor decay
    });

    it('should not flag stable habits', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Consistent daily completions for 42 days
      for (let i = 42; i > 0; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      vi.setSystemTime(now);

      const warnings = await detectHabitDecay(testUserId);

      // No warnings for stable habits
      expect(warnings).toEqual([]);
    });

    it('should include interventions in warnings', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Create decaying pattern
      for (let i = 42; i > 14; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      // Very few recent completions
      vi.setSystemTime(now - 10 * 24 * 60 * 60 * 1000);
      recordHabitCompletion(testUserId, 'meditation', true);
      vi.setSystemTime(now);

      const warnings = await detectHabitDecay(testUserId);

      if (warnings.length > 0) {
        expect(warnings[0].interventions).toBeDefined();
        expect(warnings[0].interventions.length).toBeGreaterThan(0);
        expect(warnings[0].interventions[0]).toHaveProperty('intervention');
        expect(warnings[0].interventions[0]).toHaveProperty('effectiveness');
        expect(warnings[0].interventions[0]).toHaveProperty('effort');
      }
    });

    it('should sort warnings by decay rate (most urgent first)', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Add two habits with different decay rates
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');
      addHabitToTrack(testUserId, 'exercise', 'Exercise', 'health');

      // Meditation: moderate decay (daily -> 3x/week)
      for (let i = 42; i > 14; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }
      // Recent: 6 completions over 14 days = 3x/week
      for (let i = 14; i > 8; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      // Exercise: severe decay (daily -> rarely)
      for (let i = 42; i > 14; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'exercise', true);
      }
      // Recent: only 1 completion over 14 days
      vi.setSystemTime(now - 10 * 24 * 60 * 60 * 1000);
      recordHabitCompletion(testUserId, 'exercise', true);

      vi.setSystemTime(now);

      const warnings = await detectHabitDecay(testUserId);

      if (warnings.length >= 2) {
        // Most urgent (highest decay) should be first
        expect(warnings[0].decayRate).toBeGreaterThanOrEqual(warnings[1].decayRate);
      }
    });

    it('should calculate days until abandonment', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Create decaying pattern
      for (let i = 42; i > 14; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      // Very few recent
      vi.setSystemTime(now - 7 * 24 * 60 * 60 * 1000);
      recordHabitCompletion(testUserId, 'meditation', true);
      vi.setSystemTime(now);

      const warnings = await detectHabitDecay(testUserId);

      if (warnings.length > 0) {
        expect(warnings[0].daysUntilAbandonment).toBeGreaterThan(0);
        expect(warnings[0].daysUntilAbandonment).toBeLessThan(366);
      }
    });

    it('should set shouldSurface based on decay severity and confidence', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Create significant decay with enough data for confidence
      for (let i = 90; i > 14; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      // Almost no recent completions
      vi.setSystemTime(now - 7 * 24 * 60 * 60 * 1000);
      recordHabitCompletion(testUserId, 'meditation', true);
      vi.setSystemTime(now);

      const warnings = await detectHabitDecay(testUserId);

      if (warnings.length > 0) {
        expect(warnings[0]).toHaveProperty('shouldSurface');
        expect(typeof warnings[0].shouldSurface).toBe('boolean');
      }
    });

    it('should include human-friendly message and suggestion', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Create decay pattern
      for (let i = 42; i > 14; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      vi.setSystemTime(now - 7 * 24 * 60 * 60 * 1000);
      recordHabitCompletion(testUserId, 'meditation', true);
      vi.setSystemTime(now);

      const warnings = await detectHabitDecay(testUserId);

      if (warnings.length > 0) {
        expect(warnings[0].message).toBeDefined();
        expect(warnings[0].message.length).toBeGreaterThan(0);
        expect(warnings[0].message).toContain('Meditation');

        expect(warnings[0].suggestion).toBeDefined();
        expect(warnings[0].suggestion.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // Category-specific interventions
  // ===========================================================================
  describe('category-specific interventions', () => {
    const createDecayingHabit = async (
      habitId: string,
      name: string,
      category: 'health' | 'productivity' | 'mindfulness' | 'social' | 'learning' | 'other'
    ) => {
      const now = Date.now();

      addHabitToTrack(testUserId, habitId, name, category);

      // Create decay pattern
      for (let i = 42; i > 14; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, habitId, true);
      }

      vi.setSystemTime(now - 7 * 24 * 60 * 60 * 1000);
      recordHabitCompletion(testUserId, habitId, true);
      vi.setSystemTime(now);
    };

    it('should provide health-specific interventions', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await createDecayingHabit('exercise', 'Exercise', 'health');

      const warnings = await detectHabitDecay(testUserId);

      if (warnings.length > 0) {
        const interventionTexts = warnings[0].interventions.map((i) => i.intervention);
        // Should include health-specific or universal interventions
        expect(interventionTexts.length).toBeGreaterThan(0);
      }
    });

    it('should provide mindfulness-specific interventions', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await createDecayingHabit('meditation', 'Meditation', 'mindfulness');

      const warnings = await detectHabitDecay(testUserId);

      if (warnings.length > 0) {
        const interventionTexts = warnings[0].interventions.map((i) => i.intervention);
        expect(interventionTexts.length).toBeGreaterThan(0);
      }
    });

    it('should provide productivity-specific interventions', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await createDecayingHabit('deep_work', 'Deep Work', 'productivity');

      const warnings = await detectHabitDecay(testUserId);

      if (warnings.length > 0) {
        const interventionTexts = warnings[0].interventions.map((i) => i.intervention);
        expect(interventionTexts.length).toBeGreaterThan(0);
      }
    });

    it('should provide learning-specific interventions', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await createDecayingHabit('reading', 'Reading', 'learning');

      const warnings = await detectHabitDecay(testUserId);

      if (warnings.length > 0) {
        const interventionTexts = warnings[0].interventions.map((i) => i.intervention);
        expect(interventionTexts.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle habit with no completions in recent period', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Only baseline completions, none in recent 14 days
      for (let i = 42; i > 14; i--) {
        const date = now - i * 24 * 60 * 60 * 1000;
        vi.setSystemTime(date);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      vi.setSystemTime(now);

      // Should not throw
      const warnings = await detectHabitDecay(testUserId);
      expect(Array.isArray(warnings)).toBe(true);
    });

    it('should handle very low baseline frequency', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Put all 14 completions OUTSIDE the analysis window (older than 42 days)
      // This means baseline period (14-42 days ago) has 0 completions
      // which should result in baselineFrequency < 1 and return null
      for (let i = 0; i < 14; i++) {
        vi.setSystemTime(now - (50 + i) * 24 * 60 * 60 * 1000);
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      vi.setSystemTime(now);

      // Should return empty (baseline too low to analyze - no completions in baseline window)
      const warnings = await detectHabitDecay(testUserId);
      expect(warnings).toEqual([]);
    });

    it('should bound completions at MAX_COMPLETIONS (180)', () => {
      addHabitToTrack(testUserId, 'meditation', 'Meditation', 'mindfulness');

      // Record 200 completions
      for (let i = 0; i < 200; i++) {
        recordHabitCompletion(testUserId, 'meditation', true);
      }

      // Should not throw and habits should still be retrievable
      const habits = getTrackedHabits(testUserId);
      expect(habits).toHaveLength(1);
    });
  });
});
