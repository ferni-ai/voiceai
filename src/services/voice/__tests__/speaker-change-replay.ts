/**
 * Replays a call's caller audio through a real SpeakerChangeDetector whose
 * embeddings come from the real speaker-embedding worker.
 *
 * The test fakes only setInterval (the detector's 2 s check) and wraps
 * extractSpeakerEmbedding to record each request. Every 2 s of fed audio the
 * interval fires once, exactly as on a call, and the replay waits for that
 * comparison to finish in the worker before feeding more.
 */

import { vi } from 'vitest';
import type { SpeakerChangeDetector } from '../voice-speaker-change.js';

export const RATE = 16000;
const FRAME = 320; // 20 ms, LiveKit's frame size at 16 kHz
const WINDOW_FRAMES = 100; // the detector's 2 s interval

/** Fake only the detector's interval; worker messages and setTimeout stay real. */
export function fakeDetectorInterval(): void {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
}

async function macrotask(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Feed `audio` in 20 ms frames; after each 2 s, fire the interval and wait for
 * the comparison it started (if any) to finish. `extractions` is the list the
 * test's extractSpeakerEmbedding wrapper pushes each request's promise onto.
 */
export async function replayThroughDetector(
  detector: SpeakerChangeDetector,
  audio: Float32Array,
  extractions: Array<Promise<unknown>>
): Promise<void> {
  let frames = 0;
  for (let start = 0; start + FRAME <= audio.length; start += FRAME) {
    detector.feedAudio(audio.slice(start, start + FRAME));
    if (++frames % WINDOW_FRAMES !== 0) continue;
    const before = extractions.length;
    vi.advanceTimersByTime(2000);
    if (extractions.length > before) {
      // eslint-disable-next-line no-await-in-loop -- one comparison per window, in order
      await extractions[extractions.length - 1];
    }
    // eslint-disable-next-line no-await-in-loop -- let the comparison's continuation run
    await macrotask();
  }
}

/** Lay clips out on a timeline: [startSeconds, samples]; the rest is `floor`. */
export function timeline(
  totalSeconds: number,
  clips: Array<[number, Float32Array]>,
  floor: (i: number) => number = () => 0
): Float32Array {
  const audio = new Float32Array(Math.round(totalSeconds * RATE));
  for (let i = 0; i < audio.length; i++) audio[i] = floor(i);
  for (const [at, clip] of clips) {
    const offset = Math.round(at * RATE);
    audio.set(clip.subarray(0, audio.length - offset), offset);
  }
  return audio;
}
