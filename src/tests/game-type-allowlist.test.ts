/**
 * Game types come from a closed list.
 *
 * Before (security review of 0df93cb15): any name matching
 * /^[A-Za-z0-9_-]{1,40}$/ was a game type.
 * - "__proto__" matched. stats.gameStats["__proto__"] is Object.prototype, so
 *   recording a social result under it incremented gamesPlayed, totalScore…
 *   on Object.prototype: every object in the process.
 * - A client could mint unlimited game types, each a per-instance cached
 *   board that was never evicted, plus Firestore fields and board documents.
 *   Musical You board caches also grew by a key per period, without a cap.
 *
 * Real routes and services over the shared fake Firestore (K_SERVICE set);
 * only the token verifier is mocked.
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

/** What a polluted Object.prototype would carry (GameStats fields). */
const STAT_FIELDS = [
  'gamesPlayed',
  'totalScore',
  'highScore',
  'averageScore',
  'accuracy',
  'fastestTimeMs',
  'lastPlayedAt',
];
const proto = Object.prototype as unknown as Record<string, unknown>;

let api: ApiInstance;

beforeEach(async () => {
  resetFakeFirestore(fake);
  vi.stubEnv('K_SERVICE', 'api');
  api = await startInstance();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  for (const field of STAT_FIELDS) delete proto[field]; // undo any pollution
});

const result = { score: 50, correctAnswers: 4, totalQuestions: 5, timeMs: 900, usedHints: false };

describe('(a) "__proto__" and friends are not game types', () => {
  for (const gameType of ['__proto__', 'constructor', 'prototype', 'hasOwnProperty']) {
    it(`social stats/update under "${gameType}": 400, Object.prototype untouched`, async () => {
      const res = await call(api.social, 'POST', '/api/social/stats/update', 'pat', {
        gameType,
        result,
      });
      expect(({} as Record<string, unknown>).gamesPlayed).toBeUndefined();
      expect(({} as Record<string, unknown>).totalScore).toBeUndefined();
      expect(res.status).toBe(400);
    });

    it(`musical record under "${gameType}": 400, no board written`, async () => {
      const res = await call(api.musical, 'POST', '/api/musical/record', 'pat', {
        gameType,
        score: 5,
      });
      expect(res.status).toBe(400);
      expect([...fake.docs.keys()].filter((p) => p.startsWith('musical_leaderboards/'))).toEqual(
        []
      );
    });
  }

  it('the service refuses one too, and own-property lookups never see the prototype', async () => {
    const stats = await import('../services/social/user-stats.js');
    await expect(stats.updateUserStats('pat', '__proto__', result)).rejects.toThrow(/game type/);
    expect(({} as Record<string, unknown>).gamesPlayed).toBeUndefined();
    const record = stats.createInitialStats('pat', 'Pat');
    expect(stats.ownGameStats(record, '__proto__')).toBeUndefined();
    expect(stats.ownGameStats(record, 'toString')).toBeUndefined();
  });

  it('a real game still records', async () => {
    const res = await call(api.social, 'POST', '/api/social/stats/update', 'pat', {
      gameType: 'decade-challenge',
      result,
    });
    expect(res.status).toBe(200);
    const music = await call(api.musical, 'POST', '/api/musical/record', 'pat', {
      gameType: 'finish-the-lyric',
      score: 5,
    });
    expect(music.status).toBe(200);
  });
});

describe('(b) unknown game types are refused, and caches stay bounded', () => {
  const unknown = Array.from({ length: 40 }, (_, i) => `made-up-game-${i}`);

  it('every route refuses each of 40 made-up game types and caches nothing for them', async () => {
    const statuses: number[] = [];
    for (const gameType of unknown) {
      const reqs = [
        call(api.social, 'GET', '/api/social/leaderboard', null, {}, { gameType }),
        call(
          api.social,
          'GET',
          '/api/social/leaderboard/around',
          null,
          {},
          {
            gameType,
            userId: 'pat',
          }
        ),
        call(api.musical, 'GET', '/api/musical/leaderboard', null, {}, { gameType }),
        call(api.social, 'POST', '/api/social/stats/update', 'pat', { gameType, result }),
        call(api.musical, 'POST', '/api/musical/record', 'pat', { gameType, score: 5 }),
        call(api.musical, 'POST', '/api/musical/challenge', 'pat', {
          gameType,
          challengeeId: 'vic',
          challengerScore: 5,
        }),
      ];
      statuses.push(...(await Promise.all(reqs)).map((r) => r.status));
    }
    expect(new Set(statuses)).toEqual(new Set([400]));

    const social = await import('../services/social/leaderboards.js');
    const musical = await import('../services/musical-you/leaderboard-store.js');
    expect(social.cachedLeaderboardCount()).toBe(0);
    expect(musical.cachedBoardCount()).toBe(0);
  });

  it('the Musical You board cache is capped as weeks go by', async () => {
    const musical = await import('../services/musical-you/leaderboard-store.js');
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let week = 0; week < 260; week++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 0, 5) + week * 7 * 24 * 3600_000));
      await musical.getLeaderboard('weekly', 'name-that-tune');
    }
    expect(musical.cachedBoardCount()).toBeLessThanOrEqual(200);
    expect(musical.cachedBoardCount()).toBeGreaterThan(0);
  });
});
