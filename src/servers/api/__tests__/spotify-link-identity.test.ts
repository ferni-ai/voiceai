/**
 * Spotify connect and token routes act for the verified caller only.
 *
 * GET /spotify/login?device_id=X redirected anyone to Spotify and saved the
 * resulting tokens under X; GET /spotify/token?device_id=X handed X's access
 * token to anyone; GET /spotify/token (no device_id) handed out the server's
 * own Spotify token; /spotify/status and /spotify/unlink read or removed any
 * device's link. Now a link starts at POST /auth/oauth/start (Bearer token),
 * is saved under the uid in the state record the callback consumes, and the
 * read/unlink routes use the verified caller, never an id from the URL.
 *
 * Real HTTP through bindVerifiedIdentity, the REAL oauth-start and spotify
 * handlers and oauth-link-state. Mocked: Firebase token verification, Spotify's
 * code exchange and token storage, and the server-token service.
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

// Per-account Spotify links, keyed by whatever id the route passes in.
const link = vi.hoisted(() => {
  const store = new Map<string, { access_token: string; expires_at: number }>();
  return {
    store,
    configured: true,
    saveTokens: vi.fn(async (id: string, tokens: { access_token: string; expires_at: number }) => {
      store.set(id, tokens);
    }),
    removeTokens: vi.fn(async (id: string) => {
      store.delete(id);
    }),
  };
});
vi.mock('../../token/oauth/spotify.js', () => ({
  isConfigured: () => link.configured,
  buildAuthUrl: (state: string) => `https://accounts.spotify.com/authorize?state=${state}`,
  exchangeCode: vi.fn(async (code: string) => ({
    access_token: `access-for-${code}`,
    refresh_token: 'r',
    expires_at: Date.now() + 3_600_000,
  })),
  saveTokens: link.saveTokens,
  removeTokens: link.removeTokens,
  getTokens: async (id: string) => link.store.get(id) ?? null,
  getValidToken: async (id: string) => link.store.get(id)?.access_token ?? null,
}));

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
  setOAuthLinkStore(null);
  link.store.clear();
  link.configured = true;
  vi.stubEnv('SPOTIFY_CLIENT_ID', 'sp-id');
  vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'sp-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function get(path: string, opts: { token?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  return fetch(`${base}${path}`, { headers, redirect: 'manual' });
}

/** Run POST /auth/oauth/start + the login hop as `token`; returns state and cookie. */
async function startLink(token: string, returnUrl = '/music') {
  const start = await fetch(`${base}/auth/oauth/start`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'spotify', returnUrl }),
  });
  expect(start.status).toBe(200);
  const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0];
  const { url } = (await start.json()) as { url: string };
  const login = await get(url, { cookie });
  const location = login.headers.get('location') ?? '';
  return { url, login, location, cookie, state: new URL(location, base).searchParams.get('state') };
}

async function linkAs(token: string, code = 'c1') {
  const { state, cookie } = await startLink(token);
  const cb = await get(`/spotify/callback?code=${code}&state=${state}`, { cookie });
  expect(cb.headers.get('location')).toBe('/music?spotify_linked=true');
}

describe('GET /spotify/login', () => {
  it('without a start-issued state: 401 and no redirect to Spotify', async () => {
    for (const q of ['', '?device_id=victim', '?device_id=victim&state=forged']) {
      const res = await get(`/spotify/login${q}`);
      expect(res.status, q).toBe(401);
      expect(res.headers.get('location'), q).toBeNull();
    }
  });

  it('a state minted for another provider is refused', async () => {
    const start = await fetch(`${base}/auth/oauth/start`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok-A', 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'fitbit' }),
    });
    expect(start.status).toBe(200);
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url, base).searchParams.get('state') ?? '';
    expect((await get(`/spotify/login?state=${state}`)).status).toBe(401);
  });

  it('503 when Spotify is not configured, at the start and at login', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', '');
    const start = await fetch(`${base}/auth/oauth/start`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok-A', 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'spotify' }),
    });
    expect(start.status).toBe(503);
    expect(await start.json()).toEqual({
      error: "Spotify isn't available right now",
      unavailable: true,
    });

    link.configured = false;
    expect((await get('/spotify/login?device_id=d1')).status).toBe(503);
  });

  it('with a bound state: redirects to Spotify carrying that state', async () => {
    const { url, login, location, state } = await startLink('tok-A');
    expect(url).toMatch(/^\/spotify\/login\?state=[\w-]{43}$/);
    expect(login.status).toBe(302);
    expect(location.startsWith('https://accounts.spotify.com/authorize')).toBe(true);
    expect(state).toBe(new URL(url, base).searchParams.get('state'));
  });
});

describe('GET /spotify/callback', () => {
  it('saves tokens under the bound uid, whatever the URL names', async () => {
    const { state, cookie } = await startLink('tok-A');
    const cb = await get(`/spotify/callback?code=c1&state=${state}&device_id=victim`, { cookie });
    expect(cb.headers.get('location')).toBe('/music?spotify_linked=true');
    expect(link.saveTokens.mock.calls.map((c) => c[0])).toEqual(['uid-A']);
  });

  it('refuses forged, reused and other-browser states', async () => {
    const forged = await get('/spotify/callback?code=c&state=never-issued');
    expect(forged.headers.get('location')).toBe('/?spotify_error=invalid_state');

    const { state, cookie } = await startLink('tok-A');
    await get(`/spotify/callback?code=c&state=${state}`, { cookie });
    const reused = await get(`/spotify/callback?code=c&state=${state}`, { cookie });
    expect(reused.headers.get('location')).toBe('/?spotify_error=invalid_state');

    const other = await startLink('tok-B');
    const elsewhere = await get(`/spotify/callback?code=c&state=${other.state}`, {
      cookie: '__session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(elsewhere.headers.get('location')).toBe('/?spotify_error=invalid_state');

    expect(link.saveTokens.mock.calls.map((c) => c[0])).toEqual(['uid-A']);
  });
});

describe('GET /spotify/token?device_id=…', () => {
  it('anonymous: 401, even for a linked id', async () => {
    await linkAs('tok-A');
    for (const id of ['d1', 'uid-A']) {
      const res = await get(`/spotify/token?device_id=${id}`);
      expect(res.status, id).toBe(401);
      expect(await res.text()).not.toContain('access-for');
    }
  });

  it("returns the caller's own token; B cannot read A's by naming it", async () => {
    await linkAs('tok-A', 'a-code');

    const mine = await get('/spotify/token?device_id=d1', { token: 'tok-A' });
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ linked: true, access_token: 'access-for-a-code' });

    const theirs = await get('/spotify/token?device_id=uid-A', { token: 'tok-B' });
    expect(theirs.status).toBe(404);
    expect(await theirs.text()).not.toContain('access-for-a-code');
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

describe('GET /spotify/status?device_id=…', () => {
  it('anonymous 401; each caller sees only their own link', async () => {
    await linkAs('tok-A');
    expect((await get('/spotify/status?device_id=uid-A')).status).toBe(401);

    const a = await get('/spotify/status?device_id=d1', { token: 'tok-A' });
    expect(await a.json()).toMatchObject({ spotify_configured: true, linked: true });

    const b = await get('/spotify/status?device_id=uid-A', { token: 'tok-B' });
    expect(await b.json()).toMatchObject({ linked: false });
  });

  it('without device_id: still the public SDK config status', async () => {
    const res = await get('/spotify/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: true,
      has_refresh_token: true,
      has_web_device: false,
    });
  });
});

describe('GET /spotify/unlink', () => {
  it("anonymous 401; B naming A's id removes nothing of A's", async () => {
    await linkAs('tok-A');
    expect((await get('/spotify/unlink?device_id=uid-A')).status).toBe(401);
    expect((await get('/spotify/unlink?device_id=uid-A', { token: 'tok-B' })).status).toBe(200);
    expect(link.store.has('uid-A')).toBe(true);

    expect((await get('/spotify/unlink?device_id=d1', { token: 'tok-A' })).status).toBe(200);
    expect(link.store.has('uid-A')).toBe(false);
  });
});
