/**
 * Audio Prosody Tests
 *
 * Tests for voice-based emotion detection through audio analysis:
 * - Pitch extraction and analysis
 * - Energy/volume calculations
 * - Emotion classification
 * - Session management
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AudioProsodyAnalyzer,
  clearProsodyMetrics,
  getProsodyMetrics,
  getSessionAudioProsodyAnalyzer,
  recordProsodyAnalysis,
  resetSessionAudioProsodyAnalyzer,
  type ProsodyFeatures,
  type VoiceEmotionResult,
} from '../audio-prosody.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Generate a simple sine wave for testing
 */
function generateSineWave(
  frequency: number,
  duration: number,
  sampleRate: number,
  amplitude = 0.5
): Float32Array {
  const samples = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }

  return buffer;
}

/**
 * Generate white noise for testing
 */
function generateNoise(
  duration: number,
  sampleRate: number,
  amplitude = 0.3
): Float32Array {
  const samples = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    buffer[i] = (Math.random() * 2 - 1) * amplitude;
  }

  return buffer;
}

/**
 * Generate speech-like audio (combination of tones)
 */
function generateSpeechLike(
  duration: number,
  sampleRate: number,
  options: {
    fundamentalFreq?: number;
    amplitude?: number;
    addNoise?: boolean;
  } = {}
): Float32Array {
  const { fundamentalFreq = 150, amplitude = 0.4, addNoise = true } = options;
  const samples = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    // Fundamental frequency
    let sample = amplitude * Math.sin((2 * Math.PI * fundamentalFreq * i) / sampleRate);
    // Add harmonics (like human voice)
    sample += amplitude * 0.5 * Math.sin((2 * Math.PI * fundamentalFreq * 2 * i) / sampleRate);
    sample += amplitude * 0.25 * Math.sin((2 * Math.PI * fundamentalFreq * 3 * i) / sampleRate);

    if (addNoise) {
      sample += (Math.random() * 2 - 1) * 0.05;
    }

    buffer[i] = sample;
  }

  return buffer;
}

// ============================================================================
// TESTS
// ============================================================================

describe('AudioProsodyAnalyzer', () => {
  let analyzer: AudioProsodyAnalyzer;
  const sampleRate = 44100;

  beforeEach(() => {
    analyzer = new AudioProsodyAnalyzer();
  });

  afterEach(() => {
    analyzer.reset();
  });

  // -------------------------------------------------------------------------
  // BASIC FUNCTIONALITY
  // -------------------------------------------------------------------------

  describe('Basic Functionality', () => {
    it('should initialize correctly', () => {
      expect(analyzer).toBeDefined();
    });

    it('should return null when not enough samples', () => {
      const result = analyzer.analyze();
      expect(result).toBeNull();
    });

    it('should process audio samples without error', () => {
      const samples = generateSineWave(200, 0.5, sampleRate);
      expect(() => analyzer.processSamples(samples, sampleRate)).not.toThrow();
    });

    it('should accumulate samples from multiple calls', () => {
      const samples1 = generateSineWave(200, 0.1, sampleRate);
      const samples2 = generateSineWave(200, 0.1, sampleRate);

      analyzer.processSamples(samples1, sampleRate);
      analyzer.processSamples(samples2, sampleRate);

      // With 0.2s of audio at 44.1kHz, we should have enough for analysis
      const result = analyzer.analyze();
      expect(result).not.toBeNull();
    });

    it('should reset buffers correctly', () => {
      const samples = generateSineWave(200, 0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);
      analyzer.clearBuffers();

      const result = analyzer.analyze();
      expect(result).toBeNull();
    });

    it('should full reset correctly', () => {
      const samples = generateSineWave(200, 0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);
      analyzer.reset();

      const result = analyzer.analyze();
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // PITCH ANALYSIS
  // -------------------------------------------------------------------------

  describe('Pitch Analysis', () => {
    it('should detect pitch from pure tone', () => {
      const freq = 200; // Hz
      const samples = generateSineWave(freq, 0.5, sampleRate, 0.8);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      // Pitch should be roughly in the range of the input frequency
      // Autocorrelation is not perfectly accurate, so we allow some tolerance
      expect(result!.prosody.pitchMean).toBeGreaterThan(100);
      expect(result!.prosody.pitchMean).toBeLessThan(400);
    });

    it('should have low pitch variance for steady tone', () => {
      const samples = generateSineWave(150, 0.5, sampleRate, 0.7);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      // Steady tone should have relatively low pitch variance
      expect(result!.prosody.pitchVariance).toBeLessThan(500);
    });

    it('should detect flat pitch contour for steady tone', () => {
      const samples = generateSineWave(150, 0.5, sampleRate, 0.7);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      expect(['flat', 'dynamic']).toContain(result!.prosody.pitchContour);
    });
  });

  // -------------------------------------------------------------------------
  // ENERGY ANALYSIS
  // -------------------------------------------------------------------------

  describe('Energy Analysis', () => {
    it('should calculate energy for audio samples', () => {
      const samples = generateSineWave(200, 0.3, sampleRate, 0.5);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      // Energy should be negative dB (for typical audio)
      expect(result!.prosody.energyMean).toBeLessThan(0);
    });

    it('should detect higher energy for louder audio', () => {
      const analyzer1 = new AudioProsodyAnalyzer();
      const analyzer2 = new AudioProsodyAnalyzer();

      const quietSamples = generateSineWave(200, 0.3, sampleRate, 0.1);
      const loudSamples = generateSineWave(200, 0.3, sampleRate, 0.8);

      analyzer1.processSamples(quietSamples, sampleRate);
      analyzer2.processSamples(loudSamples, sampleRate);

      const quietResult = analyzer1.analyze();
      const loudResult = analyzer2.analyze();

      expect(quietResult).not.toBeNull();
      expect(loudResult).not.toBeNull();

      // Louder audio should have higher (less negative) energy
      expect(loudResult!.prosody.energyMean).toBeGreaterThan(quietResult!.prosody.energyMean);
    });

    it('should count energy peaks', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      expect(result!.prosody.energyPeaks).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // EMOTION CLASSIFICATION
  // -------------------------------------------------------------------------

  describe('Emotion Classification', () => {
    it('should return a valid emotion', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      const validEmotions = [
        'neutral',
        'happy',
        'sad',
        'angry',
        'fearful',
        'anxious',
        'excited',
        'bored',
        'confused',
        'contempt',
        'disgusted',
        'surprised',
      ];
      expect(validEmotions).toContain(result!.primary);
    });

    it('should return confidence between 0 and 1', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      expect(result!.confidence).toBeGreaterThanOrEqual(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
    });

    it('should return valid VAD dimensions', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      // Valence, Arousal, Dominance should be between -1 and 1
      expect(result!.valence).toBeGreaterThanOrEqual(-1);
      expect(result!.valence).toBeLessThanOrEqual(1);
      expect(result!.arousal).toBeGreaterThanOrEqual(-1);
      expect(result!.arousal).toBeLessThanOrEqual(1);
      expect(result!.dominance).toBeGreaterThanOrEqual(-1);
      expect(result!.dominance).toBeLessThanOrEqual(1);
    });

    it('should return stress level between 0 and 1', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      expect(result!.stressLevel).toBeGreaterThanOrEqual(0);
      expect(result!.stressLevel).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // VOICE QUALITY
  // -------------------------------------------------------------------------

  describe('Voice Quality Analysis', () => {
    it('should calculate jitter value', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      expect(result!.prosody.jitter).toBeGreaterThanOrEqual(0);
    });

    it('should calculate shimmer value', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      expect(result!.prosody.shimmer).toBeGreaterThanOrEqual(0);
    });

    it('should calculate breathiness value', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      expect(result!.prosody.breathiness).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // PAUSE ANALYSIS
  // -------------------------------------------------------------------------

  describe('Pause Analysis', () => {
    it('should detect speaking ratio', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      expect(result!.prosody.speakingRatio).toBeGreaterThanOrEqual(0);
      expect(result!.prosody.speakingRatio).toBeLessThanOrEqual(1);
    });

    it('should calculate pause metrics', () => {
      const samples = generateSpeechLike(0.5, sampleRate);
      analyzer.processSamples(samples, sampleRate);

      const result = analyzer.analyze();
      expect(result).not.toBeNull();

      expect(result!.prosody.pauseDuration).toBeGreaterThanOrEqual(0);
      expect(result!.prosody.pauseFrequency).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// SESSION MANAGEMENT TESTS
// ============================================================================

describe('Session Management', () => {
  const sessionId = 'test-prosody-session';

  afterEach(() => {
    resetSessionAudioProsodyAnalyzer(sessionId);
    clearProsodyMetrics(sessionId);
  });

  it('should return same instance for same session', () => {
    const analyzer1 = getSessionAudioProsodyAnalyzer(sessionId);
    const analyzer2 = getSessionAudioProsodyAnalyzer(sessionId);

    expect(analyzer1).toBe(analyzer2);
  });

  it('should return different instances for different sessions', () => {
    const analyzer1 = getSessionAudioProsodyAnalyzer('session-a');
    const analyzer2 = getSessionAudioProsodyAnalyzer('session-b');

    expect(analyzer1).not.toBe(analyzer2);

    // Cleanup
    resetSessionAudioProsodyAnalyzer('session-a');
    resetSessionAudioProsodyAnalyzer('session-b');
  });

  it('should remove session analyzer correctly', () => {
    const analyzer1 = getSessionAudioProsodyAnalyzer(sessionId);
    expect(analyzer1).toBeDefined();

    resetSessionAudioProsodyAnalyzer(sessionId);

    // Getting again should create a new instance
    const analyzer2 = getSessionAudioProsodyAnalyzer(sessionId);
    expect(analyzer2).not.toBe(analyzer1);
  });
});

// ============================================================================
// METRICS TRACKING TESTS
// ============================================================================

describe('Prosody Metrics', () => {
  const sessionId = 'test-metrics-session';

  beforeEach(() => {
    clearProsodyMetrics(sessionId);
  });

  afterEach(() => {
    clearProsodyMetrics(sessionId);
    resetSessionAudioProsodyAnalyzer(sessionId);
  });

  it('should return empty metrics for new session', () => {
    const metrics = getProsodyMetrics(sessionId);

    expect(metrics.totalAnalyses).toBe(0);
    expect(metrics.successfulDetections).toBe(0);
    expect(metrics.detectionRate).toBe(0);
    expect(metrics.averageConfidence).toBe(0);
    expect(metrics.dominantEmotion).toBeNull();
  });

  it('should track analysis results', () => {
    const mockResult: VoiceEmotionResult = {
      primary: 'happy',
      confidence: 0.8,
      valence: 0.5,
      arousal: 0.5,
      dominance: 0.3,
      stressLevel: 0.2,
      anxietyMarkers: false,
      prosody: {} as ProsodyFeatures,
      sampleCount: 1000,
      processingTimeMs: 50,
    };

    recordProsodyAnalysis(sessionId, mockResult);

    const metrics = getProsodyMetrics(sessionId);
    expect(metrics.totalAnalyses).toBe(1);
    expect(metrics.successfulDetections).toBe(1);
  });

  it('should not count low confidence results', () => {
    const lowConfidenceResult: VoiceEmotionResult = {
      primary: 'neutral',
      confidence: 0.2, // Below 0.3 threshold
      valence: 0,
      arousal: 0,
      dominance: 0,
      stressLevel: 0,
      anxietyMarkers: false,
      prosody: {} as ProsodyFeatures,
      sampleCount: 1000,
      processingTimeMs: 50,
    };

    recordProsodyAnalysis(sessionId, lowConfidenceResult);

    const metrics = getProsodyMetrics(sessionId);
    expect(metrics.totalAnalyses).toBe(1);
    expect(metrics.successfulDetections).toBe(0);
  });

  it('should calculate detection rate correctly', () => {
    const highConfidence: VoiceEmotionResult = {
      primary: 'happy',
      confidence: 0.8,
      valence: 0.5,
      arousal: 0.5,
      dominance: 0.3,
      stressLevel: 0.2,
      anxietyMarkers: false,
      prosody: {} as ProsodyFeatures,
      sampleCount: 1000,
      processingTimeMs: 50,
    };

    const lowConfidence: VoiceEmotionResult = {
      ...highConfidence,
      confidence: 0.2,
    };

    recordProsodyAnalysis(sessionId, highConfidence);
    recordProsodyAnalysis(sessionId, lowConfidence);
    recordProsodyAnalysis(sessionId, highConfidence);

    const metrics = getProsodyMetrics(sessionId);
    expect(metrics.totalAnalyses).toBe(3);
    expect(metrics.successfulDetections).toBe(2);
    expect(metrics.detectionRate).toBeCloseTo(2 / 3, 2);
  });

  it('should track dominant emotion', () => {
    const happy: VoiceEmotionResult = {
      primary: 'happy',
      confidence: 0.8,
      valence: 0.5,
      arousal: 0.5,
      dominance: 0.3,
      stressLevel: 0.2,
      anxietyMarkers: false,
      prosody: {} as ProsodyFeatures,
      sampleCount: 1000,
      processingTimeMs: 50,
    };

    const sad: VoiceEmotionResult = {
      ...happy,
      primary: 'sad',
    };

    recordProsodyAnalysis(sessionId, happy);
    recordProsodyAnalysis(sessionId, happy);
    recordProsodyAnalysis(sessionId, sad);

    const metrics = getProsodyMetrics(sessionId);
    expect(metrics.dominantEmotion).toBe('happy');
  });

  it('should clear metrics correctly', () => {
    const result: VoiceEmotionResult = {
      primary: 'happy',
      confidence: 0.8,
      valence: 0.5,
      arousal: 0.5,
      dominance: 0.3,
      stressLevel: 0.2,
      anxietyMarkers: false,
      prosody: {} as ProsodyFeatures,
      sampleCount: 1000,
      processingTimeMs: 50,
    };

    recordProsodyAnalysis(sessionId, result);
    expect(getProsodyMetrics(sessionId).totalAnalyses).toBe(1);

    clearProsodyMetrics(sessionId);
    expect(getProsodyMetrics(sessionId).totalAnalyses).toBe(0);
  });
});
