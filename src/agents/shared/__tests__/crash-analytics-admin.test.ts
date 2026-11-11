/**
 * GET /health/crash-analytics, /api/crash-analytics and /api/crash-analytics/history on the
 * agent's health server return every live session's snapshot and every recent crash. They
 * answered anyone, with no credentials. Now only a verified admin (Firebase custom claim
 * `admin`) gets them, as with /api/cognitive: no token or a bad token is 401, a verified
 * non-admin is 403, and neither response carries any of the data.
 *
 * A session snapshot also no longer keeps what the caller or Ferni last said: crash
 * analytics keeps those words only for the length it reports.
 *
 * The REAL health server (port 0) and the REAL crash analytics; only the Firebase token
 * verifier is mocked. Fictional data only.
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

const { startHealthCheckServer } = await import('../health-server.js');
const { registerSession, updateSessionState, unregisterSession, getSessionState } =
  await import('../crash-analytics.js');

const SESSION = 'sess-crash-admin-sam';
const PATHS = ['/health/crash-analytics', '/api/crash-analytics', '/api/crash-analytics/history'];

let server: Server;
let port = 0;

beforeAll(async () => {
  process.env['PORT'] = '0';
  server = startHealthCheckServer('crash-analytics-admin-test');
  await vi.waitFor(
    () => {
      if (!server.listening) throw new Error('not yet');
    },
    { timeout: 10000, interval: 20 }
  );
  port = (server.address() as AddressInfo).port;
  registerSession(SESSION, { userId: 'user-sam-rivera', roomName: 'room-sam' });
  updateSessionState(SESSION, {
    turnCount: 2,
    lastUserMessage: 'SAMPLE-CALLER-WORDS about my garden',
    lastAgentMessage: 'SAMPLE-FERNI-WORDS reply',
  });
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

describe('crash analytics on the health server is admin only', () => {
  it.each(PATHS)('%s without a token is 401 and carries no data', async (path) => {
    const res = await get(path);
    const body = await res.text();
    expect(res.status).toBe(401);
    expect(body).not.toContain(SESSION);
    expect(body).not.toContain('"data"');
  });

  it.each(PATHS)('%s with a bad token is 401', async (path) => {
    expect((await get(path, 'not-a-token')).status).toBe(401);
  });

  it.each(PATHS)('%s for a verified non-admin is 403 and carries no data', async (path) => {
    const res = await get(path, TOK_USER);
    const body = await res.text();
    expect(res.status).toBe(403);
    expect(body).not.toContain(SESSION);
    expect(body).not.toContain('"data"');
  });

  it.each(PATHS)('%s for an admin is 200 with the data', async (path) => {
    const res = await get(path, TOK_ADMIN);
    const json = (await res.json()) as { success?: boolean; data?: unknown };
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });

  it("the admin's summary lists the live session without anyone's words", async () => {
    const body = await (await get('/api/crash-analytics', TOK_ADMIN)).text();
    expect(body).toContain(SESSION);
    expect(body).not.toContain('SAMPLE-CALLER-WORDS');
    expect(body).not.toContain('SAMPLE-FERNI-WORDS');
  });
});

describe('a session snapshot keeps no words', () => {
  it('updateSessionState does not copy lastUserMessage or lastAgentMessage onto it', () => {
    const snapshot = getSessionState(SESSION) as Record<string, unknown> | null;
    expect(snapshot).toMatchObject({ sessionId: SESSION, turnCount: 2 });
    expect(snapshot).not.toHaveProperty('lastUserMessage');
    expect(snapshot).not.toHaveProperty('lastAgentMessage');
  });
});
