/**
 * BadgeDisplay Unit Tests
 *
 * Tests for the badge display system.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('@/config/animation-constants.js', () => ({
  DURATION: { FAST: 100, NORMAL: 200, SLOW: 300, CELEBRATION: 800, DELIBERATE: 500 },
  EASING: { SPRING: 'ease-out', STANDARD: 'ease', EXPO_OUT: 'ease-out' },
  STAGGER: { TIGHT: 30, NORMAL: 50, RELAXED: 80, DRAMATIC: 120 },
  prefersReducedMotion: () => false,
}));

vi.mock('@/services/haptics.service.js', () => ({
  getHapticsService: () => ({
    play: vi.fn(),
  }),
}));

vi.mock('@/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/utils/tracked-timeout.js', () => ({
  createTimeoutTracker: () => ({
    trackedTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearAll: vi.fn(),
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

    it('should create badge container after init', async () => {
      badges.init();

      // Wait for avatar container detection
      await new Promise((r) => setTimeout(r, 100));

      const container = document.querySelector('.moments-badges');
      expect(container).toBeTruthy();
    });

    it('should clean up orphaned elements', async () => {
      // Simulate orphaned element
      const orphan = document.createElement('div');
      orphan.className = 'moments-badges';
      document.body.appendChild(orphan);

      badges.init();
      await new Promise((r) => setTimeout(r, 100));

      const containers = document.querySelectorAll('.moments-badges');
      expect(containers.length).toBe(1);
    });
  });

  describe('updateStreak()', () => {
    it('should update streak state', () => {
      badges.init();
      badges.updateStreak(7, false);

      const state = badges.getState();
      expect(state.streak).toBe(7);
    });

    it('should not render badge if streak is 0', async () => {
      badges.init();
      badges.updateStreak(0, false);

      await new Promise((r) => setTimeout(r, 100));

      const streakBadge = document.querySelector('.moments-badge--streak');
      expect(streakBadge).toBeFalsy();
    });

    it('should render badge when streak > 0', async () => {
      badges.init();
      await new Promise((r) => setTimeout(r, 100));

      badges.updateStreak(7, false);

      const streakBadge = document.querySelector('.moments-badge--streak');
      expect(streakBadge).toBeTruthy();
    });
  });

  describe('updateSeeds()', () => {
    it('should update seeds state', () => {
      badges.init();
      badges.updateSeeds(150, false);

      const state = badges.getState();
      expect(state.seeds).toBe(150);
    });

    it('should format large numbers', async () => {
      badges.init();
      await new Promise((r) => setTimeout(r, 100));

      badges.updateSeeds(1500, false);

      const seedsBadge = document.querySelector('.moments-badge--seeds');
      const count = seedsBadge?.querySelector('.moments-badge__count');
      expect(count?.textContent).toBe('1.5k');
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

    it('should add new indicator for unseen', async () => {
      badges.init();
      await new Promise((r) => setTimeout(r, 100));

      badges.updateAchievements(3, ['badge1']);

      const badge = document.querySelector('.moments-badge--achievements');
      expect(badge?.classList.contains('moments-badge--new')).toBe(true);
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
      badges.setCheckin(true, 'Test message');

      const state = badges.getState();
      expect(state.hasCheckin).toBe(true);
      expect(state.checkinMessage).toBe('Test message');
    });

    it('should create checkin badge', async () => {
      badges.init();
      await new Promise((r) => setTimeout(r, 100));

      badges.setCheckin(true);

      const checkinBadge = document.querySelector('.moments-checkin-badge');
      expect(checkinBadge).toBeTruthy();
    });

    it('should remove checkin badge when cleared', async () => {
      badges.init();
      await new Promise((r) => setTimeout(r, 100));

      badges.setCheckin(true);
      badges.setCheckin(false);

      const checkinBadge = document.querySelector('.moments-checkin-badge');
      expect(checkinBadge).toBeFalsy();
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
    it('should dispatch event on streak click', async () => {
      badges.init();
      await new Promise((r) => setTimeout(r, 100));
      badges.updateStreak(7, false);

      const handler = vi.fn();
      window.addEventListener('ferni:show-streak-details', handler);

      const streakBadge = document.querySelector('.moments-badge--streak');
      streakBadge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(handler).toHaveBeenCalled();

      window.removeEventListener('ferni:show-streak-details', handler);
    });

    it('should dispatch event on achievements click', async () => {
      badges.init();
      await new Promise((r) => setTimeout(r, 100));
      badges.updateAchievements(5);

      const handler = vi.fn();
      window.addEventListener('ferni:open-trophy-room', handler);

      const achievementsBadge = document.querySelector('.moments-badge--achievements');
      achievementsBadge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(handler).toHaveBeenCalled();

      window.removeEventListener('ferni:open-trophy-room', handler);
    });
  });

  describe('cleanup', () => {
    it('should clean up on destroy', async () => {
      badges.init();
      await new Promise((r) => setTimeout(r, 100));
      badges.updateStreak(7, false);

      badges.destroy();

      expect(document.querySelector('.moments-badges')).toBeFalsy();
    });
  });
});
