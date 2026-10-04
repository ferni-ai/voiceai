/**
 * GET /api/apple/status only reports on a purchase the caller owns.
 *
 * It took ?transactionId= and looked it up at Apple for whoever asked, so
 * anyone holding (or guessing) another user's originalTransactionId could
 * read that user's tier, status and expiry. Ownership is recorded in
 * apple_transaction_owners when the purchase is claimed via /api/apple/verify;
 * the route now requires the verified caller to be that owner (admin excepted).
 *
 * Real HTTP, real route, auth middleware and ownership lookup; Firebase token
 * verification, Firestore (an in-memory fake) and the Apple lookup are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    if (token === 'tok-A') return { uid: 'uid-A', claims: {}, isAnonymous: false };
    if (token === 'tok-B') return { uid: 'uid-B', claims: {}, isAnonymous: false };
    if (token === 'tok-admin')
      return { uid: 'admin-1', claims: { admin: true }, isAnonymous: false };
    return null;
  }),
}));

const owners = vi.hoisted(() => new Map<string, { userId: string }>());
const firestoreUp = vi.hoisted(() => ({ value: true }));
vi.mock('../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/firestore-utils.js')>()),
  getFirestoreDb: () =>
    firestoreUp.value
      ? {
          collection: (name: string) => ({
            doc: (id: string) => ({
              get: async () => {
                const data = name === 'apple_transaction_owners' ? owners.get(id) : undefined;
                return { exists: !!data, data: () => data };
              },
            }),
          }),
        }
      : null,
}));

const syncSubscription = vi.hoisted(() =>
  vi.fn(async () => ({
    tier: 'partner',
    status: 'active',
    expiresDate: new Date(Date.now() + 1e9),
  }))
);
vi.mock('../../services/apple-iap.js', () => ({
  isAppleConfigured: () => true,
  appleIAP: { productToTier: {}, syncSubscription },
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
beforeEach(() => {
  vi.clearAllMocks();
  firestoreUp.value = true;
  owners.clear();
  owners.set('otx-B', { userId: 'uid-B' });
});

const status = (query: string, token?: string) =>
  fetch(`${base}/api/apple/status?${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe('GET /api/apple/status', () => {
  it("refuses A reading B's subscription by B's transaction id", async () => {
    const res = await status('userId=uid-A&transactionId=otx-B', 'tok-A');
    expect(res.status).toBe(403);
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it('refuses a transaction nobody has claimed', async () => {
    const res = await status('transactionId=otx-unclaimed', 'tok-A');
    expect(res.status).toBe(403);
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it('refuses A naming B in ?userId=', async () => {
    const res = await status('userId=uid-B&transactionId=otx-B', 'tok-A');
    expect(res.status).toBe(403);
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it('needs a verified caller', async () => {
    const res = await status('userId=uid-B&transactionId=otx-B');
    expect(res.status).toBe(401);
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it('fails closed when ownership cannot be read', async () => {
    firestoreUp.value = false;
    const res = await status('transactionId=otx-B', 'tok-B');
    expect(res.status).toBe(503);
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it('reports the status to the owner (the web sends userId too)', async () => {
    const res = await status('userId=uid-B&transactionId=otx-B', 'tok-B');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { tier: string }).tier).toBe('partner');
    expect(syncSubscription).toHaveBeenCalledWith('uid-B', 'otx-B');
  });

  it('lets an admin look up any transaction', async () => {
    const res = await status('userId=uid-B&transactionId=otx-B', 'tok-admin');
    expect(res.status).toBe(200);
    expect(syncSubscription).toHaveBeenCalledWith('uid-B', 'otx-B');
  });
});
