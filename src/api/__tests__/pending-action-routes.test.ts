/**
 * Pending-action approvals over real HTTP: owner only, fresh sign-in,
 * CSRF-safe POST, decision bound to the action hash.
 *
 * Dispatches like src/servers/api/index.ts (bindVerifiedIdentity, then the
 * route). Token verification and Firestore are faked; actions are created
 * by the real createPendingAction.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from '../../services/approvals/__tests__/fake-firestore.js';

/** token → [uid, auth_time seconds-ago, anonymous, uid inside the bearer token, auth method] */
type Entry = [string, number, boolean, string?, ('firebase' | 'api_key')?];
const TOKENS: Record<string, Entry> = {
  'alice-fresh': ['alice', 30, false],
  'alice-stale': ['alice', 6 * 60, false],
  'alice-anon': ['alice', 30, true],
  'bob-fresh': ['bob', 30, false],
  // requireAuth resolved alice some other way, but the bearer token is bob's
  'alice-with-bobs-token': ['alice', 30, false, 'bob'],
  'service-key': ['alice', 30, false, undefined, 'api_key'],
};

const tokenOf = (req: http.IncomingMessage) =>
  (req.headers.authorization ?? '').replace(/^Bearer /, '');

vi.mock('../auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth-middleware.js')>();
  const verify = async (req: http.IncomingMessage) => {
    const entry = TOKENS[tokenOf(req)];
    return entry
      ? { userId: entry[0], isAdmin: false, isDevMode: false, authMethod: entry[4] ?? 'firebase' }
      : null;
  };
  return {
    ...actual,
    optionalAuthAsync: vi.fn(verify),
    requireAuth: vi.fn(async (req: http.IncomingMessage, res: http.ServerResponse) => {
      const auth = await verify(req);
      if (!auth) res.writeHead(401).end();
      return auth;
    }),
    rateLimit: vi.fn(() => false),
  };
});

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const entry = TOKENS[token];
    if (!entry) return null;
    const authTime = Math.floor(Date.now() / 1000) - entry[1];
    const uid = entry[3] ?? entry[0];
    return { uid, isAnonymous: entry[2], claims: { admin: false, auth_time: authTime } };
  }),
}));

const fake = fakeFirestore();
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { handlePendingActionRoutes } = await import('../pending-action-routes.js');
const { createPendingAction } = await import('../../services/approvals/pending-actions.js');

let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    await bindVerifiedIdentity(req);
    const url = new URL(req.url || '/', 'http://local');
    if (!(await handlePendingActionRoutes(req, res, url.pathname))) res.writeHead(418).end();
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
  fake.docs.clear();
  vi.stubEnv('APPROVALS_PAGE', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const TEXT = { to: '+15551230000', body: 'Running 10 min late, sorry!' };

function aliceAction() {
  return createPendingAction('alice', 'send_text', TEXT);
}

function read(id: string, token: string) {
  return fetch(`${base}/api/pending-actions/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function decide(id: string, token: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/pending-actions/${id}/decision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const statusOf = (id: string) => fake.docs.get(`pending_actions/${id}`)?.status;

describe('GET /api/pending-actions/:id', () => {
  it('shows the owner the stored payload exactly, with its hash', async () => {
    const { id, actionHash } = await aliceAction();
    const res = await read(id, 'alice-fresh');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const { action } = (await res.json()) as { action: Record<string, unknown> };
    expect(action).toMatchObject({
      id,
      kind: 'send_text',
      payload: TEXT,
      actionHash,
      status: 'pending',
    });
    expect(action).not.toHaveProperty('userId');
  });

  it("answers another user's action exactly like a missing one", async () => {
    const { id } = await aliceAction();
    const byBob = await read(id, 'bob-fresh');
    const missing = await read('x'.repeat(43), 'bob-fresh');
    expect(byBob.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await byBob.json()).toEqual(await missing.json());
  });

  it('is not there while APPROVALS_PAGE is off', async () => {
    const { id } = await aliceAction();
    vi.stubEnv('APPROVALS_PAGE', '');
    expect((await read(id, 'alice-fresh')).status).toBe(404);
  });
});

describe('POST /api/pending-actions/:id/decision', () => {
  it('approves with a fresh sign-in and the shown hash', async () => {
    const { id, actionHash } = await aliceAction();
    const res = await decide(id, 'alice-fresh', { decision: 'approve', actionHash });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'approved' });
    expect(statusOf(id)).toBe('approved');
  });

  it('lets another user decide nothing (404), and leaves the action pending', async () => {
    const { id, actionHash } = await aliceAction();
    expect((await decide(id, 'bob-fresh', { decision: 'approve', actionHash })).status).toBe(404);
    expect(statusOf(id)).toBe('pending');
  });

  it('asks for a fresh sign-in when the last one is older than 5 minutes, or anonymous', async () => {
    const { id, actionHash } = await aliceAction();
    for (const token of ['alice-stale', 'alice-anon']) {
      const res = await decide(id, token, { decision: 'approve', actionHash });
      expect(res.status).toBe(401);
      expect(((await res.json()) as { code: string }).code).toBe('REAUTH_REQUIRED');
    }
    expect(statusOf(id)).toBe('pending');
  });

  it('never takes a bearer token that belongs to someone else as the fresh sign-in', async () => {
    const { id, actionHash } = await aliceAction();
    const res = await decide(id, 'alice-with-bobs-token', { decision: 'approve', actionHash });
    expect(res.status).toBe(401);
    expect(statusOf(id)).toBe('pending');
  });

  it('answers 404 to a service API key, which is never a person', async () => {
    const { id, actionHash } = await aliceAction();
    expect((await read(id, 'service-key')).status).toBe(404);
    expect((await decide(id, 'service-key', { decision: 'approve', actionHash })).status).toBe(404);
    expect(statusOf(id)).toBe('pending');
  });

  it('lets the owner decline without signing in again', async () => {
    const { id, actionHash } = await aliceAction();
    const res = await decide(id, 'alice-stale', { decision: 'decline', actionHash });
    expect(res.status).toBe(200);
    expect(statusOf(id)).toBe('declined');
  });

  it('refuses a hash for a different action', async () => {
    const { id } = await aliceAction();
    const other = await createPendingAction('alice', 'send_text', { ...TEXT, body: 'other' });
    const res = await decide(id, 'alice-fresh', {
      decision: 'approve',
      actionHash: other.actionHash,
    });
    expect(res.status).toBe(409);
    expect(statusOf(id)).toBe('pending');
  });

  it('refuses cross-site style requests: wrong content type or foreign origin', async () => {
    const { id, actionHash } = await aliceAction();
    const form = await decide(
      id,
      'alice-fresh',
      { decision: 'approve', actionHash },
      { 'content-type': 'text/plain' }
    );
    const foreign = await decide(
      id,
      'alice-fresh',
      { decision: 'approve', actionHash },
      { origin: 'https://evil.example' }
    );
    expect(form.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(statusOf(id)).toBe('pending');
    const sameSite = await decide(
      id,
      'alice-fresh',
      { decision: 'approve', actionHash },
      { origin: 'https://app.ferni.ai' }
    );
    expect(sameSite.status).toBe(200);
  });

  it('records an expired action as expired (410), never approved', async () => {
    const { id, actionHash } = await aliceAction();
    const key = `pending_actions/${id}`;
    fake.docs.set(key, { ...fake.docs.get(key), expiresAt: Date.now() - 1 });
    expect((await decide(id, 'alice-fresh', { decision: 'approve', actionHash })).status).toBe(410);
    expect(statusOf(id)).toBe('pending');
  });

  it('refuses money-moving actions without a passkey', async () => {
    const { id, actionHash } = await createPendingAction('alice', 'purchase', {
      item: 'Running shoes',
      amountCents: 12999,
      currency: 'USD',
      merchant: 'Example Shoes',
    });
    const res = await decide(id, 'alice-fresh', { decision: 'approve', actionHash });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('PASSKEY_REQUIRED');
    expect(statusOf(id)).toBe('pending');
  });

  it('rejects a malformed answer', async () => {
    const { id, actionHash } = await aliceAction();
    expect((await decide(id, 'alice-fresh', { decision: 'maybe', actionHash })).status).toBe(400);
  });
});
