/**
 * Musical You writes act on the verified caller, not on a user the body names.
 *
 * Before: every POST under /api/musical took its user from the body with no
 * credential check at all — so anyone could connect their Apple Music or
 * Spotify library to another account, record game results and leaderboard
 * scores as them, add to their "our songs", start/complete their daily
 * challenges, send challenges in their name, or generate cards and taste
 * matches from their game history.
 *
 * Drives the real route; only the auth verifier and the Musical You data
 * services (plus the engagement store) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const NAMES = [
  'getMusicalDNA',
  'generateCoachingMessage',
  'generateTimeMachine',
  'getMusicalYouProfile',
  'recordGameResult',
  'getDailyChallenge',
  'getUpcomingChallenges',
  'getUserChallengeProgress',
  'startDailyChallenge',
  'completeDailyChallenge',
  'getUserChallengeStats',
  'sendMusicChallenge',
  'getUserChallenges',
  'getChallenge',
  'completeChallenge',
  'declineChallenge',
  'getLeaderboard',
  'getTopEntries',
  'getUserRank',
  'calculateTasteMatch',
  'describeTasteMatch',
  'getUserSocialStats',
  'generateDNACard',
  'generateDesertIslandCard',
  'generateGameVictoryCard',
  'getCard',
  'getUserCards',
  'generateMusicalDNASVG',
  'generateDesertIslandSVG',
  'generateVictorySVG',
  'syncSpotifyLibrary',
  'getSpotifyLibrary',
  'hasEnoughPlayableContent',
  'getOurSongsPlaylist',
  'addOurSong',
  'generateAppleMusicToken',
  'syncAppleMusicLibrary',
  'getAppleMusicLibrary',
  'isAppleMusicConnected',
  'analyzeAppleMusicTaste',
  'getHeavyRotationTracks',
  'getRecentlyPlayedTracks',
] as const;

const svc = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
vi.mock('../services/musical-you/index.js', () => {
  for (const name of NAMES) svc[name] = vi.fn();
  return svc;
});

const getProfile = vi.hoisted(() => vi.fn());
vi.mock('../services/engagement/engagement-store.js', () => ({
  getEngagementStore: vi.fn(async () => ({ getProfile })),
}));

// The verifier: "Bearer <uid>" is a verified token for <uid>.
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

const { handleMusicalYouRoutes } = await import('../api/routes/musical-you-routes.js');

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
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  await handleMusicalYouRoutes(req, res, path, new URLSearchParams());
  return status;
}

/** Each write, the field that names the acting user, and the rest of a valid body. */
const WRITES: Array<{ path: string; field: string; body: Record<string, unknown> }> = [
  { path: '/api/musical/daily/start', field: 'userId', body: { challengeId: 'd1' } },
  { path: '/api/musical/daily/complete', field: 'userId', body: { challengeId: 'd1', score: 9 } },
  {
    path: '/api/musical/challenge',
    field: 'challengerId',
    body: { challengeeId: 'carol', gameType: 'guess', challengerScore: 5 },
  },
  { path: '/api/musical/taste-match', field: 'user1Id', body: { user2Id: 'carol' } },
  { path: '/api/musical/cards/dna', field: 'userId', body: {} },
  { path: '/api/musical/cards/island', field: 'userId', body: { picks: { songs: [] } } },
  { path: '/api/musical/cards/victory', field: 'userId', body: { gameType: 'guess', score: 9 } },
  { path: '/api/musical/spotify/sync', field: 'userId', body: { accessToken: 'tok' } },
  {
    path: '/api/musical/spotify/our-songs/add',
    field: 'userId',
    body: { song: { trackId: 't', trackName: 'n', artistName: 'a', reason: 'r' } },
  },
  { path: '/api/musical/record', field: 'userId', body: { gameType: 'guess', score: 9 } },
  { path: '/api/musical/apple/connect', field: 'userId', body: { userToken: 'mut' } },
  { path: '/api/musical/apple/sync', field: 'userId', body: { userToken: 'mut' } },
];

function touched(userId: string): boolean {
  const fns = [...Object.values(svc), getProfile];
  return fns.some((fn) => fn.mock.calls.some((args) => args.includes(userId)));
}

describe('Musical You writes act on the verified caller', () => {
  beforeEach(() => {
    for (const fn of Object.values(svc)) fn.mockReset();
    getProfile.mockReset();
    getProfile.mockResolvedValue({ gameMemory: { gamesPlayed: 3 } });
    svc.generateAppleMusicToken.mockResolvedValue('dev-token');
    svc.sendMusicChallenge.mockResolvedValue({ id: 'challenge-1' }); // the service is async
    svc.syncAppleMusicLibrary.mockResolvedValue({
      libraryTrackCount: 3,
      topGenres: [],
      topArtists: [],
      heavyRotation: [],
      recentlyPlayed: [],
    });
  });

  for (const w of WRITES) {
    it(`${w.path}: signed-in alice naming bob in ${w.field} gets 403; bob untouched`, async () => {
      const status = await post(w.path, { ...w.body, [w.field]: 'bob' }, 'alice');

      expect(touched('bob')).toBe(false);
      expect(status).toBe(403);
    });

    it(`${w.path}: no credentials and ${w.field}=bob gets 401; bob untouched`, async () => {
      const status = await post(w.path, { ...w.body, [w.field]: 'bob' }, null);

      expect(touched('bob')).toBe(false);
      expect(status).toBe(401);
    });
  }

  it('alice recording her own game result still works', async () => {
    const status = await post(
      '/api/musical/record',
      { userId: 'alice', gameType: 'guess', score: 9 },
      'alice'
    );

    expect(status).toBe(200);
    expect(svc.recordGameResult).toHaveBeenCalledWith('alice', 'Player', 'guess', 9, 1, 0);
  });

  it('alice connecting her own Apple Music (as the web does) still works', async () => {
    const status = await post(
      '/api/musical/apple/connect',
      { userId: 'alice', userToken: 'mut' },
      'alice'
    );

    expect(status).toBe(200);
    expect(svc.syncAppleMusicLibrary).toHaveBeenCalledWith('alice', 'dev-token', 'mut');
  });

  it('alice may still challenge someone else; the challenger is alice', async () => {
    const status = await post(
      '/api/musical/challenge',
      { challengeeId: 'carol', gameType: 'guess', challengerScore: 5 },
      'alice'
    );

    expect(status).toBe(200);
    expect(svc.sendMusicChallenge.mock.calls[0]?.slice(0, 3)).toEqual([
      'alice',
      'Anonymous',
      'carol',
    ]);
  });
});
