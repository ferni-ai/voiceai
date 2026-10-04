/**
 * Only the challengee answers a Musical You challenge.
 *
 * Before: POST /api/musical/challenge/:id/complete and /decline took no
 * credentials and never looked at who was calling, so anyone holding a
 * challenge id could decline someone else's challenge or submit a score in
 * their name (and decide the winner).
 *
 * Drives the real route and the real (in-memory) challenge service; only the
 * auth verifier is mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

// The verifier: "Bearer <uid>" is a verified token for <uid>; "Bearer admin" is an admin.
vi.mock('../api/auth-middleware.js', () => ({
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

const { handleMusicalYouRoutes } = await import('../api/routes/musical-you-routes.js');
const { sendMusicChallenge, getChallenge } = await import('../services/musical-you/index.js');

async function post(
  path: string,
  body: Record<string, unknown>,
  caller: string | null
): Promise<number> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = caller ? { authorization: `Bearer ${caller}` } : {};
  stream.end(JSON.stringify(body));

  let status = 200;
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  await handleMusicalYouRoutes(req, res, path, new URLSearchParams());
  return status;
}

/** A fresh pending challenge from alice to carol. */
async function aliceChallengesCarol(): Promise<string> {
  return (await sendMusicChallenge('alice', 'Alice', 'carol', 'guess', 5)).id;
}

describe('answering a Musical You challenge', () => {
  for (const action of ['complete', 'decline'] as const) {
    const body = action === 'complete' ? { score: 99 } : {};

    it(`${action}: mallory answering carol's challenge gets 403; it stays pending`, async () => {
      const id = await aliceChallengesCarol();
      expect((await getChallenge(id))?.status).toBe('pending');

      const status = await post(`/api/musical/challenge/${id}/${action}`, body, 'mallory');

      expect(status).toBe(403);
      expect((await getChallenge(id))?.status).toBe('pending');
      expect((await getChallenge(id))?.challengeeScore).toBeUndefined();
    });

    it(`${action}: the challenger can't answer their own challenge either (403)`, async () => {
      const id = await aliceChallengesCarol();

      const status = await post(`/api/musical/challenge/${id}/${action}`, body, 'alice');

      expect(status).toBe(403);
      expect((await getChallenge(id))?.status).toBe('pending');
    });

    it(`${action}: no credentials gets 401; it stays pending`, async () => {
      const id = await aliceChallengesCarol();

      const status = await post(`/api/musical/challenge/${id}/${action}`, body, null);

      expect(status).toBe(401);
      expect((await getChallenge(id))?.status).toBe('pending');
    });

    it(`${action}: an unknown id gets 404`, async () => {
      const status = await post(`/api/musical/challenge/nope/${action}`, body, 'carol');

      expect(status).toBe(404);
    });
  }

  it('carol completes her own challenge and the result is recorded', async () => {
    const id = await aliceChallengesCarol();

    const status = await post(`/api/musical/challenge/${id}/complete`, { score: 9 }, 'carol');

    expect(status).toBe(200);
    expect((await getChallenge(id))?.status).toBe('completed');
    expect((await getChallenge(id))?.challengeeScore).toBe(9);
    expect((await getChallenge(id))?.winnerId).toBe('carol');
  });

  it('carol declines her own challenge', async () => {
    const id = await aliceChallengesCarol();

    const status = await post(`/api/musical/challenge/${id}/decline`, {}, 'carol');

    expect(status).toBe(200);
    expect((await getChallenge(id))?.status).toBe('declined');
  });

  it('an admin may answer for the challengee', async () => {
    const id = await aliceChallengesCarol();

    const status = await post(`/api/musical/challenge/${id}/decline`, {}, 'admin');

    expect(status).toBe(200);
    expect((await getChallenge(id))?.status).toBe('declined');
  });

  it('carol completing without a score gets 400 and the challenge stays pending', async () => {
    const id = await aliceChallengesCarol();

    const status = await post(`/api/musical/challenge/${id}/complete`, {}, 'carol');

    expect(status).toBe(400);
    expect((await getChallenge(id))?.status).toBe('pending');
  });
});
