/**
 * Ferni doesn't link a person's Spotify account (Developer Policy III.3 bars
 * voice assistants that control Spotify; Development Mode caps an app at 5
 * users). POST /auth/oauth/start refuses spotify as an unknown provider, the
 * login/callback routes are gone, and status/token answer only for the house
 * Web Playback SDK account. An old link can still be removed: GET
 * /spotify/unlink deletes the verified caller's, never an id named in the URL.
 *
 * Real HTTP through bindVerifiedIdentity, the REAL oauth-start and spotify
 * handlers and oauth-link-state. Mocked: Firebase token verification, the link
 * store, and the server-token service.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Old per-account Spotify links, keyed by uid: delete only.
const link = vi.hoisted(() => {
  const store = new Map<string, { access_token: string }>();
  return {
    store,
    removeTokens: vi.fn(async (id: string) => {
      store.delete(id);
    }),
  };
});
vi.mock('../../token/oauth/spotify.js', () => ({ removeTokens: link.removeTokens }));

// The server's own Spotify account (Web Playback SDK token).
vi.mock('../services/spotify.js', () => ({
  isConfigured: () => true,
  getRefreshToken: () => 'server-refresh',
  getAccessToken: async () => 'server-access-token',
  getTokenExpiry: () => 123,
  getConfig: () => ({ hasRefreshToken: true, hasWebDevice: false }),
}));

const { bindVerifiedIdentity } = await import('../request-identity.js');
const { handleOAuthStartRoute } = await import('../routes/oauth-start.js');
const { handleSpotifyRoutes } = await import('../routes/spotify.js');
const { setOAuthLinkStore } = await import('../../token/oauth-link-state.js');

let base = '';
let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (await handleOAuthStartRoute(req, res, url.pathname)) return;
      if (await handleSpotifyRoutes(req, res, url.pathname, url)) return;
      res.writeHead(404);
      res.end();
    })().catch((error: unknown) => {
      // A throwing handler answers 500 instead of leaving the request hanging.
      if (!res.headersSent) res.writeHead(500);
      res.end(String(error));
    });
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
  vi.clearAllMocks();
  setOAuthLinkStore(null);
  link.store.clear();
  vi.stubEnv('SPOTIFY_CLIENT_ID', 'sp-id');
  vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'sp-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function get(path: string, opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return fetch(`${base}${path}`, { headers, redirect: 'manual' });
}

function start(token: string, provider: string) {
  return fetch(`${base}/auth/oauth/start`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ provider, returnUrl: '/music' }),
  });
}

describe('POST /auth/oauth/start { provider: spotify }', () => {
  it('is not offered, even with Spotify app credentials set', async () => {
    const res = await start('tok-A', 'spotify');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown provider' });
    expect(res.headers.get('set-cookie')).toBeNull(); // no state was minted

    expect((await start('tok-A', 'whoop')).status).toBe(200); // other providers still start
  });
});

describe('the per-user connect routes are gone', () => {
  it('GET /spotify/login and /spotify/callback are not handled: no redirect, nothing saved', async () => {
    for (const path of [
      '/spotify/login?state=s',
      '/spotify/login?device_id=d1',
      '/spotify/callback?code=c1&state=s',
    ]) {
      const res = await get(path, { token: 'tok-A' });
      expect(res.status, path).toBe(404);
      expect(res.headers.get('location'), path).toBeNull();
    }
  });

  it("GET /spotify/token?device_id=… is the admin-only server token, never a user's", async () => {
    link.store.set('uid-A', { access_token: 'user-access' });
    const res = await get('/spotify/token?device_id=d1', { token: 'tok-A' });
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain('user-access');
    expect(body).not.toContain('server-access-token');
  });

  it('GET /spotify/status?device_id=… reports no per-user link and offers no connect', async () => {
    link.store.set('uid-A', { access_token: 'user-access' });
    const res = await get('/spotify/status?device_id=d1', { token: 'tok-A' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: true,
      has_refresh_token: true,
      has_web_device: false,
    });
  });
});

describe('GET /spotify/token (server Web Playback token)', () => {
  it('anonymous 401, signed-in non-admin 403, admin 200', async () => {
    expect((await get('/spotify/token')).status).toBe(401);

    const user = await get('/spotify/token', { token: 'tok-A' });
    expect(user.status).toBe(403);
    expect(await user.text()).not.toContain('server-access-token');

    const admin = await get('/spotify/token', { token: 'tok-admin' });
    expect(admin.status).toBe(200);
    expect(await admin.json()).toMatchObject({ token: 'server-access-token' });
  });
});

describe('GET /spotify/status', () => {
  it('the public SDK config status', async () => {
    const res = await get('/spotify/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: true,
      has_refresh_token: true,
      has_web_device: false,
    });
  });
});

describe('GET /spotify/unlink (delete only)', () => {
  it("anonymous 401; B naming A's id removes nothing of A's; A removes their own", async () => {
    link.store.set('uid-A', { access_token: 'user-access' });
    expect((await get('/spotify/unlink?device_id=uid-A')).status).toBe(401);
    expect((await get('/spotify/unlink?device_id=uid-A', { token: 'tok-B' })).status).toBe(200);
    expect(link.store.has('uid-A')).toBe(true);

    expect((await get('/spotify/unlink', { token: 'tok-A' })).status).toBe(200);
    expect(link.store.has('uid-A')).toBe(false);
    expect(link.removeTokens.mock.calls.map((c) => c[0])).toEqual(['uid-B', 'uid-A']);
  });
});
