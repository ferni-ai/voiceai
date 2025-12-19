/**
 * Voice Emotion → Personality Integration Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getVoiceEmotionAdjustment,
  isThemePreferredForVoice,
  shouldAvoidThemeForVoice,
  fromVoiceEmotionResult,
  type VoiceEmotionContext,
} from '../voice-emotion-personality.js';

describe('voice-emotion-personality', () => {
  describe('getVoiceEmotionAdjustment', () => {
    it('returns neutral defaults for no emotion', () => {
      const result = getVoiceEmotionAdjustment({});
      expect(result.toneModifier).toBe('neutral');
      expect(result.prioritizeAcknowledgment).toBe(false);
    });

    it('adjusts for stressed voice', () => {
      const result = getVoiceEmotionAdjustment({
        primary: 'stressed',
        confidence: 0.8,
      });

      expect(result.toneModifier).toBe('gentler');
      expect(result.prioritizeAcknowledgment).toBe(true);
      expect(result.preferShorterExpressions).toBe(true);
      expect(result.suggestedInjectionPoint).toBe('immediate');
    });

    it('matches energy for excited voice', () => {
      const result = getVoiceEmotionAdjustment({
        primary: 'excited',
        confidence: 0.7,
      });

      expect(result.toneModifier).toBe('energetic');
      expect(result.prioritizeAcknowledgment).toBe(false);
      expect(result.preferShorterExpressions).toBe(false);
    });

    it('leads with warmth for sad voice', () => {
      const result = getVoiceEmotionAdjustment({
        primary: 'sad',
        confidence: 0.75,
      });

      expect(result.toneModifier).toBe('warmer');
      expect(result.intimacyAdjustment).toBeGreaterThan(0);
      expect(result.preferredThemes).toContain('vulnerability');
    });

    it('ignores low confidence emotions', () => {
      const result = getVoiceEmotionAdjustment({
        primary: 'stressed',
        confidence: 0.2, // Below threshold
      });

      expect(result.toneModifier).toBe('neutral');
    });

    it('amplifies adjustment for high arousal', () => {
      const result = getVoiceEmotionAdjustment({
        primary: 'anxious',
        confidence: 0.8,
        arousal: 0.85,
      });

      expect(result.prioritizeAcknowledgment).toBe(true);
      expect(result.reason).toContain('high arousal');
    });

    it('adjusts for voice strain', () => {
      const result = getVoiceEmotionAdjustment({
        primary: 'neutral',
        hasStrain: true,
      });

      expect(result.preferShorterExpressions).toBe(true);
      expect(result.reason).toContain('voice strain');
    });

    it('adjusts for voice tremor', () => {
      const result = getVoiceEmotionAdjustment({
        primary: 'neutral',
        hasTremor: true,
      });

      expect(result.prioritizeAcknowledgment).toBe(true);
      expect(result.toneModifier).toBe('gentler');
    });
  });

  describe('isThemePreferredForVoice', () => {
    it('returns true when no preferences', () => {
      const adjustment = getVoiceEmotionAdjustment({ primary: 'neutral' });
      expect(isThemePreferredForVoice('quirky_interests', adjustment)).toBe(true);
    });

    it('returns true for preferred themes', () => {
      const adjustment = getVoiceEmotionAdjustment({ primary: 'stressed', confidence: 0.8 });
      expect(isThemePreferredForVoice('vulnerability', adjustment)).toBe(true);
    });

    it('returns false for non-preferred themes when preferences exist', () => {
      const adjustment = getVoiceEmotionAdjustment({ primary: 'stressed', confidence: 0.8 });
      // Stressed prefers vulnerability, sensory_moment, physical_habits
      expect(isThemePreferredForVoice('quirky_interests', adjustment)).toBe(false);
    });
  });

  describe('shouldAvoidThemeForVoice', () => {
    it('returns true for themes to avoid', () => {
      const adjustment = getVoiceEmotionAdjustment({ primary: 'stressed', confidence: 0.8 });
      expect(shouldAvoidThemeForVoice('quirky_interests', adjustment)).toBe(true);
    });

    it('returns false for safe themes', () => {
      const adjustment = getVoiceEmotionAdjustment({ primary: 'stressed', confidence: 0.8 });
      expect(shouldAvoidThemeForVoice('vulnerability', adjustment)).toBe(false);
    });
  });

  describe('fromVoiceEmotionResult', () => {
    it('converts VoiceEmotionResult to context', () => {
      const result = fromVoiceEmotionResult({
        primary: 'anxious',
        arousal: 0.8,
        valence: -0.5,
        confidence: 0.75,
      });

      expect(result.primary).toBe('anxious');
      expect(result.arousal).toBe(0.8);
      expect(result.valence).toBe(-0.5);
      expect(result.confidence).toBe(0.75);
      expect(result.energyLevel).toBe('high'); // arousal > 0.7
      expect(result.speechPace).toBe('fast'); // arousal > 0.7
    });

    it('handles undefined input', () => {
      const result = fromVoiceEmotionResult(undefined);
      expect(result).toEqual({});
    });
  });
});

