/**
 * GET /api/year-in-review/:userId stats must come from recorded data: real durations (or no
 * minutes), the stored unlock time (or no date), and weeks of actual tenure, not a flat 52.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-07T12:00:00.000Z');
const state = vi.hoisted(() => ({
  summaries: [] as Array<Record<string, unknown>>,
  read: [] as string[],
  fail: false,
}));

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user-1', isAdmin: false })),
}));
// Only the collection calls write to (bogle_users/{uid}/summaries) holds anything.
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: (top: string) => ({
      doc: (uid: string) => ({
        collection: (sub: string) => {
          state.read.push(`${top}/${uid}/${sub}`);
          const query = {
            where: () => query,
            orderBy: () => query,
            select: () => query,
            get: async () => {
              if (state.fail) throw new Error('UNAVAILABLE');
              const docs = sub === 'summaries' ? state.summaries : [];
              return { docs: docs.map((data, i) => ({ id: `c${i}`, data: () => data })) };
            },
          };
          return query;
        },
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

import { handleYearInReviewRoutes } from '../year-in-review-routes.js';
import {
  averageConversationsPerWeek,
  durationSecondsOf,
  tenureOf,
} from '../year-in-review-stats.js';

async function getYear() {
  return (await requestYear()).body;
}

async function requestYear() {
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
  const status = (res.writeHead as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as number;
  return { status, body: JSON.parse(raw) as Record<string, any> };
}

/**
 * n call summaries as saveSummary stores them (ISO timestamp, duration in seconds), the
 * first `weeks` weeks ago, then spread evenly up to now
 */
function conversations(n: number, weeks: number, extra: Record<string, unknown> = {}) {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(NOW.getTime() - weeks * 7 * DAY + (i * weeks * 7 * DAY) / n).toISOString(),
    mainTopics: ['the move'],
    ...extra,
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state.summaries = [];
  state.read = [];
  state.fail = false;
});
afterEach(() => vi.useRealTimers());

describe('year in review stats', () => {
  it('reads the summaries calls save, not conversation_summaries', async () => {
    state.summaries = conversations(3, 1);
    const { stats, topTopics } = await getYear();
    expect(state.read).toEqual(['bogle_users/user-1/summaries']);
    expect(stats.totalConversations).toBe(3);
    expect(topTopics.map((t: any) => [t.topic, t.count])).toEqual([['the move', 3]]);
  });

  it('answers 500 when the summaries cannot be read, not an empty year', async () => {
    state.fail = true;
    const { status, body } = await requestYear();
    expect(status).toBe(500);
    expect(body).not.toHaveProperty('stats');
  });

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

  it('lists the whole team after two conversations, with no unlock dates (TEAM_BY_NEED)', async () => {
    state.summaries = conversations(2, 1);
    const { teamUnlocks } = await getYear();
    expect(teamUnlocks.map((u: any) => u.personaId)).toEqual([
      'ferni',
      'maya-santos',
      'peter-john',
      'alex-chen',
      'jordan-taylor',
      'nayan-patel',
    ]);
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
