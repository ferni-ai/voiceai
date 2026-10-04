/**
 * The real SpeakerChangeDetector with neural (ECAPA-TDNN) embeddings. Only the
 * extractor is mocked: it maps each synthetic voice to a vector whose cosine to
 * the first voice matches what ECAPA-TDNN measured on 2 s windows
 * (2026-10-04, six TTS voices): the same person saying something else scores
 * about 0.6 (same-speaker median 0.70, p5 0.535), a different person about 0.15.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mode = vi.hoisted(() => ({ method: 'neural' as 'neural' | 'dsp' }));

const VOICE_A_HZ = 120; // speaker A
const VOICE_A2_HZ = 150; // speaker A, another sentence (cosine 0.6 to A)
const VOICE_B_HZ = 260; // speaker B (cosine 0.15 to A)

const extract = vi.hoisted(() =>
  vi.fn(async (audio: Float32Array) => {
    let crossings = 0;
    for (let i = 1; i < audio.length; i++) if (audio[i] >= 0 !== audio[i - 1] >= 0) crossings++;
    const hz = (crossings / 2) * (16000 / audio.length);
    const vector =
      hz < 135 ? [1, 0, 0] : hz < 200 ? [0.6, 0.8, 0] : [0.15, 0, Math.sqrt(1 - 0.0225)];
    return {
      vector: Float32Array.from(vector),
      method: mode.method,
      confidence: 0.95,
      timestamp: new Date(),
    };
  })
);

vi.mock('../../voice-memory-enhanced.js', () => ({ extractSpeakerEmbedding: extract }));

import { endHouseholdSession } from '../voice-household.js';
import { SpeakerChangeDetector, type SpeakerChangeEvent } from '../voice-speaker-change.js';

const RATE = 16000;
const DEVICE = 'neural-threshold-device';
let phase = 0;

/** 2 s of a voice in 20 ms frames, then the detector's 2 s interval. */
async function talk(d: SpeakerChangeDetector, hz: number): Promise<void> {
  for (let f = 0; f < 100; f++) {
    const frame = new Float32Array(320);
    for (let i = 0; i < frame.length; i++) {
      frame[i] = 0.2 * Math.sin(phase);
      phase += (2 * Math.PI * hz) / RATE;
    }
    d.feedAudio(frame);
  }
  await vi.advanceTimersByTimeAsync(2000);
}

let detector: SpeakerChangeDetector;
let changes: SpeakerChangeEvent[];

beforeEach(() => {
  vi.useFakeTimers();
  extract.mockClear();
  mode.method = 'neural';
  detector = new SpeakerChangeDetector(DEVICE);
  changes = [];
  detector.on('speaker_changed', (e: SpeakerChangeEvent) => changes.push(e));
  detector.start('user-1');
});

afterEach(() => {
  detector.stop();
  endHouseholdSession(DEVICE);
  vi.useRealTimers();
});

describe('neural embeddings', () => {
  it('keeps the same person as the same speaker across different sentences', async () => {
    await talk(detector, VOICE_A_HZ);
    // keeps talking, new sentences (sequential on purpose: one 2 s window after another)
    // eslint-disable-next-line no-await-in-loop
    for (let i = 0; i < 6; i++) await talk(detector, VOICE_A2_HZ);

    expect(extract).toHaveBeenCalledTimes(7);
    expect(changes).toHaveLength(0);
  });

  it('detects a different person', async () => {
    await talk(detector, VOICE_A_HZ);
    await talk(detector, VOICE_B_HZ);
    await talk(detector, VOICE_B_HZ);

    expect(changes).toHaveLength(1);
    expect(changes[0].confidence).toBeGreaterThan(detector.getChangeConfidenceThreshold());
  });
});

it('does not compare a neural vector with a DSP one (the method changed mid-call)', async () => {
  mode.method = 'dsp';
  await talk(detector, VOICE_A_HZ); // DSP reference
  mode.method = 'neural';
  await talk(detector, VOICE_B_HZ); // new space: becomes the reference, not "different"
  await talk(detector, VOICE_B_HZ);

  expect(changes).toHaveLength(0);
});
