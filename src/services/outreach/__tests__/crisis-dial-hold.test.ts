/**
 * CRISIS_DIAL_HOLD (#4187): a call confirmed before a crisis line never dials later.
 *
 * The deferred path: the agent writes the deferral (deferCall) and notes the call's risk
 * (crisis-call-risk.ts); the server's dial job (executeDueDeferredCalls) places what is still
 * pending. The background path: executeCall dials at once in the agent. Real deferral, dial job,
 * risk notes and executor; only the store, the dialers and the result capture are stubbed. All
 * names and numbers are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

const logged = vi.hoisted(() => [] as Array<[Record<string, unknown>, string]>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const keep = (fields: Record<string, unknown>, message: string) => logged.push([fields, message]);
  const logger = { debug: () => undefined, info: keep, warn: keep, error: () => undefined };
  return { ...actual, createLogger: () => ({ ...logger, child: () => logger }) };
});

let rows: Row[] = [];
/** Fails this many store reads of a user's pending calls before answering. */
let failReads = 0;
/** Each deferral write lands this many ms after it starts (0: at once). */
let slowWriteMs = 0;
/** Each cancel transaction lands this many ms after it starts (0: at once). */
let slowTxMs = 0;
/** Runs once the cancel's query has read, before its transaction: what lands in between. */
let afterQuery: (() => void) | undefined;
/** The fake, plus where() on a user's own collection (the cancel's query). */
const db = () => {
  const base = fakeFirestore(rows);
  const userDoc = base.collection().doc;
  return {
    ...base,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      if (slowTxMs)
        await new Promise((resolve) => {
          setTimeout(resolve, slowTxMs);
        });
      return base.runTransaction(fn);
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
              const write = doc.set;
              doc.set = async (data: Record<string, unknown>) => {
                if (slowWriteMs)
                  await new Promise((resolve) => {
                    setTimeout(resolve, slowWriteMs);
                  });
                return write(data);
              };
              return doc;
            },
            where: (f: string, op: string, v: unknown) => ({
              get: async () => {
                if (failReads > 0 && failReads--) throw new Error('UNAVAILABLE');
                const snap = await base.collectionGroup(c).where(f, op, v).get();
                const docs = snap.docs.filter((d) => d.ref.parent.parent.id === uid);
                afterQuery?.();
                return { docs };
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
const initiateCall = vi.hoisted(() => vi.fn(async () => 'call_rang'));
vi.mock('../on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({ initiateCall }),
}));
vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async () => null }),
}));
const makeCall = vi.hoisted(() => vi.fn(async () => ({ success: true, status: 'completed' })));
vi.mock('../../voice/conversational-call-service.js', () => ({
  makeConversationalCall: makeCall,
  isConversationalCallingConfigured: () => ({ configured: true }),
}));
const captured = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult: captured,
}));

const { deferCall, executeDueDeferredCalls } = await import('../deferred-calls.js');
const { executeCall } = await import('../../background-agents/executors/call-executor.js');
const { noteCrisisRisk, resetCrisisCallRisk } = await import('../../safety/crisis-call-risk.js');

const NOW = new Date('2026-11-19T15:00:00Z');
const DUE = new Date('2026-11-19T16:00:00Z');
const AFTER = new Date('2026-11-19T16:01:00Z');
const decision = { allowed: false, at: DUE, timezone: 'America/Denver', source: 'phone' };

let n = 0;
/** An on-behalf call confirmed on `origin` ('' = a call that knew no call id). */
const heldOn = (origin: string) => ({
  kind: 'on_behalf' as const,
  request: {
    contactQuery: 'my aunt',
    resolvedContact: { name: 'Aunt Pat', phone: '+13035550142' },
    purpose: 'say happy birthday',
    objective: 'deliver_message',
    callType: 'personal',
    originalSessionId: origin,
    userId: 'u-4187',
    userTimezone: 'America/Denver',
    userName: 'Sam',
    recordingConsent: false,
  },
});
const defer = (origin: string) => deferCall('u-4187', heldOn(origin) as never, decision as never);
const deferred = () => rows.filter((r) => r.collection === 'deferred_calls');
const lines = (outcome: string) =>
  logged.filter(([f, m]) => m === 'CRISIS_DIAL_HOLD' && f.outcome === outcome).map(([f]) => f);
/** Until the cancel, which never blocks the turn, has written. */
const settled = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 10);
  });
/** The one deferral a row wrote. */
const onlyDeferral = (): Record<string, unknown> => {
  const [row, ...more] = deferred();
  if (!row || more.length) throw new Error(`expected one deferral, found ${deferred().length}`);
  return row.data;
};

const ON = () => vi.stubEnv('CRISIS_DIAL_HOLD', 'on');

beforeEach(() => {
  rows = [];
  failReads = 0;
  slowWriteMs = 0;
  slowTxMs = 0;
  afterQuery = undefined;
  logged.length = 0;
  resetCrisisCallRisk();
  initiateCall.mockClear();
  makeCall.mockClear();
  captured.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('CRISIS_DIAL_HOLD: a deferred call (recipient hours)', () => {
  it('a crisis on its call after it was deferred: cancelled as a user cancel is, 0 dials', async () => {
    ON();
    const call = `call-${++n}`;
    await defer(call);
    noteCrisisRisk(call);
    await settled();
    expect(deferred()[0]?.data).toMatchObject({ status: 'cancelled' });
    expect(Object.keys(onlyDeferral())).not.toContain('reason');
    vi.setSystemTime(AFTER);
    expect(await executeDueDeferredCalls()).toMatchObject({ due: 0, placed: 0 });
    expect(initiateCall).not.toHaveBeenCalled();
    expect(lines('crisis_hold_at_dial')).toEqual([
      { outcome: 'crisis_hold_at_dial', at: 'deferred', cancelled: 1 },
    ]);
  });

  it('the risk note returns before the cancel writes: the turn never waits on it', async () => {
    ON();
    const call = `call-${++n}`;
    await defer(call);
    noteCrisisRisk(call);
    expect(deferred()[0]?.data.status).toBe('pending'); // nothing written yet, nothing awaited
    await settled();
    expect(deferred()[0]?.data.status).toBe('cancelled');
  });

  it("the cancel writes only a user cancel's status and time: nothing of the line, no reason", async () => {
    ON();
    const call = `call-${++n}`;
    await defer(call);
    const before = structuredClone(onlyDeferral());
    noteCrisisRisk(call);
    await settled();
    const { status, cancelledAt, ...rest } = onlyDeferral();
    expect({ status, cancelledAt }).toEqual({
      status: 'cancelled',
      cancelledAt: NOW.toISOString(),
    });
    const { status: _was, ...unchanged } = before;
    expect(rest).toEqual(unchanged);
  });

  it('the control, no crisis: the same deferral dials once', async () => {
    ON();
    await defer(`call-${++n}`);
    vi.setSystemTime(AFTER);
    expect(await executeDueDeferredCalls()).toMatchObject({ due: 1, placed: 1 });
    expect(initiateCall).toHaveBeenCalledTimes(1);
  });

  it('a crisis on another call cancels nothing of this one', async () => {
    ON();
    const mine = `call-${++n}`;
    const other = `call-${++n}`;
    await defer(mine);
    await defer(other);
    noteCrisisRisk(other);
    await settled();
    const byOrigin = (o: string) =>
      deferred().find(
        (r) => (r.data.request as { originalSessionId: string }).originalSessionId === o
      );
    expect(byOrigin(mine)?.data.status).toBe('pending');
    expect(byOrigin(other)?.data.status).toBe('cancelled');
  });

  it('a deferral its call would make after the risk is refused: nothing written, nothing rings', async () => {
    ON();
    const call = `call-${++n}`;
    noteCrisisRisk(call);
    await expect(defer(call)).rejects.toThrow('Call not placed');
    expect(deferred()).toHaveLength(0);
    expect(lines('crisis_hold_at_dial')).toEqual([{ outcome: 'crisis_hold_at_dial', at: 'defer' }]);
  });

  it('no originating call: never dialed, back to pending, never deleted', async () => {
    ON();
    await defer('');
    vi.setSystemTime(AFTER);
    expect(await executeDueDeferredCalls()).toMatchObject({ placed: 0 });
    expect(initiateCall).not.toHaveBeenCalled();
    expect(deferred()).toHaveLength(1);
    expect(deferred()[0]?.data.status).toBe('pending');
    expect(lines('no_origin_call')).toEqual([{ outcome: 'no_origin_call' }]);
  });

  it('a failed cancel write is retried once, logs counts only, and never throws', async () => {
    ON();
    const call = `call-${++n}`;
    await defer(call);
    failReads = 1;
    noteCrisisRisk(call);
    await settled();
    expect(deferred()[0]?.data.status).toBe('cancelled');
    expect(lines('cancel_failed')).toEqual([{ outcome: 'cancel_failed', attempt: 1 }]);
    const again = `call-${++n}`;
    await defer(again);
    failReads = 2;
    expect(() => noteCrisisRisk(again)).not.toThrow();
    await settled();
    expect(lines('cancel_failed')).toHaveLength(3);
  });

  it('flag off: a crisis cancels nothing and a call with no call id dials, as main', async () => {
    const call = `call-${++n}`;
    await defer(call);
    await defer('');
    noteCrisisRisk(call);
    await settled();
    expect(deferred().map((r) => r.data.status)).toEqual(['pending', 'pending']);
    vi.setSystemTime(AFTER);
    expect(await executeDueDeferredCalls()).toMatchObject({ placed: 2 });
    expect(lines('crisis_hold_at_dial')).toEqual([]);
  });
});

describe('CRISIS_DIAL_HOLD: a background call (call-executor)', () => {
  const job = (sessionId?: string) => ({
    userId: 'u-4187',
    sessionId,
    contactName: 'Aunt Pat',
    contactPhone: '+13035550142',
    objective: 'say happy birthday',
  });

  it('a crisis noted after it is queued but before it dials: no dial, nothing recorded', async () => {
    ON();
    const call = `call-${++n}`;
    const running = executeCall(job(call));
    noteCrisisRisk(call); // the same tick: the dial has not run yet
    expect(await running).toMatchObject({ success: false, status: 'failed' });
    expect(makeCall).not.toHaveBeenCalled();
    expect(captured).not.toHaveBeenCalled();
  });

  it('the control, no crisis: it dials once', async () => {
    ON();
    await executeCall(job(`call-${++n}`));
    expect(makeCall).toHaveBeenCalledTimes(1);
  });

  it('no call id: it never dials', async () => {
    ON();
    await executeCall(job(undefined));
    expect(makeCall).not.toHaveBeenCalled();
    expect(lines('no_origin_call')).toEqual([{ outcome: 'no_origin_call', at: 'background' }]);
  });

  it('flag off: the crisis call dials, as main', async () => {
    const call = `call-${++n}`;
    const running = executeCall(job(call));
    noteCrisisRisk(call);
    await running;
    expect(makeCall).toHaveBeenCalledTimes(1);
  });
});

describe('CRISIS_DIAL_HOLD: the deferral write, a claimed call, and a full table', () => {
  /** Risk noted on `call` this many ms after its deferral starts. */
  const noteAfter = async (call: string, ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(() => {
        noteCrisisRisk(call);
        resolve();
      }, ms);
    });
  const dialsAfterDue = async () => {
    vi.setSystemTime(AFTER);
    await executeDueDeferredCalls();
    return initiateCall.mock.calls.length;
  };

  it.each([0, 5, 20, 35])(
    'risk noted %i ms into a 40 ms deferral write: refused, its doc cancelled, 0 dials',
    async (ms) => {
      ON();
      slowWriteMs = 40;
      slowTxMs = 5;
      const call = `call-${++n}`;
      const deferring = defer(call);
      const noted = noteAfter(call, ms);
      const refused = await deferring.catch((e: Error) => e.message);
      expect([refused, onlyDeferral().status]).toEqual(['Call not placed', 'cancelled']); // cancelled before refused
      await noted;
      await settled();
      expect(await dialsAfterDue()).toBe(0);
      expect(lines('crisis_hold_at_dial')).toContainEqual({
        outcome: 'crisis_hold_at_dial',
        at: 'written',
      });
    }
  );

  it.each([45, 80])(
    'risk noted %i ms in, after the write landed: the risk cancels it, 0 dials',
    async (ms) => {
      ON();
      slowWriteMs = 40;
      const call = `call-${++n}`;
      await defer(call);
      await noteAfter(call, ms - 40);
      await settled();
      expect(onlyDeferral().status).toBe('cancelled');
      expect(await dialsAfterDue()).toBe(0);
    }
  );

  it('the control: the same 40 ms write and no risk dials once', async () => {
    ON();
    slowWriteMs = 40;
    await defer(`call-${++n}`);
    expect(await dialsAfterDue()).toBe(1);
  });

  it('claimed by the dial job between the cancel read and its write: stays claimed, not cancelled', async () => {
    ON();
    const call = `call-${++n}`;
    await defer(call);
    afterQuery = () => {
      afterQuery = undefined;
      onlyDeferral().status = 'placing'; // the dial job's claim lands here
    };
    noteCrisisRisk(call);
    await settled();
    expect(onlyDeferral().status).toBe('placing');
    expect(Object.keys(onlyDeferral())).not.toContain('cancelledAt');
    expect(lines('crisis_hold_at_dial')).toEqual([
      { outcome: 'crisis_hold_at_dial', at: 'deferred', cancelled: 0 },
    ]);
  });

  it('claimed and ringing when the risk lands: the dial job keeps it, nothing marks it cancelled', async () => {
    ON();
    const call = `call-${++n}`;
    await defer(call);
    let whileRinging: unknown;
    initiateCall.mockImplementationOnce(async () => {
      noteCrisisRisk(call);
      await settled();
      whileRinging = onlyDeferral().status;
      return 'call_rang';
    });
    expect(await dialsAfterDue()).toBe(1);
    expect(whileRinging).toBe('placing');
    expect(onlyDeferral().status).toBe('placed');
  });

  // Last in the file: it fills the module's table. It runs 7 h past the other rows, so their calls
  // are let go first, and ends with one call watched.
  it('1024 calls watched: a new deferral is refused, none is dropped; past 6 h they are let go', async () => {
    ON();
    const start = new Date(NOW.getTime() + 7 * 3600_000);
    vi.setSystemTime(start);
    // eslint-disable-next-line no-await-in-loop -- in order, so call-room-0 is the oldest
    for (let i = 0; i < 1024; i++) await defer(`call-room-${i}`);
    await expect(defer('call-room-new')).rejects.toThrow('Call not placed');
    expect(deferred()).toHaveLength(1024);
    expect(lines('crisis_hold_room_full')).toEqual([
      { outcome: 'crisis_hold_room_full', watched: 1024 },
    ]);
    noteCrisisRisk('call-room-0'); // the oldest is still watched
    await settled();
    expect(deferred()[0]?.data.status).toBe('cancelled');
    vi.setSystemTime(new Date(start.getTime() + 6 * 3600_000 + 60_000));
    await expect(defer('call-room-late')).resolves.toBeDefined();
  });
});
