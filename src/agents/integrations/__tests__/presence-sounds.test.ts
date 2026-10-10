import { describe, expect, it, vi } from 'vitest';
import { peakOf, synthHum, synthSnore, synthWhistle } from '../presence-sounds.js';
import {
  createPresenceWatcher,
  LONG_QUIET,
  presenceHumEnabled,
  presenceSnoreEnabled,
} from '../presence-watcher.js';

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('synthesized whistle', () => {
  it('is a few seconds of quiet, click-free audio in the clip format', () => {
    const pcm = synthWhistle({ rng: seq(0.3, 0.5, 0.7) });
    const s = new Int16Array(pcm);
    const seconds = s.length / 24000;
    expect(seconds).toBeGreaterThan(1);
    expect(seconds).toBeLessThan(4);
    expect(peakOf(pcm)).toBeLessThan(0.35); // softer than speech
    expect(peakOf(pcm)).toBeGreaterThan(0.05); // but audible
    // No click: it starts from silence and ends in silence.
    expect(Math.abs(s[0])).toBeLessThan(200);
    expect(Math.max(...Array.from(s.slice(-200)).map(Math.abs))).toBeLessThan(200);
  });

  it('varies between whistles', () => {
    const a = new Int16Array(synthWhistle({ rng: seq(0.1, 0.2) }));
    const b = new Int16Array(synthWhistle({ rng: seq(0.9, 0.8) }));
    expect(a.length === b.length && a.every((v, i) => v === b[i])).toBe(false);
  });
});

describe('when Ferni whistles', () => {
  function setup(mood?: string, rng = seq(0, 0.1)) {
    vi.useFakeTimers();
    const play = vi.fn(() => true);
    const stop = vi.fn();
    const w = createPresenceWatcher({ play, stop, mood: () => mood, rng });
    const exchange = () => {
      w.onAgentState('speaking');
      w.onAgentState('listening');
    };
    return { w, play, stop, exchange };
  }

  it('waits for an easy silence after a few exchanges, then whistles once a call', () => {
    const { play, exchange } = setup();
    exchange();
    exchange();
    vi.advanceTimersByTime(10_000);
    expect(play).not.toHaveBeenCalled(); // too early in the call
    exchange();
    vi.advanceTimersByTime(4_000);
    expect(play).not.toHaveBeenCalled(); // not quiet long enough
    vi.advanceTimersByTime(4_000);
    expect(play).toHaveBeenCalledTimes(1);
    exchange();
    vi.advanceTimersByTime(20_000);
    expect(play).toHaveBeenCalledTimes(1); // once a call
    vi.useRealTimers();
  });

  it('never whistles over the caller, and stops the moment they speak', () => {
    const { w, play, stop, exchange } = setup();
    for (let i = 0; i < 3; i++) exchange();
    w.onUserState('speaking');
    vi.advanceTimersByTime(20_000);
    expect(play).not.toHaveBeenCalled();
    w.onUserState('listening');
    vi.advanceTimersByTime(8_000);
    expect(play).toHaveBeenCalledTimes(1);
    w.onUserState('speaking');
    expect(stop).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not whistle when their voice read sad or anxious, or when the dice say no', () => {
    const sad = setup('sad');
    for (let i = 0; i < 3; i++) sad.exchange();
    vi.advanceTimersByTime(20_000);
    expect(sad.play).not.toHaveBeenCalled();
    vi.useRealTimers();
    const unlucky = setup(undefined, seq(0, 0.9));
    for (let i = 0; i < 3; i++) unlucky.exchange();
    vi.advanceTimersByTime(8_000);
    expect(unlucky.play).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('synthesized hum and snore', () => {
  it('hums a short tune at a quiet, unclipped level, and tunes differ', () => {
    const a = synthHum({ rng: seq(0, 0.5) });
    const b = synthHum({ rng: seq(0.6, 0.5) });
    for (const pcm of [a, b]) {
      const secs = pcm.byteLength / 2 / 24000;
      expect(secs).toBeGreaterThan(1);
      expect(secs).toBeLessThan(4);
      expect(peakOf(pcm)).toBeGreaterThan(0.1);
      expect(peakOf(pcm)).toBeLessThan(0.5);
    }
    expect(a.byteLength).not.toBe(b.byteLength);
  });

  it('hums low: most of the energy is below 1 kHz, unlike the whistle', () => {
    // Zero-crossing rate is a cheap pitch/brightness proxy.
    const zcr = (pcm: ArrayBuffer) => {
      const s = new Int16Array(pcm);
      let z = 0;
      for (let i = 1; i < s.length; i++) if (s[i - 1] < 0 !== s[i] < 0) z++;
      return (z / s.length) * 24000;
    };
    expect(zcr(synthHum({ rng: seq(0, 0.5) }))).toBeLessThan(1000);
    expect(zcr(synthWhistle({ rng: seq(0, 0.5) }))).toBeGreaterThan(1500);
  });

  it('snores two breaths, short and not loud', () => {
    // Real noise (a two-value sequence is near-silent after the low-pass): a seeded LCG.
    let x = 12345;
    const lcg = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pcm = synthSnore({ rng: lcg });
    const secs = pcm.byteLength / 2 / 24000;
    expect(secs).toBeGreaterThan(4);
    expect(secs).toBeLessThan(7);
    expect(peakOf(pcm)).toBeGreaterThan(0.05);
    expect(peakOf(pcm)).toBeLessThan(0.6);
  });

  it('is off unless switched on', () => {
    expect(presenceHumEnabled({})).toBe(false);
    expect(presenceSnoreEnabled({})).toBe(false);
    expect(presenceHumEnabled({ PRESENCE_HUM: 'on' })).toBe(true);
    expect(presenceSnoreEnabled({ PRESENCE_SNORE: 'on' })).toBe(true);
  });
});

describe('when Ferni snores', () => {
  it('waits for a long quiet, not the short one a whistle needs, and snores once', () => {
    vi.useFakeTimers();
    const play = vi.fn(() => true);
    const w = createPresenceWatcher(
      { play, stop: vi.fn(), mood: () => undefined, rng: seq(0, 0.1) },
      LONG_QUIET
    );
    for (let i = 0; i < 3; i++) {
      w.onAgentState('speaking');
      w.onAgentState('listening');
    }
    vi.advanceTimersByTime(15_000);
    expect(play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(12_000);
    expect(play).toHaveBeenCalledTimes(1);
    w.onAgentState('speaking');
    w.onAgentState('listening');
    vi.advanceTimersByTime(60_000);
    expect(play).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
