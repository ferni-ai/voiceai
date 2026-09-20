/**
 * Moments Data Connector Tests
 *
 * Regression coverage for the event-contract bugs found on 2026-09-20, where
 * attachDataListeners() read fields the dispatchers never send:
 * - 'ferni:streak-updated' ({ count, previous }) was read as .streak and echoed
 *   back into badges.updateStreak(undefined), wiping the streak every update.
 * - 'ferni:seeds-earned' is dispatched on `document` with the amount EARNED,
 *   but was listened for on `window` and read as .balance.
 * - 'ferni:achievement-unlocked' ({ id, achievement }) was read as .badgeId,
 *   persisting an `undefined` achievement id.
 * - detachDataListeners() only flipped a flag, leaking a duplicate listener set
 *   on every init/destroy cycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockGetSeedBalance = vi.fn(() => 250);
vi.mock('@/services/cosmetics.service.js', () => ({
  getSeedBalance: () => mockGetSeedBalance(),
}));

vi.mock('@/services/seeds-economy.service.js', () => ({
  getCurrentStreak: vi.fn(() => 7),
}));

type Connector = typeof import('@/ui/moments/data-connector.js');
type Badges = typeof import('@/ui/moments/badges.js');

describe('Moments data connector', () => {
  let connector: Connector;
  let badgesMod: Badges;

  beforeEach(async () => {
    localStorage.clear();
    mockGetSeedBalance.mockClear();
    mockGetSeedBalance.mockReturnValue(250);
    vi.resetModules();
    connector = await import('@/ui/moments/data-connector.js');
    badgesMod = await import('@/ui/moments/badges.js');
    badgesMod.resetBadgeDisplay();
    badgesMod.initBadgeDisplay();
  });

  afterEach(() => {
    connector.detachDataListeners();
    badgesMod.resetBadgeDisplay();
  });

  // ==========================================================================
  // STREAK: the self-echo that wiped the value
  // ==========================================================================

  describe('streak updates', () => {
    it('should not clobber the streak when badges announces an update', () => {
      connector.attachDataListeners();

      // badges.updateStreak dispatches ferni:streak-updated itself. If the
      // connector echoes that event back into badges, the streak is destroyed.
      badgesMod.badges.updateStreak(7, false);

      expect(badgesMod.badges.getState().streak).toBe(7);
    });

    it('should survive a manually dispatched streak event', () => {
      connector.attachDataListeners();
      badgesMod.badges.updateStreak(12, false);

      window.dispatchEvent(
        new CustomEvent('ferni:streak-updated', { detail: { count: 12, previous: 11 } })
      );

      expect(badgesMod.badges.getState().streak).toBe(12);
    });

    it('should still expose onStreakUpdate for direct callers', () => {
      connector.onStreakUpdate(9);

      expect(badgesMod.badges.getState().streak).toBe(9);
    });
  });

  // ==========================================================================
  // SEEDS: wrong target and wrong field
  // ==========================================================================

  describe('seeds earned', () => {
    it('should read the authoritative balance when seeds are earned', () => {
      connector.attachDataListeners();

      // seeds-economy.service dispatches on `document`, carrying the amount
      // earned - not the new balance.
      document.dispatchEvent(
        new CustomEvent('ferni:seeds-earned', {
          detail: { amount: 25, reason: 'daily streak', type: 'streak' },
        })
      );

      expect(mockGetSeedBalance).toHaveBeenCalled();
      expect(badgesMod.badges.getState().seeds).toBe(250);
    });

    it('should not set the balance to the earned delta', () => {
      connector.attachDataListeners();

      document.dispatchEvent(
        new CustomEvent('ferni:seeds-earned', { detail: { amount: 25 } })
      );

      expect(badgesMod.badges.getState().seeds).not.toBe(25);
    });

    it('should leave seeds untouched when no event fires', () => {
      connector.attachDataListeners();

      expect(badgesMod.badges.getState().seeds).toBe(0);
    });
  });

  // ==========================================================================
  // ACHIEVEMENTS: wrong field name
  // ==========================================================================

  describe('achievement unlocked', () => {
    it('should record the achievement id from the event detail', () => {
      connector.attachDataListeners();

      window.dispatchEvent(
        new CustomEvent('ferni:achievement-unlocked', {
          detail: { id: 'first-conversation', achievement: { name: 'First chat' } },
        })
      );

      const state = badgesMod.badges.getState();
      expect(state.achievementCount).toBe(1);
      expect(state.unseenAchievements.has('first-conversation')).toBe(true);
      expect(state.unseenAchievements.has('undefined')).toBe(false);
    });

    it('should ignore an event with no id rather than persisting undefined', () => {
      connector.attachDataListeners();

      window.dispatchEvent(
        new CustomEvent('ferni:achievement-unlocked', { detail: { achievement: {} } })
      );

      const state = badgesMod.badges.getState();
      expect(state.achievementCount).toBe(0);
      expect(state.unseenAchievements.size).toBe(0);
    });
  });

  // ==========================================================================
  // LISTENER LIFECYCLE
  // ==========================================================================

  describe('listener lifecycle', () => {
    it('should actually remove listeners on detach', () => {
      connector.attachDataListeners();
      connector.detachDataListeners();
      mockGetSeedBalance.mockClear();

      document.dispatchEvent(
        new CustomEvent('ferni:seeds-earned', { detail: { amount: 25 } })
      );

      expect(mockGetSeedBalance).not.toHaveBeenCalled();
    });

    it('should not accumulate duplicate listeners across attach/detach cycles', () => {
      for (let i = 0; i < 3; i++) {
        connector.attachDataListeners();
        connector.detachDataListeners();
      }
      connector.attachDataListeners();
      mockGetSeedBalance.mockClear();

      document.dispatchEvent(
        new CustomEvent('ferni:seeds-earned', { detail: { amount: 25 } })
      );

      // Exactly one live handler, so exactly one balance read
      expect(mockGetSeedBalance).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent while attached', () => {
      connector.attachDataListeners();
      connector.attachDataListeners();
      mockGetSeedBalance.mockClear();

      document.dispatchEvent(
        new CustomEvent('ferni:seeds-earned', { detail: { amount: 25 } })
      );

      expect(mockGetSeedBalance).toHaveBeenCalledTimes(1);
    });
  });
});
