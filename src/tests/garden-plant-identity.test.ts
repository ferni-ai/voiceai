/**
 * POST /api/garden/plant: whom does a seed payment act on?
 *
 * The web's Support Ferni modal once put its local deviceId in `body.userId`. The
 * handler ignored the body and used whoever the router resolved, so an
 * old-style body naming someone else was quietly answered as the caller. Now
 * the handler applies the shared acting-user rule: act on the verified caller,
 * 403 to a body naming anyone else (unless admin), 401 with no credentials.
 *
 * Each request is built by the REAL web transport (apiPost from utils/api.ts,
 * apiFetch from utils/api-helpers.ts) with the web's Firebase session mocked,
 * then its headers are turned into a caller by the REAL auth middleware and
 * the request is handed to the REAL garden route handler. Only Firebase token
 * verification and the Stripe services are mocked, so the test can see which
 * user a payment intent was created for.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    if (token === 'tok-42') return { uid: 'uid-42', claims: {}, isAnonymous: false };
    if (token === 'tok-admin')
      return { uid: 'admin-1', claims: { admin: true }, isAnonymous: false };
    return null;
  }),
}));

const stripePayments = vi.hoisted(() => ({
  isStripeConfigured: vi.fn(() => true),
  createPaymentIntent: vi.fn(async () => ({ clientSecret: 'pi_secret', paymentIntentId: 'pi_1' })),
}));
vi.mock('../services/stripe-payments.js', () => stripePayments);
vi.mock('../services/stripe-subscription.js', () => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}));

// The web's Firebase session: signed in as uid-42 with ID token tok-42.
const webAuth = vi.hoisted(() => ({ token: 'tok-42' as string | null }));
vi.mock('../../apps/web/src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => undefined),
  getAuthToken: vi.fn(async () => webAuth.token),
  getFirebaseUid: vi.fn(() => 'uid-42'),
}));
vi.mock('../../apps/web/src/ui/whisper.ui.js', () => ({ toast: { error: vi.fn() } }));

const { handleGardenRoutes } = await import('../api/garden-routes.js');
const { apiPost } = await import('../../apps/web/src/utils/api.js');
const { apiFetch } = await import('../../apps/web/src/utils/api-helpers.js');
const { payForSeed } = await import('../../apps/web/src/services/seed-payment.js');

interface Captured {
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
let captured: Captured[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  captured = [];
  webAuth.token = 'tok-42';
  // A production web build: no `X-Admin-Key: dev-mode` header (that is only
  // added when Vite's DEV flag is set, which vitest sets by default).
  vi.stubEnv('DEV', false);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { location: { href: 'https://app.ferni.ai/', origin: '' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: { headers?: Record<string, string>; body?: unknown }) => {
      captured.push({
        path,
        headers: Object.fromEntries(new globalThis.Headers(init.headers).entries()),
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });
      return new globalThis.Response('{}', { status: 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Hand a captured web request to the real garden router, as the API server does. */
async function serve(
  request: Captured
): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = Readable.from([JSON.stringify(request.body)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: request.path,
    headers: request.headers,
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
  const handled = await handleGardenRoutes(
    req,
    res,
    request.path,
    new URL(request.path, 'http://x')
  );
  expect(handled).toBe(true);
  return { status, body: payload ? (JSON.parse(payload) as Record<string, unknown>) : {} };
}

const paidFor = () =>
  stripePayments.createPaymentIntent.mock.calls.map(
    (c) => (c as unknown as [{ userId: string }])[0].userId
  );

describe('POST /api/garden/plant', () => {
  it('Support Ferni: plants through payForSeed, sends no device id, and pays as uid-42', async () => {
    // support-ferni.ui.ts handlePlantSeed calls payForSeed (seed-payment.ts),
    // the same flow as the Seed Fund modal. It used to send
    // { amountInCents, successUrl, cancelUrl }, which this handler 400s.
    await payForSeed(5, async () => ({ status: 'cancelled' }));
    const [request] = captured;
    expect(request.headers.authorization).toBe('Bearer tok-42');
    expect(request.body).toEqual({ amount: 5 });

    const out = await serve(request);

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ success: true, clientSecret: 'pi_secret' });
    expect(paidFor()).toEqual(['uid-42']);
  });

  it('Seed Fund: the real web body succeeds and pays as the verified uid', async () => {
    // ferni-fund.ui.ts plantSeed: { amount } through the real apiFetch.
    await apiFetch('/api/garden/plant', { method: 'POST', body: JSON.stringify({ amount: 5 }) });
    const [request] = captured;
    expect(request.headers.authorization).toBe('Bearer tok-42');
    expect(request.body).toEqual({ amount: 5 });

    const out = await serve(request);

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ success: true, clientSecret: 'pi_secret' });
    expect(paidFor()).toEqual(['uid-42']);
  });

  it('refuses an old-style body naming a different id with 403 and pays for no one', async () => {
    await apiPost('/api/garden/plant', { userId: 'device-3f9a', amount: 5 });
    const [request] = captured;
    expect(request.body.userId).toBe('device-3f9a');

    const out = await serve(request);

    expect(out.status).toBe(403);
    expect(paidFor()).toEqual([]);
  });

  it('lets a verified admin act for the user the body names', async () => {
    webAuth.token = 'tok-admin';
    await apiPost('/api/garden/plant', { userId: 'uid-77', amount: 5 });

    const out = await serve(captured[0]);

    expect(out.status).toBe(200);
    expect(paidFor()).toEqual(['uid-77']);
  });

  it('answers 401 without credentials, even when the body names a user', async () => {
    webAuth.token = null;
    await apiPost('/api/garden/plant', { userId: 'uid-42', amount: 5 });
    const [request] = captured;
    expect(request.headers.authorization).toBeUndefined();
    expect(request.headers['x-admin-key']).toBeUndefined();

    const out = await serve(request);

    expect(out.status).toBe(401);
    expect(paidFor()).toEqual([]);
  });
});
