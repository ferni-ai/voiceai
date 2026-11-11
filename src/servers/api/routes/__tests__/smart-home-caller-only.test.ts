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
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null,
  ),
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
  ])('%s /api/smart-home/%s?userId=victim with no auth is refused', async (method, path) => {
    const res = await realFetch(`${base}/api/smart-home/${path}?userId=victim`, { method });
    expect(res.status).toBe(401);
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/saved|connected":true/);
    for (const path of Object.keys(victimDocs)) expect(state.docs.has(path)).toBe(true);
  });
});

describe('the HomeKit bridge routes are gone (Apple keeps HomeKit data on the device)', () => {
  it.each([
    ['GET', 'homekit/status'],
    ['POST', 'homekit/sync'],
    ['DELETE', 'homekit/disconnect'],
    ['GET', 'homekit/commands'],
    ['POST', 'homekit/command-complete'],
  ])('%s /api/smart-home/%s is not served, even for a verified caller', async (method, path) => {
    const res = await realFetch(`${base}/api/smart-home/${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer tok-A' },
      ...(method === 'POST'
        ? { body: JSON.stringify({ homeData: { homeName: 'Mine', devices: [{ id: 'd1' }] } }) }
        : {}),
    });
    expect(res.status).toBe(404);
    expect([...state.docs.keys()].filter((k) => k.includes('/homekit'))).toEqual([]);
  });
});
