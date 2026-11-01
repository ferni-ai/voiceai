/**
 * One crisis push per call, with real push latency (verify round 2 on #3081):
 * the push claim was taken only after the crisis push returned, so two captures
 * of one call in flight together both pushed, and a push that carried the crisis
 * line under the plain push claim never marked told.crisis. The crisis push now
 * claims told.crisis and told.push together, before it sends.
 *
 * Both firestore-utils modules (the superhuman re-export and the canonical one
 * setup.ts mocks globally) point at one store here: concurrent dynamic imports in
 * vitest can otherwise resolve to the global mock and report a false double.
 * Fictional people and numbers only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallOutcome, OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const store = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const merge = (
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): Record<string, unknown> => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      const was = a[k];
      const both = [v, was].every((x) => typeof x === 'object' && x !== null && !Array.isArray(x));
      out[k] = both ? merge(was as Record<string, unknown>, v as Record<string, unknown>) : v;
    }
    return out;
  };
  interface Opts {
    merge?: boolean;
    mergeFields?: string[];
  }
  const write = (path: string, data: Record<string, unknown>, opts?: Opts): void => {
    const was = docs.get(path) ?? {};
    const only = opts?.mergeFields; // the call record: its own fields, told.* kept
    const fields = only ? Object.fromEntries(only.map((f) => [f, data[f]])) : data;
    docs.set(path, opts?.merge ? merge(was, data) : only ? { ...was, ...fields } : { ...data });
  };
  const ref = (path: string): Record<string, unknown> => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: Record<string, unknown>, opts?: Opts) => write(path, data, opts), // prettier-ignore
    collection: (name: string) => col(`${path}/${name}`),
  });
  const col = (path: string): Record<string, unknown> => ({ doc: (id: string) => ref(`${path}/${id}`) }); // prettier-ignore
  let lock: Promise<unknown> = Promise.resolve();
  const tx = { failNext: 0 };
  const db = {
    collection: (name: string) => col(name),
    // One transaction at a time, as Firestore commits one doc's transactions in order.
    runTransaction: async <T>(fn: (t: unknown) => Promise<T>): Promise<T> => {
      if (tx.failNext > 0 && tx.failNext--) throw new Error('ABORTED: too much contention');
      const run = lock.then(async () =>
        fn({
          get: async (r: { get: () => Promise<unknown> }) => r.get(),
          set: (r: { path: string }, d: Record<string, unknown>, o?: Opts) => write(r.path, d, o), // prettier-ignore
        })
      );
      lock = run.catch(() => undefined);
      return run;
    },
  };
  return { docs, db, tx };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => store.db }));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => store.db,
}));
const delivered: string[] = [];
const push = vi.hoisted(() => vi.fn());
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => true,
  sendPushNotification: push,
}));
vi.mock('../guarded-text.js', () => ({ sendGuardedText: async () => ({ sent: true }) }));
vi.mock('../../calendar/index.js', () => ({ hasAnyProviderConnected: async () => false }));
vi.mock('../../background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult: async () => ({}),
}));

const { captureCallResult } = await import('../call-result-capture.js');
const { resetToldClaimsForTests } = await import('../call-result-claims.js');
const { crisisCallerLine, screenedCallerText } = await import('../caller-text.js');

const NAME = 'Aunt Rosa';
const RAW = "Honestly I don't want to be alive anymore.";
const wait = async (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });
let seq = 0;

function call() {
  const callId = `race-${++seq}`;
  const request: OnBehalfCallRequest = { contactQuery: 'my aunt', resolvedContact: { name: NAME, phone: '+15555550100' }, purpose: 'check in', objective: 'check_in', callType: 'personal', originalSessionId: '', userId: `u-race-${seq}`, userTimezone: 'UTC', userName: 'Sam', recordingConsent: false }; // prettier-ignore
  const crisis: CallOutcome = { callId, status: 'completed', objectiveAchieved: true, outcome: `I talked with ${NAME}.`, message: screenedCallerText(RAW, NAME, 200), callbackRequired: true }; // prettier-ignore
  const status: CallOutcome = { callId, status: 'completed', objectiveAchieved: false, outcome: `Talked with ${NAME}.` }; // prettier-ignore
  return {
    capture: async (o: CallOutcome) => captureCallResult(callId, o, request),
    crisis,
    status,
  };
}

/** Each push takes `ms`; `fail` of them (the first ones) come back undelivered. */
function pushTakes(ms: number, fail = 0): void {
  let left = fail;
  push.mockImplementation(async (p: { body: string }) => {
    await wait(ms);
    if (left > 0 && left--) return [{ success: false, error: 'no device answered' }];
    delivered.push(p.body);
    return [{ success: true }];
  });
}
const crisisTried = (): number =>
  push.mock.calls.filter(([p]) => (p as { body: string }).body.includes(crisisCallerLine(NAME))).length; // prettier-ignore
const crisisDelivered = (): number => delivered.filter((b) => b.includes(crisisCallerLine(NAME))).length; // prettier-ignore

beforeEach(() => {
  store.docs.clear();
  store.tx.failNext = 0;
  resetToldClaimsForTests();
  push.mockReset();
  delivered.length = 0;
});
afterEach(() => {
  delete process.env.CALL_RESULT_ONE_CHANNEL;
});

describe.each(['off', 'on'])('CALL_RESULT_ONE_CHANNEL %s: one crisis push per call', (flag) => {
  beforeEach(() => {
    if (flag === 'on') process.env.CALL_RESULT_ONE_CHANNEL = 'on';
  });

  it.each([40, 300])('two crisis captures in flight together (%i ms push)', async (ms) => {
    pushTakes(ms);
    const c = call();
    await Promise.all([c.capture(c.crisis), (async () => { await wait(5); await c.capture(c.crisis); })()]); // prettier-ignore
    expect(crisisTried()).toBe(1);
    expect(push).toHaveBeenCalledTimes(1); // and no plain push beside it
  });

  it.each([40, 300])(
    'a crisis capture with the status capture in flight (%i ms push)',
    async (ms) => {
      pushTakes(ms);
      const c = call();
      await Promise.all([c.capture(c.crisis), (async () => { await wait(2); await c.capture(c.status); })()]); // prettier-ignore
      expect(crisisTried()).toBe(1);
      expect(push).toHaveBeenCalledTimes(1);
    }
  );

  it.each([40, 300])(
    'the status capture first, the crisis in flight after it (%i ms push)',
    async (ms) => {
      pushTakes(ms);
      const c = call();
      await Promise.all([c.capture(c.status), (async () => { await wait(2); await c.capture(c.crisis); })()]); // prettier-ignore
      expect(crisisDelivered()).toBe(1); // the crisis still goes: it has more to say
    }
  );

  it('the first crisis push fails: the next capture sends it, once', async () => {
    pushTakes(40, 1);
    const c = call();
    await c.capture(c.crisis);
    expect(crisisTried()).toBe(1); // one try per capture, never a second plain push with the line
    expect(crisisDelivered()).toBe(0);
    await c.capture(c.crisis);
    await c.capture(c.crisis);
    expect(crisisTried()).toBe(2);
    expect(crisisDelivered()).toBe(1);
  });

  it('claims another process wrote to the call doc stop this one (cross-process dedupe)', async () => {
    pushTakes(40);
    const c = call();
    const doc = `bogle_users/u-race-${seq}/on_behalf_calls/race-${seq}`;
    store.docs.set(doc, { told: { voice: 2, crisis: 2, push: 2, email: 2, calendar: 2, record: 2, text: 2 } }); // prettier-ignore
    await c.capture(c.crisis);
    await c.capture(c.status);
    expect(push).not.toHaveBeenCalled();
  });

  it('a failed crisis push gives back both claims it took (crisis and push)', async () => {
    pushTakes(40, 1);
    const c = call();
    await c.capture(c.crisis);
    const told = (store.docs.get(`bogle_users/u-race-${seq}/on_behalf_calls/race-${seq}`)?.told ?? {}) as Record<string, number>; // prettier-ignore
    expect(told.crisis).toBeLessThan(2);
    expect(told.push).toBeLessThan(2);
  });

  it('two captures in flight, the first push fails: the line still reaches the owner by a later one', async () => {
    // prettier-ignore
    pushTakes(40, 1);
    const c = call();
    await Promise.all([c.capture(c.crisis), (async () => { await wait(5); await c.capture(c.crisis); })()]); // prettier-ignore
    await c.capture(c.crisis);
    expect(crisisDelivered()).toBe(1);
  });

  it("Firestore fails for the first capture only: the process's own claim stops a second send", async () => {
    // prettier-ignore
    pushTakes(40);
    const c = call();
    store.tx.failNext = 99;
    await c.capture(c.crisis);
    store.tx.failNext = 0;
    await c.capture(c.crisis);
    expect(crisisTried()).toBe(1);
    expect(push).toHaveBeenCalledTimes(1);
  });
});
