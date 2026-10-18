/**
 * This Year Together keeps no streaks and claims no unlocks (Seth, 2026-10-11
 * TEAM_BY_NEED: the whole team from the first call, no streak nudges).
 *
 * The 2026-10-18 menu re-audit found the year still returned current/best
 * streaks (the best-streak loop also restarted on any gap in the sorted days,
 * so it was wrong), a "team members unlocked" count, and, when the team lookup
 * failed, a made-up team of one: "Ferni" as if just unlocked.
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
  it('returns no streaks and no unlock count', async () => {
    getTeamUnlockState.mockReturnValue({ unlockedMembers: ['ferni', 'maya-santos'] });
    const stats = (await year()).stats as Record<string, unknown>;

    expect(stats).toHaveProperty('totalConversations');
    expect(stats).not.toHaveProperty('currentStreak');
    expect(stats).not.toHaveProperty('longestStreak');
    expect(stats).not.toHaveProperty('teamMembersUnlocked');
  });

  it('lists the team it found, with no unlock dates', async () => {
    getTeamUnlockState.mockReturnValue({ unlockedMembers: ['ferni', 'maya-santos'] });
    const team = (await year()).teamUnlocks as Array<Record<string, unknown>>;

    expect(team.map((m) => m.personaName)).toEqual(['Ferni', 'Maya']);
    for (const member of team) expect(member).not.toHaveProperty('unlockedAt');
  });

  it('a failed team lookup returns no team, not a made-up "Ferni unlocked"', async () => {
    getTeamUnlockState.mockImplementation(() => {
      throw new Error('profile store down');
    });

    expect((await year()).teamUnlocks).toEqual([]);
  });
});
