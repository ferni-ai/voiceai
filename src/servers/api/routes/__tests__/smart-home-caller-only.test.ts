/**
 * Smart-home routes take the user only from the verified request, never from a
 * ?userId= query parameter or a body userId.
 *
 * The door (bindVerifiedIdentity) rewrites ?userId= in production, but a route
 * must not depend on that: in development the door keeps it, and any path that
 * reaches the handler without the door would hand over another user's
 * credentials. So `handlerOnly` serves the REAL routes with no door at all.
 * Mocked: Firebase token verification and Firestore (in memory).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    if (token === 'tok-unchecked')
      throw Object.assign(new Error('unchecked'), { code: 'auth/revocation-check-unavailable' });
    return token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null;
  }),
  isVerifiedToken: (t: unknown) => t !== null,
}));
vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase-admin/firestore')>()),
  getFirestore: () => h.db,
}));

const state = newMergeFakeState();
const routes = await import('../smart-home.js');
const { sealTokens } = await import('../../../../utils/token-at-rest.js');

const realFetch = globalThis.fetch;
let server: Server;
let base = '';
beforeAll(async () => {
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  // Outbound calls (e.g. Sonos) answer with an empty household list.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
    if (url.startsWith(base)) return realFetch(input, init);
    return new globalThis.Response('{"households":[]}');
  });
  server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!(await routes.handleSmartHomeRoutes(req, res, url.pathname, url))) {
        res.writeHead(404);
        res.end();
      }
    })();
  });
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

const victimDocs = {
  'bogle_users/victim/smart_home/hue': sealTokens({ bridgeIp: '192.168.1.2', username: 'k' }),
  'bogle_users/victim/smart_home/lifx': sealTokens({ token: 'victim-lifx' }),
  'bogle_users/victim/smart_home/sonos': sealTokens({
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
  }),
  'bogle_users/victim/smart_home/homekit': { enabled: true, homeName: 'Victim Home' },
  'bogle_users/victim/homekit/commands/pending/c1': { deviceId: 'd', action: 'on', timestamp: 1 },
};
beforeEach(() => {
  h.db = createMergeFakeFirestore(state);
  state.docs.clear();
  for (const [path, doc] of Object.entries(victimDocs)) state.docs.set(path, { ...doc });
});

describe('a ?userId= query parameter is never an identity', () => {
  it.each([
    ['GET', 'hue/status'],
    ['DELETE', 'hue/disconnect'],
    ['GET', 'lifx/status'],
    ['DELETE', 'lifx/disconnect'],
    ['GET', 'sonos/status'],
    ['DELETE', 'sonos/disconnect'],
    ['GET', 'homekit/status'],
    ['DELETE', 'homekit/disconnect'],
    ['GET', 'homekit/commands'],
  ])('%s /api/smart-home/%s?userId=victim with no auth is refused', async (method, path) => {
    const res = await realFetch(`${base}/api/smart-home/${path}?userId=victim`, { method });
    expect(res.status).toBe(401);
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/saved|connected":true|Victim Home|commands/);
    for (const path of Object.keys(victimDocs)) expect(state.docs.has(path)).toBe(true);
  });
});

describe('HomeKit sync writes only the verified token uid', () => {
  const sync = (body: object, authorization?: string) =>
    realFetch(`${base}/api/smart-home/homekit/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
      body: JSON.stringify(body),
    });
  const homeData = { homeName: 'Mine', devices: [{ id: 'd1' }], scenes: [], rooms: [] };

  it('ignores body.userId and syncs into the caller, never the victim', async () => {
    const res = await sync({ userId: 'victim', homeData }, 'Bearer tok-A');
    expect(res.status).toBe(200);
    expect(state.docs.get('bogle_users/uid-A/homekit/config')).toMatchObject({ homeName: 'Mine' });
    expect(state.docs.has('bogle_users/victim/homekit/config')).toBe(false);
    expect(state.docs.has('bogle_users/victim/homekit/devices/list/d1')).toBe(false);
  });

  it('refuses a sync with no token or an unverified one', async () => {
    for (const auth of [undefined, 'Bearer forged']) {
      const res = await sync({ userId: 'victim', homeData }, auth);
      expect(res.status).toBe(401);
    }
    expect(state.docs.has('bogle_users/victim/homekit/config')).toBe(false);
  });

  it("answers 503 with Retry-After, not 401, when the token's account couldn't be checked", async () => {
    const res = await sync({ homeData }, 'Bearer tok-unchecked');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(state.docs.has('bogle_users/uid-A/homekit/config')).toBe(false);
  });
});
