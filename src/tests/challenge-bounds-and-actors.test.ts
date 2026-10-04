/**
 * Challenge stores are bounded, and their state changes are bound to the actor
 * in the service itself, not only in the route.
 *
 * Before:
 * - a challenger could open unlimited challenges, and nothing rate-limited
 *   creation;
 * - every list read all of a user's records from the store (no query limit);
 * - completeChallenge/declineChallenge took no actor, so any code path that
 *   reached the service could answer someone else's challenge. The taste-match
 *   gate (otherUserHasEngaged) counted any "completed" challenge, so alice could
 *   challenge carol, complete it herself and read carol's game history.
 *
 * Real routes and services; Firestore is the shared fake (K_SERVICE set), the
 * token verifier is mocked, and rateLimit is the real one when a test turns it on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { call, startInstance, type ApiInstance, type Json } from './helpers/api-instances.js';
import { resetFakeFirestore } from './helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('./helpers/fake-firestore.js')).newFakeFirestoreState()
);
const limiter = vi.hoisted(() => ({ real: false }));

vi.mock('../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('./helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});

vi.mock('../api/auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auth-middleware.js')>();
  return {
    rateLimit: vi.fn((...args: Parameters<typeof actual.rateLimit>) =>
      limiter.real ? actual.rateLimit(...args) : false
    ),
    requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return null;
      }
      return { userId: header.slice(7), isAdmin: false };
    }),
  };
});

let api: ApiInstance;
let musical: typeof import('../services/musical-you/index.js');
let social: typeof import('../services/social/multiplayer-games.js');

beforeEach(async () => {
  resetFakeFirestore(fake);
  limiter.real = false;
  vi.stubEnv('K_SERVICE', 'api');
  api = await startInstance();
  musical = await import('../services/musical-you/index.js');
  social = await import('../services/social/multiplayer-games.js');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const sendMusical = async (from: string, to: string) =>
  call(api.musical, 'POST', '/api/musical/challenge', from, {
    challengeeId: to,
    gameType: 'guess',
    challengerScore: 5,
  });
const createSocial = async (from: string, to: string) =>
  call(api.social, 'POST', '/api/social/challenges/create', from, {
    type: 'score-beat',
    gameType: 'guess',
    challengerName: from,
    challengeeId: to,
    challengerScore: 5,
  });
const idOf = (body: Json) => (body.challenge as { id: string }).id;

const statuses = (results: Array<{ status: number }>) => ({
  ok: results.filter((r) => r.status === 200).length,
  limited: results.filter((r) => r.status === 429).length,
});

describe('caps hold under concurrency (one transaction per create)', () => {
  it('social: 60 concurrent creates from one sender -> exactly 50 succeed, 10 get 429', async () => {
    const results = await Promise.all(
      Array.from({ length: 60 }, async (_, i) => createSocial('racer', `r${i}`))
    );
    expect(statuses(results)).toEqual({ ok: 50, limited: 10 });
  });

  it('musical: 60 concurrent sends from one sender -> exactly 50 succeed, 10 get 429', async () => {
    const results = await Promise.all(
      Array.from({ length: 60 }, async (_, i) => sendMusical('racer', `r${i}`))
    );
    expect(statuses(results)).toEqual({ ok: 50, limited: 10 });
  });

  it("90 senders at once can't flood one victim: 50 land, the pending list stays bounded", async () => {
    const results = await Promise.all(
      Array.from({ length: 90 }, async (_, i) => createSocial(`a${i}`, 'victim'))
    );
    expect(statuses(results)).toEqual({ ok: 50, limited: 40 });

    fake.reads = 0;
    const pending = await call(api.social, 'GET', '/api/social/challenges/pending', 'victim');
    expect((pending.body.challenges as unknown[]).length).toBe(50);
    expect(fake.reads).toBeLessThanOrEqual(100);
  });

  it('one sender gets one open challenge per recipient, however many they send at once', async () => {
    const social30 = await Promise.all(
      Array.from({ length: 30 }, async () => createSocial('griefer', 'victim'))
    );
    expect(statuses(social30)).toEqual({ ok: 1, limited: 29 });
    const musical30 = await Promise.all(
      Array.from({ length: 30 }, async () => sendMusical('griefer', 'victim'))
    );
    expect(statuses(musical30)).toEqual({ ok: 1, limited: 29 });
    // Others may still challenge the victim, and the griefer may challenge others.
    expect((await createSocial('friend', 'victim')).status).toBe(200);
    expect((await createSocial('griefer', 'someone-else')).status).toBe(200);
  });

  it('answering frees the slot: a declined challenge lets the sender send again', async () => {
    const ids = [];
    for (let i = 0; i < 50; i++) ids.push(idOf((await createSocial('full', `f${i}`)).body));
    expect((await createSocial('full', 'one-more')).status).toBe(429);

    const declined = await call(api.social, 'POST', '/api/social/challenges/decline', 'f0', {
      challengeId: ids[0],
    });
    expect(declined.status).toBe(200);
    expect((await createSocial('full', 'one-more')).status).toBe(200);
  });
});

describe('bounds', () => {
  it('musical: the 51st open challenge from one sender is 429; others may still send', async () => {
    for (let i = 0; i < 50; i++) expect((await sendMusical('spammer', `u${i}`)).status).toBe(200);
    expect((await sendMusical('spammer', 'u50')).status).toBe(429);
    expect((await sendMusical('alice', 'carol')).status).toBe(200);
  });

  it('social: the 51st open challenge from one sender is 429', async () => {
    for (let i = 0; i < 50; i++) expect((await createSocial('spammer', `u${i}`)).status).toBe(200);
    expect((await createSocial('spammer', 'u50')).status).toBe(429);
  });

  it('creation is rate limited per caller (20 a minute)', async () => {
    limiter.real = true;
    for (let i = 0; i < 20; i++) expect((await createSocial('burst', `v${i}`)).status).toBe(200);
    expect((await createSocial('burst', 'v20')).status).toBe(429);
    expect((await sendMusical('burst2', 'x')).status).toBe(200);
  });

  it('lists read a bounded number of records, however many a user has', async () => {
    const now = Date.now();
    for (let i = 0; i < 1000; i++) {
      const base = {
        challengerId: `sender${i}`,
        challengeeId: 'busy',
        status: 'pending',
        createdAt: new Date(now - i).toISOString(),
        expiresAt: new Date(now + 86_400_000).toISOString(),
      };
      fake.docs.set(`musical_challenges/m${i}`, { ...base, id: `m${i}`, challengerScore: 1 });
      fake.docs.set(`social_challenges/s${i}`, { ...base, id: `s${i}`, type: 'score-beat' });
    }

    fake.reads = 0;
    await call(api.musical, 'GET', '/api/musical/challenges', 'busy', {}, { userId: 'busy' });
    expect(fake.reads).toBeLessThanOrEqual(200);

    fake.reads = 0;
    await call(api.social, 'GET', '/api/social/challenges/pending', 'busy');
    expect(fake.reads).toBeLessThanOrEqual(100);

    fake.reads = 0;
    const history = await call(api.social, 'GET', '/api/social/challenges/history', 'busy');
    expect(fake.reads).toBeLessThanOrEqual(200);
    expect((history.body.challenges as unknown[]).length).toBe(20);
  });
});

describe('musical service binds answers to the challengee', () => {
  it('refuses a non-challengee completing or declining; the challenge stays pending', async () => {
    const id = idOf((await sendMusical('alice', 'carol')).body);

    expect(await musical.completeChallenge(id, { userId: 'mallory' }, 9)).toBeNull();
    expect(await musical.declineChallenge(id, { userId: 'mallory' })).toBeNull();
    expect((await musical.getChallenge(id))?.status).toBe('pending');
  });

  it("forge attempt: alice completing her own challenge to carol doesn't open carol's history", async () => {
    const id = idOf((await sendMusical('alice', 'carol')).body);

    expect(await musical.completeChallenge(id, { userId: 'alice' }, 9)).toBeNull();
    expect(await musical.otherUserHasEngaged('alice', 'carol')).toBe(false);
  });

  it('carol completing records completedBy and opens the gate; an admin may act for her', async () => {
    const id = idOf((await sendMusical('alice', 'carol')).body);
    const done = await musical.completeChallenge(id, { userId: 'carol' }, 9);
    expect(done?.completedBy).toBe('carol');
    expect(await musical.otherUserHasEngaged('alice', 'carol')).toBe(true);

    const other = idOf((await sendMusical('alice', 'dave')).body);
    const declined = await musical.declineChallenge(other, { userId: 'ops', isAdmin: true });
    expect(declined?.declinedBy).toBe('ops');
    expect(await musical.otherUserHasEngaged('alice', 'dave')).toBe(false);
  });
});

describe('social service binds answers to the challengee', () => {
  it('refuses a non-challengee accepting, completing or declining', async () => {
    const id = idOf((await createSocial('alice', 'carol')).body);
    expect(await social.acceptChallenge(id, { userId: 'mallory' }, 'M')).toBeNull();
    expect(await social.declineChallenge(id, { userId: 'mallory' })).toBe(false);

    const accepted = await call(api.social, 'POST', '/api/social/challenges/accept', 'carol', {
      challengeId: id,
      challengeeName: 'Carol',
    });
    expect(accepted.status).toBe(200);
    expect(await social.completeChallenge(id, { userId: 'mallory' }, 0)).toBeNull();
    expect(await social.completeChallenge(id, { userId: 'alice' }, 0)).toBeNull();
    expect((await social.getChallenge(id))?.status).toBe('accepted');

    const done = await social.completeChallenge(id, { userId: 'carol' }, 9);
    expect(done?.completedBy).toBe('carol');
    expect(done?.acceptedBy).toBe('carol');
  });
});

describe('expired challenges free their slots', () => {
  const DAY = 24 * 3600_000;
  const slotsOf = (collection: string, uid: string) =>
    fake.docs.get(`${collection}/${uid}`) as { sent: object; received: object };
  afterEach(() => {
    vi.useRealTimers();
  });

  it('social: answering an expired challenge marks it expired, frees both slots, allows a new one', async () => {
    const first = idOf((await createSocial('sam', 'vic')).body);
    expect((await createSocial('sam', 'vic')).status).toBe(429); // one open per pair

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * DAY); // challenges expire after 7 days
    const late = await call(api.social, 'POST', '/api/social/challenges/accept', 'vic', {
      challengeId: first,
      challengeeName: 'Vic',
    });
    expect(late.status).toBe(404);
    expect((await social.getChallenge(first))?.status).toBe('expired');
    expect(slotsOf('social_open_challenge_slots', 'vic').received).toEqual({});
    expect(slotsOf('social_open_challenge_slots', 'sam').sent).toEqual({});
    expect((await createSocial('sam', 'vic')).status).toBe(200);
  });

  it('musical: completing an expired challenge is refused and marks it expired', async () => {
    const id = idOf((await sendMusical('sam', 'vic')).body);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * DAY);

    const late = await call(api.musical, 'POST', `/api/musical/challenge/${id}/complete`, 'vic', {
      score: 9,
    });
    expect(late.status).toBe(409);
    expect((await musical.getChallenge(id))?.status).toBe('expired');
    expect(slotsOf('musical_open_challenge_slots', 'vic').received).toEqual({});
  });
});
