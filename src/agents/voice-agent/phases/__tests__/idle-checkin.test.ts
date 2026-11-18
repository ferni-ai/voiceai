/**
 * IDLE_END_CHECKIN: one spoken check-in a minute before a quiet call's idle end
 * (idle-checkin.ts, session-end-watch.ts). Fake clock; speech stubbed at safeGenerateReply;
 * no network. Riley Test's call; no caller words anywhere.
 */
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { safeGenerateReply, quietLog } = vi.hoisted(() => {
  const quietLog: Record<string, unknown> = {};
  for (const level of ['debug', 'info', 'warn', 'error', 'trace', 'fatal'])
    quietLog[level] = vi.fn();
  quietLog.child = () => quietLog;
  return {
    safeGenerateReply: vi.fn(async () => ({ success: true, usedFallback: false })),
    quietLog: quietLog as { info: ReturnType<typeof vi.fn> },
  };
});
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/safe-logger.js')>()),
  createLogger: () => quietLog,
}));
vi.mock('../../../shared/safe-generate-reply.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shared/safe-generate-reply.js')>()),
  safeGenerateReply,
}));

import {
  noteCrisisRisk,
  resetCrisisCallRisk,
} from '../../../../services/safety/crisis-call-risk.js';
import { IDLE_CHECKIN_WINDOW_MS, IDLE_NOTE, idleCheckInFor } from '../idle-checkin.js';
import {
  IDLE_MS,
  waitForSessionEnd,
  type IdleCheckIn,
  type IdleCheckInOutcome,
  type WatchedRoom,
} from '../session-end-watch.js';

class FakeRoom extends EventEmitter implements WatchedRoom {
  isConnected = true;
  remoteParticipants = { size: 1 };
  localParticipant = { identity: 'agent-ferni' };
}

const SECOND = 1_000;
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
  const SESSION_ID = 'idle-checkin-riley-test';
  const ON = { IDLE_END_CHECKIN: 'on' };
  const agentSession = { agentState: 'listening', userState: 'listening', history: { items: [] } };
  const call = {
    sessionId: SESSION_ID,
    userData: { callerTimezone: 'UTC' },
    room: { remoteParticipants: new Map<string, unknown>([['riley-test', {}]]) },
    activeSession: () => agentSession,
  };

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
    vi.setSystemTime(new Date('2026-11-18T15:00:00Z')); // mid-afternoon for a UTC caller
    safeGenerateReply.mockClear();
    quietLog.info.mockClear();
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
    expect(safeGenerateReply).not.toHaveBeenCalled();
  });

  it('flag on: says IDLE_NOTE through the quiet-presence speech path, then logs IDLE_CHECKIN with no words', async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room, { idleCheckIn: idleCheckInFor(call, ON) });

    await vi.advanceTimersByTimeAsync(CHECK_IN_AT - SECOND);
    expect(safeGenerateReply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(safeGenerateReply).toHaveBeenCalledTimes(1);
    expect(safeGenerateReply).toHaveBeenCalledWith(
      agentSession,
      expect.objectContaining({
        instructions: IDLE_NOTE,
        context: 'idle-checkin',
        sessionId: SESSION_ID,
      })
    );

    await vi.advanceTimersByTimeAsync(IDLE_CHECKIN_WINDOW_MS);
    expect(await ended).toBe('idle');
    const logged = quietLog.info.mock.calls.filter((c) => c[1] === 'IDLE_CHECKIN');
    expect(logged).toEqual([[{ sessionId: SESSION_ID, outcome: 'ended' }, 'IDLE_CHECKIN']]);
  });

  it('crisis call: no check-in, and it ends on the same tick as main', async () => {
    noteCrisisRisk(SESSION_ID);
    const { rooms, ends } = sideBySide(ON);

    await vi.advanceTimersByTimeAsync(2 * 60 * SECOND);
    for (const room of rooms) room.emit('activeSpeakersChanged', CALLER);
    await vi.advanceTimersByTimeAsync(IDLE_MS - SECOND);
    expect(await Promise.all(ends.map(state))).toEqual(['still-open', 'still-open']);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(await Promise.all(ends)).toEqual(['idle', 'idle']);
    expect(safeGenerateReply).not.toHaveBeenCalled();
    const logged = quietLog.info.mock.calls.filter((c) => c[1] === 'IDLE_CHECKIN');
    expect(logged).toEqual([
      [{ sessionId: SESSION_ID, outcome: 'skipped_crisis' }, 'IDLE_CHECKIN'],
    ]);
  });
});
