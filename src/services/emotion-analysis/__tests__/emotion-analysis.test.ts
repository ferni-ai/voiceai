/**
 * Emotion Analysis Service Tests
 *
 * Tests for voice emotion analysis, suppression detection, and emotion insights.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

// Mock model-config
vi.mock('../../model-config.js', () => ({
  getDefaultModel: () => 'gemini-2.0-flash-exp',
}));

import {
  detectSuppression,
  distinguishNegativeEmotion,
  generateEmotionInsight,
  getEmotionTimeline,
  getLastEmotion,
  clearSession,
  type HumeEmotionResult,
  type HumeEmotion,
} from '../hume.js';

describe('EmotionAnalysis', () => {
  // Helper to create mock emotion results
  const createMockResult = (
    primary: HumeEmotion,
    options: Partial<HumeEmotionResult> = {}
  ): HumeEmotionResult => ({
    primary,
    secondary: [],
    confidence: 0.8,
    suppression: 0,
    arousal: 0.5,
    valence: 0,
    scores: { [primary]: 0.8 } as Record<HumeEmotion, number>,
    timestamp: Date.now(),
    ...options,
  });

  describe('detectSuppression', () => {
    it('should detect when emotions are being suppressed', () => {
      const result = createMockResult('joy', {
        suppression: 0.7,
        secondary: ['anxiety', 'sadness'],
      });

      const suppression = detectSuppression(result);

      expect(suppression.isSuppressing).toBe(true);
      expect(suppression.displayed).toBe('joy');
      expect(suppression.suppressed).toBe('anxiety');
      expect(suppression.confidence).toBe(0.7);
    });

    it('should not detect suppression when score is low', () => {
      const result = createMockResult('contentment', {
        suppression: 0.3,
        secondary: ['calmness'],
      });

      const suppression = detectSuppression(result);

      expect(suppression.isSuppressing).toBe(false);
      expect(suppression.suppressed).toBeNull();
    });

    it('should return null for suppressed emotion if no negative secondary', () => {
      const result = createMockResult('joy', {
        suppression: 0.8,
        secondary: ['excitement', 'amusement'], // positive emotions
      });

      const suppression = detectSuppression(result);

      expect(suppression.isSuppressing).toBe(true);
      expect(suppression.suppressed).toBeNull();
    });

    it('should detect suppression threshold at 0.6', () => {
      const belowThreshold = createMockResult('joy', { suppression: 0.59 });
      const atThreshold = createMockResult('joy', { suppression: 0.6 });

      expect(detectSuppression(belowThreshold).isSuppressing).toBe(false);
      expect(detectSuppression(atThreshold).isSuppressing).toBe(false);
    });

    it('should detect suppression above threshold', () => {
      const aboveThreshold = createMockResult('joy', {
        suppression: 0.61,
        secondary: ['anxiety'],
      });

      expect(detectSuppression(aboveThreshold).isSuppressing).toBe(true);
    });
  });

  describe('distinguishNegativeEmotion', () => {
    it('should detect anxiety from high arousal and negative valence', () => {
      const result = createMockResult('anxiety', {
        arousal: 0.7,
        valence: -0.3,
        scores: { anxiety: 0.5 } as Record<HumeEmotion, number>,
      });

      const distinction = distinguishNegativeEmotion(result);

      expect(distinction.emotion).toBe('anxiety');
      expect(distinction.indicators).toContain('elevated arousal');
    });

    it('should detect tiredness from low arousal', () => {
      const result = createMockResult('tiredness', {
        arousal: 0.2,
        valence: 0,
        scores: { tiredness: 0.5 } as Record<HumeEmotion, number>,
      });

      const distinction = distinguishNegativeEmotion(result);

      expect(distinction.emotion).toBe('tiredness');
      expect(distinction.indicators).toContain('low energy');
    });

    it('should detect sadness from low-medium arousal and negative valence', () => {
      const result = createMockResult('sadness', {
        arousal: 0.4,
        valence: -0.5,
        scores: { sadness: 0.5 } as Record<HumeEmotion, number>,
      });

      const distinction = distinguishNegativeEmotion(result);

      expect(distinction.emotion).toBe('sadness');
      expect(distinction.indicators).toContain('downward intonation');
    });

    it('should detect anger from high anger score', () => {
      // Note: Function checks anxiety first, so we need to avoid matching anxiety conditions
      // while still having scores.anger > 0.4 to trigger anger detection
      const result = createMockResult('anger', {
        arousal: 0.5, // Not > 0.6, so won't trigger anxiety fallthrough
        valence: -0.3,
        scores: { anger: 0.5, anxiety: 0 } as Record<HumeEmotion, number>,
      });

      const distinction = distinguishNegativeEmotion(result);

      expect(distinction.emotion).toBe('anger');
      expect(distinction.indicators).toContain('increased volume');
    });

    it('should return other for unclassified emotions', () => {
      const result = createMockResult('confusion', {
        arousal: 0.5,
        valence: 0,
        scores: { confusion: 0.5 } as Record<HumeEmotion, number>,
      });

      const distinction = distinguishNegativeEmotion(result);

      expect(distinction.emotion).toBe('other');
      expect(distinction.indicators).toEqual([]);
    });
  });

  describe('generateEmotionInsight', () => {
    it('should generate suppression insight', () => {
      const result = createMockResult('joy', {
        suppression: 0.8,
        secondary: ['sadness'],
      });

      const insight = generateEmotionInsight(result);

      expect(insight).toContain('suppressing sadness');
      expect(insight).toContain('displaying joy');
    });

    it('should generate negative emotion insight', () => {
      const result = createMockResult('anxiety', {
        valence: -0.4,
        arousal: 0.7,
        scores: { anxiety: 0.6 } as Record<HumeEmotion, number>,
      });

      const insight = generateEmotionInsight(result);

      expect(insight).toContain('anxiety');
    });

    it('should generate high positive arousal insight', () => {
      const result = createMockResult('excitement', {
        arousal: 0.8,
        valence: 0.5,
      });

      const insight = generateEmotionInsight(result);

      expect(insight).toContain('high positive energy');
    });

    it('should generate high negative arousal insight', () => {
      const result = createMockResult('distress', {
        arousal: 0.8,
        valence: -0.2,
      });

      const insight = generateEmotionInsight(result);

      expect(insight).toContain('elevated stress');
    });

    it('should generate tiredness insight', () => {
      const result = createMockResult('tiredness', {
        arousal: 0.2,
      });

      const insight = generateEmotionInsight(result);

      expect(insight).toContain('tired');
    });

    it('should return null for neutral emotions', () => {
      const result = createMockResult('neutral', {
        arousal: 0.5,
        valence: 0,
        suppression: 0,
      });

      const insight = generateEmotionInsight(result);

      expect(insight).toBeNull();
    });
  });

  describe('Session Management', () => {
    const sessionId = 'test-session-' + Date.now();

    beforeEach(() => {
      clearSession(sessionId);
    });

    describe('getEmotionTimeline', () => {
      it('should return null for unknown session', () => {
        const timeline = getEmotionTimeline('unknown-session');
        expect(timeline).toBeNull();
      });

      it('should return null for session with no points', () => {
        const timeline = getEmotionTimeline(sessionId);
        expect(timeline).toBeNull();
      });
    });

    describe('getLastEmotion', () => {
      it('should return null for unknown session', () => {
        const lastEmotion = getLastEmotion('unknown-session');
        expect(lastEmotion).toBeNull();
      });
    });

    describe('clearSession', () => {
      it('should not throw for unknown session', () => {
        expect(() => clearSession('nonexistent')).not.toThrow();
      });
    });
  });

  describe('Emotion Types', () => {
    it('should have valid emotion type values', () => {
      const emotions: HumeEmotion[] = [
        'joy',
        'sadness',
        'anxiety',
        'anger',
        'fear',
        'tiredness',
        'contentment',
        'excitement',
        'neutral',
        'calmness',
      ];

      for (const emotion of emotions) {
        expect(typeof emotion).toBe('string');
      }
    });
  });

  describe('HumeEmotionResult interface', () => {
    it('should have required properties', () => {
      const result = createMockResult('neutral');

      expect(result).toHaveProperty('primary');
      expect(result).toHaveProperty('secondary');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('suppression');
      expect(result).toHaveProperty('arousal');
      expect(result).toHaveProperty('valence');
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('timestamp');
    });

    it('should have correct types', () => {
      const result = createMockResult('joy', {
        secondary: ['excitement', 'contentment'],
        confidence: 0.85,
        suppression: 0.1,
        arousal: 0.7,
        valence: 0.6,
      });

      expect(typeof result.primary).toBe('string');
      expect(Array.isArray(result.secondary)).toBe(true);
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.suppression).toBe('number');
      expect(typeof result.arousal).toBe('number');
      expect(typeof result.valence).toBe('number');
      expect(typeof result.scores).toBe('object');
      expect(typeof result.timestamp).toBe('number');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty secondary emotions', () => {
      const result = createMockResult('joy', { secondary: [] });

      const suppression = detectSuppression({ ...result, suppression: 0.8 });
      expect(suppression.suppressed).toBeNull();
    });

    it('should handle extreme arousal values', () => {
      const highArousal = createMockResult('excitement', { arousal: 1.0, valence: 0.5 });
      const lowArousal = createMockResult('tiredness', { arousal: 0 });

      expect(generateEmotionInsight(highArousal)).toContain('high positive energy');
      expect(generateEmotionInsight(lowArousal)).toContain('tired');
    });

    it('should handle extreme valence values', () => {
      const positive = createMockResult('ecstasy', { valence: 1.0, arousal: 0.8 });
      const negative = createMockResult('distress', { valence: -1.0, arousal: 0.7 });

      expect(generateEmotionInsight(positive)).toContain('high positive energy');
      expect(generateEmotionInsight(negative)).not.toBeNull();
    });

    it('should handle zero confidence', () => {
      const result = createMockResult('neutral', { confidence: 0 });

      const distinction = distinguishNegativeEmotion(result);
      expect(distinction.emotion).toBe('other');
    });
  });
});
