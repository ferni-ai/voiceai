import { AudioFrame } from '@livekit/rtc-node';
import { describe, expect, it, vi } from 'vitest';
import { RefRing, tapAudioSource } from '../reference-tap.js';

/** Like rtc-node's AudioSource: captureFrame and clearQueue on the prototype. */
class FakeSource {
  queuedDuration = 0;
  captured = 0;
  cleared = 0;
  async captureFrame(_frame: AudioFrame): Promise<void> {
    this.captured++;
  }
  clearQueue(): void {
    this.cleared++;
  }
}

const tone = (ms: number, rate = 24_000, amp = 10_000): AudioFrame => {
  const n = (rate * ms) / 1000;
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) data[i] = i % 2 ? amp : -amp; // full-power square wave
  return new AudioFrame(data, rate, 1, n);
};

const level = (ring: RefRing, at: number) => ring.meanSquare(at, 10);
const POWER = (10_000 / 32768) ** 2;

describe('reference tap', () => {
  it('records each frame at its scheduled playout time: capture time plus what is queued', async () => {
    let t = 1000;
    const source = new FakeSource();
    const ring = new RefRing();
    expect(tapAudioSource(source, ring, { now: () => t })).toBe(true);
    // Five 100 ms frames captured at once (TTS runs faster than real time).
    for (let i = 0; i < 5; i++) await source.captureFrame(tone(100));
    expect(source.captured).toBe(5); // the original still runs
    // The fifth frame plays 400 ms after capture, not at capture.
    expect(level(ring, 1400)).toBeCloseTo(POWER, 5);
    expect(level(ring, 1490)).toBeCloseTo(POWER, 5);
    expect(level(ring, 1500)).toBe(0);
    expect(level(ring, 990)).toBe(0);
    // A frame captured after the queue drained plays at once.
    t = 3000;
    await source.captureFrame(tone(10));
    expect(level(ring, 3000)).toBeCloseTo(POWER, 5);
    expect(level(ring, 1500)).toBe(0); // the gap between replies is silence
  });

  it('drops what clearQueue cut, and schedules the next reply from now', async () => {
    let t = 2000;
    const source = new FakeSource();
    const ring = new RefRing();
    const onClear = vi.fn();
    tapAudioSource(source, ring, { now: () => t, onClear });
    for (let i = 0; i < 10; i++) await source.captureFrame(tone(100)); // plays 2000-3000
    t = 2300;
    source.clearQueue();
    expect(source.cleared).toBe(1);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(level(ring, 2290)).toBeCloseTo(POWER, 5); // already played: kept
    expect(level(ring, 2300)).toBe(0); // never played: dropped
    expect(level(ring, 2900)).toBe(0);
    // rtc-node's queuedDuration doesn't reset on clear; the tap's own queue does.
    source.queuedDuration = 700;
    await source.captureFrame(tone(50));
    expect(level(ring, 2300)).toBeCloseTo(POWER, 5);
    expect(level(ring, 2350)).toBe(0);
  });

  it('taps a source once and never throws into the audio path', async () => {
    const source = new FakeSource();
    const ring = new RefRing();
    expect(tapAudioSource(source, ring, { now: () => 0 })).toBe(true);
    const wrapped = source.captureFrame;
    expect(tapAudioSource(source, ring, { now: () => 0 })).toBe(false);
    expect(source.captureFrame).toBe(wrapped);
    expect(tapAudioSource({ captureFrame: 1 }, ring, { now: () => 0 })).toBe(false);
    const broken = new FakeSource();
    tapAudioSource(broken, ring, {
      now: () => {
        throw new Error('clock gone');
      },
    });
    await expect(broken.captureFrame(tone(10))).resolves.toBeUndefined();
    expect(() => broken.clearQueue()).not.toThrow();
    expect(broken.captured).toBe(1);
    expect(broken.cleared).toBe(1);
  });

  it('skips a frame with no sample rate instead of hanging, and keeps scheduling', async () => {
    const ring = new RefRing();
    const silent = new AudioFrame(new Int16Array(480), 0, 1, 480);
    ring.write(silent, 1000); // returned at all: no infinite loop
    expect(level(ring, 1000)).toBe(0);
    const source = new FakeSource();
    const tapped = new RefRing();
    tapAudioSource(source, tapped, { now: () => 2000 });
    await source.captureFrame(silent);
    expect(source.captured).toBe(1); // the original still runs
    await source.captureFrame(tone(10));
    // The 0 Hz frame did not push the queue end to Infinity.
    expect(level(tapped, 2000)).toBeCloseTo(POWER, 5);
  });
});
