/**
 * TTS Cache Tests
 *
 * Comprehensive tests for the unified TTS cache.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TTSCache,
  DelegatingTTSCache,
  createTTSCache,
  createDelegatingTTSCache,
} from '../../../services/tts/tts-cache.js';
import type { ITTSCache, CacheEntry, SSMLProsodyConfig } from '../types.js';

describe('TTSCache', () => {
  let cache: ITTSCache;

  beforeEach(() => {
    cache = createTTSCache({
      maxEntries: 10,
      ttlMs: 60000, // 1 minute
      maxAudioSizeBytes: 1024 * 1024, // 1MB
    });
  });

  afterEach(async () => {
    await cache.clear();
  });

  // ==========================================================================
  // BASIC OPERATIONS
  // ==========================================================================

  describe('basic operations', () => {
    it('stores and retrieves audio', async () => {
      const audio = new ArrayBuffer(100);
      const voiceId = 'test-voice';
      const text = 'Hello world';
      const durationMs = 1000;

      await cache.set(text, voiceId, audio, durationMs);

      const result = await cache.get(text, voiceId);

      expect(result).not.toBeNull();
      expect(result?.audio.byteLength).toBe(100);
      expect(result?.durationMs).toBe(1000);
      expect(result?.voiceId).toBe(voiceId);
    });

    it('returns null for cache miss', async () => {
      const result = await cache.get('nonexistent', 'test-voice');

      expect(result).toBeNull();
    });

    it('reports cache hit/miss stats', async () => {
      const audio = new ArrayBuffer(100);

      // Miss
      await cache.get('text1', 'voice');

      // Set and hit
      await cache.set('text2', 'voice', audio, 1000);
      await cache.get('text2', 'voice');
      await cache.get('text2', 'voice');

      const stats = cache.getStats();

      expect(stats.lookups).toBe(3);
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(2);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('has() returns correct values', async () => {
      const audio = new ArrayBuffer(100);

      expect(await cache.has('text', 'voice')).toBe(false);

      await cache.set('text', 'voice', audio, 1000);

      expect(await cache.has('text', 'voice')).toBe(true);
    });

    it('delete() removes entries', async () => {
      const audio = new ArrayBuffer(100);

      await cache.set('text', 'voice', audio, 1000);
      expect(await cache.has('text', 'voice')).toBe(true);

      await cache.delete('text', 'voice');
      expect(await cache.has('text', 'voice')).toBe(false);
    });

    it('clear() removes all entries', async () => {
      const audio = new ArrayBuffer(100);

      await cache.set('text1', 'voice', audio, 1000);
      await cache.set('text2', 'voice', audio, 1000);

      let stats = cache.getStats();
      expect(stats.size).toBe(2);

      await cache.clear();

      stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.lookups).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // ==========================================================================
  // PROSODY-AWARE CACHING
  // ==========================================================================

  describe('prosody-aware caching', () => {
    it('caches different prosody configs separately', async () => {
      const audio1 = new Uint8Array([1, 2, 3]).buffer;
      const audio2 = new Uint8Array([4, 5, 6]).buffer;
      const text = 'Hello';
      const voiceId = 'test-voice';

      const prosody1: SSMLProsodyConfig = { speed: 0.9 };
      const prosody2: SSMLProsodyConfig = { speed: 1.1 };

      await cache.set(text, voiceId, audio1, 1000, prosody1);
      await cache.set(text, voiceId, audio2, 1000, prosody2);

      const result1 = await cache.get(text, voiceId, prosody1);
      const result2 = await cache.get(text, voiceId, prosody2);

      expect(result1?.audio.byteLength).toBe(3);
      expect(result2?.audio.byteLength).toBe(3);

      // Verify they're different entries
      expect(new Uint8Array(result1!.audio)[0]).toBe(1);
      expect(new Uint8Array(result2!.audio)[0]).toBe(4);
    });

    it('stores prosody config with entry', async () => {
      const audio = new ArrayBuffer(100);
      const prosody: SSMLProsodyConfig = {
        speed: 0.9,
        volume: 1.2,
        emotion: 'happiness',
        emotionIntensity: 0.7,
      };

      await cache.set('text', 'voice', audio, 1000, prosody);

      const result = await cache.get('text', 'voice', prosody);

      expect(result?.prosody).toEqual(prosody);
    });

    it('treats undefined prosody differently from default prosody', async () => {
      const audio1 = new Uint8Array([1]).buffer;
      const audio2 = new Uint8Array([2]).buffer;

      await cache.set('text', 'voice', audio1, 1000); // No prosody
      await cache.set('text', 'voice', audio2, 1000, { speed: 1.0 }); // Default speed

      const result1 = await cache.get('text', 'voice');
      const result2 = await cache.get('text', 'voice', { speed: 1.0 });

      // Should be different cache entries
      expect(new Uint8Array(result1!.audio)[0]).toBe(1);
      expect(new Uint8Array(result2!.audio)[0]).toBe(2);
    });
  });

  // ==========================================================================
  // CACHE KEY NORMALIZATION
  // ==========================================================================

  describe('cache key normalization', () => {
    it('normalizes text for cache key', async () => {
      const audio = new ArrayBuffer(100);

      await cache.set('Hello World', 'voice', audio, 1000);

      // Should find with different case
      const result = await cache.get('hello world', 'voice');

      expect(result).not.toBeNull();
    });

    it('collapses whitespace in cache key', async () => {
      const audio = new ArrayBuffer(100);

      await cache.set('Hello   World', 'voice', audio, 1000);

      const result = await cache.get('Hello World', 'voice');

      expect(result).not.toBeNull();
    });

    it('trims whitespace in cache key', async () => {
      const audio = new ArrayBuffer(100);

      await cache.set('  Hello World  ', 'voice', audio, 1000);

      const result = await cache.get('Hello World', 'voice');

      expect(result).not.toBeNull();
    });
  });

  // ==========================================================================
  // SIZE LIMITS
  // ==========================================================================

  describe('size limits', () => {
    it('does not cache audio exceeding max size', async () => {
      // Create cache with small limit
      const smallCache = createTTSCache({
        maxAudioSizeBytes: 100,
      });

      const largeAudio = new ArrayBuffer(200);

      await smallCache.set('text', 'voice', largeAudio, 1000);

      const result = await smallCache.get('text', 'voice');

      expect(result).toBeNull();
    });

    it('does not cache empty audio', async () => {
      const emptyAudio = new ArrayBuffer(0);

      await cache.set('text', 'voice', emptyAudio, 0);

      const result = await cache.get('text', 'voice');

      expect(result).toBeNull();
    });

    it('evicts old entries when max entries exceeded', async () => {
      // Cache with max 3 entries
      const smallCache = createTTSCache({ maxEntries: 3 });
      const audio = new ArrayBuffer(10);

      await smallCache.set('text1', 'voice', audio, 100);
      await smallCache.set('text2', 'voice', audio, 100);
      await smallCache.set('text3', 'voice', audio, 100);

      // Access text1 to make it recently used
      await smallCache.get('text1', 'voice');

      // Add new entry - should evict text2 (least recently used)
      await smallCache.set('text4', 'voice', audio, 100);

      expect(await smallCache.has('text1', 'voice')).toBe(true);
      expect(await smallCache.has('text4', 'voice')).toBe(true);
      // text2 should be evicted
      expect(await smallCache.has('text2', 'voice')).toBe(false);
    });
  });

  // ==========================================================================
  // HIT COUNTING
  // ==========================================================================

  describe('hit counting', () => {
    it('increments hitCount on each access', async () => {
      const audio = new ArrayBuffer(100);

      await cache.set('text', 'voice', audio, 1000);

      let result = await cache.get('text', 'voice');
      expect(result?.hitCount).toBe(1);

      result = await cache.get('text', 'voice');
      expect(result?.hitCount).toBe(2);

      result = await cache.get('text', 'voice');
      expect(result?.hitCount).toBe(3);
    });
  });

  // ==========================================================================
  // MEMORY TRACKING
  // ==========================================================================

  describe('memory tracking', () => {
    it('tracks memory usage', async () => {
      const audio1 = new ArrayBuffer(100);
      const audio2 = new ArrayBuffer(200);

      await cache.set('text1', 'voice', audio1, 1000);
      await cache.set('text2', 'voice', audio2, 1000);

      const stats = cache.getStats();

      expect(stats.memoryBytes).toBe(300);
    });

    it('updates memory on entry removal', async () => {
      const audio = new ArrayBuffer(100);

      await cache.set('text', 'voice', audio, 1000);

      let stats = cache.getStats();
      expect(stats.memoryBytes).toBe(100);

      await cache.delete('text', 'voice');

      stats = cache.getStats();
      expect(stats.memoryBytes).toBe(0);
    });
  });
});

// ==========================================================================
// DELEGATING CACHE
// ==========================================================================

describe('DelegatingTTSCache', () => {
  it('falls back to legacy cache on miss', async () => {
    const legacyAudio = new Uint8Array([1, 2, 3]).buffer;

    const legacyLookup = vi.fn().mockImplementation(async (text: string) => {
      if (text === 'legacy-text') {
        return { audio: legacyAudio, durationMs: 1000 };
      }
      return null;
    });

    const cache = createDelegatingTTSCache({}, legacyLookup);

    const result = await cache.get('legacy-text', 'voice');

    expect(result).not.toBeNull();
    expect(result?.audio.byteLength).toBe(3);
    expect(legacyLookup).toHaveBeenCalledWith('legacy-text', 'voice');
  });

  it('does not call legacy for prosody-aware lookups', async () => {
    const legacyLookup = vi.fn().mockResolvedValue({
      audio: new ArrayBuffer(10),
      durationMs: 100,
    });

    const cache = createDelegatingTTSCache({}, legacyLookup);

    // Lookup with prosody - should NOT fall back to legacy
    await cache.get('text', 'voice', { speed: 0.9 });

    expect(legacyLookup).not.toHaveBeenCalled();
  });

  it('stores legacy results in primary cache', async () => {
    const legacyAudio = new ArrayBuffer(10);
    const legacyLookup = vi.fn().mockResolvedValue({
      audio: legacyAudio,
      durationMs: 100,
    });

    const cache = createDelegatingTTSCache({}, legacyLookup);

    // First lookup - hits legacy
    await cache.get('text', 'voice');
    expect(legacyLookup).toHaveBeenCalledTimes(1);

    // Second lookup - should hit primary cache
    await cache.get('text', 'voice');
    expect(legacyLookup).toHaveBeenCalledTimes(1); // Not called again
  });

  it('handles legacy lookup errors gracefully', async () => {
    const legacyLookup = vi.fn().mockRejectedValue(new Error('Legacy error'));

    const cache = createDelegatingTTSCache({}, legacyLookup);

    const result = await cache.get('text', 'voice');

    expect(result).toBeNull(); // Should not throw
  });
});
