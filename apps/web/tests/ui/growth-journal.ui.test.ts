/**
 * Growth Journal UI Tests
 *
 * Tests for the auto-generated reflections drawer component.
 * Verifies initialization, entry display, accessibility, and caching.
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
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out' },
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

describe('GrowthJournalUI', () => {
  // Use dynamic import to ensure mocks are applied
  let initGrowthJournalUI: () => void;
  let openGrowthJournal: () => Promise<void>;
  let closeGrowthJournal: () => void;
  let disposeGrowthJournalUI: () => void;
  let growthJournalUI: {
    init: () => void;
    open: () => Promise<void>;
    close: () => void;
    dispose: () => void;
  };

  beforeEach(async () => {
    // Reset DOM - safe cleanup for tests
    document.body.textContent = '';
    document.head.textContent = '';

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
        entries: [
          {
            id: 'entry-1',
            date: new Date().toISOString(),
            title: 'Morning consistency',
            content: "You've been checking in every morning this week. That consistency is building something meaningful.",
            type: 'pattern',
            tags: ['morning', 'consistency'],
          },
          {
            id: 'entry-2',
            date: new Date(Date.now() - 86400000).toISOString(), // Yesterday
            title: 'Celebrated a win',
            content: 'You shared about getting that promotion. Your hard work paid off!',
            type: 'celebration',
            tags: ['career', 'milestone'],
          },
        ],
        lastUpdated: new Date().toISOString(),
        streakDays: 5,
      },
    });

    // Reset module state by re-importing
    vi.resetModules();
    const module = await import('../../src/ui/growth-journal.ui.js');
    initGrowthJournalUI = module.initGrowthJournalUI;
    openGrowthJournal = module.openGrowthJournal;
    closeGrowthJournal = module.closeGrowthJournal;
    disposeGrowthJournalUI = module.disposeGrowthJournalUI;
    growthJournalUI = module.growthJournalUI;
  });

  afterEach(() => {
    disposeGrowthJournalUI?.();
    document.body.textContent = '';
    document.head.textContent = '';
    vi.clearAllMocks();
  });

  // ============================================================================
  // MODULE EXPORTS
  // ============================================================================

  describe('Module exports', () => {
    it('should export init function', () => {
      expect(typeof initGrowthJournalUI).toBe('function');
    });

    it('should export open function', () => {
      expect(typeof openGrowthJournal).toBe('function');
    });

    it('should export close function', () => {
      expect(typeof closeGrowthJournal).toBe('function');
    });

    it('should export dispose function', () => {
      expect(typeof disposeGrowthJournalUI).toBe('function');
    });

    it('should export growthJournalUI object with all methods', () => {
      expect(growthJournalUI).toBeDefined();
      expect(typeof growthJournalUI.init).toBe('function');
      expect(typeof growthJournalUI.open).toBe('function');
      expect(typeof growthJournalUI.close).toBe('function');
      expect(typeof growthJournalUI.dispose).toBe('function');
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('Initialization', () => {
    it('should inject styles on init', () => {
      initGrowthJournalUI();

      const styleElement = document.getElementById('growth-journal-styles');
      expect(styleElement).toBeTruthy();
      expect(styleElement?.tagName).toBe('STYLE');
    });

    it('should not inject styles twice', () => {
      initGrowthJournalUI();
      initGrowthJournalUI();

      const styleElements = document.querySelectorAll('#growth-journal-styles');
      expect(styleElements.length).toBe(1);
    });
  });

  // ============================================================================
  // DRAWER DISPLAY
  // ============================================================================

  describe('Drawer display', () => {
    it('should create drawer when opened', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer).toBeTruthy();
    });

    it('should fetch entries from API when opened', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      expect(mockApiGet).toHaveBeenCalledWith('/api/journal/growth');
    });

    it('should not open twice', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();
      await openGrowthJournal();

      const drawers = document.querySelectorAll('.growth-journal-drawer');
      expect(drawers.length).toBe(1);
    });

    it('should render entry cards', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const entries = document.querySelectorAll('.growth-journal-entry');
      expect(entries.length).toBe(2); // From our mock
    });

    it('should show empty state when no entries', async () => {
      mockApiGet.mockResolvedValue({
        ok: true,
        status: 200,
        data: { entries: [], lastUpdated: new Date().toISOString(), streakDays: 0 },
      });

      initGrowthJournalUI();
      await openGrowthJournal();

      const emptyState = document.querySelector('.growth-journal-empty');
      expect(emptyState).toBeTruthy();
    });
  });

  // ============================================================================
  // ACCESSIBILITY
  // ============================================================================

  describe('Accessibility', () => {
    it('should have role="dialog" on drawer', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer?.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-modal="true" on drawer', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer?.getAttribute('aria-modal')).toBe('true');
    });

    it('should have aria-label on drawer', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer?.getAttribute('aria-label')).toBe('Growth Journal');
    });

    it('should have aria-label on close button', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const closeBtn = document.querySelector('.growth-journal-close');
      expect(closeBtn?.getAttribute('aria-label')).toBe('Close journal');
    });

    it('should have aria-hidden on entry icons', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const icons = document.querySelectorAll('.growth-journal-entry-icon');
      icons.forEach((icon) => {
        expect(icon.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });

  // ============================================================================
  // ENTRY DISPLAY
  // ============================================================================

  describe('Entry display', () => {
    it('should render entry title', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const titles = document.querySelectorAll('.growth-journal-entry-title');
      expect(titles[0]?.textContent).toBe('Morning consistency');
    });

    it('should render entry content', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const contents = document.querySelectorAll('.growth-journal-entry-content');
      expect(contents[0]?.textContent).toContain('checking in every morning');
    });

    it('should render entry tags', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const tags = document.querySelectorAll('.growth-journal-entry-tag');
      expect(tags.length).toBeGreaterThan(0);
    });

    it('should format date as "Today" for today', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const dates = document.querySelectorAll('.growth-journal-entry-date');
      expect(dates[0]?.textContent).toBe('Today');
    });

    it('should format date as "Yesterday" for yesterday', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const dates = document.querySelectorAll('.growth-journal-entry-date');
      expect(dates[1]?.textContent).toBe('Yesterday');
    });
  });

  // ============================================================================
  // CACHING
  // ============================================================================

  describe('Caching', () => {
    it('should cache entries in localStorage', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const cached = localStorage.getItem('ferni_growth_journal_cache');
      expect(cached).toBeTruthy();

      const parsed = JSON.parse(cached!);
      expect(parsed.entries).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
    });

    it('should use default entries when not authenticated', async () => {
      mockAuthState.isAuthenticated = false;

      initGrowthJournalUI();
      await openGrowthJournal();

      // Should show default welcome entry
      const entries = document.querySelectorAll('.growth-journal-entry');
      expect(entries.length).toBeGreaterThan(0);

      const title = document.querySelector('.growth-journal-entry-title');
      expect(title?.textContent).toBe('Your journey begins');
    });
  });

  // ============================================================================
  // CLOSING
  // ============================================================================

  describe('Closing', () => {
    it('should close on close button click', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      const closeBtn = document.querySelector('.growth-journal-close') as HTMLElement;
      closeBtn?.click();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer).toBeFalsy();
    });

    it('should close on Escape key', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer).toBeFalsy();
    });

    it('should be able to reopen after closing', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      closeGrowthJournal();
      await new Promise((resolve) => setTimeout(resolve, 350));

      await openGrowthJournal();

      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer).toBeTruthy();
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error handling', () => {
    it('should show default entry when API fails', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      initGrowthJournalUI();
      await openGrowthJournal();

      // Should still show drawer with default entry
      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer).toBeTruthy();

      const entries = document.querySelectorAll('.growth-journal-entry');
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  describe('Cleanup', () => {
    it('should remove styles on dispose', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      expect(document.getElementById('growth-journal-styles')).toBeTruthy();

      disposeGrowthJournalUI();

      expect(document.getElementById('growth-journal-styles')).toBeFalsy();
    });

    it('should close drawer on dispose', async () => {
      initGrowthJournalUI();
      await openGrowthJournal();

      disposeGrowthJournalUI();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer).toBeFalsy();
    });

    it('should allow re-initialization after dispose', async () => {
      initGrowthJournalUI();
      disposeGrowthJournalUI();
      initGrowthJournalUI();

      await openGrowthJournal();

      const drawer = document.querySelector('.growth-journal-drawer');
      expect(drawer).toBeTruthy();
    });
  });
});
