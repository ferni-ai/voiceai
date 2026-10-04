/**
 * The real SpeakerChangeDetector fed LiveKit-sized frames (10 ms and 20 ms at
 * 16 kHz): it must buffer enough audio to reach the voice-print comparison,
 * detect a change between two synthetic voices, and stay quiet on one steady
 * voice and on silence. Only the embedding extractor is mocked (the neural
 * model is a native module); it maps each synthetic voice to its own vector by
 * pitch, the way a speaker embedding separates two people.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const extract = vi.hoisted(() =>
  vi.fn(async (audio: Float32Array) => {
    let crossings = 0;
    for (let i = 1; i < audio.length; i++) {
      if (audio[i] >= 0 !== audio[i - 1] >= 0) crossings++;
    }
    const pitchHz = (crossings / 2) * (16000 / audio.length);
    const vector = pitchHz < 180 ? [1, 0, 0] : [0, 1, 0];
    return {
      vector: Float32Array.from(vector),
      method: 'dsp',
      confidence: 0.7,
      timestamp: new Date(),
    };
  })
);

vi.mock('../../voice-memory-enhanced.js', () => ({ extractSpeakerEmbedding: extract }));

import { endHouseholdSession } from '../voice-household.js';
import { SpeakerChangeDetector, type SpeakerChangeEvent } from '../voice-speaker-change.js';

const RATE = 16000;
const VOICE_A_HZ = 120;
const VOICE_B_HZ = 240;
const DEVICE = 'buffer-test-device';

let phase = 0;
/** Feed `seconds` of a voice at `hz` in frames of `frameMs`. */
function speak(d: SpeakerChangeDetector, hz: number, seconds: number, frameMs: number): void {
  const frameSamples = (RATE * frameMs) / 1000;
  const frames = Math.round((seconds * 1000) / frameMs);
  for (let f = 0; f < frames; f++) {
    const frame = new Float32Array(frameSamples);
    for (let i = 0; i < frameSamples; i++) {
      frame[i] = 0.2 * Math.sin(phase);
      phase += (2 * Math.PI * hz) / RATE;
    }
    d.feedAudio(frame);
  }
}

function silence(d: SpeakerChangeDetector, seconds: number, frameMs: number): void {
  const frameSamples = (RATE * frameMs) / 1000;
  for (let f = 0; f < (seconds * 1000) / frameMs; f++) d.feedAudio(new Float32Array(frameSamples));
}

/** Audio arrives in real time; the comparison runs on the detector's 2 s interval. */
async function talk(d: SpeakerChangeDetector, hz: number, frameMs: number): Promise<void> {
  speak(d, hz, 2, frameMs);
  await vi.advanceTimersByTimeAsync(2000);
}

let detector: SpeakerChangeDetector;
let changes: SpeakerChangeEvent[];

beforeEach(() => {
  vi.useFakeTimers();
  extract.mockClear();
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

describe.each([10, 20])('%i ms frames', (frameMs) => {
  it('reaches the voice-print comparison', async () => {
    await talk(detector, VOICE_A_HZ, frameMs);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract.mock.calls[0][0].length).toBeGreaterThanOrEqual(RATE); // >= the 1 s minimum
  });

  it('detects a change to a second voice', async () => {
    await talk(detector, VOICE_A_HZ, frameMs); // reference voice
    await talk(detector, VOICE_B_HZ, frameMs); // different (1 of 2, debounce)
    expect(changes).toHaveLength(0);
    await talk(detector, VOICE_B_HZ, frameMs); // different (2 of 2)

    expect(changes).toHaveLength(1);
    expect(changes[0].previousSpeakerId).toBe('user-1');
    expect(changes[0].confidence).toBeGreaterThan(detector.getChangeConfidenceThreshold());
  });

  it('never fires on one steady voice, comparing at most once per 2 s', async () => {
    for (let i = 0; i < 10; i++) await talk(detector, VOICE_A_HZ, frameMs); // 20 s

    expect(changes).toHaveLength(0);
    expect(extract).toHaveBeenCalledTimes(10);
  });
});

it('skips silence instead of comparing it', async () => {
  silence(detector, 2, 10);
  await vi.advanceTimersByTimeAsync(2000);
  expect(extract).not.toHaveBeenCalled();
});
