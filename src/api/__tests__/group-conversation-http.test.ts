/**
 * /api/group/roundtable/* over real HTTP.
 *
 * The group-conversation Express router was mounted with no body parser, so
 * every route that reads req.body threw and answered 500 (POST
 * /api/group/call/add did in production). The server here dispatches the way
 * src/servers/api/index.ts does: bindVerifiedIdentity, the engagement router
 * (which also serves /api/group/sessions for group coaching), then the
 * group-conversation handler. Only token verification and Firestore are faked.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

/** In-memory Firestore: just the document calls these routes make. */
const store = new Map<string, Record<string, unknown>>();
const db = {
  available: true,
  collection: (name: string) => collection(name),
};
function collection(path: string) {
  return { doc: (id: string) => doc(`${path}/${id}`) };
}
function doc(path: string) {
  return {
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (data: Record<string, unknown>) => {
      store.set(path, data);
    },
    update: async (data: Record<string, unknown>) => {
      if (!store.has(path)) throw Object.assign(new Error('5 NOT_FOUND'), { code: 5 });
      store.set(path, { ...store.get(path), ...data });
    },
  };
}
vi.mock('../../services/superhuman/firestore-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/superhuman/firestore-utils.js')>();
  return { ...actual, getFirestoreDb: () => (db.available ? db : null) };
});

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { handleEngagementRoutes } = await import('../engagement-routes.js');
const { handleGroupConversationRoutes } = await import('../group-conversation-handler.js');

let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    try {
      await bindVerifiedIdentity(req);
      const url = new URL(req.url || '/', 'http://local');
      if (await handleEngagementRoutes(req, res, url.pathname, url)) return;
      if (url.pathname.startsWith('/api/group/') && (await handleGroupConversationRoutes(req, res)))
        return;
      res.writeHead(404).end();
    } catch {
      // the same catch-all src/servers/api/index.ts wraps each router in
      if (!res.writableEnded) res.writeHead(500).end('{"error":"Internal server error"}');
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

beforeEach(() => {
  store.clear();
  db.available = true;
});

function post(path: string, token: string, body: unknown, raw?: string) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

const sessionPath = (user: string, id: string) => `bogle_users/${user}/group_sessions/${id}`;

async function aliceStarts(): Promise<string> {
  const res = await post('/api/group/roundtable/start', 'token-alice', {
    personas: ['ferni', 'alex-chen'],
    topic: 'career change',
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { success: boolean; sessionId: string };
  expect(body.success).toBe(true);
  return body.sessionId;
}

describe('roundtable routes read JSON bodies', () => {
  it('start records the roundtable for the caller', async () => {
    const id = await aliceStarts();
    expect(store.get(sessionPath('alice', id))).toMatchObject({
      userId: 'alice',
      status: 'active',
      topic: 'career change',
    });
  });

  it("end closes the caller's roundtable", async () => {
    const id = await aliceStarts();
    const res = await post('/api/group/roundtable/end', 'token-alice', { sessionId: id });
    expect(res.status).toBe(200);
    expect(store.get(sessionPath('alice', id))).toMatchObject({ status: 'ended' });
  });

  it("end on someone else's or an unknown session is not found, and changes nothing", async () => {
    const id = await aliceStarts();
    expect((await post('/api/group/roundtable/end', 'token-bob', { sessionId: id })).status).toBe(
      404
    );
    expect(
      (await post('/api/group/roundtable/end', 'token-alice', { sessionId: 'nope' })).status
    ).toBe(404);
    expect(store.get(sessionPath('alice', id))).toMatchObject({ status: 'active' });
  });

  it('refuses a body that names a different user', async () => {
    const res = await post('/api/group/roundtable/start', 'token-bob', {
      userId: 'alice',
      personas: ['ferni'],
    });
    expect(res.status).toBe(403);
    expect(store.size).toBe(0);
  });

  it('answers a malformed body with 400, not 500', async () => {
    const res = await post('/api/group/roundtable/start', 'token-alice', null, '{"personas":');
    expect(res.status).toBe(400);
  });

  it('says so when it cannot save, instead of claiming success', async () => {
    db.available = false;
    const res = await post('/api/group/roundtable/start', 'token-alice', { personas: ['ferni'] });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { success: boolean }).success).toBe(false);
  });
});

describe('group coaching shares the /api/group prefix', () => {
  it('still creates sessions from its JSON body', async () => {
    const res = await post('/api/group/sessions', 'token-alice', { type: 'couple' });
    expect(res.status).toBe(200);
    const { session } = (await res.json()) as { session: { id: string; type: string } };
    expect(session.type).toBe('couple');
  });
});
