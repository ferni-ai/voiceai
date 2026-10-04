/**
 * Client-reported game results are bounded, and sibling routes check the same
 * things.
 *
 * Before (security review of c1041aceb):
 * - POST /api/social/stats/update stored any `result`: a 1e300 or negative
 *   score went onto the leaderboard, as did counts that make no sense;
 *   challenge scores (both services) and Musical You record scores had no
 *   range; a social challenge could have any type, and a user could
 *   challenge themselves and farm wins; nothing rate-limited recording.
 * - GET /api/social/leaderboard accepted any period and scope (each new
 *   combination is cached per instance for good), and /leaderboard/around
 *   checked none of its parameters, unlike the Musical You board routes.
 * - GET /api/musical/challenges listed anyone's challenges without
 *   credentials, while the social pending/history routes require the caller.
 *
 * Real routes and services over the shared fake Firestore (K_SERVICE set);
 * the token verifier is mocked, and rateLimit is the real one when a test
 * turns it on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { call, startInstance, type ApiInstance, type Json } from './helpers/api-instances.js';
import { resetFakeFirestore } from './helpers/fake-firestore.js';
import { gameResultFrom, isScore, isOptionalTime } from '../api/routes/score-input.js';

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

beforeEach(async () => {
  resetFakeFirestore(fake);
  limiter.real = false;
  vi.stubEnv('K_SERVICE', 'api');
  api = await startInstance();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const good = { score: 50, correctAnswers: 4, totalQuestions: 5, timeMs: 900, usedHints: false };
const statsUpdate = async (uid: string, result: Json, gameType = 'guess') =>
  call(api.social, 'POST', '/api/social/stats/update', uid, { gameType, result });
const totalScore = async (uid: string) => {
  const res = await call(api.social, 'GET', '/api/social/stats', null, {}, { userId: uid });
  return (res.body.stats as { totalScore: number }).totalScore;
};

describe('the bounds themselves', () => {
  it('reject NaN, Infinity, negatives and huge values', () => {
    for (const bad of [NaN, Infinity, -Infinity, -1, 1e300, '50', null]) {
      expect(isScore(bad)).toBe(false);
    }
    expect(isOptionalTime(NaN)).toBe(false);
    expect(isOptionalTime(undefined)).toBe(true);
    expect(gameResultFrom({ ...good, score: Infinity })).toBeNull();
    expect(gameResultFrom(good)).toEqual(good);
  });
});

describe('POST /api/social/stats/update bounds the result', () => {
  const bad: Array<[string, Json]> = [
    ['a huge score', { ...good, score: 1e300 }],
    ['a negative score', { ...good, score: -500 }],
    ['a score that is a string', { ...good, score: '50' }],
    ['a missing score (NaN or Infinity arrive as null)', { ...good, score: null }],
    ['more correct answers than questions', { ...good, correctAnswers: 9 }],
    ['a fractional count', { ...good, totalQuestions: 2.5 }],
    ['a negative time', { ...good, timeMs: -1 }],
    ['no usedHints', { ...good, usedHints: undefined }],
  ];
  for (const [what, result] of bad) {
    it(`${what}: 400, nothing recorded`, async () => {
      const res = await statsUpdate('pat', result);
      expect(res.status).toBe(400);
      expect(await totalScore('pat')).toBe(0);
    });
  }

  it("'overall' isn't a game type to record under", async () => {
    expect((await statsUpdate('pat', good, 'overall')).status).toBe(400);
  });

  it('a result in range is recorded', async () => {
    expect((await statsUpdate('pat', good)).status).toBe(200);
    expect(await totalScore('pat')).toBe(50);
  });

  it('recording is rate limited per user (30 a minute)', async () => {
    limiter.real = true;
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await statsUpdate('rapid', good)).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(30);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('POST /api/musical/record bounds the score', () => {
  const record = async (body: Json) =>
    call(api.musical, 'POST', '/api/musical/record', 'pat', { gameType: 'guess', ...body });

  it('rejects a huge or negative score, and negative or fractional counts', async () => {
    for (const body of [
      { score: 1e300 },
      { score: -1 },
      { score: 5, gamesPlayed: -3 },
      { score: 5, bestStreak: 1.5 },
    ]) {
      expect((await record(body)).status).toBe(400);
    }
    const board = await call(
      api.musical,
      'GET',
      '/api/musical/leaderboard',
      null,
      {},
      {
        gameType: 'guess',
      }
    );
    expect((board.body.leaderboard as { entries: unknown[] }).entries).toEqual([]);
    expect((await record({ score: 5 })).status).toBe(200);
  });
});

describe('POST /api/musical/daily/complete bounds the score', () => {
  it('rejects a huge or negative score', async () => {
    for (const score of [1e300, -1, '9']) {
      const res = await call(api.musical, 'POST', '/api/musical/daily/complete', 'pat', {
        challengeId: 'daily-1',
        score,
      });
      expect(res.status).toBe(400);
    }
  });
});

describe('challenge scores, types and self-challenges', () => {
  const createSocial = async (from: string, body: Json) =>
    call(api.social, 'POST', '/api/social/challenges/create', from, {
      type: 'score-beat',
      gameType: 'guess',
      challengerName: from,
      challengeeId: 'vic',
      challengerScore: 5,
      ...body,
    });
  const sendMusical = async (from: string, body: Json) =>
    call(api.musical, 'POST', '/api/musical/challenge', from, {
      challengeeId: 'vic',
      gameType: 'guess',
      challengerScore: 5,
      ...body,
    });

  it('social create: unknown type, out-of-range score or time, or yourself -> 400', async () => {
    expect((await createSocial('sam', { type: 'free-win' })).status).toBe(400);
    expect((await createSocial('sam', { challengerScore: 1e300 })).status).toBe(400);
    expect((await createSocial('sam', { challengerTimeMs: -5 })).status).toBe(400);
    expect((await createSocial('sam', { challengeeId: 'sam' })).status).toBe(400);
    expect((await createSocial('sam', {})).status).toBe(200);
  });

  it('musical send: out-of-range score or yourself -> 400', async () => {
    expect((await sendMusical('sam', { challengerScore: -1 })).status).toBe(400);
    expect((await sendMusical('sam', { challengerScore: 1e300 })).status).toBe(400);
    expect((await sendMusical('sam', { challengeeId: 'sam' })).status).toBe(400);
    expect((await sendMusical('sam', {})).status).toBe(200);
  });

  it('social complete: an out-of-range score is 400 and the challenge stays accepted', async () => {
    const id = ((await createSocial('sam', {})).body.challenge as { id: string }).id;
    await call(api.social, 'POST', '/api/social/challenges/accept', 'vic', {
      challengeId: id,
      challengeeName: 'Vic',
    });
    const res = await call(api.social, 'POST', '/api/social/challenges/complete', 'vic', {
      challengeId: id,
      challengeeScore: 1e300,
    });
    expect(res.status).toBe(400);
    const after = await call(api.social, 'GET', `/api/social/challenges/${id}`, null);
    expect((after.body.challenge as { status: string }).status).toBe('accepted');
  });

  it('musical complete: an out-of-range score is 400 and the challenge stays pending', async () => {
    const id = ((await sendMusical('sam', {})).body.challenge as { id: string }).id;
    const res = await call(api.musical, 'POST', `/api/musical/challenge/${id}/complete`, 'vic', {
      score: -10,
    });
    expect(res.status).toBe(400);
    const after = await call(api.musical, 'GET', `/api/musical/challenge/${id}`, null);
    expect((after.body.challenge as { status: string }).status).toBe('pending');
  });

  it('taste-match answers must be text and a time in range', async () => {
    const created = await call(api.social, 'POST', '/api/social/tastematch/create', 'ann', {
      hostDisplayName: 'Ann',
    });
    const sessionId = (created.body.session as { id: string }).id;
    await call(api.social, 'POST', '/api/social/tastematch/join', 'ben', {
      sessionId,
      displayName: 'Ben',
    });
    for (const who of ['ann', 'ben']) {
      await call(api.social, 'POST', '/api/social/tastematch/ready', who, { sessionId });
    }
    const answer = async (body: Json) =>
      call(api.social, 'POST', '/api/social/tastematch/answer', 'ann', { sessionId, ...body });

    expect((await answer({ answer: { not: 'text' }, timeMs: 900 })).status).toBe(400);
    expect((await answer({ answer: '3', timeMs: -1 })).status).toBe(400);
    expect((await answer({ answer: '3', timeMs: 900 })).status).toBe(200);
  });
});

describe('sibling routes check the same things', () => {
  it('social leaderboard: an unknown period or scope is 400, like the musical board type', async () => {
    const board = async (query: Record<string, string>) =>
      (await call(api.social, 'GET', '/api/social/leaderboard', null, {}, query)).status;
    expect(await board({ period: 'forever' })).toBe(400);
    expect(await board({ scope: 'everyone' })).toBe(400);
    expect(await board({ period: 'monthly', scope: 'global' })).toBe(200);
  });

  it('social leaderboard/around: checks its game type and period, like musical rank', async () => {
    const around = async (query: Record<string, string>) =>
      (
        await call(
          api.social,
          'GET',
          '/api/social/leaderboard/around',
          null,
          {},
          {
            userId: 'pat',
            ...query,
          }
        )
      ).status;
    expect(await around({ gameType: 'guess.totalScore' })).toBe(400);
    expect(await around({ period: 'forever' })).toBe(400);
    expect(await around({ gameType: 'guess' })).toBe(200);
  });

  it("musical challenges list: only the caller's own, like social pending/history", async () => {
    await call(api.musical, 'POST', '/api/musical/challenge', 'sam', {
      challengeeId: 'bob',
      gameType: 'guess',
      challengerScore: 5,
    });
    const list = async (caller: string | null) =>
      call(api.musical, 'GET', '/api/musical/challenges', caller, {}, { userId: 'bob' });

    expect((await list(null)).status).toBe(401);
    expect((await list('mallory')).status).toBe(403);
    const own = await list('bob');
    expect(own.status).toBe(200);
    expect((own.body.challenges as unknown[]).length).toBe(1);
  });
});
