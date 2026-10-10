/**
 * POST /api/apple/verify acts for the verified caller only.
 *
 * It took `body.userId` with no auth at all. The route now authenticates,
 * refuses a body naming another user (403), and hands the purchase to
 * claimAppleTransaction for the caller. Apple verification and first-claim
 * ownership are covered in services/billing/__tests__/apple-signed-data.test.ts.
 * Here: real HTTP, real route and auth middleware; Firebase verification and
 * the claim service are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null
  ),
}));

const claimAppleTransaction = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    transaction: { productId: 'com.ferni.friend.monthly', environment: 'Sandbox' },
  }))
);
// What the server has configured: App Store API keys, and a purchase verifier
// (null in production until APPLE_APP_APPLE_ID is set).
const config = vi.hoisted(() => ({ appleConfigured: true, verifier: {} as object | null }));
vi.mock('../../services/apple-iap.js', () => ({
  isAppleConfigured: () => config.appleConfigured,
  appleIAP: { productToTier: { 'com.ferni.friend.monthly': 'friend' } },
}));
vi.mock('../../services/billing/apple-signed-data.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/billing/apple-signed-data.js')>()),
  claimAppleTransaction,
  getAppleVerifier: () => config.verifier,
}));

const { handleAppleRoutes } = await import('../apple-iap-routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => void handleAppleRoutes(req, res));
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);
beforeEach(() => {
  vi.clearAllMocks();
  config.appleConfigured = true;
  config.verifier = {};
});

const verify = (body: unknown, token?: string) =>
  fetch(`${base}/api/apple/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

describe('POST /api/apple/verify', () => {
  it('refuses user A attaching a receipt to user B', async () => {
    const res = await verify({ receiptData: 'tx-1', userId: 'uid-B' }, 'tok-A');
    expect(res.status).toBe(403);
    expect(claimAppleTransaction).not.toHaveBeenCalled();
  });

  it('refuses a request with no verified identity', async () => {
    const res = await verify({ receiptData: 'tx-1', userId: 'uid-B' });
    expect(res.status).toBe(401);
    expect(claimAppleTransaction).not.toHaveBeenCalled();
  });

  it('verifies for the signed-in caller (the web now sends no userId)', async () => {
    const res = await verify({ receiptData: 'tx-1' }, 'tok-A');
    expect(res.status).toBe(200);
    expect(claimAppleTransaction).toHaveBeenCalledWith('uid-A', 'tx-1');
  });

  it('serves the signed-in user their appAccountToken, and nobody else', async () => {
    const { appAccountTokenFor } = await import('../../services/billing/apple-signed-data.js');
    const mine = await fetch(`${base}/api/apple/account-token`, {
      headers: { authorization: 'Bearer tok-A' },
    });
    expect(mine.status).toBe(200);
    expect(await mine.json()).toEqual({ appAccountToken: appAccountTokenFor('uid-A') });

    const anonymous = await fetch(`${base}/api/apple/account-token`);
    expect(anonymous.status).toBe(401);
  });

  // No token means the iOS app doesn't buy, so nobody pays for a purchase
  // /api/apple/verify would refuse.
  it.each([
    ['no purchase verifier (APPLE_APP_APPLE_ID unset in production)', true, null],
    ['no App Store API keys', false, {}],
  ])(
    'withholds the token while purchases cannot be verified: %s',
    async (_case, configured, verifier) => {
      config.appleConfigured = configured;
      config.verifier = verifier;

      const res = await fetch(`${base}/api/apple/account-token`, {
        headers: { authorization: 'Bearer tok-A' },
      });

      expect(res.status).toBe(503);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({ error: "Purchases aren't available yet" });
      expect(body).not.toHaveProperty('appAccountToken');
    }
  );
});
