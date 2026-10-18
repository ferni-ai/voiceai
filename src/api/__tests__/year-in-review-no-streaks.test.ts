/**
 * This Year Together keeps no streaks and claims no unlocks (Seth, 2026-10-11
 * TEAM_BY_NEED: the whole team from the first call, no streak nudges).
 *
 * The 2026-10-18 menu re-audit found the year still returned current/best
 * streaks (the best-streak loop was also wrong after the first gap), a "team
 * members unlocked" count, and, when the team lookup failed, a made-up team of
 * one: "Ferni" as if just unlocked. Review: list all six whatever the API
 * server's TEAM_BY_NEED, and keep the old fields at 0 for one release.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.hoisted(() => vi.fn());
const getTeamUnlockState = vi.hoisted(() => vi.fn());
vi.mock('../auth-middleware.js', () => ({ requireAuth }));
vi.mock('../../services/team-unlocks.js', () => ({ getTeamUnlockState }));
vi.mock('../../memory/store-factory.js', () => ({
  getStore: async () => ({ getProfile: async () => null }),
}));

import { handleYearInReviewRoutes } from '../year-in-review-routes.js';

async function year(): Promise<Record<string, unknown>> {
  const res = {
    statusCode: 200,
    body: '',
    writeHead(status: number) {
      this.statusCode = status;
      return this;
    },
    setHeader() {},
    end(data?: string) {
      this.body = data ?? '';
    },
  };
  const req = { method: 'GET', headers: {} } as IncomingMessage;
  await handleYearInReviewRoutes(req, res as unknown as ServerResponse, {
    pathname: '/api/year-in-review/me-uid',
    query: {},
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ userId: 'me-uid', isAdmin: false });
});

describe('GET /api/year-in-review/:userId', () => {
  it('reports no streaks or unlocks: those fields stay 0 for old tabs only', async () => {
    const stats = (await year()).stats as Record<string, unknown>;

    expect(stats).toHaveProperty('totalConversations');
    // kept for one release so a tab opened before the deploy still renders
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.teamMembersUnlocked).toBe(0);
  });

  it('lists the whole team with no unlock dates, whatever TEAM_BY_NEED says here', async () => {
    vi.stubEnv('TEAM_BY_NEED', 'off');
    // the unlock state is never consulted: a broken lookup changes nothing
    getTeamUnlockState.mockImplementation(() => {
      throw new Error('profile store down');
    });
    const team = (await year()).teamUnlocks as Array<Record<string, unknown>>;
    vi.unstubAllEnvs();

    expect(team.map((m) => m.personaName)).toEqual(['Ferni', 'Maya', 'Peter', 'Alex', 'Jordan', 'Nayan']);
    for (const member of team) expect(member).not.toHaveProperty('unlockedAt');
  });
});
