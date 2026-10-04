/**
 * Taste match only compares with someone who has played with you.
 *
 * POST /api/musical/taste-match takes the caller as user1 and any user2Id.
 * The result lists user2's genres and decades (sharedGenres, sharedDecades,
 * uniqueToUser2), taken from their private game history. Before, naming any
 * user id was enough to read that. Now user2 must have engaged with the
 * caller: sent them a challenge, or completed one of theirs.
 *
 * Drives the real route and the real in-memory challenge service; the auth
 * verifier and the engagement store (where game history lives) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

vi.mock('../api/auth-middleware.js', () => ({
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

/** Everyone's private game history, and a record of whose was read. */
const readProfiles = vi.hoisted(() => [] as string[]);
vi.mock('../services/engagement/engagement-store.js', () => ({
  getEngagementStore: vi.fn(async () => ({
    getProfile: vi.fn(async (userId: string) => {
      readProfiles.push(userId);
      return {
        gameMemory: {
          genreAffinities: { [`${userId}-secret-genre`]: { category: 'x', affinityScore: 80 } },
          decadeAffinities: { '1980s': { category: '1980s', affinityScore: 70 } },
        },
      };
    }),
  })),
}));

const { handleMusicalYouRoutes } = await import('../api/routes/musical-you-routes.js');
const { sendMusicChallenge, completeChallenge, declineChallenge } =
  await import('../services/musical-you/index.js');

async function tasteMatch(
  caller: string,
  user2Id: string
): Promise<{ status: number; body: string }> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = '/api/musical/taste-match';
  req.headers = { authorization: `Bearer ${caller}` };
  stream.end(JSON.stringify({ user2Id }));

  const out = { status: 200, body: '' };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    end: vi.fn((data?: string) => {
      out.body = data ?? '';
    }),
  } as unknown as ServerResponse;
  await handleMusicalYouRoutes(req, res, '/api/musical/taste-match', new URLSearchParams());
  return out;
}

describe('POST /api/musical/taste-match', () => {
  beforeEach(() => {
    readProfiles.length = 0;
  });

  it('refuses to compare with a stranger and never reads their history (403)', async () => {
    const res = await tasteMatch('alice', 'stranger');

    expect(readProfiles).not.toContain('stranger');
    expect(res.body).not.toContain('stranger-secret-genre');
    expect(res.status).toBe(403);
  });

  it('refuses when alice only sent them a challenge they never answered', async () => {
    await sendMusicChallenge('alice', 'Alice', 'ignorer', 'guess', 5);

    const res = await tasteMatch('alice', 'ignorer');

    expect(readProfiles).not.toContain('ignorer');
    expect(res.status).toBe(403);
  });

  it('refuses when they declined it', async () => {
    const { id } = await sendMusicChallenge('alice', 'Alice', 'decliner', 'guess', 5);
    await declineChallenge(id);

    expect((await tasteMatch('alice', 'decliner')).status).toBe(403);
  });

  it('compares once they completed a challenge from alice', async () => {
    const { id } = await sendMusicChallenge('alice', 'Alice', 'player', 'guess', 5);
    await completeChallenge(id, 7);

    const res = await tasteMatch('alice', 'player');

    expect(res.status).toBe(200);
    expect(res.body).toContain('player-secret-genre');
  });

  it('compares with someone who challenged alice', async () => {
    await sendMusicChallenge('challenger', 'C', 'alice', 'guess', 5);

    expect((await tasteMatch('alice', 'challenger')).status).toBe(200);
  });
});
