/**
 * Leaderboards are the same on every API instance.
 *
 * Musical You boards and social game stats lived in a Map in each process, so
 * each Cloud Run instance showed its own leaderboard: a score recorded on one
 * instance was missing on the others. Here two instances (separate loads of
 * the real routes and services) share one fake Firestore (K_SERVICE set); only
 * the token verifier is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { call, startInstance, type ApiInstance } from './helpers/api-instances.js';
import { resetFakeFirestore } from './helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('./helpers/fake-firestore.js')).newFakeFirestoreState()
);

vi.mock('../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('./helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});

vi.mock('../api/auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: header.slice(7), isAdmin: false };
  }),
}));

interface Row {
  displayName: string;
  score: number;
  rank: number;
}
const rowsOf = (body: Record<string, unknown>) =>
  (body.leaderboard as { entries: Row[] }).entries.map((r) => [r.displayName, r.score, r.rank]);

const DAY = 24 * 3600_000;

describe('Leaderboards across API instances', () => {
  let one: ApiInstance;
  let two: ApiInstance;

  beforeEach(async () => {
    resetFakeFirestore(fake);
    vi.stubEnv('K_SERVICE', 'api');
    one = await startInstance();
    two = await startInstance();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('musical: results recorded at once on two instances show on both, without uids', async () => {
    const record = async (api: ApiInstance, uid: string, name: string, score: number) =>
      call(api.musical, 'POST', '/api/musical/record', uid, {
        displayName: name,
        gameType: 'name-that-tune',
        score,
      });
    const results = await Promise.all([
      record(one, 'uid-secret-ann', 'Ann', 70),
      record(two, 'uid-secret-ben', 'Ben', 90),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);

    for (const api of [one, two]) {
      for (const gameType of ['overall', 'name-that-tune']) {
        const board = await call(
          api.musical,
          'GET',
          '/api/musical/leaderboard',
          null,
          {},
          {
            gameType,
          }
        );
        expect(board.status).toBe(200);
        expect(board.raw).not.toContain('uid-secret');
        expect(rowsOf(board.body)).toEqual([
          ['Ben', 90, 1],
          ['Ann', 70, 2],
        ]);
      }
    }

    const rank = await call(
      two.musical,
      'GET',
      '/api/musical/leaderboard/rank',
      'uid-secret-ann',
      {},
      {
        userId: 'uid-secret-ann',
      }
    );
    expect((rank.body.rank as Row).rank).toBe(2);
  });

  it('social: stats updates sent at once to two instances all count', async () => {
    const result = { score: 10, correctAnswers: 1, totalQuestions: 2, timeMs: 5, usedHints: true };
    const updates = await Promise.all(
      Array.from({ length: 10 }, async (_, i) =>
        call(i % 2 ? two.social : one.social, 'POST', '/api/social/stats/update', 'uid-secret-cy', {
          gameType: 'name-that-tune',
          result,
        })
      )
    );
    expect(updates.map((u) => u.status)).toEqual(Array(10).fill(200));

    for (const api of [one, two]) {
      const stats = await call(
        api.social,
        'GET',
        '/api/social/stats',
        null,
        {},
        {
          userId: 'uid-secret-cy',
        }
      );
      const s = stats.body.stats as { totalGamesPlayed: number; totalScore: number };
      expect([s.totalGamesPlayed, s.totalScore]).toEqual([10, 100]);
    }
  });

  it('social: the same leaderboard on both instances, without uids', async () => {
    const result = { score: 40, correctAnswers: 2, totalQuestions: 2, timeMs: 5, usedHints: false };
    await call(one.social, 'POST', '/api/social/stats/update', 'uid-secret-di', {
      gameType: 'name-that-tune',
      result,
    });
    await call(two.social, 'POST', '/api/social/stats/update', 'uid-secret-ed', {
      gameType: 'name-that-tune',
      result: { ...result, score: 60 },
    });

    const boards = await Promise.all(
      [one, two].map(async (api) =>
        call(api.social, 'GET', '/api/social/leaderboard', null, {}, { period: 'all-time' })
      )
    );
    for (const board of boards) {
      expect(board.status).toBe(200);
      expect(board.raw).not.toContain('uid-secret');
      expect(rowsOf(board.body).map(([name, score]) => [name, score])).toEqual([
        ['Player', 60],
        ['Player', 40],
      ]);
    }
  });

  it('weekly entries expire 90 days after their week ends; all-time entries never do', async () => {
    await call(one.musical, 'POST', '/api/musical/record', 'uid-secret-fy', {
      displayName: 'Fy',
      gameType: 'name-that-tune',
      score: 5,
    });
    const entries = fake.writes.filter((w) => w.path.startsWith('musical_leaderboards/'));
    const weekly = entries.filter((w) => w.path.includes('/weekly_'));
    const allTime = entries.filter((w) => w.path.includes('/all-time_'));
    expect(weekly.length).toBeGreaterThan(0);
    expect(allTime.length).toBeGreaterThan(0);
    for (const w of weekly) {
      expect(w.data.ttlAt).toBeInstanceOf(Date);
      const days = ((w.data.ttlAt as Date).getTime() - Date.now()) / DAY;
      expect(days).toBeGreaterThan(90);
      expect(days).toBeLessThanOrEqual(97);
    }
    for (const w of allTime) expect(w.data.ttlAt).toBeUndefined();
  });

  it('rejects a game type that is not a plain name', async () => {
    const bad = await call(one.musical, 'POST', '/api/musical/record', 'uid-secret-gi', {
      gameType: '../../x',
      score: 1,
    });
    expect(bad.status).toBe(400);
    const board = await call(
      one.musical,
      'GET',
      '/api/musical/leaderboard',
      null,
      {},
      {
        type: 'yearly',
      }
    );
    expect(board.status).toBe(400);
  });
});
