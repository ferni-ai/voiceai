import { describe, expect, it } from 'vitest';
import { MediaClock } from '../media-clock.js';

const RATE = 16_000;
const FRAME = 160; // 10 ms
const PATH_MS = 40; // network + jitter-buffer delay every frame carries

describe('MediaClock', () => {
  it('keeps every frame on its true media time through a 300 ms event-loop stall', () => {
    const clock = new MediaClock(RATE);
    const errors: number[] = [];
    for (let i = 0; i < 400; i++) {
      const trueStart = 5000 + i * 10;
      let arrival = trueStart + 10 + PATH_MS + ((i * 7) % 5); // 0-4 ms jitter, never early
      // Frames 100-129 are held by a stall and all released at once, 300 ms late.
      if (i >= 100 && i < 130) arrival = 5000 + 130 * 10 + PATH_MS;
      errors.push(clock.stamp(FRAME, arrival) - (trueStart + PATH_MS));
    }
    const after = errors.slice(100);
    // A naive clock (arrival - frame length) is off by up to 300 ms inside the burst.
    expect(Math.max(...after.map(Math.abs))).toBeLessThan(1);
    // And the stamps stay monotonic, 10 ms apart, through the burst.
    for (let i = 101; i < 140; i++) expect(errors[i] - errors[i - 1]).toBeCloseTo(0, 0);
  });

  it('re-anchors after the stream stops for longer than any stall', () => {
    const clock = new MediaClock(RATE);
    for (let i = 0; i < 50; i++) clock.stamp(FRAME, 1000 + i * 10 + 10);
    // The track paused for 10 s; its next frame is media time 500 ms but arrives at 11.5 s.
    const at = clock.stamp(FRAME, 11_510);
    expect(at).toBeCloseTo(11_500, 0);
  });
});
