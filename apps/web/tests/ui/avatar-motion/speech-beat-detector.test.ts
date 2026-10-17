/**
 * Speech beat detector: stressed-syllable onsets from a loudness envelope
 * (a sharp rise within ~80 ms, at most one per 500 ms) and phrase ends (a
 * sustained drop after real voicing).
 */
import { describe, expect, it } from 'vitest';
import {
  BEAT_REFRACTORY_MS,
  createBeatDetector,
  PHRASE_GAP_MS,
  type BeatDetector,
  type BeatFrame,
} from '../../../src/ui/avatar-motion/speech-beat-detector.js';

const FRAME_MS = 16;

/** Feed `level` for `ms` starting at `t`; returns frames and the next t. */
function feed(
  detector: BeatDetector,
  level: number | ((i: number) => number),
  ms: number,
  t: number
): { frames: BeatFrame[]; t: number } {
  const frames: BeatFrame[] = [];
  let now = t;
  for (let i = 0; now < t + ms; i++, now += FRAME_MS) {
    frames.push(detector.step(typeof level === 'number' ? level : level(i), now));
  }
  return { frames, t: now };
}

const beats = (frames: BeatFrame[]): number => frames.filter((f) => f.beat).length;
const phraseEnds = (frames: BeatFrame[]): number => frames.filter((f) => f.phraseEnd).length;

describe('speech beat detector', () => {
  it('marks a sharp rise in loudness as a beat', () => {
    const d = createBeatDetector();
    const quiet = feed(d, 0.1, 200, 0);
    const onset = feed(d, 0.7, 100, quiet.t);
    expect(beats(quiet.frames)).toBe(0);
    expect(beats(onset.frames)).toBe(1);
    expect(onset.frames.find((f) => f.beat)?.strength).toBeGreaterThan(0.5);
  });

  it('does not beat on steady speech, however loud', () => {
    const d = createBeatDetector();
    const ramp = feed(d, (i) => Math.min(0.6, i * 0.01), 1000, 0); // slow swell, no onset
    const steady = feed(d, 0.6, 1500, ramp.t);
    expect(beats(ramp.frames) + beats(steady.frames)).toBe(0);
  });

  it('does not beat on a small rise from silence into a whisper', () => {
    const d = createBeatDetector();
    const silent = feed(d, 0, 200, 0);
    const whisper = feed(d, 0.15, 200, silent.t);
    expect(beats(whisper.frames)).toBe(0);
  });

  it('allows at most one beat per refractory window', () => {
    const d = createBeatDetector();
    // syllables every 160 ms: 80 ms loud, 80 ms dip, for 2 s
    const choppy = feed(d, (i) => (Math.floor(i / 5) % 2 === 0 ? 0.8 : 0.05), 2000, 0);
    const beatTimes = choppy.frames.flatMap((f, i) => (f.beat ? [i * FRAME_MS] : []));
    expect(beatTimes.length).toBeGreaterThan(1);
    for (let i = 1; i < beatTimes.length; i++) {
      expect(beatTimes[i]! - beatTimes[i - 1]!).toBeGreaterThanOrEqual(BEAT_REFRACTORY_MS);
    }
    expect(beatTimes.length).toBeLessThanOrEqual(Math.ceil(2000 / BEAT_REFRACTORY_MS));
  });

  it('ends a phrase once after a sustained drop following real voicing', () => {
    const d = createBeatDetector();
    const phrase = feed(d, 0.5, 800, 0);
    const pause = feed(d, 0, PHRASE_GAP_MS + 300, phrase.t);
    expect(phraseEnds(phrase.frames)).toBe(0);
    expect(phraseEnds(pause.frames)).toBe(1);
    const endIndex = pause.frames.findIndex((f) => f.phraseEnd);
    expect(endIndex * FRAME_MS).toBeGreaterThanOrEqual(PHRASE_GAP_MS);
  });

  it('does not end a phrase on a short gap between words', () => {
    const d = createBeatDetector();
    const word1 = feed(d, 0.5, 500, 0);
    const gap = feed(d, 0, 150, word1.t);
    const word2 = feed(d, 0.5, 500, gap.t);
    expect(phraseEnds([...word1.frames, ...gap.frames, ...word2.frames])).toBe(0);
  });

  it('does not end a phrase after a click too short to be speech', () => {
    const d = createBeatDetector();
    const click = feed(d, 0.6, 100, 0);
    const silence = feed(d, 0, 1000, click.t);
    expect(phraseEnds(silence.frames)).toBe(0);
  });

  it('starts fresh after reset', () => {
    const d = createBeatDetector();
    feed(d, 0.7, 300, 0);
    d.reset();
    const quiet = feed(d, 0, 1000, 300);
    expect(phraseEnds(quiet.frames)).toBe(0);
    const onset = feed(d, 0.7, 100, quiet.t);
    expect(beats(onset.frames)).toBe(1);
  });

  it('beats on the first stressed syllable of a turn, with no quiet frames before it', () => {
    const d = createBeatDetector();
    const onset = feed(d, 0.4, 100, 0); // beats after quiet frames too
    expect(beats(onset.frames)).toBe(1);
  });

  it('beats on an onset after a frame gap longer than the rise window', () => {
    const d = createBeatDetector();
    const quiet = feed(d, 0, 200, 0);
    const onset = feed(d, 0.4, 100, quiet.t + 200); // e.g. a throttled animation frame
    expect(beats(onset.frames)).toBe(1);
  });
});
