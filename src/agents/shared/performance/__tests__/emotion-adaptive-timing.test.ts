/**
 * Emotion-Adaptive Timing Tests
 *
 * Verifies that voice emotion adjusts response timing and filler strategy.
 */

import { describe, it, expect } from 'vitest';
import type { VoiceEmotionResult } from '../../../../speech/audio-prosody.js';
import {
  getEmotionAdjustedTiming,
  getEmotionFillerPhrases,
  applyEmotionTiming,
} from '../emotion-adaptive-timing.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeEmotion(
  primary: VoiceEmotionResult['primary'],
  overrides: Partial<VoiceEmotionResult> = {}
): VoiceEmotionResult {
  return {
    primary,
    confidence: 0.8,
    valence: 0,
    arousal: 0,
    dominance: 0,
    stressLevel: 0.2,
    anxietyMarkers: false,
    sampleCount: 1,
    processingTimeMs: 5,
    prosody: {
      pitchMean: 150,
      pitchVariance: 20,
      pitchRange: 50,
      pitchContour: 'flat' as const,
      energyMean: 60,
      energyVariance: 5,
      energyPeaks: 2,
      speechRate: 4.0,
      pauseDuration: 200,
      pauseFrequency: 3,
      jitter: 0.02,
      shimmer: 0.03,
      breathiness: 0.1,
      utteranceDuration: 2000,
      speakingRatio: 0.8,
    },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('EmotionAdaptiveTiming', () => {
  describe('getEmotionAdjustedTiming', () => {
    it('returns neutral defaults for undefined emotion', () => {
      const result = getEmotionAdjustedTiming(undefined);

      expect(result.responseDelayMultiplier).toBe(1.0);
      expect(result.fillerStyle).toBe('neutral');
      expect(result.fillerUrgency).toBe('normal');
    });

    it('returns faster timing for anxious/distressed users', () => {
      const result = getEmotionAdjustedTiming(makeEmotion('anxious'));

      expect(result.responseDelayMultiplier).toBe(0.7);
      expect(result.fillerStyle).toBe('warm');
      expect(result.fillerUrgency).toBe('high');
      expect(result.maxSilenceMs).toBeLessThan(600);
    });

    it('returns faster timing for fearful users', () => {
      const result = getEmotionAdjustedTiming(makeEmotion('fearful'));

      expect(result.responseDelayMultiplier).toBe(0.7);
      expect(result.fillerStyle).toBe('warm');
    });

    it('returns slightly faster timing for happy/excited users', () => {
      const result = getEmotionAdjustedTiming(makeEmotion('happy'));

      expect(result.responseDelayMultiplier).toBe(0.85);
      expect(result.fillerStyle).toBe('energetic');
      expect(result.fillerUrgency).toBe('normal');
    });

    it('returns normal speed with gentle fillers for sad users', () => {
      const result = getEmotionAdjustedTiming(makeEmotion('sad'));

      expect(result.responseDelayMultiplier).toBe(1.0);
      expect(result.fillerStyle).toBe('gentle');
      expect(result.fillerUrgency).toBe('low');
      expect(result.maxSilenceMs).toBeGreaterThan(600);
    });

    it('returns slower timing with no fillers for contemplative states', () => {
      const result = getEmotionAdjustedTiming(makeEmotion('confused'));

      expect(result.responseDelayMultiplier).toBe(1.3);
      expect(result.fillerStyle).toBe('none');
      expect(result.fillerUrgency).toBe('low');
      expect(result.maxSilenceMs).toBeGreaterThanOrEqual(1200);
    });

    it('returns fast timing with calm fillers for angry users', () => {
      const result = getEmotionAdjustedTiming(makeEmotion('angry'));

      expect(result.responseDelayMultiplier).toBe(0.75);
      expect(result.fillerStyle).toBe('calm');
      expect(result.fillerUrgency).toBe('high');
      expect(result.maxSilenceMs).toBeLessThan(400);
    });

    it('returns neutral for neutral emotion', () => {
      const result = getEmotionAdjustedTiming(makeEmotion('neutral'));

      expect(result.responseDelayMultiplier).toBe(1.0);
      expect(result.fillerStyle).toBe('neutral');
    });

    it('further speeds up response under high stress', () => {
      const highStress = makeEmotion('anxious', { stressLevel: 0.85 });
      const result = getEmotionAdjustedTiming(highStress);

      // High stress should push multiplier even lower than base 0.7
      expect(result.responseDelayMultiplier).toBeLessThan(0.7);
      expect(result.responseDelayMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(result.fillerUrgency).toBe('high');
    });

    it('caps the stress speed-up at 0.5x minimum', () => {
      const extremeStress = makeEmotion('angry', { stressLevel: 0.95 });
      const result = getEmotionAdjustedTiming(extremeStress);

      expect(result.responseDelayMultiplier).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('getEmotionFillerPhrases', () => {
    it('returns warm phrases for anxious emotion', () => {
      const phrases = getEmotionFillerPhrases('anxious');

      expect(phrases.length).toBeGreaterThan(0);
      expect(phrases).toContain("I hear you");
    });

    it('returns energetic phrases for happy emotion', () => {
      const phrases = getEmotionFillerPhrases('happy');

      expect(phrases.length).toBeGreaterThan(0);
      expect(phrases).toContain("Yes!");
    });

    it('returns gentle phrases for sad emotion', () => {
      const phrases = getEmotionFillerPhrases('sad');

      expect(phrases.length).toBeGreaterThan(0);
      expect(phrases).toContain("I understand");
    });

    it('returns empty array for contemplative states', () => {
      const phrases = getEmotionFillerPhrases('confused');

      expect(phrases).toEqual([]);
    });

    it('returns calm phrases for angry emotion', () => {
      const phrases = getEmotionFillerPhrases('angry');

      expect(phrases.length).toBeGreaterThan(0);
      expect(phrases).toContain("Let me help");
    });

    it('returns neutral phrases for unknown emotion', () => {
      const phrases = getEmotionFillerPhrases('unknown_emotion');

      expect(phrases.length).toBeGreaterThan(0);
      expect(phrases).toContain("Mm-hmm");
    });
  });

  describe('applyEmotionTiming', () => {
    it('applies multiplier to base delay', () => {
      const angry = makeEmotion('angry'); // 0.75x
      const result = applyEmotionTiming(400, angry);

      expect(result).toBe(300); // 400 * 0.75 = 300
    });

    it('returns base delay for undefined emotion', () => {
      const result = applyEmotionTiming(400, undefined);

      expect(result).toBe(400); // 400 * 1.0 = 400
    });

    it('slows down for contemplative states', () => {
      const confused = makeEmotion('confused'); // 1.3x
      const result = applyEmotionTiming(400, confused);

      expect(result).toBe(520); // 400 * 1.3 = 520
    });
  });
});
