/**
 * LinkedIn "Connect" goes through the bound OAuth flow.
 *
 * The web used to navigate the page to /api/linkedin/connect. A navigation
 * can't carry the Firebase Bearer token, so that route answered 401 and
 * LinkedIn could never be connected. Now the web's REAL connect code
 * (linkedin.service → oauth-connect.service → apiPost) asks POST
 * /auth/oauth/start with the token, gets a single-use state bound to the caller
 * and this browser, and only then navigates; the callback links LinkedIn to the
 * uid in the state it consumes.
 *
 * Real HTTP into the REAL handlers (bindVerifiedIdentity, oauth-start,
 * linkedin-routes, oauth-link-state). Mocked: Firebase token verification, the
 * web's Firebase session, LinkedIn's code exchange and token storage.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(process.env, {
  LINKEDIN_ENABLED: 'true',
  LINKEDIN_CLIENT_ID: 'li-id',
  LINKEDIN_CLIENT_SECRET: 'li-secret',
});

vi.mock('../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: {}, isAnonymous: false }
      : null
  ),
}));

const linkedin = vi.hoisted(() => ({
  exchangeLinkedInCode: vi.fn(async (_code: string, _redirect: string) => ({
    accessToken: 'li-access',
    refreshToken: 'li-refresh',
    expiresIn: 3600,
    scope: ['r_liteprofile'],
  })),
  connectLinkedIn: vi.fn(async (_uid: string, ..._rest: unknown[]) => true),
  connectedUids: [] as string[],
}));
vi.mock('../services/linkedin/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...linkedin,
  hasLinkedInConnected: (uid: string) => linkedin.connectedUids.includes(uid),
}));

// The web's Firebase session: signed in as uid-A with ID token tok-A.
const webAuth = vi.hoisted(() => ({ token: 'tok-A' as string | null }));
vi.mock('../../apps/web/src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => undefined),
  getAuthToken: vi.fn(async () => webAuth.token),
  getFirebaseUid: vi.fn(() => (webAuth.token ? `uid-${webAuth.token.slice(4)}` : null)),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('../../apps/web/src/ui/whisper.ui.js', () => ({ toast }));
// Translate through the real en-US bundle so the assertions check the words a user reads.
vi.mock('../../apps/web/src/i18n/index.js', async () => {
  const { default: en } = await import('../../apps/web/src/i18n/locales/en-US.json');
  const t = (key: string, params?: Record<string, unknown>): string => {
    const value = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (match, name: string) =>
      params?.[name] !== undefined ? String(params[name]) : match
    );
  };
  return { t, getLocale: () => 'en-US' };
});

const { bindVerifiedIdentity } = await import('../servers/api/request-identity.js');
const { handleOAuthStartRoute } = await import('../servers/api/routes/oauth-start.js');
const { handleLinkedInRoutes } = await import('../api/linkedin-routes.js');
const linkState = await import('../servers/token/oauth-link-state.js');
const { connectLinkedIn } = await import('../../apps/web/src/services/linkedin.service.js');

const realFetch = globalThis.fetch;
let base = '';
let server: Server;
/** The browser: its location and the one cookie the server sets. */
const browser = { href: '', cookie: '' };

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (await handleOAuthStartRoute(req, res, url.pathname)) return;
      if (await handleLinkedInRoutes(req, res, url.pathname, url)) return;
      res.writeHead(404);
      res.end();
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

/** A browser fetch: same-origin paths go to the test server with the cookie jar. */
async function browserFetch(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {}
) {
  const raw = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
  const url = raw.startsWith('/') ? `${base}${raw}` : raw;
  const headers = new globalThis.Headers(init.headers);
  if (browser.cookie) headers.set('cookie', browser.cookie);
  const res = await realFetch(url, { ...init, headers, redirect: 'manual' });
  const set = res.headers.get('set-cookie');
  if (set) browser.cookie = set.split(';')[0];
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  linkState.setOAuthLinkStore(null);
  webAuth.token = 'tok-A';
  linkedin.connectedUids.length = 0;
  browser.href = '';
  browser.cookie = '';
  process.env.LINKEDIN_ENABLED = 'true';
  process.env.LINKEDIN_CLIENT_ID = 'li-id';
  process.env.LINKEDIN_CLIENT_SECRET = 'li-secret';
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', {
    location: {
      origin: base,
      get href() {
        return browser.href;
      },
      set href(v: string) {
        browser.href = v;
      },
    },
  });
  vi.stubGlobal('fetch', browserFetch);
});

/** Press "Connect" in the web app, then follow the navigation it made. */
async function pressConnect() {
  await connectLinkedIn();
  const nav = browser.href;
  const login = nav ? await browserFetch(nav) : null;
  return { nav, login };
}

const stateOf = (location: string | null) =>
  new URL(location ?? '/', 'http://x').searchParams.get('state') ?? '';

const callback = (query: string, cookie = browser.cookie) =>
  realFetch(`${base}/api/linkedin/callback?${query}`, {
    headers: { cookie },
    redirect: 'manual',
  });

describe('web Connect → POST /auth/oauth/start → /api/linkedin/connect', () => {
  it('ends at LinkedIn with a state bound to the signed-in caller', async () => {
    const { nav, login } = await pressConnect();

    // The old bare navigation to /api/linkedin/connect got 401 here.
    expect(login?.status).toBe(302);
    expect(nav).toMatch(/^\/api\/linkedin\/connect\?state=[\w-]{43}$/);
    expect(nav).not.toMatch(/user_?id/i);
    const authorize = new URL(login?.headers.get('location') ?? 'x:/');
    expect(authorize.origin + authorize.pathname).toBe(
      'https://www.linkedin.com/oauth/v2/authorization'
    );
    expect(authorize.searchParams.get('client_id')).toBe('li-id');
    expect(authorize.searchParams.get('redirect_uri')).toMatch(/\/api\/linkedin\/callback$/);

    const state = authorize.searchParams.get('state');
    expect(state).toBe(stateOf(nav));
    const record = await linkState.peekOAuthLinkState(state, 'linkedin');
    expect(record?.uid).toBe('uid-A');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a navigation without a start-issued state gets 401 and binds nothing', async () => {
    const puts = vi.fn(async () => true);
    linkState.setOAuthLinkStore({ put: puts, get: async () => null, take: async () => null });
    for (const q of ['', '?user_id=victim', '?userId=victim&state=forged']) {
      const res = await realFetch(`${base}/api/linkedin/connect${q}`, { redirect: 'manual' });
      expect(res.status, q).toBe(401);
    }
    expect(puts).not.toHaveBeenCalled();
  });

  it('already connected: the status call carries the token and nothing restarts', async () => {
    // The old bare fetch('/api/linkedin/status') had no Bearer, got 401, and
    // the web went on as if LinkedIn were not connected.
    linkedin.connectedUids.push('uid-A');
    const { nav } = await pressConnect();
    expect(toast.info).toHaveBeenCalledWith('LinkedIn already connected!');
    expect(nav).toBe('');
  });

  it('signed out: the start refuses, nothing navigates, the user is told', async () => {
    webAuth.token = null;
    const { nav } = await pressConnect();
    expect(nav).toBe('');
    expect(toast.error).toHaveBeenCalledWith('Sign in first, then connect');
  });
});

describe('LinkedIn credentials not configured', () => {
  it('the start answers honestly and the web shows it, without navigating', async () => {
    delete process.env.LINKEDIN_CLIENT_SECRET;

    const res = await realFetch(`${base}/auth/oauth/start`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok-A', 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'linkedin' }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "LinkedIn isn't available right now",
      unavailable: true,
    });

    const { nav } = await pressConnect();
    expect(nav).toBe('');
    expect(toast.error).toHaveBeenCalledWith("LinkedIn isn't available right now");
  });
});

describe('GET /api/linkedin/callback', () => {
  it('stores tokens for the bound uid only, whatever the URL names', async () => {
    const { login } = await pressConnect();
    const state = stateOf(login?.headers.get('location') ?? null);

    const cb = await callback(`code=c1&state=${state}&user_id=victim&userId=victim`);

    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toBe('/settings?linkedin=connected');
    expect(linkedin.connectLinkedIn).toHaveBeenCalledTimes(1);
    expect(linkedin.connectLinkedIn.mock.calls[0][0]).toBe('uid-A');
    expect(linkedin.exchangeLinkedInCode.mock.calls[0][1]).toMatch(/\/api\/linkedin\/callback$/);
  });

  it('refuses forged, reused, other-browser, expired and other-provider states', async () => {
    const refused = async (query: string, cookie?: string) => {
      const cb = await callback(query, cookie);
      expect(cb.headers.get('location'), query).toBe('/settings?linkedin=error');
    };

    // Forged: never issued, or "encodes" a victim.
    await refused('code=c&state=never-issued');
    await refused(`code=c&state=${Buffer.from('{"userId":"victim"}').toString('base64')}`);

    // Reused: the first use links, the second is refused.
    const first = await pressConnect();
    const reused = stateOf(first.login?.headers.get('location') ?? null);
    await callback(`code=c&state=${reused}`);
    await refused(`code=c&state=${reused}`);

    // Another user's state, completed in a different browser.
    webAuth.token = 'tok-B';
    browser.cookie = '';
    const other = await pressConnect();
    const otherState = stateOf(other.login?.headers.get('location') ?? null);
    await refused(`code=c&state=${otherState}`, 'attacker=1');

    // Expired after 10 minutes.
    webAuth.token = 'tok-A';
    const late = await pressConnect();
    const lateState = stateOf(late.login?.headers.get('location') ?? null);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);
    await refused(`code=c&state=${lateState}`);
    nowSpy.mockRestore();

    // A state started for another provider.
    const fitbit = await realFetch(`${base}/auth/oauth/start`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer tok-A',
        'content-type': 'application/json',
        cookie: browser.cookie,
      },
      body: JSON.stringify({ provider: 'fitbit' }),
    });
    expect(fitbit.status).toBe(200);
    const fitbitState = stateOf(((await fitbit.json()) as { url: string }).url);
    await refused(`code=c&state=${fitbitState}`);

    // Only the one legitimate first use ever linked anything.
    expect(linkedin.connectLinkedIn.mock.calls.map((c) => c[0])).toEqual(['uid-A']);
  });
});
