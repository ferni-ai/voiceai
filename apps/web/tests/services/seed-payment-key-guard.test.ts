/**
 * A build with no Stripe publishable key never asks the server for a PaymentIntent.
 *
 * Before the guard, payForSeed POSTed /api/garden/plant first (creating a PaymentIntent on
 * the server) and only then found loadStripe had no key, returning `not-configured` for a
 * payment that could never be shown. The real seed-payment service runs here; only fetch
 * and Stripe.js are mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stripeStub = vi.hoisted(() => ({ instance: { elements: vi.fn(), confirmPayment: vi.fn() } }));
vi.mock('../../src/services/monetization.service.js', () => ({
  loadStripe: vi.fn(async () => stripeStub.instance),
}));

const { payForSeed } = await import('../../src/services/seed-payment.js');

const fetchMock = vi.fn(
  async () =>
    new Response(JSON.stringify({ success: true, clientSecret: 'cs_test' }), { status: 200 })
);
const plantCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url as unknown) === '/api/garden/plant');

describe('seed payment without a Stripe publishable key', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['', undefined])(
    'answers not-configured and never calls the server (key %j)',
    async (key) => {
      vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', key);
      const collect = vi.fn(async () => ({ status: 'confirmed' as const }));

      const outcome = await payForSeed(10, collect);

      expect(outcome).toEqual({ status: 'not-configured' });
      expect(fetchMock).toHaveBeenCalledTimes(0);
      expect(collect).not.toHaveBeenCalled();
    }
  );

  it('with a key, asks the server for the payment as before', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_seed');
    const collect = vi.fn(async () => ({ status: 'confirmed' as const }));

    const outcome = await payForSeed(10, collect);

    expect(plantCalls()).toHaveLength(1);
    expect(collect).toHaveBeenCalledWith(stripeStub.instance, 'cs_test', 10);
    expect(outcome.status).toBe('confirmed');
  });
});
