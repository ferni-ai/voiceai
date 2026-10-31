/**
 * A token from before account deletion (or a revoked one) is refused (#2966).
 *
 * Before: verifyFirebaseToken skipped Firebase's revocation check by default, so the
 * ID token the app still held kept working for up to an hour after "delete my
 * account", and GET /api/user/profile, the first call the app makes, recreated the
 * erased person's record. firebase-admin is faked to behave as the real SDK does: the
 * token's signature is still valid, and only verifyIdToken(token, true) looks the
 * account up and refuses it.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => {
  const account = { live: 'uid-live-1', deleted: 'uid-deleted-1', revoked: 'uid-revoked-1' };
  const fail = (code: string) => Object.assign(new Error(code), { code });
  /** The real SDK: a valid signature passes; checkRevoked also reads the account */
  const verifyIdToken = async (token: string, checkRevoked = false) => {
    const uid = account[token as keyof typeof account];
    if (!uid) throw fail('auth/argument-error');
    if (checkRevoked && token === 'deleted') throw fail('auth/user-not-found');
    if (checkRevoked && token === 'revoked') throw fail('auth/id-token-revoked');
    return {
      uid,
      email: `${token}@example.com`,
      exp: 4102444800,
      firebase: { sign_in_provider: 'password' },
    };
  };
  return { verifyIdToken: vi.fn(verifyIdToken) };
});
const store = vi.hoisted(() => ({
  getProfile: vi.fn(async () => null),
  getOrCreateProfile: vi.fn(async (id: string) => ({ id, name: 'User' })),
}));

vi.mock('firebase-admin', () => ({
  default: { apps: [{}], auth: () => ({ verifyIdToken: auth.verifyIdToken }) },
}));
vi.mock('../../memory/store-factory.js', () => ({ getStore: async () => store }));
vi.mock('../../services/security-events.js', () => ({
  isLockedOut: () => ({ locked: false }),
  trackFailedAuth: async () => {},
  recordSecurityEvent: async () => {},
  recordSuccessfulAuth: async () => {},
  detectAnomalies: async () => {},
}));

const { handleUserRoutes } = await import('../user-routes.js');

let server: Server;
let base: string;

beforeAll(async () => {
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
beforeEach(() => vi.clearAllMocks());

const openProfile = (token: string) =>
  fetch(`${base}/api/user/profile`, { headers: { authorization: `Bearer ${token}` } });

describe('a token whose account is gone', () => {
  it("a deleted account's token is refused and its record is not recreated", async () => {
    const res = await openProfile('deleted');

    expect(res.status).toBe(401);
    expect(auth.verifyIdToken).toHaveBeenCalledWith('deleted', true);
    expect(store.getOrCreateProfile).not.toHaveBeenCalled();
  });

  it('a revoked token is refused', async () => {
    const res = await openProfile('revoked');

    expect(res.status).toBe(401);
    expect(store.getOrCreateProfile).not.toHaveBeenCalled();
  });

  it("a live account's token still opens (and creates) the profile", async () => {
    const res = await openProfile('live');

    expect(res.status).toBe(200);
    expect(store.getOrCreateProfile).toHaveBeenCalledWith('uid-live-1');
  });
});
