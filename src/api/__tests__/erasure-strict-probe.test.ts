/**
 * The #3208 verifier's probe: once account erasure has run (markErasing), the account's
 * token is refused by strict and normal checks alike, and the app's first call can't
 * recreate its record.
 *
 * Before: markErasing invalidated the cached account state, but the Firebase user lives
 * until the sweep ends, so a strict check (which skips the cache) looked it up, passed,
 * and overwrote the invalidation; the next normal check passed too. Strict
 * GET /api/user/profile answered 200 and getOrCreateProfile recreated a fresh record.
 * Runs the real erasure, the real profile store (on an in-memory Firestore) and the real
 * route.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../tests/helpers/merge-fake-firestore.js';

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
const h = vi.hoisted(() => ({ store: null as unknown }));

vi.mock('firebase-admin', () => ({ default: { apps: [{}], auth: () => auth } }));
vi.mock('../../memory/store-factory.js', () => ({ getStore: async () => h.store }));
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
const RECORD = `bogle_users/${UID}`;
const state = newMergeFakeState();
const db = createMergeFakeFirestore(state);

let server: Server;
let base: string;

beforeAll(async () => {
  const { FirestoreStore } = await import('../../memory/storage/firestore-store.js');
  const store = new FirestoreStore({ projectId: 'test-project' });
  Reflect.set(store, 'db', db); // the in-memory Firestore, already connected
  Reflect.set(store, '_initialized', true);
  h.store = store;
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
  it('strict and normal checks refuse the token, and no record is recreated', async () => {
    expect((await openProfile()).status).toBe(200); // live: the first call makes the record
    expect(state.docs.has(RECORD)).toBe(true);

    const { eraseUserRecord } = await import('../../services/platform/erase-user-record.js');
    const userRecords = [{ collection: 'bogle_users', doc: 'uid' as const }];
    await eraseUserRecord(UID, db as never, userRecords, []);
    expect(state.docs.has(RECORD)).toBe(false);

    // Strict (the profile route): refused, though a lookup would say the user exists
    expect((await openProfile()).status).toBe(401);
    // And the strict check did not undo the erasure for the normal one
    const { verifyFirebaseToken } = await import('../../services/identity/firebase-auth.js');
    expect(await verifyFirebaseToken(UID)).toBeNull();
    expect(await verifyFirebaseToken(UID, { strict: true })).toBeNull();

    // The store refuses to create it too, whoever asks
    await (h.store as { getOrCreateProfile: (id: string) => Promise<unknown> }).getOrCreateProfile(
      UID
    );
    expect(state.docs.has(RECORD)).toBe(false);
  });
});
