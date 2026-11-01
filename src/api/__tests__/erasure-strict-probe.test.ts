/**
 * The #3208 verifier's probe: once account erasure has run (markErasing), the account's
 * token is refused by strict and normal checks alike, and the app's first call never
 * reaches the store that would recreate its record.
 *
 * Before: markErasing invalidated the cached account state, but the Firebase user lives
 * until the sweep ends, so a strict check (which skips the cache) looked it up, passed,
 * and overwrote the invalidation; the next normal check passed too, and strict
 * GET /api/user/profile answered 200 and called getOrCreateProfile. Runs the real erasure
 * and the real route.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifyIdToken: vi.fn(async (token: string) => ({
    uid: token,
    auth_time: Math.floor(Date.now() / 1000) - 60,
    exp: 4102444800,
    email: `${token}@example.com`,
    firebase: { sign_in_provider: 'password' },
  })),
  // The Firebase user still exists: it is deleted only after the sweep
  getUser: vi.fn(async () => ({ disabled: false, providerData: [{ providerId: 'password' }] })),
}));
const store = vi.hoisted(() => ({
  getProfile: vi.fn(async (): Promise<null | { id: string }> => null),
  getOrCreateProfile: vi.fn(async (id: string) => ({ id, name: 'User' })),
}));

vi.mock('firebase-admin', () => ({ default: { apps: [{}], auth: () => auth } }));
vi.mock('../../memory/store-factory.js', () => ({ getStore: async () => store }));
vi.mock('../../services/outreach/outreach-intelligence.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  eraseUserOutreachData: async () => undefined,
}));
vi.mock('../../services/security-events.js', () => ({
  isLockedOut: () => ({ locked: false }),
  trackFailedAuth: async () => {},
  recordSecurityEvent: async () => {},
  recordSuccessfulAuth: async () => {},
  detectAnomalies: async () => {},
}));

const UID = 'Ek4Rw9Tz2Lq7Mn1Xp6Vc3Hb8Ds5J';

/** The user record, as the erasure sees it: marked, then deleted with everything under it */
function recordStore() {
  const docs = new Map<string, Record<string, unknown>>([[`bogle_users/${UID}`, { id: UID }]]);
  const doc = (path: string) => ({
    path,
    get: async () => ({ exists: docs.has(path) }),
    update: async (data: Record<string, unknown>) => {
      if (!docs.has(path)) throw Object.assign(new Error('5 NOT_FOUND'), { code: 5 });
      docs.set(path, { ...docs.get(path), ...data });
    },
    listCollections: async () => [],
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
    recursiveDelete: async (ref: { path: string }) => void docs.delete(ref.path),
  };
  return { db, docs };
}

let server: Server;
let base: string;

beforeAll(async () => {
  const { handleUserRoutes } = await import('../user-routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleUserRoutes(req, res, url.pathname, url);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const openProfile = () =>
  fetch(`${base}/api/user/profile`, { headers: { authorization: `Bearer ${UID}` } });

describe('after account erasure (markErasing), while the Firebase user still exists', () => {
  it('strict and normal checks refuse the token, and the profile route creates nothing', async () => {
    expect((await openProfile()).status).toBe(200); // live
    expect(store.getOrCreateProfile).toHaveBeenCalledTimes(1);

    const { eraseUserRecord } = await import('../../services/platform/erase-user-record.js');
    const { db, docs } = recordStore();
    await eraseUserRecord(UID, db as never, [{ collection: 'bogle_users', doc: 'uid' }], []);
    expect(docs.size).toBe(0);

    // Strict (the profile route): refused, though a lookup would say the user exists
    expect((await openProfile()).status).toBe(401);
    expect(store.getOrCreateProfile).toHaveBeenCalledTimes(1);
    // And the strict check did not undo the erasure for the normal one
    const { verifyFirebaseToken } = await import('../../services/identity/firebase-auth.js');
    expect(await verifyFirebaseToken(UID)).toBeNull();
    expect(await verifyFirebaseToken(UID, { strict: true })).toBeNull();
  });
});
