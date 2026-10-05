/**
 * Huddle ownership over real HTTP.
 *
 * GET /api/huddles/:id, GET /api/huddles/:id/participants and
 * POST /api/huddles/:id/complete used to look the huddle up by id alone, so any
 * signed-in user could read or complete anyone's huddle. The server here
 * dispatches the way src/servers/api/index.ts does: bindVerifiedIdentity, then
 * the real engagement router (which mounts the team routes). Only token
 * verification and persistence are faked.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const TOKENS: Record<string, string> = { 'token-alice': 'alice', 'token-bob': 'bob' };

vi.mock('../auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth-middleware.js')>();
  const verify = async (req: http.IncomingMessage) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const userId = TOKENS[token];
    return userId ? { userId, isAdmin: false, isDevMode: false, authMethod: 'firebase' } : null;
  };
  return { ...actual, optionalAuthAsync: vi.fn(verify), rateLimit: vi.fn(() => false) };
});

vi.mock('../../services/engagement/engagement-store.js', () => ({
  getEngagementStore: vi.fn(async () => {
    throw new Error('no engagement store in tests');
  }),
}));

vi.mock('../../services/engagement/team-engagement.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/engagement/team-engagement.js')>();
  return { ...actual, getTeamEngagementService: () => ({ generateTeamHuddle: async () => null }) };
});

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { handleEngagementRoutes } = await import('../engagement-routes.js');

let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    await bindVerifiedIdentity(req);
    const url = new URL(req.url || '/', 'http://local');
    if (!(await handleEngagementRoutes(req, res, url.pathname, url))) {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

function call(path: string, token: string, method = 'GET', body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function aliceStartsHuddle(): Promise<string> {
  const res = await call('/api/huddles/start', 'token-alice', 'POST', { topic: 'habits' });
  expect(res.status).toBe(200);
  const { huddle } = (await res.json()) as { huddle: { id: string } };
  return huddle.id;
}

describe("another user's huddle", () => {
  it('reads as not found, the same as a missing one', async () => {
    const id = await aliceStartsHuddle();

    expect((await call(`/api/huddles/${id}`, 'token-alice')).status).toBe(200);
    expect((await call(`/api/huddles/${id}/participants`, 'token-alice')).status).toBe(200);

    const byBob = await call(`/api/huddles/${id}`, 'token-bob');
    const missing = await call('/api/huddles/huddle_does_not_exist', 'token-bob');
    expect(byBob.status).toBe(404);
    expect(await byBob.json()).toEqual(await missing.json());
    expect((await call(`/api/huddles/${id}/participants`, 'token-bob')).status).toBe(404);
  });

  it('cannot be completed by someone else, and stays active for its owner', async () => {
    const id = await aliceStartsHuddle();

    expect((await call(`/api/huddles/${id}/complete`, 'token-bob', 'POST')).status).toBe(404);
    const after = (await (await call(`/api/huddles/${id}`, 'token-alice')).json()) as {
      huddle: { status: string };
    };
    expect(after.huddle.status).toBe('active');

    const done = await call(`/api/huddles/${id}/complete`, 'token-alice', 'POST');
    expect(done.status).toBe(200);
    expect(((await done.json()) as { huddle: { status: string } }).huddle.status).toBe('completed');
  });

  it('needs credentials at all', async () => {
    const id = await aliceStartsHuddle();
    expect((await fetch(`${base}/api/huddles/${id}`)).status).toBe(401);
  });
});
