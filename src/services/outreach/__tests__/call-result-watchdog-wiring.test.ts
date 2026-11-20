/**
 * CALL_RESULT_WATCHDOG wiring: the real placeOrHold and the real deferred-call job arm a watch,
 * and two sweeps at once settle a due watch once. Flag off, placeOrHold returns main's shape.
 *
 * Real placeOrHold, executeDueDeferredCalls, arm and sweep (claimDueItems) over the shared
 * in-memory Firestore, with transactions run one at a time as Firestore's are; the dialer and
 * the capture are stubbed. All names and numbers are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
/** Every write of a watch fails. */
let failArm = false;
/** Transactions wait for the one before them, as Firestore's contention makes them. */
let lastTx: Promise<unknown> = Promise.resolve();
const db = () => {
  const base = fakeFirestore(rows);
  const userDoc = base.collection().doc;
  const withRefs = (q: ReturnType<typeof base.collectionGroup>): unknown => ({
    where: (f: string, op: string, v: unknown) => withRefs(q.where(f, op, v)),
    orderBy: (f: string) => withRefs(q.orderBy(f)),
    limit: (k: number) => withRefs(q.limit(k)),
    get: async () => {
      const snap = await q.get();
      const docs = snap.docs.map((d) => {
        const row = d.ref._row;
        const ref = {
          ...d.ref,
          delete: async () => void rows.splice(rows.indexOf(row), 1),
          update: async (patch: Record<string, unknown>) => void Object.assign(row.data, patch),
        };
        return { ...d, ref };
      });
      return { ...snap, docs };
    },
  });
  return {
    ...base,
    collectionGroup: (c: string) => withRefs(base.collectionGroup(c)),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const mine = lastTx.then(async () => base.runTransaction(fn));
      lastTx = mine.catch(() => undefined);
      return mine;
    },
    collection: () => ({
      doc: (uid: string) => {
        const user = userDoc(uid);
        return {
          ...user,
          collection: (c: string) => ({
            ...user.collection(c),
            doc: (id: string) => {
              const doc = user.collection(c).doc(id);
              if (c === 'call_result_watchdogs' && failArm)
                doc.set = async () => {
                  throw new Error('UNAVAILABLE');
                };
              return doc;
            },
            where: (f: string, op: string, v: unknown) => ({
              get: async () => {
                const snap = await base.collectionGroup(c).where(f, op, v).get();
                return { docs: snap.docs.filter((d) => d.ref.parent.parent.id === uid) };
              },
            }),
          }),
        };
      },
    }),
  };
};
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db() }));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => db(),
}));
vi.mock('../user-contact.js', () => ({ getUserContactInfo: async () => ({}) }));
vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async () => null }),
}));
const initiateCall = vi.hoisted(() => vi.fn(async () => 'onbehalf_held_1'));
vi.mock('../on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({ initiateCall }),
}));
const captured = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => undefined));
vi.mock('../call-result-capture.js', () => ({
  getCallResult: async () => undefined,
  captureCallResult: captured,
}));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    async listRooms(): Promise<unknown[]> {
      return []; // every call here has ended
    }
  },
}));

const { placeOrHold, deferCall, executeDueDeferredCalls } = await import('../deferred-calls.js');
const { sweepCallResultWatchdogs } = await import('../call-result-watchdog.js');

const OWNER = 'u-4145-wiring';
const NOW = new Date('2026-11-19T15:00:00.000Z');
const due = (from: Date) => new Date(from.getTime() + 25 * 60_000 + 1000);
const request = () => ({ contactQuery: 'my aunt', resolvedContact: { name: 'Aunt Pat', phone: '+13035550142' }, purpose: 'say happy birthday', objective: 'deliver_message', callType: 'personal', originalSessionId: 'call-4145', userId: OWNER, userTimezone: 'UTC', userName: 'Sam', recordingConsent: false }) as never; // prettier-ignore
const watches = () => rows.filter((r) => r.collection === 'call_result_watchdogs');
const flushed = async () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

beforeEach(() => {
  rows = [];
  failArm = false;
  lastTx = Promise.resolve();
  initiateCall.mockClear();
  captured.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('CALL_RESULT_WATCHDOG', 'on');
  vi.stubEnv('LIVEKIT_URL', 'wss://livekit.invalid');
  vi.stubEnv('LIVEKIT_API_KEY', 'test-key');
  vi.stubEnv('LIVEKIT_API_SECRET', 'test-secret');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('CALL_RESULT_WATCHDOG wiring', () => {
  it('placeOrHold arms a watch for the call it places, and returns its promise', async () => {
    const out = await placeOrHold(request(), async () => 'onbehalf_now_1', NOW);
    expect(out.callId).toBe('onbehalf_now_1');
    expect(out.promise).toBe("You'll see how it went in the app."); // on: with the call it rang
    expect(watches()).toHaveLength(1);
    expect(watches()[0]).toMatchObject({ id: 'onbehalf_now_1', userId: OWNER });
    expect(watches()[0]?.data).toMatchObject({ status: 'pending', dueAt: new Date(NOW.getTime() + 25 * 60_000).toISOString() }); // prettier-ignore
  });

  it('arming throws: the call still places, and it carries no promise', async () => {
    failArm = true;
    const place = vi.fn(async () => 'onbehalf_noarm_1');
    const out = await placeOrHold(request(), place, NOW);
    expect(place).toHaveBeenCalledTimes(1);
    expect(out).toStrictEqual({ callId: 'onbehalf_noarm_1', held: undefined, others: '', promise: '' }); // prettier-ignore
    expect(watches()).toHaveLength(0);
  });

  it('a call held for its calling hours: no watch and no promise when held; the job arms it when it rings', async () => {
    const out = await placeOrHold(request(), async () => 'deferred_1763564400000_abcde', NOW);
    expect(out.held).toMatch(/^Nothing was dialed yet/);
    expect(out.held).not.toMatch(/let you know|in the app/);
    expect(Object.keys(out)).toEqual(['callId', 'held', 'others']);
    expect(watches()).toHaveLength(0);
  });

  it('the deferred-call job arms a watch for a held call it dials', async () => {
    const at = new Date(NOW.getTime() + 60 * 60_000);
    await deferCall(OWNER, { kind: 'on_behalf', request: request() } as never, { allowed: false, at, timezone: 'UTC', source: 'phone' } as never); // prettier-ignore
    expect(watches()).toHaveLength(0);
    vi.setSystemTime(new Date(at.getTime() + 60_000));
    expect(await executeDueDeferredCalls()).toMatchObject({ placed: 1 });
    expect(initiateCall).toHaveBeenCalledTimes(1);
    expect(watches().map((w) => [w.id, w.data.status])).toEqual([['onbehalf_held_1', 'pending']]);
  });

  it('two sweeps at once settle a due watch once: one capture, the watch gone', async () => {
    await placeOrHold(request(), async () => 'onbehalf_race_1', NOW);
    await flushed();
    const runs = await Promise.all([
      sweepCallResultWatchdogs({ now: due(NOW) }),
      sweepCallResultWatchdogs({ now: due(NOW) }),
    ]);
    expect(captured).toHaveBeenCalledTimes(1);
    expect(runs.map((r) => r.settled).sort()).toEqual([0, 1]);
    expect(watches()).toHaveLength(0);
  });
});

describe('CALL_RESULT_WATCHDOG off: placeOrHold as main', () => {
  it('no watch, and the return has exactly the keys and values main returns', async () => {
    vi.stubEnv('CALL_RESULT_WATCHDOG', '');
    const out = await placeOrHold(request(), async () => 'onbehalf_off_1', NOW);
    await flushed();
    expect(out).toStrictEqual({ callId: 'onbehalf_off_1', held: undefined, others: '' });
    expect(Object.keys(out)).toEqual(['callId', 'held', 'others']);
    expect(watches()).toHaveLength(0);
  });
});
