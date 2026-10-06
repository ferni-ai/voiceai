/**
 * The audio a speaker-change comparison is allowed to embed.
 *
 * SpeakerChangeDetector takes the last 2 s of the caller's track every 2 s.
 * Between turns that track carries silence, so a window is often the tail of
 * one sentence, a laugh or a one-word "Yeah." with silence around it, and
 * ECAPA-TDNN on that is not a voice print. Cosine to the caller's own
 * reference, measured through the real model (2026-10-04, `say -v Samantha`,
 * 6 other macOS voices, 2 s windows cut the way the interval cuts them):
 *
 *   voiced s in window   same voice (min / median)    different voices (max)
 *   under 0.25             -0.03 / 0.00                  0.09
 *   0.25-0.5                0.11 / 0.29                  0.41
 *   0.5-0.75                0.17 / 0.43                  0.38
 *   0.75-1.0                0.32 / 0.55                  0.48
 *   1.0-1.25                0.21 / 0.50                  0.47
 *   1.25 or more            0.45 / 0.78                  0.57
 *
 * With the 0.45 same-speaker threshold a fragment reads as "someone else", and
 * a tail at the end of one turn plus a head at the start of the next (the
 * silence between them is skipped, so it does not reset the count) is two in
 * a row: a confirmed change. Single-voice dev calls confirmed 1-2 each (PR #280
 * e2e); replaying the eval scenarios through the real detector and model gave
 * 125 confirmed changes in 80 single-voice calls.
 *
 * So the detector embeds only voiced 20 ms frames (silence padding drags the
 * same voice down further), collected across windows until there are
 * `minVoicedMs` of them: a short turn still counts, it just waits for more
 * voice instead of being compared alone. On 1.25 s or more of voiced frames
 * the same voice scored 0.65 or more (n=51), the six other voices 0.57 at most
 * (n=439). Replayed again with this (and the detector averaging only clear
 * matches into its reference): 0 confirmed changes in the same 80 calls, and a
 * second voice taking over still confirmed (Daniel 80/80 calls, Karen 74/80).
 */

/** 20 ms at 16 kHz. */
const VOICED_FRAME_SAMPLES = 320;

export interface VoicedAudioConfig {
  /** A 20 ms frame quieter than this RMS is silence, not voice. */
  minSpeechRms: number;
  /** Voiced ms needed before a comparison. */
  minVoicedMs: number;
}

/** The 20 ms frames of `audio` at or above `minSpeechRms`, concatenated. */
function voicedFrames(audio: Float32Array, minSpeechRms: number): Float32Array {
  const voiced = new Float32Array(audio.length);
  let kept = 0;
  for (let start = 0; start + VOICED_FRAME_SAMPLES <= audio.length; start += VOICED_FRAME_SAMPLES) {
    const frame = audio.subarray(start, start + VOICED_FRAME_SAMPLES);
    let energy = 0;
    for (const sample of frame) energy += sample * sample;
    if (Math.sqrt(energy / VOICED_FRAME_SAMPLES) < minSpeechRms) continue;
    voiced.set(frame, kept);
    kept += VOICED_FRAME_SAMPLES;
  }
  return voiced.slice(0, kept);
}

/**
 * Collects voiced frames across windows. `add` returns everything collected
 * once there is at least `minVoicedMs` of it (and starts over), else null.
 */
export class VoicedAudioAccumulator {
  private chunks: Float32Array[] = [];
  private samples = 0;

  constructor(
    private readonly config: VoicedAudioConfig,
    private readonly sampleRate = 16000
  ) {}

  add(audio: Float32Array): Float32Array | null {
    const voiced = voicedFrames(audio, this.config.minSpeechRms);
    if (voiced.length > 0) {
      this.chunks.push(voiced);
      this.samples += voiced.length;
    }
    if (this.samples < (this.config.minVoicedMs / 1000) * this.sampleRate) return null;
    const out = new Float32Array(this.samples);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    this.clear();
    return out;
  }

  clear(): void {
    this.chunks = [];
    this.samples = 0;
  }
}
