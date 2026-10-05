/**
 * Voice re-enrollment, server → web, real code on both sides.
 *
 * Every voice print enrolled before the neural speaker model is DSP, and DSP
 * prints can no longer verify anyone (voice-match-trust). The server's real
 * /api/voice routes answer the web's real voice-auth service (voiceApiFetch).
 * The doubles: Firebase (unavailable, so profiles live in the store's memory
 * cache), the signed-in uid, the microphone, and the liveness check. Liveness
 * refuses these samples (and, in practice, real ones: see
 * voice-enrollment-refused.contract.test.ts); here it is held at "live" so the
 * re-enrollment path itself can be tested.
 * The neural model is #280's waveform-contract fixture in its real worker.
 */

import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const unavailable = (): never => {
    throw new Error('no Firebase in this test');
  };
  return { default: { apps: [], initializeApp: unavailable, firestore: unavailable } };
});
// No Redis either: enrollment sessions use the handlers' in-memory fallback.
vi.mock('../../../../src/memory/redis-cache.js', () => ({ getRedisCache: () => null }));
vi.mock('../../../../src/services/voice/voice-liveness.js', () => ({
  checkLiveness: async () => ({ isLive: true, confidence: 1, warnings: [] }),
}));

import { verifyUser } from '../../../../src/services/voice/voice-enrollment.js';
import {
  deleteVoiceProfile,
  loadVoiceProfile,
} from '../../../../src/services/voice/voice-profile-store.js';
import { resetSpeakerEmbeddingWorker } from '../../../../src/services/voice/speaker-embedding-worker.js';
import {
  resetIPRateLimit,
  resetUserRateLimit,
} from '../../../../src/services/voice/voice-rate-limit.js';
import { useSpeakerModel } from '../../../../src/services/voice/__tests__/speaker-model-fixture.js';

import { setLocale } from '../../src/i18n/index.js';
import { getVoiceAuthService } from '../../src/services/voice-auth.service.js';
import { showVoiceEnrollmentModal } from '../../src/ui/voice-enrollment.ui.js';
import {
  VOICE_REENROLL_ANSWERED_KEY,
  offerVoiceReenroll,
} from '../../src/ui/voice-reenroll-card.ui.js';
import { speech, voiceApiFetch } from './voice-api-bridge.js';

// Worker start-up plus a real enrollment per test: give a loaded machine room.
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });

const USER = 'user-reenroll-contract';
const NEURAL_FIXTURE = join(
  __dirname,
  '../../../../src/services/voice/__tests__/fixtures/waveform-contract.onnx'
);

const SAMPLES = [speech(1), speech(2), speech(3)];

/** The web's real enrollment calls; only the microphone is a double. */
async function enrollThroughWeb(): Promise<{ started: boolean; completed: boolean }> {
  const voiceAuth = getVoiceAuthService();
  const start = await voiceAuth.startEnrollment(SAMPLES.length);
  if (!start.success) return { started: false, completed: false };
  const recorder = voiceAuth.getRecorder();
  vi.spyOn(recorder, 'startRecording').mockResolvedValue();
  for (const sample of SAMPLES) {
    vi.spyOn(recorder, 'stopRecording').mockReturnValueOnce(sample);
    // eslint-disable-next-line no-await-in-loop -- samples are sequential, like the UI
    const added = await voiceAuth.recordEnrollmentSample(0.001);
    expect(added.success).toBe(true);
  }
  return { started: true, completed: (await voiceAuth.completeEnrollment()).success };
}

async function useModel(path: string | undefined): Promise<void> {
  await resetSpeakerEmbeddingWorker();
  useSpeakerModel(path);
}

function card(): HTMLElement | null {
  return document.querySelector('.voice-reenroll-card');
}

beforeAll(async () => {
  await setLocale('en-US');
});

beforeEach(async () => {
  // Each test enrolls up to twice; the per-minute limits are not under test.
  resetUserRateLimit(USER);
  resetIPRateLimit('127.0.0.1');
  vi.stubGlobal('fetch', vi.fn(voiceApiFetch(USER)));
  await deleteVoiceProfile(USER);
  // Everyone in production today: a DSP voice print from before the model.
  await useModel(undefined);
  expect(await enrollThroughWeb()).toEqual({ started: true, completed: true });
  expect((await loadVoiceProfile(USER))?.embeddingMethod).toBe('dsp');
});

afterEach(async () => {
  card()?.remove();
  await useModel(undefined);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('needsReenrollment from GET /api/voice/profile into the web card', () => {
  it('DSP print with the neural model running: the card offers a fresh one', async () => {
    await useModel(NEURAL_FIXTURE);
    const profile = await getVoiceAuthService().getProfile();
    expect(profile.needsReenrollment).toBe(true);

    const start = vi.fn();
    expect(offerVoiceReenroll(profile, start)).toBe(true);
    expect(card()?.querySelector('h3')?.textContent).toBe(
      "I've gotten better at recognizing voices"
    );
    expect(card()?.textContent).toContain('It takes about 20 seconds.');

    card()?.querySelector<HTMLElement>('[data-action="accept"]')?.click();
    expect(start).toHaveBeenCalledTimes(1);
    expect(card()).toBeNull();
  });

  it('"Sure" opens the enrollment modal ready to record, not "I already know your voice"', async () => {
    await useModel(NEURAL_FIXTURE);
    const profile = await getVoiceAuthService().getProfile();
    offerVoiceReenroll(profile, () => void showVoiceEnrollmentModal());
    card()?.querySelector<HTMLElement>('[data-action="accept"]')?.click();

    await vi.waitFor(() => expect(document.querySelector('#btn-start')).not.toBeNull());
    const modal = document.querySelector('.voice-enrollment-modal');
    expect(modal?.querySelector('.voice-enrollment-enrolled')).toBeNull();
    expect(modal?.querySelector('.voice-enrollment-description')?.textContent).toContain(
      'Mind if I learn yours again?'
    );
    await getVoiceAuthService().cancelEnrollment();
    document.querySelector('.voice-enrollment-modal')?.remove();
  });

  it('no neural model here: no card, and enrolling again is refused (it would be DSP again)', async () => {
    const profile = await getVoiceAuthService().getProfile();
    expect(profile.enrolled).toBe(true);
    expect(profile.needsReenrollment).toBe(false);
    expect(offerVoiceReenroll(profile, vi.fn())).toBe(false);
    expect(card()).toBeNull();
    expect((await getVoiceAuthService().startEnrollment(3)).success).toBe(false);
  });

  it('"Not now" is remembered: the card does not come back', async () => {
    await useModel(NEURAL_FIXTURE);
    const profile = await getVoiceAuthService().getProfile();
    expect(offerVoiceReenroll(profile, vi.fn())).toBe(true);

    card()?.querySelector<HTMLElement>('[data-action="dismiss"]')?.click();
    expect(card()).toBeNull();
    expect(localStorage.getItem(VOICE_REENROLL_ANSWERED_KEY)).toBe('dismissed');
    expect(offerVoiceReenroll(await getVoiceAuthService().getProfile(), vi.fn())).toBe(false);
    expect(card()).toBeNull();
  });
});

describe('re-enrolling through the real enrollment flow', () => {
  it('replaces the DSP print with a neural one that verifies, and the card stops', async () => {
    await useModel(NEURAL_FIXTURE);
    const before = await loadVoiceProfile(USER);
    expect(before?.embeddingMethod).toBe('dsp');
    expect((await verifyUser(SAMPLES[0] as Float32Array, before!)).verified).toBe(false);

    expect(await enrollThroughWeb()).toEqual({ started: true, completed: true });

    const after = await loadVoiceProfile(USER);
    expect(after?.embeddingMethod).toBe('neural');
    const check = await verifyUser(SAMPLES[0] as Float32Array, after!);
    expect(check.verified).toBe(true);
    expect(check.userId).toBe(USER);

    const profile = await getVoiceAuthService().getProfile();
    expect(profile.needsReenrollment).toBe(false);
    expect(offerVoiceReenroll(profile, vi.fn())).toBe(false);
  });

  it('keeps the old print when the model goes away mid-enrollment (no DSP-for-DSP swap)', async () => {
    await useModel(NEURAL_FIXTURE);
    const before = await loadVoiceProfile(USER);
    const voiceAuth = getVoiceAuthService();
    expect((await voiceAuth.startEnrollment(SAMPLES.length)).success).toBe(true);

    await useModel(undefined); // samples from here on are DSP
    const recorder = voiceAuth.getRecorder();
    vi.spyOn(recorder, 'startRecording').mockResolvedValue();
    for (const sample of SAMPLES) {
      vi.spyOn(recorder, 'stopRecording').mockReturnValueOnce(sample);
      // eslint-disable-next-line no-await-in-loop -- sequential, like the UI
      await voiceAuth.recordEnrollmentSample(0.001);
    }
    const done = await voiceAuth.completeEnrollment();

    expect(done.success).toBe(false);
    expect(done.error).toBe('Voice model unavailable');
    const kept = await loadVoiceProfile(USER);
    expect(kept?.enrolledAt).toEqual(before?.enrolledAt);
    expect(kept?.centroid).toEqual(before?.centroid);
  });
});
