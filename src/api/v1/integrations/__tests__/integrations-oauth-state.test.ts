/**
 * The v1 integrations OAuth callbacks (biometrics, calendar) are unauthenticated
 * and used to take the user from an unsigned base64 state ({"userId": ...}), so
 * a request with a forged state and the attacker's own code linked the
 * attacker's provider account into any user's Ferni account. The state is now
 * an opaque server-side record bound to the verified caller and browser.
 *
 * Real HTTP through the REAL handler and auth middleware; mocked: Firebase token
 * verification, the provider code exchange and token storage.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null
  ),
}));

const biometrics = vi.hoisted(() => ({
  getAuthorizationUrl: vi.fn(
    (p: string, _uid: string, state?: string) => `https://${p}.example/auth?state=${state}`
  ),
  exchangeCodeForTokens: vi.fn(async (_p: string, _code: string, _uid: string) => true),
  syncBiometrics: vi.fn(async () => null),
}));
vi.mock('../../../../services/biometrics/index.js', () => biometrics);

const calendar = vi.hoisted(() => ({
  getCalendarAuthUrl: vi.fn((state: string) => `https://accounts.example/auth?state=${state}`),
  fetchUpcomingEvents: vi.fn(async () => []),
  exchangeCodeForTokens: vi.fn(async () => ({ access_token: 'x' })),
  storeUserTokens: vi.fn(async (_uid: string, _tokens: unknown) => undefined),
}));
vi.mock('../../../../services/context-awareness/location-calendar.js', () => calendar);
vi.mock('../../../../services/identity/google-calendar-oauth.js', () => calendar);

const { handleIntegrationsRoutes } = await import('../handler.js');
const { setOAuthLinkStore } = await import('../../../../servers/token/oauth-link-state.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleIntegrationsRoutes(req, res, url.pathname, url);
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
});

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/v1/integrations${path}`, { headers, redirect: 'manual' });

async function connect(path: string) {
  const res = await get(`${path}?userId=victim`, { authorization: 'Bearer tok-A' });
  expect(res.status).toBe(200);
  const { authUrl } = (await res.json()) as { authUrl: string };
  const state = new URL(authUrl).searchParams.get('state') ?? '';
  return { state, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
}

const forged = Buffer.from(JSON.stringify({ userId: 'victim' })).toString('base64');

describe.each([
  {
    name: 'biometrics (oura)',
    connectPath: '/biometrics/connect/oura',
    callbackPath: '/biometrics/callback/oura',
    otherCallback: '/biometrics/callback/whoop',
    savedFor: () => biometrics.exchangeCodeForTokens.mock.calls.map((c) => c[2]),
  },
  {
    name: 'calendar',
    connectPath: '/calendar/connect',
    callbackPath: '/calendar/callback',
    otherCallback: '/biometrics/callback/oura',
    savedFor: () => calendar.storeUserTokens.mock.calls.map((c) => c[0]),
  },
])('$name OAuth state', ({ connectPath, callbackPath, otherCallback, savedFor }) => {
  const callback = (path: string, state: string, cookie = '') =>
    get(`${path}?code=c&state=${encodeURIComponent(state)}`, { cookie });

  it('a forged base64 state naming another user saves nothing', async () => {
    const res = await callback(callbackPath, forged);
    expect(res.status).toBe(400);
    expect(savedFor()).toEqual([]);
  });

  it('the state carries no user id, and the legit flow saves under the verified caller only', async () => {
    const { state, cookie } = await connect(connectPath);
    expect(Buffer.from(state, 'base64').toString()).not.toContain('uid-A');
    const res = await callback(callbackPath, state, cookie);
    expect(res.status).toBe(302);
    expect(savedFor()).toEqual(['uid-A']);
  });

  it('reused, wrong-browser and wrong-flow states save nothing', async () => {
    const a = await connect(connectPath);
    expect((await callback(callbackPath, a.state, 'other=1')).status).toBe(400);
    const b = await connect(connectPath);
    expect((await callback(otherCallback, b.state, b.cookie)).status).toBe(400);
    const c = await connect(connectPath);
    await callback(callbackPath, c.state, c.cookie);
    expect((await callback(callbackPath, c.state, c.cookie)).status).toBe(400);
    expect(savedFor()).toEqual(['uid-A']);
  });
});
