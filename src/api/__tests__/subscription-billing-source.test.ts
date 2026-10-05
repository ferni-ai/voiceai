/**
 * The billing portal and the status route tell Stripe plans from App Store ones.
 *
 * Real route handlers and the real stripe-subscription service; the profile
 * store (Firestore) and the Stripe SDK are the only mocks.
 *
 * Before: POST /subscription/portal for someone with no Stripe customer (an App
 * Store subscriber, a free user) went on to createPortalSession, which threw,
 * and the caller got a 500 "Failed to create portal session". The status route
 * didn't say where a plan was billed, and a Stripe sync kept an earlier
 * provider: 'apple', so someone who moved from the App Store to Stripe still
 * looked like an Apple subscriber.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const profiles = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../memory/store-factory.js', () => ({
  getStore: async () => ({
    getProfile: async (id: string) => profiles.get(id) ?? null,
    saveProfile: async (p: { id: string }) => void profiles.set(p.id, p),
  }),
}));
vi.mock('../../services/subscription-metrics.js', () => ({
  initializeSubscriptionMetrics: async () => undefined,
  trackStripeEvent: async () => undefined,
  getMetricsForApi: () => ({}),
}));

const portalCreate = vi.hoisted(() =>
  vi.fn(async () => ({ url: 'https://billing.stripe.com/p/session' }))
);
vi.mock('stripe', () => ({
  default: class {
    billingPortal = { sessions: { create: portalCreate } };
  },
}));

const { handleSubscriptionRequest } = await import('../subscription-routes.js');
const { syncSubscriptionFromStripe } = await import('../../services/stripe-subscription.js');

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

function portal(userId: string) {
  return handleSubscriptionRequest({
    method: 'POST',
    pathname: '/subscription/portal',
    query: {},
    headers: {},
    body: { returnUrl: 'https://app.ferni.ai/settings' },
    authUserId: userId,
  });
}

async function billingSourceOf(userId: string): Promise<unknown> {
  const res = await handleSubscriptionRequest({
    method: 'GET',
    pathname: '/api/subscription/status',
    query: {},
    headers: {},
    authUserId: userId,
  });
  expect(res.status).toBe(200);
  return (res.body as { billingSource?: unknown }).billingSource;
}

beforeEach(() => {
  profiles.clear();
  portalCreate.mockClear();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_x');
  vi.stubEnv('STRIPE_PRICE_FRIEND', 'price_x');
});

describe('POST /subscription/portal', () => {
  it('refuses an App Store subscriber with 409, without calling Stripe', async () => {
    profiles.set('alice', {
      id: 'alice',
      subscription: paid({ provider: 'apple', appleOriginalTransactionId: '2000000123' }),
    });

    const res = await portal('alice');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'No Stripe billing for this account',
      code: 'no_stripe_customer',
    });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it('refuses a user with no profile at all with 409', async () => {
    const res = await portal('nobody');

    expect(res.status).toBe(409);
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("opens the portal for the caller's own Stripe customer", async () => {
    profiles.set('bob', { id: 'bob', subscription: paid({ stripeCustomerId: 'cus_bob' }) });

    const res = await portal('bob');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://billing.stripe.com/p/session' });
    expect(portalCreate).toHaveBeenCalledWith({
      customer: 'cus_bob',
      return_url: 'https://app.ferni.ai/settings',
    });
  });
});

describe('GET /subscription/status billingSource', () => {
  it('reads it from the profile billing records', async () => {
    profiles.set('apple', {
      id: 'apple',
      subscription: paid({ provider: 'apple', stripeCustomerId: 'cus_abandoned_checkout' }),
    });
    profiles.set('stripe', { id: 'stripe', subscription: paid({ stripeCustomerId: 'cus_1' }) });
    profiles.set('gifted', { id: 'gifted', subscription: paid({}) });
    profiles.set('lapsed', {
      id: 'lapsed',
      subscription: paid({ tier: 'free', stripeCustomerId: 'cus_2' }),
    });

    expect(await billingSourceOf('apple')).toBe('app_store');
    expect(await billingSourceOf('stripe')).toBe('stripe');
    expect(await billingSourceOf('gifted')).toBe('none');
    expect(await billingSourceOf('lapsed')).toBe('none');
    expect(await billingSourceOf('nobody')).toBe('none');
  });

  it('becomes stripe when an App Store subscriber subscribes through Stripe', async () => {
    profiles.set('mover', {
      id: 'mover',
      subscription: paid({ provider: 'apple', appleOriginalTransactionId: '2000000456' }),
    });
    expect(await billingSourceOf('mover')).toBe('app_store');

    await syncSubscriptionFromStripe('mover', {
      id: 'sub_mover',
      status: 'active',
      customer: 'cus_mover',
      created: 1_790_000_000,
      current_period_end: 1_792_000_000,
      trial_end: null,
      metadata: { tier: 'friend' },
    });

    expect(await billingSourceOf('mover')).toBe('stripe');
  });
});
