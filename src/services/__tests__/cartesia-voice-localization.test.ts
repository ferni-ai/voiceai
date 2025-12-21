/**
 * Cartesia Voice Localization Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLocalizationCache,
  getLocalizationCacheStats,
  getLocalizedVoiceId,
  getLocalizedVoiceIdSync,
  isVoiceCached,
} from '../voice/cartesia-voice-localization.js';

// Mock fetch for Cartesia API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the voice-ids module
vi.mock('../../config/voice-ids.js', () => ({
  VOICE_IDS: {
    FERNI: 'ferni-voice-id-123',
    PETER_JOHN: 'peter-voice-id-456',
  },
  getVoiceIdForPersona: vi.fn((personaId: string) => {
    const voices: Record<string, string> = {
      ferni: 'ferni-voice-id-123',
      'peter-john': 'peter-voice-id-456',
      'alex-chen': 'alex-voice-id-789',
    };
    return voices[personaId] || 'default-voice-id';
  }),
}));

// Mock environment variable
vi.stubEnv('CARTESIA_API_KEY', 'test-api-key-12345');

describe('Cartesia Voice Localization Service', () => {
  beforeEach(async () => {
    await clearLocalizationCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getLocalizedVoiceId', () => {
    it('should return original voice ID for American accent (no localization needed)', async () => {
      const result = await getLocalizedVoiceId('ferni', 'american');

      expect(result.voiceId).toBe('ferni-voice-id-123');
      expect(result.isLocalized).toBe(false);
      expect(result.accent).toBe('american');
      expect(result.cached).toBe(true);

      // Should NOT call Cartesia API
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call Cartesia API for British accent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'localized-british-ferni-id',
          name: 'Ferni (british)',
          description: 'Localized voice',
          language: 'en',
          created_at: '2024-12-10T00:00:00Z',
        }),
      });

      const result = await getLocalizedVoiceId('ferni', 'british');

      expect(result.voiceId).toBe('localized-british-ferni-id');
      expect(result.isLocalized).toBe(true);
      expect(result.accent).toBe('british');
      expect(result.cached).toBe(false);

      // Verify API was called with correct parameters
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cartesia.ai/voices/localize',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key-12345',
          }),
        })
      );

      // Verify request body
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.voice_id).toBe('ferni-voice-id-123');
      expect(body.dialect).toBe('uk');
      expect(body.language).toBe('en');
    });

    it('should cache localized voice and return from cache on second call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'localized-australian-ferni-id',
          name: 'Ferni (australian)',
          description: 'Localized voice',
          language: 'en',
          created_at: '2024-12-10T00:00:00Z',
        }),
      });

      // First call - should hit API
      const result1 = await getLocalizedVoiceId('ferni', 'australian');
      expect(result1.cached).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await getLocalizedVoiceId('ferni', 'australian');
      expect(result2.voiceId).toBe('localized-australian-ferni-id');
      expect(result2.cached).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, no new API call
    });

    it('should fall back to original voice on API error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await getLocalizedVoiceId('ferni', 'indian');

      // Should return original voice as fallback
      expect(result.voiceId).toBe('ferni-voice-id-123');
      expect(result.isLocalized).toBe(false);
      expect(result.accent).toBe('american'); // Fallback to american
    });

    it('should use correct dialect codes for each accent', async () => {
      const accentsToDialects = [
        { accent: 'british', dialect: 'uk' },
        { accent: 'australian', dialect: 'au' },
        { accent: 'indian', dialect: 'in' },
      ] as const;

      for (const { accent, dialect } of accentsToDialects) {
        await clearLocalizationCache();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: `localized-${accent}-id`,
            name: `Ferni (${accent})`,
            description: 'Localized voice',
            language: 'en',
            created_at: '2024-12-10T00:00:00Z',
          }),
        });

        await getLocalizedVoiceId('ferni', accent);

        const callArgs = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        const body = JSON.parse(callArgs[1].body);
        expect(body.dialect).toBe(dialect);
      }
    });
  });

  describe('getLocalizedVoiceIdSync', () => {
    it('should return original voice ID for American accent', () => {
      const voiceId = getLocalizedVoiceIdSync('ferni', 'american');
      expect(voiceId).toBe('ferni-voice-id-123');
    });

    it('should return cached localized voice if available', async () => {
      // First, cache a localized voice
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'cached-british-voice',
          name: 'Ferni (british)',
          description: 'Localized voice',
          language: 'en',
          created_at: '2024-12-10T00:00:00Z',
        }),
      });

      await getLocalizedVoiceId('ferni', 'british');

      // Now sync version should return cached value
      const voiceId = getLocalizedVoiceIdSync('ferni', 'british');
      expect(voiceId).toBe('cached-british-voice');
    });

    it('should return original voice if not cached (with warning)', () => {
      // Not cached - should return original
      const voiceId = getLocalizedVoiceIdSync('ferni', 'australian');
      expect(voiceId).toBe('ferni-voice-id-123');
    });
  });

  describe('isVoiceCached', () => {
    it('should return true for American accent (always available)', () => {
      expect(isVoiceCached('ferni', 'american')).toBe(true);
    });

    it('should return false for uncached localized voice', () => {
      expect(isVoiceCached('ferni', 'british')).toBe(false);
    });

    it('should return true after voice is cached', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'localized-indian-voice',
          name: 'Ferni (indian)',
          description: 'Localized voice',
          language: 'en',
          created_at: '2024-12-10T00:00:00Z',
        }),
      });

      await getLocalizedVoiceId('ferni', 'indian');

      expect(isVoiceCached('ferni', 'indian')).toBe(true);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'voice-to-clear',
          name: 'Test',
          description: 'Test',
          language: 'en',
          created_at: '2024-12-10T00:00:00Z',
        }),
      });

      await getLocalizedVoiceId('ferni', 'british');
      expect(isVoiceCached('ferni', 'british')).toBe(true);

      await clearLocalizationCache();

      expect(isVoiceCached('ferni', 'british')).toBe(false);
    });

    it('should return correct cache stats', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'british-voice',
            name: 'Ferni (british)',
            description: 'Test',
            language: 'en',
            created_at: '2024-12-10T00:00:00Z',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'australian-voice',
            name: 'Ferni (australian)',
            description: 'Test',
            language: 'en',
            created_at: '2024-12-10T00:00:00Z',
          }),
        });

      await getLocalizedVoiceId('ferni', 'british');
      await getLocalizedVoiceId('ferni', 'australian');

      const stats = getLocalizationCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.entries).toContainEqual({
        personaId: 'ferni',
        accent: 'british',
        voiceId: 'british-voice',
      });
      expect(stats.entries).toContainEqual({
        personaId: 'ferni',
        accent: 'australian',
        voiceId: 'australian-voice',
      });
    });
  });
});
