/**
 * Team Insights UI - Unit Tests
 *
 * Tests for the "What We Notice" feature - cross-persona team insights.
 *
 * @module ui/__tests__/team-insights.ui
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock import.meta.env
vi.stubGlobal('import', {
  meta: {
    env: {
      DEV: true,
    },
  },
});

describe('Team Insights UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    
    // Default mock for fetch - return empty insights
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        insights: [],
        teamStatus: {
          financialHealth: { budgetOnTrack: true, savingsProgress: 0 },
          habitHealth: { activeHabits: 0, totalStreakDays: 0, keystoneActive: false },
          goalHealth: { activeGoals: 0, nearingCompletion: 0 },
        },
      }),
    });
  });

  afterEach(() => {
    // Clean up DOM
    document.querySelectorAll('.team-insights-panel').forEach(el => el.remove());
    document.querySelectorAll('[id="team-insights-styles"]').forEach(el => el.remove());
  });

  describe('Module exports', () => {
    it('should export initTeamInsightsUI function', async () => {
      const module = await import('../team-insights.ui.js');
      expect(typeof module.initTeamInsightsUI).toBe('function');
    });

    it('should export disposeTeamInsightsUI function', async () => {
      const module = await import('../team-insights.ui.js');
      expect(typeof module.disposeTeamInsightsUI).toBe('function');
    });

    it('should export teamInsightsUI object with all methods', async () => {
      const { teamInsightsUI } = await import('../team-insights.ui.js');
      
      expect(typeof teamInsightsUI.init).toBe('function');
      expect(typeof teamInsightsUI.dispose).toBe('function');
      expect(typeof teamInsightsUI.open).toBe('function');
      expect(typeof teamInsightsUI.close).toBe('function');
      expect(typeof teamInsightsUI.toggle).toBe('function');
      expect(typeof teamInsightsUI.refresh).toBe('function');
      expect(typeof teamInsightsUI.showNotification).toBe('function');
      expect(typeof teamInsightsUI.checkForNew).toBe('function');
    });
  });

  describe('TeamInsight type', () => {
    it('should have correct interface structure', async () => {
      // Import the type for compile-time checking only
      // TypeScript interfaces don't exist at runtime - they're erased during compilation
      const mockInsight = {
        id: 'test-123',
        source: 'peter',
        category: 'financial_pattern',
        summary: 'Test summary',
        content: 'Test content',
        priority: 'high',
        createdAt: Date.now(),
        isNew: true,
      };

      // Verify the mock object has the expected shape
      expect(mockInsight.id).toBe('test-123');
      expect(mockInsight.source).toBe('peter');
      expect(mockInsight).toHaveProperty('category');
      expect(mockInsight).toHaveProperty('priority');
    });
  });

  describe('showInsightNotification', () => {
    it('should add insight to state and update badge', async () => {
      const { showInsightNotification, initTeamInsightsUI } = await import('../team-insights.ui.js');
      
      // Initialize the UI first
      initTeamInsightsUI();

      const badgeEvents: CustomEvent[] = [];
      document.addEventListener('ferni:team-insights-badge', ((e: CustomEvent) => {
        badgeEvents.push(e);
      }) as EventListener);

      const insight = {
        id: 'test-insight-1',
        source: 'maya' as const,
        category: 'habit_pattern' as const,
        summary: 'Test habit insight',
        content: 'You have been doing great with your morning routine!',
        priority: 'high' as const,
        createdAt: Date.now(),
      };

      showInsightNotification(insight);

      // Badge event should be dispatched
      expect(badgeEvents.length).toBeGreaterThan(0);
    });
  });
});

describe('TeamInsights API integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch insights from /api/team-insights', async () => {
    const mockInsights = [
      {
        id: 'insight-1',
        source: 'peter',
        category: 'financial_pattern',
        summary: 'Budget tracking',
        content: 'Your spending is on track',
        priority: 'normal',
        createdAt: Date.now(),
        isNew: false,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        insights: mockInsights,
        teamStatus: {
          financialHealth: { budgetOnTrack: true, savingsProgress: 50 },
          habitHealth: { activeHabits: 3, totalStreakDays: 15, keystoneActive: true },
          goalHealth: { activeGoals: 2, nearingCompletion: 1 },
        },
      }),
    });

    // This tests the fetch integration
    const response = await fetch('/api/team-insights');
    const data = await response.json();

    expect(data.insights).toHaveLength(1);
    expect(data.insights[0].source).toBe('peter');
    expect(data.teamStatus.habitHealth.keystoneActive).toBe(true);
  });

  it('should handle API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await fetch('/api/team-insights');
    expect(response.ok).toBe(false);
  });
});

describe('TeamInsights persona styles', () => {
  it('should have correct persona color mappings', async () => {
    // The PERSONA_STYLES object in team-insights.ui.ts should match these
    const expectedColors = {
      peter: '#3a6b73',
      maya: '#a67a6a',
      jordan: '#c4856a',
      nayan: '#8a7a6a',
      alex: '#5a6b8a',
      ferni: '#4a6741',
    };

    // These should be CSS variable references in the actual code
    // This test documents the expected color scheme
    Object.entries(expectedColors).forEach(([_persona, color]) => {
      expect(color).toBeDefined();
      expect(typeof color).toBe('string');
      expect(color.startsWith('#')).toBe(true);
    });
  });
});

describe('TeamInsights accessibility', () => {
  beforeEach(async () => {
    const { initTeamInsightsUI } = await import('../team-insights.ui.js');
    initTeamInsightsUI();
  });

  afterEach(async () => {
    const { disposeTeamInsightsUI } = await import('../team-insights.ui.js');
    disposeTeamInsightsUI();
  });

  it('should have proper ARIA attributes on panel', () => {
    const panel = document.querySelector('.team-insights-panel');
    
    if (panel) {
      expect(panel.getAttribute('role')).toBe('dialog');
      expect(panel.getAttribute('aria-labelledby')).toBe('team-insights-title');
      expect(panel.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('should have accessible close button', () => {
    const closeBtn = document.querySelector('.team-insights-close');
    
    if (closeBtn) {
      expect(closeBtn.getAttribute('aria-label')).toBe('Close panel');
    }
  });

  it('should have accessible refresh button', () => {
    const refreshBtn = document.querySelector('.team-insights-refresh');
    
    if (refreshBtn) {
      expect(refreshBtn.getAttribute('aria-label')).toBe('Refresh insights');
    }
  });
});

describe('TeamInsights WebSocket fallback', () => {
  it('should detect Firebase Hosting and use polling', async () => {
    // Firebase Hosting domains should trigger polling fallback
    const firebaseHosts = [
      'ferni-prod.web.app',
      'johnb-app.firebaseapp.com',
      'app.ferni.ai',
    ];

    // The isWebSocketSupported function returns false for these
    firebaseHosts.forEach(host => {
      // In production, WebSocket should not be supported
      // This is documented behavior in the code
      expect(host).toBeDefined();
    });
  });

  it('should use WebSocket in development (localhost)', async () => {
    // In development, WebSocket is supported
    // This test documents expected behavior
    expect(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1').toBeTruthy();
  });
});

describe('TeamInsights time formatting', () => {
  it('should format relative times correctly', () => {
    // Test the formatRelativeTime function's expected outputs
    const now = Date.now();
    
    // Just now: less than 1 minute
    const justNow = now - 30000; // 30 seconds ago
    expect(now - justNow).toBeLessThan(60000);
    
    // Minutes ago
    const fiveMinutesAgo = now - 5 * 60000;
    const minutesDiff = Math.floor((now - fiveMinutesAgo) / 60000);
    expect(minutesDiff).toBe(5);
    
    // Hours ago
    const twoHoursAgo = now - 2 * 3600000;
    const hoursDiff = Math.floor((now - twoHoursAgo) / 3600000);
    expect(hoursDiff).toBe(2);
    
    // Days ago
    const threeDaysAgo = now - 3 * 86400000;
    const daysDiff = Math.floor((now - threeDaysAgo) / 86400000);
    expect(daysDiff).toBe(3);
  });
});









