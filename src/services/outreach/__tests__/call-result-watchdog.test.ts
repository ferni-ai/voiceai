/**
 * CALL_RESULT_WATCHDOG: a placed on-behalf call that never reports is told as
 * "I couldn't confirm how the call to X went", once, through tellOwnerOnce; a
 * real result is never replaced by it, and a late real one replaces it.
 *
 * The real watch, sweep (claimDueItems), capture and tellOwnerOnce over one
 * in-memory Firestore; only the senders are stubbed. No network. The owner
 * is the fictional eval user; contacts and lines are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallOutcome, OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const store = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  interface Opts {
    merge?: boolean;
    mergeFields?: string[];
  }
  const docs = new Map<string, Data>();
  const write = (path: string, data: Data, opts?: Opts): void => {
    const was = docs.get(path) ?? {};
    const only = opts?.mergeFields;
    if (only) docs.set(path, { ...was, ...Object.fromEntries(only.map((f) => [f, data[f]])) });
    else if (opts?.merge) {
      const told = { ...(was.told as Data), ...(data.told as Data) };
      docs.set(path, { ...was, ...data, ...(data.told ? { told } : {}) });
    } else docs.set(path, { ...data });
  };
  const ref = (path: string): Data => ({
    path,
    id: path.split('/').pop(),
    parent: { parent: { id: path.split('/')[1] } },
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (d: Data, o?: Opts) => write(path, d, o),
    update: async (patch: Data) => write(path, patch, { merge: true }),
    delete: async () => docs.delete(path),
    collection: (name: string) => col(`${path}/${name}`),
  });
  const col = (path: string): Data => ({ doc: (id: string) => ref(`${path}/${id}`) });
  const group = (name: string, filters: Array<[string, string, unknown]> = []): Data => ({
    where: (f: string, op: string, v: unknown) => group(name, [...filters, [f, op, v]]),
    orderBy: () => group(name, filters),
    limit: () => group(name, filters),
    get: async () => {
      const hits = [...docs.entries()].filter(
        ([p, d]) =>
          p.split('/').at(-2) === name &&
          filters.every(([f, op, v]) =>
            op === '==' ? d[f] === v : String(d[f]) <= String(v as string)
          )
      );
      const out = hits.map(([p, d]) => ({ id: p.split('/').pop(), ref: ref(p), data: () => d }));
      return { docs: out, size: out.length };
    },
  });
  const db = {
    collection: (name: string) => col(name),
    collectionGroup: (name: string) => group(name),
    runTransaction: async <T>(fn: (t: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: async (r: { get: () => Promise<unknown> }) => r.get(),
        set: (r: { path: string }, d: Data, o?: Opts) => write(r.path, d, o),
        update: (r: { path: string }, patch: Data) => write(r.path, patch, { merge: true }),
      }),
  };
  return { docs, db };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => store.db }));
/** No Firestore at all (the arm's 'no_store' reason). */
const noStore = vi.hoisted(() => ({ on: false }));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => (noStore.on ? null : store.db),
}));
const push = vi.hoisted(() => vi.fn(async (_p: { body: string }) => [{ success: true }]));
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => true,
  sendPushNotification: push,
}));
vi.mock('../guarded-text.js', () => ({ sendGuardedText: async () => ({ sent: true }) }));
vi.mock('../../calendar/index.js', () => ({ hasAnyProviderConnected: async () => false }));
const card = vi.hoisted(() => vi.fn(async (_r: { status: string; summary: string }) => ({})));
vi.mock('../../background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult: card,
}));
const indexed = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => undefined));
vi.mock('../../data-layer/hooks/misc-hooks.js', () => ({
  onCallResultChange: indexed,
  onFollowUpActionChange: async () => undefined,
}));
/** The call's LiveKit room: open, gone, unreadable (a throw), or a read that hangs until released. */
const room = vi.hoisted(() => ({ state: 'gone' as 'open' | 'gone' | 'throws' | 'hangs', asked: [] as string[], release: () => {} })); // prettier-ignore
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    async listRooms(names: string[]): Promise<Array<{ name: string }>> {
      room.asked.push(...names);
      if (room.state === 'throws') throw new Error('UNAVAILABLE');
      if (room.state === 'hangs') {
        await new Promise<void>((resolve) => {
          room.release = resolve;
        });
        return [];
      }
      return room.state === 'open' ? names.map((name) => ({ name })) : [];
    }
  },
}));
const watchLog = vi.hoisted(() => [] as Array<{ outcome?: string }>);
const warned = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return {
    ...real,
    createLogger: (o: { module?: string }) =>
      o?.module === 'call-result-watchdog'
        ? { ...quiet, info: (fields: { outcome?: string }) => watchLog.push(fields), warn: (fields: Record<string, unknown>) => warned.push(fields) } // prettier-ignore
        : real.createLogger(o),
  };
});

const { armCallResultWatchdog, sweepCallResultWatchdogs } =
  await import('../call-result-watchdog.js');
const { captureCallResult } = await import('../call-result-capture.js');
const { resetToldClaimsForTests } = await import('../call-result-claims.js');
const { crisisCallerLine, screenedCallerText } = await import('../caller-text.js');

const T0 = new Date('2026-11-18T15:00:00.000Z');
const at = (ms: number): Date => new Date(T0.getTime() + ms);
const OWNER = 'u-riley-test';
const NAME = 'Casey Fields';
let seq = 0;
let callId = '';

const request = (): OnBehalfCallRequest => ({ contactQuery: 'my friend Casey', resolvedContact: { name: NAME, phone: '+15555550123' }, purpose: 'ask about Saturday', objective: 'check_in', callType: 'personal', originalSessionId: '', userId: OWNER, userTimezone: 'UTC', userName: 'Riley Test', recordingConsent: false }); // prettier-ignore
const callDoc = (): Record<string, unknown> | undefined =>
  store.docs.get(`bogle_users/${OWNER}/on_behalf_calls/${callId}`);
const watchDoc = (): Record<string, unknown> | undefined =>
  store.docs.get(`bogle_users/${OWNER}/call_result_watchdogs/${callId}`);
const stored = (): CallOutcome | undefined => callDoc()?.outcome as CallOutcome | undefined;
const bodies = (): string[] => push.mock.calls.map(([p]) => p.body);
const NO_REPORT_LINE = `I couldn't confirm how the call to ${NAME} went.`;
/** Max call (15 min) + margin: the watch's own 25 minutes, written out. */
const NO_REPORT_AFTER_MS = 25 * 60_000;
/** What the sweep captures; built here to land a no-report after a real result (the race). */
const noReportOutcome = (id: string, name: string): CallOutcome => ({ callId: id, status: 'unconfirmed', objectiveAchieved: false, outcome: `I couldn't confirm how the call to ${name} went.`, callbackRequired: false }); // prettier-ignore
const told = (line: string): number => bodies().filter((b) => b.includes(line)).length;
const outcomes = (): Array<string | undefined> => watchLog.map((l) => l.outcome).filter(Boolean);

const answered = (): CallOutcome => ({ callId, status: 'completed', objectiveAchieved: true, outcome: `I talked with ${NAME}.`, transcriptSummary: 'Saturday works for them.' }); // prettier-ignore
const statusOnly = (): CallOutcome => ({ callId, status: 'no_answer', objectiveAchieved: false, outcome: `${NAME} didn't answer.` }); // prettier-ignore
const crisis = (): CallOutcome => ({ callId, status: 'completed', objectiveAchieved: true, outcome: `I talked with ${NAME}.`, message: screenedCallerText("Honestly I don't want to be alive anymore.", NAME, 200) }); // prettier-ignore

beforeEach(() => {
  store.docs.clear();
  resetToldClaimsForTests();
  push.mockClear();
  watchLog.length = 0;
  warned.length = 0;
  card.mockClear();
  indexed.mockClear();
  room.state = 'gone';
  room.asked.length = 0;
  callId = `onbehalf_watch_${++seq}`;
  vi.stubEnv('CALL_RESULT_WATCHDOG', 'on');
  vi.stubEnv('LIVEKIT_URL', 'wss://livekit.invalid');
  vi.stubEnv('LIVEKIT_API_KEY', 'test-key');
  vi.stubEnv('LIVEKIT_API_SECRET', 'test-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CALL_RESULT_WATCHDOG on', () => {
  it('a placed call with no result in time: one no-report result, told once', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    expect(watchDoc()).toMatchObject({ status: 'pending' });
    expect((await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS - 60_000) })).due).toBe(0);
    expect(stored()).toBeUndefined();

    await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) });
    expect(stored()).toMatchObject({ status: 'unconfirmed', outcome: NO_REPORT_LINE });
    expect(room.asked).toEqual([`onbehalf-${callId}`]); // the room the orchestrator made
    expect(told(NO_REPORT_LINE)).toBe(1);
    expect(watchDoc()).toBeUndefined(); // the request it held is gone
    expect(outcomes()).toEqual(['timed_out']);

    await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 120_000) });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('a real result in time: the watchdog stores and tells nothing', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    await captureCallResult(callId, answered(), request());
    expect(push).toHaveBeenCalledTimes(1);
    await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) });
    expect(stored()).toMatchObject({ status: 'completed', transcriptSummary: 'Saturday works for them.' }); // prettier-ignore
    expect(push).toHaveBeenCalledTimes(1);
    expect(outcomes()).toEqual(['reported']);
  });

  it('a no-report never replaces a result that landed after the sweep looked', async () => {
    await captureCallResult(callId, answered(), request());
    await captureCallResult(callId, noReportOutcome(callId, NAME), request());
    expect(stored()).toMatchObject({ status: 'completed' });
    expect(told(NO_REPORT_LINE)).toBe(0);
    expect(outcomes()).toEqual(['reported']);
  });

  it('a real result whose push failed is never followed by a no-report push', async () => {
    push.mockResolvedValueOnce([{ success: false }]); // its push claim is given back
    await captureCallResult(callId, answered(), request());
    await captureCallResult(callId, noReportOutcome(callId, NAME), request());
    expect(push).toHaveBeenCalledTimes(1);
    expect(told(NO_REPORT_LINE)).toBe(0);
  });

  it('a late real result with their words replaces the no-report and is told; no second no-report', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) });
    await captureCallResult(callId, answered(), request());
    expect(stored()).toMatchObject({ status: 'completed' });
    expect(callDoc()?.delivered).toBe(false); // the next opener brings the real one up
    expect(push).toHaveBeenCalledTimes(2);
    expect(told(NO_REPORT_LINE)).toBe(1);
    expect(outcomes()).toEqual(['timed_out', 'late_real_result']);
  });

  it('a late status-only result is recorded, not told again; the app card gets the real one', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) });
    expect(card.mock.calls.at(-1)?.[0].summary).toContain(NO_REPORT_LINE);
    await captureCallResult(callId, statusOnly(), request());
    expect(stored()).toMatchObject({ status: 'no_answer' });
    expect(push).toHaveBeenCalledTimes(1);
    expect(card).toHaveBeenCalledTimes(2); // While You Were Away: the real result, after it
    expect(card.mock.calls.at(-1)?.[0].summary).toBe(`Tried calling ${NAME} - no answer`);
    await captureCallResult(callId, statusOnly(), request());
    expect(card).toHaveBeenCalledTimes(2); // a second capture of the same result: not again
  });

  it('the app card and the memory index say unconfirmed, never failed', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) });
    expect(card).toHaveBeenCalledTimes(1);
    expect(card.mock.calls[0]?.[0]).toMatchObject({ summary: `Call to ${NAME}: ${NO_REPORT_LINE}` }); // prettier-ignore
    expect(card.mock.calls[0]?.[0].status).not.toBe('failed');
    expect(indexed.mock.calls[0]?.[2]).toMatchObject({ outcome: 'unconfirmed', summary: NO_REPORT_LINE }); // prettier-ignore
  });

  it('a 40-minute call whose room is still open is never told as unreported; its real result is', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    room.state = 'open';
    for (const min of [25, 30, 35, 40]) {
      // eslint-disable-next-line no-await-in-loop -- one sweep a minute, in order
      const run = await sweepCallResultWatchdogs({ now: at(min * 60_000 + 1000) });
      expect(run).toMatchObject({ due: 1, settled: 0, again: 1 });
      expect(watchDoc()).toMatchObject({ status: 'pending', dueAt: at(min * 60_000 + 1000 + 5 * 60_000).toISOString() }); // prettier-ignore
    }
    expect(stored()).toBeUndefined();
    expect(push).not.toHaveBeenCalled();
    room.state = 'gone';
    await captureCallResult(callId, answered(), request()); // it ends at 41 min and reports
    await sweepCallResultWatchdogs({ now: at(46 * 60_000) });
    expect(told(NO_REPORT_LINE)).toBe(0);
    expect(push).toHaveBeenCalledTimes(1);
    expect(watchDoc()).toBeUndefined();
    expect(outcomes()).toEqual(['still_on', 'still_on', 'still_on', 'still_on', 'reported']);
  });

  it('a room that cannot be read is looked at again; past 4 h the owner is told', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    room.state = 'throws';
    expect(await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) })).toMatchObject({ again: 1 }); // prettier-ignore
    expect(stored()).toBeUndefined();
    vi.stubEnv('LIVEKIT_API_SECRET', ''); // no keys here: unknown too
    expect(await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 6 * 60_000) })).toMatchObject({ again: 1 }); // prettier-ignore
    room.state = 'open'; // a room stuck open past any call
    store.docs.set(`bogle_users/${OWNER}/call_result_watchdogs/${callId}`, { ...watchDoc(), dueAt: at(4 * 3600_000).toISOString() }); // prettier-ignore
    await sweepCallResultWatchdogs({ now: at(4 * 3600_000 + 1000) });
    expect(stored()).toMatchObject({ status: 'unconfirmed' });
    expect(told(NO_REPORT_LINE)).toBe(1);
  });

  it('the watch carries its arm time and no expireAt (no TTL policy); every warn carries a hash, never the id; an arm failure carries no error text', async () => {
    expect(await armCallResultWatchdog(request(), callId, T0)).toBe(true);
    expect(watchDoc()).toMatchObject({ armedAt: T0.toISOString() });
    expect(watchDoc()).not.toHaveProperty('expireAt');
    const failing = { ...store.db, collection: () => { throw new Error('UNAVAILABLE'); } }; // prettier-ignore
    const spy = vi.spyOn(store.db, 'collection').mockImplementation(failing.collection);
    expect(await armCallResultWatchdog(request(), `${callId}_b`, T0)).toBe(false); // not armed
    spy.mockRestore();
    noStore.on = true;
    expect(await armCallResultWatchdog(request(), `${callId}_c`, T0)).toBe(false); // no store
    noStore.on = false;
    // A watch its sweep can't settle: its request can't be read.
    const unreadable = new Proxy({}, { ownKeys: () => { throw new Error('unreadable'); } }); // prettier-ignore
    store.docs.set(`bogle_users/${OWNER}/call_result_watchdogs/${callId}`, { ...watchDoc(), request: unreadable }); // prettier-ignore
    expect(await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) })).toMatchObject({ failed: 1 }); // prettier-ignore
    const hash = expect.stringMatching(/^[0-9a-f]{12}$/);
    expect(warned).toEqual([
      { callHash: hash, errorClass: 'Error', reason: 'write_failed' }, // not armed: no error text
      { callHash: hash, errorClass: 'Error', reason: 'no_store' }, // not armed: no Firestore
      { callHash: hash, error: 'Error: unreadable' }, // not settled
    ]);
    expect(new Set(warned.map((w) => w.callHash)).size).toBe(3); // each its own call's hash
    expect(JSON.stringify(warned)).not.toContain(callId);
    expect(JSON.stringify(warned)).not.toContain('UNAVAILABLE');
  });

  it('a watch that cannot be settled keeps its due time, is tried again, and goes once a day late', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    const unreadable = new Proxy({}, { ownKeys: () => { throw new Error('unreadable'); } }); // prettier-ignore
    store.docs.set(`bogle_users/${OWNER}/call_result_watchdogs/${callId}`, { ...watchDoc(), request: unreadable }); // prettier-ignore
    expect(await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) })).toMatchObject({ failed: 1 }); // prettier-ignore
    expect(watchDoc()).toMatchObject({ status: 'pending', dueAt: at(NO_REPORT_AFTER_MS).toISOString() }); // prettier-ignore
    expect(await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 61_000) })).toMatchObject({ due: 1, failed: 1 }); // prettier-ignore
    expect(watchDoc()).toBeDefined();
    await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 24 * 3600_000 - 60_000) });
    expect(watchDoc()).toBeDefined(); // not yet a day late: kept, tried again
    await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 24 * 3600_000 + 1000) });
    expect(watchDoc()).toBeUndefined(); // a day late and still failing: dropped (no TTL does this)
    expect(push).not.toHaveBeenCalled();
  });

  it('a sweep that dies after its claim: the watch is due again when the lease ends, told once', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    room.state = 'hangs'; // the first sweep claims, then never comes back
    const first = at(NO_REPORT_AFTER_MS + 1000);
    const dead = sweepCallResultWatchdogs({ now: first });
    await vi.waitFor(() => {
      expect(room.asked).toHaveLength(1);
    });
    expect(watchDoc()).toMatchObject({ status: 'pending', dueAt: at(NO_REPORT_AFTER_MS + 1000 + 10 * 60_000).toISOString() }); // prettier-ignore
    room.state = 'gone';
    expect((await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 5 * 60_000) })).due).toBe(0); // prettier-ignore
    const retaken = await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 11 * 60_000) });
    expect(retaken).toMatchObject({ due: 1, settled: 1 });
    expect(told(NO_REPORT_LINE)).toBe(1);
    expect(watchDoc()).toBeUndefined();
    room.release(); // the first sweep comes back late: it finds the result and tells nothing
    await dead;
    expect(told(NO_REPORT_LINE)).toBe(1);
    expect(stored()).toMatchObject({ status: 'unconfirmed' });
  });
});

describe('CALL_RESULT_WATCHDOG and a crisis lead', () => {
  it('a crisis-lead result keeps its one crisis push; a no-report after it sends nothing', async () => {
    await captureCallResult(callId, crisis(), request());
    expect(told(crisisCallerLine(NAME))).toBe(1);
    await captureCallResult(callId, noReportOutcome(callId, NAME), request());
    expect(push).toHaveBeenCalledTimes(1);
    expect(stored()?.message).toBe(crisis().message);
  });

  it('a crisis line after a no-report still goes, led by the crisis line, once', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) });
    await captureCallResult(callId, crisis(), request());
    expect(told(crisisCallerLine(NAME))).toBe(1);
    expect(bodies().at(-1)?.startsWith(crisisCallerLine(NAME))).toBe(true);
  });

  it('a no-report is never a crisis lead, whatever the contact is called', async () => {
    const named = crisisCallerLine('');
    await captureCallResult(callId, noReportOutcome(callId, named), request());
    expect(bodies()).toHaveLength(1);
    expect(bodies()[0]?.startsWith(crisisCallerLine(NAME))).toBe(false);
    expect(callDoc()?.told).not.toHaveProperty('crisis');
  });
});

describe('CALL_RESULT_WATCHDOG off', () => {
  beforeEach(() => {
    vi.stubEnv('CALL_RESULT_WATCHDOG', '');
  });

  it('arms, sweeps and guards nothing: a call record is written as before', async () => {
    await armCallResultWatchdog(request(), callId, T0);
    expect(watchDoc()).toBeUndefined();
    store.docs.set(`bogle_users/${OWNER}/call_result_watchdogs/${callId}`, { status: 'pending', dueAt: T0.toISOString(), request: request() }); // prettier-ignore
    expect(await sweepCallResultWatchdogs({ now: at(NO_REPORT_AFTER_MS + 1000) })).toEqual({ due: 0, settled: 0, again: 0, failed: 0 }); // prettier-ignore
    expect(watchDoc()).toMatchObject({ status: 'pending' });
    await captureCallResult(callId, answered(), request());
    expect(stored()).toMatchObject({ status: 'completed' });
    expect(callDoc()).not.toHaveProperty('delivered');
    expect(watchLog).toEqual([]);
  });
});
