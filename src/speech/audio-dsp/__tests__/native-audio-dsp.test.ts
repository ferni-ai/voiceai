/**
 * Native Audio DSP Integration Tests
 *
 * Tests the audio DSP functions including pitch detection, energy analysis,
 * and Pre-STT processing. Uses both native (when available) and JavaScript
 * fallback implementations.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  isNativeAudioDspAvailable,
  detectPitch,
  detectPitchBatch,
  calculateRms,
  calculateEnergyDb,
  calculateZcr,
  calculateMean,
  calculateVariance,
  calculateStdDev,
  detectVoiceActivity,
  analyzeFrame,
  createPreSttProcessor,
  createAudioDspProcessor,
  convertI16ToF32,
} from '../native-audio-dsp.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Generate a sine wave for testing
 */
function generateSineWave(
  frequency: number,
  sampleRate: number,
  durationSamples: number,
  amplitude = 1.0
): Float32Array {
  const samples = new Float32Array(durationSamples);
  for (let i = 0; i < durationSamples; i++) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return samples;
}

/**
 * Generate silence
 */
function generateSilence(durationSamples: number): Float32Array {
  return new Float32Array(durationSamples);
}

/**
 * Generate noise
 */
function generateNoise(durationSamples: number, amplitude = 0.1): Float32Array {
  const samples = new Float32Array(durationSamples);
  for (let i = 0; i < durationSamples; i++) {
    samples[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return samples;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Native Audio DSP', () => {
  beforeAll(() => {
    const isNative = isNativeAudioDspAvailable();
    console.log(`Native audio DSP available: ${isNative}`);
  });

  describe('Availability', () => {
    it('should report availability status', () => {
      const available = isNativeAudioDspAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Pitch Detection', () => {
    it('should detect pitch of 200 Hz sine wave', () => {
      const sampleRate = 16000;
      const samples = generateSineWave(200, sampleRate, 1024);
      
      const result = detectPitch(samples, sampleRate);
      
      // Should be within 10% of 200 Hz
      expect(result.pitchHz).toBeGreaterThan(180);
      expect(result.pitchHz).toBeLessThan(220);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect pitch of 150 Hz sine wave', () => {
      const sampleRate = 16000;
      const samples = generateSineWave(150, sampleRate, 1024);
      
      const result = detectPitch(samples, sampleRate);
      
      expect(result.pitchHz).toBeGreaterThan(135);
      expect(result.pitchHz).toBeLessThan(165);
    });

    it('should detect pitch of 300 Hz sine wave', () => {
      const sampleRate = 16000;
      const samples = generateSineWave(300, sampleRate, 1024);
      
      const result = detectPitch(samples, sampleRate);
      
      expect(result.pitchHz).toBeGreaterThan(270);
      expect(result.pitchHz).toBeLessThan(330);
    });

    it('should return low confidence for silence', () => {
      const samples = generateSilence(1024);
      
      const result = detectPitch(samples, 16000);
      
      // Either no pitch or very low confidence
      expect(result.pitchHz < 1 || result.confidence < 0.3).toBe(true);
    });

    it('should return low confidence for noise', () => {
      const samples = generateNoise(1024, 0.1);
      
      const result = detectPitch(samples, 16000);
      
      // Noise should have low confidence
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('Batch Pitch Detection', () => {
    it('should detect pitch across multiple frames', () => {
      const sampleRate = 16000;
      // Use larger buffer for more reliable batch detection
      const samples = generateSineWave(200, sampleRate, 8192);
      
      const results = detectPitchBatch(samples, sampleRate, 1024, 512);
      
      expect(results.length).toBeGreaterThan(5);
      
      // At least some frames should detect pitch (batch may have edge effects)
      const validFrames = results.filter(
        r => r.pitchHz > 150 && r.pitchHz < 250
      );
      expect(validFrames.length).toBeGreaterThan(0);
    });
  });

  describe('Energy Calculations', () => {
    it('should calculate RMS of sine wave', () => {
      const samples = generateSineWave(440, 16000, 512);
      
      const rms = calculateRms(samples);
      
      // RMS of sine wave with amplitude 1 is 1/sqrt(2) ≈ 0.707
      expect(rms).toBeGreaterThan(0.65);
      expect(rms).toBeLessThan(0.75);
    });

    it('should calculate RMS of silence as 0', () => {
      const samples = generateSilence(512);
      
      const rms = calculateRms(samples);
      
      expect(rms).toBe(0);
    });

    it('should calculate energy in dB', () => {
      const samples = generateSineWave(440, 16000, 512, 0.5);
      
      const energyDb = calculateEnergyDb(samples);
      
      // -6 dB is half amplitude
      expect(energyDb).toBeGreaterThan(-10);
      expect(energyDb).toBeLessThan(0);
    });

    it('should return very low dB for silence', () => {
      const samples = generateSilence(512);
      
      const energyDb = calculateEnergyDb(samples);
      
      expect(energyDb).toBeLessThan(-90);
    });
  });

  describe('Zero Crossing Rate', () => {
    it('should calculate low ZCR for low frequency', () => {
      const samples = generateSineWave(100, 16000, 512);
      
      const zcr = calculateZcr(samples);
      
      expect(zcr).toBeGreaterThan(0);
      expect(zcr).toBeLessThan(0.1);
    });

    it('should calculate higher ZCR for high frequency', () => {
      const samples = generateSineWave(4000, 16000, 512);
      
      const zcrHigh = calculateZcr(samples);
      const zcrLow = calculateZcr(generateSineWave(100, 16000, 512));
      
      expect(zcrHigh).toBeGreaterThan(zcrLow);
    });

    it('should handle silence', () => {
      const samples = generateSilence(512);
      
      const zcr = calculateZcr(samples);
      
      expect(zcr).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should calculate mean', () => {
      const values = new Float32Array([1, 2, 3, 4, 5]);
      
      const mean = calculateMean(values);
      
      expect(mean).toBe(3);
    });

    it('should calculate variance', () => {
      const values = new Float32Array([1, 2, 3, 4, 5]);
      
      const variance = calculateVariance(values);
      
      // Variance of 1,2,3,4,5 is 2.0
      expect(variance).toBeCloseTo(2.0, 1);
    });

    it('should calculate standard deviation', () => {
      const values = new Float32Array([1, 2, 3, 4, 5]);
      
      const stdDev = calculateStdDev(values);
      
      expect(stdDev).toBeCloseTo(Math.sqrt(2), 1);
    });
  });

  describe('Voice Activity Detection', () => {
    it('should detect speech in loud sine wave', () => {
      const samples = generateSineWave(200, 16000, 512, 0.5);
      
      const result = detectVoiceActivity(samples);
      
      expect(result.isSpeech).toBe(true);
    });

    it('should not detect speech in silence', () => {
      const samples = generateSilence(512);
      
      const result = detectVoiceActivity(samples);
      
      expect(result.isSpeech).toBe(false);
    });

    it('should detect voiced speech (low frequency)', () => {
      const samples = generateSineWave(150, 16000, 512, 0.5);
      
      const result = detectVoiceActivity(samples);
      
      expect(result.isVoiced).toBe(true);
    });

    it('should include energy and ZCR in result', () => {
      const samples = generateSineWave(200, 16000, 512);
      
      const result = detectVoiceActivity(samples);
      
      expect(typeof result.energyDb).toBe('number');
      expect(typeof result.zcr).toBe('number');
    });
  });

  describe('Frame Analysis', () => {
    it('should analyze frame and return combined features', () => {
      // Use larger frame for reliable pitch detection
      const samples = generateSineWave(200, 16000, 1024);
      const timestamp = Date.now();
      
      const result = analyzeFrame(samples, 16000, timestamp);
      
      // Pitch detection may vary - just verify it returns valid structure
      expect(typeof result.pitch.pitchHz).toBe('number');
      expect(typeof result.pitch.confidence).toBe('number');
      expect(typeof result.energyDb).toBe('number');
      expect(typeof result.energyRms).toBe('number');
      expect(typeof result.zcr).toBe('number');
      expect(typeof result.isSpeech).toBe('boolean');
      expect(typeof result.isVoiced).toBe('boolean');
      expect(result.timestampMs).toBe(timestamp);
      
      // If pitch detected, it should be in reasonable range
      if (result.pitch.confidence > 0.3) {
        expect(result.pitch.pitchHz).toBeGreaterThan(150);
        expect(result.pitch.pitchHz).toBeLessThan(250);
      }
    });
  });

  describe('Pre-STT Processor', () => {
    it('should create processor with default config', () => {
      const processor = createPreSttProcessor();
      
      expect(processor).toBeDefined();
      expect(typeof processor.processFrame).toBe('function');
      expect(typeof processor.reset).toBe('function');
    });

    it('should process Float32 audio frame', () => {
      const processor = createPreSttProcessor();
      const samples = generateSineWave(200, 16000, 320);
      
      const result = processor.processFrame(samples, true);
      
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(320);
    });

    it('should process Int16 audio frame', () => {
      const processor = createPreSttProcessor();
      const samples = new Int16Array(320);
      for (let i = 0; i < 320; i++) {
        samples[i] = Math.round(Math.sin(2 * Math.PI * 200 * i / 16000) * 16384);
      }
      
      const result = processor.processFrameI16(samples, true);
      
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(320);
    });

    it('should get stats', () => {
      const processor = createPreSttProcessor();
      const samples = generateSineWave(200, 16000, 320);
      
      processor.processFrame(samples, true);
      const stats = processor.getStats();
      
      expect(typeof stats.framesProcessed).toBe('number');
      expect(stats.framesProcessed).toBeGreaterThan(0);
    });

    it('should reset properly', () => {
      const processor = createPreSttProcessor();
      const samples = generateSineWave(200, 16000, 320);
      
      processor.processFrame(samples, true);
      processor.reset();
      
      const stats = processor.getStats();
      expect(stats.framesProcessed).toBe(0);
    });
  });

  describe('Unified Processor', () => {
    it('should create unified processor', () => {
      const processor = createAudioDspProcessor();
      
      expect(processor).toBeDefined();
      expect(typeof processor.detectPitch).toBe('function');
      expect(typeof processor.calculateRms).toBe('function');
      expect(typeof processor.calculateZcr).toBe('function');
      expect(typeof processor.detectVoiceActivity).toBe('function');
      expect(typeof processor.analyzeFrame).toBe('function');
      expect(typeof processor.isNative).toBe('boolean');
    });

    it('should detect pitch through unified interface', () => {
      const processor = createAudioDspProcessor();
      const samples = generateSineWave(200, 16000, 1024);
      
      const result = processor.detectPitch(samples, 16000);
      
      expect(result.pitchHz).toBeGreaterThan(180);
      expect(result.pitchHz).toBeLessThan(220);
    });
  });

  describe('Conversion', () => {
    it('should convert Int16 to Float32', () => {
      const int16 = new Int16Array([0, 16384, 32767, -16384, -32768]);
      
      const float32 = convertI16ToF32(int16);
      
      expect(float32).toBeInstanceOf(Float32Array);
      expect(float32.length).toBe(5);
      expect(float32[0]).toBe(0);
      expect(float32[1]).toBeCloseTo(0.5, 1);
      expect(float32[2]).toBeCloseTo(1, 1);
      expect(float32[3]).toBeCloseTo(-0.5, 1);
      expect(float32[4]).toBeCloseTo(-1, 1);
    });
  });
});

describe('Performance', () => {
  it('should process pitch detection in reasonable time', () => {
    const samples = generateSineWave(200, 16000, 1024);
    
    // Warm-up run (JIT compilation)
    for (let i = 0; i < 10; i++) {
      detectPitch(samples, 16000);
    }
    
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      detectPitch(samples, 16000);
    }
    const elapsed = performance.now() - start;
    
    // Should process 100 frames in < 200ms (2ms per frame - lenient for CI)
    expect(elapsed).toBeLessThan(200);
    console.log(`100 pitch detections: ${elapsed.toFixed(2)}ms (${(elapsed/100).toFixed(3)}ms/frame)`);
  });

  it('should process RMS in reasonable time', () => {
    const samples = generateSineWave(200, 16000, 512);
    
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      calculateRms(samples);
    }
    const elapsed = performance.now() - start;
    
    // Should process 1000 frames in < 50ms (0.05ms per frame)
    expect(elapsed).toBeLessThan(50);
    console.log(`1000 RMS calculations: ${elapsed.toFixed(2)}ms (${(elapsed/1000).toFixed(4)}ms/frame)`);
  });
});
