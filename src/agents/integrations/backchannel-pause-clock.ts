/**
 * When the caller's pause began, on the audio's own clock.
 *
 * The breath-pause detector stamps everything with Date.now() at processing
 * time and confirms a pause on smoothed energy, three frames in. Both make a
 * backchannel late:
 * - Smoothing plus confirmation put the onset ~70 ms after the real silence.
 * - When the event loop stalls (VAD lag ran ~470 ms p50 on dev), frames arrive
 *   in a burst. The burst is processed in a few ms of wall time, so a pause
 *   that was already 300 ms old reads as just started, and the 220 ms wait
 *   runs again from there. The "mm-hm" then lands after the caller has
 *   resumed: 82% of mid-turn clips did in dev evals (duplex spike, 2026-10-10).
 *
 * This clock counts audio time from the frames themselves, takes the onset at
 * the first quiet raw frame, and knows how far behind real time the frame it
 * is reading is (lagMs), so a decision is never made on audio that is stale.
 * BACKCHANNEL_AUDIO_CLOCK=on turns it on for live backchannels.
 *
 * @module agents/integrations/backchannel-pause-clock
 */

/**
 * Frames older than this are not decided on: the caller may have resumed in
 * audio we have not read yet. Fresh frames sit within a few 10 ms frames of
 * real time.
 */
export const STALE_FRAME_MS = 80;
/** Lag is measured against the freshest frame seen in this much audio. */
const LAG_WINDOW_MS = 3000;
/** Loud frames in a row that mean the caller is talking (the detector's count). */
const SPEECH_FRAMES = 2;
/** A pause this long is the end of the turn, not a breath. */
const TURN_END_MS = 1500;
/** Speech before a pause for it to count as a breath pause (the detector's rule). */
const MIN_SPEAKING_MS = 1000;
/** Longest pause that still counts as a breath pause (CONFIG.BREATH_PAUSE_MAX). */
const MAX_BREATH_PAUSE_MS = 400;

/** BACKCHANNEL_AUDIO_CLOCK=on: time live backchannels on the audio clock. */
export function backchannelAudioClockEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.BACKCHANNEL_AUDIO_CLOCK === 'on';
}

export interface PauseClockFrame {
  data: Int16Array | Uint8Array;
  sampleRate: number;
  channels: number;
}

/** RMS levels, 0-1: below `silence` is quiet, above `speech` is talking. */
export interface PauseThresholds {
  silence: number;
  speech: number;
}

export class PauseClock {
  /** Audio time at the end of the last frame, ms. */
  private audioMs = 0;
  /** (audio time, wall minus audio) pairs, offsets increasing: a sliding minimum. */
  private offsets: Array<{ at: number; offset: number }> = [];
  private lag = 0;
  private loudRun = 0;
  private talking = false;
  private speechStartMs: number | null = null;
  private pauseStartMs: number | null = null;

  /** Read one frame; `now` is the wall clock when it was handed to us. */
  push(frame: PauseClockFrame, thresholds: PauseThresholds, now = Date.now()): void {
    const samples = frame.data.length / Math.max(1, frame.channels);
    if (samples === 0 || frame.sampleRate <= 0) return;
    const durMs = (samples / frame.sampleRate) * 1000;
    const frameStart = this.audioMs;
    this.audioMs += durMs;
    this.track(now - this.audioMs);

    const rms = rmsOf(frame.data);
    this.loudRun = rms > thresholds.speech ? this.loudRun + 1 : 0;
    if (this.loudRun >= SPEECH_FRAMES) {
      if (!this.talking) {
        this.talking = true;
        this.speechStartMs = this.audioMs - this.loudRun * durMs;
      }
      this.pauseStartMs = null;
    } else if (rms < thresholds.silence && this.talking && this.pauseStartMs === null) {
      this.pauseStartMs = frameStart;
    }
    if (this.pauseStartMs !== null && this.audioMs - this.pauseStartMs > TURN_END_MS) {
      this.talking = false;
      this.speechStartMs = null;
    }
  }

  /** How far behind real time the last frame is, ms. */
  lagMs(): number {
    return this.lag;
  }

  /** Audio length of the current pause, ms; 0 when not in one. */
  pauseMs(): number {
    return this.pauseStartMs === null ? 0 : this.audioMs - this.pauseStartMs;
  }

  /** Wall-clock time the current pause began, or null when not in one. */
  pauseStartedAt(now = Date.now()): number | null {
    return this.pauseStartMs === null ? null : now - this.lag - this.pauseMs();
  }

  /** The caller is talking, not pausing. */
  userSpeaking(): boolean {
    return this.talking && this.pauseStartMs === null;
  }

  /** A short pause inside a turn they have been talking in for a while. */
  isBreathPause(): boolean {
    if (!this.talking || this.pauseStartMs === null || this.speechStartMs === null) return false;
    if (this.pauseStartMs - this.speechStartMs < MIN_SPEAKING_MS) return false;
    return this.pauseMs() <= MAX_BREATH_PAUSE_MS;
  }

  /**
   * Wall minus audio time is smallest for a frame read the moment it arrived.
   * The lag is how far this frame sits above that floor. A real gap in the
   * stream (a muted mic) raises the floor for good; the window forgets the
   * old floor after LAG_WINDOW_MS of audio.
   */
  private track(offset: number): void {
    while (this.offsets.length > 0 && (this.offsets.at(-1)?.offset ?? -Infinity) >= offset)
      this.offsets.pop();
    this.offsets.push({ at: this.audioMs, offset });
    while (this.audioMs - (this.offsets[0]?.at ?? this.audioMs) > LAG_WINDOW_MS)
      this.offsets.shift();
    this.lag = offset - (this.offsets[0]?.offset ?? offset);
  }
}

function rmsOf(data: Int16Array | Uint8Array): number {
  let sum = 0;
  if (data instanceof Int16Array) {
    for (const v of data) sum += (v / 32768) ** 2;
  } else {
    for (const v of data) sum += ((v - 128) / 128) ** 2;
  }
  return Math.sqrt(sum / data.length);
}
