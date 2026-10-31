/**
 * A token from before account deletion (or a revoked one) is refused (#2966).
 *
 * Before: verifyFirebaseToken skipped Firebase's revocation check by default, so the
 * ID token the app still held kept working for up to an hour after "delete my
 * account", and GET /api/user/profile, the first call the app makes, recreated the
 * erased person's record. firebase-admin is faked to behave as the real SDK does: the
 * token's signature is still valid; only the account lookup (getUser) shows it is gone.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => {
  const signedIn = Math.floor(Date.now() / 1000) - 600; // ten minutes ago
  const fail = (code: string) => Object.assign(new Error(code), { code });
  /** The real SDK: verifyIdToken checks the signature; getUser reads the account */
  const verifyIdToken = async (token: string) => {
    if (!/^(live|deleted|revoked|blip|anon)$/.test(token)) throw fail('auth/argument-error');
    const provider = token === 'anon' ? 'anonymous' : 'password';
    return {
      uid: `uid-${token}-1`,
      auth_time: signedIn,
      exp: 4102444800,
      firebase: { sign_in_provider: provider },
    };
  };
  const getUser = async (uid: string) => {
    if (uid === 'uid-deleted-1') throw fail('auth/user-not-found');
    if (uid === 'uid-blip-1') throw fail('auth/internal-error'); // an Auth outage
    const revokedAt = new Date((signedIn + 60) * 1000).toUTCString(); // signed out everywhere since
    return {
      disabled: false,
      tokensValidAfterTime: uid === 'uid-revoked-1' ? revokedAt : undefined,
    };
  };
  return { verifyIdToken: vi.fn(verifyIdToken), getUser: vi.fn(getUser) };
});
const store = vi.hoisted(() => ({
  getProfile: vi.fn(async () => null),
  getOrCreateProfile: vi.fn(async (id: string) => ({ id, name: 'User' })),
}));

vi.mock('firebase-admin', () => ({
  default: {
    apps: [{}],
    auth: () => ({ verifyIdToken: auth.verifyIdToken, getUser: auth.getUser }),
  },
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
    expect(auth.getUser).toHaveBeenCalledWith('uid-deleted-1');
    expect(store.getOrCreateProfile).not.toHaveBeenCalled();
  });

  it('a revoked token is refused', async () => {
    const res = await openProfile('revoked');

    expect(res.status).toBe(401);
    expect(store.getOrCreateProfile).not.toHaveBeenCalled();
  });

  it('an Auth outage with nothing cached is a 503, try again: not a 401, not a pass', async () => {
    const res = await openProfile('blip');

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(store.getOrCreateProfile).not.toHaveBeenCalled();
  });

  it('an anonymous token opens the profile; this strict route still looks its account up', async () => {
    const res = await openProfile('anon');

    expect(res.status).toBe(200);
    expect(auth.getUser).toHaveBeenCalledWith('uid-anon-1');
  });

  it("a live account's token still opens (and creates) the profile", async () => {
    const res = await openProfile('live');

    expect(res.status).toBe(200);
    expect(store.getOrCreateProfile).toHaveBeenCalledWith('uid-live-1');
  });
});
