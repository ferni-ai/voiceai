import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachSlowTurnSound,
  SLOW_TURN,
  slowTurnClip,
  slowTurnReason,
  type SlowTurnDeps,
} from '../slow-turn-sound.js';

/**
 * A call's signals with knobs. `turn()` runs a caller turn the way prod does
 * with ink end of turn: the caller starts speaking, ink ends the turn while VAD
 * still says "speaking", LiveKit decides its preemptive reply, commits the
 * turn, and VAD's "listening" comes after the commit.
 */
function setup(over: Partial<SlowTurnDeps> = {}) {
  const session = new EventEmitter();
  const played: string[] = [];
  const held: string[] = [];
  let lastPlayed = 0;
  let replyAt = Number.NEGATIVE_INFINITY;
  let grave = false;
  let quiet = false;
  let allowed = true;
  let pending: Promise<unknown> | null = null;
  const toolListeners = new Set<(names: readonly string[]) => void>();
  const deps: SlowTurnDeps = {
    playClip: (text) => {
      played.push(text);
      lastPlayed = Date.now();
      return true;
    },
    lastPlayedAt: () => lastPlayed,
    replyStartedSince: (since) => replyAt >= since,
    grave: () => grave,
    crisisPending: () => pending,
    stayQuiet: () => quiet,
    soundAllowed: () => allowed,
    mayNeedTool: (text) => /\bcall\b/i.test(text),
    onToolRequested: (l) => {
      toolListeners.add(l);
      return () => toolListeners.delete(l);
    },
    holdReply: (text) => held.push(text),
    noteOpened: () => undefined,
    ...over,
  };
  const detach = attachSlowTurnSound(session, deps);
  const turn = (
    words: string,
    opts: { preemptive?: boolean | null; beforeCommit?: () => void } = {}
  ) => {
    session.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(800);
    if (opts.preemptive !== null)
      session.emit('ferni_preemptive_decision', { used: opts.preemptive ?? false });
    opts.beforeCommit?.();
    session.emit('conversation_item_added', { item: { role: 'user', textContent: words } });
    vi.advanceTimersByTime(150);
    session.emit('user_state_changed', { newState: 'listening' }); // VAD, after the commit
  };
  return {
    session,
    played,
    held,
    detach,
    turn,
    replyNow: () => (replyAt = Date.now()),
    clipNow: () => (lastPlayed = Date.now()),
    tool: (...names: string[]) => toolListeners.forEach((l) => l(names)),
    setGrave: (g: boolean) => (grave = g),
    setQuiet: (q: boolean) => (quiet = q),
    setAllowed: (a: boolean) => (allowed = a),
    setPending: (p: Promise<unknown> | null) => (pending = p),
  };
}

const afterWait = () => vi.advanceTimersByTime(SLOW_TURN.waitMs);

describe('slowTurnReason / slowTurnClip', () => {
  const base = {
    words: 'how was it',
    toolRequested: false,
    preemptiveUsed: null,
    mayNeedTool: false,
  };
  it('names why a turn looks slow, or null', () => {
    expect(slowTurnReason({ ...base, toolRequested: true })).toBe('tool');
    expect(slowTurnReason({ ...base, mayNeedTool: true })).toBe('tool_likely');
    expect(slowTurnReason({ ...base, preemptiveUsed: false })).toBe('preemptive_dropped');
    expect(slowTurnReason({ ...base, words: 'word '.repeat(SLOW_TURN.longTurnWords) })).toBe(
      'long_turn'
    );
  });
  it('no preemptive decision is not a reason: a short plain turn is not slow', () => {
    expect(slowTurnReason(base)).toBeNull();
    expect(slowTurnReason({ ...base, preemptiveUsed: true })).toBeNull();
  });
  it('"Hmm" for a question, "Mm" otherwise', () => {
    expect(slowTurnClip('what do you think?')).toBe('Hmm');
    expect(slowTurnClip('it was a long day')).toBe('Mm');
  });
});

describe('attachSlowTurnSound', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a slow turn with no reply words by the wait gets one "Mm", and the reply waits for it', () => {
    const h = setup();
    h.turn('can you call my sister for me');
    vi.advanceTimersByTime(SLOW_TURN.waitMs - 151);
    expect(h.played).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(h.played).toEqual(['Mm']);
    expect(h.held).toEqual(['Mm']);
    vi.advanceTimersByTime(10_000);
    expect(h.played).toHaveLength(1);
  });

  it('the preemptive decision made while VAD still says speaking counts for the turn', () => {
    const used = setup();
    used.turn('it was fine thanks', { preemptive: true });
    afterWait();
    expect(used.played).toEqual([]);
    const dropped = setup();
    dropped.turn('it was fine thanks', { preemptive: false });
    afterWait();
    expect(dropped.played).toEqual(['Mm']);
  });

  it('a turn with no preemptive decision at all is not slow by itself', () => {
    const h = setup();
    h.turn('it was fine thanks', { preemptive: null });
    afterWait();
    expect(h.played).toEqual([]);
  });

  it("an earlier turn's dropped decision does not carry over", () => {
    const h = setup();
    h.turn('it was fine thanks', { preemptive: false });
    h.replyNow(); // answered in time
    afterWait();
    h.turn('sounds good to me', { preemptive: null });
    afterWait();
    expect(h.played).toEqual([]);
  });

  it('no sound when reply words reached TTS, even before the commit (preemptive TTS)', () => {
    const h = setup();
    h.turn('can you call my sister for me', {
      beforeCommit: () => {
        h.replyNow(); // preemptive TTS: the words reach TTS before ink commits the turn
        vi.advanceTimersByTime(100);
      },
    });
    afterWait();
    expect(h.played).toEqual([]);
  });

  it('a tool asked for makes a quiet chat turn slow', () => {
    const h = setup();
    h.turn('tell me about it', { preemptive: true });
    h.tool('getWeather');
    afterWait();
    expect(h.played).toEqual(['Mm']);
  });

  it('never ahead of a hang-up: endCall asked for, music, closing, a goodbye', () => {
    const end = setup();
    end.turn('can you call my sister for me');
    end.tool('endCall');
    afterWait();
    expect(end.played).toEqual([]);
    const quiet = setup();
    quiet.setQuiet(true);
    quiet.turn('can you call my sister for me');
    afterWait();
    expect(quiet.played).toEqual([]);
  });

  it('not when another clip already filled the gap', () => {
    const h = setup();
    h.turn('can you call my sister for me');
    vi.advanceTimersByTime(200);
    h.clipNow();
    afterWait();
    expect(h.played).toEqual([]);
  });

  it('not when the shared one-sound-per-turn ledger says no (opening sound this turn or last)', () => {
    const h = setup();
    h.setAllowed(false);
    h.turn('can you call my sister for me');
    afterWait();
    expect(h.played).toEqual([]);
  });

  it('never on a grave call (crisis risk, hard news, the gate acted)', () => {
    const h = setup();
    h.setGrave(true);
    h.turn('can you call my sister for me');
    vi.advanceTimersByTime(SLOW_TURN.waitMs * 3);
    expect(h.played).toEqual([]);
  });

  it('a crisis verdict still pending at the wait: no sound, not even after it clears', async () => {
    const h = setup();
    let clear!: () => void;
    h.setPending(
      new Promise<void>((r) => {
        clear = r;
      })
    );
    h.turn('can you call my sister for me');
    afterWait();
    h.setPending(null);
    clear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.played).toEqual([]);
  });

  it('a crisis verdict still pending long after the wait: no sound', async () => {
    const h = setup();
    h.setPending(
      new Promise<void>(() => {
        // never settles
      })
    );
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs + 5000);
    expect(h.played).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the caller talking again cancels it; detach stops it and leaves no timers', () => {
    const h = setup();
    h.turn('can you call my sister for me');
    vi.advanceTimersByTime(300);
    h.session.emit('user_state_changed', { newState: 'speaking' });
    afterWait();
    expect(h.played).toEqual([]);
    h.turn('can you call my sister for me');
    h.detach();
    afterWait();
    expect(h.played).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
