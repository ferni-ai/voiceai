/**
 * POST /api/apple/verify attaches the receipt to the verified caller.
 *
 * It took `body.userId` with no auth at all. The Apple service currently
 * ignores that id, so nothing was written to the wrong account yet; the route
 * now refuses a body naming another user anyway, so a later service change
 * cannot quietly turn this into a cross-account write. Real HTTP request, real
 * route and auth middleware; only Firebase verification and the Apple service
 * are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null
  ),
}));

const verifyReceipt = vi.hoisted(() =>
  vi.fn(async () => ({ isValid: true, tier: 'friend', status: 'active', environment: 'Sandbox' }))
);
vi.mock('../../services/apple-iap.js', () => ({
  isAppleConfigured: () => true,
  appleIAP: { verifyReceipt },
}));

const { handleAppleRoutes } = await import('../apple-iap-routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => void handleAppleRoutes(req, res));
  await new Promise<void>((r) => {
    server.listen(0, r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);
beforeEach(() => vi.clearAllMocks());

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
    expect(verifyReceipt).not.toHaveBeenCalled();
  });

  it('refuses a request with no verified identity', async () => {
    const res = await verify({ receiptData: 'tx-1', userId: 'uid-B' });
    expect(res.status).toBe(401);
    expect(verifyReceipt).not.toHaveBeenCalled();
  });

  it('verifies for the signed-in caller (the web now sends no userId)', async () => {
    const res = await verify({ receiptData: 'tx-1' }, 'tok-A');
    expect(res.status).toBe(200);
    expect(verifyReceipt).toHaveBeenCalledWith('tx-1', 'uid-A');
  });
});
