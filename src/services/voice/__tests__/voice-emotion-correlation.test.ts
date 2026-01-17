/**
 * Voice Emotion Correlation Tests
 *
 * Tests for voice-emotion correlation analysis.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeEmotion,
  getEmotionAdjustedThreshold,
  analyzeAuthEmotionContext,
  type Emotion,
  type EmotionAnalysis,
} from '../voice-emotion-correlation.js';

// Helper to create test audio samples
function createTestAudio(
  length: number,
  options: {
    frequency?: number;
    amplitude?: number;
    noise?: number;
    sampleRate?: number;
  } = {}
): Float32Array {
  const { frequency = 200, amplitude = 0.5, noise = 0, sampleRate = 16000 } = options;
  const samples = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    // Sine wave
    const t = i / sampleRate;
    samples[i] = Math.sin(2 * Math.PI * frequency * t) * amplitude;
    // Add noise if specified
    if (noise > 0) {
      samples[i] += (Math.random() - 0.5) * 2 * noise;
    }
  }

  return samples;
}

describe('VoiceEmotionCorrelation', () => {
  // ===========================================================================
  // analyzeEmotion
  // ===========================================================================
  describe('analyzeEmotion', () => {
    it('should return EmotionAnalysis object with required properties', () => {
      const audio = createTestAudio(16000); // 1 second
      const result = analyzeEmotion(audio);

      expect(result).toHaveProperty('primary');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('arousal');
      expect(result).toHaveProperty('valence');
      expect(result).toHaveProperty('features');
      expect(result.features).toHaveProperty('pitchMean');
      expect(result.features).toHaveProperty('pitchVariance');
      expect(result.features).toHaveProperty('energy');
      expect(result.features).toHaveProperty('speechRate');
    });

    it('should return valid emotion type', () => {
      const audio = createTestAudio(16000);
      const result = analyzeEmotion(audio);

      const validEmotions: Emotion[] = [
        'neutral',
        'happy',
        'sad',
        'angry',
        'fearful',
        'surprised',
        'calm',
      ];
      expect(validEmotions).toContain(result.primary);
    });

    it('should return confidence between 0.3 and 1.0', () => {
      const audio = createTestAudio(16000);
      const result = analyzeEmotion(audio);

      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should return arousal in range -1 to 1', () => {
      const audio = createTestAudio(16000);
      const result = analyzeEmotion(audio);

      expect(result.arousal).toBeGreaterThanOrEqual(-1);
      expect(result.arousal).toBeLessThanOrEqual(1);
    });

    it('should return valence in range -1 to 1', () => {
      const audio = createTestAudio(16000);
      const result = analyzeEmotion(audio);

      expect(result.valence).toBeGreaterThanOrEqual(-1);
      expect(result.valence).toBeLessThanOrEqual(1);
    });

    it('should handle empty audio gracefully', () => {
      const audio = new Float32Array(0);
      const result = analyzeEmotion(audio);

      expect(result.primary).toBe('neutral');
      expect(result.features.pitchMean).toBe(0);
      expect(result.features.pitchVariance).toBe(0);
    });

    it('should handle very short audio', () => {
      const audio = createTestAudio(100); // Very short
      const result = analyzeEmotion(audio);

      expect(result).toHaveProperty('primary');
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('should detect different patterns with different input', () => {
      // Low amplitude, low frequency - should tend toward calm/sad
      const calmAudio = createTestAudio(16000, { frequency: 100, amplitude: 0.1 });
      const calmResult = analyzeEmotion(calmAudio);

      // High amplitude, high frequency - should tend toward happy/angry
      const excitedAudio = createTestAudio(16000, { frequency: 400, amplitude: 0.8 });
      const excitedResult = analyzeEmotion(excitedAudio);

      // They should have different arousal levels
      // Higher frequency and amplitude should mean higher arousal
      expect(excitedResult.features.energy).toBeGreaterThan(calmResult.features.energy);
    });

    it('should respect custom sample rate', () => {
      const audio = createTestAudio(8000, { sampleRate: 8000 }); // 1 second at 8kHz
      const result = analyzeEmotion(audio, 8000);

      expect(result).toHaveProperty('primary');
      expect(result.features.speechRate).toBeDefined();
    });

    it('should calculate pitch features from audio', () => {
      const audio = createTestAudio(32000, { frequency: 200 }); // 2 seconds
      const result = analyzeEmotion(audio);

      // Should have non-zero pitch mean for clear tone
      expect(result.features.pitchMean).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // getEmotionAdjustedThreshold
  // ===========================================================================
  describe('getEmotionAdjustedThreshold', () => {
    const baseThreshold = 0.7;

    it('should return same threshold for neutral emotion', () => {
      const emotion: EmotionAnalysis = {
        primary: 'neutral',
        confidence: 0.8,
        arousal: 0,
        valence: 0,
        features: { pitchMean: 150, pitchVariance: 100, energy: 0.3, speechRate: 200 },
      };

      const result = getEmotionAdjustedThreshold(baseThreshold, emotion);
      expect(result).toBe(baseThreshold);
    });

    it('should lower threshold for calm emotion', () => {
      const emotion: EmotionAnalysis = {
        primary: 'calm',
        confidence: 1.0,
        arousal: -0.5,
        valence: 0.5,
        features: { pitchMean: 120, pitchVariance: 50, energy: 0.2, speechRate: 150 },
      };

      const result = getEmotionAdjustedThreshold(baseThreshold, emotion);
      expect(result).toBeLessThan(baseThreshold);
    });

    it('should raise threshold for angry emotion', () => {
      const emotion: EmotionAnalysis = {
        primary: 'angry',
        confidence: 0.9,
        arousal: 0.7,
        valence: -0.6,
        features: { pitchMean: 250, pitchVariance: 800, energy: 0.8, speechRate: 350 },
      };

      const result = getEmotionAdjustedThreshold(baseThreshold, emotion);
      expect(result).toBeGreaterThan(baseThreshold);
    });

    it('should raise threshold for sad emotion', () => {
      const emotion: EmotionAnalysis = {
        primary: 'sad',
        confidence: 0.85,
        arousal: -0.5,
        valence: -0.5,
        features: { pitchMean: 100, pitchVariance: 200, energy: 0.15, speechRate: 120 },
      };

      const result = getEmotionAdjustedThreshold(baseThreshold, emotion);
      expect(result).toBeGreaterThan(baseThreshold);
    });

    it('should raise threshold for fearful emotion (highest adjustment)', () => {
      const emotion: EmotionAnalysis = {
        primary: 'fearful',
        confidence: 1.0,
        arousal: 0.3,
        valence: -0.7,
        features: { pitchMean: 300, pitchVariance: 1500, energy: 0.5, speechRate: 400 },
      };

      const result = getEmotionAdjustedThreshold(baseThreshold, emotion);
      // Fearful has the highest adjustment (+0.12)
      expect(result).toBeGreaterThan(baseThreshold);
      expect(result).toBeLessThanOrEqual(baseThreshold + 0.15); // Max cap
    });

    it('should scale adjustment by emotion confidence', () => {
      const lowConfidence: EmotionAnalysis = {
        primary: 'angry',
        confidence: 0.4,
        arousal: 0.5,
        valence: -0.5,
        features: { pitchMean: 200, pitchVariance: 500, energy: 0.6, speechRate: 300 },
      };

      const highConfidence: EmotionAnalysis = {
        primary: 'angry',
        confidence: 0.95,
        arousal: 0.5,
        valence: -0.5,
        features: { pitchMean: 200, pitchVariance: 500, energy: 0.6, speechRate: 300 },
      };

      const lowResult = getEmotionAdjustedThreshold(baseThreshold, lowConfidence);
      const highResult = getEmotionAdjustedThreshold(baseThreshold, highConfidence);

      // Higher confidence should mean larger adjustment
      expect(highResult).toBeGreaterThan(lowResult);
    });

    it('should cap adjustment at +/- 0.15', () => {
      const extremeEmotion: EmotionAnalysis = {
        primary: 'fearful',
        confidence: 1.0,
        arousal: 0.9,
        valence: -0.9,
        features: { pitchMean: 400, pitchVariance: 3000, energy: 1.0, speechRate: 500 },
      };

      const result = getEmotionAdjustedThreshold(baseThreshold, extremeEmotion);
      expect(result).toBeLessThanOrEqual(baseThreshold + 0.15);
      expect(result).toBeGreaterThanOrEqual(baseThreshold - 0.15);
    });

    it('should handle happy emotion with small increase', () => {
      const emotion: EmotionAnalysis = {
        primary: 'happy',
        confidence: 0.9,
        arousal: 0.6,
        valence: 0.6,
        features: { pitchMean: 200, pitchVariance: 400, energy: 0.6, speechRate: 280 },
      };

      const result = getEmotionAdjustedThreshold(baseThreshold, emotion);
      expect(result).toBeGreaterThan(baseThreshold);
      expect(result).toBeLessThan(baseThreshold + 0.1); // Happy has +0.05 adjustment
    });

    it('should handle surprised emotion', () => {
      const emotion: EmotionAnalysis = {
        primary: 'surprised',
        confidence: 0.8,
        arousal: 0.4,
        valence: 0.2,
        features: { pitchMean: 280, pitchVariance: 600, energy: 0.5, speechRate: 250 },
      };

      const result = getEmotionAdjustedThreshold(baseThreshold, emotion);
      expect(result).toBeGreaterThan(baseThreshold); // +0.05 adjustment
    });
  });

  // ===========================================================================
  // analyzeAuthEmotionContext
  // ===========================================================================
  describe('analyzeAuthEmotionContext', () => {
    it('should return complete context object', () => {
      const audio = createTestAudio(16000);
      const result = analyzeAuthEmotionContext(audio, 0.7, 0.65);

      expect(result).toHaveProperty('emotion');
      expect(result).toHaveProperty('adjustedThreshold');
      expect(result).toHaveProperty('originalThreshold');
      expect(result).toHaveProperty('shouldRetry');
      expect(result).toHaveProperty('userMessage');
    });

    it('should preserve original threshold in result', () => {
      const audio = createTestAudio(16000);
      const originalThreshold = 0.75;
      const result = analyzeAuthEmotionContext(audio, originalThreshold, 0.6);

      expect(result.originalThreshold).toBe(originalThreshold);
    });

    it('should set shouldRetry false when auth confidence is high', () => {
      const audio = createTestAudio(16000);
      const result = analyzeAuthEmotionContext(audio, 0.7, 0.85); // High auth confidence

      expect(result.shouldRetry).toBe(false);
    });

    it('should not suggest retry for neutral emotion', () => {
      // Create audio that tends toward neutral
      const audio = createTestAudio(16000, { frequency: 150, amplitude: 0.3 });
      const result = analyzeAuthEmotionContext(audio, 0.7, 0.65);

      // If emotion is neutral, shouldRetry should be false
      if (result.emotion.primary === 'neutral') {
        expect(result.shouldRetry).toBe(false);
      }
    });

    it('should include emotion analysis in result', () => {
      const audio = createTestAudio(16000);
      const result = analyzeAuthEmotionContext(audio, 0.7, 0.6);

      expect(result.emotion).toHaveProperty('primary');
      expect(result.emotion).toHaveProperty('confidence');
      expect(result.emotion).toHaveProperty('arousal');
      expect(result.emotion).toHaveProperty('valence');
    });

    it('should respect custom sample rate', () => {
      const audio = createTestAudio(8000, { sampleRate: 8000 });
      const result = analyzeAuthEmotionContext(audio, 0.7, 0.6, 8000);

      expect(result.emotion).toBeDefined();
      expect(result.adjustedThreshold).toBeDefined();
    });

    it('should calculate adjusted threshold based on detected emotion', () => {
      const audio = createTestAudio(16000);
      const result = analyzeAuthEmotionContext(audio, 0.7, 0.6);

      // Adjusted threshold should reflect emotion adjustments
      expect(typeof result.adjustedThreshold).toBe('number');
      expect(result.adjustedThreshold).toBeGreaterThan(0);
      expect(result.adjustedThreshold).toBeLessThan(1);
    });
  });
});
