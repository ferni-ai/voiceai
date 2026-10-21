/**
 * Sessions together reads a bounded number of calls, never the whole collection.
 *
 * It used to scan every conversation doc a user had on every request. Now it reads the
 * newest MAX_CALLS_READ calls (count, days, streak, the live call) and the oldest few
 * (the first session), and display reads are cached per user for 60 seconds.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;
const reads: Array<{ order?: string; limit?: number; user: string }> = [];
let stored: Array<Record<string, unknown>> = [];

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: (user: string) => ({
        // Each select() starts its own query, so each read records its own limit
        collection: () => ({
          select: () => {
            const read: { order?: string; limit?: number; user: string } = { user };
            const query = {
              orderBy: (_f: string, dir: string) => ((read.order = dir), query),
              limit: (n: number) => ((read.limit = n), query),
              get: async () => {
                reads.push(read);
                const sorted = [...stored].sort((a, b) =>
                  read.order === 'asc'
                    ? +(a.startedAt as Date) - +(b.startedAt as Date)
                    : +(b.startedAt as Date) - +(a.startedAt as Date)
                );
                return {
                  docs: sorted.slice(0, read.limit ?? Infinity).map((d) => ({ data: () => d })),
                };
              },
            };
            return query;
          },
        }),
      }),
    }),
  }),
}));

const { getSessionsTogether, clearSessionsTogetherCache, MAX_CALLS_READ } =
  await import('../sessions-together.js');

const call = (daysAgo: number, extra: Record<string, unknown> = {}) => {
  const start = new Date(Date.now() - daysAgo * DAY);
  return { startedAt: start, endedAt: new Date(+start + 600_000), turnCount: 6, ...extra };
};

beforeEach(() => {
  reads.length = 0;
  stored = [];
  clearSessionsTogetherCache();
});

describe('bounded reads', () => {
  it.each([
    { n: 0, calls: [] as Array<Record<string, unknown>> },
    { n: 1, calls: [call(1)] },
    { n: 3, calls: [call(1), call(2), call(300)] },
  ])('n=$n: every read has a limit', async ({ calls }) => {
    stored = calls;
    const together = await getSessionsTogether('u1');
    expect(together.count).toBe(calls.length);
    expect(reads.length).toBe(2);
    for (const read of reads) {
      expect(typeof read.limit).toBe('number');
      expect(read.limit).toBeLessThanOrEqual(MAX_CALLS_READ);
    }
  });

  it('finds the first session even when it is older than the newest calls read', async () => {
    stored = [call(400), ...Array.from({ length: MAX_CALLS_READ }, (_, i) => call(i / 10))];
    const together = await getSessionsTogether('u1');
    expect(together.count).toBe(MAX_CALLS_READ); // capped, and logged
    expect(Math.round((Date.now() - together.firstAt!.getTime()) / DAY)).toBe(400);
  });

  it('caches per user for display, never across users, and not for a fresh read', async () => {
    stored = [call(1)];
    await getSessionsTogether('u1');
    await getSessionsTogether('u1');
    expect(reads.filter((r) => r.user === 'u1')).toHaveLength(2); // one summary, two reads
    await getSessionsTogether('u2');
    expect(reads.filter((r) => r.user === 'u2')).toHaveLength(2);
    stored = [call(1), call(0, { endedAt: undefined })];
    const fresh = await getSessionsTogether('u1', undefined, { fresh: true });
    expect(fresh.inProgress.count).toBe(1);
  });
});
