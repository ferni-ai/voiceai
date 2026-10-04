/**
 * GET /api/creative/dna — honest Creative DNA for the dashboard.
 *
 * Before: the route returned the in-memory Creative DNA, which nothing ever
 * updates (no client calls watch/complete or POST insights) and which resets
 * every deploy. Every user saw a default "The Newcomer" profile with zero
 * counts and "explorer" style, presented as something Ferni had learned; the
 * topics the voice agent persists from real conversations were never shown.
 * It also trusted ?userId=.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

const loadTopicHistory = vi.fn();
vi.mock('../services/creative-you/persistence.js', () => ({
  getCreativeYouPersistence: () => ({ loadTopicHistory }),
}));

let authedUser: string | null = 'signed-in-user';
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
    if (authedUser) return { userId: authedUser, isAdmin: false };
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return null;
  }),
}));

const { handleCreativeYouRoutes } = await import('../api/routes/creative-you-routes.js');
const { updateCreativeDNA } = await import('../services/creative-you/creative-dna.js');

async function getDna(query = ''): Promise<{ status: number; body: Record<string, unknown> }> {
  const out = { status: 0, body: {} as Record<string, unknown> };
  const req = { method: 'GET', url: `/api/creative/dna${query}`, headers: {} } as IncomingMessage;
  const res = {
    setHeader: vi.fn(),
    writeHead(status: number) {
      out.status = status;
      return this;
    },
    end(chunk?: string) {
      if (chunk) out.body = JSON.parse(chunk);
    },
  } as unknown as ServerResponse;
  await handleCreativeYouRoutes(req, res, '/api/creative/dna', new URLSearchParams(query));
  return out;
}

function history(topics: Array<{ topic: string; count: number }>) {
  return {
    userId: 'signed-in-user',
    topics: topics.map((t) => ({ ...t, lastSeen: new Date(), sessions: ['s1'] })),
    lastUpdated: new Date(),
  };
}

describe('GET /api/creative/dna', () => {
  beforeEach(() => {
    loadTopicHistory.mockReset();
    authedUser = 'signed-in-user';
  });

  it('returns no profile, not a default "Newcomer" one, when nothing real is known', async () => {
    loadTopicHistory.mockResolvedValue(history([]));

    const { status, body } = await getDna();

    expect(status).toBe(200);
    expect(body.dna).toBeNull();
  });

  it('builds interests from the topics persisted from real conversations', async () => {
    loadTopicHistory.mockResolvedValue(
      history([
        { topic: 'gardening', count: 2 },
        { topic: 'marathon training', count: 5 },
      ])
    );

    const { body } = await getDna();
    const dna = body.dna as { topTopics: Array<{ topic: string; score: number }> };

    expect(dna.topTopics).toEqual([
      { topic: 'marathon training', score: 5 },
      { topic: 'gardening', score: 2 },
    ]);
  });

  it('has no style when only conversation topics are known, instead of the default "explorer"', async () => {
    loadTopicHistory.mockResolvedValue(history([{ topic: 'gardening', count: 2 }]));

    const { body } = await getDna();

    expect((body.dna as { learningStyle: unknown }).learningStyle).toBeNull();
  });

  it('keeps the style computed from real watching/listening activity', async () => {
    authedUser = 'active-user';
    for (let i = 0; i < 3; i++) updateCreativeDNA('active-user', { type: 'podcast_listened' });
    loadTopicHistory.mockResolvedValue(history([]));

    const { body } = await getDna();

    // 3 podcasts, 0 videos: calculateLearningStyle says 'audio'
    expect((body.dna as { learningStyle: unknown }).learningStyle).toBe('audio');
  });

  it('reads the signed-in user, ignoring a ?userId= for someone else', async () => {
    loadTopicHistory.mockResolvedValue(history([]));

    await getDna('?userId=someone-else');

    expect(loadTopicHistory).toHaveBeenCalledWith('signed-in-user');
    expect(loadTopicHistory).not.toHaveBeenCalledWith('someone-else');
  });

  it('requires sign-in', async () => {
    authedUser = null;

    const { status } = await getDna('?userId=someone-else');

    expect(status).toBe(401);
    expect(loadTopicHistory).not.toHaveBeenCalled();
  });
});
