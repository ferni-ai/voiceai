/**
 * Memory Lane UI Tests
 *
 * Tests for the "On This Day" memories and highlights component.
 * Verifies initialization, memory display, notifications, and drawer behavior.
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
const mockToast = {
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

// Mock auth service
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthState: () => mockAuthState,
}));

// Mock toast (via whisper system)
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: mockToast,
  whisper: mockToast,
}));

// Mock API
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
}));

// ============================================================================
// TEST SETUP
// ============================================================================

describe('MemoryLaneUI', () => {
  // Use dynamic import to ensure mocks are applied
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let initMemoryLaneUI: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let disposeMemoryLaneUI: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let memoryLaneUI: any;

  let avatarContainer: HTMLElement;

  beforeEach(async () => {
    // Reset DOM - safe cleanup for tests
    document.body.textContent = '';
    document.head.textContent = '';

    // Create avatar container (required for button placement)
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

    // Default API responses
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/memories/on-this-day') {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: {
            memories: [
              {
                id: 'mem-1',
                occurredAt: new Date().toISOString(),
                content: 'You shared about starting your new project',
                emotionalTone: 'joyful',
                yearAgo: 1,
              },
            ],
            hasMoreMemories: false,
          },
        });
      }
      if (url === '/api/memories/highlights') {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: {
            memories: [
              {
                id: 'mem-1',
                occurredAt: new Date().toISOString(),
                content: 'You shared about starting your new project',
                emotionalTone: 'joyful',
                yearAgo: 1,
              },
              {
                id: 'mem-2',
                date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
                content: 'We talked about your goals for the year',
                emotionalTone: 'meaningful',
                yearAgo: 2,
              },
            ],
            hasMoreMemories: true,
          },
        });
      }
      return Promise.resolve({ ok: false, status: 404, data: null });
    });

    // Reset module state by re-importing
    vi.resetModules();
    const module = await import('../../src/ui/memory-lane.ui.js');
    initMemoryLaneUI = module.initMemoryLaneUI;
    disposeMemoryLaneUI = module.disposeMemoryLaneUI;
    memoryLaneUI = module.memoryLaneUI;
  });

  afterEach(() => {
    disposeMemoryLaneUI?.();
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
      expect(typeof initMemoryLaneUI).toBe('function');
    });

    it('should export dispose function', () => {
      expect(typeof disposeMemoryLaneUI).toBe('function');
    });

    it('should export memoryLaneUI object with all methods', () => {
      expect(memoryLaneUI).toBeDefined();
      expect(typeof memoryLaneUI.init).toBe('function');
      expect(typeof memoryLaneUI.open).toBe('function');
      expect(typeof memoryLaneUI.close).toBe('function');
      expect(typeof memoryLaneUI.dispose).toBe('function');
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('Initialization', () => {
    it('should inject styles on init', () => {
      initMemoryLaneUI();

      const styleElement = document.getElementById('memory-lane-styles');
      expect(styleElement).toBeTruthy();
      expect(styleElement?.tagName).toBe('STYLE');
    });

    it('should not inject styles twice', () => {
      initMemoryLaneUI();
      initMemoryLaneUI();

      const styleElements = document.querySelectorAll('#memory-lane-styles');
      expect(styleElements.length).toBe(1);
    });

    it('should not create its own avatar button', () => {
      // The entry point moved to the settings menu and the
      // ferni:open-memory-lane event (wired in app.ts); this module no longer
      // injects a launcher of its own.
      initMemoryLaneUI();

      expect(avatarContainer.querySelector('.memory-lane-button')).toBeNull();
      expect(document.querySelector('.memory-lane-button')).toBeNull();
    });
  });

  // ============================================================================
  // BUTTON BEHAVIOR
  // ============================================================================

  describe('Entry point', () => {
    it('should open the modal via the public open() API', async () => {
      initMemoryLaneUI();

      expect(document.querySelector('.memory-lane-modal')).toBeNull();
      await memoryLaneUI.open();

      const modal = document.querySelector('.memory-lane-modal');
      expect(modal).toBeTruthy();
      expect(modal?.getAttribute('role')).toBe('dialog');

      // The open class is applied in a requestAnimationFrame callback
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      expect(modal?.classList.contains('memory-lane-modal--open')).toBe(true);
    });

    it('should title the modal Memory Lane', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const title = document.querySelector('.memory-lane-modal');
      expect(title?.getAttribute('aria-label')).toBe('Memory Lane');
    });

    it('should expose open and close on the facade', () => {
      expect(typeof memoryLaneUI.open).toBe('function');
      expect(typeof memoryLaneUI.close).toBe('function');
    });
  });

  // ============================================================================
  // DRAWER DISPLAY
  // ============================================================================

  describe('Drawer display', () => {
    it('should create drawer when opened', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const modal = document.querySelector('.memory-lane-modal');
      expect(modal).toBeTruthy();
    });

    it('should fetch highlights from API', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      expect(mockApiGet).toHaveBeenCalledWith('/api/memories/highlights');
    });

    it('should render memory cards', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const cards = document.querySelectorAll('.memory-lane-card');
      expect(cards.length).toBe(2); // From our mock
    });

    it('should show empty state when no memories', async () => {
      mockApiGet.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          data: { memories: [], hasMoreMemories: false },
        })
      );

      initMemoryLaneUI();
      await memoryLaneUI.open();

      // highlights and timeline render the shared empty-state component;
      // only the on-this-day tab uses the local .memory-lane-empty markup.
      const emptyState = document.querySelector('.ferni-empty-state');
      expect(emptyState).toBeTruthy();
      expect(document.querySelectorAll('.memory-lane-card').length).toBe(0);
    });
  });

  // ============================================================================
  // ACCESSIBILITY
  // ============================================================================

  describe('Accessibility', () => {
    it('should have role="dialog" on drawer', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const modal = document.querySelector('.memory-lane-modal');
      expect(modal?.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-label on drawer', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const modal = document.querySelector('.memory-lane-modal');
      expect(modal?.getAttribute('aria-label')).toBe('Memory Lane');
    });

    it('should have aria-label on close button', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const closeBtn = document.querySelector('.memory-lane-modal__close');
      expect(closeBtn?.getAttribute('aria-label')).toBe('Close');
    });

    it('should have aria-hidden on emotion icons', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const icons = document.querySelectorAll('.memory-lane-card__icon');
      icons.forEach((icon) => {
        expect(icon.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });

  // ============================================================================
  // MEMORY DISPLAY
  // ============================================================================

  describe('Memory display', () => {
    it('should render memory content', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const contents = document.querySelectorAll('.memory-lane-card__content');
      expect(contents[0]?.textContent).toContain('starting your new project');
    });

    it('should format date with year ago on the On This Day tab', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      // Years-ago labelling is specific to the on-this-day tab; highlights
      // renders plain dates.
      const onThisDayTab = document.querySelector(
        '.memory-lane-modal__tab[data-tab="on-this-day"]'
      ) as HTMLElement;
      expect(onThisDayTab).toBeTruthy();
      onThisDayTab.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const dates = document.querySelectorAll('.memory-lane-card__date');
      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.textContent).toContain('1 year ago');
    });

    it('should apply emotion-specific class to cards', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const joyfulCard = document.querySelector('.memory-lane-card--joyful');
      expect(joyfulCard).toBeTruthy();

      const meaningfulCard = document.querySelector('.memory-lane-card--meaningful');
      expect(meaningfulCard).toBeTruthy();
    });
  });

  // ============================================================================
  // ON THIS DAY CHECK
  // ============================================================================

  describe('On This Day check', () => {
    it('should check for memories on init after delay', async () => {
      vi.useFakeTimers();

      initMemoryLaneUI();

      // Fast-forward past the initial delay
      await vi.advanceTimersByTimeAsync(3500);

      expect(mockApiGet).toHaveBeenCalledWith('/api/memories/on-this-day');
    });

    it('should surface an anniversary notification when a memory is found', async () => {
      vi.useFakeTimers();

      initMemoryLaneUI();
      await vi.advanceTimersByTimeAsync(3500);

      const notification = document.querySelector('.memory-lane-anniversary-notification');
      expect(notification).toBeTruthy();
      expect(notification?.textContent).toContain('1 year');
    });

    it('should make the anniversary notification keyboard-accessible', async () => {
      vi.useFakeTimers();

      initMemoryLaneUI();
      await vi.advanceTimersByTimeAsync(3500);

      const notification = document.querySelector('.memory-lane-anniversary-notification');
      expect(notification?.getAttribute('role')).toBe('button');
      expect(notification?.getAttribute('tabindex')).toBe('0');
      expect(notification?.getAttribute('aria-label')).toBe('View memory from this day');
    });

    it('should not check again on same day', async () => {
      vi.useFakeTimers();

      // Simulate already checked today
      localStorage.setItem('ferni_memory_lane_last_check', new Date().toDateString());

      initMemoryLaneUI();
      await vi.advanceTimersByTimeAsync(3500);

      expect(mockApiGet).not.toHaveBeenCalledWith('/api/memories/on-this-day');
    });
  });

  // ============================================================================
  // CLOSING
  // ============================================================================

  describe('Closing', () => {
    it('should close on close button click', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const closeBtn = document.querySelector('.memory-lane-modal__close') as HTMLElement;
      closeBtn?.click();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const modal = document.querySelector('.memory-lane-modal');
      expect(modal).toBeFalsy();
    });

    it('should close on Escape key', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const modal = document.querySelector('.memory-lane-modal');
      expect(modal).toBeFalsy();
    });

    it('should close on backdrop click', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const backdrop = document.querySelector('.memory-lane-modal__backdrop') as HTMLElement;
      expect(backdrop).toBeTruthy();
      backdrop.click();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(document.querySelector('.memory-lane-modal')).toBeFalsy();
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  describe('Cleanup', () => {
    it('should clear cached memories on dispose so the next open refetches', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();
      expect(mockApiGet).toHaveBeenCalledWith('/api/memories/highlights');

      // Second open reuses the cache - no refetch
      memoryLaneUI.close();
      mockApiGet.mockClear();
      await memoryLaneUI.open();
      expect(mockApiGet).not.toHaveBeenCalledWith('/api/memories/highlights');

      // Dispose clears the cache, so the next open must hit the API again
      disposeMemoryLaneUI();
      mockApiGet.mockClear();
      initMemoryLaneUI();
      await memoryLaneUI.open();

      expect(mockApiGet).toHaveBeenCalledWith('/api/memories/highlights');
    });

    it('should remove styles on dispose', () => {
      initMemoryLaneUI();

      expect(document.getElementById('memory-lane-styles')).toBeTruthy();

      disposeMemoryLaneUI();

      expect(document.getElementById('memory-lane-styles')).toBeFalsy();
    });

    it('should close drawer on dispose', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      disposeMemoryLaneUI();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const modal = document.querySelector('.memory-lane-modal');
      expect(modal).toBeFalsy();
    });

    it('should allow re-initialization after dispose', async () => {
      initMemoryLaneUI();
      disposeMemoryLaneUI();
      initMemoryLaneUI();

      await memoryLaneUI.open();

      const modal = document.querySelector('.memory-lane-modal');
      expect(modal).toBeTruthy();
    });
  });
});
