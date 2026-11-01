/**
 * CALL_LIVE_RELAY: the owner's live call hears "they picked up" / "went to
 * voicemail" while the call Ferni placed is going, once per call per kind,
 * whichever worker notes it and however many watchers read it.
 *
 * Two module graphs stand for two workers (the placed call's job, and the
 * owner's call), sharing one Firestore fake with merge writes and optimistic
 * transactions, as call-result-cross-process.test.ts does. The owner's voice
 * callback handler records what reaches the speaker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Snap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}
interface Ref {
  path: string;
  collection: (name: string) => { doc: (id: string) => Ref };
  get: () => Promise<Snap>;
  set: (data: Record<string, unknown>, opts?: { merge?: boolean }) => Promise<void>;
  update: (data: Record<string, unknown>) => Promise<void>;
}
interface Tx {
  get: (ref: Ref) => Promise<Snap>;
  update: (ref: Ref, data: Record<string, unknown>) => void;
}

const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, number>();
  const bump = (path: string): void => void versions.set(path, (versions.get(path) ?? 0) + 1);
  const snap = (path: string): Snap => ({ exists: docs.has(path), data: () => docs.get(path) });
  const deepMerge = (into: Record<string, unknown>, from: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(from)) {
      const both = value && typeof value === 'object' && !Array.isArray(value);
      if (both && into[key] && typeof into[key] === 'object') {
        deepMerge(into[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else into[key] = structuredClone(value);
    }
  };
  const dotted = (path: string, data: Record<string, unknown>): void => {
    const doc = structuredClone(docs.get(path) ?? {});
    for (const [key, value] of Object.entries(data)) {
      const parts = key.split('.');
      let at: Record<string, unknown> = doc;
      for (const part of parts.slice(0, -1)) {
        at[part] = { ...((at[part] as Record<string, unknown> | undefined) ?? {}) };
        at = at[part] as Record<string, unknown>;
      }
      at[parts[parts.length - 1]] = value;
    }
    docs.set(path, doc);
    bump(path);
  };
  const ref = (path: string): Ref => ({
    path,
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
    get: async () => snap(path),
    set: async (data, opts) => {
      const doc = opts?.merge ? structuredClone(docs.get(path) ?? {}) : {};
      deepMerge(doc, data);
      docs.set(path, doc);
      bump(path);
    },
    update: async (data) => {
      if (!docs.has(path)) throw new Error(`no document ${path}`);
      dotted(path, data);
    },
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      for (;;) {
        const seen = new Map<string, number>();
        const writes: Array<[string, Record<string, unknown>]> = [];
        // eslint-disable-next-line no-await-in-loop -- a retry is the next attempt
        const result = await fn({
          get: async (r) => {
            seen.set(r.path, versions.get(r.path) ?? 0);
            await Promise.resolve();
            return snap(r.path);
          },
          update: (r, data) => void writes.push([r.path, data]),
        });
        if ([...seen].every(([path, v]) => (versions.get(path) ?? 0) === v)) {
          writes.forEach(([path, data]) => dotted(path, data));
          return result;
        }
      }
    },
  };
  return { docs, db };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fs.db }));
vi.mock('../../background-agents/unified-result-capture.js', () => ({
  getPendingResults: async () => [],
  markResultsDelivered: async () => undefined,
}));

// The placed call's worker: it notes progress. (Its job's call context is read through a dynamic
// import, which resolves in the newest module graph, so that context is set there below.)
const placedProgress = await import('../call-progress.js');
vi.resetModules();
// A second watcher's worker (its own claims in memory): the claim must hold across both.
const second = {
  ...(await import('../call-result-watch.js')),
  ...(await import('../../../tools/registry/live-session.js')),
  ...(await import('../../../tools/domains/simple-utilities/voice-callbacks.js')),
};
await import('../call-result-capture.js');
vi.resetModules();
// The owner's worker.
const { watchCallResult } = await import('../call-result-watch.js');
const { liveReportMessage } = await import('../call-result-live.js');
await import('../call-result-capture.js'); // the watcher's reader, loaded before timers matter
const { noteLiveSession } = await import('../../../tools/registry/live-session.js');
const { registerVoiceCallbackHandler } =
  await import('../../../tools/domains/simple-utilities/voice-callbacks.js');
const { noteCrisisRisk, resetCrisisCallRisk } = await import('../../safety/crisis-call-risk.js');
const placed = {
  ...placedProgress,
  ...(await import('../../../intelligence/context-builders/external/outbound-call-context.js')),
};
import type { CallOutcome, OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const FAST = { pollMs: 5, maxMs: 60_000 };
type CallContext = NonNullable<ReturnType<typeof placed.getOutboundCallContext>>;
function contextOf(jobSession: string): CallContext {
  const context = placed.getOutboundCallContext(jobSession);
  if (!context) throw new Error('no call context');
  return context;
}
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface Told {
  type: string;
  message: string;
  session: object;
}
const said = vi.fn(async (_cb: Told) => undefined);
let cleanup: Array<() => void> = [];
const ofType = (type: string) => said.mock.calls.filter(([cb]) => cb.type === type);

const UID = 'uid-riley-test';
const pathOf = (callId: string) => `bogle_users/${UID}/on_behalf_calls/${callId}`;

function request(sessionId: string): OnBehalfCallRequest {
  return {
    contactQuery: 'Priya',
    resolvedContact: { name: 'Priya', phone: '+15555550142' },
    purpose: 'ask about the Maplewood book club',
    objective: 'check_in',
    callType: 'personal',
    originalSessionId: sessionId,
    userId: UID,
    userTimezone: 'UTC',
    userName: 'Riley Test',
    recordingConsent: true,
  };
}

/** The placed call's job knows its call (metadata-parser.ts), keyed by its own session id. */
function placedCall(callId: string, jobSession = `onbehalf:${callId}`): string {
  placed.setOutboundCallContext(jobSession, {
    callId,
    recipientName: 'Priya',
    recipientPhone: '+15555550142',
    purpose: 'ask about the Maplewood book club',
    callType: 'personal',
    objective: 'check_in',
    script: '',
    complianceScript: '',
    mustConfirm: [],
    mustNotDo: [],
    informationToGather: [],
    userName: 'Riley Test',
    originalSessionId: 'sess-owner',
    requesterUserId: UID,
    kind: 'on_behalf',
  });
  return jobSession;
}

function ownerCall(sessionId: string) {
  const closing = new AbortController();
  const session = { _closingSignal: closing.signal };
  const releases = [
    registerVoiceCallbackHandler(UID, said as never, session),
    noteLiveSession(session, sessionId),
  ];
  cleanup.push(() => releases.forEach((r) => r()));
  return session;
}

const outcomeOf = (callId: string, status: CallOutcome['status']): CallOutcome => ({
  callId,
  status,
  objectiveAchieved: status === 'completed',
  outcome: status === 'completed' ? 'Priya said Thursday works.' : 'I could not reach Priya.',
});

/** The capture worker stores the result as storeCallResult does (merging into the record). */
async function resultLands(callId: string, status: CallOutcome['status']): Promise<void> {
  const ref = fs.db.collection('bogle_users').doc(UID).collection('on_behalf_calls').doc(callId);
  await ref.set({ callId, userId: UID, outcome: outcomeOf(callId, status) }, { merge: true });
}

/** Watch a call placed from the owner's call; return its job session id. */
function watched(callId: string): string {
  const session = ownerCall('sess-owner');
  expect(watchCallResult(request('sess-owner'), callId, FAST)).not.toBeNull();
  void session;
  return placedCall(callId);
}

beforeEach(() => {
  said.mockClear();
  process.env.CALL_RESULT_LIVE_REPORT = 'on';
  process.env.CALL_LIVE_RELAY = 'on';
});
afterEach(() => {
  cleanup.forEach((c) => c());
  cleanup = [];
  resetCrisisCallRisk();
  delete process.env.CALL_RESULT_LIVE_REPORT;
  delete process.env.CALL_LIVE_RELAY;
});

describe('the owner hears the call Ferni placed as it goes', () => {
  it('a person picks up: one line, naming the contact the owner gave, no callee words', async () => {
    const job = watched('c-answered');
    await placed.noteCallProgress(job, 'answered');
    expect(fs.docs.get(pathOf('c-answered'))?.progress).toMatchObject({
      answeredAt: expect.any(String),
    });
    await vi.waitFor(() => expect(ofType('call_progress')).toHaveLength(1));
    const [cb] = ofType('call_progress')[0];
    expect(cb.message).toContain("They picked up, I'm talking to Priya now.");
    expect(cb.message).not.toContain('voicemail');
    await wait(40);
    expect(said).toHaveBeenCalledTimes(1); // polled many times since: still once
  });

  it('it goes to voicemail: one line, the voicemail one', async () => {
    const job = watched('c-vm');
    await placed.noteCallProgress(job, 'voicemail');
    await vi.waitFor(() => expect(ofType('call_progress')).toHaveLength(1));
    const [cb] = ofType('call_progress')[0];
    expect(cb.message).toContain("Went to voicemail, I'm leaving a message.");
    expect(cb.message).not.toContain('picked up');
    await wait(40);
    expect(said).toHaveBeenCalledTimes(1);
  });

  it('the same event noted twice, read by watchers in two workers: said once', async () => {
    ownerCall('sess-owner');
    const otherSession = { _closingSignal: new AbortController().signal };
    const releases = [
      second.registerVoiceCallbackHandler(UID, said as never, otherSession),
      second.noteLiveSession(otherSession, 'sess-owner'),
    ];
    cleanup.push(() => releases.forEach((r) => r()));
    expect(
      watchCallResult(request('sess-owner'), 'c-twice', { ...FAST, pollMs: 1 })
    ).not.toBeNull();
    expect(
      second.watchCallResult(request('sess-owner'), 'c-twice', { ...FAST, pollMs: 1 })
    ).not.toBeNull();
    const job = placedCall('c-twice');
    await Promise.all([
      placed.noteCallProgress(job, 'answered'),
      placed.noteCallProgress(job, 'answered'),
    ]);
    await vi.waitFor(() => expect(ofType('call_progress')).toHaveLength(1));
    await wait(40);
    expect(ofType('call_progress')).toHaveLength(1);
    expect(fs.docs.get(pathOf('c-twice'))?.progress).toMatchObject({
      answeredTold: expect.any(String),
    });
  });

  it.each(['no_answer', 'busy', 'failed'] as const)(
    'it ends unanswered (%s): one line, the end-of-call report, no relay line',
    async (status) => {
      watched(`c-${status}`);
      await wait(20);
      await resultLands(`c-${status}`, status);
      await vi.waitFor(() => expect(ofType('call_outcome')).toHaveLength(1));
      await wait(40);
      expect(said).toHaveBeenCalledTimes(1);
      expect(ofType('call_progress')).toHaveLength(0);
    }
  );

  it('picked up, then ended: no extra line, the end-of-call report once', async () => {
    const job = watched('c-done');
    await placed.noteCallProgress(job, 'answered');
    await vi.waitFor(() => expect(ofType('call_progress')).toHaveLength(1));
    await resultLands('c-done', 'completed');
    await vi.waitFor(() => expect(ofType('call_outcome')).toHaveLength(1));
    await wait(40);
    expect(said).toHaveBeenCalledTimes(2);
    expect(ofType('call_outcome')[0][0].message).toContain(
      'They picked up: Priya said Thursday works.'
    );
  });

  it('a result already on the record: the late progress is not told, only the report', async () => {
    ownerCall('sess-owner');
    const job = placedCall('c-late');
    await placed.noteCallProgress(job, 'voicemail');
    await resultLands('c-late', 'voicemail');
    expect(watchCallResult(request('sess-owner'), 'c-late', FAST)).not.toBeNull();
    await vi.waitFor(() => expect(ofType('call_outcome')).toHaveLength(1));
    await wait(40);
    expect(ofType('call_progress')).toHaveLength(0);
  });

  it('crisis risk on the owner call: dropped, never said later', async () => {
    const job = watched('c-crisis');
    noteCrisisRisk('sess-owner');
    await placed.noteCallProgress(job, 'answered');
    await vi.waitFor(() =>
      expect(fs.docs.get(pathOf('c-crisis'))?.progress).toMatchObject({
        answeredTold: expect.any(String),
      })
    );
    resetCrisisCallRisk();
    await wait(40);
    expect(ofType('call_progress')).toHaveLength(0);
  });
});

describe('flags', () => {
  it('CALL_LIVE_RELAY off: nothing noted or said, and the end-of-call report is as on main', async () => {
    delete process.env.CALL_LIVE_RELAY;
    const job = watched('c-off');
    await placed.noteCallProgress(job, 'answered');
    expect(fs.docs.get(pathOf('c-off'))).toBeUndefined(); // nothing written
    // A progress record from elsewhere is not read either.
    await fs.db.collection('bogle_users').doc(UID).collection('on_behalf_calls').doc('c-off')
      .set({ progress: { answeredAt: new Date().toISOString() } }, { merge: true }); // prettier-ignore
    await wait(40);
    expect(said).not.toHaveBeenCalled();
    await resultLands('c-off', 'completed');
    await vi.waitFor(() => expect(said).toHaveBeenCalledTimes(1));
    const [cb] = said.mock.calls[0];
    expect(cb.type).toBe('call_outcome');
    expect(cb.message).toBe(liveReportMessage('Priya', outcomeOf('c-off', 'completed')));
    expect(fs.docs.get(pathOf('c-off'))?.progress).toEqual({ answeredAt: expect.any(String) });
  });

  it('CALL_LIVE_RELAY on with CALL_RESULT_LIVE_REPORT off: nothing', async () => {
    delete process.env.CALL_RESULT_LIVE_REPORT;
    ownerCall('sess-owner');
    expect(watchCallResult(request('sess-owner'), 'c-no-report', FAST)).toBeNull();
    const job = placedCall('c-no-report');
    expect(placed.callLiveRelayOn()).toBe(false);
    await placed.noteCallProgress(job, 'answered');
    expect(fs.docs.get(pathOf('c-no-report'))).toBeUndefined();
    await wait(30);
    expect(said).not.toHaveBeenCalled();
  });

  it('a family check-in or an unsigned requester is never noted', async () => {
    placed.setOutboundCallContext('fam-1', {
      ...contextOf(placedCall('c-fam')),
      kind: 'family_checkin',
    });
    await placed.noteCallProgress('fam-1', 'answered');
    placed.setOutboundCallContext('unsigned-1', {
      ...contextOf(placedCall('c-unsigned')),
      requesterUserId: undefined,
    });
    await placed.noteCallProgress('unsigned-1', 'answered');
    expect(fs.docs.get(pathOf('c-fam'))).toBeUndefined();
    expect(fs.docs.get(pathOf('c-unsigned'))).toBeUndefined();
  });
});
