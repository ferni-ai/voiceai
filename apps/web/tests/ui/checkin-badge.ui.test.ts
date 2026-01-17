/**
 * Check-in Badge UI Tests
 *
 * Tests for the warm indicator component that shows when Ferni
 * wants to check in with the user.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS - Set up before dynamic imports
// ============================================================================

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock animation constants
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300 },
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out', EASE_IN_OUT: 'ease-in-out' },
}));

// Create mock functions that can be configured per test
const mockAuthState = { isAuthenticated: true, userId: 'test-user-123' };
const mockApiGet = vi.fn();

// Mock auth service
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthState: () => mockAuthState,
}));

// Mock API
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
}));

// ============================================================================
// TEST SETUP
// ============================================================================

describe('CheckinBadgeUI', () => {
  // Use dynamic import to ensure mocks are applied
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let initCheckinBadgeUI: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let disposeCheckinBadgeUI: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let triggerCheckin: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let refreshCheckin: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let checkinBadgeUI: any;

  let avatarContainer: HTMLElement;

  beforeEach(async () => {
    // Reset DOM - safe cleanup for tests
    document.body.textContent = '';
    document.head.textContent = '';

    // Create avatar container (required for badge placement)
    avatarContainer = document.createElement('div');
    avatarContainer.className = 'avatar-container';
    document.body.appendChild(avatarContainer);

    // Reset localStorage
    localStorage.clear();

    // Reset mocks
    vi.clearAllMocks();

    // Reset auth state to authenticated
    mockAuthState.isAuthenticated = true;
    mockAuthState.userId = 'test-user-123';

    // Default API response
    mockApiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        hasCheckin: true,
        checkin: {
          id: 'checkin-123',
          type: 'thinking_of_you',
          message: "I've been thinking about you",
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Reset module state by re-importing
    vi.resetModules();
    const module = await import('../../src/ui/checkin-badge.ui.js');
    initCheckinBadgeUI = module.initCheckinBadgeUI;
    disposeCheckinBadgeUI = module.disposeCheckinBadgeUI;
    triggerCheckin = module.triggerCheckin;
    refreshCheckin = module.refreshCheckin;
    checkinBadgeUI = module.checkinBadgeUI;
  });

  afterEach(() => {
    disposeCheckinBadgeUI?.();
    document.body.textContent = '';
    document.head.textContent = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ============================================================================
  // MODULE EXPORTS
  // ============================================================================

  describe('Module exports', () => {
    it('should export init function', () => {
      expect(typeof initCheckinBadgeUI).toBe('function');
    });

    it('should export dispose function', () => {
      expect(typeof disposeCheckinBadgeUI).toBe('function');
    });

    it('should export trigger function', () => {
      expect(typeof triggerCheckin).toBe('function');
    });

    it('should export refresh function', () => {
      expect(typeof refreshCheckin).toBe('function');
    });

    it('should export checkinBadgeUI object with all methods', () => {
      expect(checkinBadgeUI).toBeDefined();
      expect(typeof checkinBadgeUI.init).toBe('function');
      expect(typeof checkinBadgeUI.dispose).toBe('function');
      expect(typeof checkinBadgeUI.trigger).toBe('function');
      expect(typeof checkinBadgeUI.refresh).toBe('function');
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('Initialization', () => {
    it('should inject styles on init', () => {
      initCheckinBadgeUI();

      const styleElement = document.getElementById('checkin-badge-styles');
      expect(styleElement).toBeTruthy();
      expect(styleElement?.tagName).toBe('STYLE');
    });

    it('should not inject styles twice', () => {
      initCheckinBadgeUI();
      initCheckinBadgeUI();

      const styleElements = document.querySelectorAll('#checkin-badge-styles');
      expect(styleElements.length).toBe(1);
    });

    it('should check for pending check-in after delay', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();

      expect(mockApiGet).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3500);

      expect(mockApiGet).toHaveBeenCalledWith('/api/outreach/pending-checkin');
    });
  });

  // ============================================================================
  // BADGE DISPLAY
  // ============================================================================

  describe('Badge display', () => {
    it('should show badge when check-in is available', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3500);

      // Wait for DOM update
      await vi.advanceTimersByTimeAsync(100);

      const badge = avatarContainer.querySelector('.checkin-badge');
      expect(badge).toBeTruthy();
    });

    it('should not show badge when no check-in', async () => {
      mockApiGet.mockResolvedValue({
        ok: true,
        status: 200,
        data: { hasCheckin: false },
      });

      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3500);

      const badge = avatarContainer.querySelector('.checkin-badge');
      expect(badge).toBeFalsy();
    });

    it('should not show badge when not authenticated', async () => {
      mockAuthState.isAuthenticated = false;

      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3500);

      const badge = avatarContainer.querySelector('.checkin-badge');
      expect(badge).toBeFalsy();
    });

    it('should render SVG icon based on check-in type', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3500);
      await vi.advanceTimersByTimeAsync(100);

      const badge = avatarContainer.querySelector('.checkin-badge');
      const svg = badge?.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  // ============================================================================
  // ACCESSIBILITY
  // ============================================================================

  describe('Accessibility', () => {
    it('should have role="button" on badge', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge');
      expect(badge?.getAttribute('role')).toBe('button');
    });

    it('should have tabindex="0" on badge', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge');
      expect(badge?.getAttribute('tabindex')).toBe('0');
    });

    it('should have aria-label on badge', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge');
      expect(badge?.getAttribute('aria-label')).toBe('Ferni wants to check in');
    });
  });

  // ============================================================================
  // BADGE INTERACTION
  // ============================================================================

  describe('Badge interaction', () => {
    it('should dispatch event when badge clicked', async () => {
      vi.useFakeTimers();

      const eventHandler = vi.fn();
      window.addEventListener('ferni:checkin-acknowledged', eventHandler);

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge') as HTMLElement;
      badge?.click();

      expect(eventHandler).toHaveBeenCalled();

      const event = eventHandler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.checkinId).toBe('checkin-123');
      expect(event.detail.message).toBe("I've been thinking about you");
      expect(event.detail.type).toBe('thinking_of_you');

      window.removeEventListener('ferni:checkin-acknowledged', eventHandler);
    });

    it('should hide badge after click', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge') as HTMLElement;
      badge?.click();

      await vi.advanceTimersByTimeAsync(350);

      expect(avatarContainer.querySelector('.checkin-badge')).toBeFalsy();
    });

    it('should save dismissed time to localStorage', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge') as HTMLElement;
      badge?.click();

      const dismissed = localStorage.getItem('ferni_checkin_dismissed');
      expect(dismissed).toBeTruthy();
    });

    it('should respond to Enter key', async () => {
      vi.useFakeTimers();

      const eventHandler = vi.fn();
      window.addEventListener('ferni:checkin-acknowledged', eventHandler);

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge') as HTMLElement;
      badge?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(eventHandler).toHaveBeenCalled();

      window.removeEventListener('ferni:checkin-acknowledged', eventHandler);
    });

    it('should respond to Space key', async () => {
      vi.useFakeTimers();

      const eventHandler = vi.fn();
      window.addEventListener('ferni:checkin-acknowledged', eventHandler);

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge') as HTMLElement;
      badge?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

      expect(eventHandler).toHaveBeenCalled();

      window.removeEventListener('ferni:checkin-acknowledged', eventHandler);
    });
  });

  // ============================================================================
  // TOOLTIP
  // ============================================================================

  describe('Tooltip', () => {
    it('should show tooltip on hover', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge') as HTMLElement;
      badge?.dispatchEvent(new MouseEvent('mouseenter'));

      await vi.advanceTimersByTimeAsync(100);

      const tooltip = document.querySelector('.checkin-badge-tooltip');
      expect(tooltip).toBeTruthy();
      expect(tooltip?.textContent).toBe("I've been thinking about you");
    });

    it('should hide tooltip on mouse leave', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge') as HTMLElement;
      badge?.dispatchEvent(new MouseEvent('mouseenter'));
      await vi.advanceTimersByTimeAsync(100);

      badge?.dispatchEvent(new MouseEvent('mouseleave'));
      await vi.advanceTimersByTimeAsync(300);

      const tooltip = document.querySelector('.checkin-badge-tooltip');
      expect(tooltip).toBeFalsy();
    });

    it('should show tooltip on focus', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge') as HTMLElement;
      badge?.dispatchEvent(new FocusEvent('focus'));

      await vi.advanceTimersByTimeAsync(100);

      const tooltip = document.querySelector('.checkin-badge-tooltip');
      expect(tooltip).toBeTruthy();
    });
  });

  // ============================================================================
  // MANUAL TRIGGER
  // ============================================================================

  describe('Manual trigger', () => {
    it('should show badge when triggered manually', () => {
      initCheckinBadgeUI();

      triggerCheckin({
        id: 'manual-123',
        type: 'celebration',
        message: 'Congrats on your achievement!',
        timestamp: new Date().toISOString(),
      });

      const badge = avatarContainer.querySelector('.checkin-badge');
      expect(badge).toBeTruthy();
    });

    it('should use correct icon for triggered type', () => {
      initCheckinBadgeUI();

      triggerCheckin({
        id: 'manual-123',
        type: 'support',
        message: "I'm here for you",
        timestamp: new Date().toISOString(),
      });

      const badge = avatarContainer.querySelector('.checkin-badge');
      const svg = badge?.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  // ============================================================================
  // DISMISSAL COOLDOWN
  // ============================================================================

  describe('Dismissal cooldown', () => {
    it('should not check for 1 hour after dismissal', async () => {
      vi.useFakeTimers();

      // Set dismissed time to 30 minutes ago
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      localStorage.setItem('ferni_checkin_dismissed', String(thirtyMinutesAgo));

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      // API should be called but badge should not show
      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('should check again after cooldown expires', async () => {
      vi.useFakeTimers();

      // Set dismissed time to 2 hours ago
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      localStorage.setItem('ferni_checkin_dismissed', String(twoHoursAgo));

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      expect(mockApiGet).toHaveBeenCalledWith('/api/outreach/pending-checkin');
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  describe('Cleanup', () => {
    it('should remove styles on dispose', () => {
      initCheckinBadgeUI();

      expect(document.getElementById('checkin-badge-styles')).toBeTruthy();

      disposeCheckinBadgeUI();

      expect(document.getElementById('checkin-badge-styles')).toBeFalsy();
    });

    it('should remove badge on dispose', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      await vi.advanceTimersByTimeAsync(3600);

      expect(avatarContainer.querySelector('.checkin-badge')).toBeTruthy();

      disposeCheckinBadgeUI();

      await vi.advanceTimersByTimeAsync(350);

      expect(avatarContainer.querySelector('.checkin-badge')).toBeFalsy();
    });

    it('should clear check interval on dispose', () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();

      disposeCheckinBadgeUI();

      // Advance past multiple check intervals
      vi.advanceTimersByTime(20 * 60 * 1000);

      // API should only have been called once (initial check), not by interval
      expect(mockApiGet).toHaveBeenCalledTimes(0);
    });

    it('should allow re-initialization after dispose', async () => {
      vi.useFakeTimers();

      initCheckinBadgeUI();
      disposeCheckinBadgeUI();
      initCheckinBadgeUI();

      await vi.advanceTimersByTimeAsync(3600);

      const badge = avatarContainer.querySelector('.checkin-badge');
      expect(badge).toBeTruthy();
    });
  });
});
