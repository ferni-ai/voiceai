/**
 * Where a subscription is billed, across the API boundary.
 *
 * Sender: the API server's real GET /api/subscription/status handler and the
 * real getSubscriptionInfo, reading a profile from an in-memory store (the only
 * mock on that side, standing in for Firestore).
 * Receiver: the web's real status parser (apple-iap.service) and the real
 * manage-subscription modal, fed the handler's actual response body.
 *
 * Before: the web treated any paid tier as Stripe, so someone who subscribed in
 * the iOS app was offered the Stripe billing portal, which can't manage an App
 * Store subscription.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const profiles = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('../../../../src/memory/store-factory.js', () => ({
  getStore: async () => ({
    getProfile: async (id: string) => profiles.get(id) ?? null,
    saveProfile: async (p: { id: string }) => void profiles.set(p.id, p),
  }),
}));
vi.mock('../../../../src/services/subscription-metrics.js', () => ({
  initializeSubscriptionMetrics: async () => undefined,
  trackStripeEvent: async () => undefined,
  getMetricsForApi: () => ({}),
}));

const statusBodies: unknown[] = [];
const apiGet = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn() }));
vi.mock('../../src/utils/billing.js', () => ({ openBillingPortal: vi.fn() }));

const { handleSubscriptionRequest } = await import('../../../../src/api/subscription-routes.js');
const { setLocale } = await import('../../src/i18n/index.js');

/** The web's GET goes to the real route as the verified caller; its body comes back as-is. */
async function serveFromRealRoute(path: string): Promise<unknown> {
  const url = new URL(path, 'http://localhost');
  const res = await handleSubscriptionRequest({
    method: 'GET',
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: {},
    authUserId: url.searchParams.get('userId') ?? undefined,
  });
  statusBodies.push(res.body);
  return { ok: res.status === 200, status: res.status, data: res.body };
}

async function openModalFor(userId: string): Promise<HTMLElement> {
  const { manageSubscriptionUI } = await import('../../src/ui/manage-subscription.ui.js');
  await manageSubscriptionUI.open(userId);
  const modal = document.querySelector<HTMLElement>('.manage-sub');
  if (!modal) throw new Error('modal did not render');
  return modal;
}

beforeAll(async () => {
  await setLocale('en-US');
});

beforeEach(() => {
  profiles.clear();
  statusBodies.length = 0;
  document.body.innerHTML = '';
  apiGet.mockImplementation(serveFromRealRoute);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function paid(subscription: Record<string, unknown>): Record<string, unknown> {
  return {
    tier: 'friend',
    status: 'active',
    billingFrequency: 'monthly',
    inTrial: false,
    monthlyUsage: { period: '2026-10', conversationCount: 0, minutesTalked: 0 },
    ...subscription,
  };
}

describe('manage subscription shows where the plan is billed', () => {
  it('App Store subscriber: App Store guidance, Apple link, and no Stripe portal', async () => {
    // An abandoned web checkout left a Stripe customer behind; the plan is still Apple's.
    profiles.set('alice', {
      id: 'alice',
      subscription: paid({
        provider: 'apple',
        appleOriginalTransactionId: '2000000123',
        stripeCustomerId: 'cus_leftover',
      }),
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const modal = await openModalFor('alice');

    expect(statusBodies[0]).toMatchObject({ tier: 'friend', billingSource: 'app_store' });
    expect(modal.textContent).toContain('You subscribed through the App Store.');
    expect(modal.textContent).toContain('Open Settings on your device');
    expect(modal.querySelector('[data-action="billing-portal"]')).toBeNull();
    modal.querySelector<HTMLButtonElement>('[data-action="apple-manage"]')?.click();
    expect(open).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions', '_blank');
  });

  it('Stripe subscriber: the Stripe portal, and no App Store guidance', async () => {
    profiles.set('bob', {
      id: 'bob',
      subscription: paid({
        provider: 'stripe',
        stripeCustomerId: 'cus_bob',
        stripeSubscriptionId: 'sub_bob',
      }),
    });

    const modal = await openModalFor('bob');

    expect(statusBodies[0]).toMatchObject({ tier: 'friend', billingSource: 'stripe' });
    expect(modal.querySelector('[data-action="billing-portal"]')).not.toBeNull();
    expect(modal.querySelector('[data-action="apple-manage"]')).toBeNull();
    expect(modal.textContent).not.toContain('App Store');
  });

  it('Stripe subscriber from before `provider` was recorded still gets the portal', async () => {
    profiles.set('carol', {
      id: 'carol',
      subscription: paid({ stripeCustomerId: 'cus_carol', stripeSubscriptionId: 'sub_carol' }),
    });

    const modal = await openModalFor('carol');

    expect(statusBodies[0]).toMatchObject({ billingSource: 'stripe' });
    expect(modal.querySelector('[data-action="billing-portal"]')).not.toBeNull();
  });

  it('free user: neither the Stripe portal nor App Store guidance', async () => {
    const modal = await openModalFor('dana');

    expect(statusBodies[0]).toMatchObject({ tier: 'free', billingSource: 'none' });
    expect(modal.querySelector('[data-action="billing-portal"]')).toBeNull();
    expect(modal.querySelector('[data-action="apple-manage"]')).toBeNull();
    expect(modal.querySelector('[data-action="upgrade"]')).not.toBeNull();
  });

  it('paid plan with no billing record (admin upgrade): says so, offers no portal', async () => {
    profiles.set('erin', { id: 'erin', subscription: paid({}) });

    const modal = await openModalFor('erin');

    expect(statusBodies[0]).toMatchObject({ tier: 'friend', billingSource: 'none' });
    expect(modal.querySelector('[data-action="billing-portal"]')).toBeNull();
    expect(modal.querySelector('[data-action="apple-manage"]')).toBeNull();
    expect(modal.textContent).toContain(
      "Your plan isn't billed here, so there's nothing to change."
    );
  });
});

describe('Support Ferni billing link follows the same source', () => {
  async function openSupportFor(userId: string): Promise<HTMLElement> {
    const { appState } = await import('../../src/state/app.state.js');
    appState.set('deviceId', userId);
    const { openSupportFerni } = await import('../../src/ui/support-ferni.ui.js');
    await openSupportFerni();
    const overlay = document.querySelector<HTMLElement>('.support-ferni-overlay');
    if (!overlay) throw new Error('support modal did not render');
    return overlay;
  }

  it('App Store subscriber: Apple link, no Stripe billing button', async () => {
    profiles.set('alice', {
      id: 'alice',
      subscription: paid({ provider: 'apple', appleOriginalTransactionId: '2000000123' }),
    });

    const overlay = await openSupportFor('alice');

    expect(statusBodies[0]).toMatchObject({ billingSource: 'app_store' });
    expect(overlay.querySelector('[data-action="billing"]')).toBeNull();
    expect(overlay.querySelector('[data-action="apple-manage"]')).not.toBeNull();
    expect(overlay.textContent).toContain('You subscribed through the App Store.');
  });

  it('Stripe subscriber: the Stripe billing button', async () => {
    profiles.set('bob', { id: 'bob', subscription: paid({ stripeCustomerId: 'cus_bob' }) });

    const overlay = await openSupportFor('bob');

    expect(statusBodies[0]).toMatchObject({ billingSource: 'stripe' });
    expect(overlay.querySelector('[data-action="billing"]')).not.toBeNull();
    expect(overlay.querySelector('[data-action="apple-manage"]')).toBeNull();
  });
});
