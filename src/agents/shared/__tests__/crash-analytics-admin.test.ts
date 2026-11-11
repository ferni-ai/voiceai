/**
 * GET /health/crash-analytics, /api/crash-analytics and /api/crash-analytics/history on the
 * agent's health server return every live session's snapshot and every recent crash. They
 * answered anyone, with no credentials. Now only a verified admin (Firebase custom claim
 * `admin`) gets them, as with /api/cognitive: no token or a bad token is 401, a verified
 * non-admin is 403, and neither response carries any of the data.
 *
 * A session snapshot also no longer keeps what the caller or Ferni last said. A crash
 * record still keeps up to 200 characters of each, by design, for the admin who reads it.
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
const { registerSession, updateSessionState, unregisterSession, getSessionState, recordCrash } =
  await import('../crash-analytics.js');

const SESSION = 'sess-crash-admin-sam';
/** Over 200 characters each, so the crash record's cut shows. */
const CALLER = `SAMPLE-CALLER-WORDS about my garden ${'and the tomatoes '.repeat(14)}TAIL-CALLER`;
const FERNI = `SAMPLE-FERNI-WORDS reply ${'about the tomatoes '.repeat(13)}TAIL-FERNI`;
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
    lastUserMessage: CALLER,
    lastAgentMessage: FERNI,
  });
  recordCrash('manual_report', new Error('sample crash for the admin test'), SESSION);
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
    expect(body).not.toContain('SAMPLE-');
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
    expect(body).not.toContain('SAMPLE-');
  });

  it.each(PATHS)('%s for an admin is 200 with the data', async (path) => {
    const res = await get(path, TOK_ADMIN);
    const json = (await res.json()) as { success?: boolean; data?: unknown };
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });

  it("the admin's summary: snapshots carry no words; the crash keeps 200 chars of each", async () => {
    expect(CALLER.length).toBeGreaterThan(200);
    expect(FERNI.length).toBeGreaterThan(200);
    const json = (await (await get('/api/crash-analytics', TOK_ADMIN)).json()) as {
      data: {
        sessionCrashes: {
          activeSessions: Array<Record<string, unknown>>;
          recentCrashes: Array<{ context: Record<string, unknown> }>;
        };
      };
    };
    const { activeSessions, recentCrashes } = json.data.sessionCrashes;
    const snapshot = activeSessions.find((s) => s.sessionId === SESSION);
    expect(snapshot).toBeDefined();
    expect(snapshot).not.toHaveProperty('lastUserMessage');
    expect(snapshot).not.toHaveProperty('lastAgentMessage');
    expect(JSON.stringify(activeSessions)).not.toContain('SAMPLE-');
    // By design, for admins: the crash record keeps the first 200 characters of each side.
    const crash = recentCrashes.find((c) => c.context.sessionId === SESSION);
    expect(crash?.context.lastUserMessage).toBe(CALLER.slice(0, 200));
    expect(crash?.context.lastAgentMessage).toBe(FERNI.slice(0, 200));
    const body = JSON.stringify(json);
    expect(body).not.toContain('TAIL-CALLER');
    expect(body).not.toContain('TAIL-FERNI');
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
