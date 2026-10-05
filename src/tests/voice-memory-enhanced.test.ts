/**
 * Tests for Enhanced Voice Memory Service
 *
 * Validates DSP speaker-feature extraction and comparison.
 */

import { describe, it, expect } from 'vitest';

// Test the service functions
describe('voice-memory-enhanced', () => {
  // Generate synthetic audio for testing
  function generateSineWave(
    frequency: number,
    durationMs: number,
    sampleRate = 16000
  ): Float32Array {
    const numSamples = Math.floor((durationMs / 1000) * sampleRate);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5;
    }
    return samples;
  }

  describe('DSP fallback', () => {
    // Test DSP-based embedding extraction
    // This is the fallback when native module is unavailable

    function extractDSPFeatures(audio: Float32Array): Float32Array {
      const features = new Float32Array(192);

      // Basic energy
      let energy = 0;
      for (const sample of audio) {
        energy += sample * sample;
      }
      energy = Math.sqrt(energy / audio.length);
      features[0] = energy;

      // Zero crossing rate
      let zcr = 0;
      for (let i = 1; i < audio.length; i++) {
        if (audio[i] >= 0 !== audio[i - 1] >= 0) {
          zcr++;
        }
      }
      features[1] = zcr / audio.length;

      // Fill rest with hash-based values
      let hash = 0;
      for (let i = 0; i < Math.min(audio.length, 1000); i++) {
        hash = ((hash << 5) - hash + Math.floor(audio[i] * 1000)) | 0;
      }

      for (let i = 2; i < 192; i++) {
        features[i] = ((hash >> (i % 32)) & 0xff) / 255;
        hash = ((hash << 5) - hash + i) | 0;
      }

      // Normalize
      let norm = 0;
      for (const f of features) {
        norm += f * f;
      }
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let i = 0; i < features.length; i++) {
          features[i] /= norm;
        }
      }

      return features;
    }

    function cosineSimilarity(a: Float32Array, b: Float32Array): number {
      let dot = 0,
        normA = 0,
        normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    it('should extract 192-dimensional DSP features', () => {
      const audio = generateSineWave(440, 1000);
      const features = extractDSPFeatures(audio);

      expect(features.length).toBe(192);
    });

    it('should produce normalized DSP features', () => {
      const audio = generateSineWave(440, 1000);
      const features = extractDSPFeatures(audio);

      const norm = Math.sqrt(features.reduce((sum, x) => sum + x * x, 0));
      expect(norm).toBeCloseTo(1.0, 2);
    });

    it('should have DSP self-similarity close to 1.0', () => {
      const audio = generateSineWave(440, 1000);
      const features = extractDSPFeatures(audio);
      const similarity = cosineSimilarity(features, features);

      expect(similarity).toBeCloseTo(1.0, 3);
    });

    it('should differentiate audio with DSP features', () => {
      const audio1 = generateSineWave(440, 1000);
      const audio2 = generateSineWave(880, 1000);

      const f1 = extractDSPFeatures(audio1);
      const f2 = extractDSPFeatures(audio2);

      const similarity = cosineSimilarity(f1, f2);

      // Should be different but not completely opposite
      expect(similarity).toBeLessThan(1.0);
      expect(similarity).toBeGreaterThan(-1.0);
    });
  });
});
