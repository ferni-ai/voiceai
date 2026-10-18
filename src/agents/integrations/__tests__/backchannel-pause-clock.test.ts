/**
 * The pause clock times the caller's pause on the audio itself: the onset is
 * the first quiet frame, durations are audio time, and lagMs says how far
 * behind real time the frame being read is.
 */
import { describe, expect, it } from 'vitest';
import {
  backchannelAudioClockEnabled,
  PauseClock,
  STALE_FRAME_MS,
} from '../backchannel-pause-clock.js';

const RATE = 16000;
const FRAME = RATE / 100; // 10 ms
const LEVELS = { silence: 0.02, speech: 0.05 };

function frame(loud: boolean) {
  const data = new Int16Array(FRAME);
  if (loud) for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin(i / 6));
  return { data, sampleRate: RATE, channels: 1 };
}

/** Feed frames 10 ms apart in wall time from `wall`, or all at `burstAt`. */
function feed(clock: PauseClock, loud: boolean, ms: number, t: { wall: number }, burstAt?: number) {
  for (let i = 0; i < ms / 10; i++) {
    t.wall += 10;
    clock.push(frame(loud), LEVELS, burstAt ?? t.wall);
  }
}

describe('BACKCHANNEL_AUDIO_CLOCK flag', () => {
  it('is off unless set to on', () => {
    expect(backchannelAudioClockEnabled({})).toBe(false);
    expect(backchannelAudioClockEnabled({ BACKCHANNEL_AUDIO_CLOCK: 'off' })).toBe(false);
    expect(backchannelAudioClockEnabled({ BACKCHANNEL_AUDIO_CLOCK: 'on' })).toBe(true);
  });
});

describe('PauseClock', () => {
  it('starts the pause at the first quiet frame', () => {
    const clock = new PauseClock();
    const t = { wall: 0 };
    feed(clock, true, 2000, t);
    expect(clock.userSpeaking()).toBe(true);
    feed(clock, false, 10, t);
    expect(clock.pauseMs()).toBe(10);
    expect(clock.pauseStartedAt(t.wall)).toBe(t.wall - 10);
    feed(clock, false, 210, t);
    expect(clock.pauseMs()).toBe(220);
    expect(clock.isBreathPause()).toBe(true);
    expect(clock.lagMs()).toBe(0);
  });

  it('measures a pause read in a burst by its audio length, and flags the frames stale', () => {
    const clock = new PauseClock();
    const t = { wall: 0 };
    feed(clock, true, 2000, t);
    // The event loop stalls: 300 ms of pause arrives at once, 300 ms late at worst.
    const burstAt = t.wall + 300;
    feed(clock, false, 300, t, burstAt);
    expect(clock.pauseMs()).toBe(300);
    expect(clock.pauseStartedAt(burstAt)).toBe(burstAt - 300);
    expect(clock.lagMs()).toBe(0); // the newest frame of the burst is current
    const stale = new PauseClock();
    const s = { wall: 0 };
    feed(stale, true, 2000, s);
    feed(stale, false, 200, s, s.wall + 300); // only the first 200 ms have been read
    expect(stale.lagMs()).toBe(100);
    expect(stale.lagMs()).toBeGreaterThan(STALE_FRAME_MS);
  });

  it('ends the pause when they talk again, and a long one ends the turn', () => {
    const clock = new PauseClock();
    const t = { wall: 0 };
    feed(clock, true, 2000, t);
    feed(clock, false, 200, t);
    feed(clock, true, 20, t);
    expect(clock.pauseMs()).toBe(0);
    expect(clock.userSpeaking()).toBe(true);
    feed(clock, false, 1600, t);
    expect(clock.isBreathPause()).toBe(false);
    expect(clock.userSpeaking()).toBe(false);
  });

  it('is not a breath pause after under a second of speech, or past 400 ms', () => {
    const short = new PauseClock();
    const t = { wall: 0 };
    feed(short, true, 500, t);
    feed(short, false, 250, t);
    expect(short.isBreathPause()).toBe(false);
    const long = new PauseClock();
    feed(long, true, 2000, t);
    feed(long, false, 410, t);
    expect(long.isBreathPause()).toBe(false);
  });

  it('forgets a gap in the stream once enough fresh audio has played', () => {
    const clock = new PauseClock();
    const t = { wall: 0 };
    feed(clock, true, 1000, t);
    t.wall += 2000; // no frames for 2 s (a muted mic)
    feed(clock, true, 10, t);
    expect(clock.lagMs()).toBe(2000);
    feed(clock, true, 3100, t);
    expect(clock.lagMs()).toBe(0);
  });
});
