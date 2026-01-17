/**
 * E2E Integration Tests for Native FFT Module
 *
 * Tests the Rust-accelerated FFT operations (native module required).
 * Validates:
 * - Native module availability detection
 * - FFT computation correctness
 * - Spectral feature field mapping (Rust → TypeScript)
 * - Hanning window application
 * - Performance characteristics
 *
 * NOTE: This module uses "fail fast, no fallback" - native Rust module is REQUIRED.
 *
 * @module speech/fft-analyzer/__tests__/native-fft-e2e.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

// Import after mocks
import {
  fftNative,
  applyHanningWindowNative,
  getMagnitudeSpectrumNative,
  analyzeSpectrumNative,
  isNativeFftAvailable,
  getNativeFftInfo,
  getNativeFftLoadError,
  getFftMetrics,
  resetFftMetrics,
  logFftStatus,
  type NativeSpectralFeatures,
  type NativeFftResult,
} from '../native-fft.js';

describe('Native FFT Module E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFftMetrics();
  });

  describe('Module Availability', () => {
    it('should report native availability status as boolean', () => {
      const isAvailable = isNativeFftAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });

    it('should provide library info when native is available', () => {
      const info = getNativeFftInfo();

      if (isNativeFftAvailable()) {
        expect(info).not.toBeNull();
        expect(info).toHaveProperty('version');
        expect(info).toHaveProperty('bufferPoolSize');
        expect(info).toHaveProperty('maxFrameSize');
        expect(info).toHaveProperty('defaultSampleRate');
        expect(typeof info!.version).toBe('string');
        expect(typeof info!.bufferPoolSize).toBe('number');
        expect(typeof info!.maxFrameSize).toBe('number');
        expect(typeof info!.defaultSampleRate).toBe('number');
      } else {
        expect(info).toBeNull();
      }
    });

    it('should provide load error when native is unavailable', () => {
      const error = getNativeFftLoadError();

      if (!isNativeFftAvailable()) {
        expect(typeof error).toBe('string');
        expect(error!.length).toBeGreaterThan(0);
      }
      // If native IS available, error may be null
    });

    it('should log FFT status without throwing', () => {
      expect(() => logFftStatus()).not.toThrow();
    });
  });

  describe('FFT Computation', () => {
    it('should compute FFT on power-of-2 sized input', () => {
      // Create a simple sine wave
      const sampleRate = 44100;
      const frequency = 440; // A4 note
      const size = 1024;
      const samples = new Float32Array(size);

      for (let i = 0; i < size; i++) {
        samples[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
      }

      const result = fftNative(samples);

      expect(result).toBeDefined();
      expect(result.length).toBe(size);
      expect(result[0]).toHaveProperty('re');
      expect(result[0]).toHaveProperty('im');
    });

    it('should return complex numbers with real and imaginary parts', () => {
      const samples = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0]); // 8 samples
      const result = fftNative(samples);

      for (const complex of result) {
        expect(typeof complex.re).toBe('number');
        expect(typeof complex.im).toBe('number');
        expect(Number.isFinite(complex.re)).toBe(true);
        expect(Number.isFinite(complex.im)).toBe(true);
      }
    });

    it('should handle zero-padded input', () => {
      const samples = new Float32Array(256).fill(0);
      samples[0] = 1; // Impulse

      const result = fftNative(samples);

      expect(result.length).toBe(256);
      // DC component should be 1 for impulse
      expect(Math.abs(result[0].re)).toBeCloseTo(1, 5);
    });

    it('should produce consistent results between runs', () => {
      const samples = new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);

      const result1 = fftNative(samples);
      const result2 = fftNative(samples);

      for (let i = 0; i < result1.length; i++) {
        expect(result1[i].re).toBeCloseTo(result2[i].re, 10);
        expect(result1[i].im).toBeCloseTo(result2[i].im, 10);
      }
    });
  });

  describe('Hanning Window', () => {
    it('should apply Hanning window to samples', () => {
      const samples = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);
      const windowed = applyHanningWindowNative(samples);

      expect(windowed.length).toBe(samples.length);

      // Hanning window should be 0 at edges and 1 at center
      expect(windowed[0]).toBeCloseTo(0, 2);
      expect(windowed[samples.length - 1]).toBeCloseTo(0, 2);

      // Middle should be close to 1 (for input of all 1s)
      const middle = Math.floor(samples.length / 2);
      expect(windowed[middle]).toBeGreaterThan(0.5);
    });

    it('should preserve array length', () => {
      const sizes = [64, 128, 256, 512, 1024];

      for (const size of sizes) {
        const samples = new Float32Array(size).fill(1);
        const windowed = applyHanningWindowNative(samples);
        expect(windowed.length).toBe(size);
      }
    });

    it('should handle empty array', () => {
      const samples = new Float32Array(0);
      const windowed = applyHanningWindowNative(samples);
      expect(windowed.length).toBe(0);
    });
  });

  describe('Magnitude Spectrum', () => {
    it('should compute magnitude spectrum from FFT result', () => {
      const samples = new Float32Array(256);
      // Create a 1kHz tone
      for (let i = 0; i < 256; i++) {
        samples[i] = Math.sin((2 * Math.PI * 1000 * i) / 44100);
      }

      const fftResult = fftNative(samples);
      const magnitudes = getMagnitudeSpectrumNative(fftResult);

      expect(magnitudes).toBeInstanceOf(Float32Array);
      expect(magnitudes.length).toBe(fftResult.length / 2);

      // All magnitudes should be non-negative
      for (const mag of magnitudes) {
        expect(mag).toBeGreaterThanOrEqual(0);
      }
    });

    it('should detect dominant frequency bin', () => {
      const sampleRate = 44100;
      const frequency = 1000;
      const size = 2048;
      const samples = new Float32Array(size);

      for (let i = 0; i < size; i++) {
        samples[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
      }

      const fftResult = fftNative(applyHanningWindowNative(samples));
      const magnitudes = getMagnitudeSpectrumNative(fftResult);

      // Find the bin with maximum magnitude
      let maxBin = 0;
      let maxMag = 0;
      for (let i = 1; i < magnitudes.length; i++) {
        if (magnitudes[i] > maxMag) {
          maxMag = magnitudes[i];
          maxBin = i;
        }
      }

      // Expected bin for 1000 Hz
      const binFrequency = sampleRate / size;
      const expectedBin = Math.round(frequency / binFrequency);

      // Allow ±2 bins tolerance due to windowing
      expect(Math.abs(maxBin - expectedBin)).toBeLessThanOrEqual(2);
    });
  });

  describe('Spectral Analysis', () => {
    it('should compute all spectral features', () => {
      const sampleRate = 44100;
      const size = 2048;
      const samples = new Float32Array(size);

      // Create a tone with harmonics
      for (let i = 0; i < size; i++) {
        samples[i] =
          0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate) +
          0.3 * Math.sin((2 * Math.PI * 880 * i) / sampleRate) +
          0.2 * Math.sin((2 * Math.PI * 1320 * i) / sampleRate);
      }

      const features = analyzeSpectrumNative(samples, sampleRate);

      // Validate all required fields exist (TypeScript interface conformance)
      expect(features).toHaveProperty('centroid');
      expect(features).toHaveProperty('rolloff');
      expect(features).toHaveProperty('dominantFrequency');
      expect(features).toHaveProperty('dominantMagnitude');
      expect(features).toHaveProperty('bandEnergies');

      // Validate field types
      expect(typeof features.centroid).toBe('number');
      expect(typeof features.rolloff).toBe('number');
      expect(typeof features.dominantFrequency).toBe('number');
      expect(typeof features.dominantMagnitude).toBe('number');

      // bandEnergies can be Float32Array or number[] depending on native/JS path
      expect(
        features.bandEnergies instanceof Float32Array || Array.isArray(features.bandEnergies)
      ).toBe(true);
    });

    it('should have correct field names (NAPI-RS camelCase mapping)', () => {
      // This test verifies the fix for the field name mismatch
      // Rust exports: centroid, rolloff, dominantFrequency, dominantMagnitude, bandEnergies
      // TypeScript expects the same names (NOT centroidHz, rolloffHz, etc.)

      const samples = new Float32Array(1024).fill(0.5);
      const features = analyzeSpectrumNative(samples, 44100);

      // These should NOT be undefined (which would happen if field names don't match)
      expect(features.centroid).not.toBeUndefined();
      expect(features.rolloff).not.toBeUndefined();
      expect(features.dominantFrequency).not.toBeUndefined();
      expect(features.dominantMagnitude).not.toBeUndefined();
      expect(features.bandEnergies).not.toBeUndefined();

      // Verify old incorrect field names are NOT present
      // Cast through unknown first for type safety
      const featuresRecord = features as unknown as Record<string, unknown>;
      expect(featuresRecord['centroidHz']).toBeUndefined();
      expect(featuresRecord['rolloffHz']).toBeUndefined();
      expect(featuresRecord['dominantFreqHz']).toBeUndefined();
      expect(featuresRecord['dominant_frequency']).toBeUndefined();
    });

    it('should compute 7 band energies', () => {
      const samples = new Float32Array(2048);
      // White noise approximation
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.random() * 2 - 1;
      }

      const features = analyzeSpectrumNative(samples, 44100);

      // Should have exactly 7 bands: sub-bass, bass, low-mid, mid, high-mid, presence, brilliance
      expect(features.bandEnergies.length).toBe(7);

      // Each band should have non-negative energy
      for (let i = 0; i < features.bandEnergies.length; i++) {
        expect(features.bandEnergies[i]).toBeGreaterThanOrEqual(0);
      }
    });

    it('should respect frequency bounds', () => {
      const sampleRate = 44100;
      const samples = new Float32Array(2048);

      // Create a 100 Hz tone (should be filtered out if minFreq > 100)
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 100 * i) / sampleRate);
      }

      // Analyze with minFreq above the tone
      const features = analyzeSpectrumNative(samples, sampleRate, 200);

      // With 100Hz tone filtered out, dominant frequency should be different
      // (or centroid should be higher than 100)
      expect(features.centroid).toBeGreaterThan(100);
    });

    it('should produce reasonable centroid for known signals', () => {
      const sampleRate = 44100;
      const size = 2048;

      // Pure 1000 Hz tone
      const samples1k = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        samples1k[i] = Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
      }

      // Pure 5000 Hz tone
      const samples5k = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        samples5k[i] = Math.sin((2 * Math.PI * 5000 * i) / sampleRate);
      }

      const features1k = analyzeSpectrumNative(samples1k, sampleRate);
      const features5k = analyzeSpectrumNative(samples5k, sampleRate);

      // Higher frequency tone should have higher centroid
      expect(features5k.centroid).toBeGreaterThan(features1k.centroid);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track call counts', () => {
      resetFftMetrics();

      // Make some calls
      const samples = new Float32Array(256);
      fftNative(samples);
      fftNative(samples);
      fftNative(samples);

      const metrics = getFftMetrics();

      expect(metrics.calls).toBe(3);
      expect(metrics.totalSamples).toBe(256 * 3);
    });

    it('should track timing information', () => {
      resetFftMetrics();

      const samples = new Float32Array(1024);
      fftNative(samples);
      fftNative(samples);

      const metrics = getFftMetrics();

      expect(metrics.totalTimeMs).toBeGreaterThan(0);
      expect(metrics.avgTimeMs).toBeGreaterThan(0);
    });

    it('should reset metrics correctly', () => {
      const samples = new Float32Array(256);
      fftNative(samples);
      fftNative(samples);

      resetFftMetrics();

      const metrics = getFftMetrics();
      expect(metrics.calls).toBe(0);
      expect(metrics.totalSamples).toBe(0);
      expect(metrics.totalTimeMs).toBe(0);
      expect(metrics.avgTimeMs).toBe(0);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large FFT sizes efficiently', () => {
      const sizes = [1024, 2048, 4096, 8192];

      for (const size of sizes) {
        const samples = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          samples[i] = Math.random() * 2 - 1;
        }

        const start = performance.now();
        fftNative(samples);
        const elapsed = performance.now() - start;

        // Should complete in reasonable time (< 100ms for up to 8K samples)
        expect(elapsed).toBeLessThan(100);
      }
    });

    it('should handle batch spectral analysis efficiently', () => {
      const samples = new Float32Array(2048);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.random() * 2 - 1;
      }

      const iterations = 50;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        analyzeSpectrumNative(samples, 44100);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      // Average should be < 10ms per analysis
      expect(avgTime).toBeLessThan(10);
    });

    it('should track all calls in metrics', () => {
      resetFftMetrics();

      const samples = new Float32Array(4096);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.random() * 2 - 1;
      }

      // Run multiple iterations
      for (let i = 0; i < 20; i++) {
        fftNative(samples);
      }

      const metrics = getFftMetrics();

      // All calls should be tracked
      expect(metrics.calls).toBe(20);
      expect(metrics.totalSamples).toBe(4096 * 20);
      expect(metrics.totalTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single sample', () => {
      const samples = new Float32Array([0.5]);
      const result = fftNative(samples);
      expect(result.length).toBe(1);
    });

    it('should handle all zeros', () => {
      const samples = new Float32Array(256).fill(0);
      const result = fftNative(samples);

      // FFT of zeros should be zeros
      for (const complex of result) {
        expect(complex.re).toBeCloseTo(0, 10);
        expect(complex.im).toBeCloseTo(0, 10);
      }
    });

    it('should handle DC signal', () => {
      const samples = new Float32Array(256).fill(1);
      const result = fftNative(samples);

      // DC signal should have energy only at bin 0
      expect(Math.abs(result[0].re)).toBeGreaterThan(1);

      // Other bins should be near zero
      for (let i = 1; i < result.length; i++) {
        expect(Math.abs(result[i].re)).toBeLessThan(0.01);
        expect(Math.abs(result[i].im)).toBeLessThan(0.01);
      }
    });

    it('should handle very quiet signal', () => {
      const samples = new Float32Array(1024);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = 0.0001 * Math.sin((2 * Math.PI * 440 * i) / 44100);
      }

      const features = analyzeSpectrumNative(samples, 44100);

      // Should still produce valid results
      expect(Number.isFinite(features.centroid)).toBe(true);
      expect(Number.isFinite(features.rolloff)).toBe(true);
    });

    it('should handle maximum amplitude signal', () => {
      const samples = new Float32Array(1024);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 440 * i) / 44100); // Full amplitude
      }

      const features = analyzeSpectrumNative(samples, 44100);

      expect(Number.isFinite(features.centroid)).toBe(true);
      expect(Number.isFinite(features.dominantMagnitude)).toBe(true);
    });

    it('should handle clipped signal', () => {
      const samples = new Float32Array(1024);
      for (let i = 0; i < samples.length; i++) {
        // Clipped sine wave
        const value = 2 * Math.sin((2 * Math.PI * 440 * i) / 44100);
        samples[i] = Math.max(-1, Math.min(1, value));
      }

      const features = analyzeSpectrumNative(samples, 44100);

      // Should handle gracefully
      expect(Number.isFinite(features.centroid)).toBe(true);
    });
  });

  describe('Native Module Required', () => {
    it('should produce valid results when native is available', () => {
      // Skip test if native module is not available
      // In fail-fast mode, this test verifies the happy path
      if (!isNativeFftAvailable()) {
        return;
      }

      const samples = new Float32Array(2048);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 1000 * i) / 44100);
      }

      // Native module is required - these should work
      const fftResult = fftNative(samples);
      const windowed = applyHanningWindowNative(samples);
      const magnitudes = getMagnitudeSpectrumNative(fftResult);
      const features = analyzeSpectrumNative(samples, 44100);

      expect(fftResult.length).toBe(2048);
      expect(windowed.length).toBe(2048);
      expect(magnitudes.length).toBe(1024);
      expect(features.bandEnergies.length).toBe(7);
    });

    it('should track all calls in metrics', () => {
      // Skip test if native module is not available
      if (!isNativeFftAvailable()) {
        return;
      }

      resetFftMetrics();

      const samples = new Float32Array(512);
      for (let i = 0; i < 5; i++) {
        fftNative(samples);
        analyzeSpectrumNative(samples, 44100);
      }

      const metrics = getFftMetrics();

      // Should have recorded all calls (fft + spectrum analysis each count)
      expect(metrics.calls).toBe(10); // 5 FFT + 5 spectrum
      expect(metrics.totalSamples).toBe(512 * 10);
    });

    it('should report native availability status', () => {
      // This test passes in both scenarios - it just documents the behavior
      const isAvailable = isNativeFftAvailable();
      expect(typeof isAvailable).toBe('boolean');

      // In production, native module should always be available
      // If not available, we expect clear error messages via getNativeFftLoadError()
      if (!isAvailable) {
        const error = getNativeFftLoadError();
        expect(typeof error).toBe('string');
        expect(error!.length).toBeGreaterThan(0);
      }
    });
  });
});
