/**
 * The real SpeakerChangeDetector on the real speaker-embedding worker, with the
 * waveform-contract fixture model: its embedding is the first 192 samples of
 * what it is given, so each vector shows exactly which audio the detector
 * handed the model.
 *
 * Each synthetic voice repeats one 20 ms frame whose first 192 samples have a
 * chosen cosine to voice A's. Between clips the line carries a quiet noise
 * floor (RMS ~0.002, below the 0.01 speech floor), like a microphone.
 *
 * What PR #280's dev e2e showed (single-voice calls confirming 1-2 changes
 * each) comes from two things these tests pin:
 * - a 2 s window holding a laugh or a one-word reply plus silence was embedded
 *   whole, so the model saw mostly silence and it read as "someone else";
 * - every same-speaker match was averaged into the reference, so a borderline
 *   match walked the reference toward a new voice and hid a real change.
 */

import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const extractions = vi.hoisted(() => [] as Array<Promise<unknown>>);

vi.mock('../../voice-memory-enhanced.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../voice-memory-enhanced.js')>();
  return {
    ...real,
    extractSpeakerEmbedding: (audio: Float32Array) => {
      const result = real.extractSpeakerEmbedding(audio);
      extractions.push(result);
      return result;
    },
  };
});

import { resetSpeakerEmbeddingWorker } from '../speaker-embedding-worker.js';
import { endHouseholdSession } from '../voice-household.js';
import { SpeakerChangeDetector, type SpeakerChangeEvent } from '../voice-speaker-change.js';
import {
  fakeDetectorInterval,
  RATE,
  replayThroughDetector,
  timeline,
} from './speaker-change-replay.js';
import { useSpeakerModel } from './speaker-model-fixture.js';

const FIXTURE = join(__dirname, 'fixtures', 'waveform-contract.onnx');
const DEVICE = 'fragments-device';

/** A voice: one repeated 20 ms frame whose embedding has cosine `toA` to voice A's. */
function voice(toA: number, seconds: number): Float32Array {
  const frame = new Float32Array(320);
  const other = Math.sqrt(1 - toA * toA);
  for (let i = 0; i < frame.length; i++) {
    // over the first 192 samples sin and cos of 3 cycles are orthogonal, equal norm
    const angle = (2 * Math.PI * 3 * i) / 192;
    frame[i] = 0.2 * (toA * Math.sin(angle) + other * Math.cos(angle));
  }
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = frame[i % frame.length];
  return out;
}

let seed = 7;
const micNoise = (): number => {
  seed = (seed * 16807) % 2147483647;
  return 0.004 * (seed / 2147483647 - 0.5);
};

let detector: SpeakerChangeDetector;
let changes: SpeakerChangeEvent[];

/** Every comparison used the fixture model in the worker, not DSP features. */
async function expectAllNeural(): Promise<void> {
  const results = (await Promise.all(extractions)) as Array<{ method: string } | null>;
  expect(results.map((r) => r?.method)).toEqual(results.map(() => 'neural'));
}

beforeEach(() => {
  useSpeakerModel(FIXTURE);
  fakeDetectorInterval();
  extractions.length = 0;
  detector = new SpeakerChangeDetector(DEVICE);
  changes = [];
  detector.on('speaker_changed', (e: SpeakerChangeEvent) => changes.push(e));
  detector.start('user-1');
});

afterEach(async () => {
  detector.stop();
  endHouseholdSession(DEVICE);
  vi.useRealTimers();
  await resetSpeakerEmbeddingWorker();
  useSpeakerModel(undefined);
});

describe('one caller, short clips between turns', () => {
  it('confirms no change: a laugh or "yeah" padded with silence is not compared alone', async () => {
    const call = timeline(
      16,
      [
        [0, voice(1, 4)], // a turn
        [5, voice(1, 0.4)], // "Yeah." while Ferni talks
        [8.5, voice(1, 0.4)], // "Mm-hmm."
        [10.6, voice(1, 0.5)], // a laugh
        [12.6, voice(1, 3.2)], // the next turn
      ],
      micNoise
    );

    await replayThroughDetector(detector, call, extractions);

    expect(extractions.length).toBeGreaterThanOrEqual(3); // it did compare the voice
    await expectAllNeural();
    expect(changes).toEqual([]);
  });
});

describe('two callers', () => {
  it('detects a different voice that takes over', async () => {
    const call = timeline(
      14,
      [
        [0, voice(1, 4)],
        [5, voice(0.1, 9)],
      ],
      micNoise
    );

    await replayThroughDetector(detector, call, extractions);

    await expectAllNeural();
    expect(changes).toHaveLength(1);
    expect(changes[0].confidence).toBeGreaterThan(detector.getChangeConfidenceThreshold());
  });

  it('detects a similar voice: a borderline match does not drag the reference to it', async () => {
    // Measured with ECAPA (2026-10-04): the first comparison after a switch
    // often mixes both voices and scores ~0.5-0.6 (still "same"); the new
    // voice alone then scores ~0.35 against the caller's reference.
    const call = timeline(
      12,
      [
        [0, voice(1, 4)],
        [4, voice(0.5, 2)],
        [6, voice(0.35, 6)],
      ],
      micNoise
    );

    await replayThroughDetector(detector, call, extractions);

    await expectAllNeural();
    expect(changes).toHaveLength(1);
  });
});
