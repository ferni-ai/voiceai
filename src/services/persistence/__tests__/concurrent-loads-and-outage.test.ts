/**
 * Three ways the read guard could leave a consumer stuck or blind (verify of #2608):
 *
 * 1. Two first-touch loads for one user at once, the older read succeeding and the newer one
 *    failing. The consumer counted the user loaded (the older call succeeded) while the store
 *    stayed marked by the newer failure, so every later save was refused until restart:
 *    calendar-reminders sent 0 writes after recovery, against 4 on main. Concurrent loads that
 *    take any current copy now share one read, so they succeed or fail together.
 * 2. During an outage get() answered null instead of the cached good copy once the backoff
 *    passed. A failed reload of a cached copy now serves that copy (writes stay refused).
 * 3. nudge-engine loaded at session start without remembering a failure, so after one failed
 *    read every save was refused for the session. Its saves now read first, like the others.
 *
 * Real consumers and the real store on the Firestore merge fake; assertions read stored docs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

const state: MergeFakeState = newMergeFakeState();
const failed = new Set<string>();
state.failReads = failed;
/** Paths whose reads wait for the test to decide each one's outcome, in the order they began. */
const gated = new Set<string>();
const pending: Array<(outcome: 'ok' | 'fail') => void> = [];
const reads: string[] = [];

/** The merge fake plus the batch API the store's flush uses, with counted, gateable reads. */
function fakeDb(s: MergeFakeState) {
  const db = createMergeFakeFirestore(s);
  type Ref = ReturnType<typeof db.doc>;
  type Col = ReturnType<typeof db.collection>;
  const ref = (r: Ref): Ref => ({
    ...r,
    get: async () => {
      reads.push(r.path);
      if (gated.has(r.path)) {
        const outcome = await new Promise<'ok' | 'fail'>((decide) => {
          pending.push(decide);
        });
        if (outcome === 'fail') throw new Error('simulated read failure');
      }
      return r.get();
    },
    collection: (name: string) => col(r.collection(name)),
  });
  const col = (c: Col): Col => ({ ...c, doc: (id: string) => ref(c.doc(id)) });
  const batch = () => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (r: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
        void ops.push(() => r.set(data, opts)),
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  };
  return { ...db, collection: (name: string) => col(db.collection(name)), batch };
}
fake.db = fakeDb(state);

const calendar = await import('../../scheduling/calendar-reminders.js');
const nudge = await import('../../behavioral-economics/nudge-engine.js');
const { createPersistenceStore } = await import('../index.js');
const { ReadFailedWriteError } = await import('../read-guard.js');
// Steady state: the Firestore client already exists. (While the very first client is being
// built, a concurrent load is answered null instead of waiting; that window isn't tested here.)
await createPersistenceStore<object>({ collection: 'warm_up' }).load('warm');

const writesTo = (path: string) => state.writes.filter((w) => w.path === path);
const idsAt = (path: string, field: string) =>
  ((state.docs.get(path)?.[field] ?? []) as Array<{ id: string }>).map((x) => x.id);
const ISO = '2026-10-27T15:00:00.000Z';
/** Let every queued read start (one macrotask turn is plenty for the store's awaits). */
const settleReads = () =>
  new Promise((r) => {
    setTimeout(r, 20);
  });
const later = (ms: number) => {
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + ms);
};

beforeEach(() => {
  state.docs.clear();
  state.writes.length = 0;
  failed.clear();
  gated.clear();
  pending.length = 0;
  reads.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe('calendar reminders: two first-touch loads at once, the newer read fails', () => {
  const USER = 'u-cal-race';
  const PATH = `bogle_users/${USER}/calendar_reminders/data`;
  const event = (id: string) => ({
    id,
    userId: USER,
    title: id,
    startTime: new Date(ISO),
    endTime: new Date(ISO),
    isAllDay: false,
    reminders: [{ id: `${id}-r`, minutesBefore: 30, type: 'push' as const, sent: false }],
    source: 'manual' as const,
  });

  it('after recovery, writes resume and keep the stored events', async () => {
    state.docs.set(PATH, {
      events: [{ ...event('old-standup'), startTime: ISO, endTime: ISO }],
      remindersSent: [],
    });
    gated.add(PATH);
    const first = calendar.upsertEvent(event('first') as never);
    const second = calendar.upsertEvent(event('second') as never);
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    await settleReads();
    pending[0]!('ok'); // the older read succeeds...
    await settleReads();
    pending[1]?.('fail'); // ...and the newer one (if it was ever issued) errors
    await Promise.allSettled([first, second]);
    gated.clear();

    await calendar.flushCalendarPersistence();
    later(120_000); // Firestore has recovered and any backoff has long passed
    const before = writesTo(PATH).length;
    await calendar.upsertEvent(event('after-recovery') as never);
    await calendar.flushCalendarPersistence();

    expect(writesTo(PATH).length).toBeGreaterThan(before);
    const ids = idsAt(PATH, 'events');
    expect(ids[0]).toBe('old-standup'); // the stored list is kept, not overwritten
    expect(ids).toContain('after-recovery');
    expect(reads.filter((p) => p === PATH)).toHaveLength(1); // the race shared one read, one outcome
  });
});

describe('get() during an outage', () => {
  const PATH = 'bogle_users/u1/outage_test/data';
  const store = createPersistenceStore<{ samples: string[] }>({ collection: 'outage_test' });

  beforeEach(() => store.clearAllCaches());

  it('serves the cached good copy once the backoff passes, not null; writes stay refused', async () => {
    state.docs.set(PATH, { samples: ['a', 'b', 'c'] });
    expect(await store.get('u1')).toEqual({ samples: ['a', 'b', 'c'] }); // cached
    failed.add(PATH);
    await store.load('u1', { fresh: true }); // fails: marked, the good copy still cached
    later(1_500); // past the first backoff: get() reloads, and the reload fails too
    const readsBefore = reads.length;

    expect(await store.get('u1')).toEqual({ samples: ['a', 'b', 'c'] });
    expect(reads.length).toBe(readsBefore + 1); // it did try to read again
    expect(store.readFailed('u1')).toBe(true);
    await expect(store.setImmediate('u1', { samples: ['x'] })).rejects.toBeInstanceOf(
      ReadFailedWriteError
    );
    expect(writesTo(PATH)).toEqual([]);
  });

  it('a strict load of that cached copy still throws', async () => {
    state.docs.set(PATH, { samples: ['a'] });
    await store.get('u1');
    failed.add(PATH);
    await store.load('u1', { fresh: true });
    later(1_500);
    await expect(store.load('u1', { strict: 'read' })).rejects.toThrow('simulated read failure');
  });
});

describe('nudge engine after a failed session-start read', () => {
  const USER = 'u-nudge';
  const PATH = `bogle_users/${USER}/nudge_engine/data`;
  const stored = {
    id: 'c-old',
    userId: USER,
    type: 'identity',
    commitment: 'walk daily',
    createdAt: ISO,
    status: 'active',
  };

  it('saves nothing during the outage, then reads again and keeps the stored commitment', async () => {
    state.docs.set(PATH, { commitments: [stored], intentions: [] });
    failed.add(PATH);
    await nudge.loadUserNudgeData(USER); // session start: the read fails (logged)
    const during = nudge.createCommitment(USER, 'stretch');
    await settleReads();
    await nudge.flushUserNudgeData(USER);
    expect(writesTo(PATH)).toEqual([]); // nothing written over the unread doc

    failed.clear(); // Firestore recovers
    const after = nudge.createCommitment(USER, 'read nightly');
    await vi.waitFor(async () => {
      await nudge.flushUserNudgeData(USER);
      expect(writesTo(PATH).length).toBeGreaterThan(0);
    });

    expect(idsAt(PATH, 'commitments')).toEqual(['c-old', during.id, after.id]);
  });
});
