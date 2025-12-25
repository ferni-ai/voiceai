/**
 * Cache-Aware TTS Tests
 *
 * Tests for the TTS caching layer that checks speculative cache before Cartesia.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCacheAwareTTSMetrics,
  resetCacheAwareTTSMetrics,
  processTTSWithCache,
  type CacheAwareTTSConfig,
} from '../cache-aware-tts.js';

// Mock the speculative TTS module
vi.mock('../speculative-tts.js', () => ({
  getTTSWithSpeculation: vi.fn(),
}));

import { getTTSWithSpeculation } from '../speculative-tts.js';

const mockedGetTTSWithSpeculation = vi.mocked(getTTSWithSpeculation);

describe('CacheAwareTTS', () => {
  beforeEach(() => {
    resetCacheAwareTTSMetrics();
    vi.clearAllMocks();
  });

  describe('getCacheAwareTTSMetrics', () => {
    it('should return initial metrics with zero values', () => {
      const metrics = getCacheAwareTTSMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.cacheMisses).toBe(0);
      expect(metrics.cacheBypassedSmallText).toBe(0);
      expect(metrics.avgCacheHitLatencyMs).toBe(0);
      expect(metrics.avgCacheMissLatencyMs).toBe(0);
      expect(metrics.totalSavedLatencyMs).toBe(0);
    });
  });

  describe('resetCacheAwareTTSMetrics', () => {
    it('should reset all metrics to zero', async () => {
      // Generate some metrics
      const mockDefaultTTS = vi.fn().mockResolvedValue(
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        })
      );

      mockedGetTTSWithSpeculation.mockResolvedValue({
        audio: new ArrayBuffer(0),
        durationSeconds: 0,
        cached: false,
        generationTimeMs: 100,
      });

      const config: CacheAwareTTSConfig = {
        voiceId: 'ferni',
        emotion: 'neutral',
        sessionId: 'test-session',
      };

      // Make a request to generate metrics
      await processTTSWithCache('Hello world', config, mockDefaultTTS);

      // Verify metrics were updated
      expect(getCacheAwareTTSMetrics().totalRequests).toBe(1);

      // Reset
      resetCacheAwareTTSMetrics();

      // Verify all reset to zero
      const metrics = getCacheAwareTTSMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.cacheMisses).toBe(0);
    });
  });

  describe('processTTSWithCache', () => {
    const config: CacheAwareTTSConfig = {
      voiceId: 'ferni',
      emotion: 'neutral',
      sessionId: 'test-session',
      minCacheCheckLength: 5,
    };

    it('should return cached audio on cache hit', async () => {
      // Create mock audio data (simple PCM)
      const mockAudio = new ArrayBuffer(960); // 20ms at 24kHz

      mockedGetTTSWithSpeculation.mockResolvedValue({
        audio: mockAudio,
        durationSeconds: 0.02,
        cached: true,
        generationTimeMs: 0,
      });

      const mockDefaultTTS = vi.fn();

      const result = await processTTSWithCache('I hear you.', config, mockDefaultTTS);

      // Should return a readable stream
      expect(result).toBeDefined();

      // Default TTS should NOT have been called (cache hit)
      expect(mockDefaultTTS).not.toHaveBeenCalled();

      // Metrics should show cache hit
      const metrics = getCacheAwareTTSMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(0);
    });

    it('should call default TTS on cache miss', async () => {
      mockedGetTTSWithSpeculation.mockResolvedValue({
        audio: new ArrayBuffer(0), // Empty = not cached
        durationSeconds: 0,
        cached: false,
        generationTimeMs: 100,
      });

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const mockDefaultTTS = vi.fn().mockResolvedValue(mockStream);

      const result = await processTTSWithCache('Hello world test phrase', config, mockDefaultTTS);

      // Should return the mock stream
      expect(result).toBe(mockStream);

      // Default TTS should have been called
      expect(mockDefaultTTS).toHaveBeenCalledWith('Hello world test phrase');

      // Metrics should show cache miss
      const metrics = getCacheAwareTTSMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheHits).toBe(0);
    });

    it('should bypass cache for short text', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const mockDefaultTTS = vi.fn().mockResolvedValue(mockStream);

      // Text shorter than minCacheCheckLength
      const result = await processTTSWithCache('Hi', config, mockDefaultTTS);

      // Should return the mock stream directly
      expect(result).toBe(mockStream);

      // Cache lookup should NOT have been attempted
      expect(mockedGetTTSWithSpeculation).not.toHaveBeenCalled();

      // Metrics should show bypass
      const metrics = getCacheAwareTTSMetrics();
      expect(metrics.cacheBypassedSmallText).toBe(1);
    });

    it('should handle cache lookup errors gracefully', async () => {
      mockedGetTTSWithSpeculation.mockRejectedValue(new Error('Cache error'));

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const mockDefaultTTS = vi.fn().mockResolvedValue(mockStream);

      // Should not throw, should fallback to default TTS
      const result = await processTTSWithCache('Test phrase here', config, mockDefaultTTS);

      expect(result).toBe(mockStream);
      expect(mockDefaultTTS).toHaveBeenCalled();
    });

    it('should track saved latency on cache hits', async () => {
      const mockAudio = new ArrayBuffer(960);

      mockedGetTTSWithSpeculation.mockResolvedValue({
        audio: mockAudio,
        durationSeconds: 0.02,
        cached: true,
        generationTimeMs: 0,
      });

      const mockDefaultTTS = vi.fn();

      await processTTSWithCache('I hear you.', config, mockDefaultTTS);

      const metrics = getCacheAwareTTSMetrics();
      // Saved latency should be approximately 300ms (estimated TTS time)
      // minus the actual cache lookup time (very fast, ~0-5ms)
      expect(metrics.totalSavedLatencyMs).toBeGreaterThan(0);
    });

    it('should work with different emotions', async () => {
      const mockAudio = new ArrayBuffer(960);

      mockedGetTTSWithSpeculation.mockResolvedValue({
        audio: mockAudio,
        durationSeconds: 0.02,
        cached: true,
        generationTimeMs: 0,
      });

      const mockDefaultTTS = vi.fn();

      const concernedConfig: CacheAwareTTSConfig = {
        voiceId: 'ferni',
        emotion: 'concerned',
        sessionId: 'test-session',
      };

      await processTTSWithCache('That sounds hard.', concernedConfig, mockDefaultTTS);

      // Verify the emotion was passed to cache lookup
      expect(mockedGetTTSWithSpeculation).toHaveBeenCalledWith(
        'That sounds hard.',
        'ferni',
        'concerned'
      );
    });

    it('should respect enableCache=false', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const mockDefaultTTS = vi.fn().mockResolvedValue(mockStream);

      const disabledConfig: CacheAwareTTSConfig = {
        voiceId: 'ferni',
        emotion: 'neutral',
        sessionId: 'test-session',
        enableCache: false,
      };

      await processTTSWithCache('Hello world', disabledConfig, mockDefaultTTS);

      // Cache lookup should NOT have been attempted
      expect(mockedGetTTSWithSpeculation).not.toHaveBeenCalled();

      // Default TTS should have been called
      expect(mockDefaultTTS).toHaveBeenCalled();
    });
  });

  describe('audio frame conversion', () => {
    it('should produce audio frames from cached audio', async () => {
      // Create mock PCM audio data (20ms at 24kHz, 16-bit mono)
      // 20ms * 24000 samples/sec = 480 samples
      // 480 samples * 2 bytes/sample = 960 bytes
      const mockAudio = new ArrayBuffer(960);
      const view = new Uint8Array(mockAudio);
      // Fill with some non-zero data
      for (let i = 0; i < view.length; i++) {
        view[i] = i % 256;
      }

      mockedGetTTSWithSpeculation.mockResolvedValue({
        audio: mockAudio,
        durationSeconds: 0.02,
        cached: true,
        generationTimeMs: 0,
      });

      const mockDefaultTTS = vi.fn();

      const result = await processTTSWithCache('I hear you.', {
        voiceId: 'ferni',
        emotion: 'neutral',
        sessionId: 'test',
      }, mockDefaultTTS);

      // Read frames from the stream
      const reader = result.getReader();
      const frames: unknown[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        frames.push(value);
      }

      // Should have at least one frame
      expect(frames.length).toBeGreaterThan(0);

      // Each frame should have expected properties
      const firstFrame = frames[0] as { data: Uint8Array; sampleRate: number; channels: number };
      expect(firstFrame.data).toBeInstanceOf(Uint8Array);
      expect(firstFrame.sampleRate).toBe(24000);
      expect(firstFrame.channels).toBe(1);
    });
  });
});
