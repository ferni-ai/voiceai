/**
 * Creative You writes act on the verified caller, not on a user the body names.
 *
 * Before: POST /api/creative/watch/start, /watch/complete, /intelligent/track
 * and /insights took their user from body.userId with no credential check, so
 * anyone could log watch sessions into, rewrite the Creative DNA of, or save
 * insights onto another user's profile.
 *
 * Drives the real route; only the auth verifier and the Creative You data
 * services are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const data = vi.hoisted(() => ({
  startWatchSession: vi.fn(),
  completeWatchSession: vi.fn(),
  updateCreativeDNA: vi.fn(),
  saveInsight: vi.fn(),
  generateLearningTrackForUser: vi.fn(),
}));

vi.mock('../services/creative-you/youtube-integration.js', () => ({
  getVideoRecommendations: vi.fn(),
  getVideoById: vi.fn(),
  getDailyVideoPick: vi.fn(),
  startWatchSession: data.startWatchSession,
  completeWatchSession: data.completeWatchSession,
  getWatchHistory: vi.fn(),
  getYouTubeEmbedUrl: vi.fn(),
}));
vi.mock('../services/creative-you/creative-dna.js', () => ({
  updateCreativeDNA: data.updateCreativeDNA,
  saveInsight: data.saveInsight,
  getInsights: vi.fn(),
  getCreativeJourneyStats: vi.fn(),
  getCreativeProfileCardData: vi.fn(),
}));
vi.mock('../services/creative-you/intelligent-curator.js', () => ({
  getIntelligentRecommendations: vi.fn(),
  generateLearningTrackForUser: data.generateLearningTrackForUser,
}));

// The verifier: "Bearer <uid>" is a verified token for <uid>.
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

const { handleCreativeYouRoutes } = await import('../api/routes/creative-you-routes.js');

async function post(
  path: string,
  body: Record<string, unknown>,
  caller: string | null
): Promise<number> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = caller ? { authorization: `Bearer ${caller}`, 'x-firebase-uid': caller } : {};
  stream.end(JSON.stringify(body));

  let status = 200;
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
      return res;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  await handleCreativeYouRoutes(req, res, path, new URLSearchParams());
  return status;
}

const WRITES = [
  { path: '/api/creative/watch/start', body: { videoId: 'v1' } },
  { path: '/api/creative/watch/complete', body: { sessionId: 's1' } },
  { path: '/api/creative/intelligent/track', body: { topics: ['creativity'] } },
  {
    path: '/api/creative/insights',
    body: { content: 'note', source: { type: 'video', id: 'v1', title: 'T' } },
  },
];

function touched(userId: string): boolean {
  return Object.values(data).some((fn) => fn.mock.calls.some((args) => args.includes(userId)));
}

describe('Creative You writes act on the verified caller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    data.startWatchSession.mockReturnValue({ id: 's1' });
    data.completeWatchSession.mockReturnValue({
      video: { category: 'art', tags: ['color'] },
      percentWatched: 100,
    });
    data.generateLearningTrackForUser.mockReturnValue({ id: 't1' });
    data.saveInsight.mockReturnValue({ id: 'i1' });
  });

  for (const w of WRITES) {
    it(`${w.path}: signed-in alice naming bob gets 403; bob untouched`, async () => {
      const status = await post(w.path, { ...w.body, userId: 'bob' }, 'alice');

      expect(touched('bob')).toBe(false);
      expect(status).toBe(403);
    });

    it(`${w.path}: no credentials and userId=bob gets 401; bob untouched`, async () => {
      const status = await post(w.path, { ...w.body, userId: 'bob' }, null);

      expect(touched('bob')).toBe(false);
      expect(status).toBe(401);
    });

    it(`${w.path}: alice naming herself still works`, async () => {
      const status = await post(w.path, { ...w.body, userId: 'alice' }, 'alice');

      expect(status).toBe(200);
      expect(touched('alice')).toBe(true);
    });
  }

  it('completing a watch session updates only the caller’s Creative DNA', async () => {
    await post('/api/creative/watch/complete', { sessionId: 's1' }, 'alice');

    expect(data.completeWatchSession).toHaveBeenCalledWith('alice', 's1');
    expect(data.updateCreativeDNA).toHaveBeenCalledWith('alice', expect.any(Object));
  });
});
