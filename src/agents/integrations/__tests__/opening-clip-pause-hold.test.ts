/**
 * The early opening clip and the pause hold on one call: a reply the hold is keeping in the
 * caller's pause gets no "Mm" (turn-opening-sound.ts, replyHeld). Real attachPauseHold and real
 * attachTurnOpeningSound on one session, attached in both orders, as live-call-behaviors.ts wires
 * them: the clip reads pauseHoldHolding for the session.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPauseHold, pauseHoldHolding } from '../../../speech/output-control/pause-hold.js';
import { attachTurnOpeningSound } from '../turn-opening-sound.js';

const HESITANT = 'Oh, and Biscuit chewed up my phone charger this morning.';
const CLEAR = 'Work was just a lot. My manager moved a big deadline up to Friday.';

interface Call {
  session: EventEmitter;
  played: string[];
  holds: number[];
  /** One caller turn: their words, ink's end `leadMs` after, then the commit. */
  turn: (words: string, leadMs: number) => void;
}

function call(sessionId: string, holdFirst: boolean): { call: Call; detach: () => void } {
  const session = new EventEmitter();
  const played: string[] = [];
  const holds: number[] = [];
  let words = '';
  const attachHold = () => attachPauseHold(session, sessionId, { PAUSE_HOLD: 'on' });
  const attachSound = () =>
    attachTurnOpeningSound(
      session,
      { playClip: (t) => (played.push(t), true), lastPlayedAt: () => 0 },
      () => words,
      () => false,
      {
        waitMs: 120,
        replyTextSince: () => false,
        clipMs: () => 450,
        holdReply: (ms) => holds.push(ms),
        replyHeld: () => pauseHoldHolding(sessionId),
        sessionId,
      }
    );
  const detachers = holdFirst ? [attachHold(), attachSound()] : [attachSound(), attachHold()];
  return {
    call: {
      session,
      played,
      holds,
      turn: (text, leadMs) => {
        words = text;
        const stoppedAt = Date.now();
        session.emit('user_state_changed', { newState: 'speaking' });
        session.emit('user_input_transcribed', { transcript: text, isFinal: false });
        session.emit('user_state_changed', { newState: 'listening', createdAt: stoppedAt + 350 });
        vi.advanceTimersByTime(leadMs);
        session.emit('metrics_collected', {
          metrics: { type: 'eou_metrics', lastSpeakingTimeMs: stoppedAt },
        });
        session.emit('agent_state_changed', { newState: 'thinking' });
      },
    },
    detach: () => detachers.forEach((d) => d?.()),
  };
}

describe('the early opening clip and the pause hold', () => {
  let detach: (() => void) | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
  });
  afterEach(() => {
    detach?.();
    detach = null;
    vi.useRealTimers();
  });

  for (const holdFirst of [true, false]) {
    const order = holdFirst ? 'hold attached first' : 'clip attached first';

    it(`plays no clip into a held reply's pause (${order})`, () => {
      const c = call(`held-${order}`, holdFirst);
      detach = c.detach;
      c.call.turn(HESITANT, 650);
      expect(pauseHoldHolding(`held-${order}`)).toBe(true); // precondition: the hold is armed
      vi.advanceTimersByTime(200);
      expect(c.call.played).toEqual([]);
      expect(c.call.holds).toEqual([]);
    });

    it(`still opens a turn the hold lets through at once (${order})`, () => {
      const c = call(`clear-${order}`, holdFirst);
      detach = c.detach;
      c.call.turn(CLEAR, 150);
      expect(pauseHoldHolding(`clear-${order}`)).toBe(false);
      vi.advanceTimersByTime(200);
      expect(c.call.played).toHaveLength(1);
      expect(c.call.holds).toEqual([450]);
    });
  }

  it('plays no clip on a held crisis turn, where a grave turn would otherwise get "Mm"', () => {
    // Fictional line. Fewer sounds is the safe side of a crisis turn; this proves the hold wins.
    const line = 'I keep thinking everyone would be better off without me around.';
    const clear = call('crisis-clear-1', true);
    clear.call.turn(line, 150);
    vi.advanceTimersByTime(200);
    expect(clear.call.played).toEqual(['Mm']); // precondition: unheld, the grave turn gets "Mm"
    clear.detach();
    const held = call('crisis-held-1', true);
    detach = held.detach;
    held.call.turn(line, 650);
    expect(pauseHoldHolding('crisis-held-1')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(held.call.played).toEqual([]);
    expect(held.call.holds).toEqual([]);
  });

  it('opens the next clear turn once Ferni has answered the held one', () => {
    const c = call('next-1', true);
    detach = c.detach;
    c.call.turn(HESITANT, 650);
    vi.advanceTimersByTime(200);
    expect(c.call.played).toEqual([]);
    c.call.session.emit('agent_state_changed', { newState: 'speaking' });
    expect(pauseHoldHolding('next-1')).toBe(false);
    c.call.session.emit('agent_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(3000);
    c.call.turn(CLEAR, 150);
    vi.advanceTimersByTime(200);
    expect(c.call.played).toHaveLength(1);
  });

  it('reads as not holding with the hold off, and once the call has detached it', () => {
    expect(attachPauseHold(new EventEmitter(), 'off-1', {})).toBeNull();
    expect(pauseHoldHolding('off-1')).toBe(false);
    const c = call('gone-1', true);
    c.call.turn(HESITANT, 650);
    expect(pauseHoldHolding('gone-1')).toBe(true);
    c.detach();
    expect(pauseHoldHolding('gone-1')).toBe(false);
  });
});
