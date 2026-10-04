/**
 * /api/social writes act for the verified caller, and only a challenge's
 * challengee may accept, complete or decline it.
 *
 * Before: no route under /api/social checked credentials. Anyone could
 * accept, complete (and so win) or decline someone else's challenge by
 * naming them in the body. They could also create challenges in another
 * user's name, play or join a taste match as them, overwrite their leaderboard
 * stats, or seed the production leaderboard with made-up players.
 *
 * Drives the real route and the real in-memory social services; only the auth
 * verifier is mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

// The verifier: "Bearer <uid>" is a verified token for <uid>; "Bearer admin" is an admin.
vi.mock('../api/auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    const userId = header.slice(7);
    return { userId, isAdmin: userId === 'admin' };
  }),
}));

const { handleSocialRoutes } = await import('../api/routes/social-routes.js');
const games = await import('../services/social/multiplayer-games.js');
const boards = await import('../services/social/leaderboards.js');

async function post(
  path: string,
  body: Record<string, unknown>,
  caller: string | null
): Promise<{ status: number; body: Record<string, unknown> }> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = caller ? { authorization: `Bearer ${caller}` } : {};
  stream.end(JSON.stringify(body));

  const out = { status: 200, body: {} as Record<string, unknown> };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    end: vi.fn((data?: string) => {
      out.body = JSON.parse(data || '{}') as Record<string, unknown>;
    }),
  } as unknown as ServerResponse;
  await handleSocialRoutes(req, res, path, new URLSearchParams());
  return out;
}

/** A fresh pending challenge from alice to carol. */
async function aliceChallengesCarol(): Promise<string> {
  const challenge = await games.createChallenge('score-beat', 'guess', 'alice', 'Alice', 'carol', {
    challengerScore: 5,
  });
  return challenge.id;
}

const status = async (id: string) => (await games.getChallenge(id))?.status;

describe('answering a social challenge', () => {
  it("accept: mallory naming carol gets 403; carol's challenge stays pending", async () => {
    const id = await aliceChallengesCarol();
    const res = await post(
      '/api/social/challenges/accept',
      { challengeId: id, challengeeId: 'carol', challengeeName: 'Carol' },
      'mallory'
    );
    expect(await status(id)).toBe('pending');
    expect(res.status).toBe(403);
  });

  it("accept: mallory naming herself gets 403 (it isn't her challenge)", async () => {
    const id = await aliceChallengesCarol();
    const res = await post(
      '/api/social/challenges/accept',
      { challengeId: id, challengeeName: 'Mallory' },
      'mallory'
    );
    expect(await status(id)).toBe('pending');
    expect(res.status).toBe(403);
  });

  it('accept: no credentials gets 401', async () => {
    const id = await aliceChallengesCarol();
    const res = await post(
      '/api/social/challenges/accept',
      { challengeId: id, challengeeId: 'carol', challengeeName: 'Carol' },
      null
    );
    expect(await status(id)).toBe('pending');
    expect(res.status).toBe(401);
  });

  it('accept: an unknown challenge gets 404', async () => {
    const res = await post(
      '/api/social/challenges/accept',
      { challengeId: 'nope', challengeeName: 'Carol' },
      'carol'
    );
    expect(res.status).toBe(404);
  });

  it('complete: only carol can finish her accepted challenge and decide the winner', async () => {
    const id = await aliceChallengesCarol();
    expect(
      (
        await post(
          '/api/social/challenges/accept',
          { challengeId: id, challengeeName: 'Carol' },
          'carol'
        )
      ).status
    ).toBe(200);

    const byMallory = await post(
      '/api/social/challenges/complete',
      { challengeId: id, challengeeScore: 0 },
      'mallory'
    );
    expect(await status(id)).toBe('accepted');
    expect(byMallory.status).toBe(403);

    const byAlice = await post(
      '/api/social/challenges/complete',
      { challengeId: id, challengeeScore: 0 },
      'alice'
    );
    expect(await status(id)).toBe('accepted');
    expect(byAlice.status).toBe(403);

    const byCarol = await post(
      '/api/social/challenges/complete',
      { challengeId: id, challengeeScore: 9 },
      'carol'
    );
    expect(byCarol.status).toBe(200);
    expect(await status(id)).toBe('completed');
    expect((await games.getChallenge(id))?.winnerId).toBe('carol');
  });

  it('complete: no credentials gets 401', async () => {
    const id = await aliceChallengesCarol();
    const res = await post(
      '/api/social/challenges/complete',
      { challengeId: id, challengeeScore: 9 },
      null
    );
    expect(res.status).toBe(401);
  });

  it("decline: mallory naming carol gets 403; carol's challenge stays pending", async () => {
    const id = await aliceChallengesCarol();
    const res = await post(
      '/api/social/challenges/decline',
      { challengeId: id, challengeeId: 'carol' },
      'mallory'
    );
    expect(await status(id)).toBe('pending');
    expect(res.status).toBe(403);
  });

  it('decline: unknown id 404, no credentials 401, carol herself 200', async () => {
    const id = await aliceChallengesCarol();
    expect(
      (await post('/api/social/challenges/decline', { challengeId: 'x' }, 'carol')).status
    ).toBe(404);
    expect((await post('/api/social/challenges/decline', { challengeId: id }, null)).status).toBe(
      401
    );
    const res = await post('/api/social/challenges/decline', { challengeId: id }, 'carol');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await status(id)).toBe('declined');
  });

  it('an admin may answer for the challengee', async () => {
    const id = await aliceChallengesCarol();
    const res = await post('/api/social/challenges/decline', { challengeId: id }, 'admin');
    expect(res.status).toBe(200);
    expect(await status(id)).toBe('declined');
  });
});

describe('other /api/social writes act on the verified caller', () => {
  it("create: alice can't send a challenge as bob (403); as herself it works", async () => {
    const asBob = await post(
      '/api/social/challenges/create',
      {
        type: 'score-beat',
        gameType: 'guess',
        challengerId: 'bob',
        challengerName: 'Bob',
        challengeeId: 'carol',
      },
      'alice'
    );
    expect(asBob.status).toBe(403);

    const asAlice = await post(
      '/api/social/challenges/create',
      { type: 'score-beat', gameType: 'guess', challengerName: 'Alice', challengeeId: 'carol' },
      'alice'
    );
    expect(asAlice.status).toBe(200);
    expect((asAlice.body.challenge as { challengerId: string }).challengerId).toBe('alice');
  });

  it("stats/update: alice can't overwrite bob's stats", async () => {
    const before = boards.getUserStats('bob-stats').totalGamesPlayed;
    const res = await post(
      '/api/social/stats/update',
      {
        userId: 'bob-stats',
        gameType: 'guess',
        result: { score: 999, correctAnswers: 9, totalQuestions: 9, timeMs: 1, usedHints: false },
      },
      'alice'
    );
    expect(boards.getUserStats('bob-stats').totalGamesPlayed).toBe(before);
    expect(res.status).toBe(403);
  });

  it("tastematch: alice can't host, join, ready or answer as bob", async () => {
    const session = games.createTasteMatchSession('host-h', 'Host', 3);
    for (const [path, body] of [
      ['/api/social/tastematch/create', { hostUserId: 'bob', hostDisplayName: 'Bob' }],
      ['/api/social/tastematch/join', { sessionId: session.id, userId: 'bob', displayName: 'B' }],
      ['/api/social/tastematch/ready', { sessionId: session.id, userId: 'host-h' }],
      ['/api/social/tastematch/answer', { sessionId: session.id, userId: 'host-h', answer: 'a' }],
    ] as const) {
      expect((await post(path, body, 'alice')).status).toBe(403);
    }
    expect(games.getTasteMatchSession(session.id)?.participants.map((p) => p.userId)).toEqual([
      'host-h',
    ]);
  });

  it('seed: a signed-in non-admin gets 403; an admin may seed', async () => {
    expect((await post('/api/social/seed', {}, 'alice')).status).toBe(403);
    expect((await post('/api/social/seed', {}, null)).status).toBe(401);
    expect((await post('/api/social/seed', {}, 'admin')).status).toBe(200);
  });
});

async function get(
  path: string,
  query: Record<string, string>,
  caller: string | null
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = caller ? { authorization: `Bearer ${caller}` } : {};
  const req = { method: 'GET', url: path, headers } as unknown as IncomingMessage;
  const out = { status: 200, body: {} as Record<string, unknown> };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    end: vi.fn((data?: string) => {
      out.body = JSON.parse(data || '{}') as Record<string, unknown>;
    }),
  } as unknown as ServerResponse;
  await handleSocialRoutes(req, res, path, new URLSearchParams(query));
  return out;
}

const ids = (body: Record<string, unknown>) =>
  ((body.challenges ?? []) as Array<{ id: string }>).map((c) => c.id);

describe('GET /api/social/challenges/pending and /history', () => {
  it("pending returns the caller's own incoming challenges, not someone else's", async () => {
    const forDana = (await games.createChallenge('score-beat', 'guess', 'erin', 'Erin', 'dana')).id;
    const forFrank = (await games.createChallenge('score-beat', 'guess', 'erin', 'Erin', 'frank'))
      .id;

    const res = await get('/api/social/challenges/pending', {}, 'dana');

    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual([forDana]);
    expect(ids(res.body)).not.toContain(forFrank);
  });

  it("history returns the caller's sent and received challenges", async () => {
    const sent = (await games.createChallenge('score-beat', 'guess', 'gail', 'Gail', 'hank')).id;
    const received = (await games.createChallenge('score-beat', 'guess', 'ivan', 'Ivan', 'gail'))
      .id;
    await games.createChallenge('score-beat', 'guess', 'ivan', 'Ivan', 'hank');

    const res = await get('/api/social/challenges/history', {}, 'gail');

    expect(res.status).toBe(200);
    expect(ids(res.body).sort()).toEqual([sent, received].sort());
  });

  it("naming someone else's userId gets 403; no credentials gets 401", async () => {
    const named = await get('/api/social/challenges/pending', { userId: 'dana' }, 'mallory');
    expect(named.status).toBe(403);
    expect((await get('/api/social/challenges/history', {}, null)).status).toBe(401);
  });

  it('a real challenge id still resolves through /challenges/:id', async () => {
    const id = (await games.createChallenge('score-beat', 'guess', 'erin', 'Erin', 'dana')).id;

    const res = await get(`/api/social/challenges/${id}`, {}, null);

    expect(res.status).toBe(200);
    expect((res.body.challenge as { id: string }).id).toBe(id);
  });
});
