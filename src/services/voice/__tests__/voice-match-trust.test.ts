/**
 * Voice verification fails closed: the production enrollment / verification /
 * identification / continuous-auth functions with the real extractor.
 *
 * DSP voice features give every voice a cosine near 0.999 to every profile,
 * so before this rule a different person verified as the enrolled user. Only a
 * neural embedding against a neural-enrolled profile may count as a match, and
 * a chunk with no usable voice print is 'unknown', never the previous status.
 */

import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ContinuousAuthenticator,
  addEnrollmentSample,
  completeEnrollment,
  identifySpeaker,
  startEnrollmentSession,
  verifyUser,
  type VoiceProfile,
} from '../voice-enrollment.js';
import { resetSpeakerEmbeddingWorker } from '../speaker-embedding-worker.js';

const NEURAL_FIXTURE = join(__dirname, 'fixtures', 'waveform-contract.onnx');

/** 1.5 s of a voiced sound: fundamental `hz` plus two harmonics. */
function voice(hz: number, phase = 0): Float32Array {
  const a = new Float32Array(24000);
  for (let i = 0; i < a.length; i++) {
    const t = i / 16000;
    const w = 2 * Math.PI * hz * t + phase;
    a[i] = 0.3 * Math.sin(w) + 0.15 * Math.sin(2 * w) + 0.05 * Math.sin(3 * w);
  }
  return a;
}

async function enroll(userId: string, samples: Float32Array[]): Promise<VoiceProfile> {
  const session = startEnrollmentSession(userId, { requiredSamples: samples.length });
  for (const s of samples) {
    // eslint-disable-next-line no-await-in-loop -- enrollment samples are sequential
    const added = await addEnrollmentSample(session, s);
    expect(added.success).toBe(true);
  }
  const done = await completeEnrollment(session);
  expect(done.success).toBe(true);
  return done.profile as VoiceProfile;
}

afterEach(async () => {
  await resetSpeakerEmbeddingWorker();
  delete process.env.SPEAKER_MODEL_PATH;
});

describe('with DSP voice features (no neural model)', () => {
  it('does not verify a different person as the enrolled user', async () => {
    const alice = await enroll('alice', [voice(120), voice(120, 0.5), voice(120, 1)]);

    const bob = await verifyUser(voice(220), alice);

    expect(bob.verified).toBe(false);
    expect(bob.confidence).toBe(0);
    expect(bob.userId).toBeUndefined();
    expect(alice.embeddingMethod).toBe('dsp');
  });

  it('does not identify anyone', async () => {
    const alice = await enroll('alice', [voice(120), voice(120, 0.5), voice(120, 1)]);
    const result = await identifySpeaker(voice(220), [alice]);
    expect(result.identified).toBe(false);
    expect(result.userId).toBeUndefined();
  });

  it('continuous auth reports unknown, not verified', async () => {
    const alice = await enroll('alice', [voice(120), voice(120, 0.5), voice(120, 1)]);
    const auth = new ContinuousAuthenticator(alice);
    const status = await auth.processAudioChunk(voice(220));
    expect(status.status).toBe('unknown');
    expect(status.confidence).toBe(0);
  });
});

describe('with the neural model', () => {
  it('still verifies the enrolled voice against a neural profile', async () => {
    process.env.SPEAKER_MODEL_PATH = NEURAL_FIXTURE;
    const sample = voice(120);
    const alice = await enroll('alice', [sample, sample, sample]);
    expect(alice.embeddingMethod).toBe('neural');

    const again = await verifyUser(sample, alice);
    expect(again.verified).toBe(true);
    expect(again.userId).toBe('alice');
  });

  it('refuses a profile enrolled before methods were recorded (DSP vectors)', async () => {
    process.env.SPEAKER_MODEL_PATH = NEURAL_FIXTURE;
    const sample = voice(120);
    const alice = await enroll('alice', [sample, sample, sample]);
    const legacy: VoiceProfile = { ...alice, embeddingMethod: undefined };

    expect((await verifyUser(sample, legacy)).verified).toBe(false);
    expect((await identifySpeaker(sample, [legacy])).identified).toBe(false);
  });

  it('continuous auth does not repeat a stale "verified" when a chunk has no voice print', async () => {
    process.env.SPEAKER_MODEL_PATH = NEURAL_FIXTURE;
    const sample = voice(120);
    const alice = await enroll('alice', [sample, sample, sample]);
    const auth = new ContinuousAuthenticator(alice);

    expect((await auth.processAudioChunk(sample)).status).toBe('verified');
    const next = await auth.processAudioChunk(new Float32Array(4000)); // too short to embed
    expect(next.status).toBe('unknown');
    expect(next.confidence).toBe(0);
    expect(auth.getStatus().status).toBe('unknown');
  });
});
