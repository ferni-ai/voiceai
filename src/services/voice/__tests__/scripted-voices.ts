/**
 * Scripted voice prints for SpeakerChangeDetector tests: each 2 s window the
 * test speaks is embedded as the next vector in `script`, so a test states
 * exactly what the model would have heard, window by window. Neural method,
 * same-speaker threshold 0.45. Use with:
 *
 *   vi.mock('<path>/voice-memory-enhanced.js', async () => ({
 *     extractSpeakerEmbedding: (await import('<path>/scripted-voices.js')).extractScripted,
 *   }));
 */

import { vi } from 'vitest';
import type { SpeakerEmbedding } from '../../voice-memory-enhanced.js';

const n = (v: number[]): number[] => {
  const len = Math.hypot(...v);
  return v.map((x) => x / len);
};

/** Cosines: CALLER·CALLER_FAR 0.3, every odd window and OTHER at most 0.2 to CALLER. */
export const VOICE = {
  CALLER: [1, 0, 0],
  /** The same caller, sounding different (moved, speakerphone): cosine 0.3 to CALLER. */
  CALLER_FAR: n([0.3, 0.954, 0]),
  /** Odd windows (Ferni's voice leaking back, a laugh, a cough), unlike each other. */
  ECHO: n([0.2, 0.98, 0]),
  LAUGH: n([0.2, -0.6, -0.77]),
  COUGH: n([0.1, -0.3, 0.949]),
  /** Another person. */
  OTHER: n([0.15, 0, 0.989]),
};

/** What the next windows embed as, in order. */
export const script: number[][] = [];
let extractions = 0;

/** Comparisons the detector has asked for since resetScript. */
export function extractionCount(): number {
  return extractions;
}

export async function extractScripted(): Promise<SpeakerEmbedding | null> {
  extractions++;
  const vector = script.shift();
  if (!vector) return null;
  return {
    vector: Float32Array.from(vector),
    method: 'neural',
    confidence: 0.95,
    timestamp: new Date(),
  };
}

export function resetScript(): void {
  script.length = 0;
  extractions = 0;
}

/** 2 s of voiced 20 ms frames (16 kHz) handed to `feed`. */
export function speakFrames(feed: (frame: Float32Array) => void): void {
  for (let f = 0; f < 100; f++) {
    const frame = new Float32Array(320);
    for (let i = 0; i < frame.length; i++)
      frame[i] = 0.2 * Math.sin((2 * Math.PI * 150 * i) / 16000);
    feed(frame);
  }
}

/** Speak one window per vector into `detector` (fake timers), one 2 s interval each. */
export async function speakWindows(
  detector: { feedAudio: (frame: Float32Array) => void },
  ...voices: number[][]
): Promise<void> {
  for (const voice of voices) {
    script.push(voice);
    speakFrames((frame) => detector.feedAudio(frame));
    // eslint-disable-next-line no-await-in-loop -- one window after another, as on a call
    await vi.advanceTimersByTimeAsync(2000);
  }
}
