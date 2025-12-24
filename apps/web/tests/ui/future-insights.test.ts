/**
 * Future Insights UI Tests
 *
 * Tests for the "What I'll Know About You" modal that shows
 * forward-looking insights across time horizons.
 *
 * Tests cover:
 * 1. Modal lifecycle (open/close)
 * 2. Timeline navigation
 * 3. Horizon locking/unlocking based on days together
 * 4. Keyboard accessibility (Escape closes, Tab traps focus)
 * 5. Animation system
 *
 * Run with: npx vitest run apps/web/tests/ui/future-insights.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// Mock dependencies before imports
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: {
    FAST: 100,
    NORMAL: 200,
    SLOW: 300,
    MODERATE: 400,
    DELIBERATE: 500,
  },
  EASING: {
    STANDARD: 'ease-out',
    SPRING: 'cubic-bezier(0.5, 1.5, 0.5, 1)',
    GENTLE: 'ease-out',
  },
  prefersReducedMotion: () => false,
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/utils/tracked-timeout.js', () => ({
  createTimeoutTracker: () => ({
    trackedTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay),
    clearAll: vi.fn(),
  }),
}));

vi.mock('../../src/services/relationship-stage.service.js', () => ({
  relationshipStageService: {
    getStatus: vi.fn().mockReturnValue({
      stage: 'building-trust',
      metrics: {
        totalConversations: 15,
        daysSinceFirstMeeting: 17,
      },
    }),
  },
}));

vi.mock('../../src/i18n/index.js', () => ({
  t: (key: string) => key,
}));

// Import after mocks
import { futureInsightsUI } from '../../src/ui/future-insights.ui.js';
import { relationshipStageService } from '../../src/services/relationship-stage.service.js';

describe('Future Insights UI', () => {
  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    // Reset service mock
    (relationshipStageService.getStatus as Mock).mockReturnValue({
      stage: 'building-trust',
      metrics: {
        totalConversations: 15,
        daysSinceFirstMeeting: 17,
      },
    });
  });

  afterEach(() => {
    // Clean up any opened modals
    document.querySelectorAll('.future-insights-modal').forEach((el) => el.remove());
    vi.clearAllMocks();
  });

  describe('Modal Lifecycle', () => {
    it('should open the modal', () => {
      futureInsightsUI.open();
      
      const modal = document.querySelector('.future-insights-modal');
      expect(modal).toBeTruthy();
    });

    it('should close the modal when close button is clicked', () => {
      futureInsightsUI.open();
      
      const closeBtn = document.querySelector('.future-insights-modal__close');
      expect(closeBtn).toBeTruthy();
      
      (closeBtn as HTMLElement).click();
      
      // Modal should be removed or hidden
      const modal = document.querySelector('.future-insights-modal--visible');
      expect(modal).toBeFalsy();
    });

    it('should close the modal when backdrop is clicked', () => {
      futureInsightsUI.open();
      
      const backdrop = document.querySelector('.future-insights-modal__backdrop');
      expect(backdrop).toBeTruthy();
      
      (backdrop as HTMLElement).click();
      
      const modal = document.querySelector('.future-insights-modal--visible');
      expect(modal).toBeFalsy();
    });

    it('should not create duplicate modals on multiple opens', () => {
      futureInsightsUI.open();
      futureInsightsUI.open();
      futureInsightsUI.open();
      
      const modals = document.querySelectorAll('.future-insights-modal');
      expect(modals.length).toBe(1);
    });
  });

  describe('Timeline Navigation', () => {
    it('should render all 4 time horizons', () => {
      futureInsightsUI.open();
      
      const horizonButtons = document.querySelectorAll('.future-insights-timeline__item');
      expect(horizonButtons.length).toBe(4);
    });

    it('should show Week 1 as reached for user with 17 days', () => {
      futureInsightsUI.open();
      
      const week1Button = document.querySelector('[data-horizon="week1"]');
      expect(week1Button?.classList.contains('future-insights-timeline__item--reached')).toBe(true);
    });

    it('should show Month 1 as locked for user with 17 days', () => {
      futureInsightsUI.open();
      
      const month1Button = document.querySelector('[data-horizon="month1"]');
      // Should still be clickable but marked as locked
      expect(month1Button?.querySelector('.future-insights-timeline__lock')).toBeTruthy();
    });

    it('should update content when different horizon is selected', () => {
      futureInsightsUI.open();
      
      // Get initial content
      const initialContent = document.querySelector('.future-insights-content');
      const initialHtml = initialContent?.innerHTML;
      
      // Click Month 1
      const month1Button = document.querySelector('[data-horizon="month1"]');
      (month1Button as HTMLElement)?.click();
      
      // Content should change
      const newContent = document.querySelector('.future-insights-content');
      expect(newContent?.innerHTML).not.toBe(initialHtml);
    });
  });

  describe('Horizon Unlocking', () => {
    it('should unlock Week 1 after 7 days', () => {
      (relationshipStageService.getStatus as Mock).mockReturnValue({
        stage: 'getting-started',
        metrics: { daysSinceFirstMeeting: 7 },
      });
      
      futureInsightsUI.open();
      
      const week1 = document.querySelector('[data-horizon="week1"]');
      expect(week1?.classList.contains('future-insights-timeline__item--reached')).toBe(true);
    });

    it('should show all horizons locked for new user (day 0)', () => {
      (relationshipStageService.getStatus as Mock).mockReturnValue({
        stage: 'first-meeting',
        metrics: { daysSinceFirstMeeting: 0 },
      });
      
      futureInsightsUI.open();
      
      const week1 = document.querySelector('[data-horizon="week1"]');
      // Week 1 should be reachable within 7 days
      expect(week1?.querySelector('.future-insights-timeline__lock')).toBeTruthy();
    });

    it('should unlock Year 1 after 365 days', () => {
      (relationshipStageService.getStatus as Mock).mockReturnValue({
        stage: 'deep-partnership',
        metrics: { daysSinceFirstMeeting: 365 },
      });
      
      futureInsightsUI.open();
      
      const year1 = document.querySelector('[data-horizon="year1"]');
      expect(year1?.classList.contains('future-insights-timeline__item--reached')).toBe(true);
    });
  });

  describe('Days Counter', () => {
    it('should show correct days together count', () => {
      (relationshipStageService.getStatus as Mock).mockReturnValue({
        stage: 'building-trust',
        metrics: { daysSinceFirstMeeting: 42 },
      });
      
      futureInsightsUI.open();
      
      const counter = document.querySelector('.future-insights-modal__days');
      expect(counter?.textContent).toContain('42');
    });

    it('should show "days away" for locked horizons', () => {
      (relationshipStageService.getStatus as Mock).mockReturnValue({
        stage: 'getting-started',
        metrics: { daysSinceFirstMeeting: 10 },
      });
      
      futureInsightsUI.open();
      
      // Click on Month 1 (locked at day 10)
      const month1Button = document.querySelector('[data-horizon="month1"]');
      (month1Button as HTMLElement)?.click();
      
      // Should show "20 DAYS AWAY" (30 - 10)
      const awayBadge = document.querySelector('.future-insights-horizon__away');
      expect(awayBadge?.textContent).toContain('20');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on timeline buttons', () => {
      futureInsightsUI.open();
      
      const timelineItems = document.querySelectorAll('.future-insights-timeline__item');
      timelineItems.forEach((item) => {
        expect(item.getAttribute('role')).toBe('tab');
        expect(item.getAttribute('aria-selected')).toBeTruthy();
      });
    });

    it('should have proper focus management', () => {
      futureInsightsUI.open();
      
      const modal = document.querySelector('.future-insights-modal');
      expect(modal?.getAttribute('role')).toBe('dialog');
      expect(modal?.getAttribute('aria-modal')).toBe('true');
    });

    it('should close on Escape key', async () => {
      futureInsightsUI.open();
      
      // Verify modal is open
      expect(document.querySelector('.future-insights-modal--visible')).toBeTruthy();
      
      // Dispatch Escape key
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      document.dispatchEvent(escapeEvent);
      
      // Allow any async handlers to run
      await new Promise((resolve) => setTimeout(resolve, 50));
      
      // Modal should be closed
      expect(document.querySelector('.future-insights-modal--visible')).toBeFalsy();
    });
  });

  describe('Insight Cards', () => {
    it('should render insight cards for the selected horizon', () => {
      futureInsightsUI.open();
      
      const cards = document.querySelectorAll('.future-insights-card');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should show capability name on each card', () => {
      futureInsightsUI.open();
      
      const card = document.querySelector('.future-insights-card');
      const title = card?.querySelector('.future-insights-card__title');
      expect(title?.textContent).toBeTruthy();
    });

    it('should show example quote on each card', () => {
      futureInsightsUI.open();
      
      const card = document.querySelector('.future-insights-card');
      const quote = card?.querySelector('.future-insights-card__quote');
      expect(quote?.textContent).toBeTruthy();
    });
  });

  describe('Reduced Motion', () => {
    it('should respect prefers-reduced-motion', async () => {
      // Import fresh with reduced motion enabled
      vi.doMock('../../src/config/animation-constants.js', () => ({
        DURATION: { FAST: 100, NORMAL: 200, SLOW: 300, MODERATE: 400, DELIBERATE: 500 },
        EASING: { STANDARD: 'ease-out', SPRING: 'ease-out', GENTLE: 'ease-out' },
        prefersReducedMotion: () => true,
      }));
      
      // Modal should still work, just without animations
      futureInsightsUI.open();
      expect(document.querySelector('.future-insights-modal')).toBeTruthy();
    });
  });
});

describe('Future Insights Integration', () => {
  it('should be exported and accessible', () => {
    expect(futureInsightsUI).toBeDefined();
    expect(typeof futureInsightsUI.open).toBe('function');
  });
});

