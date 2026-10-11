/**
 * Answer cards over real HTTP: only the owner reads a card.
 *
 * The server dispatches the way src/servers/api/index.ts does
 * (bindVerifiedIdentity, then the route). Token verification and Firestore
 * are faked; the card is written by the real createAnswerCard.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKENS: Record<string, string> = { 'token-alice': 'alice', 'token-bob': 'bob' };

vi.mock('../auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth-middleware.js')>();
  const verify = async (req: http.IncomingMessage) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const userId = TOKENS[token];
    return userId
      ? { userId, isAdmin: false, isDevMode: false, authMethod: 'firebase' as const }
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

const docs = new Map<string, unknown>();
const fakeDb = {
  collection: (name: string) => ({
    doc: (id: string) => ({
      set: async (data: unknown) => void docs.set(`${name}/${id}`, structuredClone(data)),
      get: async () => {
        const data = docs.get(`${name}/${id}`);
        return { exists: data !== undefined, data: () => data };
      },
    }),
  }),
};

vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fakeDb }));

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { handleAnswerCardRoutes } = await import('../answer-card-routes.js');
const { createAnswerCard } = await import('../../services/approvals/answer-cards.js');

let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    await bindVerifiedIdentity(req);
    const url = new URL(req.url || '/', 'http://local');
    if (!(await handleAnswerCardRoutes(req, res, url.pathname))) res.writeHead(418).end();
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
  docs.clear();
  vi.stubEnv('APPROVALS_PAGE', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function get(path: string, token?: string) {
  return fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

async function aliceCard(): Promise<string> {
  const { id, url } = await createAnswerCard('alice', {
    kind: 'recommendation',
    answerText: 'Try calf raises, 3 sets of 15.',
    sources: [{ title: 'Shin splints', url: 'https://example.org/shins' }],
    searchSuggestionsHtml: '<div class="chip">shin splint stretches</div>',
  });
  expect(url.endsWith(`/a/${id}`)).toBe(true);
  return id;
}

describe('GET /api/answer-cards/:id', () => {
  it('shows the owner their card, without the owner id', async () => {
    const id = await aliceCard();
    const res = await get(`/api/answer-cards/${id}`, 'token-alice');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const { card } = (await res.json()) as { card: Record<string, unknown> };
    expect(card).toMatchObject({
      id,
      kind: 'recommendation',
      answerText: 'Try calf raises, 3 sets of 15.',
      sources: [{ title: 'Shin splints', url: 'https://example.org/shins' }],
      searchSuggestionsHtml: '<div class="chip">shin splint stretches</div>',
    });
    expect(typeof card.createdAt).toBe('number');
    expect(card).not.toHaveProperty('userId');
  });

  it("answers another user's card exactly like a missing one", async () => {
    const id = await aliceCard();
    const byBob = await get(`/api/answer-cards/${id}`, 'token-bob');
    const missing = await get(`/api/answer-cards/${'x'.repeat(43)}`, 'token-bob');
    expect(byBob.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await byBob.json()).toEqual(await missing.json());
  });

  it('needs a signed-in user', async () => {
    const id = await aliceCard();
    expect((await get(`/api/answer-cards/${id}`)).status).toBe(401);
  });

  it('is not there while APPROVALS_PAGE is off', async () => {
    const id = await aliceCard();
    vi.stubEnv('APPROVALS_PAGE', '');
    expect((await get(`/api/answer-cards/${id}`, 'token-alice')).status).toBe(404);
  });

  it('refuses ids that are not 256-bit card ids, even for a stored doc', async () => {
    docs.set('answer_cards/short', { id: 'short', userId: 'alice', answerText: 'x', sources: [] });
    expect((await get('/api/answer-cards/short', 'token-alice')).status).toBe(404);
  });

  it('only answers GET', async () => {
    const id = await aliceCard();
    const res = await fetch(`${base}/api/answer-cards/${id}`, {
      method: 'POST',
      headers: { authorization: 'Bearer token-alice' },
    });
    expect(res.status).toBe(404);
  });

  it('leaves other paths to other routes', async () => {
    expect((await get('/api/answer-cardsx', 'token-alice')).status).toBe(418);
  });
});
