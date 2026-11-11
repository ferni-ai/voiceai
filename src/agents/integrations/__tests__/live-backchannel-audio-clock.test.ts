/**
 * BACKCHANNEL_AUDIO_CLOCK: a live "mm-hm" is timed on the caller's audio, so
 * it goes out sooner after the pause begins, and an event-loop stall can no
 * longer make it play after the caller has started talking again.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';
import { initializeLiveBackchanneling } from '../live-backchanneling-integration.js';

const RATE = 16000;
const FRAME = RATE / 100; // 10 ms

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(FRAME);
  if (loud)
    for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin((t * FRAME + i) / 6));
  return new AudioFrame(data, RATE, 1, FRAME);
}

function setup(clock: 'on' | 'off') {
  vi.stubEnv('BACKCHANNEL_AUDIO_CLOCK', clock);
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const played: Array<{ at: number; audioMs: number; pauseStartedAt?: number }> = [];
  let t = 0;
  const bc = initializeLiveBackchanneling(
    `audio-clock-${clock}-${Math.random()}`,
    'ferni',
    {} as never,
    () => false,
    {
      playClip: (_text, opts) => {
        played.push({
          at: Date.now(),
          audioMs: (t + 1) * 10,
          pauseStartedAt: opts?.pauseStartedAt,
        });
        return true;
      },
    }
  );
  bc.onNewTurn();
  /** Frames in real time, 10 ms apart. */
  const run = (loud: boolean, ms: number): void => {
    for (let i = 0; i < ms / 10; i++, t++) {
      vi.advanceTimersByTime(10);
      bc.processAudioFrame(frame(loud, t));
    }
  };
  /** The loop stalls for `ms`; the frames of that time are then read at once. */
  const stall = (parts: Array<[boolean, number]>): void => {
    const ms = parts.reduce((n, [, d]) => n + d, 0);
    vi.advanceTimersByTime(ms);
    for (const [loud, d] of parts)
      for (let i = 0; i < d / 10; i++, t++) bc.processAudioFrame(frame(loud, t));
  };
  return { played, run, stall, audioNow: () => t * 10 };
}

describe('live backchannels on the audio clock', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('plays 220 ms into the pause on fresh audio, sooner than without the flag', () => {
    const decideAfter = (clock: 'on' | 'off'): number => {
      const { played, run, audioNow } = setup(clock);
      run(true, 3000);
      const pauseAt = audioNow();
      run(false, 350);
      expect(played).toHaveLength(1);
      vi.useRealTimers();
      vi.restoreAllMocks();
      return played[0]!.audioMs - pauseAt;
    };
    const on = decideAfter('on');
    const off = decideAfter('off');
    expect(on).toBeGreaterThanOrEqual(220);
    expect(on).toBeLessThanOrEqual(230);
    expect(off).toBeGreaterThanOrEqual(on + 30);
  });

  it('reports the real pause onset with the clip', () => {
    const { played, run } = setup('on');
    run(true, 3000);
    const silentFrom = Date.now();
    run(false, 300);
    expect(played).toHaveLength(1);
    expect(played[0]!.pauseStartedAt).toBe(silentFrom);
  });

  // The caller pauses 330 ms. 100 ms in, the event loop stalls until 430 ms,
  // so the end of the pause and the first 100 ms of their next phrase are
  // read in one burst.
  const stalledPause = (clock: 'on' | 'off') => {
    const s = setup(clock);
    s.run(true, 3000);
    s.run(false, 100);
    s.stall([
      [false, 230],
      [true, 100],
    ]);
    s.run(true, 500);
    return s.played;
  };

  it('without the flag, a stall makes the clip play after the caller resumed', () => {
    const played = stalledPause('off');
    expect(played).toHaveLength(1);
    // Decided while reading the burst: the caller resumed 100 ms of audio earlier.
    expect(played[0]!.audioMs).toBeLessThan(3000 + 330);
    expect(played[0]!.at).toBeGreaterThan(1_000_000 + 3000 + 330);
  });

  it('with the flag, a stall cannot make the clip land on their next phrase', () => {
    expect(stalledPause('on')).toHaveLength(0);
  });

  it('with the flag, still plays when the stall ends inside the pause', () => {
    const { played, run, stall } = setup('on');
    run(true, 3000);
    run(false, 100);
    stall([[false, 150]]); // read at 250 ms into the pause, caught up
    run(false, 100);
    expect(played).toHaveLength(1);
    expect(played[0]!.audioMs - 3000).toBeLessThanOrEqual(260);
  });
});
