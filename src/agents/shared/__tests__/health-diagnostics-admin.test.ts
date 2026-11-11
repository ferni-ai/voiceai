/**
 * The agent health server's diagnostic routes answer only an admin.
 *
 * The server listens on 0.0.0.0 (a public IP on GCE). An independent verify
 * of #3738 got a user id from /api/metrics and /api/metrics/sessions with no
 * credentials. Every diagnostic route now goes through requireAdmin, as
 * /api/cognitive does: no or a bad token is 401, a verified non-admin 403, and
 * neither body carries any data. The probes stay public. GET /api/memory/cleanup
 * no longer runs a cleanup: it is POST only.
 *
 * The REAL health server (port 0) and the REAL metrics stores; only the
 * Firebase token verifier is mocked. Fictional data only.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const TOK_ADMIN = 'jwtAdmin.payload.sig';
const TOK_USER = 'jwtUser.payload.sig';
const verifyFirebaseToken = vi.fn(async (token: string) => {
  if (token === TOK_ADMIN) return { uid: 'admin-1', claims: { admin: true }, isAnonymous: false };
  if (token === TOK_USER) return { uid: 'user-riley', claims: {}, isAnonymous: false };
  return null;
});
vi.mock('../../../services/identity/firebase-auth.js', () => ({ verifyFirebaseToken }));

const { startHealthCheckServer } = await import('../health-server.js');
const { persistenceMetrics } = await import('../../../services/analytics/persistence-metrics.js');
const { startSessionMetrics } = await import('../session-metrics.js');

const SESSION = 'sess-diag-sam-0142';
const USER = 'user-sam-rivera-0142';
const MARKERS = [SESSION, USER, 'sam-rivera'];

/** Every diagnostic route (GET), with the variants the router also serves. */
const ADMIN_ROUTES = [
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
  '/api/memory/cleanup',
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
];
const PUBLIC_ROUTES = ['/', '/health', '/health/ready', '/health/warmup', '/api/warmup'];

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
  persistenceMetrics.recordSessionStart(SESSION, USER, 'ferni');
  startSessionMetrics(SESSION);
});

afterAll(async () => {
  persistenceMetrics.recordSessionEnd(SESSION);
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

function call(path: string, token?: string, method = 'GET'): Promise<Response> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`http://127.0.0.1:${port}${path}`, { method, headers });
}

function expectNoData(body: string): void {
  for (const marker of MARKERS) expect(body).not.toContain(marker);
  expect(body).not.toContain('"data"');
}

describe('diagnostic routes on the health server are admin only', () => {
  it.each(ADMIN_ROUTES)('%s without a token is 401 and carries no data', async (path) => {
    const res = await call(path);
    const body = await res.text();
    expect(res.status).toBe(401);
    expectNoData(body);
  });

  it.each(ADMIN_ROUTES)('%s with a bad token is 401 and carries no data', async (path) => {
    const res = await call(path, 'not-a-token');
    expect(res.status).toBe(401);
    expectNoData(await res.text());
  });

  it.each(ADMIN_ROUTES)('%s for a verified non-admin is 403 and carries no data', async (path) => {
    const res = await call(path, TOK_USER);
    expect(res.status).toBe(403);
    expectNoData(await res.text());
  });

  it.each(ADMIN_ROUTES.filter((p) => p !== '/api/memory/cleanup'))(
    '%s for an admin is served (not refused)',
    async (path) => {
      const res = await call(path, TOK_ADMIN);
      await res.text();
      expect([401, 403, 404, 405]).not.toContain(res.status);
    }
  );

  it("an admin's /api/metrics/sessions still lists the session (the data is unchanged)", async () => {
    const body = await (await call('/api/metrics/sessions', TOK_ADMIN)).text();
    expect(body).toContain(USER);
  });

  it.each(PUBLIC_ROUTES)('%s stays public: no token needed', async (path) => {
    const res = await call(path);
    await res.text();
    expect([401, 403]).not.toContain(res.status);
  });

  it('an unknown route is still 404 without a token', async () => {
    expect((await call('/no-such-route')).status).toBe(404);
  });
});

describe('/api/memory/cleanup changes state, so it is POST only', () => {
  it('a GET from an admin does not run it: 405, Allow: POST', async () => {
    const res = await call('/api/memory/cleanup', TOK_ADMIN);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(await res.text()).not.toContain('Cleaned');
  });

  it('a POST without a token is 401', async () => {
    expect((await call('/api/memory/cleanup', undefined, 'POST')).status).toBe(401);
  });

  it('a POST from an admin runs it', async () => {
    const res = await call('/api/memory/cleanup', TOK_ADMIN, 'POST');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('Cleaned');
  });
});
