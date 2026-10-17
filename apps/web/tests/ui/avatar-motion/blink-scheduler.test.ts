/**
 * Blink scheduler: pure timing. A fake clock and a seeded random source, so
 * the distribution and the cue timing are checked exactly.
 */
import { describe, expect, it } from 'vitest';

import {
  createBlinkScheduler,
  CUE_BLINK_DELAY_MAX_MS,
  MAX_BLINK_GAP_MS,
  MIN_BLINK_GAP_MS,
  MIN_BLINK_SPACING_MS,
  sampleBlinkGapMs,
  type BlinkDeps,
  type BlinkWeight,
} from '../../../src/ui/avatar-motion/blink-scheduler.js';

/** Small seeded PRNG (mulberry32) so runs are repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Harness {
  deps: BlinkDeps;
  blinks: { at: number; weight: BlinkWeight }[];
  advance: (ms: number) => void;
  state: { canBlink: boolean; heavy: boolean; random: () => number };
}

function harness(seed = 7): Harness {
  let clock = 0;
  let nextId = 1;
  let timers: { id: number; due: number; fn: () => void }[] = [];
  const blinks: Harness['blinks'] = [];
  const state = { canBlink: true, heavy: false, random: seeded(seed) };
  const deps: BlinkDeps = {
    blink: (weight) => {
      blinks.push({ at: clock, weight });
      return weight === 'heavy' ? 350 : 150;
    },
    canBlink: () => state.canBlink,
    heavy: () => state.heavy,
    random: () => state.random(),
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, due: clock + ms, fn });
      return id;
    },
    clearTimer: (handle) => {
      timers = timers.filter((t) => t.id !== handle);
    },
  };
  const advance = (ms: number): void => {
    const end = clock + ms;
    for (;;) {
      const next = timers.filter((t) => t.due <= end).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      timers = timers.filter((t) => t !== next);
      clock = next.due;
      next.fn();
    }
    clock = end;
  };
  return { deps, blinks, advance, state };
}

describe('sampleBlinkGapMs', () => {
  const random = seeded(42);
  const gaps = Array.from({ length: 5000 }, () => sampleBlinkGapMs(random));
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);

  it('keeps every gap between 2 and 8 seconds', () => {
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(MIN_BLINK_GAP_MS);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(MAX_BLINK_GAP_MS);
  });

  it('averages about 3.5 seconds', () => {
    expect(mean).toBeGreaterThan(3200);
    expect(mean).toBeLessThan(3900);
  });

  it('is irregular, not a metronome', () => {
    expect(sd).toBeGreaterThan(1000);
    expect(new Set(gaps).size).toBeGreaterThan(1000);
  });
});

describe('createBlinkScheduler', () => {
  it('does nothing until started and stops cleanly', () => {
    const h = harness();
    const s = createBlinkScheduler(h.deps);
    h.advance(20_000);
    expect(h.blinks).toHaveLength(0);
    s.start();
    h.advance(20_000);
    const count = h.blinks.length;
    expect(count).toBeGreaterThan(0);
    s.stop();
    h.advance(20_000);
    expect(h.blinks).toHaveLength(count);
    expect(s.running()).toBe(false);
  });

  it('blinks at a human rate with irregular gaps', () => {
    const h = harness();
    createBlinkScheduler(h.deps).start();
    h.advance(10 * 60_000);
    const perMinute = h.blinks.length / 10;
    expect(perMinute).toBeGreaterThanOrEqual(14);
    expect(perMinute).toBeLessThanOrEqual(22);
    const gaps = h.blinks.slice(1).map((b, i) => b.at - h.blinks[i]!.at);
    expect(new Set(gaps).size).toBeGreaterThan(gaps.length / 2);
  });

  it('makes roughly one blink in eight a quick double', () => {
    const h = harness(3);
    createBlinkScheduler(h.deps).start();
    h.advance(60 * 60_000);
    const gaps = h.blinks.slice(1).map((b, i) => b.at - h.blinks[i]!.at);
    const doubles = gaps.filter((g) => g < 500).length;
    const share = doubles / (h.blinks.length - doubles);
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.17);
  });

  it('blinks right after a cue (turn change or gaze shift)', () => {
    const h = harness();
    h.state.random = () => 0.5; // under the cue chance, no double
    const s = createBlinkScheduler(h.deps);
    s.start();
    h.advance(1000); // before the first idle blink (gaps are at least 2 s)
    expect(h.blinks).toHaveLength(0);
    s.cue();
    h.advance(CUE_BLINK_DELAY_MAX_MS);
    expect(h.blinks).toHaveLength(1);
    expect(h.blinks[0]!.at).toBeGreaterThan(1000);
  });

  it('skips the cue when chance says no, and never stacks blinks too close', () => {
    const h = harness();
    h.state.random = () => 0.95; // over the cue chance
    const s = createBlinkScheduler(h.deps);
    s.start();
    h.advance(1000);
    s.cue();
    h.advance(CUE_BLINK_DELAY_MAX_MS);
    expect(h.blinks).toHaveLength(0);

    h.state.random = () => 0.5;
    s.cue();
    h.advance(CUE_BLINK_DELAY_MAX_MS);
    expect(h.blinks).toHaveLength(1);
    s.cue(); // straight after a blink: too soon
    h.advance(CUE_BLINK_DELAY_MAX_MS);
    expect(h.blinks).toHaveLength(1);
    expect(MIN_BLINK_SPACING_MS).toBeGreaterThan(CUE_BLINK_DELAY_MAX_MS);
  });

  it('holds still while the eyes may not blink, then resumes', () => {
    const h = harness();
    h.state.canBlink = false;
    const s = createBlinkScheduler(h.deps);
    s.start();
    s.cue();
    h.advance(60_000);
    expect(h.blinks).toHaveLength(0);
    h.state.canBlink = true;
    h.advance(MAX_BLINK_GAP_MS);
    expect(h.blinks.length).toBeGreaterThan(0);
  });

  it('uses the heavy blink when the mood is heavy', () => {
    const h = harness();
    const s = createBlinkScheduler(h.deps);
    s.start();
    h.advance(30_000);
    expect(h.blinks.every((b) => b.weight === 'light')).toBe(true);
    h.state.heavy = true;
    const before = h.blinks.length;
    h.advance(30_000);
    const later = h.blinks.slice(before);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((b) => b.weight === 'heavy')).toBe(true);
  });
});
