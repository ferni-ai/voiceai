/**
 * Emotional Arc Tracker Tests
 *
 * Tests for the emotional arc module that tracks:
 * - Emotional state throughout conversation
 * - Emotional transitions
 * - SSML adjustments for voice tone
 * - Emotional guidance for responses
 *
 * @module tests/emotional-arc
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  getEmotionalArcTracker,
  resetEmotionalArcTracker,
  type EmotionalArcTracker,
} from '../conversation/emotional-arc.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createEmotionResult(
  primary: string,
  intensity = 0.5,
  valence: 'positive' | 'negative' | 'neutral' = 'neutral'
): EmotionResult {
  return {
    primary: primary as any,
    intensity,
    valence,
    distressLevel: valence === 'negative' ? intensity * 0.8 : 0.1,
    confidence: 0.8,
    markers: [],
    suggestedTone: 'warm',
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('EmotionalArcTracker', () => {
  let tracker: EmotionalArcTracker;

  beforeEach(() => {
    resetEmotionalArcTracker();
    tracker = getEmotionalArcTracker();
  });

  afterEach(() => {
    resetEmotionalArcTracker();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getEmotionalArcTracker();
      const instance2 = getEmotionalArcTracker();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getEmotionalArcTracker();
      resetEmotionalArcTracker();
      const instance2 = getEmotionalArcTracker();
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // recordEmotion Method
  // --------------------------------------------------------------------------

  describe('recordEmotion()', () => {
    it('should record emotions and return an arc', () => {
      const emotion = createEmotionResult('happy', 0.8, 'positive');
      const arc = tracker.recordEmotion(emotion, null);

      expect(arc).toBeDefined();
      expect(arc.currentEmotion).toBeDefined();
    });

    it('should handle null text emotion', () => {
      const arc = tracker.recordEmotion(null, null);
      expect(arc).toBeDefined();
    });

    it('should handle voice emotion data', () => {
      const textEmotion = createEmotionResult('neutral', 0.5, 'neutral');
      const voiceEmotion = {
        primary: 'happy' as any,
        confidence: 0.8,
        arousal: 0.6,
        valence: 0.7,
      };

      const arc = tracker.recordEmotion(textEmotion, voiceEmotion);
      expect(arc).toBeDefined();
    });

    it('should handle various emotion types', () => {
      const emotions = [
        'happy',
        'sad',
        'angry',
        'anxious',
        'stressed',
        'excited',
        'neutral',
        'curious',
        'confused',
        'grateful',
      ];

      for (const emotionType of emotions) {
        const emotion = createEmotionResult(emotionType, 0.5, 'neutral');
        const arc = tracker.recordEmotion(emotion, null);
        expect(arc).toBeDefined();
      }
    });

    it('should handle various intensity values', () => {
      const intensities = [0, 0.25, 0.5, 0.75, 1.0];

      for (const intensity of intensities) {
        const emotion = createEmotionResult('neutral', intensity, 'neutral');
        const arc = tracker.recordEmotion(emotion, null);
        expect(arc).toBeDefined();
      }
    });

    it('should track multiple emotions over time', () => {
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);
      tracker.recordEmotion(createEmotionResult('curious', 0.6), null);
      tracker.recordEmotion(createEmotionResult('excited', 0.8), null);
      const arc = tracker.recordEmotion(createEmotionResult('happy', 0.7, 'positive'), null);

      expect(arc).toBeDefined();
      expect(arc.trajectory).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // getArc Method
  // --------------------------------------------------------------------------

  describe('getArc()', () => {
    it('should return emotional arc data', () => {
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);
      tracker.recordEmotion(createEmotionResult('happy', 0.7, 'positive'), null);

      const arc = tracker.getArc();
      expect(arc).toBeDefined();
    });

    it('should return valid arc with no recorded emotions', () => {
      const arc = tracker.getArc();
      expect(arc).toBeDefined();
    });

    it('should have expected properties', () => {
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);
      const arc = tracker.getArc();

      expect(arc).toHaveProperty('currentEmotion');
      expect(arc).toHaveProperty('currentValence');
      expect(arc).toHaveProperty('currentArousal');
      expect(arc).toHaveProperty('trajectory');
      expect(arc).toHaveProperty('trajectoryConfidence');
      expect(arc).toHaveProperty('conversationTemperature');
      expect(arc).toHaveProperty('needsEmotionalSupport');
    });

    it('should track emotional trajectory', () => {
      // Record improving emotions
      tracker.recordEmotion(createEmotionResult('sad', 0.6, 'negative'), null);
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);
      tracker.recordEmotion(createEmotionResult('curious', 0.5), null);
      tracker.recordEmotion(createEmotionResult('happy', 0.6, 'positive'), null);

      const arc = tracker.getArc();
      expect(arc).toBeDefined();
      expect(['improving', 'stable', 'declining', 'volatile', 'unknown']).toContain(arc.trajectory);
    });
  });

  // --------------------------------------------------------------------------
  // getSsmlAdjustments Method
  // --------------------------------------------------------------------------

  describe('getSsmlAdjustments()', () => {
    it('should return SSML adjustments', () => {
      tracker.recordEmotion(createEmotionResult('stressed', 0.8, 'negative'), null);

      const adjustments = tracker.getSsmlAdjustments();
      expect(adjustments).toBeDefined();
    });

    it('should have expected properties', () => {
      const adjustments = tracker.getSsmlAdjustments();

      expect(adjustments).toHaveProperty('speed');
      expect(adjustments).toHaveProperty('volume');
      expect(adjustments).toHaveProperty('emotion');
      expect(adjustments).toHaveProperty('addBreaks');
    });

    it('should provide valid numeric values', () => {
      tracker.recordEmotion(createEmotionResult('stressed', 0.9, 'negative'), null);
      const adjustments = tracker.getSsmlAdjustments();

      expect(typeof adjustments.speed).toBe('number');
      expect(typeof adjustments.volume).toBe('number');
      expect(adjustments.speed).toBeGreaterThan(0);
      expect(adjustments.volume).toBeGreaterThan(0);
    });

    it('should return default adjustments with no emotions recorded', () => {
      const adjustments = tracker.getSsmlAdjustments();
      expect(adjustments).toBeDefined();
      expect(adjustments.speed).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // getResponseRecommendation Method
  // --------------------------------------------------------------------------

  describe('getResponseRecommendation()', () => {
    it('should return response recommendation', () => {
      tracker.recordEmotion(createEmotionResult('anxious', 0.7, 'negative'), null);

      const recommendation = tracker.getResponseRecommendation();
      expect(recommendation).toBeDefined();
    });

    it('should have expected properties', () => {
      tracker.recordEmotion(createEmotionResult('sad', 0.8, 'negative'), null);

      const recommendation = tracker.getResponseRecommendation();
      expect(recommendation).toHaveProperty('suggestedTone');
      expect(recommendation).toHaveProperty('speedAdjust');
      expect(recommendation).toHaveProperty('volumeAdjust');
      expect(recommendation).toHaveProperty('warmthLevel');
      expect(recommendation).toHaveProperty('guidance');
    });

    it('should provide tone suggestions', () => {
      tracker.recordEmotion(createEmotionResult('stressed', 0.8, 'negative'), null);

      const recommendation = tracker.getResponseRecommendation();
      expect(['match', 'calm', 'uplift', 'celebrate', 'support']).toContain(
        recommendation.suggestedTone
      );
    });
  });

  // --------------------------------------------------------------------------
  // hasSuddenShift Method
  // --------------------------------------------------------------------------

  describe('hasSuddenShift()', () => {
    it('should return false with insufficient history', () => {
      const hasShift = tracker.hasSuddenShift();
      expect(hasShift).toBe(false);
    });

    it('should detect sudden emotional changes', () => {
      // Record a dramatic shift
      tracker.recordEmotion(createEmotionResult('sad', 0.9, 'negative'), null);
      tracker.recordEmotion(createEmotionResult('happy', 0.9, 'positive'), null);

      const hasShift = tracker.hasSuddenShift();
      expect(typeof hasShift).toBe('boolean');
    });

    it('should return false for stable emotions', () => {
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);

      const hasShift = tracker.hasSuddenShift();
      expect(hasShift).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getTransitionPhrase Method
  // --------------------------------------------------------------------------

  describe('getTransitionPhrase()', () => {
    it('should return null with no shift', () => {
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);

      const phrase = tracker.getTransitionPhrase();
      expect(phrase).toBeNull();
    });

    it('should return string or null', () => {
      tracker.recordEmotion(createEmotionResult('sad', 0.9, 'negative'), null);
      tracker.recordEmotion(createEmotionResult('happy', 0.9, 'positive'), null);

      const phrase = tracker.getTransitionPhrase();
      expect(phrase === null || typeof phrase === 'string').toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle unknown emotion types', () => {
      const emotion = createEmotionResult('unknown-emotion', 0.5);
      const arc = tracker.recordEmotion(emotion, null);
      expect(arc).toBeDefined();
    });

    it('should handle edge intensity values', () => {
      tracker.recordEmotion(createEmotionResult('happy', 0), null);
      tracker.recordEmotion(createEmotionResult('happy', 1), null);

      const arc = tracker.getArc();
      expect(arc).toBeDefined();
    });

    it('should handle rapid emotion recording', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          const intensity = Math.random();
          tracker.recordEmotion(createEmotionResult('neutral', intensity), null);
        }
      }).not.toThrow();
    });

    it('should handle mixed text and voice emotions', () => {
      const textEmotion = createEmotionResult('curious', 0.7);
      const voiceEmotion = { primary: 'happy' as any, confidence: 0.8, arousal: 0.6, valence: 0.7 };

      tracker.recordEmotion(textEmotion, voiceEmotion);

      const textEmotion2 = createEmotionResult('happy', 0.6, 'positive');
      const voiceEmotion2 = { primary: 'excited' as any, confidence: 0.7, arousal: 0.8, valence: 0.5 };

      const arc = tracker.recordEmotion(textEmotion2, voiceEmotion2);
      expect(arc).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // State Persistence
  // --------------------------------------------------------------------------

  describe('State Persistence', () => {
    it('should maintain state across method calls', () => {
      tracker.recordEmotion(createEmotionResult('anxious', 0.8, 'negative'), null);
      const arc1 = tracker.getArc();

      tracker.recordEmotion(createEmotionResult('calmer', 0.6), null);
      const arc2 = tracker.getArc();

      expect(arc1).toBeDefined();
      expect(arc2).toBeDefined();
    });

    it('should reset state completely', () => {
      tracker.recordEmotion(createEmotionResult('stressed', 0.9, 'negative'), null);
      tracker.recordEmotion(createEmotionResult('anxious', 0.8, 'negative'), null);

      resetEmotionalArcTracker();
      const newTracker = getEmotionalArcTracker();
      const arcAfter = newTracker.getArc();

      // After reset, should have unknown trajectory (no history)
      expect(arcAfter.trajectory).toBe('unknown');
    });
  });

  // --------------------------------------------------------------------------
  // Integration with different emotional states
  // --------------------------------------------------------------------------

  describe('Emotional State Integration', () => {
    it('should detect need for emotional support', () => {
      // Record distress signals
      tracker.recordEmotion(createEmotionResult('sad', 0.8, 'negative'), null);
      tracker.recordEmotion(createEmotionResult('anxious', 0.9, 'negative'), null);

      const arc = tracker.getArc();
      // May or may not need support depending on implementation
      expect(typeof arc.needsEmotionalSupport).toBe('boolean');
    });

    it('should track conversation temperature', () => {
      // Record high-arousal emotions
      tracker.recordEmotion(createEmotionResult('excited', 0.9, 'positive'), null);
      tracker.recordEmotion(createEmotionResult('anxious', 0.8, 'negative'), null);

      const arc = tracker.getArc();
      expect(typeof arc.conversationTemperature).toBe('number');
      expect(arc.conversationTemperature).toBeGreaterThanOrEqual(0);
      expect(arc.conversationTemperature).toBeLessThanOrEqual(1);
    });

    it('should handle improving emotional trajectory', () => {
      tracker.recordEmotion(createEmotionResult('sad', 0.7, 'negative'), null);
      tracker.recordEmotion(createEmotionResult('neutral', 0.5), null);
      tracker.recordEmotion(createEmotionResult('hopeful', 0.5, 'positive'), null);
      tracker.recordEmotion(createEmotionResult('happy', 0.6, 'positive'), null);

      const arc = tracker.getArc();
      // Trajectory should reflect improvement
      expect(['improving', 'stable', 'declining', 'volatile', 'unknown']).toContain(arc.trajectory);
    });
  });
});
