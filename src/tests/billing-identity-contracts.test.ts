/**
 * Billing identity contract between the web app and the UI server.
 *
 * The web used to put its local deviceId in `body.userId` for checkout, the
 * billing portal, usage and Apple receipt calls. The server now acts only on
 * the verified caller and answers 403 to a body naming anyone else, so the web
 * sends no userId and carries the Firebase Bearer token instead.
 *
 * Each test captures the request the REAL web code sends (apiPost, the portal
 * helper, the usage-body builder), turns its Bearer header into a caller with
 * the REAL auth middleware (only Firebase verification is mocked, the way the
 * UI server mount does it), and hands the request to the REAL route handler.
 * Billing services are mocked so the test can see which user they acted on.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-42' ? { uid: 'uid-42', claims: {}, isAnonymous: false } : null
  ),
}));

const stripe = vi.hoisted(() => ({
  isStripeConfigured: vi.fn(() => true),
  createPortalSession: vi.fn(async () => ({ url: 'https://billing.stripe.com/p/s' })),
  createCheckoutSession: vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/s' })),
  recordConversation: vi.fn(async () => ({ conversationsUsed: 1 })),
  getSubscriptionInfo: vi.fn(),
  canStartConversation: vi.fn(),
  verifyWebhook: vi.fn(),
  handleWebhookEvent: vi.fn(),
}));
vi.mock('../services/stripe-subscription.js', () => stripe);
vi.mock('../services/subscription-metrics.js', () => ({
  initializeSubscriptionMetrics: vi.fn(async () => undefined),
  trackStripeEvent: vi.fn(async () => undefined),
  getMetricsForApi: vi.fn(() => ({})),
}));

const claimAppleTransaction = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    transaction: { productId: 'com.ferni.friend.monthly', environment: 'Sandbox' },
  }))
);
vi.mock('../services/apple-iap.js', () => ({
  isAppleConfigured: () => true,
  appleIAP: { productToTier: { 'com.ferni.friend.monthly': 'friend' } },
}));
vi.mock('../services/billing/apple-signed-data.js', () => ({
  claimAppleTransaction,
  getAppleVerifier: () => null,
}));

// The web's Firebase session: signed in as uid-42 with ID token tok-42.
vi.mock('../../apps/web/src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => undefined),
  getAuthToken: vi.fn(async () => 'tok-42'),
  getFirebaseUid: vi.fn(() => 'uid-42'),
}));
vi.mock('../../apps/web/src/ui/whisper.ui.js', () => ({ toast: { error: vi.fn() } }));

const { optionalAuthAsync } = await import('../api/auth-middleware.js');
const { handleSubscriptionRequest } = await import('../api/subscription-routes.js');
const { handleAppleRoutes } = await import('../api/apple-iap-routes.js');
const { apiPost } = await import('../../apps/web/src/utils/api.js');
const { openBillingPortal } = await import('../../apps/web/src/utils/billing.js');
const { buildConversationUsageBody } = await import('../../apps/web/src/services/call-payloads.js');

interface Captured {
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
let captured: Captured[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  captured = [];
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { location: { href: 'https://app.ferni.ai/settings', origin: '' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: { headers?: Record<string, string>; body?: unknown }) => {
      captured.push({
        path,
        headers: Object.fromEntries(new globalThis.Headers(init.headers).entries()),
        body: JSON.parse(String(init.body)),
      });
      return new globalThis.Response(JSON.stringify({ url: 'https://stripe.example/s' }), {
        status: 200,
      });
    })
  );
});

/** What the UI server mount does: verify the Bearer token, then call the route. */
async function serve(request: Captured) {
  const req = { headers: request.headers, socket: {} } as unknown as IncomingMessage;
  const auth = await optionalAuthAsync(req);
  return handleSubscriptionRequest({
    method: 'POST',
    pathname: request.path,
    query: {},
    headers: request.headers,
    body: request.body,
    authUserId: auth?.userId,
    isAdmin: auth?.isAdmin ?? false,
  });
}

describe('POST /subscription/checkout (support-ferni + subscription UI via apiPost)', () => {
  it('bills the signed-in account the web request authenticates as', async () => {
    // The fields both checkout buttons send, through the real apiPost transport.
    await apiPost('/subscription/checkout', {
      tier: 'friend',
      successUrl: 'https://app.ferni.ai?upgrade=success&tier=friend',
      cancelUrl: 'https://app.ferni.ai?upgrade=cancel',
    });
    const [request] = captured;
    expect(request.headers.authorization).toBe('Bearer tok-42');

    const response = await serve(request);

    expect(response.status).toBe(200);
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'uid-42', tier: 'friend' })
    );
  });
});

describe('POST /subscription/portal (utils/billing openBillingPortal)', () => {
  it('opens the portal for the signed-in account, with no userId in the body', async () => {
    await openBillingPortal({ openInNewTab: false, returnUrl: 'https://app.ferni.ai/settings' });
    const [request] = captured;
    expect(request.path).toBe('/subscription/portal');
    expect(request.headers.authorization).toBe('Bearer tok-42');
    expect(request.body).toEqual({ returnUrl: 'https://app.ferni.ai/settings' });

    const response = await serve(request);

    expect(response.status).toBe(200);
    expect(stripe.createPortalSession).toHaveBeenCalledWith(
      'uid-42',
      'https://app.ferni.ai/settings'
    );
  });
});

describe('POST /usage/conversation (call-payloads + app.ts)', () => {
  it('records the call length for the signed-in account', async () => {
    const start = Date.parse('2026-10-03T10:00:00Z');
    const body = buildConversationUsageBody(start, start + 12 * 60_000);
    expect(body).toEqual({ durationMinutes: 12 });

    const response = await serve({
      path: '/usage/conversation',
      headers: { authorization: 'Bearer tok-42' },
      body: body as unknown as Record<string, unknown>,
    });

    expect(response.status).toBe(200);
    expect(stripe.recordConversation).toHaveBeenCalledWith('uid-42', 12);
  });
});

describe('old-style bodies that name a device id', () => {
  it.each([
    ['/subscription/checkout', { tier: 'friend' }],
    ['/subscription/portal', { returnUrl: 'https://app.ferni.ai' }],
    ['/usage/conversation', { durationMinutes: 5 }],
  ])('%s answers 403 and bills no one', async (path, body) => {
    const response = await serve({
      path,
      headers: { authorization: 'Bearer tok-42' },
      body: { ...body, userId: 'device-3f9a' },
    });

    expect(response.status).toBe(403);
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
    expect(stripe.createPortalSession).not.toHaveBeenCalled();
    expect(stripe.recordConversation).not.toHaveBeenCalled();
  });
});

describe('POST /api/apple/verify (apple-iap.service verifyWithBackend via apiPost)', () => {
  async function serveApple(request: Captured) {
    const req = Readable.from([JSON.stringify(request.body)]) as unknown as IncomingMessage;
    Object.assign(req, { method: 'POST', url: request.path, headers: request.headers, socket: {} });
    let status = 0;
    const res = {
      writeHead: (code: number) => ((status = code), res),
      setHeader: () => res,
      end: () => undefined,
    } as unknown as ServerResponse;
    await handleAppleRoutes(req, res);
    return status;
  }

  it('attaches the receipt to the signed-in account', async () => {
    await apiPost('/api/apple/verify', { receiptData: 'tx-77' }); // the body verifyWithBackend sends
    const [request] = captured;
    expect(request.headers.authorization).toBe('Bearer tok-42');

    expect(await serveApple(request)).toBe(200);
    expect(claimAppleTransaction).toHaveBeenCalledWith('uid-42', 'tx-77');
  });

  it('answers 403 to an old-style body naming a device id', async () => {
    const status = await serveApple({
      path: '/api/apple/verify',
      headers: { authorization: 'Bearer tok-42', 'content-type': 'application/json' },
      body: { receiptData: 'tx-77', userId: 'device-3f9a' },
    });
    expect(status).toBe(403);
    expect(claimAppleTransaction).not.toHaveBeenCalled();
  });
});
