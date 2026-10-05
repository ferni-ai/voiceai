/**
 * /api/life-context acts only on the verified caller.
 *
 * The handler used to take the user from x-firebase-uid, else from ?userId=.
 * In production bindVerifiedIdentity strips an unverified ?userId first, but in
 * development it doesn't, and any caller that reaches the handler without that
 * binding could read (or trigger a scan of) anyone's life context by naming
 * them. The handler now verifies the caller itself (requireAuth).
 *
 * Real HTTP through the REAL handler and auth middleware, NOT behind
 * bindVerifiedIdentity, with NODE_ENV=development, so the route alone is safe.
 * Mocked: Firebase token verification and the life-context data services.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'development';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null
  ),
}));

const data = vi.hoisted(() => ({
  aggregateLifeContext: vi.fn(async (_uid: string) => null),
  generateSynthesisTriggers: vi.fn(() => []),
  triggerLifeContextScan: vi.fn(async (_uid: string) => null),
}));
vi.mock('../../intelligence/triggers/index.js', () => data);
vi.mock('../../services/life-context-broadcast.js', () => data);

const { handleLifeContextRoutes } = await import('../life-context-routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleLifeContextRoutes(req, res, url.pathname);
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
beforeEach(() => vi.clearAllMocks());

const call = (method: string, path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method, headers });

const touchedUsers = () => [
  ...data.aggregateLifeContext.mock.calls.map((c) => c[0]),
  ...data.triggerLifeContextScan.mock.calls.map((c) => c[0]),
];

describe('life-context routes: verified caller only (NODE_ENV=development)', () => {
  it.each([
    ['GET', '/api/life-context?userId=victim', {}],
    ['POST', '/api/life-context/refresh?userId=victim', {}],
    ['GET', '/api/life-context', { 'x-firebase-uid': 'victim' }],
    ['GET', '/api/life-context', { 'x-user-id': 'victim' }],
    ['GET', '/api/life-context?userId=victim', { authorization: 'Bearer forged' }],
  ])('%s %s with no valid credentials → 401, nobody read', async (method, path, headers) => {
    const res = await call(method, path, headers);
    expect(res.status).toBe(401);
    expect(touchedUsers()).toEqual([]);
  });

  it('a signed-in caller naming someone else reads only their own context', async () => {
    const res = await call('GET', '/api/life-context?userId=victim', {
      authorization: 'Bearer tok-A',
      'x-firebase-uid': 'victim',
    });
    expect(res.status).toBe(200);
    expect(touchedUsers()).toEqual(['uid-A']);
  });

  it('refresh scans only the signed-in caller', async () => {
    const res = await call('POST', '/api/life-context/refresh?userId=victim', {
      authorization: 'Bearer tok-A',
    });
    expect(res.status).toBe(200);
    expect(touchedUsers()).toEqual(['uid-A']);
  });
});
