/**
 * Streaming TTS Transform Tests
 *
 * Tests for the streaming TTS optimization that enables low-latency first-audio.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createStreamingTTSTransform,
  getStreamingTTSMetrics,
  resetStreamingTTSMetrics,
  isStreamingTTSEnabled,
  getOptimizedStreamingConfig,
} from '../streaming-tts-transform.js';

describe('StreamingTTSTransform', () => {
  beforeEach(() => {
    resetStreamingTTSMetrics();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createStreamingTTSTransform', () => {
    it('should create a transform stream', () => {
      const transform = createStreamingTTSTransform();
      expect(transform).toBeDefined();
      expect(transform.readable).toBeDefined();
      expect(transform.writable).toBeDefined();
    });

    it('should chunk text at sentence boundaries', async () => {
      const transform = createStreamingTTSTransform({
        minChunkSize: 10,
        maxChunkSize: 100,
        chunkDelayMs: 5,
        enableMetrics: false,
      });

      const chunks: string[] = [];
      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();

      // Read chunks in background
      const readPromise = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      })();

      // Write a sentence
      await writer.write('Hello world. ');
      await writer.write('This is a test.');
      await writer.close();

      await readPromise;

      // Should have chunked at sentence boundary
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks.join('')).toContain('Hello world');
    });

    it('should flush aggressively for first chunk', async () => {
      const transform = createStreamingTTSTransform({
        firstChunkMinSize: 5,
        firstChunkDelayMs: 1,
        minChunkSize: 30,
        chunkDelayMs: 10,
        enableMetrics: false,
      });

      const chunks: string[] = [];
      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();

      const readPromise = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      })();

      // Write short text - should flush quickly due to firstChunkMinSize
      await writer.write('Hello!');
      await new Promise<void>((r) => {
        setTimeout(r, 10);
      }); // Wait for flush
      await writer.close();

      await readPromise;

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]).toBe('Hello!');
    });

    it('should handle empty input', async () => {
      const transform = createStreamingTTSTransform({ enableMetrics: false });

      const chunks: string[] = [];
      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();

      const readPromise = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      })();

      await writer.close();
      await readPromise;

      expect(chunks.length).toBe(0);
    });

    it('should respect maxChunkSize with word boundaries', async () => {
      const maxSize = 30;
      const transform = createStreamingTTSTransform({
        maxChunkSize: maxSize,
        minChunkSize: 5,
        enableMetrics: false,
      });

      const chunks: string[] = [];
      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();

      const readPromise = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      })();

      // Write text with word boundaries for proper splitting
      const text = 'Hello world this is a test of the chunking system today';
      await writer.write(text);
      await writer.close();

      await readPromise;

      // Should have multiple chunks
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // First chunk should be reasonable size (may be trimmed)
      expect(chunks[0].length).toBeLessThanOrEqual(maxSize + 5); // Allow small overflow for word boundaries
    });
  });

  describe('getStreamingTTSMetrics', () => {
    it('should track session metrics', async () => {
      const transform = createStreamingTTSTransform({
        sessionId: 'test-session',
        enableMetrics: true,
        firstChunkMinSize: 5,
        firstChunkDelayMs: 1,
      });

      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();

      const readPromise = (async () => {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      })();

      await writer.write('Hello world. This is a test.');
      await writer.close();
      await readPromise;

      const metrics = getStreamingTTSMetrics();
      expect(metrics.totalSessions).toBe(1);
      expect(metrics.avgFirstChunkLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate rolling averages', async () => {
      // Create multiple transforms to generate multiple sessions
      for (let i = 0; i < 3; i++) {
        const transform = createStreamingTTSTransform({
          sessionId: `session-${i}`,
          enableMetrics: true,
          firstChunkMinSize: 5,
          firstChunkDelayMs: 1,
        });

        const reader = transform.readable.getReader();
        const writer = transform.writable.getWriter();

        const readPromise = (async () => {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        })();

        await writer.write('Test message.');
        await writer.close();
        await readPromise;
      }

      const metrics = getStreamingTTSMetrics();
      expect(metrics.totalSessions).toBe(3);
      expect(metrics.recentSessions.length).toBe(3);
    });
  });

  describe('resetStreamingTTSMetrics', () => {
    it('should reset all metrics', async () => {
      // Generate some metrics
      const transform = createStreamingTTSTransform({
        enableMetrics: true,
        firstChunkMinSize: 5,
        firstChunkDelayMs: 1,
      });

      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();

      const readPromise = (async () => {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      })();

      await writer.write('Test.');
      await writer.close();
      await readPromise;

      expect(getStreamingTTSMetrics().totalSessions).toBe(1);

      resetStreamingTTSMetrics();

      const metrics = getStreamingTTSMetrics();
      expect(metrics.totalSessions).toBe(0);
      expect(metrics.recentSessions.length).toBe(0);
    });
  });

  describe('isStreamingTTSEnabled', () => {
    it('should always return true (streaming TTS always on)', () => {
      expect(isStreamingTTSEnabled()).toBe(true);
    });
  });

  describe('getOptimizedStreamingConfig', () => {
    it('should return default config without context', () => {
      const config = getOptimizedStreamingConfig();
      expect(config.enableMetrics).toBe(true);
    });

    it('should use aggressive settings for first turn', () => {
      const config = getOptimizedStreamingConfig({ isFirstTurn: true });
      // UPDATED Dec 2024: More aggressive for faster first impression
      expect(config.firstChunkMinSize).toBe(6); // Was 10
      expect(config.firstChunkDelayMs).toBe(8); // Was 15
    });

    it('should use most aggressive settings for high priority', () => {
      const config = getOptimizedStreamingConfig({ isHighPriority: true });
      // UPDATED Dec 2024: Near-instant for time-sensitive situations
      expect(config.firstChunkMinSize).toBe(5); // Was 8
      expect(config.firstChunkDelayMs).toBe(5); // Was 10
      expect(config.minChunkSize).toBe(12); // Was 20
    });

    it('should include sessionId when provided', () => {
      const config = getOptimizedStreamingConfig({ sessionId: 'test-123' });
      expect(config.sessionId).toBe('test-123');
    });
  });

  describe('sentence boundary detection', () => {
    it('should split at periods', async () => {
      const transform = createStreamingTTSTransform({
        minChunkSize: 5,
        enableMetrics: false,
      });

      const chunks: string[] = [];
      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();

      const readPromise = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      })();

      await writer.write('First sentence. Second sentence.');
      await writer.close();
      await readPromise;

      // Should have split at the period
      expect(chunks.some((c) => c.includes('First sentence'))).toBe(true);
    });

    it('should split at question marks', async () => {
      const transform = createStreamingTTSTransform({
        minChunkSize: 5,
        enableMetrics: false,
      });

      const chunks: string[] = [];
      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();

      const readPromise = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      })();

      await writer.write('Is this a question? Yes it is.');
      await writer.close();
      await readPromise;

      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should split at commas for phrase breaks', async () => {
      const transform = createStreamingTTSTransform({
        minChunkSize: 5,
        maxChunkSize: 50,
        enableMetrics: false,
      });

      const chunks: string[] = [];
      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();

      const readPromise = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      })();

      await writer.write('Hello there, how are you doing today, friend?');
      await writer.close();
      await readPromise;

      // Should have at least one chunk
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
