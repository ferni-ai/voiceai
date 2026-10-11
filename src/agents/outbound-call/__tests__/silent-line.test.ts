import { afterEach, describe, expect, it, vi } from 'vitest';

const deleteRoom = vi.hoisted(() => vi.fn(async (_room: string) => undefined));
vi.mock('../call-control.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../call-control.js')>()),
  deleteRoom,
}));
import { forgetOnBehalfCallRoom, registerOnBehalfCallRoom } from '../call-control.js';
import {
  MAX_RECHECKS,
  QUIET_BEFORE_HANG_UP_MS,
  SILENT_LINE_HANGUP_SEC,
  armSilentLine,
  forgetSilentLine,
  noteFarEndSpoke,
  type SilentLineDeps,
} from '../silent-line.js';
import { silenceResponseBlocked } from '../../voice-agent/silence-response-blockers.js';
import { wrapServicesForOnBehalfCapture } from '../../integrations/on-behalf-transcript-capture.js';

/** A placed call on a fake clock. `speaking` is whether Ferni is talking right now. */
function line(room: string | null = 'onbehalf-call-1', env: Record<string, string> = {}) {
  let now = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let nextId = 1;
  const state = { speaking: false };
  const hangUp = vi.fn(async (_room: string) => undefined);
  const deps: SilentLineDeps = {
    callRoom: () => room ?? undefined,
    hangUp,
    agentSpeaking: () => state.speaking,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => void timers.delete(id as number),
    env,
  };
  /** Advance the clock, firing due timers in order. */
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };
  return { deps, hangUp, state, advance, pending: () => timers.size };
}

afterEach(() => {
  for (const id of ['s-call', 's-mindy']) {
    forgetSilentLine(id);
    forgetOnBehalfCallRoom(id);
  }
  deleteRoom.mockClear();
});

describe('armSilentLine', () => {
  it('hangs up once the other end has been silent past the limit and Ferni has finished', () => {
    const { deps, hangUp, advance } = line();
    // "away" fires 20 s after the call began; nobody has spoken on the far end.
    expect(armSilentLine('s-call', 20, deps)).toBe(false); // the one remark still plays
    advance((SILENT_LINE_HANGUP_SEC - 20) * 1000 - 1);
    expect(hangUp).not.toHaveBeenCalled();
    advance(1 + QUIET_BEFORE_HANG_UP_MS);
    expect(hangUp).toHaveBeenCalledWith('onbehalf-call-1');
    expect(hangUp).toHaveBeenCalledTimes(1);
    // Later silences on the call make no more remarks and hang up nothing more.
    expect(armSilentLine('s-call', 80, deps)).toBe(true);
    advance(60_000);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it('never cuts Ferni off: waits until it has been quiet for a beat', () => {
    const { deps, hangUp, state, advance } = line();
    armSilentLine('s-call', 30, deps);
    state.speaking = true; // mid-goodbye when the limit comes due
    advance(5_000 + 10_000);
    expect(hangUp).not.toHaveBeenCalled();
    state.speaking = false;
    advance(QUIET_BEFORE_HANG_UP_MS - 2_000);
    expect(hangUp).not.toHaveBeenCalled();
    advance(4_000);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it('does not let an endless monologue hold the line open', () => {
    const { deps, hangUp, state, advance } = line();
    state.speaking = true;
    armSilentLine('s-call', 35, deps);
    advance((MAX_RECHECKS + 1) * 2_000);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it('stands down when the other end speaks', () => {
    const { deps, hangUp, advance, pending } = line();
    armSilentLine('s-call', 20, deps);
    advance(10_000);
    noteFarEndSpoke('s-call');
    expect(pending()).toBe(0);
    advance(120_000);
    expect(hangUp).not.toHaveBeenCalled();
  });

  it('leaves sessions that are not placed calls alone, and does nothing when switched off', () => {
    const notACall = line(null);
    expect(armSilentLine('s-call', 300, notACall.deps)).toBe(false);
    notACall.advance(120_000);
    expect(notACall.hangUp).not.toHaveBeenCalled();

    const off = line('onbehalf-call-1', { SILENT_LINE_HANGUP: 'off' });
    expect(armSilentLine('s-call', 300, off.deps)).toBe(false);
    off.advance(120_000);
    expect(off.hangUp).not.toHaveBeenCalled();
  });

  it('stops if the call ended on its own first', () => {
    let room: string | undefined = 'onbehalf-call-1';
    const { deps, hangUp, advance } = line();
    deps.callRoom = () => room;
    armSilentLine('s-call', 20, deps);
    room = undefined; // endCall or the far end hung up
    advance(60_000);
    expect(hangUp).not.toHaveBeenCalled();
  });
});

describe('the live path (the 2026-10-11 dev call)', () => {
  const room = { remoteParticipants: new Map<string, unknown>([['phone_mindy', {}]]) };

  it('the away silence check arms the hang-up for a placed call', () => {
    vi.useFakeTimers();
    try {
      registerOnBehalfCallRoom('s-mindy', 'call-mindy', 'onbehalf-call-mindy');
      silenceResponseBlocked('s-mindy', room, 20, {});
      vi.advanceTimersByTime(
        (SILENT_LINE_HANGUP_SEC - 20) * 1000 + QUIET_BEFORE_HANG_UP_MS + 2_000
      );
      expect(deleteRoom).toHaveBeenCalledWith('onbehalf-call-mindy');
    } finally {
      vi.useRealTimers();
    }
  });

  it('never arms for a call nobody placed, or while a caller asked to wait', () => {
    vi.useFakeTimers();
    try {
      silenceResponseBlocked('s-mindy', room, 30, {});
      registerOnBehalfCallRoom('s-call', 'call-1', 'onbehalf-call-1');
      silenceResponseBlocked('s-call', room, 30, { lastUserMessage: 'Hold on, the door.' });
      vi.advanceTimersByTime(120_000);
      expect(deleteRoom).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('words from the other end, through the call transcript, disarm it', () => {
    vi.useFakeTimers();
    try {
      registerOnBehalfCallRoom('s-mindy', 'call-mindy', 'onbehalf-call-mindy');
      const services = wrapServicesForOnBehalfCapture('s-mindy', {
        addTurn: (_r: 'user' | 'assistant', _t: string) => undefined,
      });
      silenceResponseBlocked('s-mindy', room, 20, {});
      vi.advanceTimersByTime(10_000);
      services.addTurn('user', 'Hello? Sorry, I was in the car.');
      vi.advanceTimersByTime(120_000);
      expect(deleteRoom).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
