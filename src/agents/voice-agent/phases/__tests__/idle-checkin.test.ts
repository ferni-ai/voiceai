/**
 * IDLE_END_CHECKIN: one spoken check-in a minute before a quiet call's idle end
 * (idle-checkin.ts, session-end-watch.ts). Fake clock; speech stubbed at cueSay; no network. Riley Test's call; no caller words anywhere.
 */
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cueSay, quietLog, logged } = vi.hoisted(() => {
  const logged = Object.fromEntries(
    ['debug', 'info', 'warn', 'error', 'trace', 'fatal'].map((level) => [level, vi.fn()])
  );
  const quietLog: Record<string, unknown> = { ...logged, child: () => quietLog };
  return { cueSay: vi.fn(), quietLog, logged };
});
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/safe-logger.js')>()),
  createLogger: () => quietLog,
}));
vi.mock('../../../../speech/direction/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../speech/direction/index.js')>()),
  cueSay,
}));

import { signalCrisisDecision } from '../../../safety/crisis-gate-signal.js';
import {
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../../services/safety/crisis-call-risk.js';
import { IDLE_CHECKIN_CUE } from '../../idle-checkin-cue.js';
import { idleCheckInFor } from '../idle-checkin.js';
import {
  IDLE_MS,
  waitForSessionEnd,
  type IdleCheckIn,
  type WatchedRoom,
} from '../session-end-watch.js';

class FakeRoom extends EventEmitter implements WatchedRoom {
  isConnected = true;
  remoteParticipants = { size: 1 };
  localParticipant = { identity: 'agent-ferni' };
}

type IdleCheckInOutcome = Parameters<IdleCheckIn['onOutcome']>[0];

const SECOND = 1_000;
const SESSION_ID = 'idle-checkin-riley-test';
const ON = { IDLE_END_CHECKIN: 'on' };
const agentSession = { agentState: 'listening', userState: 'listening', history: { items: [] } };
const call = {
  sessionId: SESSION_ID,
  userData: {},
  room: { remoteParticipants: new Map<string, unknown>([['riley-test', {}]]) },
  activeSession: () => agentSession,
};
/** The production window: how long before the idle end it checks in, and how long they have. */
const IDLE_CHECKIN_WINDOW_MS = idleCheckInFor(call, ON)?.windowMs ?? Number.NaN;
const CHECK_IN_AT = IDLE_MS - IDLE_CHECKIN_WINDOW_MS;
const AGENT = [{ identity: 'agent-ferni' }];
const CALLER = [{ identity: 'riley-test' }];

/** Settles to the end reason, or 'still-open' if the call hasn't ended yet. */
async function state(p: Promise<string>): Promise<string> {
  return Promise.race([p, Promise.resolve('still-open')]);
}

/** A check-in whose speech is a stub that sounds like the agent in the room. */
function stubCheckIn(room: FakeRoom, opts: { crisis?: () => boolean; says?: boolean } = {}) {
  const outcomes: IdleCheckInOutcome[] = [];
  const speak = vi.fn(() => {
    if (opts.says !== false) room.emit('activeSpeakersChanged', AGENT);
    return opts.says !== false;
  });
  const checkIn: IdleCheckIn = {
    windowMs: IDLE_CHECKIN_WINDOW_MS,
    crisis: opts.crisis ?? (() => false),
    speak,
    onOutcome: (o) => outcomes.push(o),
  };
  return { checkIn, speak, outcomes };
}

describe('idle check-in timing (session-end-watch)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('checks in a minute before the idle end, and the caller answering keeps the call', async () => {
    const room = new FakeRoom();
    const { checkIn, speak, outcomes } = stubCheckIn(room);
    const ended = waitForSessionEnd(room, { idleCheckIn: checkIn });

    await vi.advanceTimersByTimeAsync(CHECK_IN_AT - SECOND);
    expect(speak).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(await state(ended)).toBe('still-open');

    await vi.advanceTimersByTimeAsync(30 * SECOND);
    room.emit('activeSpeakersChanged', CALLER); // the caller answers at IDLE_MS - 30 s
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(outcomes).toEqual(['resumed']);

    // Past where the check-in's window would have ended the call: still open.
    await vi.advanceTimersByTimeAsync(IDLE_CHECKIN_WINDOW_MS + 30 * SECOND);
    expect(await state(ended)).toBe('still-open');

    // From the answer on, the idle clock is main's, and there is no second check-in.
    await vi.advanceTimersByTimeAsync(IDLE_MS - 92 * SECOND); // 1 s short of answer + IDLE_MS
    expect(await state(ended)).toBe('still-open');
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    expect(await ended).toBe('idle');
    expect(speak).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['resumed']);
  });

  it("nobody answers: it ends 'idle' when the second window passes; the agent's own voice is not an answer", async () => {
    const room = new FakeRoom();
    const { checkIn, speak, outcomes } = stubCheckIn(room);
    const ended = waitForSessionEnd(room, { idleCheckIn: checkIn });

    await vi.advanceTimersByTimeAsync(CHECK_IN_AT);
    expect(speak).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * SECOND);
    room.emit('activeSpeakersChanged', AGENT); // still the check-in playing out

    await vi.advanceTimersByTimeAsync(IDLE_CHECKIN_WINDOW_MS - 6 * SECOND);
    expect(await state(ended)).toBe('still-open');
    expect(outcomes).toEqual([]);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(await ended).toBe('idle');
    expect(outcomes).toEqual(['ended']);
  });

  it('a check-in that could not be said leaves the idle end where main has it', async () => {
    const room = new FakeRoom();
    const { checkIn, speak, outcomes } = stubCheckIn(room, { says: false });
    const ended = waitForSessionEnd(room, { idleCheckIn: checkIn });

    await vi.advanceTimersByTimeAsync(IDLE_MS - SECOND);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(await state(ended)).toBe('still-open');
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(await ended).toBe('idle');
    expect(outcomes).toEqual(['skipped_blocked']);
  });

  it('a crisis read that throws counts as crisis: no check-in', async () => {
    const room = new FakeRoom();
    const crisis = (): boolean => {
      throw new Error('reader down');
    };
    const { checkIn, speak, outcomes } = stubCheckIn(room, { crisis });
    const ended = waitForSessionEnd(room, { idleCheckIn: checkIn });

    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(await ended).toBe('idle');
    expect(speak).not.toHaveBeenCalled();
    expect(outcomes).toEqual(['skipped_crisis']);
  });
});

describe('idleCheckInFor: the flag, the crisis skip, the speech path and the log', () => {
  /** Runs main (no options) and the flagged watch side by side on the same events. */
  function sideBySide(env: Record<string, string>) {
    const main = new FakeRoom();
    const flagged = new FakeRoom();
    const idleCheckIn = idleCheckInFor(call, env);
    return {
      idleCheckIn,
      rooms: [main, flagged],
      ends: [waitForSessionEnd(main), waitForSessionEnd(flagged, { idleCheckIn })],
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    cueSay.mockClear();
    for (const level of Object.values(logged)) level.mockClear();
    resetCrisisCallRisk();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetCrisisCallRisk();
  });

  it('flag off: no check-in, and the call ends on the same tick as main', async () => {
    const { idleCheckIn, rooms, ends } = sideBySide({});
    expect(idleCheckIn).toBeUndefined();

    await vi.advanceTimersByTimeAsync(CHECK_IN_AT + SECOND);
    for (const room of rooms) room.emit('activeSpeakersChanged', AGENT); // agent voice: main restarts
    await vi.advanceTimersByTimeAsync(IDLE_MS - SECOND);
    expect(await Promise.all(ends.map(state))).toEqual(['still-open', 'still-open']);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(await Promise.all(ends)).toEqual(['idle', 'idle']);
    expect(cueSay).not.toHaveBeenCalled();
  });

  it("flag on: says the idle warning's own check-in cue, then logs IDLE_CHECKIN with no words", async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room, { idleCheckIn: idleCheckInFor(call, ON) });

    await vi.advanceTimersByTimeAsync(CHECK_IN_AT - SECOND);
    expect(cueSay).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(cueSay).toHaveBeenCalledTimes(1);
    expect(cueSay).toHaveBeenCalledWith(SESSION_ID, IDLE_CHECKIN_CUE, {
      allowInterruptions: true,
    });
    expect(IDLE_CHECKIN_CUE.moment).toBe('idle_checkin');

    await vi.advanceTimersByTimeAsync(IDLE_CHECKIN_WINDOW_MS);
    expect(await ended).toBe('idle');
    expect(logged.info.mock.calls.filter((c) => c[1] === 'IDLE_CHECKIN')).toEqual([
      [{ sessionId: SESSION_ID, outcome: 'ended' }, 'IDLE_CHECKIN'],
    ]);
  });

  /** A call like `call`, on its own session and id, with these flags; main runs beside it. */
  function crisisSideBySide(sessionId: string, session: object) {
    const callHere = { ...call, sessionId, activeSession: () => session };
    const main = new FakeRoom();
    const flagged = new FakeRoom();
    return {
      rooms: [main, flagged],
      ends: [
        waitForSessionEnd(main),
        waitForSessionEnd(flagged, { idleCheckIn: idleCheckInFor(callHere, ON) }),
      ],
    };
  }

  it('on a crisis-guided call and a call whose crisis read still holds the reply, it says nothing and ends on the same tick as main', async () => {
    const guided = { ...agentSession };
    signalCrisisDecision(guided, 'guide');
    const held = { ...agentSession };
    trackCrisisRead(
      `${SESSION_ID}-held`,
      'an invented line still being read',
      new Promise<{ risk: string } | null>(() => {}) // never settles: the reply stays held
    );
    const calls = [
      crisisSideBySide(`${SESSION_ID}-guided`, guided),
      crisisSideBySide(`${SESSION_ID}-held`, held),
    ];

    await vi.advanceTimersByTimeAsync(2 * 60 * SECOND);
    for (const room of calls.flatMap((c) => c.rooms)) room.emit('activeSpeakersChanged', CALLER);
    await vi.advanceTimersByTimeAsync(IDLE_MS - SECOND);
    for (const { ends } of calls)
      expect(await Promise.all(ends.map(state))).toEqual(['still-open', 'still-open']);
    await vi.advanceTimersByTimeAsync(SECOND);
    for (const { ends } of calls) expect(await Promise.all(ends)).toEqual(['idle', 'idle']);
    expect(cueSay).not.toHaveBeenCalled();
    expect(logged.info.mock.calls.filter((c) => c[1] === 'IDLE_CHECKIN')).toEqual([
      [{ sessionId: `${SESSION_ID}-guided`, outcome: 'skipped_crisis' }, 'IDLE_CHECKIN'],
      [{ sessionId: `${SESSION_ID}-held`, outcome: 'skipped_crisis' }, 'IDLE_CHECKIN'],
    ]);
  });

  it("what it keeps holds none of the caller's words: one IDLE_CHECKIN line, the call id and the outcome", async () => {
    const words = 'an invented last line from riley';
    const callWithWords = { ...call, userData: { lastUserMessage: words } };
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room, { idleCheckIn: idleCheckInFor(callWithWords, ON) });
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(await ended).toBe('idle');
    expect(cueSay).toHaveBeenCalledWith(SESSION_ID, IDLE_CHECKIN_CUE, { allowInterruptions: true });

    const lines = Object.values(logged).flatMap((level) => level.mock.calls);
    expect(JSON.stringify(lines)).not.toContain(words);
    expect(lines.filter((c) => c[1] === 'IDLE_CHECKIN')).toEqual([
      [{ sessionId: SESSION_ID, outcome: 'ended' }, 'IDLE_CHECKIN'],
    ]);
  });
});
