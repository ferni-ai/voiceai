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

// Mock toast
vi.mock('../../src/ui/toast.ui.js', () => ({
  toast: mockToast,
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
                date: new Date().toISOString(),
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
                date: new Date().toISOString(),
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

    it('should create button in avatar container', () => {
      initMemoryLaneUI();

      const button = avatarContainer.querySelector('.memory-lane-button');
      expect(button).toBeTruthy();
    });

    it('should render SVG icon in button', () => {
      initMemoryLaneUI();

      const svg = avatarContainer.querySelector('.memory-lane-button svg');
      expect(svg).toBeTruthy();
    });
  });

  // ============================================================================
  // BUTTON BEHAVIOR
  // ============================================================================

  describe('Button behavior', () => {
    it('should have aria-label on button', () => {
      initMemoryLaneUI();

      const button = avatarContainer.querySelector('.memory-lane-button');
      expect(button?.getAttribute('aria-label')).toBe('View memories');
    });

    it('should have title on button', () => {
      initMemoryLaneUI();

      const button = avatarContainer.querySelector('.memory-lane-button');
      expect(button?.getAttribute('title')).toBe('Memory Lane');
    });

    it('should open drawer on button click', async () => {
      initMemoryLaneUI();

      const button = avatarContainer.querySelector('.memory-lane-button') as HTMLElement;
      button?.click();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      const drawer = document.querySelector('.memory-lane-drawer');
      expect(drawer).toBeTruthy();
    });
  });

  // ============================================================================
  // DRAWER DISPLAY
  // ============================================================================

  describe('Drawer display', () => {
    it('should create drawer when opened', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const drawer = document.querySelector('.memory-lane-drawer');
      expect(drawer).toBeTruthy();
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

      const emptyState = document.querySelector('.memory-lane-empty');
      expect(emptyState).toBeTruthy();
    });
  });

  // ============================================================================
  // ACCESSIBILITY
  // ============================================================================

  describe('Accessibility', () => {
    it('should have role="dialog" on drawer', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const drawer = document.querySelector('.memory-lane-drawer');
      expect(drawer?.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-label on drawer', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const drawer = document.querySelector('.memory-lane-drawer');
      expect(drawer?.getAttribute('aria-label')).toBe('Memory Lane');
    });

    it('should have aria-label on close button', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const closeBtn = document.querySelector('.memory-lane-drawer__close');
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

    it('should format date with year ago', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const dates = document.querySelectorAll('.memory-lane-card__date');
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

    it('should show toast when memory found', async () => {
      vi.useFakeTimers();

      initMemoryLaneUI();
      await vi.advanceTimersByTimeAsync(3500);

      expect(mockToast.info).toHaveBeenCalledWith('1 year ago today...');
    });

    it('should add indicator class to button when memory found', async () => {
      vi.useFakeTimers();

      initMemoryLaneUI();
      await vi.advanceTimersByTimeAsync(3500);

      const button = avatarContainer.querySelector('.memory-lane-button');
      expect(button?.classList.contains('memory-lane-button--has-memory')).toBe(true);
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

      const closeBtn = document.querySelector('.memory-lane-drawer__close') as HTMLElement;
      closeBtn?.click();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const drawer = document.querySelector('.memory-lane-drawer');
      expect(drawer).toBeFalsy();
    });

    it('should close on Escape key', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const drawer = document.querySelector('.memory-lane-drawer');
      expect(drawer).toBeFalsy();
    });

    it('should close on backdrop click', async () => {
      initMemoryLaneUI();
      await memoryLaneUI.open();

      const drawer = document.querySelector('.memory-lane-drawer') as HTMLElement;
      drawer?.click();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(document.querySelector('.memory-lane-drawer')).toBeFalsy();
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  describe('Cleanup', () => {
    it('should remove button on dispose', () => {
      initMemoryLaneUI();

      expect(avatarContainer.querySelector('.memory-lane-button')).toBeTruthy();

      disposeMemoryLaneUI();

      expect(avatarContainer.querySelector('.memory-lane-button')).toBeFalsy();
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

      const drawer = document.querySelector('.memory-lane-drawer');
      expect(drawer).toBeFalsy();
    });

    it('should allow re-initialization after dispose', async () => {
      initMemoryLaneUI();
      disposeMemoryLaneUI();
      initMemoryLaneUI();

      await memoryLaneUI.open();

      const drawer = document.querySelector('.memory-lane-drawer');
      expect(drawer).toBeTruthy();
    });
  });
});
