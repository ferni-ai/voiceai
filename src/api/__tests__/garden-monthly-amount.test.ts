/**
 * POST /api/garden/subscribe bills the monthly amount the person picked, as a gift.
 * It used to ignore the amount and open the Friend plan's checkout.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkout = vi.hoisted(() =>
  vi.fn(async (_params: Record<string, unknown>) => ({
    sessionId: 'cs_1',
    url: 'https://checkout.test/cs_1',
  }))
);
const planCheckout = vi.hoisted(() => vi.fn());
vi.mock('../../services/billing/seed-fund-checkout.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createSeedFundCheckout: checkout,
}));
vi.mock('../../services/stripe-subscription.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createCheckoutSession: planCheckout,
}));
vi.mock('../../services/stripe-payments.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isStripeConfigured: () => true,
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  optionalAuthAsync: async () => ({ userId: 'u1' }),
  rateLimit: () => false,
}));

const { handleGardenRoutes } = await import('../garden-routes.js');

async function subscribe(amount: unknown) {
  const req = Readable.from([JSON.stringify({ amount })]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: '/api/garden/subscribe',
    headers: { host: 'ferni.ai' },
  });
  let status = 200;
  let body = '';
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn((b?: string) => {
      body = b ?? '';
    }),
  } as unknown as ServerResponse;
  await handleGardenRoutes(
    req,
    res,
    '/api/garden/subscribe',
    new URL('https://ferni.ai/api/garden/subscribe')
  );
  return { status, body: body ? JSON.parse(body) : {} };
}

beforeEach(() => {
  checkout.mockClear();
  planCheckout.mockClear();
});

describe('POST /api/garden/subscribe', () => {
  it('bills the chosen $20 a month as a gift, not the Friend plan', async () => {
    const res = await subscribe(20);
    expect(res).toMatchObject({
      status: 200,
      body: { success: true, checkoutUrl: 'https://checkout.test/cs_1' },
    });
    expect(checkout).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 2000, seedsUid: 'u1' })
    );
    expect(planCheckout).not.toHaveBeenCalled();
  });

  it('refuses amounts under $5 or over $1000 without opening a checkout', async () => {
    for (const amount of [3, 1500, 'twenty']) {
      expect((await subscribe(amount)).status).toBe(400);
    }
    expect(checkout).not.toHaveBeenCalled();
  });
});
