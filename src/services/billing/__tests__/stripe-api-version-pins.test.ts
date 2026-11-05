/**
 * Each Stripe client sends the API version it is pinned to.
 *
 * A Stripe API version decides the shape of every response and webhook payload,
 * so a pin that drifts (for example after a stripe-node major whose types only
 * accept the newest version) changes billing behaviour without any code change.
 * These tests pin the value as it goes over the wire, not as it appears in source.
 *
 * Real: the stripe library and its HTTP client, and each module's own client
 * construction (the production apiVersion). The requests go to a local stub
 * server on 127.0.0.1 instead of api.stripe.com.
 *
 * How the client reaches the stub: none of the three modules accepts a host, and
 * this PR does not change production code. So `stripe` is replaced by a subclass
 * of the real Stripe class that adds stripe-node's own host/port/protocol options
 * to whatever config the module passes, and changes nothing else. The module's
 * apiVersion is passed through untouched, and the assertion is on the
 * Stripe-Version header the stub server received.
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const stubTarget = vi.hoisted(() => ({ host: '127.0.0.1', port: 0, protocol: 'http' as const }));

vi.mock('stripe', async (importOriginal) => {
  const real = await importOriginal<{ default: typeof Stripe }>();
  const RealStripe = real.default;
  class StripeToLocalStub extends RealStripe {
    constructor(key: string, config?: ConstructorParameters<typeof RealStripe>[1]) {
      super(key, { ...config, ...stubTarget });
    }
  }
  return { ...real, default: StripeToLocalStub };
});

interface ReceivedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
}

const received: ReceivedRequest[] = [];

// Just enough of each object for the calling code to read the fields it uses.
function responseFor(path: string): Record<string, unknown> {
  if (path.startsWith('/v1/transfers')) return { id: 'tr_test_pin', object: 'transfer' };
  if (path.startsWith('/v1/payment_intents/')) {
    return {
      id: 'pi_test_pin',
      object: 'payment_intent',
      status: 'succeeded',
      amount: 500,
      metadata: {},
    };
  }
  if (path.startsWith('/v1/subscriptions/')) return { id: 'sub_test_pin', object: 'subscription' };
  return { error: { type: 'invalid_request_error', message: `no stub for ${path}` } };
}

let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '';
    received.push({ method: req.method ?? '', path, headers: req.headers });
    req.resume();
    req.on('end', () => {
      const body = responseFor(path);
      res.writeHead('error' in body ? 404 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  stubTarget.port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

beforeEach(async () => {
  received.length = 0;
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_api_version_pin');
  const { resetConfig } = await import('../../../config/environment.js');
  resetConfig();
});

function onlyRequest(): ReceivedRequest {
  expect(received).toHaveLength(1);
  return received[0];
}

describe('Stripe API version sent on the wire', () => {
  it('marketplace client sends Stripe-Version 2025-12-15.clover', async () => {
    const { createPublisherPayout } =
      await import('../../../marketplace/billing/stripe-webhooks.js');

    const { transferId } = await createPublisherPayout({
      publisherId: 'pub_test',
      stripeConnectAccountId: 'acct_test',
      amountCents: 1200,
      period: '2026-10',
    });

    expect(transferId).toBe('tr_test_pin');
    const request = onlyRequest();
    expect(request).toMatchObject({ method: 'POST', path: '/v1/transfers' });
    expect(request.headers['stripe-version']).toBe('2025-12-15.clover');
  });

  it('subscription client sends Stripe-Version 2023-10-16', async () => {
    const { getStripe } = await import('../stripe-subscription.js');

    const stripe = await getStripe();
    const subscription = await stripe.subscriptions.retrieve('sub_test_pin');

    expect(subscription.id).toBe('sub_test_pin');
    const request = onlyRequest();
    expect(request).toMatchObject({ method: 'GET', path: '/v1/subscriptions/sub_test_pin' });
    expect(request.headers['stripe-version']).toBe('2023-10-16');
  });

  it('payments client sends Stripe-Version 2023-10-16', async () => {
    const { verifyPayment } = await import('../stripe-payments.js');

    const result = await verifyPayment('pi_test_pin');

    expect(result).toMatchObject({ succeeded: true, amountCents: 500 });
    const request = onlyRequest();
    expect(request).toMatchObject({ method: 'GET', path: '/v1/payment_intents/pi_test_pin' });
    expect(request.headers['stripe-version']).toBe('2023-10-16');
  });
});
