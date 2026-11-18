/**
 * A consented clone is never localized: POST /voices/localize creates a new
 * voice derived from the original, which no voice policy knows about. With
 * Seth's clone configured, every accent gets the original voice back, Cartesia
 * is never called and nothing is cached. The voice id here is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => {
    throw new Error('no Firestore in this test');
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const {
  clearLocalizationCache,
  getLocalizationCacheStats,
  getLocalizedVoiceId,
  getLocalizedVoiceIdSync,
} = await import('../voice/cartesia-voice-localization.js');

describe('localizing a consented clone', () => {
  beforeEach(async () => {
    await clearLocalizationCache();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'derived-from-seth',
        name: 'Seth (british)',
        description: 'Localized voice',
        language: 'en',
        created_at: '2026-11-18T00:00:00Z',
      }),
    });
    vi.stubEnv('CARTESIA_API_KEY', 'test-api-key');
    vi.stubEnv('SETH_TEAMMATE', 'on');
    vi.stubEnv('ROSTER_VOICE_SETH', 'fake-seth-id');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the original voice for every accent and never calls Cartesia', async () => {
    for (const accent of ['british', 'australian', 'indian'] as const) {
      const result = await getLocalizedVoiceId('seth', accent);
      expect(result.voiceId).toBe('fake-seth-id');
      expect(result.isLocalized).toBe(false);
    }
    expect(mockFetch).not.toHaveBeenCalled();
    expect(getLocalizationCacheStats().size).toBe(0);
  });

  it('returns the original voice from the sync lookup too, after an async request', async () => {
    await getLocalizedVoiceId('seth', 'british');
    expect(getLocalizedVoiceIdSync('seth', 'british')).toBe('fake-seth-id');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('ignores a cached localization of a voice that is now a consented clone', async () => {
    // Cache a localization while the voice is not yet a consented clone.
    vi.stubEnv('ROSTER_VOICE_SETH', '');
    vi.stubEnv('LEGEND_VOICE_JOHN_BOGLE', '');
    const { getVoiceIdForPersona } = await import('../../config/voice-ids.js');
    const ferniVoice = getVoiceIdForPersona('ferni');
    await getLocalizedVoiceId('ferni', 'british');
    expect(getLocalizedVoiceIdSync('ferni', 'british')).toBe('derived-from-seth');
    // Now that voice is configured as a consented clone: the cached derivative is never served.
    vi.stubEnv('ROSTER_VOICE_SETH', ferniVoice);
    mockFetch.mockClear();
    expect(getLocalizedVoiceIdSync('ferni', 'british')).toBe(ferniVoice);
    expect((await getLocalizedVoiceId('ferni', 'british')).voiceId).toBe(ferniVoice);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
