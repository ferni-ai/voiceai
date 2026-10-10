/**
 * Voice ID: enrolling or deleting the voiceprint tells the indicator.
 *
 * unified-indicator listens for ferni:voice-enrolled / ferni:voice-unenrolled to drop its
 * "verifying" shield, but nothing dispatched them. The real VoiceAuthService runs against a
 * mocked fetch (the /api/voice routes); the test listens where the indicator does (window).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  getApiHeadersAsync: vi.fn(async () => ({})),
}));

const { getVoiceAuthService } = await import('../../src/services/voice-auth.service.js');

function mockApi(status: number, body: unknown): void {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status })
  ) as typeof fetch;
}

const PROFILE = { userId: 'u1', qualityScore: 0.9, threshold: 0.7, sampleCount: 5 };

describe('voice profile events', () => {
  const enrolled = vi.fn();
  const unenrolled = vi.fn();

  beforeEach(() => {
    enrolled.mockClear();
    unenrolled.mockClear();
    window.addEventListener('ferni:voice-enrolled', enrolled);
    window.addEventListener('ferni:voice-unenrolled', unenrolled);
  });

  afterEach(() => {
    window.removeEventListener('ferni:voice-enrolled', enrolled);
    window.removeEventListener('ferni:voice-unenrolled', unenrolled);
  });

  it('announces ferni:voice-enrolled when enrollment completes', async () => {
    mockApi(200, { success: true, message: 'ok', profile: PROFILE });
    expect(enrolled).not.toHaveBeenCalled();

    const result = await getVoiceAuthService().completeEnrollment();

    expect(result.success).toBe(true);
    expect(enrolled).toHaveBeenCalledTimes(1);
    expect(unenrolled).not.toHaveBeenCalled();
  });

  it('stays quiet when enrollment fails', async () => {
    mockApi(500, { error: 'boom' });

    const result = await getVoiceAuthService().completeEnrollment();

    expect(result.success).toBe(false);
    expect(enrolled).not.toHaveBeenCalled();
  });

  it('stays quiet when the server says the enrollment did not succeed', async () => {
    mockApi(200, { success: false, message: 'too noisy', profile: PROFILE });

    await getVoiceAuthService().completeEnrollment();

    expect(enrolled).not.toHaveBeenCalled();
  });

  it('announces ferni:voice-unenrolled when the voiceprint is deleted', async () => {
    mockApi(200, { success: true });

    const deleted = await getVoiceAuthService().deleteProfile();

    expect(deleted).toBe(true);
    expect(unenrolled).toHaveBeenCalledTimes(1);
    expect(enrolled).not.toHaveBeenCalled();
  });

  it('stays quiet when deleting the voiceprint fails', async () => {
    mockApi(500, { error: 'nope' });

    const deleted = await getVoiceAuthService().deleteProfile();

    expect(deleted).toBe(false);
    expect(unenrolled).not.toHaveBeenCalled();
  });
});
