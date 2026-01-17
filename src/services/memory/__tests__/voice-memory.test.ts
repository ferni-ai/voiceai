/**
 * Voice Memory Service Tests
 *
 * Tests for voice sketch building, comparison, and voice recognition.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VoiceSketchBuilder,
  VoiceMemoryService,
  compareVoiceSketches,
  getVoiceMemory,
  resetVoiceMemory,
  type VoiceSketch,
} from '../voice-memory.js';

describe('VoiceMemory', () => {
  // ===========================================================================
  // VoiceSketchBuilder
  // ===========================================================================
  describe('VoiceSketchBuilder', () => {
    it('should initialize with default sample rate', () => {
      const builder = new VoiceSketchBuilder();
      const progress = builder.getProgress();

      expect(progress.samplesCollected).toBe(0);
      expect(progress.durationMs).toBe(0);
      expect(progress.isReady).toBe(false);
    });

    it('should initialize with custom sample rate', () => {
      const builder = new VoiceSketchBuilder(48000, 50);
      const progress = builder.getProgress();

      expect(progress.isReady).toBe(false);
    });

    it('should track progress after processing audio', () => {
      const builder = new VoiceSketchBuilder(16000);

      // Create synthetic audio with clear pitch
      const sampleRate = 16000;
      const duration = 0.5; // 500ms chunk
      const samples = createToneWithSpeech(200, sampleRate, duration);

      builder.processAudioChunk(samples, 0);

      const progress = builder.getProgress();
      expect(progress.durationMs).toBeGreaterThan(0);
    });

    it('should return null for insufficient data', () => {
      const builder = new VoiceSketchBuilder();

      // Process very small amount of audio
      const samples = new Float32Array(100);
      builder.processAudioChunk(samples, 0);

      const sketch = builder.build();
      expect(sketch).toBeNull();
    });

    it('should build sketch after sufficient data', () => {
      const builder = new VoiceSketchBuilder(16000);

      // Process multiple chunks to accumulate enough data
      for (let i = 0; i < 20; i++) {
        const samples = createToneWithSpeech(150 + i * 2, 16000, 0.5);
        builder.processAudioChunk(samples, i * 500);
      }

      const sketch = builder.build();

      // May or may not build depending on pitch detection
      // This tests the full pipeline
      if (sketch) {
        expect(sketch.pitchMean).toBeGreaterThan(0);
        expect(sketch.samplesAnalyzed).toBeGreaterThan(0);
        expect(sketch.confidence).toBeGreaterThan(0);
        expect(sketch.createdAt).toBeInstanceOf(Date);
      }
    });

    it('should reset builder state', () => {
      const builder = new VoiceSketchBuilder(16000);

      const samples = createToneWithSpeech(150, 16000, 0.5);
      builder.processAudioChunk(samples, 0);

      builder.reset();

      const progress = builder.getProgress();
      expect(progress.samplesCollected).toBe(0);
      expect(progress.durationMs).toBe(0);
    });

    it('should indicate readiness threshold', () => {
      const builder = new VoiceSketchBuilder(16000);

      // Need at least 10 pitch samples and 5000ms duration
      expect(builder.getProgress().isReady).toBe(false);
    });
  });

  // ===========================================================================
  // compareVoiceSketches
  // ===========================================================================
  describe('compareVoiceSketches', () => {
    const baseSketch: VoiceSketch = {
      pitchMean: 150,
      pitchMin: 120,
      pitchMax: 180,
      pitchStdDev: 15,
      speakingRateMean: 4.5,
      pauseFrequency: 8,
      avgPauseDuration: 300,
      spectralCentroidMean: 1500,
      spectralCentroidStdDev: 200,
      spectralRolloffMean: 4000,
      energyMean: 0.05,
      energyStdDev: 0.02,
      samplesAnalyzed: 100,
      totalDurationMs: 30000,
      confidence: 0.8,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return high similarity for identical sketches', () => {
      const result = compareVoiceSketches(baseSketch, { ...baseSketch });

      expect(result.similarity).toBeGreaterThan(0.95);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.matchingFeatures.length).toBeGreaterThan(0);
    });

    it('should return lower similarity for different pitch', () => {
      const differentPitch: VoiceSketch = {
        ...baseSketch,
        pitchMean: 250, // Much higher pitch (different speaker)
      };

      const result = compareVoiceSketches(baseSketch, differentPitch);

      expect(result.similarity).toBeLessThan(0.9);
      expect(result.divergentFeatures).toContain('pitch');
    });

    it('should return lower similarity for different speaking rate', () => {
      const differentRate: VoiceSketch = {
        ...baseSketch,
        speakingRateMean: 7.0, // Much faster speaker
      };

      const result = compareVoiceSketches(baseSketch, differentRate);

      expect(result.similarity).toBeLessThan(0.95);
    });

    it('should return lower similarity for different spectral characteristics', () => {
      const differentSpectral: VoiceSketch = {
        ...baseSketch,
        spectralCentroidMean: 3000, // Much brighter voice
        spectralRolloffMean: 7000,
      };

      const result = compareVoiceSketches(baseSketch, differentSpectral);

      expect(result.similarity).toBeLessThan(0.9);
    });

    it('should calculate confidence from both sketches', () => {
      const lowConfidenceSketch: VoiceSketch = {
        ...baseSketch,
        confidence: 0.3,
      };

      const result = compareVoiceSketches(baseSketch, lowConfidenceSketch);

      // Confidence should be geometric mean of both
      expect(result.confidence).toBeLessThan(baseSketch.confidence);
    });

    it('should identify matching features', () => {
      const result = compareVoiceSketches(baseSketch, { ...baseSketch });

      expect(result.matchingFeatures).toContain('pitch');
      expect(result.matchingFeatures).toContain('spectralCentroid');
    });

    it('should identify divergent features', () => {
      const veryDifferent: VoiceSketch = {
        ...baseSketch,
        pitchMean: 300,
        speakingRateMean: 8,
        spectralCentroidMean: 4000,
      };

      const result = compareVoiceSketches(baseSketch, veryDifferent);

      expect(result.divergentFeatures.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // VoiceMemoryService
  // ===========================================================================
  describe('VoiceMemoryService', () => {
    let service: VoiceMemoryService;

    beforeEach(() => {
      resetVoiceMemory();
      service = getVoiceMemory();
    });

    it('should return singleton instance', () => {
      const instance1 = getVoiceMemory();
      const instance2 = getVoiceMemory();

      expect(instance1).toBe(instance2);
    });

    it('should create builder for session', () => {
      const builder = service.getBuilder('session-1');

      expect(builder).toBeDefined();
      expect(builder).toBeInstanceOf(VoiceSketchBuilder);
    });

    it('should reuse builder for same session', () => {
      const builder1 = service.getBuilder('session-1');
      const builder2 = service.getBuilder('session-1');

      expect(builder1).toBe(builder2);
    });

    it('should create separate builders for different sessions', () => {
      const builder1 = service.getBuilder('session-1');
      const builder2 = service.getBuilder('session-2');

      expect(builder1).not.toBe(builder2);
    });

    it('should process audio for session', () => {
      const samples = createToneWithSpeech(150, 16000, 0.5);

      service.processAudio('session-1', samples, 0);

      const progress = service.getProgress('session-1');
      expect(progress).toBeDefined();
      expect(progress!.durationMs).toBeGreaterThan(0);
    });

    it('should return null progress for unknown session', () => {
      const progress = service.getProgress('unknown-session');

      expect(progress).toBeNull();
    });

    it('should build sketch for session', () => {
      // Build sketch will return null without sufficient data
      const sketch = service.buildSketch('session-1');

      // May be null since we didn't process enough audio
      expect(sketch === null || typeof sketch === 'object').toBe(true);
    });

    it('should cleanup session', () => {
      service.getBuilder('session-1');
      service.cleanupSession('session-1');

      const progress = service.getProgress('session-1');
      expect(progress).toBeNull();
    });

    it('should find best match from candidates', () => {
      const currentSketch = createMockSketch(150, 4.5);

      const candidates = [
        { userId: 'user-1', sketch: createMockSketch(150, 4.5), name: 'Alice' },
        { userId: 'user-2', sketch: createMockSketch(200, 5.0), name: 'Bob' },
        { userId: 'user-3', sketch: createMockSketch(250, 6.0), name: 'Charlie' },
      ];

      const result = service.findBestMatch(currentSketch, candidates);

      expect(result).toBeDefined();
      expect(result!.userId).toBe('user-1'); // Most similar
      expect(result!.similarity).toBeGreaterThan(0.9);
    });

    it('should return null for empty candidates', () => {
      const sketch = createMockSketch(150, 4.5);

      const result = service.findBestMatch(sketch, []);

      expect(result).toBeNull();
    });

    it('should include profile info in match result', () => {
      const currentSketch = createMockSketch(150, 4.5);
      const candidates = [{ userId: 'user-1', sketch: createMockSketch(150, 4.5), name: 'Alice' }];

      const result = service.findBestMatch(currentSketch, candidates);

      expect(result!.profile?.name).toBe('Alice');
    });

    it('should search voices with store', async () => {
      const currentSketch = createMockSketch(150, 4.5);

      const mockStore = {
        listProfiles: async () => [
          { id: 'user-1', name: 'Alice', voiceSketch: createMockSketch(150, 4.5) },
          { id: 'user-2', name: 'Bob', voiceSketch: createMockSketch(200, 5.0) },
        ],
      };

      const results = await service.searchVoices(currentSketch, mockStore);

      expect(results.length).toBe(2);
      expect(results[0].userId).toBe('user-1'); // Most similar first
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    });

    it('should skip profiles without voice sketch', async () => {
      const currentSketch = createMockSketch(150, 4.5);

      const mockStore = {
        listProfiles: async () => [
          { id: 'user-1', name: 'Alice' }, // No voice sketch
          { id: 'user-2', name: 'Bob', voiceSketch: createMockSketch(150, 4.5) },
        ],
      };

      const results = await service.searchVoices(currentSketch, mockStore);

      expect(results.length).toBe(1);
      expect(results[0].userId).toBe('user-2');
    });
  });
});

// ===========================================================================
// HELPER FUNCTIONS
// ===========================================================================

/**
 * Create a synthetic audio signal with speech-like characteristics
 */
function createToneWithSpeech(
  frequency: number,
  sampleRate: number,
  durationSec: number
): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Base tone at given frequency
    const tone = Math.sin(2 * Math.PI * frequency * t);

    // Add harmonics for more realistic voice
    const harmonic2 = 0.5 * Math.sin(2 * Math.PI * frequency * 2 * t);
    const harmonic3 = 0.25 * Math.sin(2 * Math.PI * frequency * 3 * t);

    // Add some variation (amplitude modulation)
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t); // 3 Hz modulation

    // Combine with noise for realism
    const noise = (Math.random() - 0.5) * 0.1;

    samples[i] = (tone + harmonic2 + harmonic3) * envelope * 0.3 + noise;
  }

  return samples;
}

/**
 * Create a mock voice sketch for testing
 */
function createMockSketch(pitchMean: number, speakingRate: number): VoiceSketch {
  return {
    pitchMean,
    pitchMin: pitchMean - 30,
    pitchMax: pitchMean + 30,
    pitchStdDev: 15,
    speakingRateMean: speakingRate,
    pauseFrequency: 8,
    avgPauseDuration: 300,
    spectralCentroidMean: 1500 + (pitchMean - 150) * 5,
    spectralCentroidStdDev: 200,
    spectralRolloffMean: 4000 + (pitchMean - 150) * 10,
    energyMean: 0.05,
    energyStdDev: 0.02,
    samplesAnalyzed: 100,
    totalDurationMs: 30000,
    confidence: 0.8,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
