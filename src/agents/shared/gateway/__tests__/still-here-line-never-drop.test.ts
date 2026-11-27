/**
 * The line said to a caller at risk when the step-away exit is held (STILL_HERE_LINE) goes
 * through the speech coordinator at RESPONSE priority: it expires after 10 s in the queue, and
 * waits its turn behind other lines. With CRISIS_LINE_NEVER_DROP on it is queued first and never
 * expires, so a line that is slow to end cannot make it vanish (#4447).
 *
 * Real exit, real coordinator, real routing; only the LiveKit session is a stub.
 */
import type { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../speech/direction/index.js', () => ({ sayInOwnWords: vi.fn() }));
vi.mock('../../../../config/timeouts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../config/timeouts.js')>()),
  GRACEFUL_EXIT_TTS_WAIT_MS: 0,
}));

import {
  cleanupSpeechCoordination,
  initializeSpeechCoordination,
  routeSpeech,
} from '../../../../speech/coordination/session-integration.js';
import {
  CoordinatorState,
  getSpeechCoordinator,
  resetSpeechCoordinator,
} from '../../../../speech/coordination/speech-coordinator.js';
import {
  noteCrisisRisk,
  resetCrisisCallRisk,
} from '../../../../services/safety/crisis-call-risk.js';
import { triggerGracefulExit, unregisterSessionForReconnection } from '../reconnection.js';
import { STILL_HERE_LINE } from '../step-away-crisis-hold.js';

let n = 0;
const MINUTE = 60_000;

/** A call whose caller is at risk, with a line (A) being spoken that has not ended yet. */
async function callWithALineStillPlaying() {
  const sessionId = `never-drop-${++n}`;
  const say = vi.fn();
  initializeSpeechCoordination({
    session: { say } as unknown as voice.AgentSession,
    sessionId,
    personaId: 'p-1',
  });
  await routeSpeech(sessionId, 'Line A');
  noteCrisisRisk(sessionId);
  return { sessionId, say, lines: () => say.mock.calls.map((c) => c[0] as string) };
}

/** Line A ends `afterMs` later; the coordinator plays what is queued once its cooldown passes. */
async function endLineA(afterMs: number, played: () => string[], expected: number) {
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + afterMs);
  getSpeechCoordinator().onSpeechEnded(false, 1000);
  await vi.advanceTimersByTimeAsync(5_000);
  vi.useRealTimers();
  expect(played()).toHaveLength(expected);
}

beforeEach(() => {
  resetSpeechCoordinator();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetCrisisCallRisk();
  resetSpeechCoordinator();
});

describe('STILL_HERE_LINE with CRISIS_LINE_NEVER_DROP', () => {
  it('on: survives a line that is slow to end, where it expired before', async () => {
    vi.stubEnv('CRISIS_LINE_NEVER_DROP', 'on');
    const call = await callWithALineStillPlaying();
    await triggerGracefulExit(call.sessionId);

    expect(call.lines()).toEqual(['Line A']); // queued, never cutting in on Line A
    await endLineA(5 * MINUTE, call.lines, 2);

    expect(call.lines()).toEqual(['Line A', STILL_HERE_LINE]);
    unregisterSessionForReconnection(call.sessionId);
    cleanupSpeechCoordination(call.sessionId);
  });

  it('off: expires in the queue after 10 s, as on main', async () => {
    const call = await callWithALineStillPlaying();
    await triggerGracefulExit(call.sessionId);

    expect(call.lines()).toEqual(['Line A']);
    await endLineA(5 * MINUTE, call.lines, 1);

    expect(call.lines()).toEqual(['Line A']);
    unregisterSessionForReconnection(call.sessionId);
    cleanupSpeechCoordination(call.sessionId);
  });

  it('on: a call that ends while the line is queued discards it; nothing is said on a closed session', async () => {
    vi.stubEnv('CRISIS_LINE_NEVER_DROP', 'on');
    const call = await callWithALineStillPlaying();
    await triggerGracefulExit(call.sessionId);
    expect(getSpeechCoordinator().getState()).toBe(CoordinatorState.SPEAKING);

    cleanupSpeechCoordination(call.sessionId); // the call ends: the coordinator detaches
    expect(getSpeechCoordinator().getState()).toBe(CoordinatorState.IDLE);
    getSpeechCoordinator().onSpeechEnded(false, 1000); // a late end event of the old line
    await endLineA(5 * MINUTE, call.lines, 1);

    expect(call.lines()).toEqual(['Line A']);
    const next = vi.fn();
    initializeSpeechCoordination({
      session: { say: next } as unknown as voice.AgentSession,
      sessionId: `${call.sessionId}-next`,
      personaId: 'p-1',
    });
    await routeSpeech(`${call.sessionId}-next`, 'A line on the next call');
    expect(next.mock.calls.map((c) => c[0])).toEqual(['A line on the next call']);
    unregisterSessionForReconnection(call.sessionId);
    cleanupSpeechCoordination(`${call.sessionId}-next`);
  });

  it('on: is spoken before a line that was queued earlier', async () => {
    vi.stubEnv('CRISIS_LINE_NEVER_DROP', 'on');
    const call = await callWithALineStillPlaying();
    await routeSpeech(call.sessionId, 'Line B');
    await triggerGracefulExit(call.sessionId);

    await endLineA(1_000, call.lines, 2);

    expect(call.lines()).toEqual(['Line A', STILL_HERE_LINE]);
    unregisterSessionForReconnection(call.sessionId);
    cleanupSpeechCoordination(call.sessionId);
  });

  it('off: waits its turn behind a line queued earlier, as on main', async () => {
    const call = await callWithALineStillPlaying();
    await routeSpeech(call.sessionId, 'Line B');
    await triggerGracefulExit(call.sessionId);

    await endLineA(1_000, call.lines, 2);

    expect(call.lines()).toEqual(['Line A', 'Line B']);
    unregisterSessionForReconnection(call.sessionId);
    cleanupSpeechCoordination(call.sessionId);
  });
});

/** Another call attaches to the coordinator `afterMs` later; the queue is played once it settles. */
async function attachAfter(sessionId: string, afterMs: number) {
  const say = vi.fn();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + afterMs);
  initializeSpeechCoordination({
    session: { say } as unknown as voice.AgentSession,
    sessionId,
    personaId: 'p-1',
  });
  await vi.advanceTimersByTimeAsync(5_000);
  vi.useRealTimers();
  return say;
}

describe('STILL_HERE_LINE belongs to the call it was queued for (the session stamp)', () => {
  it.each([
    ['30 s', 30_000],
    ['3 s', 3_000],
  ])('on: a call that attaches %s later does not hear it', async (_label, afterMs) => {
    vi.stubEnv('CRISIS_LINE_NEVER_DROP', 'on');
    const call = await callWithALineStillPlaying();
    await triggerGracefulExit(call.sessionId);
    expect(call.lines()).toEqual(['Line A']); // queued for call A, behind Line A

    const next = await attachAfter(`${call.sessionId}-b`, afterMs);

    expect(next).not.toHaveBeenCalled();
    expect(getSpeechCoordinator().getState()).toBe(CoordinatorState.IDLE);
    unregisterSessionForReconnection(call.sessionId);
    cleanupSpeechCoordination(`${call.sessionId}-b`);
  });

  it('on: the same call attaching again (a hand-off) still hears it, once', async () => {
    vi.stubEnv('CRISIS_LINE_NEVER_DROP', 'on');
    const call = await callWithALineStillPlaying();
    await triggerGracefulExit(call.sessionId);

    const next = await attachAfter(call.sessionId, 30_000);

    expect(next.mock.calls.map((c) => c[0])).toEqual([STILL_HERE_LINE]);
    unregisterSessionForReconnection(call.sessionId);
    cleanupSpeechCoordination(call.sessionId);
  });
});
