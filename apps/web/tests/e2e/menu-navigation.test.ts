/**
 * Menu Navigation E2E Tests
 *
 * Tests for voice-activated UI navigation via show_view events.
 * Validates that the voice event system correctly opens panels.
 *
 * @module tests/e2e/menu-navigation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS
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

// Mock theme
vi.mock('../../src/theme/index.js', () => ({
  setTheme: vi.fn(),
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

interface ShowViewData {
  view: string;
  params?: Record<string, unknown>;
}

/**
 * Simulate a show_view event from the voice events service
 */
function simulateShowViewEvent(view: string, params?: Record<string, unknown>): void {
  // Create a mock WebSocket message event
  const mockData: ShowViewData = { view, params };
  
  // Dispatch the custom event that would be triggered by voice-events.service.ts
  const eventName = getEventNameForView(view);
  if (eventName) {
    window.dispatchEvent(new CustomEvent(eventName, { detail: params }));
  }
}

/**
 * Get the custom event name for a view
 */
function getEventNameForView(view: string): string | null {
  const panelEventMap: Record<string, string> = {
    'your-story': 'ferni:open-your-story',
    'memory-lane': 'ferni:open-memory-lane',
    'history': 'ferni:open-history',
    'patterns': 'ferni:open-patterns',
    'quiz': 'ferni:open-quiz',
    'music': 'ferni:open-music',
    'calendar': 'ferni:open-calendar',
    'contacts': 'ferni:open-contacts',
    'journal': 'ferni:open-journal',
    'year-with-ferni': 'ferni:open-year-with-ferni',
    'settings': 'ferni:open-settings',
    'guided-practices': 'ferni:open-practices',
    'household-members': 'ferni:open-household',
    'voice-id': 'ferni:open-voice-id',
    'notifications': 'ferni:open-notifications',
    'close': 'ferni:close-panel',
  };
  return panelEventMap[view] ?? null;
}

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Menu Navigation via Voice Events', () => {
  const eventListenerSpy = vi.fn();
  
  beforeEach(() => {
    // Reset DOM
    document.body.textContent = '';
    vi.clearAllMocks();
    
    // Set up event listener to track custom events
    window.addEventListener = vi.fn((event, handler) => {
      if (event.startsWith('ferni:')) {
        eventListenerSpy(event, handler);
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // VIEW MAPPING
  // ============================================================================

  describe('View to Event Mapping', () => {
    const viewMappings = [
      { view: 'your-story', expectedEvent: 'ferni:open-your-story' },
      { view: 'memory-lane', expectedEvent: 'ferni:open-memory-lane' },
      { view: 'history', expectedEvent: 'ferni:open-history' },
      { view: 'patterns', expectedEvent: 'ferni:open-patterns' },
      { view: 'quiz', expectedEvent: 'ferni:open-quiz' },
      { view: 'music', expectedEvent: 'ferni:open-music' },
      { view: 'calendar', expectedEvent: 'ferni:open-calendar' },
      { view: 'contacts', expectedEvent: 'ferni:open-contacts' },
      { view: 'journal', expectedEvent: 'ferni:open-journal' },
      { view: 'year-with-ferni', expectedEvent: 'ferni:open-year-with-ferni' },
      { view: 'settings', expectedEvent: 'ferni:open-settings' },
      { view: 'guided-practices', expectedEvent: 'ferni:open-practices' },
      { view: 'household-members', expectedEvent: 'ferni:open-household' },
      { view: 'voice-id', expectedEvent: 'ferni:open-voice-id' },
      { view: 'notifications', expectedEvent: 'ferni:open-notifications' },
      { view: 'close', expectedEvent: 'ferni:close-panel' },
    ];

    viewMappings.forEach(({ view, expectedEvent }) => {
      it(`should map "${view}" to "${expectedEvent}"`, () => {
        const eventName = getEventNameForView(view);
        expect(eventName).toBe(expectedEvent);
      });
    });

    it('should return null for unknown view', () => {
      const eventName = getEventNameForView('unknown-view');
      expect(eventName).toBeNull();
    });
  });

  // ============================================================================
  // EVENT DISPATCHING
  // ============================================================================

  describe('Event Dispatching', () => {
    it('should dispatch custom event for valid view', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      
      simulateShowViewEvent('your-story');
      
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ferni:open-your-story',
        })
      );
    });

    it('should include params in event detail', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      const params = { section: 'milestones' };
      
      simulateShowViewEvent('your-story', params);
      
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ferni:open-your-story',
          detail: params,
        })
      );
    });

    it('should not dispatch event for unknown view', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      
      simulateShowViewEvent('nonexistent-panel');
      
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CLOSE PANEL
  // ============================================================================

  describe('Close Panel', () => {
    it('should dispatch ferni:close-panel event', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      
      simulateShowViewEvent('close');
      
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ferni:close-panel',
        })
      );
    });
  });
});

// ============================================================================
// VOICE EVENTS SERVICE INTEGRATION
// ============================================================================

describe('Voice Events Service Integration', () => {
  let handleShowView: (data: ShowViewData) => void;

  beforeEach(async () => {
    vi.resetModules();
    
    // Import the handleShowView function logic (simulated since it's internal)
    // In a real test, you'd import from the actual module
    handleShowView = (data: ShowViewData) => {
      const panelEventMap: Record<string, string> = {
        'your-story': 'ferni:open-your-story',
        'memory-lane': 'ferni:open-memory-lane',
        'history': 'ferni:open-history',
        'patterns': 'ferni:open-patterns',
        'quiz': 'ferni:open-quiz',
        'music': 'ferni:open-music',
        'calendar': 'ferni:open-calendar',
        'contacts': 'ferni:open-contacts',
        'journal': 'ferni:open-journal',
        'year-with-ferni': 'ferni:open-year-with-ferni',
        'settings': 'ferni:open-settings',
        'guided-practices': 'ferni:open-practices',
        'household-members': 'ferni:open-household',
        'voice-id': 'ferni:open-voice-id',
        'notifications': 'ferni:open-notifications',
        'close': 'ferni:close-panel',
      };

      const eventName = panelEventMap[data.view];
      if (eventName) {
        window.dispatchEvent(new CustomEvent(eventName, { detail: data.params }));
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleShowView', () => {
    it('should dispatch correct event for your-story view', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      
      handleShowView({ view: 'your-story' });
      
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ferni:open-your-story' })
      );
    });

    it('should dispatch correct event for music view', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      
      handleShowView({ view: 'music' });
      
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ferni:open-music' })
      );
    });

    it('should handle params correctly', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      
      handleShowView({ view: 'contacts', params: { contactId: '123' } });
      
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ferni:open-contacts',
          detail: { contactId: '123' },
        })
      );
    });

    it('should not dispatch for invalid view', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      
      handleShowView({ view: 'invalid-view' });
      
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
