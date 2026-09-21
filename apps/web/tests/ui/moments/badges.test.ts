/**
 * BadgeDisplay Unit Tests
 *
 * Tests for the badge display system.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { getBadgeDisplay, resetBadgeDisplay, badges } from '@/ui/moments/badges.js';

describe('BadgeDisplay', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Mock Element.animate (not supported in jsdom)
    Element.prototype.animate = vi.fn().mockReturnValue({
      finished: Promise.resolve(),
      cancel: vi.fn(),
    });

    // Create avatar container (required for badges)
    const avatar = document.createElement('div');
    avatar.className = 'avatar-container';
    document.body.appendChild(avatar);

    // Reset singleton
    resetBadgeDisplay();
  });

  afterEach(() => {
    resetBadgeDisplay();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create singleton instance', () => {
      const display1 = getBadgeDisplay();
      const display2 = getBadgeDisplay();
      expect(display1).toBe(display2);
    });

    it('should not create any DOM - rendering moved to unified-indicator/journey', async () => {
      const before = document.body.children.length;

      badges.init();
      await new Promise((r) => setTimeout(r, 100));

      expect(document.querySelector('.moments-badges')).toBeNull();
      expect(document.querySelector('.moments-badge--streak')).toBeNull();
      expect(document.body.children.length).toBe(before);
    });

    it('should be idempotent', () => {
      badges.init();
      badges.updateStreak(7, false);

      badges.init(); // must not reset accumulated state

      expect(badges.getState().streak).toBe(7);
    });
  });

  describe('updateStreak()', () => {
    it('should update streak state', () => {
      badges.init();
      badges.updateStreak(7, false);

      const state = badges.getState();
      expect(state.streak).toBe(7);
    });

    it('should not dispatch when the streak stays at 0', () => {
      badges.init();
      const handler = vi.fn();
      window.addEventListener('ferni:streak-updated', handler);

      badges.updateStreak(0, false);

      expect(handler).not.toHaveBeenCalled();
      window.removeEventListener('ferni:streak-updated', handler);
    });

    it('should dispatch ferni:streak-updated when the streak grows', () => {
      badges.init();
      const handler = vi.fn();
      window.addEventListener('ferni:streak-updated', handler);

      badges.updateStreak(7, false);

      expect(handler).toHaveBeenCalledTimes(1);
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
        count: 7,
        previous: 0,
      });
      window.removeEventListener('ferni:streak-updated', handler);
    });

    it('should not dispatch when the streak decreases', () => {
      badges.init();
      badges.updateStreak(7, false);

      const handler = vi.fn();
      window.addEventListener('ferni:streak-updated', handler);
      badges.updateStreak(3, false);

      expect(handler).not.toHaveBeenCalled();
      expect(badges.getState().streak).toBe(3);
      window.removeEventListener('ferni:streak-updated', handler);
    });
  });

  describe('updateSeeds()', () => {
    it('should update seeds state', () => {
      badges.init();
      badges.updateSeeds(150, false);

      const state = badges.getState();
      expect(state.seeds).toBe(150);
    });

    it('should keep the raw count in state and dispatch ferni:seeds-updated', () => {
      // Display formatting (e.g. "1.5k") is now the renderer's concern; this
      // module carries the unrounded value.
      badges.init();
      const handler = vi.fn();
      window.addEventListener('ferni:seeds-updated', handler);

      badges.updateSeeds(1500, false);

      expect(badges.getState().seeds).toBe(1500);
      expect(handler).toHaveBeenCalledTimes(1);
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
        count: 1500,
        previous: 0,
      });
      window.removeEventListener('ferni:seeds-updated', handler);
    });

    it('should not dispatch when the seeds value is unchanged', () => {
      badges.init();
      badges.updateSeeds(150, false);

      const handler = vi.fn();
      window.addEventListener('ferni:seeds-updated', handler);
      badges.updateSeeds(150, false);

      expect(handler).not.toHaveBeenCalled();
      window.removeEventListener('ferni:seeds-updated', handler);
    });
  });

  describe('updateAchievements()', () => {
    it('should update achievement count', () => {
      badges.init();
      badges.updateAchievements(5);

      const state = badges.getState();
      expect(state.achievementCount).toBe(5);
    });

    it('should track unseen achievements', () => {
      badges.init();
      badges.updateAchievements(3, ['badge1', 'badge2']);

      const state = badges.getState();
      expect(state.unseenAchievements.size).toBe(2);
      expect(state.unseenAchievements.has('badge1')).toBe(true);
    });

    it('should dispatch ferni:achievement-earned for newly earned badges', () => {
      badges.init();
      const handler = vi.fn();
      window.addEventListener('ferni:achievement-earned', handler);

      badges.updateAchievements(3, ['badge1']);

      expect(handler).toHaveBeenCalledTimes(1);
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
        count: 3,
        newBadgeIds: ['badge1'],
      });
      window.removeEventListener('ferni:achievement-earned', handler);
    });

    it('should not dispatch when no new badge ids are supplied', () => {
      badges.init();
      const handler = vi.fn();
      window.addEventListener('ferni:achievement-earned', handler);

      badges.updateAchievements(3);

      expect(handler).not.toHaveBeenCalled();
      expect(badges.getState().achievementCount).toBe(3);
      window.removeEventListener('ferni:achievement-earned', handler);
    });
  });

  describe('markAchievementsSeen()', () => {
    it('should clear unseen achievements', () => {
      badges.init();
      badges.updateAchievements(3, ['badge1', 'badge2']);
      badges.markSeen();

      const state = badges.getState();
      expect(state.unseenAchievements.size).toBe(0);
    });
  });

  describe('setCheckinPending()', () => {
    it('should update checkin state', () => {
      badges.init();
      badges.setCheckinPending(true, 'Test message');

      const state = badges.getState();
      expect(state.hasCheckin).toBe(true);
      expect(state.checkinMessage).toBe('Test message');
    });

    it('should dispatch ferni:checkin-available when pending', () => {
      badges.init();
      const handler = vi.fn();
      window.addEventListener('ferni:checkin-available', handler);

      badges.setCheckinPending(true, 'Test message');

      expect(handler).toHaveBeenCalledTimes(1);
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
        message: 'Test message',
      });
      window.removeEventListener('ferni:checkin-available', handler);
    });

    it('should dispatch ferni:checkin-dismissed when cleared', () => {
      badges.init();
      badges.setCheckinPending(true, 'Test message');

      const handler = vi.fn();
      window.addEventListener('ferni:checkin-dismissed', handler);
      badges.setCheckinPending(false);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(badges.getState().hasCheckin).toBe(false);
      expect(badges.getState().checkinMessage).toBeUndefined();
      window.removeEventListener('ferni:checkin-dismissed', handler);
    });
  });

  describe('getState()', () => {
    it('should return current state', () => {
      badges.init();
      badges.updateStreak(7, false);
      badges.updateSeeds(100, false);
      badges.updateAchievements(5);

      const state = badges.getState();

      expect(state.streak).toBe(7);
      expect(state.seeds).toBe(100);
      expect(state.achievementCount).toBe(5);
    });

    it('should return copy of state (not reference)', () => {
      badges.init();
      badges.updateStreak(7, false);

      const state1 = badges.getState();
      state1.streak = 999;

      const state2 = badges.getState();
      expect(state2.streak).toBe(7);
    });
  });

  describe('event dispatching', () => {
    it('should not dispatch renderer-owned click events - it has no DOM', () => {
      // ferni:show-streak-details / ferni:open-trophy-room are dispatched by
      // whatever renders the badges (journey.ui.ts), not by this data manager.
      badges.init();
      const streakDetails = vi.fn();
      const trophyRoom = vi.fn();
      window.addEventListener('ferni:show-streak-details', streakDetails);
      window.addEventListener('ferni:open-trophy-room', trophyRoom);

      badges.updateStreak(7, false);
      badges.updateAchievements(5, ['badge1']);

      expect(streakDetails).not.toHaveBeenCalled();
      expect(trophyRoom).not.toHaveBeenCalled();

      window.removeEventListener('ferni:show-streak-details', streakDetails);
      window.removeEventListener('ferni:open-trophy-room', trophyRoom);
    });
  });

  describe('cleanup', () => {
    it('should reset all state on destroy', () => {
      badges.init();
      badges.updateStreak(7, false);
      badges.updateSeeds(100, false);
      badges.updateAchievements(5, ['badge1']);
      badges.setCheckinPending(true, 'hello');

      badges.destroy();

      const state = badges.getState();
      expect(state.streak).toBe(0);
      expect(state.seeds).toBe(0);
      expect(state.achievementCount).toBe(0);
      expect(state.unseenAchievements.size).toBe(0);
      expect(state.hasCheckin).toBe(false);
      expect(state.checkinMessage).toBeUndefined();
    });
  });
});
