import { describe, expect, it } from 'vitest';

import {
  noteAgentState,
  onStall,
  type Stall,
  summarizeStalls,
  type Ticker,
} from '../loop-watch.js';

/** A ticker whose clock and ticks the test drives. */
function fakeTicker(): Ticker & { tick: (atMs: number) => void } {
  let now = 0;
  let fn: (() => void) | null = null;
  return {
    now: () => now,
    every: (_ms, f) => {
      fn = f;
      return () => {
        fn = null;
      };
    },
    tick: (atMs) => {
      now = atMs;
      fn?.();
    },
  };
}

describe('onStall', () => {
  it('reports a late tick at or over the threshold, with the agent state', () => {
    const t = fakeTicker();
    const seen: Stall[] = [];
    noteAgentState('listening', 0);
    const detach = onStall((s) => seen.push(s), 100, t);
    t.tick(10); // on time
    t.tick(70); // 50 ms late: under threshold
    expect(seen).toHaveLength(0);
    t.tick(200); // 120 ms late
    detach();
    expect(seen).toEqual([{ at: 200, ms: 120, agentState: 'listening', speakingMs: null }]);
  });

  it('says how far into the reply a stall began while Ferni spoke', () => {
    const t = fakeTicker();
    const seen: Stall[] = [];
    t.tick(1000); // nothing attached yet: just sets the clock
    const detach = onStall((s) => seen.push(s), 100, t);
    noteAgentState('speaking', 1000);
    t.tick(1010);
    t.tick(1400); // 380 ms late, began at 1020: 20 ms into the reply
    noteAgentState('listening', 1500);
    t.tick(1800); // 390 ms late, not speaking
    detach();
    expect(seen.map((s) => [s.ms, s.agentState, s.speakingMs])).toEqual([
      [380, 'speaking', 20],
      [390, 'listening', null],
    ]);
  });

  it('stops ticking once the last listener detaches', () => {
    const t = fakeTicker();
    const seen: Stall[] = [];
    const detach = onStall((s) => seen.push(s), 100, t);
    detach();
    t.tick(10_000);
    expect(seen).toHaveLength(0);
  });
});

describe('summarizeStalls', () => {
  it('counts stalls overall, while speaking, and in the first second of a reply', () => {
    const stalls: Stall[] = [
      { at: 1300, ms: 300, agentState: 'speaking', speakingMs: 50 },
      { at: 3200, ms: 110, agentState: 'speaking', speakingMs: 400 },
      { at: 5200, ms: 120, agentState: 'speaking', speakingMs: 2500 },
      { at: 9150, ms: 150, agentState: 'listening', speakingMs: null },
    ];
    const s = summarizeStalls(stalls, 0, { p50Ms: 1, p95Ms: 20, p99Ms: 90, maxMs: 300 }, 10_000);
    expect(s).toMatchObject({
      durationMs: 10_000,
      stalls: 4,
      stallMs: 680,
      stalls250: 1,
      speakingStalls: 3,
      replyStartStalls: 2,
      p95Ms: 20,
    });
    expect(s.worst[0]).toEqual({ atMs: 1000, ms: 300, state: 'speaking' });
  });
});
