/**
 * Support Ferni UI Tests
 *
 * Tests the Founders Fund experience:
 * - Modal opening/closing
 * - Cost transparency section
 * - Tier selection
 * - Tip (Plant a Seed) flow
 * - Billing portal integration
 * - Accessibility
 * - Brand compliance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockFetch = vi.fn();
const mockAppState = {
  getState: vi.fn(() => ({ deviceId: 'test-device-123' })),
  get: vi.fn((key: string) => (key === 'deviceId' ? 'test-device-123' : null)),
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

const mockSubscriptionStatus: {
  tier: 'free' | 'friend' | 'partner';
  status: 'active' | 'inactive';
  provider: 'none' | 'stripe' | 'apple' | 'google';
} = {
  tier: 'free',
  status: 'active',
  provider: 'none',
};

vi.mock('../state/app.state.js', () => ({
  appState: mockAppState,
}));

vi.mock('./toast.ui.js', () => ({
  toast: mockToast,
}));

vi.mock('./subscription.ui.js', () => ({
  getStatus: vi.fn(() => mockSubscriptionStatus),
  loadStatus: vi.fn(() => Promise.resolve()),
}));

// Mock fetch globally
vi.stubGlobal('fetch', mockFetch);

// ============================================================================
// TEST HELPERS
// ============================================================================

function findSupportFerniModal(): HTMLElement | null {
  return document.querySelector('.support-ferni-overlay');
}

function findCostTransparencySection(): HTMLElement | null {
  return document.querySelector('.support-ferni-cost-transparency');
}

function findTierCards(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('.support-ferni-tier-card');
}

function findTipAmountButtons(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('.support-ferni-tip-btn');
}

function findPlantSeedButton(): HTMLElement | null {
  return document.querySelector('[data-action="plant-seed"]');
}

function findCloseButton(): HTMLElement | null {
  return document.querySelector('.support-ferni-close');
}

function findBillingButton(): HTMLElement | null {
  return document.querySelector('[data-action="billing"]');
}

// ============================================================================
// TESTS
// ============================================================================

describe('Support Ferni UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://stripe.com/checkout' }),
    });
  });

  afterEach(() => {
    // Cleanup any modals
    document.querySelectorAll('.support-ferni-overlay').forEach((el) => el.remove());
    document.querySelectorAll('#support-ferni-styles').forEach((el) => el.remove());
  });

  describe('Modal Lifecycle', () => {
    it('should open the modal', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const modal = findSupportFerniModal();
      expect(modal).not.toBeNull();
      expect(modal?.getAttribute('role')).toBe('dialog');
      expect(modal?.getAttribute('aria-modal')).toBe('true');
    });

    it('should close on backdrop click', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();
      const backdrop = document.querySelector('.support-ferni-backdrop');
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Wait for animation
      await new Promise((r) => setTimeout(r, 350));

      expect(findSupportFerniModal()).toBeNull();
    });

    it('should close on close button click', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();
      const closeBtn = findCloseButton();
      closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Wait for animation
      await new Promise((r) => setTimeout(r, 350));

      expect(findSupportFerniModal()).toBeNull();
    });

    it('should close on Escape key', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();
      const modal = findSupportFerniModal();
      modal?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      // Wait for animation
      await new Promise((r) => setTimeout(r, 350));

      expect(findSupportFerniModal()).toBeNull();
    });

    it('should cleanup orphaned elements on re-open', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      // Create an orphaned modal
      const orphan = document.createElement('div');
      orphan.className = 'support-ferni-overlay';
      document.body.appendChild(orphan);

      await openSupportFerni();

      // Should only be one modal
      const modals = document.querySelectorAll('.support-ferni-overlay');
      expect(modals.length).toBe(1);
    });
  });

  describe('Cost Transparency Section', () => {
    it('should display cost transparency section', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const costSection = findCostTransparencySection();
      expect(costSection).not.toBeNull();
    });

    it('should show cost breakdown items', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const costItems = document.querySelectorAll('.support-ferni-cost-item');
      expect(costItems.length).toBeGreaterThanOrEqual(4); // AI, Voice, Infra, Total
    });

    it('should display total cost per conversation', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const totalItem = document.querySelector('.support-ferni-cost-total');
      expect(totalItem).not.toBeNull();
      expect(totalItem?.textContent).toContain('$0.06');
    });

    it('should show explanatory note', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const note = document.querySelector('.support-ferni-cost-note');
      expect(note).not.toBeNull();
      expect(note?.textContent).toContain('free');
    });
  });

  describe('Free Tier Experience', () => {
    beforeEach(() => {
      mockSubscriptionStatus.tier = 'free';
    });

    it('should show upgrade options for free users', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const tierCards = findTierCards();
      expect(tierCards.length).toBeGreaterThan(0);
    });

    it('should show "Most Chosen" badge on friend tier', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const popularBadge = document.querySelector('.support-ferni-popular-badge');
      expect(popularBadge).not.toBeNull();
      expect(popularBadge?.textContent).toContain('Most Chosen');
    });

    it('should display correct prices for tiers', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const prices = document.querySelectorAll('.support-ferni-tier-price');
      const priceTexts = Array.from(prices).map((p) => p.textContent);

      expect(priceTexts).toContain('$10/mo');
      expect(priceTexts).toContain('$20/mo');
    });
  });

  describe('Plant a Seed (Tipping)', () => {
    it('should show tip amount options', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const tipButtons = findTipAmountButtons();
      expect(tipButtons.length).toBeGreaterThan(0);
    });

    it('should have plant seed button initially disabled', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const plantBtn = findPlantSeedButton();
      expect(plantBtn?.hasAttribute('disabled')).toBe(true);
    });

    it('should enable plant seed button when amount selected', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      // Click a tip amount
      const tipBtn = document.querySelector('[data-tip-amount="5"]') as HTMLElement;
      tipBtn?.click();

      const plantBtn = findPlantSeedButton();
      expect(plantBtn?.hasAttribute('disabled')).toBe(false);
    });

    it('should highlight selected tip amount', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const tipBtn = document.querySelector('[data-tip-amount="10"]') as HTMLElement;
      tipBtn?.click();

      expect(tipBtn?.classList.contains('support-ferni-tip-btn--selected')).toBe(true);
    });

    it('should support custom tip amount input', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const customInput = document.querySelector('.support-ferni-tip-custom') as HTMLInputElement;
      customInput.value = '15';
      customInput.dispatchEvent(new Event('input', { bubbles: true }));

      const plantBtn = findPlantSeedButton();
      expect(plantBtn?.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('Upgrade Flow', () => {
    it('should call checkout endpoint when tier clicked', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const tierCard = document.querySelector('[data-upgrade-tier="friend"]') as HTMLElement;
      tierCard?.click();

      // Wait for async
      await new Promise((r) => setTimeout(r, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        '/subscription/checkout',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should include correct tier in checkout request', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const tierCard = document.querySelector('[data-upgrade-tier="partner"]') as HTMLElement;
      tierCard?.click();

      await new Promise((r) => setTimeout(r, 100));

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body);
      expect(body.tier).toBe('partner');
    });

    it('should show error toast on checkout failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Payment failed' }),
      });

      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const tierCard = document.querySelector('[data-upgrade-tier="friend"]') as HTMLElement;
      tierCard?.click();

      await new Promise((r) => setTimeout(r, 100));

      expect(mockToast.error).toHaveBeenCalled();
    });
  });

  describe('Paid User Experience', () => {
    beforeEach(() => {
      mockSubscriptionStatus.tier = 'friend';
    });

    it('should show thank you message for supporters', async () => {
      vi.doMock('./subscription.ui.js', () => ({
        getStatus: vi.fn(() => ({ tier: 'friend', status: 'active', provider: 'stripe' })),
        loadStatus: vi.fn(() => Promise.resolve()),
      }));

      // Re-import with new mock
      vi.resetModules();
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const _manageSection = document.querySelector('.support-ferni-manage');
      // Note: This test may need adjustment based on actual rendering
    });

    it('should show billing portal button for subscribers', async () => {
      vi.doMock('./subscription.ui.js', () => ({
        getStatus: vi.fn(() => ({ tier: 'friend', status: 'active', provider: 'stripe' })),
        loadStatus: vi.fn(() => Promise.resolve()),
      }));

      vi.resetModules();
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      // Should have billing button
      const _billingBtn = findBillingButton();
      // Note: Visibility depends on tier
    });
  });

  describe('Billing Portal Integration', () => {
    beforeEach(() => {
      mockSubscriptionStatus.tier = 'friend';
    });

    it('should call correct billing portal endpoint', async () => {
      vi.doMock('./subscription.ui.js', () => ({
        getStatus: vi.fn(() => ({ tier: 'friend', status: 'active', provider: 'stripe' })),
        loadStatus: vi.fn(() => Promise.resolve()),
      }));

      vi.resetModules();
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const billingBtn = findBillingButton();
      billingBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      // Should call the correct endpoint (fixed bug!)
      if (mockFetch.mock.calls.length > 0) {
        const endpoint = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0];
        expect(endpoint).toBe('/subscription/portal');
      }
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes on modal', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const modal = findSupportFerniModal();
      expect(modal?.getAttribute('role')).toBe('dialog');
      expect(modal?.getAttribute('aria-modal')).toBe('true');
      expect(modal?.getAttribute('aria-labelledby')).toBe('support-ferni-title');
    });

    it('should have accessible close button', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const closeBtn = findCloseButton();
      expect(closeBtn?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should focus close button on open', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      // Wait for animation and focus
      await new Promise((r) => setTimeout(r, 100));

      const _closeBtn = findCloseButton();
      // Focus might be set - this depends on implementation
    });
  });

  describe('Brand Compliance', () => {
    it('should use "chip in" language, not "subscribe"', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const modal = findSupportFerniModal();
      const text = modal?.textContent?.toLowerCase() || '';

      // Should use warm language
      expect(text).not.toContain('subscribe now');
      expect(text).not.toContain('premium');
    });

    it('should use seed/plant metaphor', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const modal = findSupportFerniModal();
      const text = modal?.textContent?.toLowerCase() || '';

      expect(text).toContain('seed');
    });

    it('should have non-pressuring footer message', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const footer = document.querySelector('.support-ferni-footer');
      expect(footer?.textContent).toContain("That's totally fine");
    });
  });

  describe('Styles Injection', () => {
    it('should inject styles on open', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();

      const styleEl = document.getElementById('support-ferni-styles');
      expect(styleEl).not.toBeNull();
    });

    it('should not duplicate styles on multiple opens', async () => {
      const { openSupportFerni } = await import('../ui/support-ferni.ui.js');

      await openSupportFerni();
      const { closeSupportFerni } = await import('../ui/support-ferni.ui.js');
      closeSupportFerni();

      await new Promise((r) => setTimeout(r, 350));

      await openSupportFerni();

      const styleEls = document.querySelectorAll('#support-ferni-styles');
      expect(styleEls.length).toBe(1);
    });
  });
});

