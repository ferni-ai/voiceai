/**
 * Audit 2026-10-29 (outreach memory, section C): with CALL_RESULT_LIVE_REPORT on,
 * the owner heard a finished call only if its result was captured in the same
 * process as the owner's own call. On LiveKit Cloud the outbound call is its own
 * job, often in another worker, so the in-process lookup found nothing.
 *
 * Two module graphs stand for two workers: the owner's (here) and the capture
 * worker's (loaded again after vi.resetModules), sharing one Firestore fake
 * whose transactions retry on contention like Firestore's. The owner's call
 * watches the call it placed (call-result-watch.ts) and tells it there, once.
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
  set: (data: Record<string, unknown>) => Promise<void>;
  update: (data: Record<string, unknown>) => Promise<void>;
}
interface Tx {
  get: (ref: Ref) => Promise<Snap>;
  update: (ref: Ref, data: Record<string, unknown>) => void;
}

/** One Firestore both workers see: docs by path, a version per doc, optimistic transactions. */
const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, number>();
  const reads = new Map<string, number>();
  const bump = (path: string): void => void versions.set(path, (versions.get(path) ?? 0) + 1);
  const snap = (path: string): Snap => ({ exists: docs.has(path), data: () => docs.get(path) });
  const write = (path: string, data: Record<string, unknown>): void => {
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
    get: async () => {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return snap(path);
    },
    set: async (data) => {
      docs.set(path, structuredClone(data));
      bump(path);
    },
    update: async (data) => {
      if (!docs.has(path)) throw new Error(`no document ${path}`);
      write(path, data);
    },
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    batch: () => {
      const writes: Array<[string, Record<string, unknown>]> = [];
      return {
        update: (r: Ref, data: Record<string, unknown>) => void writes.push([r.path, data]),
        commit: async () => writes.forEach(([path, data]) => write(path, data)),
      };
    },
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
          writes.forEach(([path, data]) => write(path, data));
          return result;
        }
      }
    },
  };
  return { docs, reads, db };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fs.db }));

/** While You Were Away's unified store: the result capture keeps for the next opener. */
const wywa = vi.hoisted(() => ({
  pending: [] as Array<{ id: string; relatedTaskId: string }>,
  markResultsDelivered: (() => undefined) as (...a: unknown[]) => unknown,
}));
vi.mock('../../background-agents/unified-result-capture.js', () => ({
  getPendingResults: async () => wywa.pending,
  markResultsDelivered: async (...a: unknown[]) => wywa.markResultsDelivered(...a),
}));

const stops = vi.hoisted((): string[] => []);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const recorder = (logger: object): object =>
    new Proxy(logger, {
      get(target, prop, receiver) {
        if (prop === 'info')
          return (fields: { reason?: string }, msg: unknown) => {
            if (msg === 'CALL_RESULT_WATCH_STOPPED') stops.push(String(fields.reason));
          };
        if (prop === 'child') return () => recorder(target);
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
  return {
    ...real,
    getLogger: () => recorder(real.getLogger()),
    createLogger: (...a: Parameters<typeof real.createLogger>) => recorder(real.createLogger(...a)),
  };
});

// The capture worker: its own live-session map, voice callbacks and claims.
const worker = {
  ...(await import('../call-result-live.js')),
  ...(await import('../live-report-record.js')),
};
vi.resetModules();
// The owner's worker.
const { watchCallResult } = await import('../call-result-watch.js');
const { reportCallResultLive } = await import('../call-result-live.js');
const { claimVoiceReport } = await import('../live-report-record.js');
await import('../call-result-capture.js'); // the watcher's reader, loaded before timers matter
const { noteLiveSession } = await import('../../../tools/registry/live-session.js');
const { registerVoiceCallbackHandler } =
  await import('../../../tools/domains/simple-utilities/voice-callbacks.js');
const { noteCrisisRisk, resetCrisisCallRisk } = await import('../../safety/crisis-call-risk.js');
const { createCallAlertSpeaker } = await import('../../../agents/shared/call-alerts.js');
const { CALLER_TEXT_GUARD } = await import('../caller-text.js');
const { voice } = await import('@livekit/agents');
import type { CallOutcome, OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const FAST = { pollMs: 10, maxMs: 60_000 };
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface Told {
  session: object;
  message: string;
}
const said = vi.fn(async (_cb: Told) => undefined);
let cleanup: Array<() => void> = [];

function request(userId: string, sessionId: string): OnBehalfCallRequest {
  return {
    contactQuery: 'my mom',
    resolvedContact: { name: 'Mom', phone: '+15555550100' },
    purpose: 'ask about Sunday dinner',
    objective: 'check_in',
    callType: 'personal',
    originalSessionId: sessionId,
    userId,
    userTimezone: 'UTC',
    userName: 'Sam',
    recordingConsent: true,
  };
}

const outcomeOf = (callId: string): CallOutcome => ({
  callId,
  status: 'completed',
  objectiveAchieved: true,
  outcome: 'She said Sunday dinner works.',
});
const pathOf = (userId: string, callId: string) =>
  `bogle_users/${userId}/on_behalf_calls/${callId}`;

/** The capture worker stores the result as storeCallResult does. */
function resultLands(userId: string, callId: string): void {
  fs.docs.set(pathOf(userId, callId), {
    callId,
    userId,
    outcome: outcomeOf(callId),
    request: { contactQuery: 'my mom', contactName: 'Mom', purpose: 'ask about Sunday dinner' },
    capturedAt: new Date().toISOString(),
  });
}

/** The owner's live call in this worker, registered as session setup does. */
function ownerCall(userId: string, sessionId: string) {
  const closing = new AbortController();
  const session = { _closingSignal: closing.signal };
  const releases = [
    registerVoiceCallbackHandler(userId, said as never, session),
    noteLiveSession(session, sessionId),
  ];
  const hangUp = (): void => releases.forEach((r) => r());
  cleanup.push(hangUp);
  return { session, hangUp, close: () => closing.abort() };
}

const readsOf = (userId: string, callId: string) => fs.reads.get(pathOf(userId, callId)) ?? 0;

beforeEach(() => {
  said.mockClear();
  wywa.pending = [];
  wywa.markResultsDelivered = vi.fn();
  stops.length = 0;
  process.env.CALL_RESULT_LIVE_REPORT = 'on';
});
afterEach(() => {
  cleanup.forEach((c) => c());
  cleanup = [];
  resetCrisisCallRisk();
  delete process.env.CALL_RESULT_LIVE_REPORT;
});

describe('the owner hears a call result captured in another worker', () => {
  it('the result lands in Firestore from the capture worker: told in the owner call, once', async () => {
    const { session } = ownerCall('uid-x1', 'sess-x1');
    const req = request('uid-x1', 'sess-x1');
    expect(watchCallResult(req, 'c-x1', FAST)).not.toBeNull();

    // The capture worker has no owner call: its own live report finds nobody.
    expect(worker.reportCallResultLive(req, outcomeOf('c-x1'))).toBe(false);
    await vi.waitFor(() => expect(readsOf('uid-x1', 'c-x1')).toBeGreaterThan(1));
    expect(said).not.toHaveBeenCalled(); // no result yet: still watching

    resultLands('uid-x1', 'c-x1');
    await vi.waitFor(() => expect(said).toHaveBeenCalledTimes(1));
    const [cb] = said.mock.calls[0];
    expect(cb.session).toBe(session);
    expect(cb.message).toContain('They picked up: She said Sunday dinner works.');
    expect(cb.message).toContain(CALLER_TEXT_GUARD);
    expect(fs.docs.get(pathOf('uid-x1', 'c-x1'))?.liveReport).toMatchObject({
      claimedAt: expect.any(String),
    });
    expect(stops).toEqual(['result']);

    const after = readsOf('uid-x1', 'c-x1');
    await wait(60);
    expect(said).toHaveBeenCalledTimes(1);
    expect(readsOf('uid-x1', 'c-x1')).toBe(after); // stopped: no more reads
  });

  it('the in-process report and the watcher race in the owner worker: said once', async () => {
    ownerCall('uid-r1', 'sess-r1');
    const req = request('uid-r1', 'sess-r1');
    watchCallResult(req, 'c-r1', { ...FAST, pollMs: 1 });
    resultLands('uid-r1', 'c-r1');
    expect(reportCallResultLive(req, outcomeOf('c-r1'))).toBe(true);

    await vi.waitFor(() => expect(stops).toEqual(['result']));
    await wait(30);
    expect(said).toHaveBeenCalledTimes(1);
  });

  it('two workers claim the same report at once: exactly one wins, on liveReport', async () => {
    resultLands('uid-r2', 'c-r2');
    const won = await Promise.all([
      claimVoiceReport('uid-r2', 'c-r2'),
      worker.claimVoiceReport('uid-r2', 'c-r2'),
    ]);
    expect(won.filter(Boolean)).toHaveLength(1);
    expect(fs.docs.get(pathOf('uid-r2', 'c-r2'))?.liveReport).toMatchObject({
      claimedAt: expect.any(String),
    });
  });

  it('an owner already texted (delivered) is not told again by voice', async () => {
    resultLands('uid-r3', 'c-r3');
    const doc = fs.docs.get(pathOf('uid-r3', 'c-r3')) ?? {};
    fs.docs.set(pathOf('uid-r3', 'c-r3'), { ...doc, delivered: true });
    expect(await worker.claimVoiceReport('uid-r3', 'c-r3')).toBe(false);
  });
});

describe('the watcher stops and leaves nothing running', () => {
  it('on session end (closing signal): no more reads, a late result is not spoken', async () => {
    const owner = ownerCall('uid-s1', 'sess-s1');
    watchCallResult(request('uid-s1', 'sess-s1'), 'c-s1', FAST);
    await wait(30);
    expect(readsOf('uid-s1', 'c-s1')).toBeGreaterThan(0);

    owner.close();
    expect(stops).toEqual(['session_end']);
    const at = readsOf('uid-s1', 'c-s1');
    resultLands('uid-s1', 'c-s1');
    await wait(60);
    expect(readsOf('uid-s1', 'c-s1')).toBe(at);
    expect(said).not.toHaveBeenCalled();
  });

  it('on hang-up without a closing signal: the next poll stops it', async () => {
    const owner = ownerCall('uid-s2', 'sess-s2');
    watchCallResult(request('uid-s2', 'sess-s2'), 'c-s2', FAST);
    await wait(30);
    owner.hangUp();
    await vi.waitFor(() => expect(stops).toEqual(['session_end']));
    const at = readsOf('uid-s2', 'c-s2');
    resultLands('uid-s2', 'c-s2');
    await wait(60);
    expect(readsOf('uid-s2', 'c-s2')).toBe(at);
    expect(said).not.toHaveBeenCalled();
  });

  it('at the timeout', async () => {
    ownerCall('uid-s3', 'sess-s3');
    watchCallResult(request('uid-s3', 'sess-s3'), 'c-s3', { pollMs: 10, maxMs: 40 });
    await vi.waitFor(() => expect(stops).toEqual(['timeout']));
    const at = readsOf('uid-s3', 'c-s3');
    resultLands('uid-s3', 'c-s3');
    await wait(60);
    expect(readsOf('uid-s3', 'c-s3')).toBe(at);
    expect(said).not.toHaveBeenCalled();
  });
});

describe('crisis holds it for the next opener', () => {
  it('crisis risk on the owner call: not spoken, not claimed', async () => {
    ownerCall('uid-c1', 'sess-c1');
    watchCallResult(request('uid-c1', 'sess-c1'), 'c-c1', FAST);
    noteCrisisRisk('sess-c1');
    resultLands('uid-c1', 'c-c1');
    await vi.waitFor(() => expect(stops).toEqual(['result']));
    await wait(30);
    expect(said).not.toHaveBeenCalled();
    expect(fs.docs.get(pathOf('uid-c1', 'c-c1'))?.liveReport).toBeUndefined();
    // The in-process path holds it too, and counts the owner as live (no text into a crisis call).
    expect(reportCallResultLive(request('uid-c1', 'sess-c1'), outcomeOf('c-c1'))).toBe(true);
    await wait(30);
    expect(said).not.toHaveBeenCalled();
  });

  it('crisis risk noted while the speaker waits for its pause: dropped, nothing said', async () => {
    const listeners = new Set<(ev: unknown) => void>();
    const session = {
      agentState: 'speaking', // Ferni is mid-sentence: the alert waits
      userState: 'listening',
      on: (_e: string, fn: (ev: unknown) => void) => listeners.add(fn),
      off: (_e: string, fn: (ev: unknown) => void) => listeners.delete(fn),
      generateReply: vi.fn(),
    };
    const logs: Array<[string, Record<string, unknown>]> = [];
    const speak = createCallAlertSpeaker(session, { log: (m, f) => logs.push([m, f]) });
    let crisis = false;
    const done = speak({
      type: 'call_outcome',
      userId: 'uid-c2',
      message: 'x',
      priority: 'high',
      holdIf: () => crisis,
    });
    await wait(10);
    crisis = true;
    session.agentState = 'listening';
    listeners.forEach((fn) => fn({ newState: 'listening' }));
    await done;
    expect(session.generateReply).not.toHaveBeenCalled();
    expect(logs).toEqual([['CALL_ALERT_DROPPED', expect.objectContaining({ reason: 'held' })]]);
  });
});

describe('nothing starts', () => {
  it('flag off (its real default, unset): no watcher, no reads, nothing said', async () => {
    delete process.env.CALL_RESULT_LIVE_REPORT;
    ownerCall('uid-n1', 'sess-n1');
    expect(watchCallResult(request('uid-n1', 'sess-n1'), 'c-n1', FAST)).toBeNull();
    resultLands('uid-n1', 'c-n1');
    await wait(60);
    expect(readsOf('uid-n1', 'c-n1')).toBe(0);
    expect(said).not.toHaveBeenCalled();
  });

  it('the call that placed it is not live in this worker: only the owner call watches', async () => {
    expect(watchCallResult(request('uid-n2', 'sess-elsewhere'), 'c-n2', FAST)).toBeNull();
    resultLands('uid-n2', 'c-n2');
    await wait(60);
    expect(readsOf('uid-n2', 'c-n2')).toBe(0);
  });
});

describe("told.* is the once-per-channel ledger's, never the live report's (#3081)", () => {
  it.each([0, 1, 2])('told.voice preset to %i: the watch still tells it', async (level) => {
    ownerCall(`uid-t${level}`, `sess-t${level}`);
    watchCallResult(request(`uid-t${level}`, `sess-t${level}`), `c-t${level}`, FAST);
    resultLands(`uid-t${level}`, `c-t${level}`);
    const doc = fs.docs.get(pathOf(`uid-t${level}`, `c-t${level}`)) ?? {};
    fs.docs.set(pathOf(`uid-t${level}`, `c-t${level}`), { ...doc, told: { voice: level } });
    await vi.waitFor(() => expect(said).toHaveBeenCalledTimes(1));
    expect(fs.docs.get(pathOf(`uid-t${level}`, `c-t${level}`))?.told).toEqual({ voice: level });
  });

  it.each([0, 1, 2])(
    'told.voice preset to %i: the in-process report still tells it',
    async (level) => {
      ownerCall(`uid-i${level}`, `sess-i${level}`);
      resultLands(`uid-i${level}`, `c-i${level}`);
      const doc = fs.docs.get(pathOf(`uid-i${level}`, `c-i${level}`)) ?? {};
      fs.docs.set(pathOf(`uid-i${level}`, `c-i${level}`), { ...doc, told: { voice: level } });
      reportCallResultLive(request(`uid-i${level}`, `sess-i${level}`), outcomeOf(`c-i${level}`));
      await vi.waitFor(() => expect(said).toHaveBeenCalledTimes(1));
    }
  );
});

/** A LiveKit AgentSession as the alert speaker sees it: a reply asked for plays through. */
function agentSession() {
  const listeners = new Map<string, Set<(ev: unknown) => void>>();
  const closing = new AbortController();
  const s = {
    agentState: 'speaking', // Ferni is mid-sentence: an alert waits for its pause
    userState: 'listening',
    _closingSignal: closing.signal,
    generateReply: vi.fn(() => ({
      interrupted: false,
      addDoneCallback: (fn: () => void) => void Promise.resolve().then(fn),
    })),
    on: (e: string, fn: (ev: unknown) => void) =>
      listeners.set(e, (listeners.get(e) ?? new Set()).add(fn)),
    off: (e: string, fn: (ev: unknown) => void) => listeners.get(e)?.delete(fn),
    pause(): void {
      s.agentState = 'listening';
      const fns = listeners.get(voice.AgentSessionEventTypes.AgentStateChanged) ?? [];
      [...fns].forEach((fn) => fn({ newState: 'listening' }));
    },
    close: () => closing.abort(),
  };
  return s;
}

/** The owner's call with the real alert speaker, as live-call-behaviors.ts registers it. */
function speakingOwnerCall(userId: string, sessionId: string) {
  const session = agentSession();
  const releases = [
    registerVoiceCallbackHandler(userId, createCallAlertSpeaker(session, { sessionId }), session),
    noteLiveSession(session, sessionId),
  ];
  cleanup.push(() => releases.forEach((r) => r()));
  return session;
}

const docOf = (userId: string, callId: string) => fs.docs.get(pathOf(userId, callId)) ?? {};

describe('heard is delivered; held or dropped is not', () => {
  it('spoken: liveReport.spokenAt, and delivered by voice in both stores', async () => {
    const session = speakingOwnerCall('uid-h1', 'sess-h1');
    wywa.pending = [
      { id: 'wywa-h1', relatedTaskId: 'c-h1' },
      { id: 'other', relatedTaskId: 'x' },
    ];
    watchCallResult(request('uid-h1', 'sess-h1'), 'c-h1', FAST);
    resultLands('uid-h1', 'c-h1');
    await vi.waitFor(() => expect(docOf('uid-h1', 'c-h1').liveReport).toBeDefined());
    await wait(20);
    expect(docOf('uid-h1', 'c-h1').delivered).toBeUndefined(); // not yet heard: Ferni is talking
    expect(wywa.markResultsDelivered).not.toHaveBeenCalled();

    session.pause();
    await vi.waitFor(() => expect(docOf('uid-h1', 'c-h1').delivered).toBe(true));
    expect(session.generateReply).toHaveBeenCalledTimes(1);
    expect(docOf('uid-h1', 'c-h1').liveReport).toMatchObject({ spokenAt: expect.any(String) });
    await vi.waitFor(() =>
      expect(wywa.markResultsDelivered).toHaveBeenCalledWith('uid-h1', ['wywa-h1'], 'voice')
    );
  });

  it('crisis risk noted after the claim, before the pause: held, nothing said or marked', async () => {
    const session = speakingOwnerCall('uid-h2', 'sess-h2');
    wywa.pending = [{ id: 'wywa-h2', relatedTaskId: 'c-h2' }];
    watchCallResult(request('uid-h2', 'sess-h2'), 'c-h2', FAST);
    resultLands('uid-h2', 'c-h2');
    await vi.waitFor(() =>
      expect(docOf('uid-h2', 'c-h2').liveReport).toMatchObject({ claimedAt: expect.any(String) })
    );
    noteCrisisRisk('sess-h2'); // the owner's turn found risk while the speaker waited

    session.pause();
    await wait(50);
    expect(session.generateReply).not.toHaveBeenCalled();
    expect(docOf('uid-h2', 'c-h2').delivered).toBeUndefined();
    expect(docOf('uid-h2', 'c-h2').liveReport).not.toHaveProperty('spokenAt');
    expect(wywa.markResultsDelivered).not.toHaveBeenCalled();
  });

  it('dropped (the call ends before its pause): nothing marked', async () => {
    const session = speakingOwnerCall('uid-h3', 'sess-h3');
    wywa.pending = [{ id: 'wywa-h3', relatedTaskId: 'c-h3' }];
    watchCallResult(request('uid-h3', 'sess-h3'), 'c-h3', FAST);
    resultLands('uid-h3', 'c-h3');
    await vi.waitFor(() => expect(docOf('uid-h3', 'c-h3').liveReport).toBeDefined());

    session.close();
    await wait(50);
    expect(session.generateReply).not.toHaveBeenCalled();
    expect(docOf('uid-h3', 'c-h3').delivered).toBeUndefined();
    expect(wywa.markResultsDelivered).not.toHaveBeenCalled();
  });
});
