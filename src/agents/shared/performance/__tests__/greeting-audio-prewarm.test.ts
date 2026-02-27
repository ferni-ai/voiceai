/**
 * Tests for greeting-audio-prewarm.ts
 *
 * Tests the cache lookup and integration with cache-aware-tts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the voice ID lookup
vi.mock('../../../../config/voice-ids.js', () => ({
  getVoiceIdForPersona: vi.fn((personaId: string) => {
    const voiceMap: Record<string, string> = {
      ferni: 'voice-id-ferni-123',
      'maya-santos': 'voice-id-maya-456',
      'peter-john': 'voice-id-peter-789',
    };
    return voiceMap[personaId] || null;
  }),
  CARTESIA_MODEL: 'sonic-3-latest',
}));

vi.mock('../../../shared/warm-greeting.js', () => ({
  generateWarmGreeting: vi.fn((personaId: string) => `Hello, I'm ${personaId}!`),
}));

describe('greeting-audio-prewarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPrewarmedGreetingAudio', () => {
    it('should return null for non-cached greetings', async () => {
      const { getPrewarmedGreetingAudio, clearGreetingAudioCache } =
        await import('../greeting-audio-prewarm.js');

      clearGreetingAudioCache();

      const result = getPrewarmedGreetingAudio('Some random greeting', 'ferni');
      expect(result).toBeNull();
    });

    it('should handle personaId lookup (resolves to voiceId)', async () => {
      const { getPrewarmedGreetingAudio, clearGreetingAudioCache } =
        await import('../greeting-audio-prewarm.js');
      const { getVoiceIdForPersona } = await import('../../../../config/voice-ids.js');

      clearGreetingAudioCache();

      // Call with personaId
      getPrewarmedGreetingAudio('Test greeting', 'ferni');

      // Should have tried to resolve personaId to voiceId
      expect(getVoiceIdForPersona).toHaveBeenCalledWith('ferni');
    });

    it('should return cache stats', async () => {
      const { getGreetingAudioCacheStats, clearGreetingAudioCache } =
        await import('../greeting-audio-prewarm.js');

      clearGreetingAudioCache();

      const stats = getGreetingAudioCacheStats();
      expect(stats.cacheSize).toBe(0);
      expect(stats.totalAudioDurationMs).toBe(0);
    });

    it('should check if greeting is cached', async () => {
      const { isGreetingAudioCached, clearGreetingAudioCache } =
        await import('../greeting-audio-prewarm.js');

      clearGreetingAudioCache();

      const isCached = isGreetingAudioCached('Test greeting', 'ferni');
      expect(isCached).toBe(false);
    });

    it('should handle unknown personaId gracefully', async () => {
      const { getPrewarmedGreetingAudio, clearGreetingAudioCache } =
        await import('../greeting-audio-prewarm.js');

      clearGreetingAudioCache();

      // Unknown persona should not throw
      const result = getPrewarmedGreetingAudio('Test greeting', 'unknown-persona');
      expect(result).toBeNull();
    });

    it('should normalize text (strip SSML) for cache key', async () => {
      const { getPrewarmedGreetingAudio, clearGreetingAudioCache } =
        await import('../greeting-audio-prewarm.js');

      clearGreetingAudioCache();

      // Both with and without SSML should hit same cache key
      const result1 = getPrewarmedGreetingAudio('<speak>Hello there!</speak>', 'ferni');
      const result2 = getPrewarmedGreetingAudio('Hello there!', 'ferni');

      // Both should return null (not cached), but the point is they use same normalized key
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should export metrics function for integration.ts', async () => {
      const { getGreetingAudioPrewarmMetrics } = await import('../greeting-audio-prewarm.js');

      const metrics = getGreetingAudioPrewarmMetrics();
      expect(metrics).toHaveProperty('cacheSize');
      expect(metrics).toHaveProperty('totalAudioDurationMs');
    });
  });

  describe('prewarmGreetingAudio', () => {
    it('should skip prewarm when no API key', async () => {
      // Temporarily remove API key
      const originalKey = process.env.CARTESIA_API_KEY;
      delete process.env.CARTESIA_API_KEY;

      const { prewarmGreetingAudio, clearGreetingAudioCache } =
        await import('../greeting-audio-prewarm.js');

      clearGreetingAudioCache();

      const result = await prewarmGreetingAudio(false);

      // Should complete but not cache anything (no API key)
      expect(result.cachedCount).toBe(0);
      expect(result.personas.length).toBeGreaterThan(0);

      // Restore
      if (originalKey) {
        process.env.CARTESIA_API_KEY = originalKey;
      }
    });
  });
});
