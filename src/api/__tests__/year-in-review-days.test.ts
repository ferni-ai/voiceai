/**
 * The year's heat map days are calendar days in the user's zone, not UTC.
 *
 * Before: a call at 9pm in Los Angeles landed on "tomorrow" (its UTC date). The
 * panel now sends its zone (?tz=) and the server keys days, streaks included, in it.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ summaries: [] as Array<Record<string, unknown>> }));

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user-1', isAdmin: false })),
}));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: (sub: string) => {
          const query = {
            where: () => query,
            orderBy: () => query,
            select: () => query,
            get: async () => ({
              docs: (sub === 'summaries' ? state.summaries : []).map((data, i) => ({
                id: `c${i}`,
                data: () => data,
              })),
            }),
          };
          return query;
        },
      }),
    }),
  }),
  cleanForFirestore: <T>(v: T) => v,
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
  getTeamUnlockState: () => ({ unlockedMembers: [] }),
}));

const { handleYearInReviewRoutes } = await import('../year-in-review-routes.js');

async function days(query: Record<string, string>) {
  let body = '';
  const res = {
    writeHead: () => res,
    setHeader: () => undefined,
    end: (data?: string) => {
      body = data ?? '';
    },
  };
  await handleYearInReviewRoutes(
    { method: 'GET', headers: {} } as IncomingMessage,
    res as unknown as ServerResponse,
    { pathname: '/api/year-in-review/user-1', query }
  );
  return (JSON.parse(body).conversationCounts as Array<{ date: string; count: number }>).map(
    (d) => `${d.date}:${d.count}`
  );
}

beforeEach(() => {
  state.summaries.length = 0;
});

describe('year-in-review day keys', () => {
  it.each([
    { n: 0, stamps: [] as string[], tz: 'America/Los_Angeles', expected: [] as string[] },
    {
      n: 1,
      stamps: [new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10) + 'T04:30:00.000Z'],
      tz: 'America/Los_Angeles',
      // 04:30 UTC is the previous evening in Los Angeles
      expected: [new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10) + ':1'],
    },
    {
      n: 3,
      stamps: ['T04:30', 'T05:00', 'T20:00'].map(
        (t) => new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10) + `${t}:00.000Z`
      ),
      tz: 'UTC',
      expected: [new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10) + ':3'],
    },
  ])('n=$n in $tz', async ({ stamps, tz, expected }) => {
    state.summaries.push(...stamps.map((timestamp) => ({ timestamp, duration: 60 })));
    expect(await days({ tz })).toEqual(expected);
  });

  it('an unknown zone falls back to UTC instead of failing', async () => {
    const stamp = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10) + 'T04:30:00.000Z';
    state.summaries.push({ timestamp: stamp, duration: 60 });
    expect(await days({ tz: 'Not/AZone' })).toEqual([`${stamp.slice(0, 10)}:1`]);
  });
});
