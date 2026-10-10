/**
 * POST /api/smart-home/sonos/auth-url took the account to link from body.userId
 * with no credentials, so anyone could start a Sonos link into any user's Ferni
 * account. It now uses only the verified caller.
 *
 * Real HTTP through bindVerifiedIdentity and the REAL smart-home routes; mocked:
 * Firebase token verification, the Sonos token exchange (fetch) and Firestore.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SONOS_CLIENT_ID = 'sonos-id';
process.env.SONOS_CLIENT_SECRET = 'sonos-secret';

vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null
  ),
  isVerifiedToken: () => true,
}));

const savedFor = vi.hoisted(() => [] as string[]);
vi.mock('firebase-admin/firestore', () => {
  const doc = (id: string) => ({
    collection: () => ({ doc: () => ({ set: async () => void savedFor.push(id) }) }),
  });
  return { getFirestore: () => ({ collection: () => ({ doc }) }) };
});

const { bindVerifiedIdentity } = await import('../../request-identity.js');
const { handleSmartHomeRoutes } = await import('../smart-home.js');

const realFetch = globalThis.fetch;
let server: Server;
let base = '';
beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
    if (url.startsWith('https://api.sonos.com/')) {
      return new globalThis.Response(
        JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 60 })
      );
    }
    return realFetch(input, init);
  });
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!(await handleSmartHomeRoutes(req, res, url.pathname, url))) {
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
beforeEach(() => {
  savedFor.length = 0;
});

const authUrl = (headers: Record<string, string>) =>
  realFetch(`${base}/api/smart-home/sonos/auth-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ userId: 'victim' }),
  });

describe('Sonos link identity', () => {
  it('refuses to start a link for a body userId without credentials', async () => {
    const res = await authUrl({});
    expect(res.status).toBe(401);
  });

  it('links to the verified caller, ignoring body.userId', async () => {
    const res = await authUrl({ authorization: 'Bearer tok-A' });
    expect(res.status).toBe(200);
    const state = new URL(((await res.json()) as { authUrl: string }).authUrl).searchParams.get(
      'state'
    );
    const cb = await realFetch(`${base}/api/smart-home/sonos/callback?code=c&state=${state}`, {
      redirect: 'manual',
    });
    expect(cb.headers.get('location')).toContain('smart_home=success');
    expect(savedFor).toEqual(['uid-A']);
  });
});
