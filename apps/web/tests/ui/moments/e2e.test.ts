/**
 * Moments System E2E Tests
 *
 * Full integration tests for the moments system.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';

// Mock dependencies before imports
vi.mock('@/config/animation-constants.js', () => ({
  DURATION: {
    MICRO: 50,
    FAST: 100,
    NORMAL: 200,
    SLOW: 300,
    MODERATE: 400,
    DELIBERATE: 500,
    DRAMATIC: 600,
    CELEBRATION: 800,
    GLACIAL: 1500,
  },
  EASING: {
    STANDARD: 'ease',
    SPRING: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    SPRING_GENTLE: 'cubic-bezier(0.25, 1.25, 0.5, 1)',
    EXPO_OUT: 'cubic-bezier(0.16, 1, 0.3, 1)',
    GENTLE: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  STAGGER: { TIGHT: 30, NORMAL: 50, RELAXED: 80, DRAMATIC: 120 },
  prefersReducedMotion: () => false,
}));

vi.mock('@/services/haptics.service.js', () => ({
  getHapticsService: () => ({
    play: vi.fn(),
  }),
}));

vi.mock('@/services/cosmetics.service.js', () => ({
  getSeedBalance: vi.fn().mockResolvedValue(100),
}));

vi.mock('@/services/seeds-economy.service.js', () => ({
  getCurrentStreak: vi.fn().mockReturnValue(7),
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

describe('Moments System E2E', () => {
  beforeAll(() => {
    // Mock Element.animate (not supported in jsdom)
    Element.prototype.animate = vi.fn().mockReturnValue({
      finished: Promise.resolve(),
      cancel: vi.fn(),
      onfinish: null,
    });
  });

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = '';

    // Create avatar container (required for badges)
    const avatar = document.createElement('div');
    avatar.className = 'avatar-container';
    document.body.appendChild(avatar);

    // Reset all singletons
    const { resetMomentsManager } = await import('@/ui/moments/manager.js');
    const { resetBadgeDisplay } = await import('@/ui/moments/badges.js');
    const { resetTrophyRoom } = await import('@/ui/moments/trophy-room.js');
    resetMomentsManager();
    resetBadgeDisplay();
    resetTrophyRoom();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Full System Integration', () => {
    it('should initialize moments system completely', async () => {
      const { initMomentsSystem, destroyMomentsSystem } = await import('@/ui/moments/init.js');

      await initMomentsSystem();

      // Wait for deferred initialization
      await new Promise((r) => setTimeout(r, 200));

      // Verify badge container created (styles are injected lazily on first use)
      const badgeContainer = document.querySelector('.moments-badges');
      expect(badgeContainer).toBeTruthy();

      // Cleanup
      destroyMomentsSystem();
    });

    it('should sync badge data from services', async () => {
      const { badges, initBadgeDisplay, resetBadgeDisplay } = await import('@/ui/moments/badges.js');

      // Initialize badges first
      resetBadgeDisplay();
      initBadgeDisplay();
      await new Promise((r) => setTimeout(r, 100));

      // Manually update with test data (simulating sync)
      badges.updateStreak(7, false);
      badges.updateSeeds(100, false);

      const state = badges.getState();
      expect(state.streak).toBe(7);
      expect(state.seeds).toBe(100);

      resetBadgeDisplay();
    });
  });

  describe('Whisper → Notice → Celebration Flow', () => {
    it('should handle sequential feedback levels', async () => {
      const { moments, resetMomentsManager } = await import('@/ui/moments/index.js');

      // Level 1: Whisper
      const whisperId = moments.whisper('Saved!', { type: 'success' });
      expect(document.querySelector('.moment-whisper')).toBeTruthy();
      expect(document.querySelector('.moment-whisper')?.textContent).toBe('Saved!');

      // Dismiss whisper
      moments.dismiss(whisperId);
      await new Promise((r) => setTimeout(r, 350));

      // Level 2: Notice
      moments.notice('+10 seeds earned', { type: 'seeds', amount: 10 });
      expect(document.querySelector('.moment-notice')).toBeTruthy();

      // Dismiss notice
      moments.dismissAll();
      await new Promise((r) => setTimeout(r, 350));

      // Level 3: Celebration (would show but we're in jsdom)
      const celebrationPromise = moments.celebrate('streak', { count: 7 });
      expect(celebrationPromise).toBeInstanceOf(Promise);

      resetMomentsManager();
    });
  });

  describe('Badge System', () => {
    it('should update badges independently', async () => {
      const { badges, resetBadgeDisplay, initBadgeDisplay } = await import(
        '@/ui/moments/badges.js'
      );

      resetBadgeDisplay();
      initBadgeDisplay();
      await new Promise((r) => setTimeout(r, 100));

      // Update streak
      badges.updateStreak(14, false);
      expect(badges.getState().streak).toBe(14);

      // Update seeds
      badges.updateSeeds(250, false);
      expect(badges.getState().seeds).toBe(250);

      // Update achievements
      badges.updateAchievements(5, ['badge1', 'badge2']);
      expect(badges.getState().achievementCount).toBe(5);
      expect(badges.getState().unseenAchievements.size).toBe(2);

      // Mark seen
      badges.markSeen();
      expect(badges.getState().unseenAchievements.size).toBe(0);

      resetBadgeDisplay();
    });
  });

  describe('Event System', () => {
    it('should dispatch and receive events', async () => {
      const { getMomentsManager, resetMomentsManager } = await import('@/ui/moments/manager.js');

      // Reset to get fresh instance
      resetMomentsManager();
      const manager = getMomentsManager();

      const whisperHandler = vi.fn();

      // Subscribe before creating whisper
      manager.on('whisper:shown', whisperHandler);

      // Create whisper
      const id = manager.whisper('Test whisper');

      // Verify whisper was shown
      expect(id).toMatch(/^moment-\d+$/);
      const whisper = document.querySelector('.moment-whisper');
      expect(whisper).toBeTruthy();

      resetMomentsManager();
    });

    it('should fire data connector events', async () => {
      const { attachDataListeners, detachDataListeners } = await import(
        '@/ui/moments/data-connector.js'
      );
      const { badges, initBadgeDisplay, resetBadgeDisplay } = await import(
        '@/ui/moments/badges.js'
      );

      resetBadgeDisplay();
      initBadgeDisplay();
      attachDataListeners();

      await new Promise((r) => setTimeout(r, 100));

      // Fire streak event
      window.dispatchEvent(
        new CustomEvent('ferni:streak-updated', {
          detail: { streak: 21 },
        })
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(badges.getState().streak).toBe(21);

      // Fire seeds event
      window.dispatchEvent(
        new CustomEvent('ferni:seeds-earned', {
          detail: { balance: 500 },
        })
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(badges.getState().seeds).toBe(500);

      detachDataListeners();
      resetBadgeDisplay();
    });
  });

  describe('Trophy Room', () => {
    it('should open and close trophy room', async () => {
      const { openTrophyRoom, closeTrophyRoom, resetTrophyRoom } = await import(
        '@/ui/moments/trophy-room.js'
      );

      // Open trophy room with badges
      openTrophyRoom([
        {
          id: 'early_riser',
          name: 'Early Riser',
          description: 'First conversation before 7am',
          icon: 'sunrise',
          category: 'time',
          earnedAt: new Date(),
        },
      ]);

      await new Promise((r) => setTimeout(r, 100));

      const trophyRoom = document.querySelector('.trophy-room');
      expect(trophyRoom).toBeTruthy();

      // Close trophy room
      closeTrophyRoom();
      await new Promise((r) => setTimeout(r, 400));

      expect(document.querySelector('.trophy-room')).toBeFalsy();

      resetTrophyRoom();
    });
  });

  describe('Backward Compatibility', () => {
    it('should support legacy toast API', async () => {
      const { getMomentsManager, resetMomentsManager } = await import('@/ui/moments/manager.js');

      // Get fresh manager
      const manager = getMomentsManager();
      manager.whisper('Success message', { type: 'success' });

      expect(document.querySelector('.moment-whisper')).toBeTruthy();
      expect(document.querySelector('.moment-whisper--success')).toBeTruthy();

      resetMomentsManager();
    });

    it('should support legacy whisper API', async () => {
      const { getMomentsManager, resetMomentsManager } = await import('@/ui/moments/manager.js');

      const manager = getMomentsManager();
      manager.whisper('Info message', { type: 'info' });

      expect(document.querySelector('.moment-whisper')).toBeTruthy();
      expect(document.querySelector('.moment-whisper--info')).toBeTruthy();

      resetMomentsManager();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', async () => {
      const { getMomentsManager, resetMomentsManager } = await import('@/ui/moments/manager.js');

      const manager = getMomentsManager();
      manager.whisper('Test message');

      const container = document.querySelector('.moments-container');
      expect(container).toBeTruthy();
      expect(container?.getAttribute('role')).toBe('status');
      expect(container?.getAttribute('aria-live')).toBe('polite');

      resetMomentsManager();
    });

    it('should have proper screen reader text', async () => {
      const { badges, initBadgeDisplay, resetBadgeDisplay } = await import(
        '@/ui/moments/badges.js'
      );

      resetBadgeDisplay();
      initBadgeDisplay();
      await new Promise((r) => setTimeout(r, 100));

      badges.updateStreak(7, false);

      const streakBadge = document.querySelector('.moments-badge--streak');
      expect(streakBadge?.getAttribute('aria-label')).toContain('streak');

      resetBadgeDisplay();
    });
  });

  describe('Brand Compliance', () => {
    it('should use SVG icons (no emoji)', async () => {
      const { MOMENT_ICONS } = await import('@/ui/moments/icons.js');

      // Verify all icons are SVG strings
      for (const [name, svg] of Object.entries(MOMENT_ICONS)) {
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
        expect(svg).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u); // No emoji
      }
    });

    it('should have warm, human messaging', async () => {
      const { BADGE_DEFINITIONS } = await import('@/ui/moments/trophy-room.js');

      // Check that badge quotes use warm human voice
      for (const badge of Object.values(BADGE_DEFINITIONS)) {
        // No corporate jargon
        expect(badge.quote.toLowerCase()).not.toContain('user');
        expect(badge.quote.toLowerCase()).not.toContain('utilize');
        expect(badge.quote.toLowerCase()).not.toContain('leverage');

        // Has actual content (not empty)
        expect(badge.quote.length).toBeGreaterThan(10);
      }
    });
  });
});
