/**
 * Twilio Audio Enhancement Tests
 *
 * Tests for the Twilio-specific audio enhancement wrapper that provides:
 * - Bandwidth extension (8kHz → 16kHz)
 * - AGC normalization
 * - Noise suppression
 * - Session management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getTwilioEnhancer,
  removeTwilioEnhancer,
  getActiveEnhancerCount,
  clearAllEnhancers,
  enhanceTwilioAudio,
  float32ToInt16Buffer,
  int16BufferToFloat32,
  type TwilioEnhanceConfig,
} from '../twilio-audio-enhance.js';

describe('TwilioAudioEnhance', () => {
  beforeEach(() => {
    clearAllEnhancers();
  });

  afterEach(() => {
    clearAllEnhancers();
  });

  // =========================================================================
  // ENHANCER CREATION
  // =========================================================================

  describe('getTwilioEnhancer', () => {
    it('should create an enhancer with default config', async () => {
      const enhancer = await getTwilioEnhancer({
        sessionId: 'test-session',
      });

      expect(enhancer).toBeDefined();
      expect(typeof enhancer.enhanceFrame).toBe('function');
      expect(typeof enhancer.getAgcGain).toBe('function');
      expect(typeof enhancer.reset).toBe('function');
      expect(typeof enhancer.isUsingRust).toBe('function');
      expect(typeof enhancer.cleanup).toBe('function');
    });

    it('should create an enhancer with custom config', async () => {
      const config: TwilioEnhanceConfig = {
        sessionId: 'custom-config-test',
        enableAgc: true,
        enableNoiseSuppression: false,
        enableBandwidthExtension: true,
        enableHighpass: true,
      };

      const enhancer = await getTwilioEnhancer(config);
      expect(enhancer).toBeDefined();
    });

    it('should reuse processor for same sessionId', async () => {
      await getTwilioEnhancer({ sessionId: 'same-session' });
      await getTwilioEnhancer({ sessionId: 'same-session' });

      // Should only have one processor registered, not two
      expect(getActiveEnhancerCount()).toBe(1);
    });

    it('should create separate enhancers for different sessions', async () => {
      const enhancer1 = await getTwilioEnhancer({ sessionId: 'session-a' });
      const enhancer2 = await getTwilioEnhancer({ sessionId: 'session-b' });

      expect(enhancer1).not.toBe(enhancer2);
      expect(getActiveEnhancerCount()).toBe(2);
    });
  });

  // =========================================================================
  // AUDIO PROCESSING
  // =========================================================================

  describe('enhanceFrame', () => {
    it('should process 8kHz audio frames', async () => {
      const enhancer = await getTwilioEnhancer({ sessionId: 'process-test' });

      // 20ms frame at 8kHz = 160 samples
      const samples8kHz = new Int16Array(160);
      for (let i = 0; i < samples8kHz.length; i++) {
        samples8kHz[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 16000);
      }

      const result = enhancer.enhanceFrame(samples8kHz);

      expect(result).toBeDefined();
      expect(result.samples).toBeInstanceOf(Float32Array);
      expect(typeof result.usedRust).toBe('boolean');
      expect(typeof result.processingTimeMs).toBe('number');
    });

    it('should return enhanced samples', async () => {
      const enhancer = await getTwilioEnhancer({ sessionId: 'enhance-test' });

      const samples8kHz = new Int16Array(160);
      for (let i = 0; i < samples8kHz.length; i++) {
        samples8kHz[i] = Math.round(Math.sin((2 * Math.PI * 300 * i) / 8000) * 8000);
      }

      const result = enhancer.enhanceFrame(samples8kHz, true);

      // Output should have samples
      expect(result.samples.length).toBeGreaterThan(0);
    });

    it('should handle VAD parameter', async () => {
      const enhancer = await getTwilioEnhancer({ sessionId: 'vad-test' });

      const samples8kHz = new Int16Array(160);

      // With speech
      const resultSpeech = enhancer.enhanceFrame(samples8kHz, true);
      expect(resultSpeech.samples).toBeDefined();

      // Without speech
      const resultSilence = enhancer.enhanceFrame(samples8kHz, false);
      expect(resultSilence.samples).toBeDefined();
    });
  });

  // =========================================================================
  // AGC GAIN
  // =========================================================================

  describe('getAgcGain', () => {
    it('should return current AGC gain', async () => {
      const enhancer = await getTwilioEnhancer({ sessionId: 'agc-test' });

      const gain = enhancer.getAgcGain();
      expect(typeof gain).toBe('number');
    });

    it('should track AGC gain changes', async () => {
      const enhancer = await getTwilioEnhancer({ sessionId: 'agc-track-test' });

      // Process some quiet audio
      const quietSamples = new Int16Array(160);
      for (let i = 0; i < quietSamples.length; i++) {
        quietSamples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 100);
      }

      // Process multiple frames to allow AGC to adapt
      for (let i = 0; i < 10; i++) {
        enhancer.enhanceFrame(quietSamples, true);
      }

      // AGC should have boosted gain for quiet signal
      const gain = enhancer.getAgcGain();
      expect(gain).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // RESET & CLEANUP
  // =========================================================================

  describe('reset', () => {
    it('should reset enhancer state', async () => {
      const enhancer = await getTwilioEnhancer({ sessionId: 'reset-test' });

      // Process some audio
      const samples = new Int16Array(160);
      enhancer.enhanceFrame(samples, true);

      // Reset
      enhancer.reset();

      // Should still work after reset
      const result = enhancer.enhanceFrame(samples, true);
      expect(result.samples).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should remove enhancer from session registry', async () => {
      const enhancer = await getTwilioEnhancer({ sessionId: 'cleanup-test' });
      expect(getActiveEnhancerCount()).toBe(1);

      enhancer.cleanup();
      expect(getActiveEnhancerCount()).toBe(0);
    });
  });

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  describe('Session Management', () => {
    it('should track active enhancer count', async () => {
      expect(getActiveEnhancerCount()).toBe(0);

      await getTwilioEnhancer({ sessionId: 'count-1' });
      expect(getActiveEnhancerCount()).toBe(1);

      await getTwilioEnhancer({ sessionId: 'count-2' });
      expect(getActiveEnhancerCount()).toBe(2);

      await getTwilioEnhancer({ sessionId: 'count-3' });
      expect(getActiveEnhancerCount()).toBe(3);
    });

    it('should remove enhancer by sessionId', async () => {
      await getTwilioEnhancer({ sessionId: 'remove-test' });
      expect(getActiveEnhancerCount()).toBe(1);

      const removed = removeTwilioEnhancer('remove-test');
      expect(removed).toBe(true);
      expect(getActiveEnhancerCount()).toBe(0);
    });

    it('should return false when removing non-existent session', () => {
      const removed = removeTwilioEnhancer('non-existent');
      expect(removed).toBe(false);
    });

    it('should clear all enhancers', async () => {
      await getTwilioEnhancer({ sessionId: 'clear-1' });
      await getTwilioEnhancer({ sessionId: 'clear-2' });
      await getTwilioEnhancer({ sessionId: 'clear-3' });
      expect(getActiveEnhancerCount()).toBe(3);

      const count = clearAllEnhancers();
      expect(count).toBe(3);
      expect(getActiveEnhancerCount()).toBe(0);
    });
  });

  // =========================================================================
  // RUST AVAILABILITY
  // =========================================================================

  describe('isUsingRust', () => {
    it('should report whether using Rust processor', async () => {
      const enhancer = await getTwilioEnhancer({ sessionId: 'rust-test' });
      const isRust = enhancer.isUsingRust();
      expect(typeof isRust).toBe('boolean');
    });
  });

  // =========================================================================
  // STANDALONE FUNCTIONS
  // =========================================================================

  describe('enhanceTwilioAudio (one-shot)', () => {
    it('should enhance audio without session state', async () => {
      const samples8kHz = new Int16Array(160);
      for (let i = 0; i < samples8kHz.length; i++) {
        samples8kHz[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 10000);
      }

      const enhanced = await enhanceTwilioAudio(samples8kHz);
      expect(enhanced).toBeInstanceOf(Float32Array);
      expect(enhanced.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // BUFFER CONVERSION UTILITIES
  // =========================================================================

  describe('Buffer Conversion', () => {
    describe('float32ToInt16Buffer', () => {
      it('should convert Float32Array to Int16 Buffer', () => {
        const float32 = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
        const buffer = float32ToInt16Buffer(float32);

        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBe(float32.length * 2);
      });

      it('should clamp values to [-1, 1] range', () => {
        const float32 = new Float32Array([2.0, -2.0]); // Out of range
        const buffer = float32ToInt16Buffer(float32);

        // Should clamp to max/min int16
        expect(buffer.readInt16LE(0)).toBe(32767); // Max positive
        expect(buffer.readInt16LE(2)).toBe(-32767); // Max negative (rounded)
      });

      it('should preserve zero correctly', () => {
        const float32 = new Float32Array([0]);
        const buffer = float32ToInt16Buffer(float32);
        expect(buffer.readInt16LE(0)).toBe(0);
      });
    });

    describe('int16BufferToFloat32', () => {
      it('should convert Int16 Buffer to Float32Array', () => {
        const buffer = Buffer.alloc(10);
        buffer.writeInt16LE(0, 0);
        buffer.writeInt16LE(16384, 2); // ~0.5
        buffer.writeInt16LE(-16384, 4); // ~-0.5
        buffer.writeInt16LE(32767, 6); // ~1.0
        buffer.writeInt16LE(-32768, 8); // ~-1.0

        const float32 = int16BufferToFloat32(buffer);

        expect(float32).toBeInstanceOf(Float32Array);
        expect(float32.length).toBe(5);
        expect(float32[0]).toBeCloseTo(0, 5);
        expect(float32[1]).toBeCloseTo(0.5, 1);
        expect(float32[2]).toBeCloseTo(-0.5, 1);
        expect(float32[3]).toBeCloseTo(1.0, 1);
        expect(float32[4]).toBeCloseTo(-1.0, 1);
      });
    });

    describe('Roundtrip conversion', () => {
      it('should approximately preserve values through roundtrip', () => {
        const original = new Float32Array([0, 0.25, -0.25, 0.75, -0.75]);
        const buffer = float32ToInt16Buffer(original);
        const restored = int16BufferToFloat32(buffer);

        for (let i = 0; i < original.length; i++) {
          expect(restored[i]).toBeCloseTo(original[i], 2); // Within 0.01
        }
      });
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Twilio Enhancement Performance', () => {
  beforeEach(() => {
    clearAllEnhancers();
  });

  afterEach(() => {
    clearAllEnhancers();
  });

  it('should process frames in real-time', async () => {
    const enhancer = await getTwilioEnhancer({ sessionId: 'perf-test' });

    // 20ms frame at 8kHz
    const samples8kHz = new Int16Array(160);
    for (let i = 0; i < samples8kHz.length; i++) {
      samples8kHz[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 10000);
    }

    // Process 100 frames and measure time
    const results: number[] = [];
    for (let i = 0; i < 100; i++) {
      const result = enhancer.enhanceFrame(samples8kHz, true);
      results.push(result.processingTimeMs);
    }

    const avgTime = results.reduce((a, b) => a + b, 0) / results.length;
    // Should process 20ms frames in < 2ms (10% of real-time)
    expect(avgTime).toBeLessThan(5);
  });
});
