/**
 * Tests for Voice Warmth Modulation
 *
 * Verifies that voice warmth adjusts speed/volume based on user emotion.
 */

import { describe, expect, it } from 'vitest';

import { applyVoiceWarmth, hasVoiceWarmth } from '../voice-warmth.js';

describe('voice-warmth', () => {
  describe('applyVoiceWarmth', () => {
    it('should return unchanged text for neutral emotion', () => {
      const result = applyVoiceWarmth('Hello there', { userEmotion: 'neutral' });

      expect(result.text).toBe('Hello there');
      expect(result.adjustments.speedRatio).toBe(1.0);
      expect(result.adjustments.volumeRatio).toBe(1.0);
    });

    it('should slow down and soften for sad emotion', () => {
      const result = applyVoiceWarmth('I understand', {
        userEmotion: 'sad',
        emotionIntensity: 1.0,
      });

      expect(result.text).toContain('<speed ratio=');
      expect(result.adjustments.speedRatio).toBeLessThan(1.0);
      expect(result.adjustments.volumeRatio).toBeLessThan(1.0);
      expect(result.adjustments.reason).toBe('gentle comfort');
    });

    it('should slow down significantly for grief', () => {
      const result = applyVoiceWarmth('I am so sorry', {
        userEmotion: 'grief',
        emotionIntensity: 1.0,
      });

      expect(result.adjustments.speedRatio).toBeLessThan(0.9);
      expect(result.adjustments.reason).toBe('deep empathy');
    });

    it('should speed up for excited emotion', () => {
      const result = applyVoiceWarmth('That is amazing!', {
        userEmotion: 'excited',
        emotionIntensity: 1.0,
      });

      expect(result.text).toContain('<speed ratio=');
      expect(result.adjustments.speedRatio).toBeGreaterThan(1.0);
      expect(result.adjustments.reason).toBe('matching excitement');
    });

    it('should match energy for happy emotion', () => {
      const result = applyVoiceWarmth('I am so happy for you', {
        userEmotion: 'happy',
        emotionIntensity: 0.8,
      });

      expect(result.adjustments.speedRatio).toBeGreaterThan(1.0);
      expect(result.adjustments.reason).toBe('sharing joy');
    });

    it('should scale adjustments by intensity', () => {
      const highIntensity = applyVoiceWarmth('Test', {
        userEmotion: 'sad',
        emotionIntensity: 1.0,
      });

      const lowIntensity = applyVoiceWarmth('Test', {
        userEmotion: 'sad',
        emotionIntensity: 0.3,
      });

      // High intensity should have larger adjustment
      expect(Math.abs(1 - highIntensity.adjustments.speedRatio)).toBeGreaterThan(
        Math.abs(1 - lowIntensity.adjustments.speedRatio)
      );
    });

    it('should consider arousal in adjustments', () => {
      const highArousal = applyVoiceWarmth('Test', {
        userEmotion: 'neutral',
        arousal: 0.9,
      });

      const lowArousal = applyVoiceWarmth('Test', {
        userEmotion: 'neutral',
        arousal: 0.1,
      });

      // High arousal should be slightly faster
      expect(highArousal.adjustments.speedRatio).toBeGreaterThanOrEqual(
        lowArousal.adjustments.speedRatio
      );
    });

    it('should soften for very negative valence', () => {
      const result = applyVoiceWarmth('I hear you', {
        userEmotion: 'sad',
        valence: 0.1, // Very negative
        emotionIntensity: 0.7,
      });

      expect(result.adjustments.volumeRatio).toBeLessThan(1.0);
    });

    it('should skip if text already has speed/volume tags', () => {
      const result = applyVoiceWarmth('<speed ratio="1.1"/>Already tagged', {
        userEmotion: 'excited',
        emotionIntensity: 1.0,
      });

      expect(result.text).toBe('<speed ratio="1.1"/>Already tagged');
      expect(result.adjustments.reason).toBe('skipped - existing tags');
    });

    it('should respect skipIfHasTags option', () => {
      const result = applyVoiceWarmth(
        '<speed ratio="1.1"/>Tagged',
        {
          userEmotion: 'excited',
          emotionIntensity: 1.0,
        },
        { skipIfHasTags: false }
      );

      // Should apply additional tags when skipIfHasTags is false
      expect(result.text).toContain('<speed');
    });

    it('should clamp adjustments to max values', () => {
      const result = applyVoiceWarmth(
        'Test',
        {
          userEmotion: 'grief',
          emotionIntensity: 1.0,
          arousal: 0.0, // Very low arousal should add more slowdown
          valence: 0.0, // Very negative should add more volume reduction
        },
        { maxSpeedAdjust: 0.1, maxVolumeAdjust: 0.1 }
      );

      // Should be clamped to max 10% adjustment
      expect(result.adjustments.speedRatio).toBeGreaterThanOrEqual(0.9);
      expect(result.adjustments.volumeRatio).toBeGreaterThanOrEqual(0.9);
    });

    it('should handle unknown emotions as neutral', () => {
      const result = applyVoiceWarmth('Test', {
        userEmotion: 'some_unknown_emotion',
      });

      expect(result.adjustments.speedRatio).toBe(1.0);
      expect(result.adjustments.volumeRatio).toBe(1.0);
    });

    it('should handle missing context gracefully', () => {
      const result = applyVoiceWarmth('Hello', {});

      expect(result.text).toBe('Hello');
      expect(result.adjustments.speedRatio).toBe(1.0);
    });
  });

  describe('hasVoiceWarmth', () => {
    it('should detect speed tag at start', () => {
      expect(hasVoiceWarmth('<speed ratio="0.9"/>Hello')).toBe(true);
    });

    it('should detect volume tag at start', () => {
      expect(hasVoiceWarmth('<volume ratio="0.85"/>Hello')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(hasVoiceWarmth('Hello there')).toBe(false);
    });

    it('should return false for tags not at start', () => {
      expect(hasVoiceWarmth('Hello <speed ratio="1.0"/>there')).toBe(false);
    });
  });
});
