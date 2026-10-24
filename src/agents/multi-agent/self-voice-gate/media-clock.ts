/**
 * Media time for one audio stream, on the server's monotonic clock.
 *
 * The stream counts its samples. A frame can only arrive late, never early, so
 * the smallest (arrival time - media time) seen is the stream's true offset; a
 * burst of frames released by an event-loop stall (100-385 ms in prod) arrives
 * late and leaves the offset, and so the frames' media times, untouched. The
 * offset relaxes upward slowly so the two ends' clocks may drift, and a gap far
 * longer than any stall (the track paused) re-anchors it.
 *
 * @module agents/multi-agent/self-voice-gate/media-clock
 */

/** How far the offset may rise per ms of media: 1 ms a second covers any clock drift. */
const RELAX_PER_MS = 0.001;
/** Lateness beyond any event-loop stall: the stream stopped and started again. */
const REANCHOR_MS = 1000;

export class MediaClock {
  private samples = 0;
  private offsetMs = Number.NaN;

  constructor(private readonly rate: number) {}

  /** Media time (ms) of the first sample of a frame of `n` samples that arrived at `arrivalMs`. */
  stamp(n: number, arrivalMs: number): number {
    const startMs = (this.samples / this.rate) * 1000;
    this.samples += n;
    const endMs = (this.samples / this.rate) * 1000;
    // The frame's last sample can't have arrived before arrivalMs.
    const lateness = arrivalMs - endMs;
    if (Number.isNaN(this.offsetMs) || lateness - this.offsetMs > REANCHOR_MS) {
      this.offsetMs = lateness;
    } else {
      this.offsetMs = Math.min(this.offsetMs + (endMs - startMs) * RELAX_PER_MS, lateness);
    }
    return startMs + this.offsetMs;
  }
}
