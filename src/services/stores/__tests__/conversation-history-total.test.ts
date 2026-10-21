/**
 * Past Chats reports every session together, not just the page it lists.
 *
 * Before: totalSessions was sessions.length, so a user with 80 calls saw "50" (the
 * page size). The total now comes from sessions-together over all stored calls.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ getConversationSessions: async () => [] }),
}));

const DAY = 24 * 60 * 60 * 1000;
const calls: Array<Record<string, unknown>> = [];
const call = (daysAgo: number, extra: Record<string, unknown> = {}) => {
  const start = new Date(Date.now() - daysAgo * DAY);
  return {
    startedAt: { toDate: () => start },
    endedAt: { toDate: () => new Date(start.getTime() + 600_000) },
    turnCount: 6,
    personaId: 'ferni',
    ...extra,
  };
};

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => {
          let max = Infinity;
          const query = {
            orderBy: () => query,
            select: () => query,
            limit: (n: number) => {
              max = n;
              return query;
            },
            get: async () => ({
              docs: calls.slice(0, max).map((d, i) => ({ id: `c${i}`, data: () => d })),
            }),
          };
          return query;
        },
      }),
    }),
  }),
}));

const { getConversationHistoryService } = await import('../conversation-history.js');
const { clearSessionsTogetherCache } = await import('../sessions-together.js');

describe('Past Chats total', () => {
  it.each([
    { n: 0, docs: [], limit: 2, listed: 0, total: 0 },
    { n: 1, docs: [call(1)], limit: 2, listed: 1, total: 1 },
    // 5 stored, one never ended and one where the user never spoke: 3 sessions together
    {
      n: 3,
      docs: [call(1), call(2), call(3), call(4, { endedAt: undefined }), call(5, { turnCount: 1 })],
      limit: 2,
      listed: 2,
      total: 3,
    },
    // Every row fits the page: the rows are exactly the sessions the header counts
    {
      n: 3,
      docs: [call(1), call(2), call(3), call(4, { endedAt: undefined }), call(5, { turnCount: 1 })],
      limit: 10,
      listed: 3,
      total: 3,
    },
  ])('n=$n: lists $listed, totals $total', async ({ docs, limit, listed, total }) => {
    calls.length = 0;
    clearSessionsTogetherCache(); // the total is cached per user for display
    calls.push(...docs);
    const history = await getConversationHistoryService().getHistory('u1', limit);
    expect(history.sessions).toHaveLength(listed);
    expect(history.totalSessions).toBe(total);
  });
});
