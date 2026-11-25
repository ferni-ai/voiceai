/**
 * FinOps shows company finances, so it takes the signed-in admin through the real
 * requireAuth like every other admin route (only Firebase's token check and the
 * security-event store are mocked): 401 signed out, 403 for a non-admin, an answer for
 * an admin. It used to accept only the server's ADMIN_KEY, so the admin portal's
 * signed-in admin got 401 on dev.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyFirebaseToken = vi.fn();
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: (...args: unknown[]) => verifyFirebaseToken(...args),
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../../services/security-events.js', () => ({
  detectAnomalies: vi.fn(() => []),
  isLockedOut: vi.fn(() => ({ locked: false })),
  recordSecurityEvent: vi.fn(async () => undefined),
  recordSuccessfulAuth: vi.fn(async () => undefined),
  trackFailedAuth: vi.fn(async () => undefined),
}));

const { handleFinOpsRoutes } = await import('../finops-routes.js');
const { finops } = await import('../../services/observability/finops.js');

type Who = 'signed-out' | 'user' | 'admin';
let ip = 0;

function request(method: string, url: string, who: Who, extra: Record<string, string> = {}) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  ip += 1; // a fresh client per request, so rate limits never interfere
  req.headers = {
    'x-forwarded-for': `203.0.113.${ip % 250}`,
    ...(who === 'signed-out' ? {} : { authorization: `Bearer token-${who}` }),
    ...extra,
  };
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: `198.51.100.${ip % 250}`,
  };
  setTimeout(() => req.emit('end'), 0);
  return req;
}

interface Captured {
  status: number;
  body: unknown;
}
function response(): ServerResponse & { captured: Captured } {
  const captured: Captured = { status: 0, body: undefined };
  const res = {
    captured,
    headersSent: false,
    setHeader: vi.fn(),
    writeHead(status: number) {
      captured.status = status;
      this.headersSent = true;
      return this;
    },
    end(chunk?: string) {
      captured.body = chunk ? (JSON.parse(chunk) as unknown) : undefined;
    },
  };
  return res as unknown as ServerResponse & { captured: Captured };
}

async function get(path: string, who: Who, extra?: Record<string, string>): Promise<Captured> {
  const res = response();
  const handled = await handleFinOpsRoutes(
    request('GET', path, who, extra),
    res,
    path,
    new URL(`http://x${path}`)
  );
  expect(handled).toBe(true);
  return res.captured;
}

beforeEach(() => {
  verifyFirebaseToken.mockImplementation(async (token: string) => ({
    uid: token === 'token-admin' ? 'uid-admin' : 'uid-user',
    email: undefined,
    emailVerified: true,
    isAnonymous: false,
    claims: token === 'token-admin' ? { admin: true } : {},
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('FinOps routes are for signed-in admins', () => {
  it.each(['/api/finops/snapshot', '/api/finops/thresholds'])('401 signed out: %s', async (p) => {
    expect((await get(p, 'signed-out')).status).toBe(401);
  });

  it.each(['/api/finops/snapshot', '/api/finops/thresholds'])(
    '403 for a signed-in user who is not an admin: %s',
    async (p) => {
      expect((await get(p, 'user')).status).toBe(403);
    }
  );

  it('answers a signed-in admin with the thresholds the service holds', async () => {
    const got = await get('/api/finops/thresholds', 'admin');
    expect(got.status).toBe(200);
    expect(got.body).toEqual(finops.getThresholds());
  });

  it('answers a signed-in admin with a snapshot', async () => {
    const got = await get('/api/finops/snapshot', 'admin');
    expect(got.status).toBe(200);
    expect(got.body).toEqual(expect.objectContaining({ alerts: expect.any(Array) }));
  });

  it('no longer takes the admin key outside development, in a header or the URL', async () => {
    vi.stubEnv('ADMIN_KEY', 'server-key');
    expect(
      (await get('/api/finops/snapshot', 'signed-out', { 'x-admin-key': 'server-key' })).status
    ).toBe(401);
    expect((await get('/api/finops/snapshot?admin_key=server-key', 'signed-out')).status).toBe(401);
  });

  it('leaves other paths to the next handler', async () => {
    const res = response();
    const path = '/api/other';
    expect(
      await handleFinOpsRoutes(request('GET', path, 'admin'), res, path, new URL(`http://x${path}`))
    ).toBe(false);
  });
});
