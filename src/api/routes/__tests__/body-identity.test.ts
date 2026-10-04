/**
 * The request identity layer (bindVerifiedIdentity) rewrites ?userId= and
 * x-user-id, but cannot see a JSON body. The daily-challenge writes and the
 * share-card generator took `body.userId` as the actor, so user A could start,
 * complete or streak-freeze user B's challenges, or publish a card in B's
 * name. These tests drive the real route handlers over a real HTTP server,
 * behind the real identity layer, exactly as src/servers/api/index.ts mounts
 * them. Only the Firebase verifier and the data services are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKENS: Record<string, { uid: string; admin?: boolean }> = {
  'tok-A': { uid: 'user-A' },
  'tok-admin': { uid: 'admin-1', admin: true },
};
vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const who = TOKENS[token];
    return who ? { uid: who.uid, claims: { admin: who.admin === true } } : null;
  }),
}));

const challenges = vi.hoisted(() => {
  const stats = { currentStreak: 2, longestStreak: 5, totalXpEarned: 40 };
  return {
    startChallenge: vi.fn((userId: string, challengeId: string) => ({ userId, challengeId })),
    completeChallenge: vi.fn((userId: string) => ({ userId, xpEarned: 10 })),
    useStreakFreeze: vi.fn((_userId: string) => true),
    getChallengeStats: vi.fn((_userId: string) => ({ ...stats, totalChallengesCompleted: 1 })),
    getTodaysChallenge: vi.fn(() => ({ id: 'c-today' })),
    getUpcomingChallenges: vi.fn(() => []),
    hasCompletedTodaysChallenge: vi.fn(() => false),
    getChallengeHistory: vi.fn(() => []),
    isStreakAtRisk: vi.fn(() => ({ atRisk: false, hoursRemaining: 9 })),
    getChallengeNotificationContent: vi.fn(() => ({})),
  };
});
vi.mock('../../../services/engagement/daily-challenges.js', () => challenges);

// Cards persist through getFirestoreDb(); capture what gets written.
const savedCards = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const doc = () => ({ set: async (d: Record<string, unknown>) => void savedCards.push(d) });
  return { ...real, getFirestoreDb: () => ({ collection: () => ({ doc }) }) };
});

const { bindVerifiedIdentity } = await import('../../../servers/api/request-identity.js');
const { handleChallengeRoutes } = await import('../challenge-routes.js');
const { handleShareRoutes } = await import('../share-routes.js');

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      // Same order as src/servers/api/index.ts, with production identity rules.
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url || '/', 'http://local');
      const handled = url.pathname.startsWith('/api/challenges')
        ? await handleChallengeRoutes(req, res, url.pathname, url.searchParams)
        : await handleShareRoutes(req, res, url.pathname);
      if (!handled) res.writeHead(404).end();
    })();
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
  vi.clearAllMocks();
  savedCards.length = 0;
});

async function post(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/** Every user id the challenge service was asked to act on. */
const actedOn = (): string[] =>
  [challenges.startChallenge, challenges.completeChallenge, challenges.useStreakFreeze].flatMap(
    (fn) => fn.mock.calls.map((call) => String(call[0]))
  );

describe('challenge writes act only on the verified caller', () => {
  const writes: Array<[string, Record<string, unknown>]> = [
    ['/api/challenges/start', { challengeId: 'c-today' }],
    ['/api/challenges/complete', { challengeId: 'c-today', score: 90 }],
    ['/api/challenges/streak-freeze', {}],
  ];

  it.each(writes)('%s: user A naming user B is refused and B is untouched', async (path, b) => {
    const { status } = await post(path, { ...b, userId: 'user-B' }, 'tok-A');
    expect(status).toBe(403);
    expect(actedOn()).toEqual([]);
  });

  it.each(writes)('%s: no credentials is 401, even with a body userId', async (path, b) => {
    const { status } = await post(path, { ...b, userId: 'user-B' });
    expect(status).toBe(401);
    expect(actedOn()).toEqual([]);
  });

  it.each(writes)('%s: user A acting on themselves still works', async (path, b) => {
    const { status } = await post(path, { ...b, userId: 'user-A' }, 'tok-A');
    expect(status).toBe(200);
    expect(actedOn()).toEqual(['user-A']);
  });

  it('a body without userId acts on the caller', async () => {
    const { status, json } = await post('/api/challenges/start', { challengeId: 'c1' }, 'tok-A');
    expect(status).toBe(200);
    expect(json.progress).toEqual({ userId: 'user-A', challengeId: 'c1' });
  });

  it('a verified admin may act for the user they name', async () => {
    const { status } = await post(
      '/api/challenges/streak-freeze',
      { userId: 'user-B' },
      'tok-admin'
    );
    expect(status).toBe(200);
    expect(actedOn()).toEqual(['user-B']);
  });

  it('a GET ?userId= naming another user reads the caller, not them', async () => {
    const res = await fetch(`${base}/api/challenges/stats?userId=user-B`, {
      headers: { Authorization: 'Bearer tok-A' },
    });
    expect(res.status).toBe(200);
    expect(challenges.getChallengeStats.mock.calls.map((c) => c[0])).toEqual(['user-A']);
  });
});

describe('share cards are generated in the verified caller name only', () => {
  const data = { type: 'game-victory', gameType: 'quiz', gameDisplayName: 'Quiz', score: 9 };
  const card = { type: 'game-victory', data: { ...data, isPersonalBest: false } };

  it('user A naming user B is refused and no card is saved', async () => {
    const { status } = await post(
      '/api/share/cards/generate',
      { ...card, userId: 'user-B' },
      'tok-A'
    );
    expect(status).toBe(403);
    expect(savedCards).toEqual([]);
  });

  it('no credentials is 401 and no card is saved', async () => {
    const { status } = await post('/api/share/cards/generate', { ...card, userId: 'user-B' });
    expect(status).toBe(401);
    expect(savedCards).toEqual([]);
  });

  it('user A generating their own card still works, with or without userId', async () => {
    const own = await post('/api/share/cards/generate', { ...card, userId: 'user-A' }, 'tok-A');
    const implicit = await post('/api/share/cards/generate', card, 'tok-A');
    expect([own.status, implicit.status]).toEqual([200, 200]);
    expect(savedCards.map((c) => c.userId)).toEqual(['user-A', 'user-A']);
  });

  it('a verified admin may generate a card for the user they name', async () => {
    const { status } = await post(
      '/api/share/cards/generate',
      { ...card, userId: 'user-B' },
      'tok-admin'
    );
    expect(status).toBe(200);
    expect(savedCards.map((c) => c.userId)).toEqual(['user-B']);
  });
});
