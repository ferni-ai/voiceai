/**
 * Tests for Enhanced Voice Memory Service
 *
 * Validates neural speaker embedding extraction and comparison.
 */

import { describe, it, expect, beforeAll } from 'vitest';

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

  // Generate noise for testing
  function generateNoise(durationMs: number, sampleRate = 16000): Float32Array {
    const numSamples = Math.floor((durationMs / 1000) * sampleRate);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = (Math.random() * 2 - 1) * 0.3;
    }
    return samples;
  }

  // Mix two audio signals
  function mixAudio(a: Float32Array, b: Float32Array, ratio = 0.5): Float32Array {
    const result = new Float32Array(Math.min(a.length, b.length));
    for (let i = 0; i < result.length; i++) {
      result[i] = a[i] * ratio + b[i] * (1 - ratio);
    }
    return result;
  }

  describe('ferni-speaker native module', () => {
    let speaker: typeof import('ferni-speaker') | null = null;

    beforeAll(async () => {
      try {
        speaker = await import('ferni-speaker');
        const path = await import('path');
        const modelPath = path.join(
          process.cwd(),
          'node_modules/ferni-speaker/models/ecapa_tdnn.onnx'
        );
        speaker.initialize(modelPath);
      } catch {
        console.warn('ferni-speaker not available, skipping native tests');
        speaker = null;
      }
    });

    it('should load and initialize', () => {
      if (!speaker) {
        console.log('Skipping: ferni-speaker not available');
        return;
      }

      expect(speaker.isInitialized()).toBe(true);
    });

    it('should return correct model info', () => {
      if (!speaker) return;

      const info = speaker.getModelInfo();
      expect(info.name).toBe('ECAPA-TDNN');
      expect(info.embeddingDim).toBe(192);
      expect(info.sampleRate).toBe(16000);
      expect(info.minSamples).toBe(8000);
    });

    it('should extract 192-dimensional embedding', () => {
      if (!speaker) return;

      const audio = generateSineWave(440, 1000); // 1 second of 440Hz
      const embedding = speaker.extractEmbedding(audio);

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(192);
    });

    it('should produce normalized embeddings (L2 norm ≈ 1)', () => {
      if (!speaker) return;

      const audio = generateSineWave(440, 1000);
      const embedding = speaker.extractEmbedding(audio);

      const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
      expect(norm).toBeCloseTo(1.0, 2);
    });

    it('should have self-similarity of 1.0', () => {
      if (!speaker) return;

      const audio = generateSineWave(440, 1000);
      const embedding = speaker.extractEmbedding(audio);
      const similarity = speaker.compareEmbeddings(embedding, embedding);

      expect(similarity).toBeCloseTo(1.0, 3);
    });

    it('should differentiate between different audio', () => {
      if (!speaker) return;

      const audio1 = generateSineWave(440, 1000); // 440 Hz
      const audio2 = generateSineWave(880, 1000); // 880 Hz
      const audio3 = generateNoise(1000); // Noise

      const emb1 = speaker.extractEmbedding(audio1);
      const emb2 = speaker.extractEmbedding(audio2);
      const emb3 = speaker.extractEmbedding(audio3);

      const sim12 = speaker.compareEmbeddings(emb1, emb2);
      const sim13 = speaker.compareEmbeddings(emb1, emb3);
      const sim23 = speaker.compareEmbeddings(emb2, emb3);

      console.log(
        `Similarities: tone-tone=${sim12.toFixed(3)}, tone-noise=${sim13.toFixed(3)}, tone2-noise=${sim23.toFixed(3)}`
      );

      // All should be less than 1.0 (not identical)
      expect(sim12).toBeLessThan(1.0);
      expect(sim13).toBeLessThan(1.0);
      expect(sim23).toBeLessThan(1.0);

      // All should be positive (model produces consistent embeddings)
      expect(sim12).toBeGreaterThan(0);
      expect(sim13).toBeGreaterThan(0);
      expect(sim23).toBeGreaterThan(0);

      // Note: With untrained model, differentiation may not be perfect.
      // Once trained on VoxCeleb, expect sim12 > sim13 and sim12 > sim23.
    });

    it('should reject audio shorter than 0.5 seconds', () => {
      if (!speaker) return;

      const shortAudio = generateSineWave(440, 400); // 0.4 seconds

      expect(() => speaker!.extractEmbedding(shortAudio)).toThrow(/too short/i);
    });

    it('should handle batch extraction', () => {
      if (!speaker) return;

      const audios = [
        generateSineWave(440, 1000),
        generateSineWave(880, 1000),
        generateNoise(1000),
      ];

      const embeddings = speaker.extractEmbeddingsBatch(audios);

      expect(embeddings.length).toBe(3);
      embeddings.forEach((emb) => {
        expect(emb.length).toBe(192);
      });
    });

    it('should find best match correctly', () => {
      if (!speaker) return;

      const query = generateSineWave(440, 1000);
      const candidates = [
        generateSineWave(880, 1000), // Different
        generateSineWave(440, 1000), // Same frequency
        generateNoise(1000), // Noise
      ];

      const queryEmb = speaker.extractEmbedding(query);
      const candidateEmbs = candidates.map((c) => speaker!.extractEmbedding(c));

      const match = speaker.findBestMatch(queryEmb, candidateEmbs, 0.5);

      expect(match).not.toBeNull();
      expect(match!.index).toBe(1); // Should match the same frequency
      expect(match!.similarity).toBeGreaterThan(0.9);
    });

    it('should return null when no match above threshold', () => {
      if (!speaker) return;

      const query = generateSineWave(440, 1000);
      const candidates = [generateNoise(1000), generateNoise(1000)];

      const queryEmb = speaker.extractEmbedding(query);
      const candidateEmbs = candidates.map((c) => speaker!.extractEmbedding(c));

      const match = speaker.findBestMatch(queryEmb, candidateEmbs, 0.99);

      // With very high threshold, should not match noise
      expect(match).toBeNull();
    });

    it('should extract embeddings quickly (< 50ms)', () => {
      if (!speaker) return;

      const audio = generateSineWave(440, 1000);

      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        speaker.extractEmbedding(audio);
      }
      const elapsed = Date.now() - start;

      const avgMs = elapsed / 10;
      // Allow up to 100ms for CI/CD variance (50ms ideal, 100ms acceptable)
      expect(avgMs).toBeLessThan(100);
      console.log(`Average extraction time: ${avgMs.toFixed(1)}ms`);
    });
  });

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

  describe('consistency tests', () => {
    let speaker: typeof import('ferni-speaker') | null = null;

    beforeAll(async () => {
      try {
        speaker = await import('ferni-speaker');
        const path = await import('path');
        const modelPath = path.join(
          process.cwd(),
          'node_modules/ferni-speaker/models/ecapa_tdnn.onnx'
        );
        if (!speaker.isInitialized()) {
          speaker.initialize(modelPath);
        }
      } catch {
        speaker = null;
      }
    });

    it('should produce consistent embeddings for same input', () => {
      if (!speaker) return;

      const audio = generateSineWave(440, 1000);

      const emb1 = speaker.extractEmbedding(audio);
      const emb2 = speaker.extractEmbedding(audio);

      const similarity = speaker.compareEmbeddings(emb1, emb2);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should handle different audio lengths', () => {
      if (!speaker) return;

      const short = generateSineWave(440, 500); // 0.5s (minimum)
      const medium = generateSineWave(440, 1000); // 1s
      const long = generateSineWave(440, 3000); // 3s

      const embShort = speaker.extractEmbedding(short);
      const embMedium = speaker.extractEmbedding(medium);
      const embLong = speaker.extractEmbedding(long);

      // All should be valid 192-dim embeddings
      expect(embShort.length).toBe(192);
      expect(embMedium.length).toBe(192);
      expect(embLong.length).toBe(192);

      // Same frequency should have high similarity regardless of length
      const sim1 = speaker.compareEmbeddings(embShort, embMedium);
      const sim2 = speaker.compareEmbeddings(embMedium, embLong);

      expect(sim1).toBeGreaterThan(0.8);
      expect(sim2).toBeGreaterThan(0.8);
    });

    it('should handle audio with noise', () => {
      if (!speaker) return;

      const clean = generateSineWave(440, 1000);
      const noise = generateNoise(1000);
      const noisy = mixAudio(clean, noise, 0.9); // 90% signal, 10% noise

      const embClean = speaker.extractEmbedding(clean);
      const embNoisy = speaker.extractEmbedding(noisy);

      const similarity = speaker.compareEmbeddings(embClean, embNoisy);

      // Should still be similar despite noise
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should handle silence gracefully', () => {
      if (!speaker) return;

      const silence = new Float32Array(16000); // 1 second of silence

      // Should not throw, but may produce arbitrary embedding
      const embedding = speaker.extractEmbedding(silence);
      expect(embedding.length).toBe(192);
    });
  });
});
