/**
 * Crash analytics is checked twice: the router denies every non-public route
 * (health-diagnostics-admin.test.ts), and the crash handler checks for an admin
 * again itself. Defense in depth, each layer has its own test. This file is the
 * handler's: the router is bypassed by mocking public-routes.ts so every route
 * reads as public, and only the handler's own check stands.
 *
 * The REAL health server (port 0); only the Firebase token verifier and the
 * public-route list are mocked. Fictional data only.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const TOK_ADMIN = 'jwtAdmin.payload.sig';
const TOK_USER = 'jwtUser.payload.sig';
const verifyFirebaseToken = vi.fn(async (token: string) => {
  if (token === TOK_ADMIN) return { uid: 'admin-1', claims: { admin: true }, isAnonymous: false };
  if (token === TOK_USER) return { uid: 'user-A', claims: {}, isAnonymous: false };
  return null;
});
vi.mock('../../../services/identity/firebase-auth.js', () => ({ verifyFirebaseToken }));
// Router bypassed: every route reads as public, so only a handler's own check can refuse.
vi.mock('../public-routes.js', () => ({ isPublicRoute: () => true }));

delete process.env['ADMIN_API_KEYS'];
delete process.env['ADMIN_KEY'];

const { startHealthCheckServer } = await import('../health-server.js');
const { registerSession, unregisterSession } = await import('../crash-analytics.js');

const SESSION = 'sess-crash-handler-sam';
const PATHS = ['/health/crash-analytics', '/api/crash-analytics', '/api/crash-analytics/history'];

let server: Server;
let port = 0;

beforeAll(async () => {
  process.env['PORT'] = '0';
  server = startHealthCheckServer('crash-analytics-handler-admin-test');
  await vi.waitFor(
    () => {
      if (!server.listening) throw new Error('not yet');
    },
    { timeout: 10000, interval: 20 }
  );
  ({ port } = server.address() as AddressInfo);
  registerSession(SESSION, { userId: 'user-sam-rivera', roomName: 'room-sam' });
});

afterAll(async () => {
  unregisterSession(SESSION, 'test done');
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

function get(path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`http://127.0.0.1:${port}${path}`, { headers });
}

describe('the crash handler checks for an admin itself, with the router bypassed', () => {
  it('the router really is bypassed: a route with no check of its own answers without a token', async () => {
    expect((await get('/api/metrics/summary')).status).toBe(200);
  });

  it.each(PATHS)('%s without a token is 401 and names no session', async (path) => {
    const res = await get(path);
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(SESSION);
  });

  it.each(PATHS)('%s for a verified non-admin is 403 and names no session', async (path) => {
    const res = await get(path, TOK_USER);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(SESSION);
  });

  it.each(PATHS)('%s for an admin is 200', async (path) => {
    expect((await get(path, TOK_ADMIN)).status).toBe(200);
  });
});
