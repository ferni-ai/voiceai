/**
 * Your World counts real connections; "Things I'm holding" lists only dates the user shared.
 *
 * Before: every name mentioned once became one of "N connections" (80% of stored
 * people had mentionCount 1), and generic holidays (Thanksgiving, Christmas) were
 * listed among the dates "I'm holding" for the user, as if they had shared them.
 */
import type http from 'http';
import { describe, expect, it, vi } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;
const people: Array<Record<string, unknown>> = [];
const person = (name: string, mentionCount: number, extra: Record<string, unknown> = {}) => ({
  id: name,
  userId: 'u1',
  name,
  type: 'friend',
  importance: 0.5,
  mentionCount,
  lastMentioned: Date.now() - DAY,
  ...extra,
});

vi.mock('../services/superhuman/relationship-network.js', () => ({
  loadNetwork: async () => people,
  findConnectionOpportunities: async () => [],
}));

const upcoming = [
  { date: { id: 'universal_11_26', name: 'Thanksgiving' }, daysUntil: 5 },
  { date: { id: 'pd_1', name: "Mom's birthday" }, daysUntil: 9 },
];
vi.mock('../services/superhuman/index.js', () => ({
  loadUserCommitments: async () => [],
  loadUserChapters: async () => [],
  loadUserDreams: async () => [],
  findUpcomingDates: async () => upcoming,
  loadEnergyHistory: async () => [],
}));
vi.mock('../services/engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({
    getWeatherHistory: async () => [],
    getAllStreaks: async () => [],
  }),
}));
vi.mock('../memory/store-factory.js', () => ({
  getStore: async () => ({ getProfile: async () => null }),
}));
vi.mock('../api/auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAuth: async () => ({ userId: 'u1', isAdmin: false }),
}));

const { fetchYourWorld, isConnection } = await import('../api/your-story-sections.js');
const { handleInsightsRoutes } = await import('../api/insights-routes.js');

describe('Your World connections', () => {
  it.each([
    { n: 0, list: [], total: null },
    { n: 1, list: [person('Sam', 1)], total: null },
    {
      n: 3,
      list: [person('Sam', 1), person('Mom', 6), person('Lee', 1, { type: 'partner' })],
      total: 2,
    },
  ])('n=$n people: $total connections', async ({ list, total }) => {
    people.length = 0;
    people.push(...list);
    const world = await fetchYourWorld('u1');
    expect(world?.totalConnections ?? null).toBe(total);
    if (world) expect(world.people.map((p) => p.name).sort()).toEqual(['Lee', 'Mom']);
  });

  it.each([
    [{ mentionCount: 1 }, false],
    [{ mentionCount: 2 }, true],
    [{ mentionCount: 1, type: 'partner' }, true],
    [{ mentionCount: 1, type: 'family' }, true],
    [{ mentionCount: 1, type: 'friend' }, false],
    [{}, false],
  ])('isConnection(%o) = %s', (p, expected) => {
    expect(isConnection(p)).toBe(expected);
  });
});

describe("Things I'm holding", () => {
  it('lists the dates the user shared, never a generic holiday', async () => {
    let raw = '';
    const res = {
      writeHead: vi.fn(),
      setHeader: vi.fn(),
      end: vi.fn((d?: string) => (raw = d ?? '')),
    };
    await handleInsightsRoutes(
      { method: 'GET', headers: {} } as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      '/api/insights/u1'
    );
    const body = JSON.parse(raw) as { holding?: { upcomingDates?: Array<{ name: string }> } };
    expect(body.holding?.upcomingDates?.map((d) => d.name)).toEqual(["Mom's birthday"]);
  });
});
