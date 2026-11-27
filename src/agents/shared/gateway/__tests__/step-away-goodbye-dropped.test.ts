/**
 * The step-away exit queues a goodbye, waits, and checks again for a caller at risk before it
 * hangs up (reconnection.ts triggerGracefulExit). When a crisis read lands in that wait the exit
 * is held and Ferni says STILL_HERE_LINE instead. The goodbye ("I need to step away, talk soon")
 * is false by then. With CRISIS_LINE_NEVER_DROP on, a goodbye still queued is dropped, so the
 * caller hears only STILL_HERE_LINE; one already being spoken finishes and STILL_HERE_LINE follows.
 * Off, the goodbye is still said and STILL_HERE_LINE follows it, as on main.
 *
 * Real exit, real coordinator, real routing; only the LiveKit session and the app signal are stubs.
 */
import type { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../speech/direction/index.js', () => ({ sayInOwnWords: vi.fn() }));
vi.mock('../../../../config/timeouts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../config/timeouts.js')>()),
  GRACEFUL_EXIT_TTS_WAIT_MS: 50,
}));
const sendFrontendSignal = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/frontend-signal.js', () => ({ sendFrontendSignal }));

import {
  cleanupSpeechCoordination,
  initializeSpeechCoordination,
  routeSpeech,
} from '../../../../speech/coordination/session-integration.js';
import {
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

/** A call with no risk yet; `first` is a line being spoken that has not ended. */
async function call(first?: string) {
  const sessionId = `goodbye-${++n}`;
  const say = vi.fn();
  initializeSpeechCoordination({
    session: { say } as unknown as voice.AgentSession,
    sessionId,
    personaId: 'p-1',
  });
  if (first) await routeSpeech(sessionId, first);
  return { sessionId, lines: () => say.mock.calls.map((c) => c[0] as string) };
}

/** The exit queues its goodbye, a crisis read lands in the wait, and the exit finishes. */
async function exitWithRiskInTheWait(sessionId: string): Promise<void> {
  const exit = triggerGracefulExit(sessionId);
  await vi.advanceTimersByTimeAsync(10); // the goodbye is queued or speaking; the wait is running
  noteCrisisRisk(sessionId);
  await vi.advanceTimersByTimeAsync(100);
  await exit;
}

/**
 * The line being spoken ends; the coordinator plays what is queued once its cooldown passes.
 * Short steps: a RESPONSE line expires after 10 s in the queue, which must not hide a goodbye.
 */
async function endLine(): Promise<void> {
  getSpeechCoordinator().onSpeechEnded(false, 1000);
  await vi.advanceTimersByTimeAsync(2_000);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetSpeechCoordinator();
  sendFrontendSignal.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetCrisisCallRisk();
  resetSpeechCoordinator();
});

const finish = (sessionId: string) => {
  unregisterSessionForReconnection(sessionId);
  cleanupSpeechCoordination(sessionId);
};

describe('the step-away goodbye when the exit is held in its wait', () => {
  it('on: a goodbye still queued is dropped; the still-here line is said once, and the call is not ended', async () => {
    vi.stubEnv('CRISIS_LINE_NEVER_DROP', 'on');
    const c = await call('Line A');
    await routeSpeech(c.sessionId, 'Line B'); // another line of the call: not the goodbye
    await exitWithRiskInTheWait(c.sessionId);

    await endLine(); // Line A ends: the still-here line goes first (CRISIS), then Line B
    await endLine();
    await endLine();

    expect(c.lines()).toEqual(['Line A', STILL_HERE_LINE, 'Line B']);
    expect(sendFrontendSignal).not.toHaveBeenCalled();
    finish(c.sessionId);
  });

  it('on: a goodbye already being spoken finishes, and the still-here line follows it once', async () => {
    vi.stubEnv('CRISIS_LINE_NEVER_DROP', 'on');
    const c = await call();
    await exitWithRiskInTheWait(c.sessionId);
    expect(c.lines()).toHaveLength(1); // the goodbye, being spoken

    await endLine();

    expect(c.lines()).toHaveLength(2);
    expect(c.lines()[0]).not.toBe(STILL_HERE_LINE);
    expect(c.lines()[1]).toBe(STILL_HERE_LINE);
    await endLine();
    expect(c.lines()).toHaveLength(2); // once
    expect(sendFrontendSignal).not.toHaveBeenCalled();
    finish(c.sessionId);
  });

  it('off: a goodbye still queued is said, then the still-here line, as on main', async () => {
    const c = await call('Line A');
    await exitWithRiskInTheWait(c.sessionId);

    await endLine();
    await endLine();

    expect(c.lines()).toHaveLength(3);
    expect(c.lines()[0]).toBe('Line A');
    expect(c.lines()[1]).not.toBe(STILL_HERE_LINE); // the goodbye
    expect(c.lines()[2]).toBe(STILL_HERE_LINE);
    expect(sendFrontendSignal).not.toHaveBeenCalled();
    finish(c.sessionId);
  });

  it('on: with no crisis read in the wait, the goodbye is said and the call ends, as on main', async () => {
    vi.stubEnv('CRISIS_LINE_NEVER_DROP', 'on');
    const c = await call('Line A');
    const exit = triggerGracefulExit(c.sessionId);
    await vi.advanceTimersByTimeAsync(100);
    await exit;
    await endLine();

    expect(c.lines()).toHaveLength(2);
    expect(c.lines()).not.toContain(STILL_HERE_LINE);
    expect(sendFrontendSignal).toHaveBeenCalledTimes(1);
    finish(c.sessionId);
  });
});
