/**
 * LinkedIn is switched off until its app credentials exist (LINKEDIN_ENABLED).
 *
 * With the switch off, /api/linkedin/* and POST /auth/oauth/start must say
 * "unavailable" and never build a LinkedIn URL or call the LinkedIn service.
 * With LINKEDIN_ENABLED=true plus credentials, today's behaviour is unchanged.
 *
 * Real HTTP through bindVerifiedIdentity, the REAL linkedin-routes and
 * oauth-start handlers. Mocked: Firebase token verification, and the LinkedIn
 * service's I/O (code exchange, token storage, profile sync). The LinkedIn
 * authorize-URL builder is the real one, wrapped in a spy.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: {}, isAnonymous: false }
      : null
  ),
}));

const li = vi.hoisted(() => ({
  getLinkedInAuthUrl: vi.fn(),
  exchangeLinkedInCode: vi.fn(async () => null),
  connectLinkedIn: vi.fn(async () => true),
  disconnectLinkedIn: vi.fn(async () => undefined),
  syncLinkedInData: vi.fn(async () => undefined),
}));
vi.mock('../../services/linkedin/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/linkedin/index.js')>();
  li.getLinkedInAuthUrl.mockImplementation(actual.getLinkedInAuthUrl);
  return { ...actual, ...li };
});

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { handleLinkedInRoutes } = await import('../linkedin-routes.js');
const { handleOAuthStartRoute } = await import('../../servers/api/routes/oauth-start.js');
const { setOAuthLinkStore } = await import('../../servers/token/oauth-link-state.js');
const { isLinkedInEnabled } = await import('../../config/linkedin-flag.js');

let base = '';
let server: Server;

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
  for (const fn of Object.values(li)) fn.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

function send(path: string, method = 'GET', token: string | null = 'tok-A', body?: object) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${base}${path}`, {
    method,
    headers,
    redirect: 'manual',
    body: body ? JSON.stringify(body) : undefined,
  });
}

function switchOff(): void {
  // Credentials present but the switch not set: still off.
  vi.stubEnv('LINKEDIN_ENABLED', '');
  vi.stubEnv('LINKEDIN_CLIENT_ID', 'li-id');
  vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'li-secret');
}

function switchOn(): void {
  vi.stubEnv('LINKEDIN_ENABLED', 'true');
  vi.stubEnv('LINKEDIN_CLIENT_ID', 'li-id');
  vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'li-secret');
}

describe('isLinkedInEnabled', () => {
  it('is on only with LINKEDIN_ENABLED=true and both credentials', () => {
    switchOn();
    expect(isLinkedInEnabled()).toBe(true);
    vi.stubEnv('LINKEDIN_ENABLED', '1');
    expect(isLinkedInEnabled()).toBe(false);
    vi.stubEnv('LINKEDIN_ENABLED', 'true');
    vi.stubEnv('LINKEDIN_CLIENT_SECRET', '');
    expect(isLinkedInEnabled()).toBe(false);
    switchOff();
    expect(isLinkedInEnabled()).toBe(false);
  });
});

describe('LinkedIn switched off', () => {
  beforeEach(switchOff);

  it('status reports connected:false, available:false in the existing shape', async () => {
    const res = await send('/api/linkedin/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      connected: false,
      available: false,
      profile: null,
      upcomingMilestones: [],
    });
  });

  it('status, connect, sync and disconnect still need auth', async () => {
    expect((await send('/api/linkedin/status', 'GET', null)).status).toBe(401);
    expect((await send('/api/linkedin/connect', 'GET', null)).status).toBe(401);
    expect((await send('/api/linkedin/sync', 'POST', null)).status).toBe(401);
    expect((await send('/api/linkedin/disconnect', 'POST', null)).status).toBe(401);
    expect((await send('/auth/oauth/start', 'POST', null, { provider: 'linkedin' })).status).toBe(
      401
    );
  });

  it('connect redirects to ?linkedin=unavailable and never builds a LinkedIn URL', async () => {
    const res = await send('/api/linkedin/connect');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/settings?linkedin=unavailable');
    expect(li.getLinkedInAuthUrl).not.toHaveBeenCalled();
  });

  it('POST /auth/oauth/start refuses linkedin with 503 and no URL', async () => {
    const res = await send('/auth/oauth/start', 'POST', 'tok-A', { provider: 'linkedin' });
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "LinkedIn isn't available right now", unavailable: true });
    expect(JSON.stringify(body)).not.toMatch(/linkedin\.com|\/api\/linkedin/);
    expect(li.getLinkedInAuthUrl).not.toHaveBeenCalled();
  });

  it('sync and disconnect return 503 unavailable without touching LinkedIn', async () => {
    for (const path of ['/api/linkedin/sync', '/api/linkedin/disconnect']) {
      const res = await send(path, 'POST');
      expect(res.status, path).toBe(503);
      expect(await res.json()).toEqual({ error: 'unavailable', available: false });
    }
    expect(li.syncLinkedInData).not.toHaveBeenCalled();
    expect(li.disconnectLinkedIn).not.toHaveBeenCalled();
  });

  it('the callback refuses: no code exchange, no stored connection', async () => {
    const res = await send('/api/linkedin/callback?code=c1&state=s1', 'GET', null);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/settings?linkedin=unavailable');
    expect(li.exchangeLinkedInCode).not.toHaveBeenCalled();
    expect(li.connectLinkedIn).not.toHaveBeenCalled();
  });

  it('stays off with LINKEDIN_ENABLED=true but no credentials', async () => {
    vi.stubEnv('LINKEDIN_ENABLED', 'true');
    vi.stubEnv('LINKEDIN_CLIENT_ID', '');
    const res = await send('/api/linkedin/connect');
    expect(res.headers.get('location')).toBe('/settings?linkedin=unavailable');
    expect(li.getLinkedInAuthUrl).not.toHaveBeenCalled();
  });
});

describe('LinkedIn switched on (LINKEDIN_ENABLED=true + credentials): unchanged', () => {
  beforeEach(switchOn);

  it('status keeps its original shape (no available field)', async () => {
    const res = await send('/api/linkedin/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: false, profile: null, upcomingMilestones: [] });
  });

  it('connect redirects to the LinkedIn authorize URL', async () => {
    const res = await send('/api/linkedin/connect');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe(
      'https://www.linkedin.com/oauth/v2/authorization'
    );
    expect(location.searchParams.get('client_id')).toBe('li-id');
    expect(li.getLinkedInAuthUrl).toHaveBeenCalledTimes(1);
  });

  it('sync answers "not connected" and disconnect reaches the service', async () => {
    const sync = await send('/api/linkedin/sync', 'POST');
    expect(sync.status).toBe(400);
    expect(await sync.json()).toEqual({ error: 'LinkedIn not connected' });

    const disconnect = await send('/api/linkedin/disconnect', 'POST');
    expect(disconnect.status).toBe(200);
    expect(li.disconnectLinkedIn).toHaveBeenCalledWith('uid-A');
  });

  it('the callback goes through its usual state check', async () => {
    const res = await send('/api/linkedin/callback?code=c1&state=bogus', 'GET', null);
    expect(res.headers.get('location')).toBe('/settings?linkedin=error');
  });

  it('POST /auth/oauth/start treats linkedin as before (not a known provider here)', async () => {
    const res = await send('/auth/oauth/start', 'POST', 'tok-A', { provider: 'linkedin' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown provider' });
  });
});
