/**
 * LiveKit's poll of GET /worker (prod: one per pod about every 5 minutes, ~14 warnings an hour,
 * #4292) still gets a 401 and no data, but is no longer a warn per request: the first one per
 * process names its user-agent product at info, the rest are debug. Any other route without a
 * credential still warns. The REAL health server (port 0) and the REAL auth middleware; only the
 * logger and the Firebase verifier are faked. Fictional data only.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ level: string; fields: unknown; msg: unknown }>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const recorder = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = { child: () => logger };
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = (fields: unknown, msg?: unknown) => logged.push({ level, fields, msg });
    }
    return logger;
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    getLogger: recorder,
    createLogger: recorder,
  };
});
vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: async () => null,
}));

delete process.env['ADMIN_API_KEYS'];
delete process.env['ADMIN_KEY'];

const { startHealthCheckServer } = await import('../health-server.js');
const { isKnownExternalProbe, isPublicRoute } = await import('../public-routes.js');
const { resetKnownProbeLogForTesting } = await import('../../../api/auth-middleware.js');

let server: Server;
let port = 0;

beforeAll(async () => {
  process.env['PORT'] = '0';
  server = startHealthCheckServer('worker-probe-log-test');
  await vi.waitFor(
    () => {
      if (!server.listening) throw new Error('not yet');
    },
    { timeout: 10000, interval: 20 }
  );
  ({ port } = server.address() as AddressInfo);
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

beforeEach(() => {
  resetKnownProbeLogForTesting();
  logged.length = 0;
});

async function get(path: string, headers: Record<string, string> = {}): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  await res.text();
  return res.status;
}

const unauthorized = () =>
  logged.filter(({ msg }) => typeof msg === 'string' && msg.startsWith('Unauthorized request'));

describe('GET /worker without a credential', () => {
  it('is still 401, and is not a public route', async () => {
    expect(isPublicRoute('/worker')).toBe(false);
    expect(isKnownExternalProbe('/worker')).toBe(true);
    expect(await get('/worker')).toBe(401);
  });

  it('names its user-agent product once at info, then logs at debug, never a warn', async () => {
    const headers = { 'User-Agent': 'Fake-Poller/1.2 (fictional; build 9)' };
    for (let i = 0; i < 3; i++) expect(await get('/worker', headers)).toBe(401);
    const lines = unauthorized();
    expect(lines.map((l) => l.level)).toEqual(['info', 'debug', 'debug']);
    expect(lines[0]?.fields).toMatchObject({
      url: '/worker',
      method: 'GET',
      userAgent: 'Fake-Poller',
    });
    expect(logged.some((l) => l.level === 'warn')).toBe(false);
  });

  it('keeps only a short product token of a long or odd user-agent', async () => {
    await get('/worker', { 'User-Agent': 'A'.repeat(60) + '/1.0' });
    expect(unauthorized()[0]?.fields).toMatchObject({ userAgent: 'A'.repeat(24) });
    resetKnownProbeLogForTesting();
    logged.length = 0;
    await get('/worker', { 'User-Agent': '(just words in brackets)' });
    expect(unauthorized()[0]?.fields).toMatchObject({ userAgent: 'other' });
  });
});

describe('everything else without a credential still warns', () => {
  it.each(['/api/metrics', '/worker?x=1', '/worker/', '/WORKER'])('%s', async (path) => {
    expect(await get(path)).toBe(401);
    expect(unauthorized().map((l) => l.level)).toEqual(['warn']);
  });
});
