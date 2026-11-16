/**
 * GET /api/insights/:userId "relationship" card: days together and conversations come from
 * the sessions-together record (the stored calls), the count every app surface shows. They
 * used to be derived from days since the last engagement plus ritual days, then from the
 * memory profile's counter, which had drifted to 777 while the app showed 59 elsewhere.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;
const state = vi.hoisted(() => ({
  together: null as { count: number; firstAt?: Date } | null,
  profileCount: 777,
}));

vi.mock('../../services/superhuman/index.js', () => ({
  loadUserCommitments: async () => [],
  loadUserChapters: async () => [],
  loadUserDreams: async () => [],
  findUpcomingDates: async () => [],
  loadEnergyHistory: async () => [],
}));
vi.mock('../../services/engagement/engagement-store.js', () => ({
  // Activity counters that used to be passed off as "conversations" and "days together"
  getEngagementStore: async () => ({
    getWeatherHistory: async () => [],
    getAllStreaks: async () => [],
    getProfile: async () => ({
      lastEngagementAt: new Date(Date.now() - 100 * DAY).toISOString(),
      totalRitualDays: 5,
      stats: { totalSkyChecks: 4, totalPredictions: 2 },
    }),
  }),
}));
// The route answers only the person it names; this caller is user-1.
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAuth: async () => ({ userId: 'user-1', isAdmin: false }),
}));
// The drifted counter: never the card's source
vi.mock('../../memory/store-factory.js', () => ({
  getStore: async () => ({
    getProfile: async () => ({
      firstContact: new Date(Date.now() - 317 * DAY),
      totalConversations: state.profileCount,
    }),
  }),
}));
vi.mock('../../services/stores/sessions-together.js', () => ({
  getSessionsTogether: async () => {
    if (!state.together) throw new Error('Firestore unavailable');
    return { days: [], inProgress: { count: 0, days: [] }, ...state.together };
  },
}));

import { handleInsightsRoutes } from '../insights-routes.js';
import { buildRelationship } from '../insights-relationship.js';

async function getInsights() {
  let raw = '';
  const res = {
    writeHead: vi.fn(),
    end: vi.fn((data?: string) => {
      raw = data ?? '';
    }),
  } as unknown as ServerResponse;
  const req = { method: 'GET', headers: {} } as IncomingMessage;
  await handleInsightsRoutes(req, res, '/api/insights/user-1');
  return JSON.parse(raw) as { relationship?: Record<string, unknown> };
}

beforeEach(() => {
  state.together = null;
});

describe('relationship card', () => {
  it('uses the sessions-together count and first session, not the profile counter', async () => {
    state.together = { count: 3, firstAt: new Date(Date.now() - 10 * DAY) };
    const { relationship } = await getInsights();
    // Not 317 days / 777 conversations from the memory profile
    expect(relationship).toMatchObject({ daysTogether: 10, conversations: 3 });
    expect(relationship?.milestone).toEqual(expect.any(String));
  });

  it('shows no card for a brand new user, however long ago they were last active', async () => {
    state.together = { count: 2, firstAt: new Date(Date.now() - 2 * DAY) };
    expect((await getInsights()).relationship).toBeUndefined();
  });

  it('shows no card with no session together yet, or when the calls cannot be read', async () => {
    state.together = { count: 0 };
    expect((await getInsights()).relationship).toBeUndefined();
    state.together = null;
    expect((await getInsights()).relationship).toBeUndefined();
  });
});

describe('buildRelationship milestones', () => {
  const now = Date.UTC(2026, 9, 7);
  const profile = (days: number, totalConversations: number) => ({
    firstContact: new Date(now - days * DAY),
    totalConversations,
  });

  it('marks many talks, a month, a good few talks and a week, in that order', () => {
    expect(buildRelationship(profile(3, 120), now)?.milestone).toBe(
      "We've built something meaningful together."
    );
    expect(buildRelationship(profile(45, 12), now)?.milestone).toMatch(/month/);
    expect(buildRelationship(profile(10, 60), now)?.milestone).toBe("I see how far you've come.");
    expect(buildRelationship(profile(8, 2), now)?.milestone).toMatch(/week/);
  });

  it('never counts showing up or exclaims (brand: no gamified counts, at most one "!")', () => {
    for (const [days, n] of [
      [3, 120],
      [400, 900],
      [10, 60],
      [45, 12],
      [8, 2],
    ] as const) {
      const line = buildRelationship(profile(days, n), now)?.milestone ?? '';
      expect(line).not.toMatch(/!|\d+\+? conversations/);
    }
  });

  it('has nothing to mark between the thresholds', () => {
    expect(buildRelationship(profile(3, 12), now)).toBeUndefined();
  });
});
