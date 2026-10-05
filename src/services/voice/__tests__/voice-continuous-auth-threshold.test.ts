/**
 * Continuous auth called a chunk 'verified' at 90% of the profile's threshold,
 * a lower bar than verifyUser (similarity >= threshold). A chunk now verifies
 * only at the threshold; just under it is 'unknown', not an anomaly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const embed = vi.hoisted(() => ({ next: [1, 0] as number[] }));

vi.mock('../../voice-memory-enhanced.js', () => ({
  extractSpeakerEmbedding: vi.fn(async () => ({
    vector: Float32Array.from(embed.next),
    method: 'neural',
  })),
}));

import { ContinuousAuthenticator } from '../voice-continuous-auth.js';
import type { VoiceProfile } from '../voice-enrollment.js';

const THRESHOLD = 0.6;
const profile = {
  userId: 'owner',
  centroid: [1, 0],
  threshold: THRESHOLD,
  embeddingMethod: 'neural',
} as unknown as VoiceProfile;

/** A unit vector whose cosine with [1, 0] is exactly `cos`. */
function at(cos: number): number[] {
  return [cos, Math.sqrt(1 - cos * cos)];
}

const audio = new Float32Array(16000);

beforeEach(() => {
  embed.next = [1, 0];
});

describe('continuous voice auth uses the same bar as verifyUser', () => {
  it('does not call a match just under the threshold verified', async () => {
    const auth = new ContinuousAuthenticator(profile);
    embed.next = at(THRESHOLD * 0.95);
    const status = await auth.processAudioChunk(audio);
    expect(status.status).not.toBe('verified');
    expect(status.status).toBe('unknown');
    expect(status.anomalyCount).toBe(0);
  });

  it('verifies at the threshold', async () => {
    const auth = new ContinuousAuthenticator(profile);
    embed.next = at(THRESHOLD + 0.01);
    expect((await auth.processAudioChunk(audio)).status).toBe('verified');
  });

  it('still counts a clear mismatch as an anomaly', async () => {
    const auth = new ContinuousAuthenticator(profile);
    embed.next = at(0.2);
    const status = await auth.processAudioChunk(audio);
    expect(status.status).toBe('suspicious');
    expect(status.anomalyCount).toBe(1);
  });
});
