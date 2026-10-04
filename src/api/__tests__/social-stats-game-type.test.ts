/**
 * POST /api/social/stats/update takes gameType from the request body and used
 * it as a key into a plain object. `__proto__` read back Object.prototype, and
 * the stats update then wrote gamesPlayed/totalScore/accuracy onto every
 * object in the API process. POST /api/social/seed, unauthenticated in
 * production despite its "development only" comment, put ten made-up players
 * on the live leaderboard.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { handleSocialRoutes } from '../routes/social-routes.js';
import { getLeaderboard, isValidGameType } from '../../services/social/leaderboards.js';

const POLLUTED = ['gamesPlayed', 'totalScore', 'highScore', 'averageScore', 'accuracy', 'gameType'];

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { 'content-type': 'application/json' };
  void Promise.resolve().then(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

function response(): ServerResponse & { status?: number; body?: string } {
  const res = {
    setHeader: () => res,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(chunk?: string) {
      res.body = chunk;
      return res;
    },
  } as unknown as ServerResponse & { status?: number; body?: string };
  return res;
}

async function call(method: string, pathname: string, body?: unknown) {
  const res = response();
  const handled = await handleSocialRoutes(
    request(method, pathname, body),
    res,
    pathname,
    new URLSearchParams()
  );
  return { handled, status: res.status };
}

const result = { score: 50, correctAnswers: 3, totalQuestions: 5, timeMs: 9000, usedHints: false };

afterEach(() => {
  for (const key of POLLUTED) delete (Object.prototype as Record<string, unknown>)[key];
});

describe('social stats game type', () => {
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'refuses %s without touching Object.prototype',
    async (gameType) => {
      const { status } = await call('POST', '/api/social/stats/update', {
        userId: 'proto-attacker',
        gameType,
        result,
      });

      expect(status).toBe(400);
      for (const key of POLLUTED) expect(Object.hasOwn(Object.prototype, key)).toBe(false);
      expect(({} as Record<string, unknown>).gamesPlayed).toBeUndefined();
    }
  );

  it('still records real game types', async () => {
    for (const gameType of ['name-that-tune', '20-questions', 'threeWordDay']) {
      const { status } = await call('POST', '/api/social/stats/update', {
        userId: `player-${gameType}`,
        gameType,
        result,
      });
      expect(status).toBe(200);
    }
    expect(getLeaderboard('all-time', 'name-that-tune', 'global').entries.length).toBeGreaterThan(
      0
    );
  });

  it('accepts real names and rejects keys that reach Object.prototype', () => {
    expect(isValidGameType('name-that-tune')).toBe(true);
    expect(isValidGameType('__proto__')).toBe(false);
    expect(isValidGameType('valueOf')).toBe(false);
    expect(isValidGameType('a'.repeat(41))).toBe(false);
    expect(isValidGameType(42)).toBe(false);
  });

  it('no longer serves the seed route that put fake players on the live board', async () => {
    const { handled } = await call('POST', '/api/social/seed');
    expect(handled).toBe(false);
    const names = getLeaderboard('all-time', 'overall', 'global').entries.map((e) => e.displayName);
    expect(names).not.toContain('MusicMaster99');
  });
});
