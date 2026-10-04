/**
 * OAuth "connect account" flows link provider tokens to the verified caller only.
 *
 * The login routes took ?user_id= / ?userId= from the navigation and the Apple
 * callback trusted a base64 state, so anyone could link their own Google,
 * Outlook, Apple or wearable account into someone else's Ferni account (or send
 * a victim a link naming the attacker). Now a flow starts at POST
 * /auth/oauth/start (Bearer token), and callbacks take the user only from the
 * stored state they consume.
 *
 * Real HTTP requests go through bindVerifiedIdentity and the REAL route
 * handlers. Mocked: Firebase token verification, the provider token exchange
 * (fetch / provider module) and token storage.
 */
import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(process.env, {
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret',
  MICROSOFT_CLIENT_ID: 'm-id',
  MICROSOFT_CLIENT_SECRET: 'm-secret',
  APPLE_CLIENT_ID: 'a-id',
  APPLE_TEAM_ID: 'a-team',
  APPLE_KEY_ID: 'a-key',
  APPLE_PRIVATE_KEY: generateKeyPairSync('ec', { namedCurve: 'P-256' })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString(),
});

vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: {}, isAnonymous: false }
      : null
  ),
}));

const saved = vi.hoisted(() => ({
  google: vi.fn(async (_uid: string, _tokens: unknown) => undefined),
  outlook: vi.fn(async (_uid: string, _code: string, _redirect: string) => true),
  apple: [] as string[],
  wearable: vi.fn(async (_provider: string, _uid: string, _tokens: unknown) => undefined),
}));
vi.mock('../../token/oauth/google-calendar.js', () => ({ saveTokens: saved.google }));
vi.mock('../../../services/calendar/webhooks/google-webhook.js', () => ({
  createWatchChannel: vi.fn(async () => null),
  stopAllUserChannels: vi.fn(async () => undefined),
}));
vi.mock('../../../services/calendar/providers/outlook-provider.js', () => ({
  outlookCalendarProvider: { handleAuthCallback: saved.outlook },
}));
// Apple's token storage is Firestore (apple_calendar_tokens/<uid>).
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return { doc: (id: string) => ({ set: async () => void saved.apple.push(id) }) };
    }
  },
}));
vi.mock('../../token/oauth/wearables.js', () => ({
  isProviderConfigured: () => true,
  buildAuthUrl: (p: string, state: string) => `https://${p}.example/authorize?state=${state}`,
  exchangeCode: vi.fn(async () => ({ access_token: 'w', refresh_token: 'r', expires_at: 1 })),
  saveTokens: saved.wearable,
}));

const { bindVerifiedIdentity } = await import('../request-identity.js');
const { handleOAuthStartRoute } = await import('../routes/oauth-start.js');
const { handleGoogleCalendarRoutes } = await import('../routes/google-calendar.js');
const { handleAppleCalendarRoutes } = await import('../routes/apple-calendar.js');
const { handleMicrosoftCalendarRoutes } = await import('../routes/microsoft-calendar.js');
const { handleWearablesRoutes } = await import('../routes/wearables.js');
const { setOAuthLinkStore } = await import('../../token/oauth-link-state.js');

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64');
const realFetch = globalThis.fetch;
let base = '';
let server: Server;

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new globalThis.Response(
        JSON.stringify({ access_token: 'g', expires_in: 3600, scope: 's' })
      );
    }
    if (url.startsWith('https://appleid.apple.com/auth/token')) {
      const idToken = `h.${Buffer.from(JSON.stringify({ sub: 'apple-sub' })).toString('base64')}.s`;
      return new globalThis.Response(
        JSON.stringify({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
          id_token: idToken,
        })
      );
    }
    return realFetch(input, init);
  });
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      const p = url.pathname;
      if (await handleOAuthStartRoute(req, res, p)) return;
      if (await handleGoogleCalendarRoutes(req, res, p, url)) return;
      if (await handleAppleCalendarRoutes(req, res, p, url)) return;
      if (await handleMicrosoftCalendarRoutes(req, res, p, url)) return;
      if (await handleWearablesRoutes(req, res, p, url)) return;
      res.writeHead(404);
      res.end();
    })();
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
  setOAuthLinkStore(null);
  saved.google.mockClear();
  saved.outlook.mockClear();
  saved.wearable.mockClear();
  saved.apple.length = 0;
});

const send = (path: string, init: Parameters<typeof fetch>[1] = {}) =>
  realFetch(`${base}${path}`, { redirect: 'manual', ...init });

async function start(provider: string, token = 'tok-A', body: object = {}) {
  const res = await send('/auth/oauth/start', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ provider, ...body }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const json = res.ok ? ((await res.json()) as { url: string }) : null;
  return { status: res.status, url: json?.url ?? '', cookie };
}

interface Flow {
  provider: string;
  loginPath: string;
  callback: (state: string, cookie?: string) => ReturnType<typeof fetch>;
  savedFor: () => string[];
}

const getCallback =
  (path: string) =>
  (state: string, cookie = '') =>
    send(`${path}?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie } });

const FLOWS: Flow[] = [
  {
    provider: 'google_calendar',
    loginPath: '/auth/google/login',
    callback: getCallback('/auth/google/callback'),
    savedFor: () => saved.google.mock.calls.map((c) => c[0]),
  },
  {
    provider: 'microsoft_calendar',
    loginPath: '/auth/microsoft/login',
    callback: getCallback('/auth/microsoft/callback'),
    savedFor: () => saved.outlook.mock.calls.map((c) => c[0]),
  },
  {
    provider: 'apple_calendar',
    loginPath: '/auth/apple/login',
    callback: (state, cookie = '') =>
      send('/auth/apple/callback', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: 'c', state }).toString(),
      }),
    savedFor: () => [...saved.apple],
  },
  ...['fitbit', 'oura', 'garmin', 'whoop'].map((p) => ({
    provider: p,
    loginPath: `/wearables/${p}/login`,
    callback: getCallback(`/wearables/${p}/callback`),
    savedFor: () => saved.wearable.mock.calls.filter((c) => c[0] === p).map((c) => c[1]),
  })),
];

const isRefusal = (res: Awaited<ReturnType<typeof fetch>>) =>
  res.status >= 400 || /error|invalid/.test(res.headers.get('location') ?? '');

/** start → login → the state the login sends to the provider. */
async function startAndLogin(flow: Flow, token = 'tok-A') {
  const s = await start(flow.provider, token, { userId: 'victim', user_id: 'victim' });
  expect(s.status).toBe(200);
  expect(s.url.startsWith(`${flow.loginPath}?state=`)).toBe(true);
  const login = await send(s.url, { headers: { cookie: s.cookie } });
  expect(login.status).toBe(302);
  const state = new URL(login.headers.get('location') ?? '').searchParams.get('state') ?? '';
  return { state, cookie: s.cookie };
}

describe.each(FLOWS)('$provider connect flow', (flow) => {
  it('links the provider account to the verified starter only (start → login → callback)', async () => {
    const { state, cookie } = await startAndLogin(flow);
    const cb = await flow.callback(state, cookie);
    expect(cb.status).toBe(302);
    expect(isRefusal(cb)).toBe(false);
    expect(flow.savedFor()).toEqual(['uid-A']);
  });

  it('refuses a login that names a user but carries no valid state', async () => {
    for (const q of ['user_id=victim', 'userId=victim', 'user_id=victim&state=forged']) {
      const res = await send(`${flow.loginPath}?${q}`);
      expect(res.status, q).toBe(401);
    }
  });

  it('a login naming another user can never end with tokens saved under them', async () => {
    const login = await send(`${flow.loginPath}?user_id=victim&userId=victim`);
    const state = new URL(login.headers.get('location') ?? 'x:/').searchParams.get('state') ?? '';
    await flow.callback(state);
    expect(flow.savedFor()).toEqual([]);
  });

  it('a forged state that encodes another user saves nothing', async () => {
    for (const forged of [b64({ userId: 'victim' }), b64({ user_id: 'victim' }), 'victim']) {
      const cb = await flow.callback(forged);
      expect(isRefusal(cb)).toBe(true);
    }
    expect(flow.savedFor()).toEqual([]);
  });

  it('unknown, expired, reused, wrong-browser and wrong-provider states save nothing', async () => {
    expect(isRefusal(await flow.callback('never-issued-state'))).toBe(true);

    const expired = await startAndLogin(flow);
    const later = Date.now() + 11 * 60 * 1000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(later);
    expect(isRefusal(await flow.callback(expired.state, expired.cookie))).toBe(true);
    nowSpy.mockRestore();

    const other = await startAndLogin(flow);
    expect(isRefusal(await flow.callback(other.state, 'other-browser=1'))).toBe(true);

    const wrong = await start(flow.provider === 'google_calendar' ? 'oura' : 'google_calendar');
    const wrongState = new URL(wrong.url, 'http://x').searchParams.get('state') ?? '';
    expect(isRefusal(await flow.callback(wrongState, wrong.cookie))).toBe(true);
    expect(flow.savedFor()).toEqual([]);

    const ok = await startAndLogin(flow);
    await flow.callback(ok.state, ok.cookie);
    expect(isRefusal(await flow.callback(ok.state, ok.cookie))).toBe(true);
    expect(flow.savedFor()).toEqual(['uid-A']);
  });
});

describe('POST /auth/oauth/start', () => {
  it('requires a verified caller', async () => {
    const res = await send('/auth/oauth/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google_calendar', userId: 'victim' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects unknown providers, including prototype keys', async () => {
    for (const provider of ['dropbox', 'constructor', '__proto__']) {
      expect((await start(provider)).status, provider).toBe(400);
    }
  });

  it('binds each state to whoever started it', async () => {
    const flow = FLOWS[0];
    const b = await startAndLogin(flow, 'tok-B');
    await flow.callback(b.state, b.cookie);
    expect(flow.savedFor()).toEqual(['uid-B']);
  });
});
