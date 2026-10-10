/**
 * POST /api/monetization/webhook must verify the Stripe signature.
 *
 * This route records tips, value capture, and Ferni Fund contributions for whatever
 * ferni_user_id the event metadata names, so a forged event must be rejected before
 * anything is written. Signing uses the real Stripe SDK (not mocked), so these tests
 * exercise the actual HMAC check.
 */

import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const saveProfile = vi.fn().mockResolvedValue(undefined);
const contribute = vi.fn().mockResolvedValue(undefined);

vi.mock('../../memory/store-factory.js', () => ({
  getStore: vi.fn().mockResolvedValue({
    getOrCreateProfile: vi.fn().mockResolvedValue({ userId: 'victim-user' }),
    saveProfile,
  }),
}));

vi.mock('../../services/monetization/ferni-fund.js', () => ({
  ferniFund: { contribute },
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
}));

const MONETIZATION_SECRET = 'whsec_monetization_test';
const SHARED_SECRET = 'whsec_shared_test';
const WEBHOOK = '/api/monetization/webhook';

const fundEvent = JSON.stringify({
  id: 'evt_test_1',
  object: 'event',
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: 'pi_test_1',
      object: 'payment_intent',
      amount: 2500,
      metadata: { ferni_user_id: 'victim-user', payment_type: 'ferni_fund' },
    },
  },
});

function sign(payload: string, secret: string): string {
  return new Stripe('sk_test_signer').webhooks.generateTestHeaderString({ payload, secret });
}

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { handleMonetizationRequest } = await import('../../api/monetization-routes.js');
  return handleMonetizationRequest({ method: 'POST', pathname: WEBHOOK, query: {}, headers, body });
}

describe('POST /api/monetization/webhook signature verification', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_server');
    vi.stubEnv('STRIPE_MONETIZATION_WEBHOOK_SECRET', MONETIZATION_SECRET);
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', SHARED_SECRET);
    const { resetConfig } = await import('../../config/environment.js');
    resetConfig();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects a forged event with no signature and records nothing', async () => {
    const response = await post(fundEvent);

    expect(response.status).toBe(400);
    expect(saveProfile).not.toHaveBeenCalled();
    expect(contribute).not.toHaveBeenCalled();
  });

  it('rejects a forged event with a made-up signature and records nothing', async () => {
    const response = await post(fundEvent, { 'stripe-signature': 't=1,v1=deadbeef' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Webhook verification failed' });
    expect(saveProfile).not.toHaveBeenCalled();
    expect(contribute).not.toHaveBeenCalled();
  });

  it('rejects an event signed with another endpoint secret when its own secret is set', async () => {
    const response = await post(fundEvent, { 'stripe-signature': sign(fundEvent, SHARED_SECRET) });

    expect(response.status).toBe(400);
    expect(contribute).not.toHaveBeenCalled();
  });

  it('rejects a tampered amount even with a once-valid signature', async () => {
    const signature = sign(fundEvent, MONETIZATION_SECRET);
    const tampered = fundEvent.replace('"amount":2500', '"amount":999999');

    const response = await post(tampered, { 'stripe-signature': signature });

    expect(response.status).toBe(400);
    expect(contribute).not.toHaveBeenCalled();
  });

  it('rejects a pre-parsed object body instead of trusting it', async () => {
    const response = await post(JSON.parse(fundEvent), {
      'stripe-signature': sign(fundEvent, MONETIZATION_SECRET),
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid webhook payload format' });
    expect(contribute).not.toHaveBeenCalled();
  });

  it('processes a correctly signed payment_intent.succeeded event', async () => {
    const response = await post(fundEvent, {
      'stripe-signature': sign(fundEvent, MONETIZATION_SECRET),
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile.mock.calls[0][0].monetization.totalFundContributionsCents).toBe(2500);
    expect(contribute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'victim-user',
        amountCents: 2500,
        stripePaymentId: 'pi_test_1',
      })
    );
  });

  it('falls back to STRIPE_WEBHOOK_SECRET when no monetization secret is set', async () => {
    vi.stubEnv('STRIPE_MONETIZATION_WEBHOOK_SECRET', '');
    const { resetConfig } = await import('../../config/environment.js');
    resetConfig();

    const response = await post(fundEvent, { 'stripe-signature': sign(fundEvent, SHARED_SECRET) });

    expect(response.status).toBe(200);
    expect(contribute).toHaveBeenCalledTimes(1);
  });

  it('rejects every event when no webhook secret is configured', async () => {
    vi.stubEnv('STRIPE_MONETIZATION_WEBHOOK_SECRET', '');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const { resetConfig } = await import('../../config/environment.js');
    resetConfig();

    const response = await post(fundEvent, { 'stripe-signature': sign(fundEvent, SHARED_SECRET) });

    expect(response.status).toBe(400);
    expect(saveProfile).not.toHaveBeenCalled();
    expect(contribute).not.toHaveBeenCalled();
  });
});

describe('parseMonetizationBody', () => {
  it('keeps the raw string for the webhook so the signature can be checked', async () => {
    const { parseMonetizationBody } = await import('../../api/monetization-webhook.js');

    expect(parseMonetizationBody(WEBHOOK, fundEvent)).toBe(fundEvent);
  });

  it('parses JSON for every other monetization route', async () => {
    const { parseMonetizationBody } = await import('../../api/monetization-webhook.js');

    expect(parseMonetizationBody('/api/monetization/tip', '{"amountCents":500}')).toEqual({
      amountCents: 500,
    });
    expect(parseMonetizationBody('/api/monetization/tip', 'not json')).toEqual({});
    expect(parseMonetizationBody('/api/monetization/tip', '')).toEqual({});
  });
});
