/**
 * The marketplace and subscription webhook verifiers reject anything Stripe
 * did not sign.
 *
 * Both endpoints act on whatever the event payload names (an installed item, a
 * subscription tier), so a forged, replayed or edited event has to throw before
 * any handler sees it. The existing tests for these two functions mock
 * `stripe`, so they never run the signature check. These use the real stripe
 * library: headers are signed with stripe.webhooks.generateTestHeaderString and
 * checked by the module's own constructEvent call. The secrets are fake.
 */
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SIGNING_SECRET = 'whsec_test_fake_signing_secret_for_unit_tests';
const OTHER_SECRET = 'whsec_test_fake_other_endpoint_secret';
const DEFAULT_TOLERANCE_SECONDS = 300;

const payload = JSON.stringify({
  id: 'evt_test_signature',
  object: 'event',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_signature', object: 'checkout.session', amount_total: 999 } },
});

const signer = new Stripe('sk_test_signer_only');

function sign(body: string, options: { secret?: string; timestamp?: number } = {}): string {
  return signer.webhooks.generateTestHeaderString({
    payload: body,
    secret: options.secret ?? SIGNING_SECRET,
    timestamp: options.timestamp,
  });
}

function secondsAgo(seconds: number): number {
  return Math.floor(Date.now() / 1000) - seconds;
}

interface Verifier {
  name: string;
  secretEnv: string;
  verify: (body: string, header: string) => Promise<{ id: string }>;
}

const verifiers: Verifier[] = [
  {
    name: 'marketplace verifyWebhookSignature',
    secretEnv: 'STRIPE_WEBHOOK_SECRET_MARKETPLACE',
    verify: async (body, header) => {
      const { verifyWebhookSignature } =
        await import('../../../marketplace/billing/stripe-webhooks.js');
      return verifyWebhookSignature(body, header);
    },
  },
  {
    name: 'subscription verifyWebhook',
    secretEnv: 'STRIPE_WEBHOOK_SECRET',
    verify: async (body, header) => {
      const { verifyWebhook } = await import('../stripe-subscription.js');
      return verifyWebhook(body, header);
    },
  },
];

describe.each(verifiers)('$name with the real stripe library', ({ secretEnv, verify }) => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_webhook_signature');
    vi.stubEnv(secretEnv, SIGNING_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a correctly signed event', async () => {
    const event = await verify(payload, sign(payload));

    expect(event.id).toBe('evt_test_signature');
  });

  it('rejects a made-up signature', async () => {
    const header = `t=${secondsAgo(0)},v1=${'0'.repeat(64)}`;

    await expect(verify(payload, header)).rejects.toThrow(/No signatures found matching/);
  });

  it('rejects an event signed with another secret', async () => {
    const header = sign(payload, { secret: OTHER_SECRET });

    await expect(verify(payload, header)).rejects.toThrow(/No signatures found matching/);
  });

  it('rejects a body edited after signing', async () => {
    const header = sign(payload);
    const tampered = payload.replace('"amount_total":999', '"amount_total":1');

    expect(tampered).not.toBe(payload);
    await expect(verify(tampered, header)).rejects.toThrow(/No signatures found matching/);
  });

  it('rejects a signature older than the default tolerance', async () => {
    const header = sign(payload, { timestamp: secondsAgo(DEFAULT_TOLERANCE_SECONDS + 1) });

    await expect(verify(payload, header)).rejects.toThrow(/Timestamp outside the tolerance zone/);
  });

  it('rejects an empty signature header', async () => {
    await expect(verify(payload, '')).rejects.toThrow(/No stripe-signature header value/);
  });
});
