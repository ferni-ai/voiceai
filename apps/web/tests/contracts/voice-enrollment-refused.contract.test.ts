/**
 * When the server keeps refusing enrollment samples, the web stops asking.
 *
 * The real /enroll/sample route runs the real liveness check. A missing
 * challenge scores 0 and no client sends one, so the four audio checks must
 * average 0.875 to clear the 0.7 bar; the background-noise check wants the
 * quietest windows' energy variance above 0.001, which room noise doesn't
 * reach (measured 0.000000 on synthesized speech, with and without added
 * noise). In practice it refuses every sample, as it does here. The modal
 * used to retry a refused sample forever (i-- on every failure), recording
 * again and again. It now gives up after three refusals in a row, says so,
 * and cancels the server session. Doubles: Firebase, Redis, the signed-in uid
 * and the microphone; recordings are shortened from 3 s to 1 ms.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const unavailable = (): never => {
    throw new Error('no Firebase in this test');
  };
  return { default: { apps: [], initializeApp: unavailable, firestore: unavailable } };
});
vi.mock('../../../../src/memory/redis-cache.js', () => ({ getRedisCache: () => null }));

import { enrollmentSessionsMemory } from '../../../../src/api/voice-auth/helpers.js';
import { deleteVoiceProfile } from '../../../../src/services/voice/voice-profile-store.js';
import {
  resetIPRateLimit,
  resetUserRateLimit,
} from '../../../../src/services/voice/voice-rate-limit.js';

import { setLocale } from '../../src/i18n/index.js';
import { getVoiceAuthService } from '../../src/services/voice-auth.service.js';
import { showVoiceEnrollmentModal } from '../../src/ui/voice-enrollment.ui.js';
import { speech, voiceApiFetch } from './voice-api-bridge.js';

vi.setConfig({ testTimeout: 20_000 });

const USER = 'user-enrollment-refused';

beforeAll(async () => {
  await setLocale('en-US');
});

beforeEach(async () => {
  resetUserRateLimit(USER);
  resetIPRateLimit('127.0.0.1');
  await deleteVoiceProfile(USER);
  vi.stubGlobal('fetch', vi.fn(voiceApiFetch(USER)));
});

afterEach(() => {
  document.querySelectorAll('.voice-enrollment-modal').forEach((el) => el.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('enrollment modal against the real sample route', () => {
  it('gives up after three refused samples instead of recording forever', async () => {
    const voiceAuth = getVoiceAuthService();
    const recorder = voiceAuth.getRecorder();
    vi.spyOn(recorder, 'startRecording').mockResolvedValue();
    vi.spyOn(recorder, 'stopRecording').mockImplementation(() => speech(1));
    const record = voiceAuth.recordEnrollmentSample.bind(voiceAuth);
    const attempts = vi
      .spyOn(voiceAuth, 'recordEnrollmentSample')
      .mockImplementation((_seconds, onProgress) => record(0.001, onProgress));

    await showVoiceEnrollmentModal();
    expect(document.querySelector('#btn-start')).not.toBeNull();
    document.querySelector<HTMLElement>('#btn-start')?.click();

    await vi.waitFor(
      () =>
        expect(document.querySelector('.voice-enrollment-status-title')?.textContent).toBe(
          'Something went wrong'
        ),
      { timeout: 10_000 }
    );
    expect(document.querySelector('.voice-enrollment-status-message')?.textContent).toBe(
      "I couldn't learn your voice just now. Try again later?"
    );
    expect(attempts).toHaveBeenCalledTimes(3);
    const results = await Promise.all(attempts.mock.results.map((r) => r.value));
    expect(results.every((r) => r.success === false && r.error === 'Security check failed')).toBe(
      true
    );
    await vi.waitFor(() => expect(enrollmentSessionsMemory.has(USER)).toBe(false));
  });
});
