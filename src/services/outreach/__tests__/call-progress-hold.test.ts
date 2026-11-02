/**
 * CALL_LIVE_RELAY, between the hand-off and the pause: a progress line handed to
 * the alert speaker waits for a pause in the owner's call (up to QUIET_WAIT_MS, with
 * a retry after a cut). In that window the result can land, or crisis risk can
 * arrive. Either way the line must be dropped at the pause and never told again.
 * And a result stored before the claim (the watch read the record just before it
 * landed) means the line is never handed over at all.
 *
 * Fake timers drive the owner's watch, whose reader is this file's record; the
 * real alert speaker (call-alerts.ts) runs the held line against a quiet session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const setDotted = (path: string, data: Record<string, unknown>): void => {
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
  };
  const snap = (path: string) => ({ exists: docs.has(path), data: () => docs.get(path) });
  const ref = (path: string): Record<string, unknown> => ({
    path,
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    get: async () => snap(path),
    update: async (data: Record<string, unknown>) => setDotted(path, data),
    set: async (data: Record<string, unknown>) => setDotted(path, data),
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: async (r: { path: string }) => snap(r.path),
        update: (r: { path: string }, data: Record<string, unknown>) => setDotted(r.path, data),
      }),
  };
  return { docs, db, setDotted };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fs.db }));
vi.mock('../../background-agents/unified-result-capture.js', () => ({
  getPendingResults: async () => [],
  markResultsDelivered: async () => undefined,
}));

const { watchCallResult } = await import('../call-result-watch.js');
const { relayProgress } = await import('../call-progress.js');
const { noteLiveSession } = await import('../../../tools/registry/live-session.js');
const { registerVoiceCallbackHandler } =
  await import('../../../tools/domains/simple-utilities/voice-callbacks.js');
const { noteCrisisRisk, resetCrisisCallRisk } = await import('../../safety/crisis-call-risk.js');
const { createCallAlertSpeaker } = await import('../../../agents/shared/call-alerts.js');
import type { VoiceCallback } from '../../../tools/domains/simple-utilities/voice-callbacks.js';
import type { OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const UID = 'uid-riley-test';
const SESSION = 'sess-owner-hold';
const POLL = 100;
const pathOf = (callId: string) => `bogle_users/${UID}/on_behalf_calls/${callId}`;
const noted = (callId: string) =>
  fs.setDotted(pathOf(callId), { callId, 'progress.answeredAt': '2026-11-01T10:00:00.000Z' });
const resultLands = (callId: string) =>
  fs.setDotted(pathOf(callId), {
    outcome: { callId, status: 'completed', objectiveAchieved: true, outcome: 'Thursday works.' },
  });

const request: OnBehalfCallRequest = {
  contactQuery: 'Priya',
  resolvedContact: { name: 'Priya', phone: '+15555550142' },
  purpose: 'ask about Thursday',
  objective: 'check_in',
  callType: 'personal',
  originalSessionId: SESSION,
  userId: UID,
  userTimezone: 'UTC',
  userName: 'Riley Test',
  recordingConsent: true,
};

let handed: VoiceCallback[] = [];
let cleanup: Array<() => void> = [];
const progressLines = () => handed.filter((cb) => cb.type === 'call_progress');

/** The owner's live call: it watches the placed call and hands lines to its speaker. */
function ownerWatches(callId: string): void {
  const session = { _closingSignal: new AbortController().signal };
  const releases = [
    registerVoiceCallbackHandler(UID, async (cb) => void handed.push(cb), session),
    noteLiveSession(session, SESSION),
  ];
  cleanup.push(() => releases.forEach((r) => r()));
  const stop = watchCallResult(request, callId, {
    readCall: async () => fs.docs.get(pathOf(callId)) ?? null,
    pollMs: POLL,
    maxMs: 60_000,
  });
  expect(stop).not.toBeNull();
  cleanup.push(() => stop?.());
}

/** The real alert speaker, on a quiet owner call: at once at its pause. */
async function atThePause(cb: VoiceCallback) {
  const session = {
    agentState: 'listening',
    userState: 'listening',
    _activity: { currentSpeech: undefined, endpointingOpts: { maxDelay: 0 } },
    generateReply: vi.fn(() => ({ interrupted: false, addDoneCallback: (fn: () => void) => fn() })),
    on: () => undefined,
    off: () => undefined,
  };
  const logs: Array<{ msg: string; reason?: unknown }> = [];
  const speak = createCallAlertSpeaker(session as never, {
    sessionId: SESSION,
    log: (msg, fields) => void logs.push({ msg, reason: fields.reason }),
  });
  await speak(cb);
  return { spoken: session.generateReply.mock.calls.length, logs };
}

beforeEach(() => {
  vi.useFakeTimers();
  fs.docs.clear();
  handed = [];
  process.env.CALL_RESULT_LIVE_REPORT = 'on';
  process.env.CALL_LIVE_RELAY = 'on';
});
afterEach(() => {
  cleanup.forEach((c) => c());
  cleanup = [];
  resetCrisisCallRisk();
  vi.useRealTimers();
  delete process.env.CALL_RESULT_LIVE_REPORT;
  delete process.env.CALL_LIVE_RELAY;
});

describe('a progress line waiting for its pause', () => {
  it('the result lands after the hand-off: dropped at the pause, the result told', async () => {
    ownerWatches('c-hold-1');
    noted('c-hold-1');
    await vi.advanceTimersByTimeAsync(POLL);
    expect(progressLines()).toHaveLength(1);
    const [line] = progressLines();
    expect(line.holdIf?.()).toBe(false);
    // Positive control: not held, the real speaker says it.
    expect((await atThePause(line)).spoken).toBe(1);

    resultLands('c-hold-1');
    await vi.advanceTimersByTimeAsync(POLL);
    expect(handed.filter((cb) => cb.type === 'call_outcome')).toHaveLength(1);
    expect(line.holdIf?.()).toBe(true);
    const pause = await atThePause(line);
    expect(pause.spoken).toBe(0);
    expect(pause.logs).toEqual([{ msg: 'CALL_ALERT_DROPPED', reason: 'held' }]);
  });

  it('the result was stored before the claim (a stale read): never handed over', async () => {
    noted('c-hold-2');
    const staleRead = structuredClone(fs.docs.get(pathOf('c-hold-2')));
    resultLands('c-hold-2');
    const session = {};
    cleanup.push(registerVoiceCallbackHandler(UID, async (cb) => void handed.push(cb), session));
    const call = { session, sessionId: SESSION, userId: UID, callId: 'c-hold-2' };
    await relayProgress({ ...call, contactName: 'Priya', resultSeen: () => false }, staleRead);
    await vi.advanceTimersByTimeAsync(0);
    expect(progressLines()).toHaveLength(0);
    expect(fs.docs.get(pathOf('c-hold-2'))?.progress).toEqual({ answeredAt: expect.any(String) });
  });

  it('crisis risk arrives after the hand-off: dropped at the pause, never told again', async () => {
    ownerWatches('c-hold-3');
    noted('c-hold-3');
    await vi.advanceTimersByTimeAsync(POLL);
    expect(progressLines()).toHaveLength(1);
    const [line] = progressLines();
    expect(line.holdIf?.()).toBe(false);

    noteCrisisRisk(SESSION);
    expect(line.holdIf?.()).toBe(true);
    const pause = await atThePause(line);
    expect(pause.spoken).toBe(0);
    expect(pause.logs).toEqual([{ msg: 'CALL_ALERT_DROPPED', reason: 'held' }]);

    resetCrisisCallRisk();
    await vi.advanceTimersByTimeAsync(POLL * 5); // five more polls of the same record
    expect(progressLines()).toHaveLength(1);
  });
});
