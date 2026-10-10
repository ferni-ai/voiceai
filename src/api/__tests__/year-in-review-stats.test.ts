/**
 * GET /api/year-in-review/:userId stats must come from recorded data: real durations (or no
 * minutes), the stored unlock time (or no date), and weeks of actual tenure, not a flat 52.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-07T12:00:00.000Z');
const state = vi.hoisted(() => ({ summaries: [] as Array<Record<string, unknown>> }));

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user-1', isAdmin: false })),
}));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => ({
            orderBy: () => ({
              get: async () => ({
                docs: state.summaries.map((data, i) => ({ id: `c${i}`, data: () => data })),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../services/superhuman/dream-keeper.js', () => ({ loadUserDreams: async () => [] }));
vi.mock('../../services/superhuman/commitment-keeper.js', () => ({
  loadUserCommitments: async () => [],
}));
vi.mock('../../services/superhuman/relationship-network.js', () => ({
  loadNetwork: async () => [],
}));
vi.mock('../../memory/store-factory.js', () => ({
  getStore: async () => ({ getProfile: async () => ({}) }),
}));
vi.mock('../../services/team-unlocks.js', () => ({
  getTeamUnlockState: () => ({ unlockedMembers: ['ferni', 'maya-santos'] }),
}));

import { handleYearInReviewRoutes } from '../year-in-review-routes.js';
import {
  averageConversationsPerWeek,
  durationSecondsOf,
  tenureOf,
} from '../year-in-review-stats.js';

async function getYear() {
  let raw = '';
  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      raw = data ?? '';
    }),
  } as unknown as ServerResponse;
  const req = { method: 'GET', headers: {} } as IncomingMessage;
  await handleYearInReviewRoutes(req, res, { pathname: '/api/year-in-review/user-1', query: {} });
  return JSON.parse(raw) as Record<string, any>;
}

/** n conversations, the first `weeks` weeks ago, then spread evenly up to now */
function conversations(n: number, weeks: number, extra: Record<string, unknown> = {}) {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: NOW.getTime() - weeks * 7 * DAY + (i * weeks * 7 * DAY) / n,
    ...extra,
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state.summaries = [];
});
afterEach(() => vi.useRealTimers());

describe('year in review stats', () => {
  it('divides conversations by the weeks since the first one, not by 52', async () => {
    state.summaries = conversations(8, 4); // 4 weeks of tenure
    const { stats } = await getYear();
    expect(stats.totalConversations).toBe(8);
    expect(stats.averageConversationsPerWeek).toBeCloseTo(2, 5);
  });

  it('counts at least one week for someone who started today', async () => {
    state.summaries = conversations(3, 0);
    const { stats } = await getYear();
    expect(stats.averageConversationsPerWeek).toBe(3);
  });

  it('omits minutes when conversations did not record a duration (no 8-minute guess)', async () => {
    state.summaries = conversations(10, 5);
    const { stats } = await getYear();
    expect(stats.totalMinutes).toBeUndefined();
  });

  it('sums real durations when every conversation has one', async () => {
    state.summaries = conversations(4, 2, { duration: 600 }); // seconds
    const { stats } = await getYear();
    expect(stats.totalMinutes).toBe(40);
  });

  it('omits minutes when only some conversations have a duration', async () => {
    state.summaries = [...conversations(2, 2, { duration: 600 }), ...conversations(1, 1)];
    const { stats } = await getYear();
    expect(stats.totalMinutes).toBeUndefined();
  });

  it('gives team unlocks no invented unlock date', async () => {
    state.summaries = conversations(2, 1);
    const { teamUnlocks } = await getYear();
    expect(teamUnlocks.map((u: any) => u.personaId)).toEqual(['ferni', 'maya-santos']);
    for (const unlock of teamUnlocks) expect(unlock.unlockedAt).toBeUndefined();
  });
});

describe('year-in-review-stats helpers', () => {
  it('reads durations in seconds, ms, or not at all', () => {
    expect(durationSecondsOf({ duration: 90 })).toBe(90);
    expect(durationSecondsOf({ durationSeconds: 30 })).toBe(30);
    expect(durationSecondsOf({ durationMs: 45000 })).toBe(45);
    expect(durationSecondsOf({ duration: 0 })).toBeUndefined();
    expect(durationSecondsOf({})).toBeUndefined();
  });

  it('has no minutes or first conversation for an empty year', () => {
    expect(tenureOf([])).toEqual({ firstConversationAt: undefined, minutes: undefined });
    expect(averageConversationsPerWeek(0, {})).toBe(0);
  });
});
