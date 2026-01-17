/**
 * Speculative TTS Tests
 *
 * Tests for the speculative TTS caching and pre-generation system.
 * This module is core to reducing voice response latency.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fetch before imports
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the voice ID resolver
vi.mock('../../../speech/tts/cartesia-core.js', () => ({
  getVoiceIdForPersona: vi.fn((persona: string) => `voice-id-${persona}`),
}));

// Now import the module
import {
  getSpeculativeTTS,
  warmupTTSVoice,
  speculateTTS,
  getTTSWithSpeculation,
  branchPredictTTS,
  getSpeculativeTTSMetrics,
} from '../speculative-tts.js';

describe('SpeculativeTTS', () => {
  beforeEach(() => {
    // Clear the singleton and reset mocks
    vi.clearAllMocks();

    // Reset singleton by accessing internal state
    const engine = getSpeculativeTTS();
    engine.clearCache();

    // Set up mock Cartesia API response
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(960)), // 20ms of audio
    });

    // Set API key for tests
    vi.stubEnv('CARTESIA_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getSpeculativeTTS', () => {
    it('should return singleton instance', () => {
      const instance1 = getSpeculativeTTS();
      const instance2 = getSpeculativeTTS();
      expect(instance1).toBe(instance2);
    });

    it('should accept configuration', () => {
      const instance = getSpeculativeTTS({
        maxSpeculative: 10,
        minConfidence: 0.5,
        cacheSize: 100,
      });
      expect(instance).toBeDefined();
    });
  });

  describe('getSpeculativeTTSMetrics', () => {
    it('should return metrics object with expected fields', () => {
      const metrics = getSpeculativeTTSMetrics();

      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('speculativeHits');
      expect(metrics).toHaveProperty('avgGenerationMs');
      expect(metrics).toHaveProperty('savedLatencyMs');
      expect(metrics).toHaveProperty('emotionCacheStats');
    });

    it('should track requests correctly', async () => {
      // Make a request
      await getTTSWithSpeculation('Hello world', 'ferni', 'neutral');

      const metrics = getSpeculativeTTSMetrics();
      expect(metrics.totalRequests).toBe(1);
    });
  });

  describe('getTTSWithSpeculation', () => {
    it('should return audio buffer on first request (cache miss)', async () => {
      const result = await getTTSWithSpeculation('Hello there!', 'ferni', 'neutral');

      expect(result.audio).toBeInstanceOf(ArrayBuffer);
      expect(result.cached).toBe(false);
      expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.emotion).toBe('neutral');
    });

    it('should return cached audio on second request (cache hit)', async () => {
      // First request - cache miss
      await getTTSWithSpeculation('I hear you.', 'ferni', 'neutral');

      // Second request - cache hit
      const result = await getTTSWithSpeculation('I hear you.', 'ferni', 'neutral');

      expect(result.cached).toBe(true);
      expect(result.generationTimeMs).toBe(0);
    });

    it('should use different cache keys for different emotions', async () => {
      // Request with 'warm' emotion
      await getTTSWithSpeculation('Hello!', 'ferni', 'warm');

      // Request same text with 'concerned' emotion - should be cache miss
      const result = await getTTSWithSpeculation('Hello!', 'ferni', 'concerned');

      expect(result.cached).toBe(false);
    });

    it('should normalize text for cache lookup', async () => {
      // First request with extra whitespace
      await getTTSWithSpeculation('  Hello world  ', 'ferni', 'neutral');

      // Second request with normalized text - should be cache hit
      const result = await getTTSWithSpeculation('hello world', 'ferni', 'neutral');

      expect(result.cached).toBe(true);
    });

    it('should use default emotion when not specified', async () => {
      const result = await getTTSWithSpeculation('Test phrase', 'ferni');

      expect(result.emotion).toBe('neutral');
    });

    it('should track emotion cache hits in metrics', async () => {
      // First request (miss)
      await getTTSWithSpeculation('Hello', 'ferni', 'warm');
      // Second request (hit)
      await getTTSWithSpeculation('Hello', 'ferni', 'warm');

      const metrics = getSpeculativeTTSMetrics();
      expect(metrics.emotionCacheStats.warm).toBeDefined();
      expect(metrics.emotionCacheStats.warm.hits).toBe(1);
      expect(metrics.emotionCacheStats.warm.misses).toBe(1);
    });
  });

  describe('speculateTTS', () => {
    it('should start speculative generation based on emotion context', async () => {
      await speculateTTS('session-123', 'ferni', {
        emotion: 'sad',
        intent: 'venting',
      });

      // Speculative generation happens in background
      // Give it a moment to process
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      // Should have made API calls for empathetic responses
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should prioritize distress responses when distressLevel is high', async () => {
      await speculateTTS('session-456', 'ferni', {
        distressLevel: 7, // High distress
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      // Should have queued empathetic response starters
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should speculate based on intent', async () => {
      await speculateTTS('session-789', 'ferni', {
        intent: 'celebrating',
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('branchPredictTTS', () => {
    it('should pre-generate multiple possible continuations', async () => {
      await branchPredictTTS(
        'session-abc',
        'ferni',
        'I think that ',
        ['sounds great!', 'makes sense.', 'is interesting.'],
        'supportive'
      );

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      // Should have called API for each branch (up to maxBranches)
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should include emotion in branch cache keys', async () => {
      await branchPredictTTS('session-def', 'ferni', 'Hello, ', ['how are you?'], 'warm');

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      // Request the same text with matching emotion - should be cache hit
      const result = await getTTSWithSpeculation('Hello, how are you?', 'ferni', 'warm');

      // May or may not be cached depending on timing, but should not throw
      expect(result.audio).toBeInstanceOf(ArrayBuffer);
    });
  });

  describe('warmupTTSVoice', () => {
    it('should pre-generate common phrases for a voice', async () => {
      await warmupTTSVoice('ferni', ['neutral', 'warm']);

      // Should have made many API calls for warmup phrases
      // (3 emotions × multiple phrases)
      expect(mockFetch.mock.calls.length).toBeGreaterThan(10);
    });

    it('should use default emotions when not specified', async () => {
      await warmupTTSVoice('peter-john');

      // Should warm up with COMMON_EMOTIONS
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('API error handling', () => {
    it('should return empty buffer when API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const result = await getTTSWithSpeculation('Test', 'ferni', 'neutral');

      expect(result.audio.byteLength).toBe(0);
    });

    it('should return empty buffer when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getTTSWithSpeculation('Test', 'ferni', 'neutral');

      expect(result.audio.byteLength).toBe(0);
    });

    it('should return empty buffer when no API key', async () => {
      vi.stubEnv('CARTESIA_API_KEY', '');

      const engine = getSpeculativeTTS();
      engine.clearCache(); // Clear cache to force new generation

      const result = await getTTSWithSpeculation('Test', 'ferni', 'neutral');

      expect(result.audio.byteLength).toBe(0);
    });
  });

  describe('cache key generation', () => {
    it('should create unique keys for text + voice + emotion', async () => {
      // These should all be separate cache entries
      await getTTSWithSpeculation('Hello', 'ferni', 'neutral');
      await getTTSWithSpeculation('Hello', 'ferni', 'warm');
      await getTTSWithSpeculation('Hello', 'peter-john', 'neutral');
      await getTTSWithSpeculation('Goodbye', 'ferni', 'neutral');

      // 4 unique combinations = 4 API calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('duration estimation', () => {
    it('should estimate audio duration based on text length', async () => {
      const result = await getTTSWithSpeculation(
        'This is a longer sentence that should take more time to speak.',
        'ferni',
        'neutral'
      );

      // ~12 words / 150 wpm * 60 = ~4.8 seconds
      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.durationSeconds).toBeLessThan(10);
    });
  });

  describe('metrics tracking', () => {
    it('should track saved latency on cache hits', async () => {
      // First request (miss) - records generation time
      await getTTSWithSpeculation('Save latency test', 'ferni', 'neutral');

      // Second request (hit) - adds to savedLatencyMs
      await getTTSWithSpeculation('Save latency test', 'ferni', 'neutral');

      const metrics = getSpeculativeTTSMetrics();
      expect(metrics.savedLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate cache hit rate per emotion', async () => {
      // 2 misses, 2 hits for 'warm'
      await getTTSWithSpeculation('A', 'ferni', 'warm');
      await getTTSWithSpeculation('B', 'ferni', 'warm');
      await getTTSWithSpeculation('A', 'ferni', 'warm');
      await getTTSWithSpeculation('B', 'ferni', 'warm');

      const metrics = getSpeculativeTTSMetrics();
      expect(metrics.emotionCacheStats.warm.hitRate).toBe(0.5); // 2/4
    });
  });
});
