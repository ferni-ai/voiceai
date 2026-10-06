import { describe, expect, it, vi } from 'vitest';
import { peakOf, synthWhistle } from '../presence-sounds.js';
import { createPresenceWatcher } from '../presence-watcher.js';

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
