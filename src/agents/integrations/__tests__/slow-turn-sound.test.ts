import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachSlowTurnSound,
  SLOW_TURN,
  slowTurnClip,
  slowTurnReason,
  type SlowTurnDeps,
} from '../slow-turn-sound.js';

function setup(over: Partial<SlowTurnDeps> = {}) {
  const session = new EventEmitter();
  const played: string[] = [];
  const held: string[] = [];
  let lastPlayed = 0;
  let replyAt = Infinity;
  let grave = false;
  let pending: Promise<unknown> | null = null;
  const toolListeners = new Set<() => void>();
  const deps: SlowTurnDeps = {
    playClip: (text) => {
      played.push(text);
      lastPlayed = Date.now();
      return true;
    },
    lastPlayedAt: () => lastPlayed,
    replyStartedSince: (since) => replyAt >= since && replyAt !== Infinity,
    grave: () => grave,
    crisisPending: () => pending,
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
  /** The caller speaks, stops, LiveKit decides its preemptive reply and commits the turn. */
  const turn = (words: string, preemptiveUsed: boolean | null = false) => {
    session.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(800);
    session.emit('user_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(150);
    if (preemptiveUsed !== null)
      session.emit('ferni_preemptive_decision', { used: preemptiveUsed });
    session.emit('conversation_item_added', { item: { role: 'user', textContent: words } });
  };
  return {
    session,
    played,
    held,
    detach,
    turn,
    replyNow: () => (replyAt = Date.now()),
    clipNow: () => (lastPlayed = Date.now()),
    tool: () => toolListeners.forEach((l) => l()),
    setGrave: (g: boolean) => (grave = g),
    setPending: (p: Promise<unknown> | null) => (pending = p),
  };
}

describe('slowTurnReason / slowTurnClip', () => {
  it('names why a turn looks slow, or null', () => {
    const base = {
      words: 'how was it',
      toolRequested: false,
      preemptiveUsed: true,
      mayNeedTool: false,
    };
    expect(slowTurnReason(base)).toBeNull();
    expect(slowTurnReason({ ...base, toolRequested: true })).toBe('tool');
    expect(slowTurnReason({ ...base, mayNeedTool: true })).toBe('tool_likely');
    expect(slowTurnReason({ ...base, preemptiveUsed: false })).toBe('preemptive_dropped');
    expect(slowTurnReason({ ...base, preemptiveUsed: null })).toBe('no_preemptive');
    expect(slowTurnReason({ ...base, words: 'word '.repeat(SLOW_TURN.longTurnWords) })).toBe(
      'long_turn'
    );
  });
  it('"Hmm" for a question, "Mm" otherwise', () => {
    expect(slowTurnClip('what do you think?')).toBe('Hmm');
    expect(slowTurnClip('it was a long day')).toBe('Mm');
  });
});

describe('attachSlowTurnSound', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a slow turn with no reply words by the wait gets one "Mm", and the reply waits for it', async () => {
    const h = setup();
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs - 1);
    expect(h.played).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.played).toEqual(['Mm']);
    expect(h.held).toEqual(['Mm']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.played).toHaveLength(1);
  });

  it('no sound when the reply words reach TTS in time', async () => {
    const h = setup();
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(400);
    h.replyNow();
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(h.played).toEqual([]);
  });

  it('no sound on a turn that does not look slow (preemptive reply used, short, no tool)', async () => {
    const h = setup();
    h.turn('it was fine thanks', true);
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(h.played).toEqual([]);
  });

  it('a tool asked for before the wait makes a quiet chat turn slow', async () => {
    const h = setup();
    h.turn('tell me about it', true);
    h.tool();
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(h.played).toEqual(['Mm']);
  });

  it('not when another clip already filled the gap (the opening sound)', async () => {
    const h = setup();
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(200);
    h.clipNow();
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(h.played).toEqual([]);
  });

  it('never on two turns running', async () => {
    const h = setup();
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    h.turn('and then call my mom');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(h.played).toEqual(['Mm']);
    h.turn('and my dad too please');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(h.played).toEqual(['Mm', 'Mm']);
  });

  it('never on a grave call (crisis risk, hard news, the gate acted)', async () => {
    const h = setup();
    h.setGrave(true);
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs * 3);
    expect(h.played).toEqual([]);
  });

  it('waits out a pending crisis verdict, then plays only if the turn cleared and is still silent', async () => {
    const h = setup();
    let clear!: () => void;
    h.setPending(
      new Promise<void>((r) => {
        clear = r;
      })
    );
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs + 300);
    expect(h.played).toEqual([]); // held while the classifier holds the reply
    h.setPending(null);
    clear();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.played).toEqual(['Mm']);
  });

  it('a crisis verdict that escalates: no sound', async () => {
    const h = setup();
    let decide!: () => void;
    h.setPending(
      new Promise<void>((r) => {
        decide = r;
      })
    );
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs + 300);
    h.setGrave(true); // the gate guided or replaced the reply
    h.setPending(null);
    decide();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.played).toEqual([]);
  });

  it('detach while waiting on a crisis verdict: no sound after the call ends', async () => {
    const h = setup();
    let clear!: () => void;
    h.setPending(
      new Promise<void>((r) => {
        clear = r;
      })
    );
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs + 300);
    h.detach();
    h.setPending(null);
    clear();
    await vi.advanceTimersByTimeAsync(SLOW_TURN.crisisWaitMs);
    expect(h.played).toEqual([]);
    expect(vi.getTimerCount()).toBe(0); // the crisis wait's give-up timer is cleared too
  });

  it('the caller talking again cancels it; detach stops it', async () => {
    const h = setup();
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(300);
    h.session.emit('user_state_changed', { newState: 'speaking' });
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(h.played).toEqual([]);
    h.detach();
    h.turn('can you call my sister for me');
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(h.played).toEqual([]);
  });
});
