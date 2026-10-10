/**
 * /spotify/device is admin only.
 *
 * The device is the playback target for the server's own Spotify account (the
 * Web Playback SDK account behind GET /spotify/token with no device_id). POST
 * let any anonymous caller point server playback at their own device or a bogus
 * one, and GET handed the current device id to anyone. No client calls either.
 *
 * Real HTTP through bindVerifiedIdentity and the REAL spotify handler. Mocked:
 * Firebase token verification, per-user Spotify token storage, and the
 * server-token service (with a real in-memory device slot).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? {
          uid: `uid-${token.slice(4)}`,
          claims: token === 'tok-admin' ? { admin: true } : {},
          isAnonymous: false,
        }
      : null
  ),
}));

vi.mock('../../token/oauth/spotify.js', () => ({
  isConfigured: () => true,
  getTokens: async () => null,
  getValidToken: async () => null,
}));

// The server's own Spotify account; the device slot behaves like the real one.
const server_ = vi.hoisted(() => ({ deviceId: null as string | null }));
vi.mock('../services/spotify.js', () => ({
  isConfigured: () => true,
  getConfig: () => ({ hasRefreshToken: true, hasWebDevice: !!server_.deviceId }),
  setWebDeviceId: vi.fn((id: string) => {
    server_.deviceId = id;
  }),
  getWebDeviceId: () => server_.deviceId,
}));

const { bindVerifiedIdentity } = await import('../request-identity.js');
const { handleSpotifyRoutes } = await import('../routes/spotify.js');

let base = '';
let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      try {
        await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (await handleSpotifyRoutes(req, res, url.pathname, url)) return;
        res.writeHead(404);
        res.end();
      } catch (err) {
        // Answer instead of leaving the request open, so a throw fails the
        // assertion with a 500 rather than hanging until the test times out.
        if (!res.headersSent) res.writeHead(500);
        res.end(String(err));
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
  server_.deviceId = 'server-device';
});

function call(method: 'GET' | 'POST', token?: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(`${base}/spotify/device`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST /spotify/device', () => {
  it('anonymous 401 and signed-in non-admin 403 leave the device alone; admin sets it', async () => {
    expect((await call('POST', undefined, { device_id: 'attacker' })).status).toBe(401);
    expect(server_.deviceId).toBe('server-device');

    expect((await call('POST', 'tok-A', { device_id: 'attacker' })).status).toBe(403);
    expect(server_.deviceId).toBe('server-device');

    const admin = await call('POST', 'tok-admin', { device_id: 'new-device' });
    expect(admin.status).toBe(200);
    expect(await admin.json()).toEqual({ success: true, device_id: 'new-device' });
    expect(server_.deviceId).toBe('new-device');
  });
});

describe('GET /spotify/device', () => {
  it('anonymous 401 and signed-in non-admin 403 do not see the id; admin does', async () => {
    const anon = await call('GET');
    expect(anon.status).toBe(401);
    expect(await anon.text()).not.toContain('server-device');

    const user = await call('GET', 'tok-A');
    expect(user.status).toBe(403);
    expect(await user.text()).not.toContain('server-device');

    const admin = await call('GET', 'tok-admin');
    expect(admin.status).toBe(200);
    expect(await admin.json()).toEqual({ device_id: 'server-device', has_device: true });
  });
});
