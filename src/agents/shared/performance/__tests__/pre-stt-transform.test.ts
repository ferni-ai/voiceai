/**
 * Pre-STT Transform Tests
 *
 * Tests for the pre-STT audio enhancement pipeline including:
 * - TypeScript config and presets
 * - Rust processor integration (when available)
 * - Session management
 * - JavaScript fallback functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PreSTTProcessor,
  PreSTTPresets,
  DEFAULT_CONFIG,
  TWILIO_CONFIG,
  getPreSTTMetrics,
  resetPreSTTMetrics,
  getOrCreateProcessor,
  removeSessionProcessor,
  getActiveProcessorCount,
  clearAllProcessors,
  isPreSTTAvailable,
  applyAgc,
  type PreSTTConfig,
} from '../pre-stt-transform.js';

describe('PreSTTTransform', () => {
  beforeEach(() => {
    resetPreSTTMetrics();
    clearAllProcessors();
  });

  afterEach(() => {
    clearAllProcessors();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // CONFIG & PRESETS
  // =========================================================================

  describe('DEFAULT_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_CONFIG.sampleRate).toBe(16000);
      expect(DEFAULT_CONFIG.enableAgc).toBe(true);
      expect(DEFAULT_CONFIG.enableNoiseSuppression).toBe(true);
      expect(DEFAULT_CONFIG.enableHighpass).toBe(true);
      expect(DEFAULT_CONFIG.highpassCutoffHz).toBe(80);
    });

    it('should have bandwidth extension disabled for standard config', () => {
      expect(DEFAULT_CONFIG.enableBandwidthExtension).toBe(false);
      expect(DEFAULT_CONFIG.inputIs8Khz).toBe(false);
    });

    it('should have metrics enabled by default', () => {
      expect(DEFAULT_CONFIG.enableMetrics).toBe(true);
    });
  });

  describe('TWILIO_CONFIG', () => {
    it('should be configured for 8kHz telephony audio', () => {
      expect(TWILIO_CONFIG.sampleRate).toBe(8000);
      expect(TWILIO_CONFIG.inputIs8Khz).toBe(true);
      expect(TWILIO_CONFIG.enableBandwidthExtension).toBe(true);
    });

    it('should enable all enhancement features', () => {
      expect(TWILIO_CONFIG.enableAgc).toBe(true);
      expect(TWILIO_CONFIG.enableNoiseSuppression).toBe(true);
      expect(TWILIO_CONFIG.enableHighpass).toBe(true);
    });
  });

  describe('PreSTTPresets', () => {
    it('should have all expected presets', () => {
      expect(PreSTTPresets).toHaveProperty('standard');
      expect(PreSTTPresets).toHaveProperty('twilio');
      expect(PreSTTPresets).toHaveProperty('quietRoom');
      expect(PreSTTPresets).toHaveProperty('noisy');
      expect(PreSTTPresets).toHaveProperty('bypass');
    });

    it('standard preset should enable full enhancement for 16kHz', () => {
      const preset = PreSTTPresets.standard;
      expect(preset.sampleRate).toBe(16000);
      expect(preset.enableAgc).toBe(true);
      expect(preset.enableNoiseSuppression).toBe(true);
      expect(preset.enableHighpass).toBe(true);
      expect(preset.enableBandwidthExtension).toBe(false);
    });

    it('twilio preset should enable bandwidth extension', () => {
      const preset = PreSTTPresets.twilio;
      expect(preset.sampleRate).toBe(8000);
      expect(preset.inputIs8Khz).toBe(true);
      expect(preset.enableBandwidthExtension).toBe(true);
    });

    it('quietRoom preset should disable noise suppression', () => {
      const preset = PreSTTPresets.quietRoom;
      expect(preset.enableAgc).toBe(true);
      expect(preset.enableNoiseSuppression).toBe(false);
      expect(preset.enableHighpass).toBe(true);
    });

    it('noisy preset should use higher highpass cutoff', () => {
      const preset = PreSTTPresets.noisy;
      expect(preset.highpassCutoffHz).toBe(100);
      expect(preset.enableAgc).toBe(true);
      expect(preset.enableNoiseSuppression).toBe(true);
    });

    it('bypass preset should disable all processing', () => {
      const preset = PreSTTPresets.bypass;
      expect(preset.enableAgc).toBe(false);
      expect(preset.enableNoiseSuppression).toBe(false);
      expect(preset.enableHighpass).toBe(false);
      expect(preset.enableBandwidthExtension).toBe(false);
    });
  });

  // =========================================================================
  // PROCESSOR CLASS
  // =========================================================================

  describe('PreSTTProcessor', () => {
    it('should create with default config', () => {
      const processor = new PreSTTProcessor();
      expect(processor).toBeDefined();
    });

    it('should create with custom config', () => {
      const config: PreSTTConfig = {
        sessionId: 'test-session',
        enableAgc: true,
        enableNoiseSuppression: false,
      };
      const processor = new PreSTTProcessor(config);
      expect(processor).toBeDefined();
    });

    it('should create Twilio processor via static factory', () => {
      const processor = PreSTTProcessor.forTwilio('test-twilio-session');
      expect(processor).toBeDefined();
    });

    it('should throw if processFrame called before initialize', async () => {
      const processor = new PreSTTProcessor();
      const samples = new Float32Array(320);

      expect(() => processor.processFrame(samples, true)).toThrow(
        'PreSTTProcessor not initialized'
      );
    });

    it('should throw if processFrameI16 called before initialize', async () => {
      const processor = new PreSTTProcessor();
      const samples = new Int16Array(320);

      expect(() => processor.processFrameI16(samples, true)).toThrow(
        'PreSTTProcessor not initialized'
      );
    });

    it('should initialize successfully', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'init-test' });
      await processor.initialize();
      // Should not throw - uses Rust if available, otherwise JavaScript fallback
      expect(processor.getStats().framesProcessed).toBe(0);
    });

    it('should process Float32 frames after initialization', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'float32-test' });
      await processor.initialize();

      const samples = new Float32Array(320);
      // Generate some test audio (sine wave)
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
      }

      const result = processor.processFrame(samples, true);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should process Int16 frames after initialization', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'int16-test' });
      await processor.initialize();

      const samples = new Int16Array(320);
      // Generate some test audio (sine wave)
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 16000) * 16000);
      }

      const result = processor.processFrameI16(samples, true);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should track processing stats', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'stats-test' });
      await processor.initialize();

      const samples = new Float32Array(320);
      processor.processFrame(samples, true);
      processor.processFrame(samples, true);
      processor.processFrame(samples, false);

      const stats = processor.getStats();
      expect(stats.framesProcessed).toBeGreaterThanOrEqual(3);
    });

    it('should reset state correctly', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'reset-test' });
      await processor.initialize();

      const samples = new Float32Array(320);
      processor.processFrame(samples, true);
      processor.processFrame(samples, true);

      processor.reset();
      const stats = processor.getStats();
      expect(stats.framesProcessed).toBe(0);
    });

    it('should report whether using Rust or JavaScript', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'rust-check-test' });
      await processor.initialize();

      const isRust = processor.isUsingRust();
      expect(typeof isRust).toBe('boolean');
    });
  });

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  describe('Session Management', () => {
    it('should create processor on first getOrCreate', async () => {
      expect(getActiveProcessorCount()).toBe(0);

      const processor = await getOrCreateProcessor('session-1');
      expect(processor).toBeDefined();
      expect(getActiveProcessorCount()).toBe(1);
    });

    it('should return same processor for same sessionId', async () => {
      const processor1 = await getOrCreateProcessor('session-same');
      const processor2 = await getOrCreateProcessor('session-same');

      expect(processor1).toBe(processor2);
      expect(getActiveProcessorCount()).toBe(1);
    });

    it('should create separate processors for different sessions', async () => {
      const processor1 = await getOrCreateProcessor('session-a');
      const processor2 = await getOrCreateProcessor('session-b');

      expect(processor1).not.toBe(processor2);
      expect(getActiveProcessorCount()).toBe(2);
    });

    it('should remove processor correctly', async () => {
      await getOrCreateProcessor('session-remove');
      expect(getActiveProcessorCount()).toBe(1);

      const removed = removeSessionProcessor('session-remove');
      expect(removed).toBe(true);
      expect(getActiveProcessorCount()).toBe(0);
    });

    it('should return false when removing non-existent session', () => {
      const removed = removeSessionProcessor('non-existent-session');
      expect(removed).toBe(false);
    });

    it('should clear all processors', async () => {
      await getOrCreateProcessor('session-clear-1');
      await getOrCreateProcessor('session-clear-2');
      await getOrCreateProcessor('session-clear-3');
      expect(getActiveProcessorCount()).toBe(3);

      const count = clearAllProcessors();
      expect(count).toBe(3);
      expect(getActiveProcessorCount()).toBe(0);
    });

    it('should pass config to new processor', async () => {
      const config: PreSTTConfig = {
        enableAgc: true,
        enableNoiseSuppression: false,
        enableHighpass: true,
      };
      const processor = await getOrCreateProcessor('session-config', config);
      expect(processor).toBeDefined();
      // Config is internal, but processor should work
      const samples = new Float32Array(320);
      const result = processor.processFrame(samples, true);
      expect(result).toBeInstanceOf(Float32Array);
    });
  });

  // =========================================================================
  // METRICS
  // =========================================================================

  describe('Metrics', () => {
    it('should return initial metrics', () => {
      const metrics = getPreSTTMetrics();
      expect(metrics.totalFramesProcessed).toBe(0);
      expect(metrics.totalProcessingTimeMs).toBe(0);
      expect(metrics.avgProcessingTimeMs).toBe(0);
      expect(metrics.maxProcessingTimeMs).toBe(0);
      expect(metrics.avgAgcGain).toBe(1.0);
      expect(metrics.bypassedFrames).toBe(0);
    });

    it('should update metrics after processing', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'metrics-test' });
      await processor.initialize();

      const samples = new Float32Array(320);
      processor.processFrame(samples, true);
      processor.processFrame(samples, true);

      const metrics = getPreSTTMetrics();
      expect(metrics.totalFramesProcessed).toBeGreaterThan(0);
    });

    it('should reset metrics correctly', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'metrics-reset' });
      await processor.initialize();

      const samples = new Float32Array(320);
      processor.processFrame(samples, true);

      resetPreSTTMetrics();

      const metrics = getPreSTTMetrics();
      expect(metrics.totalFramesProcessed).toBe(0);
      expect(metrics.totalProcessingTimeMs).toBe(0);
      expect(metrics.avgAgcGain).toBe(1.0);
    });
  });

  // =========================================================================
  // RUST INTEGRATION
  // =========================================================================

  describe('Rust Integration', () => {
    it('should report availability correctly', async () => {
      const available = await isPreSTTAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should work regardless of Rust availability (fallback)', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'fallback-test' });
      await processor.initialize();

      const samples = new Float32Array(320);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.3;
      }

      const result = processor.processFrame(samples, true);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(320); // Same length when no bandwidth extension
    });
  });

  // =========================================================================
  // AGC STANDALONE
  // =========================================================================

  describe('Standalone AGC', () => {
    it('should apply AGC to samples', async () => {
      const samples = new Float32Array(320);
      // Quiet signal
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.01;
      }

      const gain = await applyAgc('agc-test-session', samples);
      expect(typeof gain).toBe('number');
      expect(gain).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // AUDIO QUALITY TESTS
  // =========================================================================

  describe('Audio Quality', () => {
    it('should keep output within reasonable range after AGC', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'clip-test' });
      await processor.initialize();

      // Full-scale signal
      const samples = new Float32Array(320);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.95;
      }

      const result = processor.processFrame(samples, true);

      // AGC may boost signals, but should soft-clip to reasonable range
      // Allow up to 1.2 for headroom (soft clipping)
      let maxAbs = 0;
      for (let i = 0; i < result.length; i++) {
        const abs = Math.abs(result[i]);
        if (abs > maxAbs) maxAbs = abs;
      }
      // With AGC, output may slightly exceed 1.0 but should be limited
      expect(maxAbs).toBeLessThanOrEqual(1.5);
    });

    it('should handle silent frames', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'silence-test' });
      await processor.initialize();

      const samples = new Float32Array(320); // All zeros

      const result = processor.processFrame(samples, false);
      expect(result).toBeInstanceOf(Float32Array);

      // Silent frame should remain mostly silent
      let maxAbs = 0;
      for (let i = 0; i < result.length; i++) {
        const abs = Math.abs(result[i]);
        if (abs > maxAbs) maxAbs = abs;
      }
      expect(maxAbs).toBeLessThan(0.1);
    });

    it('should process multiple frames in sequence', async () => {
      const processor = new PreSTTProcessor({ sessionId: 'sequence-test' });
      await processor.initialize();

      // Process 10 frames in sequence
      for (let frame = 0; frame < 10; frame++) {
        const samples = new Float32Array(320);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = Math.sin((2 * Math.PI * 440 * (frame * 320 + i)) / 16000) * 0.5;
        }
        const result = processor.processFrame(samples, true);
        expect(result.length).toBeGreaterThan(0);
      }

      const stats = processor.getStats();
      expect(stats.framesProcessed).toBe(10);
    });
  });
});

// ============================================================================
// TWILIO BANDWIDTH EXTENSION TESTS
// ============================================================================

describe('Twilio Bandwidth Extension', () => {
  beforeEach(() => {
    resetPreSTTMetrics();
    clearAllProcessors();
  });

  afterEach(() => {
    clearAllProcessors();
  });

  it('should create Twilio processor with correct config', async () => {
    const processor = PreSTTProcessor.forTwilio('twilio-test');
    await processor.initialize();

    // Twilio processor should work
    const samples8k = new Int16Array(160); // 20ms at 8kHz
    for (let i = 0; i < samples8k.length; i++) {
      samples8k[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 16000);
    }

    const result = processor.processFrameI16(samples8k, true);
    expect(result).toBeInstanceOf(Float32Array);

    // With bandwidth extension, output should be 16kHz (2x samples)
    // Or same length if using JS fallback (no bandwidth extension)
    expect(result.length).toBeGreaterThanOrEqual(samples8k.length);
  });

  it('should handle Twilio telephony presets', async () => {
    const processor = await getOrCreateProcessor('twilio-preset-test', PreSTTPresets.twilio);

    const samples = new Float32Array(160); // 8kHz frame
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 300 * i) / 8000) * 0.4;
    }

    const result = processor.processFrame(samples, true);
    expect(result).toBeInstanceOf(Float32Array);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Pre-STT Performance', () => {
  beforeEach(() => {
    resetPreSTTMetrics();
  });

  it('should process frames within real-time budget', async () => {
    const processor = new PreSTTProcessor({ sessionId: 'perf-test' });
    await processor.initialize();

    const samples = new Float32Array(320); // 20ms frame at 16kHz
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
    }

    // Process 100 frames and measure time
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      processor.processFrame(samples, true);
    }
    const elapsed = performance.now() - start;

    // 100 frames * 20ms = 2000ms of audio
    // Should process in under 500ms (25% real-time) for comfortable margin in CI
    // Note: CI environments have variable performance, so we use a generous threshold
    const avgTimePerFrame = elapsed / 100;
    expect(avgTimePerFrame).toBeLessThan(5); // < 5ms per frame allows for CI variance

    const metrics = getPreSTTMetrics();
    expect(metrics.avgProcessingTimeMs).toBeLessThan(5);
  });
});
