/**
 * GET /api/insights/:userId "relationship" card: days together and conversations come from
 * the profile's first-contact date and conversation counter. They used to be derived from
 * days since the last engagement (growing while the user was away) plus ritual days, and
 * from sky checks + predictions.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;
const state = vi.hoisted(() => ({ profile: null as Record<string, unknown> | null }));

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
vi.mock('../../memory/store-factory.js', () => ({
  getStore: async () => ({ getProfile: async () => state.profile }),
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
  state.profile = null;
});

describe('relationship card', () => {
  it('uses the real first-contact date and conversation count', async () => {
    state.profile = { firstContact: new Date(Date.now() - 10 * DAY), totalConversations: 3 };
    const { relationship } = await getInsights();
    // Not 105 days / 6 conversations from last engagement + ritual days + sky checks
    expect(relationship).toMatchObject({ daysTogether: 10, conversations: 3 });
    expect(relationship?.milestone).toEqual(expect.any(String));
  });

  it('shows no card for a brand new user, however long ago they were last active', async () => {
    state.profile = { firstContact: new Date(Date.now() - 2 * DAY), totalConversations: 2 };
    expect((await getInsights()).relationship).toBeUndefined();
  });

  it('shows no card when the profile has no first-contact date or no profile exists', async () => {
    state.profile = { totalConversations: 40 };
    expect((await getInsights()).relationship).toBeUndefined();
    state.profile = null;
    expect((await getInsights()).relationship).toBeUndefined();
  });
});

describe('buildRelationship milestones', () => {
  const now = Date.UTC(2026, 9, 7);
  const profile = (days: number, totalConversations: number) => ({
    firstContact: new Date(now - days * DAY),
    totalConversations,
  });

  it('marks 100+ conversations, a month, 50+ conversations and a week, in that order', () => {
    expect(buildRelationship(profile(3, 120), now)?.milestone).toMatch(/100\+ conversations/);
    expect(buildRelationship(profile(45, 12), now)?.milestone).toMatch(/month/);
    expect(buildRelationship(profile(10, 60), now)?.milestone).toMatch(/50\+ conversations/);
    expect(buildRelationship(profile(8, 2), now)?.milestone).toMatch(/week/);
  });

  it('has nothing to mark between the thresholds', () => {
    expect(buildRelationship(profile(3, 12), now)).toBeUndefined();
  });
});
