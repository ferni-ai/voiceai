/**
 * Public leaderboards don't hand out account ids.
 *
 * GET /api/musical/leaderboard and /api/social/leaderboard(/around) need no
 * credentials, and every entry carried the player's userId (their Firebase
 * uid). Entries now carry rank, display name and score, and `isCurrentUser`
 * marks the signed-in viewer's own row (the viewer comes from x-firebase-uid,
 * which only bindVerifiedIdentity sets, from a verified token).
 *
 * Real routes and real (in-memory) leaderboard services; nothing is mocked.
 * (Leaderboards are cached 30 s per instance; each board here is first read
 * after its writes.)
 */
import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

const { handleMusicalYouRoutes } = await import('../api/routes/musical-you-routes.js');
const { handleSocialRoutes } = await import('../api/routes/social-routes.js');
const { updateLeaderboardEntry } = await import('../services/musical-you/index.js');
const { updateUserStats } = await import('../services/social/leaderboards.js');

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: URLSearchParams
) => Promise<boolean>;

async function get(
  handler: Handler,
  path: string,
  query: Record<string, string>,
  viewer: string | null
): Promise<{ status: number; raw: string; body: Record<string, unknown> }> {
  const headers = viewer ? { 'x-firebase-uid': viewer } : {};
  const req = { method: 'GET', url: path, headers } as unknown as IncomingMessage;
  const out = { status: 200, raw: '', body: {} as Record<string, unknown> };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    end: vi.fn((data?: string) => {
      out.raw = data ?? '';
      out.body = JSON.parse(out.raw || '{}') as Record<string, unknown>;
    }),
  } as unknown as ServerResponse;
  await handler(req, res, path, new URLSearchParams(query));
  return out;
}

type Row = { displayName: string; isCurrentUser: boolean; userId?: string };

describe('GET /api/musical/leaderboard', () => {
  it('lists players by name with no uid, and flags the viewer', async () => {
    await updateLeaderboardEntry('weekly', 'overall', 'uid-secret-aaa', 'Ada', 90, 3, 2);
    await updateLeaderboardEntry('weekly', 'overall', 'uid-secret-bbb', 'Bo', 70, 2, 1);

    const res = await get(handleMusicalYouRoutes, '/api/musical/leaderboard', {}, 'uid-secret-bbb');

    expect(res.status).toBe(200);
    expect(res.raw).not.toContain('uid-secret');
    const rows = (res.body.leaderboard as { entries: Row[] }).entries;
    expect(rows.map((r) => r.displayName)).toEqual(['Ada', 'Bo']);
    expect(rows.map((r) => r.isCurrentUser)).toEqual([false, true]);
  });
});

describe('GET /api/social/leaderboard', () => {
  const result = { score: 50, correctAnswers: 5, totalQuestions: 5, timeMs: 1, usedHints: false };

  it('lists players with no uid, and flags the viewer', async () => {
    await updateUserStats('uid-secret-ccc', 'name-that-tune', result);
    await updateUserStats('uid-secret-ddd', 'name-that-tune', { ...result, score: 80 });

    const res = await get(handleSocialRoutes, '/api/social/leaderboard', {}, 'uid-secret-ccc');

    expect(res.status).toBe(200);
    expect(res.raw).not.toContain('uid-secret');
    const rows = (res.body.leaderboard as { entries: Row[] }).entries;
    expect(rows.filter((r) => r.isCurrentUser)).toHaveLength(1);
  });

  it('/around: no uid in the neighbours', async () => {
    const res = await get(
      handleSocialRoutes,
      '/api/social/leaderboard/around',
      { userId: 'uid-secret-ccc' },
      'uid-secret-ccc'
    );

    expect(res.status).toBe(200);
    expect(res.raw).not.toContain('uid-secret-ddd');
    expect((res.body.entries as Row[]).some((r) => r.isCurrentUser)).toBe(true);
  });
});
