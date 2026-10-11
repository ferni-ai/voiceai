/**
 * Plant-a-seed, end to end across the web/API boundary.
 *
 * Support Ferni used to post `{ amountInCents, successUrl, cancelUrl }` and
 * wait for a Checkout `url`; the handler reads `amount` in dollars and answers
 * with a PaymentIntent `clientSecret`, so every tap was a 400. Both donate
 * surfaces now call the web's payForSeed (apps/web/src/services/seed-payment.ts).
 *
 * Here the REAL payForSeed builds the request through the REAL web transport,
 * the REAL garden handler answers it, and that answer goes back into
 * payForSeed's own parsing. Only Firebase token verification, the Stripe
 * server SDK wrappers, and Stripe.js are mocked. The card form itself needs a
 * DOM, so here a stand-in collector records what payForSeed hands it; the
 * real form is tested in apps/web/tests/ui/support-ferni.test.ts and
 * ferni-fund.test.ts.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-42' ? { uid: 'uid-42', claims: {}, isAnonymous: false } : null
  ),
}));

const stripePayments = vi.hoisted(() => ({
  isStripeConfigured: vi.fn(() => true),
  createPaymentIntent: vi.fn(async () => ({ clientSecret: 'pi_secret', paymentIntentId: 'pi_1' })),
}));
vi.mock('../services/stripe-payments.js', () => stripePayments);
vi.mock('../services/stripe-subscription.js', () => ({ createPortalSession: vi.fn() }));
// The monthly gift's Checkout wrapper; its amount validation stays real.
const seedFund = vi.hoisted(() => ({
  createSeedFundCheckout: vi.fn(async () => ({
    sessionId: 'cs_1',
    url: 'https://checkout.stripe.com/cs_1',
  })),
}));
vi.mock('../services/billing/seed-fund-checkout.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/billing/seed-fund-checkout.js')>()),
  ...seedFund,
}));

vi.mock('../../apps/web/src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => undefined),
  getAuthToken: vi.fn(async () => 'tok-42'),
  getFirebaseUid: vi.fn(() => 'uid-42'),
}));
vi.mock('../../apps/web/src/ui/whisper.ui.js', () => ({ toast: { error: vi.fn() } }));

// Stripe.js in the browser: null when the build has no publishable key.
const stripeJs = vi.hoisted(() => ({
  instance: null as null | {
    elements: ReturnType<typeof vi.fn>;
    confirmPayment: ReturnType<typeof vi.fn>;
  },
}));
/** Stand-in for the card form: records the Stripe instance, secret and amount. */
const collect = vi.fn(async () => ({ status: 'confirmed' as const }));
vi.mock('../../apps/web/src/services/monetization.service.js', () => ({
  loadStripe: vi.fn(async () => stripeJs.instance),
}));

const { handleGardenRoutes } = await import('../api/garden-routes.js');
const { payForSeed, startMonthlyGift } =
  await import('../../apps/web/src/services/seed-payment.js');

interface Exchange {
  body: Record<string, unknown>;
  status: number;
  response: Record<string, unknown>;
}
let exchanges: Exchange[] = [];

/** The API server: hand the web's request to the real garden router. */
async function serve(
  path: string,
  headers: Record<string, string>,
  body: string
): Promise<{ status: number; payload: string }> {
  const req = Readable.from([body]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: path,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 0;
  let payload = '';
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn((chunk?: string) => {
      payload = chunk ?? '';
    }),
  } as unknown as ServerResponse;
  expect(await handleGardenRoutes(req, res, path, new URL(path, 'http://x'))).toBe(true);
  return { status, payload };
}

beforeEach(() => {
  vi.clearAllMocks();
  exchanges = [];
  stripePayments.isStripeConfigured.mockReturnValue(true);
  stripeJs.instance = { elements: vi.fn(), confirmPayment: vi.fn(async () => ({})) };
  vi.stubEnv('DEV', false);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', {
    location: { href: 'https://app.ferni.ai/', origin: 'https://app.ferni.ai' },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: { headers?: Record<string, string>; body?: string }) => {
      const headers = Object.fromEntries(new globalThis.Headers(init.headers).entries());
      const { status, payload } = await serve(path, headers, String(init.body));
      exchanges.push({
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        status,
        response: payload ? (JSON.parse(payload) as Record<string, unknown>) : {},
      });
      return new globalThis.Response(payload, { status });
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('plant a seed: payForSeed ↔ POST /api/garden/plant', () => {
  it('a $10 tip is accepted (200), paid as the signed-in user, and its client secret goes to the card form', async () => {
    const outcome = await payForSeed(10, collect);

    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].body).toEqual({ amount: 10 });
    expect(exchanges[0].status).toBe(200);
    expect(exchanges[0].response).toMatchObject({ success: true, clientSecret: 'pi_secret' });
    expect(stripePayments.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'uid-42', amountCents: 1000 })
    );
    expect(collect).toHaveBeenCalledWith(stripeJs.instance, 'pi_secret', 10);
    expect(outcome).toEqual({ status: 'confirmed' });
  });

  it('server without Stripe answers 503, and the web reports not-configured without touching Stripe.js', async () => {
    stripePayments.isStripeConfigured.mockReturnValue(false);

    const outcome = await payForSeed(5, collect);

    expect(exchanges[0].status).toBe(503);
    expect(exchanges[0].response).toMatchObject({ success: false });
    expect(stripePayments.createPaymentIntent).not.toHaveBeenCalled();
    expect(collect).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'not-configured' });
  });

  it('a web build with no Stripe publishable key reports not-configured, not a retryable failure', async () => {
    stripeJs.instance = null;

    const outcome = await payForSeed(5, collect);

    expect(exchanges[0].status).toBe(200);
    expect(collect).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'not-configured' });
  });

  it('a server-side PaymentIntent failure comes back as failed', async () => {
    stripePayments.createPaymentIntent.mockResolvedValueOnce(
      null as unknown as { clientSecret: string; paymentIntentId: string }
    );

    const outcome = await payForSeed(5, collect);

    expect(exchanges[0].response).toMatchObject({ success: false });
    expect(outcome).toEqual({ status: 'failed', reason: 'Failed to create payment' });
    expect(collect).not.toHaveBeenCalled();
  });
});

describe('monthly gift: startMonthlyGift ↔ POST /api/garden/subscribe', () => {
  it('a $10 monthly gift is accepted (200) and goes to Stripe Checkout', async () => {
    const outcome = await startMonthlyGift(10);

    expect(exchanges[0].body).toEqual({ amount: 10 });
    expect(exchanges[0].status).toBe(200);
    expect(seedFund.createSeedFundCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'uid-42', seedsUid: 'uid-42', amountCents: 1000 })
    );
    expect(window.location.href).toBe('https://checkout.stripe.com/cs_1');
    expect(outcome).toEqual({ status: 'redirected' });
  });

  it('server without Stripe answers 503, and the web reports not-configured', async () => {
    stripePayments.isStripeConfigured.mockReturnValue(false);

    const outcome = await startMonthlyGift(10);

    expect(exchanges[0].status).toBe(503);
    expect(seedFund.createSeedFundCheckout).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'not-configured' });
  });
});
