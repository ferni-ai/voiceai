/**
 * Open loops close themselves once they are past following up on.
 *
 * Before: nothing ever expired a loop, so prod had 1,319 open with 49% past
 * followUpBefore, and every reader of "open loops" showed the stale ones. This
 * runs the real loader over stored loop shapes (Firestore Timestamps) with
 * n = 0, 1 and 3 loops.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const stored: Doc[] = [];
const writes: Doc[] = []; // update() calls
const sets: Doc[] = []; // set() calls (whole-doc rewrites)

vi.mock('../../firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => {
          const query = {
            where: () => query,
            orderBy: () => query,
            limit: () => query,
            get: async () => ({ docs: stored.map((d) => ({ data: () => d })) }),
            doc: (id: string) => ({
              set: async (d: Doc) => void sets.push({ id, ...d }),
              update: async (d: Doc) => void writes.push({ id, ...d }),
            }),
          };
          return query;
        },
      }),
    }),
  }),
  cleanForFirestore: <T>(v: T) => v,
}));
vi.mock('../../../data-layer/hooks/coaching-hooks.js', () => ({
  onCoachingInsightChange: vi.fn(),
}));

const loops = await import('../open-loops.js');
const { isLoopLive, shouldExpireLoop, OPEN_LOOP_GRACE_DAYS } =
  await import('../open-loop-expiry.js');

const DAY = 24 * 60 * 60 * 1000;
const ts = (ms: number) => ({ toDate: () => new Date(ms) });

/** A stored loop whose follow-up window closed `daysPast` days ago (negative: still open). */
function loop(id: string, daysPast: number): Doc {
  const now = Date.now();
  return {
    id,
    userId: 'u1',
    type: 'intention',
    content: `loop ${id}`,
    status: 'open',
    priority: 0.5,
    followUpCount: 0,
    created: ts(now - 30 * DAY),
    followUpAfter: ts(now - 20 * DAY),
    followUpBefore: ts(now - daysPast * DAY),
  };
}

beforeEach(() => {
  stored.length = 0;
  writes.length = 0;
  sets.length = 0;
  loops.clearLoopCache();
});

describe('the rules', () => {
  const now = new Date();
  it.each([
    { name: 'window still open', daysPast: -2, live: true, expire: false },
    { name: 'just past the window', daysPast: 1, live: false, expire: false },
    {
      name: 'past the grace period',
      daysPast: OPEN_LOOP_GRACE_DAYS + 1,
      live: false,
      expire: true,
    },
  ])('$name: live $live, expire $expire', ({ daysPast, live, expire }) => {
    const l = { status: 'open', followUpBefore: new Date(now.getTime() - daysPast * DAY) };
    expect(isLoopLive(l, now)).toBe(live);
    expect(shouldExpireLoop(l, now)).toBe(expire);
  });

  it('a loop with no valid window is never live, and is expired', () => {
    const l = { status: 'open', followUpBefore: new Date(Number.NaN) };
    expect(isLoopLive(l, now)).toBe(false);
    expect(shouldExpireLoop(l, now)).toBe(true);
  });

  it('a resolved loop is neither live nor re-expired', () => {
    const l = { status: 'resolved', followUpBefore: new Date(now.getTime() - 90 * DAY) };
    expect(isLoopLive(l, now)).toBe(false);
    expect(shouldExpireLoop(l, now)).toBe(false);
  });
});

describe('getAllOpenLoops over stored loops', () => {
  it.each([
    { n: 0, docs: [] as Doc[], live: [] as string[], expired: [] as string[] },
    { n: 1, docs: [loop('a', 30)], live: [], expired: ['a'] },
    {
      n: 3,
      docs: [loop('fresh', -3), loop('stale', 2), loop('old', 40)],
      live: ['fresh'],
      expired: ['old'],
    },
  ])('n=$n: surfaces $live, closes $expired', async ({ docs, live, expired }) => {
    stored.push(...docs);
    const open = await loops.getAllOpenLoops('u1');
    expect(open.map((l) => l.id)).toEqual(live);
    await vi.waitFor(() => expect(writes.map((w) => w.id)).toEqual(expired));
    // Only the status is written (update), never the whole loaded doc (set)
    expect(writes.every((w) => Object.keys(w).sort().join() === 'id,status')).toBe(true);
    expect(sets).toEqual([]);
  });
});
