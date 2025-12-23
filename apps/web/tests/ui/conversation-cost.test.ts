/**
 * Conversation Cost UI Tests
 *
 * Tests the post-conversation cost transparency feature:
 * - Cost card display
 * - Cost breakdown
 * - Support Ferni integration
 * - Auto-dismiss behavior
 * - Accessibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// ============================================================================

const mockApiGet = vi.fn();
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

const mockSupportFerniUI = {
  open: vi.fn(() => Promise.resolve()),
  close: vi.fn(),
};

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  getApiHeaders: vi.fn(() => ({})),
}));

vi.mock('../../src/ui/toast.ui.js', () => ({
  toast: mockToast,
}));

vi.mock('../../src/ui/support-ferni.ui.js', () => ({
  supportFerniUI: mockSupportFerniUI,
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockCostData = {
  sessionId: 'session-123',
  totalCost: 0.06,
  formattedCost: '$0.06',
  durationMinutes: 10,
  breakdown: {
    llm: 0.03,
    tts: 0.02,
    stt: 0.005,
    livekit: 0.003,
    infrastructure: 0.002,
  },
  suggestedTips: {
    small: 1.0,
    medium: 5.0,
    large: 10.0,
  },
  message: 'Thanks for chatting! This conversation helped me learn more about you.',
};

// ============================================================================
// TEST HELPERS
// ============================================================================

function findCostCard(): HTMLElement | null {
  return document.querySelector('.ferni-cost-card');
}

function findCostAmount(): HTMLElement | null {
  return document.querySelector('.ferni-cost-amount');
}

function findTipButtons(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('.ferni-tip-btn');
}

function findDismissButton(): HTMLElement | null {
  return document.querySelector('.ferni-cost-dismiss');
}

// ============================================================================
// TESTS
// ============================================================================

describe('Conversation Cost UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    document.body.innerHTML = '';

    mockApiGet.mockResolvedValue({
      ok: true,
      data: mockCostData,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.ferni-cost-card').forEach((el) => el.remove());
    document.querySelectorAll('#ferni-cost-styles').forEach((el) => el.remove());
  });

  describe('Card Display', () => {
    it('should show cost card after conversation', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const card = findCostCard();
      expect(card).not.toBeNull();
    });

    it('should fetch cost data from API', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();

      expect(mockApiGet).toHaveBeenCalledWith('/api/conversation/cost');
    });

    it('should display the total cost', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const amount = findCostAmount();
      expect(amount?.textContent).toContain('0.06');
    });

    it('should display the message', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const card = findCostCard();
      expect(card?.textContent).toContain(mockCostData.message);
    });

    it('should not show card if cost is zero', async () => {
      mockApiGet.mockResolvedValue({
        ok: true,
        data: { ...mockCostData, totalCost: 0, sessionId: null },
      });

      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const card = findCostCard();
      expect(card).toBeNull();
    });

    it('should not show card if no session', async () => {
      mockApiGet.mockResolvedValue({
        ok: true,
        data: { ...mockCostData, sessionId: null },
      });

      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const card = findCostCard();
      expect(card).toBeNull();
    });
  });

  describe('Cost Formatting', () => {
    it('should format small costs in cents', async () => {
      mockApiGet.mockResolvedValue({
        ok: true,
        data: { ...mockCostData, totalCost: 0.005 },
      });

      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const amount = findCostAmount();
      expect(amount?.textContent).toContain('¢');
    });

    it('should format larger costs in dollars', async () => {
      mockApiGet.mockResolvedValue({
        ok: true,
        data: { ...mockCostData, totalCost: 0.15 },
      });

      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const amount = findCostAmount();
      expect(amount?.textContent).toContain('$');
    });
  });

  describe('Support Ferni Button', () => {
    it('should show Support Ferni button', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const tipButtons = findTipButtons();
      expect(tipButtons.length).toBeGreaterThan(0);
    });

    it('should open Support Ferni modal on button click', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const tipBtn = findTipButtons()[0];
      tipBtn?.click();

      vi.advanceTimersByTime(100);

      expect(mockSupportFerniUI.open).toHaveBeenCalled();
    });

    it('should hide cost card when Support Ferni clicked', async () => {
      const { showConversationCost, hide } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const tipBtn = findTipButtons()[0];
      tipBtn?.click();

      vi.advanceTimersByTime(350);

      // Card should be hidden
      const card = findCostCard();
      expect(card).toBeNull();
    });
  });

  describe('Dismiss Behavior', () => {
    it('should show dismiss option', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const dismissBtn = findDismissButton();
      expect(dismissBtn).not.toBeNull();
    });

    it('should hide card on dismiss click', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const dismissBtn = findDismissButton();
      dismissBtn?.click();

      vi.advanceTimersByTime(350);

      const card = findCostCard();
      expect(card).toBeNull();
    });

    it('should auto-dismiss after 30 seconds', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      expect(findCostCard()).not.toBeNull();

      // Auto-dismiss is 30 seconds
      vi.advanceTimersByTime(30000);

      // Should start hiding animation
      vi.advanceTimersByTime(350);

      expect(findCostCard()).toBeNull();
    });

    it('should have friendly dismiss text', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const dismissBtn = findDismissButton();
      expect(dismissBtn?.textContent?.toLowerCase()).toContain('happy to chat');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      // Should not throw, should not show card
      const card = findCostCard();
      expect(card).toBeNull();
    });

    it('should handle API returning no data', async () => {
      mockApiGet.mockResolvedValue({ ok: false, data: null });

      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const card = findCostCard();
      expect(card).toBeNull();
    });
  });

  describe('Visibility State', () => {
    it('should report visibility correctly', async () => {
      const { showConversationCost, isShowing } = await import('../../src/ui/conversation-cost.ui.js');

      expect(isShowing()).toBe(false);

      await showConversationCost();
      vi.advanceTimersByTime(100);

      expect(isShowing()).toBe(true);
    });

    it('should update visibility after hide', async () => {
      const { showConversationCost, hide, isShowing } = await import(
        '../../src/ui/conversation-cost.ui.js'
      );

      await showConversationCost();
      vi.advanceTimersByTime(100);

      expect(isShowing()).toBe(true);

      hide();
      vi.advanceTimersByTime(350);

      expect(isShowing()).toBe(false);
    });
  });

  describe('Accessibility', () => {
    it('should have dialog role', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const card = findCostCard();
      expect(card?.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-label', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const card = findCostCard();
      expect(card?.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('Brand Compliance', () => {
    it('should use seed/plant metaphor icons', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const card = findCostCard();
      // Should have seed/plant imagery
      expect(card?.innerHTML).toMatch(/svg|heart/i);
    });

    it('should use warm CTA text', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const card = findCostCard();
      const text = card?.textContent?.toLowerCase() || '';

      // Should use warm language
      expect(text).toContain('ferni');
    });

    it('should use warm eyebrow text', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const eyebrow = document.querySelector('.ferni-cost-eyebrow');
      expect(eyebrow?.textContent?.toLowerCase()).toContain('chat');
    });
  });

  describe('Animation', () => {
    it('should add visible class for animation', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(50);

      const card = findCostCard();
      expect(card?.classList.contains('visible')).toBe(true);
    });

    it('should add hiding class on hide', async () => {
      const { showConversationCost, hide } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      hide();
      vi.advanceTimersByTime(50);

      const card = findCostCard();
      expect(card?.classList.contains('hiding')).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup existing cards on new show', async () => {
      // Create orphan
      const orphan = document.createElement('div');
      orphan.className = 'ferni-cost-card';
      document.body.appendChild(orphan);

      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const cards = document.querySelectorAll('.ferni-cost-card');
      expect(cards.length).toBe(1);
    });

    it('should clear timeout on manual hide', async () => {
      const { showConversationCost, hide } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);

      hide();
      vi.advanceTimersByTime(350);

      // Auto-dismiss should not fire
      vi.advanceTimersByTime(30000);

      // No errors, card already hidden
      expect(findCostCard()).toBeNull();
    });
  });

  describe('Styles Injection', () => {
    it('should inject styles', async () => {
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();

      const styles = document.getElementById('ferni-cost-styles');
      expect(styles).not.toBeNull();
    });

    it('should not duplicate styles', async () => {
      const { showConversationCost, hide } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();
      vi.advanceTimersByTime(100);
      hide();
      vi.advanceTimersByTime(350);

      await showConversationCost();
      vi.advanceTimersByTime(100);

      const styles = document.querySelectorAll('#ferni-cost-styles');
      expect(styles.length).toBe(1);
    });
  });
});

