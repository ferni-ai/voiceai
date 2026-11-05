/**
 * Pure audio and transcript bookkeeping for STT_AUDIO_DIAGNOSTICS
 * (stt-audio-diagnostics.ts): running level sums for a stretch of audio, and
 * the "VAD heard speech, STT returned no words" detector. O(1) state each.
 *
 * @module agents/model-provider/stt-audio-levels
 */

export const NO_WORDS_BURSTS = 3;
export const NO_WORDS_SPAN_MS = 20_000;
/** A stretch whose peak stays below this is a mic floor, not speech. */
const NEAR_SILENT_PEAK_DBFS = -50;
const FULL_SCALE = 32768;

const round1 = (x: number): number => Math.round(x * 10) / 10;
const dbfs = (amplitude: number): number | null =>
  amplitude > 0 ? round1(20 * Math.log10(amplitude / FULL_SCALE)) : null;

/** Running level sums over one stretch of audio. */
export class AudioLevels {
  frames = 0;
  zeroFrames = 0;
  samples = 0;
  sumSquares = 0;
  peak = 0;

  add(framePeak: number, frameSumSquares: number, samples: number): void {
    this.frames += 1;
    if (framePeak === 0) this.zeroFrames += 1;
    this.samples += samples;
    this.sumSquares += frameSumSquares;
    if (framePeak > this.peak) this.peak = framePeak;
  }

  summary(): {
    frames: number;
    zeroFrameShare: number | null;
    peakDbfs: number | null;
    rmsDbfs: number | null;
    audio: 'none' | 'silent' | 'near_silent' | 'present';
  } {
    const peakDbfs = dbfs(this.peak);
    return {
      frames: this.frames,
      zeroFrameShare: this.frames
        ? Math.round((this.zeroFrames / this.frames) * 1000) / 1000
        : null,
      peakDbfs,
      rmsDbfs: this.samples ? dbfs(Math.sqrt(this.sumSquares / this.samples)) : null,
      audio:
        this.frames === 0
          ? 'none'
          : peakDbfs === null
            ? 'silent'
            : peakDbfs < NEAR_SILENT_PEAK_DBFS
              ? 'near_silent'
              : 'present',
    };
  }
}

/** Speaking bursts with no transcript since; fires when NO_WORDS_BURSTS land within the span. */
export class NoWordsDetector {
  #bursts: number[] = [];

  /** True when no unanswered burst is still inside the span: `now` starts a new run. */
  idle(now: number): boolean {
    return this.#bursts.every((t) => now - t > NO_WORDS_SPAN_MS);
  }

  /** A speaking burst; true when it completes a run (which then starts over). */
  onSpeaking(now: number): boolean {
    this.#bursts = this.#bursts.filter((t) => now - t <= NO_WORDS_SPAN_MS);
    this.#bursts.push(now);
    if (this.#bursts.length < NO_WORDS_BURSTS) return false;
    this.#bursts = [];
    return true;
  }

  onWords(): void {
    this.#bursts = [];
  }
}
