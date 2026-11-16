/**
 * The agent health server denies by default: only the probes in public-routes.ts
 * answer without an admin.
 *
 * An independent verify of #3738 got a user id from /api/metrics and
 * /api/metrics/sessions with no credentials, and the crash routes were open as
 * well. Every route except the public probes now goes through requireAdmin: no
 * or a bad credential is 401, a verified non-admin 403, and neither body carries
 * any data. The route list comes from the router's own source, so a route added
 * later is checked without editing this file.
 *
 * The REAL health server (port 0) and the REAL metrics stores; only the
 * Firebase token verifier is mocked. No admin API key or dev key is configured,
 * as in production. Fictional data only.
 */
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const TOK_ADMIN = 'jwtAdmin.payload.sig';
const TOK_USER = 'jwtUser.payload.sig';
const TOK_UNCHECKABLE = 'jwtUncheckable.payload.sig';
const verifyFirebaseToken = vi.fn(async (token: string) => {
  if (token === TOK_ADMIN) return { uid: 'admin-1', claims: { admin: true }, isAnonymous: false };
  if (token === TOK_USER) return { uid: 'user-riley', claims: {}, isAnonymous: false };
  if (token === TOK_UNCHECKABLE) throw new Error('auth backend not configured');
  return null;
});
vi.mock('../../../services/identity/firebase-auth.js', () => ({ verifyFirebaseToken }));

delete process.env['ADMIN_API_KEYS'];
delete process.env['ADMIN_KEY'];

const { startHealthCheckServer } = await import('../health-server.js');
const { isPublicRoute } = await import('../public-routes.js');
const { persistenceMetrics } = await import('../../../services/analytics/persistence-metrics.js');
const { startSessionMetrics } = await import('../session-metrics.js');
const readiness = await import('../worker-readiness.js');

const SESSION = 'sess-diag-sam-0142';
const USER = 'user-sam-rivera-0142';
const MARKERS = [SESSION, USER, 'sam-rivera'];

const PUBLIC = ['/', '/health', '/health/ready', '/health/warmup', '/api/warmup'];

/** Every path the router or a handler matches (`url === '…'` / `url.startsWith('…')`). */
function routesIn(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/url(?:\.startsWith\(|\s*===\s*)'(\/[^'?]*)/g)) {
    found.add(match[1] ?? '');
  }
  return [...found].sort();
}

const SOURCE = readFileSync(new URL('../health-server.ts', import.meta.url), 'utf8');
const ROUTES = routesIn(SOURCE);
const GATED = ROUTES.filter((route) => !PUBLIC.includes(route));

/** Gated routes that serve an admin 200 with plain GETs, with the variants the router serves. */
const ADMIN_200 = [
  '/api/metrics',
  '/api/metrics/snapshot',
  '/api/metrics/summary',
  '/api/metrics/sessions',
  '/api/diagnostics',
  '/api/diagnostics/summary',
  '/api/diagnostics/pipeline',
  `/api/diagnostics/session?sessionId=${SESSION}`,
  '/api/session-metrics',
  '/api/session-metrics/summary',
  '/api/session-metrics/raw',
  '/api/memory',
  '/api/memory/metrics',
  '/api/memory/history',
  '/api/memory/alerts',
  '/api/memory/health',
  '/api/cache',
  '/api/cache/stats',
  '/api/watchdog',
  '/api/watchdog/status',
  '/metrics',
  '/api/observability',
  '/api/observability?window=60',
  '/health/workers',
  '/health/native',
  '/health/gemini',
  '/health/crash-analytics',
  '/api/crash-analytics',
  '/api/crash-analytics/history',
];

/** Spellings of gated or public paths that are not on the public list. */
const VARIANTS = [
  '/API/metrics',
  '/api//metrics',
  '/%2Fapi%2Fmetrics',
  '/api/metrics/',
  '/api/metrics/sessions?x=1',
  '/health/',
  '/HEALTH',
  '/health?probe=1',
  '/health/ready/',
  '/health/anything-new',
];

let server: Server;
let port = 0;

beforeAll(async () => {
  process.env['PORT'] = '0';
  server = startHealthCheckServer('health-diagnostics-admin-test');
  await vi.waitFor(
    () => {
      if (!server.listening) throw new Error('not yet');
    },
    { timeout: 10000, interval: 20 }
  );
  ({ port } = server.address() as AddressInfo);
  readiness.markStartupComplete();
  readiness.markLivekitConnected();
  readiness.markWorkerReady('health-diagnostics-admin-test');
  persistenceMetrics.recordSessionStart(SESSION, USER, 'ferni');
  startSessionMetrics(SESSION);
});

afterAll(async () => {
  persistenceMetrics.recordSessionEnd(SESSION);
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

function call(
  path: string,
  headers: Record<string, string> = {},
  method = 'GET'
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, { method, headers });
}
const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

function expectNoData(body: string): void {
  for (const marker of MARKERS) expect(body).not.toContain(marker);
  expect(body).not.toContain('"data"');
}

describe('the route list is read from the router', () => {
  it('finds every route family, the crash routes included', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(30);
    for (const route of [
      '/api/metrics/sessions',
      '/api/crash-analytics',
      '/api/crash-analytics/history',
      '/health/crash-analytics',
      '/api/cognitive/history',
      '/api/observability/sota-seed',
      '/health/gemini',
      '/metrics',
    ]) {
      expect(GATED).toContain(route);
    }
    for (const route of PUBLIC) expect(ROUTES).toContain(route);
  });

  it('a route added to the router is gated without editing any list', async () => {
    const planted = `${SOURCE}\n      if (url === '/api/planted-new-route') {}\n`;
    expect(routesIn(planted)).toContain('/api/planted-new-route');
    expect(isPublicRoute('/api/planted-new-route')).toBe(false);
    const res = await call('/api/planted-new-route');
    expect(res.status).toBe(401);
    expectNoData(await res.text());
  });
});

describe('every route but the public probes needs an admin', () => {
  it.each(GATED)('%s without a credential is 401 and carries no data', async (path) => {
    const res = await call(path);
    expect(res.status).toBe(401);
    expectNoData(await res.text());
  });

  it.each(GATED)('%s with a bad token is 401 and carries no data', async (path) => {
    const res = await call(path, bearer('not-a-token'));
    expect(res.status).toBe(401);
    expectNoData(await res.text());
  });

  it.each(GATED)('%s for a verified non-admin is 403 and carries no data', async (path) => {
    const res = await call(path, bearer(TOK_USER));
    expect(res.status).toBe(403);
    expectNoData(await res.text());
  });

  it('the dev-only seed POST without a credential is 401', async () => {
    expect((await call('/api/observability/sota-seed', {}, 'POST')).status).toBe(401);
  });

  it.each(VARIANTS)('the variant %s without a credential is 401', async (path) => {
    const res = await call(path);
    expect(res.status).toBe(401);
    expectNoData(await res.text());
  });

  it('an unknown route is 401 without a credential and 404 for an admin', async () => {
    expect((await call('/no-such-route')).status).toBe(401);
    expect((await call('/no-such-route', bearer(TOK_ADMIN))).status).toBe(404);
  });
});

describe('it fails closed when no admin secret is configured', () => {
  it.each(GATED)('%s: an X-API-Key is not an admin when ADMIN_API_KEYS is unset', async (path) => {
    const res = await call(path, { 'X-API-Key': 'guessed-key' });
    expect(res.status).toBe(401);
    expectNoData(await res.text());
  });

  it.each(GATED)('%s: the dev key opens nothing outside development', async (path) => {
    const res = await call(path, { 'X-Admin-Key': 'dev-mode' });
    expect(res.status).toBe(401);
    expectNoData(await res.text());
  });

  it.each(GATED)('%s: a token the auth backend cannot check is refused', async (path) => {
    const res = await call(path, bearer(TOK_UNCHECKABLE));
    expect([401, 503]).toContain(res.status);
    expectNoData(await res.text());
  });
});

describe('an admin gets the routes as before', () => {
  it.each(ADMIN_200)('%s for an admin is 200', async (path) => {
    const res = await call(path, bearer(TOK_ADMIN));
    await res.text();
    expect(res.status).toBe(200);
  });

  it("an admin's /api/metrics/sessions still lists the session", async () => {
    const body = await (await call('/api/metrics/sessions', bearer(TOK_ADMIN))).text();
    expect(body).toContain(USER);
  });

  it.each(['GET', 'POST'])(
    '/api/memory/cleanup is gone (nothing called it): %s is 404',
    async (method) => {
      const res = await call('/api/memory/cleanup', bearer(TOK_ADMIN), method);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('Cleaned');
    }
  );
});

describe('the public probes answer without a credential', () => {
  it.each(PUBLIC)('%s is 200 without a credential and names no session', async (path) => {
    const res = await call(path);
    const body = await res.text();
    expect(res.status).toBe(200);
    for (const marker of MARKERS) expect(body).not.toContain(marker);
  });

  it('only those five are public, matched exactly', () => {
    for (const route of PUBLIC) expect(isPublicRoute(route)).toBe(true);
    for (const route of [...GATED, ...VARIANTS]) expect(isPublicRoute(route)).toBe(false);
  });
});
