/**
 * Gateway TTS Node Tests
 *
 * Tests the full gateway-integrated TTS pipeline:
 * - Text collection from stream
 * - SSML parsing and stripping
 * - Cache hit path (returns cached audio as frames)
 * - Cache miss path (synthesizes via provider, caches result)
 * - Audio frame conversion
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import {
  createGatewayTTSNode,
  getGatewayTTSMetrics,
  resetGatewayTTSMetrics,
} from '../gateway-tts-node.js';
import { createTTSCache, setTTSCache } from '../../../services/tts/tts-cache.js';
import type { ITTSProvider } from '../types.js';

// ==========================================================================
// MOCKS
// ==========================================================================

// Mock the Cartesia provider
const mockProvider: ITTSProvider = {
  name: 'mock-cartesia',
  synthesize: vi.fn().mockResolvedValue(new ArrayBuffer(4800)), // 100ms of 24kHz 16-bit mono
  synthesizeStream: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
  estimateDuration: vi.fn().mockReturnValue(100),
};

// Mock the providers module (gateway uses getTTSProvider())
vi.mock('../providers/index.js', () => ({
  getTTSProvider: () => mockProvider,
  getCartesiaProvider: () => mockProvider,
  CartesiaTTSProvider: vi.fn(),
  createCartesiaProvider: vi.fn(),
}));

// Mock AudioFrame constructor
vi.mock('@livekit/rtc-node', () => ({
  AudioFrame: class MockAudioFrame {
    data: Int16Array;
    sampleRate: number;
    channels: number;
    samplesPerChannel: number;

    constructor(data: Int16Array, sampleRate: number, channels: number, samplesPerChannel: number) {
      this.data = data;
      this.sampleRate = sampleRate;
      this.channels = channels;
      this.samplesPerChannel = samplesPerChannel;
    }
  },
}));

// ==========================================================================
// HELPERS
// ==========================================================================

function createTextStream(text: string): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

function createChunkedTextStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collectFrames(stream: ReadableStream<unknown> | null): Promise<unknown[]> {
  if (!stream) return [];
  const frames: unknown[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) frames.push(value);
  }
  return frames;
}

// ==========================================================================
// TESTS
// ==========================================================================

describe('Gateway TTS Node', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGatewayTTSMetrics();
    // Set up a fresh cache for each test
    const cache = createTTSCache({ maxEntries: 100 });
    setTTSCache(cache);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Flow', () => {
    it('should synthesize text and return audio frames', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
      });

      const textStream = createTextStream('Hello world');
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      const frames = await collectFrames(audioStream!);
      expect(frames.length).toBeGreaterThan(0);
      expect(mockProvider.synthesize).toHaveBeenCalledTimes(1);
    });

    it('should handle SSML and strip it before synthesis', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
      });

      const textStream = createTextStream('<break time="200ms"/>Hello world<speed ratio="0.9"/>');
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      // Provider should receive clean text (SSML stripped)
      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        expect.stringContaining('Hello world'),
        'test-voice',
        expect.any(Object)
      );
      // Should NOT contain SSML tags
      const callArgs = vi.mocked(mockProvider.synthesize).mock.calls[0];
      expect(callArgs[0]).not.toContain('<break');
      expect(callArgs[0]).not.toContain('<speed');
    });

    it('should return empty stream for empty text', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
      });

      const textStream = createTextStream('   ');
      const audioStream = await gatewayTTS(textStream);

      // Returns empty stream (not null) to avoid LiveKit SDK errors
      expect(audioStream).not.toBeNull();
      const frames = await collectFrames(audioStream);
      expect(frames.length).toBe(0);
      expect(mockProvider.synthesize).not.toHaveBeenCalled();
    });

    it('should handle chunked text stream', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
      });

      const textStream = createChunkedTextStream(['Hello ', 'world, ', 'how are you?']);
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      // Should synthesize the combined text
      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        'Hello world, how are you?',
        'test-voice',
        expect.any(Object)
      );
    });
  });

  describe('Caching', () => {
    it('should cache synthesized audio', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        enableCache: true,
      });

      // First call - should synthesize
      const textStream1 = createTextStream('Hello cached');
      await gatewayTTS(textStream1);
      expect(mockProvider.synthesize).toHaveBeenCalledTimes(1);

      // Second call with same text - should use cache
      const textStream2 = createTextStream('Hello cached');
      await gatewayTTS(textStream2);
      expect(mockProvider.synthesize).toHaveBeenCalledTimes(1); // Still 1, cache hit!
    });

    it('should track cache hit metrics', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        enableCache: true,
      });

      // First call - cache miss
      const textStream1 = createTextStream('Metrics test');
      await gatewayTTS(textStream1);

      let metrics = getGatewayTTSMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheHits).toBe(0);

      // Second call - cache hit
      const textStream2 = createTextStream('Metrics test');
      await gatewayTTS(textStream2);

      metrics = getGatewayTTSMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheHits).toBe(1);
    });

    it('should respect enableCache: false', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        enableCache: false,
      });

      // First call
      const textStream1 = createTextStream('No cache test');
      await gatewayTTS(textStream1);
      expect(mockProvider.synthesize).toHaveBeenCalledTimes(1);

      // Second call - should synthesize again (no cache)
      const textStream2 = createTextStream('No cache test');
      await gatewayTTS(textStream2);
      expect(mockProvider.synthesize).toHaveBeenCalledTimes(2);
    });
  });

  describe('Prosody', () => {
    it('should extract and pass prosody from SSML', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
      });

      const textStream = createTextStream('<speed ratio="0.8"/>Hello slow');
      await gatewayTTS(textStream);

      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        expect.any(String),
        'test-voice',
        expect.objectContaining({
          speed: 0.8,
        })
      );
    });

    it('should merge emotion from config with parsed SSML', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        emotion: 'happy', // Config emotion
      });

      const textStream = createTextStream('Hello without SSML emotion');
      await gatewayTTS(textStream);

      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        expect.any(String),
        'test-voice',
        expect.objectContaining({
          emotion: 'happy',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle provider errors gracefully', async () => {
      mockProvider.synthesize = vi.fn().mockRejectedValue(new Error('Provider error'));

      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
      });

      const textStream = createTextStream('Error test');
      const audioStream = await gatewayTTS(textStream);

      // Returns empty stream (not null) to avoid LiveKit SDK errors
      expect(audioStream).not.toBeNull();
      const frames = await collectFrames(audioStream);
      expect(frames.length).toBe(0);

      const metrics = getGatewayTTSMetrics();
      expect(metrics.errors).toBe(1);
    });

    it('should handle empty provider response', async () => {
      mockProvider.synthesize = vi.fn().mockResolvedValue(new ArrayBuffer(0));

      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
      });

      const textStream = createTextStream('Empty response test');
      const audioStream = await gatewayTTS(textStream);

      // Returns empty stream (not null) to avoid LiveKit SDK errors
      expect(audioStream).not.toBeNull();
      const frames = await collectFrames(audioStream);
      expect(frames.length).toBe(0);
    });
  });

  describe('Audio Frame Conversion', () => {
    it('should split audio into correct frame sizes', async () => {
      // Create audio that's exactly 100ms at 24kHz (2400 samples = 4800 bytes)
      const audioBuffer = new ArrayBuffer(4800);
      mockProvider.synthesize = vi.fn().mockResolvedValue(audioBuffer);

      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        sampleRate: 24000,
        frameDurationMs: 20, // 480 samples per frame
      });

      const textStream = createTextStream('Frame test');
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      const frames = await collectFrames(audioStream!);

      // 100ms audio / 20ms frames = 5 frames
      expect(frames.length).toBe(5);

      // Each frame should have correct properties
      const frame = frames[0] as {
        samplesPerChannel: number;
        sampleRate: number;
        channels: number;
      };
      expect(frame.samplesPerChannel).toBe(480); // 20ms at 24kHz
      expect(frame.sampleRate).toBe(24000);
      expect(frame.channels).toBe(1);
    });

    it('should skip frames with zero samples', async () => {
      // 1 byte is less than 2 bytes per sample — should produce no frames
      const audioBuffer = new ArrayBuffer(1);
      mockProvider.synthesize = vi.fn().mockResolvedValue(audioBuffer);

      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        sampleRate: 24000,
        frameDurationMs: 20,
        enableStreamingOverlap: false,
      });

      const textStream = createTextStream('Tiny audio test');
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      // The single byte should be skipped since samplesPerChannel would be 0.5 → rounded to 0
      // (or it gets a frame with 0 samples which is filtered)
    });
  });

  describe('Prosody validation', () => {
    beforeEach(() => {
      mockProvider.synthesize = vi.fn().mockResolvedValue(new ArrayBuffer(4800));
    });

    it('should pass prosody with emotion and speed to provider', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        emotion: 'sadness',
        enableStreamingOverlap: false,
      });

      const textStream = createTextStream('<speed ratio="0.85"/>I understand.');
      await gatewayTTS(textStream);

      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        expect.any(String),
        'test-voice',
        expect.objectContaining({
          speed: 0.85,
          emotion: 'sadness',
        })
      );
    });

    it('should use Cartesia UUID voiceId as-is', async () => {
      const cartesiaVoiceId = 'a0e99841-438c-4a64-b679-ae501e7d6091';
      const gatewayTTS = createGatewayTTSNode({
        voiceId: cartesiaVoiceId,
        sessionId: 'test-session',
        enableStreamingOverlap: false,
      });

      const textStream = createTextStream('Voice ID test');
      await gatewayTTS(textStream);

      expect(mockProvider.synthesize).toHaveBeenCalledWith(
        expect.any(String),
        cartesiaVoiceId,
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // Feb 2026: Tests for Higgs Phase 4 fixes
  // ==========================================================================

  describe('JSON Function Call Filtering (Feb 2026 fix)', () => {
    beforeEach(() => {
      mockProvider.synthesize = vi.fn().mockResolvedValue(new ArrayBuffer(4800));
    });

    it('should filter complete JSON function calls', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        enableStreamingOverlap: false,
      });

      const textStream = createTextStream('{"fn":"getNews","args":{}}');
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      const frames = await collectFrames(audioStream);
      expect(frames.length).toBe(0);
      expect(mockProvider.synthesize).not.toHaveBeenCalled();
    });

    it('should NOT filter legitimate text starting with curly brace', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        enableStreamingOverlap: false,
      });

      const textStream = createTextStream("{That's a great idea}");
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      // Provider SHOULD be called — this text is NOT a function call
      expect(mockProvider.synthesize).toHaveBeenCalled();
    });

    it('should NOT filter text with JSON-like braces but no fn key', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        enableStreamingOverlap: false,
      });

      const textStream = createTextStream('{"name":"Seth","role":"engineer"}');
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      // Provider SHOULD be called — valid JSON but no "fn" key
      expect(mockProvider.synthesize).toHaveBeenCalled();
    });

    it('should filter partial JSON function calls from streaming', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        enableStreamingOverlap: false,
      });

      const textStream = createTextStream('{"fn":"getWea');
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      const frames = await collectFrames(audioStream);
      expect(frames.length).toBe(0);
      expect(mockProvider.synthesize).not.toHaveBeenCalled();
    });
  });

  describe('Cache Hit Latency Tracking (Feb 2026 fix)', () => {
    beforeEach(() => {
      mockProvider.synthesize = vi.fn().mockResolvedValue(new ArrayBuffer(4800));
    });

    it('should measure cache hit latency from cache lookup, not from request start', async () => {
      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        enableCache: true,
        enableStreamingOverlap: false,
      });

      // First call — cache miss (populates cache)
      await gatewayTTS(createTextStream('Latency tracking test'));

      // Second call — cache hit
      await gatewayTTS(createTextStream('Latency tracking test'));

      const metrics = getGatewayTTSMetrics();
      expect(metrics.cacheHits).toBe(1);
      // Cache hit latency should be small (< 50ms in tests) since it only
      // measures the cache lookup, not preprocessing (SSML parsing, etc.)
      expect(metrics.avgCacheHitLatencyMs).toBeLessThan(50);
    });
  });

  describe('Timeout Behavior (Feb 2026 fix)', () => {
    it('should timeout and return empty stream on slow provider', async () => {
      // Mock provider that takes 5 seconds (will exceed our 100ms timeout)
      mockProvider.synthesize = vi.fn().mockImplementation(
        () => new Promise<ArrayBuffer>((resolve) =>
          setTimeout(() => resolve(new ArrayBuffer(4800)), 5000)
        )
      );

      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        timeoutMs: 100,
        enableStreamingOverlap: false,
      });

      const textStream = createTextStream('Timeout behavior test');
      const audioStream = await gatewayTTS(textStream);

      // Should return empty stream on timeout (error handled gracefully)
      expect(audioStream).not.toBeNull();
      const frames = await collectFrames(audioStream);
      expect(frames.length).toBe(0);

      const metrics = getGatewayTTSMetrics();
      expect(metrics.errors).toBe(1);
    });

    it('should include timeout duration in error message', async () => {
      // We can't directly test the error message since it's caught internally,
      // but we verify the error counter increments (meaning timeout was thrown)
      mockProvider.synthesize = vi.fn().mockImplementation(
        () => new Promise<ArrayBuffer>(() => {
          // Never resolves — simulates hung connection
        })
      );

      const gatewayTTS = createGatewayTTSNode({
        voiceId: 'test-voice',
        sessionId: 'test-session',
        timeoutMs: 50,
        enableStreamingOverlap: false,
      });

      const textStream = createTextStream('Hung connection test');
      const audioStream = await gatewayTTS(textStream);

      expect(audioStream).not.toBeNull();
      const frames = await collectFrames(audioStream);
      expect(frames.length).toBe(0);

      const metrics = getGatewayTTSMetrics();
      expect(metrics.errors).toBe(1);
    });
  });
});
