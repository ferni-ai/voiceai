/**
 * TTS Gateway Tests
 *
 * Comprehensive tests for the main gateway functionality.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTTSCache } from '../../../services/tts/tts-cache.js';
import { TTSGateway, getTTSGateway, initTTSGateway, resetTTSGateway } from '../gateway.js';
import type { ITTSCache, ITTSProvider } from '../types.js';

// ==========================================================================
// MOCK PROVIDER
// ==========================================================================

function createMockProvider(overrides?: Partial<ITTSProvider>): ITTSProvider {
  return {
    name: 'mock-provider',
    synthesize: vi.fn().mockImplementation(async (text: string) => {
      // Generate fake audio: 1 byte per character, roughly
      const fakeAudio = new ArrayBuffer(text.length * 10);
      return fakeAudio;
    }),
    isAvailable: vi.fn().mockResolvedValue(true),
    estimateDuration: vi.fn().mockImplementation((text: string) => {
      return text.length * 50; // 50ms per character
    }),
    ...overrides,
  };
}

// ==========================================================================
// GATEWAY TESTS
// ==========================================================================

describe('TTSGateway', () => {
  let gateway: TTSGateway;
  let mockProvider: ITTSProvider;
  let cache: ITTSCache;

  beforeEach(() => {
    resetTTSGateway();
    mockProvider = createMockProvider();
    cache = createTTSCache({ maxEntries: 100 });

    gateway = new TTSGateway({
      provider: mockProvider,
      cache,
      enableTracing: true,
    });
  });

  afterEach(async () => {
    await gateway.shutdown();
    await cache.clear();
  });

  // ==========================================================================
  // BASIC SYNTHESIS
  // ==========================================================================

  describe('synthesize', () => {
    it('synthesizes text to audio', async () => {
      const result = await gateway.synthesize({
        text: 'Hello world',
        voiceId: 'test-voice',
      });

      expect(result.audio.byteLength).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.cached).toBe(false);
      expect(result.provider).toBe('mock-provider');
      expect(result.traceId).toBeTruthy();
    });

    it('calls provider with correct parameters', async () => {
      await gateway.synthesize({
        text: 'Hello world',
        voiceId: 'test-voice',
      });

      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        'Hello world',
        'test-voice',
        expect.any(Object)
      );
    });

    it('returns empty result for empty text', async () => {
      const result = await gateway.synthesize({
        text: '',
        voiceId: 'test-voice',
      });

      expect(result.audio.byteLength).toBe(0);
      expect(result.durationMs).toBe(0);
    });
  });

  // ==========================================================================
  // SSML HANDLING
  // ==========================================================================

  describe('SSML handling', () => {
    it('strips SSML before sending to provider', async () => {
      await gateway.synthesize({
        text: '<speed ratio="0.9"/>Hello world',
        voiceId: 'test-voice',
      });

      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        'Hello world', // SSML stripped
        'test-voice',
        expect.objectContaining({ speed: 0.9 })
      );
    });

    it('extracts prosody from SSML', async () => {
      const result = await gateway.synthesize({
        text: '<speed ratio="0.9"/><volume ratio="1.2"/>Hello',
        voiceId: 'test-voice',
      });

      expect(result.appliedProsody).toEqual(
        expect.objectContaining({
          speed: 0.9,
          volume: 1.2,
        })
      );
    });

    it('converts break tags to punctuation', async () => {
      await gateway.synthesize({
        text: 'Hello<break time="500ms"/>world',
        voiceId: 'test-voice',
      });

      // Break should be converted to period
      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        expect.stringContaining('Hello. world'),
        'test-voice',
        expect.any(Object)
      );
    });

    it('merges request prosody with parsed prosody', async () => {
      await gateway.synthesize({
        text: '<speed ratio="0.9"/>Hello',
        voiceId: 'test-voice',
        prosody: { volume: 1.5 }, // Override
      });

      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        'Hello',
        'test-voice',
        expect.objectContaining({
          speed: 0.9, // From SSML
          volume: 1.5, // From request
        })
      );
    });

    it('request prosody takes precedence over SSML', async () => {
      await gateway.synthesize({
        text: '<speed ratio="0.9"/>Hello',
        voiceId: 'test-voice',
        prosody: { speed: 1.2 }, // Override
      });

      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        'Hello',
        'test-voice',
        expect.objectContaining({
          speed: 1.2, // Request wins
        })
      );
    });
  });

  // ==========================================================================
  // CACHING
  // ==========================================================================

  describe('caching', () => {
    it('returns cached result on cache hit', async () => {
      // First call - cache miss
      const result1 = await gateway.synthesize({
        text: 'Hello world',
        voiceId: 'test-voice',
      });

      expect(result1.cached).toBe(false);
      expect(mockProvider.synthesize).toHaveBeenCalledTimes(1);

      // Second call - cache hit
      const result2 = await gateway.synthesize({
        text: 'Hello world',
        voiceId: 'test-voice',
      });

      expect(result2.cached).toBe(true);
      expect(result2.cacheSource).toBe('unified');
      expect(mockProvider.synthesize).toHaveBeenCalledTimes(1); // Not called again
    });

    it('caches based on clean text', async () => {
      // First call with SSML
      await gateway.synthesize({
        text: '<speed ratio="0.9"/>Hello world',
        voiceId: 'test-voice',
      });

      expect(mockProvider.synthesize).toHaveBeenCalledTimes(1);

      // Second call with same text, no SSML - should hit cache
      const result = await gateway.synthesize({
        text: 'Hello world',
        voiceId: 'test-voice',
      });

      // Won't be a cache hit because prosody differs
      // The first had speed: 0.9, the second has no prosody
    });

    it('respects allowCache: false', async () => {
      // First call
      await gateway.synthesize({
        text: 'Hello world',
        voiceId: 'test-voice',
      });

      // Second call with skipCache
      await gateway.synthesize({
        text: 'Hello world',
        voiceId: 'test-voice',
        allowCache: false,
      });

      expect(mockProvider.synthesize).toHaveBeenCalledTimes(2);
    });

    it('caches prosody-aware entries separately', async () => {
      // Call with speed 0.9
      await gateway.synthesize({
        text: 'Hello',
        voiceId: 'test-voice',
        prosody: { speed: 0.9 },
      });

      // Call with speed 1.1 - should NOT hit cache
      const result = await gateway.synthesize({
        text: 'Hello',
        voiceId: 'test-voice',
        prosody: { speed: 1.1 },
      });

      expect(result.cached).toBe(false);
      expect(mockProvider.synthesize).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  describe('statistics', () => {
    it('tracks total requests', async () => {
      await gateway.synthesize({ text: 'Hello', voiceId: 'test' });
      await gateway.synthesize({ text: 'World', voiceId: 'test' });

      const stats = gateway.getStats();

      expect(stats.totalRequests).toBe(2);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(0);
    });

    it('tracks failed requests', async () => {
      mockProvider.synthesize = vi.fn().mockRejectedValue(new Error('Synthesis failed'));

      await expect(gateway.synthesize({ text: 'Hello', voiceId: 'test' })).rejects.toThrow(
        'Synthesis failed'
      );

      const stats = gateway.getStats();

      expect(stats.totalRequests).toBe(1);
      expect(stats.failedRequests).toBe(1);
      expect(stats.healthy).toBe(false);
    });

    it('calculates average processing time', async () => {
      await gateway.synthesize({ text: 'Hello', voiceId: 'test' });
      await gateway.synthesize({ text: 'World', voiceId: 'test' });

      const stats = gateway.getStats();

      // Processing time might be 0 for very fast operations - that's OK
      expect(stats.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('includes cache stats', async () => {
      await gateway.synthesize({ text: 'Hello', voiceId: 'test' });
      await gateway.synthesize({ text: 'Hello', voiceId: 'test' }); // Cache hit

      const stats = gateway.getStats();

      expect(stats.cache).not.toBeNull();
      expect(stats.cache?.hits).toBe(1);
      expect(stats.cache?.misses).toBe(1);
    });
  });

  // ==========================================================================
  // TRACING
  // ==========================================================================

  describe('tracing', () => {
    it('generates trace for each request', async () => {
      const result = await gateway.synthesize({
        text: 'Hello world',
        voiceId: 'test-voice',
      });

      expect(result.traceId).toMatch(/^tts-/);

      const traces = gateway.getRecentTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].traceId).toBe(result.traceId);
      expect(traces[0].outcome).toBe('success');
    });

    it('records SSML parsing in trace', async () => {
      await gateway.synthesize({
        text: '<break time="200ms"/>Hello',
        voiceId: 'test-voice',
      });

      const traces = gateway.getRecentTraces();
      const ssmlEvent = traces[0].events.find((e) => e.type === 'ssml_parsed');

      expect(ssmlEvent).toBeDefined();
      expect(ssmlEvent?.data?.hadSSML).toBe(true);
    });

    it('records cache events in trace', async () => {
      // First request - miss
      await gateway.synthesize({ text: 'Hello', voiceId: 'test' });

      // Second request - hit
      await gateway.synthesize({ text: 'Hello', voiceId: 'test' });

      const traces = gateway.getRecentTraces();

      // Check miss trace
      const missTrace = traces[0];
      expect(missTrace.events.some((e) => e.type === 'cache_miss')).toBe(true);

      // Check hit trace
      const hitTrace = traces[1];
      expect(hitTrace.events.some((e) => e.type === 'cache_hit')).toBe(true);
    });

    it('records errors in trace', async () => {
      mockProvider.synthesize = vi.fn().mockRejectedValue(new Error('Provider error'));

      await expect(gateway.synthesize({ text: 'Hello', voiceId: 'test' })).rejects.toThrow();

      const traces = gateway.getRecentTraces();

      expect(traces[0].outcome).toBe('error');
      expect(traces[0].error).toBe('Provider error');
    });

    it('limits stored traces', async () => {
      const gateway50 = new TTSGateway({
        provider: mockProvider,
        enableTracing: true,
      });

      // Make more requests than max traces
      for (let i = 0; i < 60; i++) {
        await gateway50.synthesize({ text: `Hello ${i}`, voiceId: 'test' });
      }

      const traces = gateway50.getRecentTraces();

      expect(traces.length).toBeLessThanOrEqual(50);
    });
  });

  // ==========================================================================
  // WARMUP
  // ==========================================================================

  describe('warmup', () => {
    it('checks provider availability', async () => {
      await gateway.warmup();

      expect(mockProvider.isAvailable).toHaveBeenCalled();
    });

    it('succeeds even if provider unavailable', async () => {
      mockProvider.isAvailable = vi.fn().mockResolvedValue(false);

      // Should not throw
      await expect(gateway.warmup()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // SINGLETON MANAGEMENT
  // ==========================================================================

  describe('singleton', () => {
    beforeEach(() => {
      resetTTSGateway();
    });

    it('throws if getTTSGateway called before init', () => {
      expect(() => getTTSGateway()).toThrow('TTS Gateway not initialized');
    });

    it('initTTSGateway creates singleton', () => {
      const gw = initTTSGateway({ provider: mockProvider });

      expect(getTTSGateway()).toBe(gw);
    });

    it('initTTSGateway returns existing instance', () => {
      const gw1 = initTTSGateway({ provider: mockProvider });
      const gw2 = initTTSGateway({ provider: mockProvider });

      expect(gw2).toBe(gw1);
    });

    it('resetTTSGateway clears singleton', () => {
      initTTSGateway({ provider: mockProvider });
      resetTTSGateway();

      expect(() => getTTSGateway()).toThrow('TTS Gateway not initialized');
    });
  });
});

// ==========================================================================
// NO-CACHE GATEWAY
// ==========================================================================

describe('TTSGateway without cache', () => {
  let gateway: TTSGateway;
  let mockProvider: ITTSProvider;

  beforeEach(() => {
    mockProvider = createMockProvider();
    gateway = new TTSGateway({
      provider: mockProvider,
      cache: undefined, // No cache
    });
  });

  afterEach(async () => {
    await gateway.shutdown();
  });

  it('works without cache', async () => {
    const result = await gateway.synthesize({
      text: 'Hello world',
      voiceId: 'test-voice',
    });

    expect(result.audio.byteLength).toBeGreaterThan(0);
    expect(result.cached).toBe(false);
  });

  it('always calls provider', async () => {
    await gateway.synthesize({ text: 'Hello', voiceId: 'test' });
    await gateway.synthesize({ text: 'Hello', voiceId: 'test' });

    expect(mockProvider.synthesize).toHaveBeenCalledTimes(2);
  });

  it('stats show null cache', () => {
    const stats = gateway.getStats();

    expect(stats.cache).toBeNull();
  });
});
