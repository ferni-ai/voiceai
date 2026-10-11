/**
 * The web can't buy or restore App Store purchases (only the native iOS app runs
 * StoreKit), so the manage-subscription modal must not offer "Restore purchases"
 * on an iPhone browser. Before, it did, and the button could only ever report
 * that nothing was found.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('../../src/utils/api.js', () => ({ apiGet: mocks.apiGet, apiPost: vi.fn() }));
vi.mock('../../src/utils/billing.js', () => ({ openBillingPortal: vi.fn() }));

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
  mocks.apiGet.mockResolvedValue({ ok: true, status: 200, data: { tier: 'free', paywall: true } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('manage subscription on an iPhone browser', () => {
  it('reads the status from the server and offers no App Store restore', async () => {
    const { manageSubscriptionUI } = await import('../../src/ui/manage-subscription.ui.js');

    await manageSubscriptionUI.open('alice');

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/subscription/status?userId=alice');
    const modal = document.querySelector('.manage-sub');
    expect(modal?.querySelector('[data-action="upgrade"]')).not.toBeNull();
    expect(modal?.querySelector('[data-action="restore"]')).toBeNull();
  });
});
