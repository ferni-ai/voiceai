/**
 * Dynamic Voice Parameters Tests
 *
 * Tests for context-aware voice parameter calculation.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateVoiceParameters,
  applyVoiceParametersToSSML,
  getVoiceParameterSummary,
  type VoiceContext,
  type VoiceParameters,
} from '../dynamic-voice-parameters.js';

// Helper to create a base context
function createContext(overrides: Partial<VoiceContext> = {}): VoiceContext {
  return {
    currentHour: 12, // Noon - peak hours
    isHeavyTopic: false,
    isCelebration: false,
    relationshipStage: 'friend',
    sessionMinutes: 5,
    turnCount: 3,
    ...overrides,
  };
}

describe('DynamicVoiceParameters', () => {
  // ===========================================================================
  // calculateVoiceParameters
  // ===========================================================================
  describe('calculateVoiceParameters', () => {
    it('should return default parameters for neutral context', () => {
      const context = createContext();
      const result = calculateVoiceParameters(context);

      expect(result.speedMultiplier).toBeCloseTo(1.0, 1);
      expect(result.pauseMultiplier).toBeCloseTo(1.0, 1);
      expect(result.volumeLevel).toBe('normal');
      expect(result.emotionalTone).toBe('warm');
    });

    describe('emotion-based adjustments', () => {
      it('should slow down and soften for sadness', () => {
        const context = createContext({
          userEmotion: { primary: 'sadness', intensity: 0.8 },
        });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThan(1.0);
        expect(result.pauseMultiplier).toBeGreaterThan(1.0);
        expect(result.volumeLevel).toBe('soft');
        expect(result.emotionalTone).toBe('compassionate');
        expect(result.ssmlHints.addBreathingPauses).toBe(true);
      });

      it('should slow down and be gentle for fear', () => {
        const context = createContext({
          userEmotion: { primary: 'fear', intensity: 0.7 },
        });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThan(1.0);
        expect(result.volumeLevel).toBe('soft');
        expect(result.emotionalTone).toBe('gentle');
      });

      it('should slow down and calm for anxiety', () => {
        const context = createContext({
          userEmotion: { primary: 'anxiety', intensity: 0.6 },
        });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThan(1.0);
        expect(result.volumeLevel).toBe('soft');
        expect(result.emotionalTone).toBe('calm');
      });

      it('should be most gentle for distress', () => {
        const context = createContext({
          userEmotion: { primary: 'distress', intensity: 0.9 },
        });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThan(0.9);
        expect(result.pauseMultiplier).toBeGreaterThan(1.3);
        expect(result.volumeLevel).toBe('soft');
        expect(result.emotionalTone).toBe('compassionate');
        expect(result.ssmlHints.softenDelivery).toBe(true);
      });

      it('should speed up and energize for excitement', () => {
        const context = createContext({
          userEmotion: { primary: 'excitement', intensity: 0.8 },
        });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeGreaterThan(1.0);
        expect(result.pauseMultiplier).toBeLessThan(1.0);
        expect(result.volumeLevel).toBe('energetic');
        expect(result.emotionalTone).toBe('energetic');
      });

      it('should be warm and slightly faster for joy', () => {
        const context = createContext({
          userEmotion: { primary: 'joy', intensity: 0.7 },
        });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeGreaterThan(1.0);
        expect(result.volumeLevel).toBe('energetic');
        expect(result.emotionalTone).toBe('warm');
      });

      it('should give space for contemplation', () => {
        const context = createContext({
          userEmotion: { primary: 'contemplation', intensity: 0.6 },
        });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThan(1.0);
        expect(result.pauseMultiplier).toBeGreaterThan(1.0);
        expect(result.emotionalTone).toBe('calm');
        expect(result.ssmlHints.addBreathingPauses).toBe(true);
      });

      it('should scale adjustments by emotion intensity', () => {
        const lowIntensity = createContext({
          userEmotion: { primary: 'sadness', intensity: 0.3 },
        });
        const highIntensity = createContext({
          userEmotion: { primary: 'sadness', intensity: 0.9 },
        });

        const lowResult = calculateVoiceParameters(lowIntensity);
        const highResult = calculateVoiceParameters(highIntensity);

        // Higher intensity should produce more extreme parameters
        expect(highResult.speedMultiplier).toBeLessThan(lowResult.speedMultiplier);
        expect(highResult.pauseMultiplier).toBeGreaterThan(lowResult.pauseMultiplier);
      });

      it('should override for needsSupport flag', () => {
        const context = createContext({
          userEmotion: { primary: 'neutral', intensity: 0.5, needsSupport: true },
        });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThanOrEqual(0.88);
        expect(result.pauseMultiplier).toBeGreaterThanOrEqual(1.3);
        expect(result.ssmlHints.softenDelivery).toBe(true);
        expect(result.ssmlHints.addBreathingPauses).toBe(true);
      });

      it('should handle unknown emotions as neutral', () => {
        const context = createContext({
          userEmotion: { primary: 'unknown_emotion', intensity: 0.5 },
        });
        const result = calculateVoiceParameters(context);

        // Should fall back to neutral parameters
        expect(result.emotionalTone).toBe('warm');
      });
    });

    describe('time-based adjustments', () => {
      it('should be soft and slow late at night (11pm)', () => {
        const context = createContext({ currentHour: 23 });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThan(1.0);
        expect(result.pauseMultiplier).toBeGreaterThan(1.0);
        expect(result.volumeLevel).toBe('soft');
      });

      it('should be soft and slow very late (2am)', () => {
        const context = createContext({ currentHour: 2 });
        const result = calculateVoiceParameters(context);

        expect(result.volumeLevel).toBe('soft');
      });

      it('should be gentle in early morning (6am)', () => {
        const context = createContext({ currentHour: 6 });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThan(1.0);
        expect(result.pauseMultiplier).toBeGreaterThan(1.0);
      });

      it('should be normal during peak hours (noon)', () => {
        const context = createContext({ currentHour: 12 });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeCloseTo(1.0, 1);
        expect(result.volumeLevel).toBe('normal');
      });

      it('should wind down in evening (8pm)', () => {
        const context = createContext({ currentHour: 20 });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThanOrEqual(1.0);
      });
    });

    describe('context overrides', () => {
      it('should slow down and soften for heavy topics', () => {
        const context = createContext({ isHeavyTopic: true });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThanOrEqual(0.9);
        expect(result.pauseMultiplier).toBeGreaterThanOrEqual(1.2);
        expect(result.ssmlHints.softenDelivery).toBe(true);
      });

      it('should speed up and energize for celebrations', () => {
        const context = createContext({ isCelebration: true });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeGreaterThanOrEqual(1.05);
        expect(result.volumeLevel).toBe('energetic');
        expect(result.emotionalTone).toBe('energetic');
      });

      it('should combine emotion and heavy topic', () => {
        const context = createContext({
          userEmotion: { primary: 'sadness', intensity: 0.7 },
          isHeavyTopic: true,
        });
        const result = calculateVoiceParameters(context);

        // Both sadness and heavy topic slow things down
        expect(result.speedMultiplier).toBeLessThan(0.9);
        expect(result.ssmlHints.softenDelivery).toBe(true);
      });
    });

    describe('session fatigue', () => {
      it('should not apply fatigue for short sessions', () => {
        const context = createContext({ sessionMinutes: 15 });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeCloseTo(1.0, 1);
      });

      it('should slow down for long sessions (45 min)', () => {
        const context = createContext({ sessionMinutes: 45 });
        const result = calculateVoiceParameters(context);

        expect(result.speedMultiplier).toBeLessThan(1.0);
        expect(result.pauseMultiplier).toBeGreaterThan(1.0);
      });

      it('should apply max fatigue for very long sessions (90 min)', () => {
        // Fatigue factor is capped at 0.15, so sessions > ~39 min all have same slowdown
        const longSession = createContext({ sessionMinutes: 90 });
        const result = calculateVoiceParameters(longSession);

        // Should have maximum fatigue applied (speed ~= 0.85)
        expect(result.speedMultiplier).toBeLessThan(0.9);
        expect(result.speedMultiplier).toBeCloseTo(0.85, 1);
      });
    });

    describe('parameter clamping', () => {
      it('should clamp speed to valid range (0.75-1.25)', () => {
        // Extreme slowdown scenario
        const slowContext = createContext({
          userEmotion: { primary: 'distress', intensity: 1.0, needsSupport: true },
          currentHour: 2,
          isHeavyTopic: true,
          sessionMinutes: 120,
        });
        const slowResult = calculateVoiceParameters(slowContext);
        expect(slowResult.speedMultiplier).toBeGreaterThanOrEqual(0.75);

        // Extreme speedup scenario
        const fastContext = createContext({
          userEmotion: { primary: 'excitement', intensity: 1.0 },
          isCelebration: true,
        });
        const fastResult = calculateVoiceParameters(fastContext);
        expect(fastResult.speedMultiplier).toBeLessThanOrEqual(1.25);
      });

      it('should clamp pause to valid range (0.7-1.8)', () => {
        const extremeContext = createContext({
          userEmotion: { primary: 'distress', intensity: 1.0 },
          sessionMinutes: 120,
        });
        const result = calculateVoiceParameters(extremeContext);

        expect(result.pauseMultiplier).toBeGreaterThanOrEqual(0.7);
        expect(result.pauseMultiplier).toBeLessThanOrEqual(1.8);
      });
    });
  });

  // ===========================================================================
  // applyVoiceParametersToSSML
  // ===========================================================================
  describe('applyVoiceParametersToSSML', () => {
    const baseParams: VoiceParameters = {
      speedMultiplier: 1.0,
      pauseMultiplier: 1.0,
      volumeLevel: 'normal',
      emotionalTone: 'warm',
      ssmlHints: {
        addBreathingPauses: false,
        emphasizeComfort: false,
        softenDelivery: false,
      },
    };

    it('should not modify SSML for default parameters', () => {
      const ssml = 'Hello, how are you?';
      const result = applyVoiceParametersToSSML(ssml, baseParams);

      expect(result).toBe(ssml);
    });

    it('should add prosody rate wrapper for speed changes', () => {
      const params = { ...baseParams, speedMultiplier: 0.85 };
      const result = applyVoiceParametersToSSML('Hello', params);

      expect(result).toContain('<prosody rate="85%">');
      expect(result).toContain('</prosody>');
    });

    it('should add soft volume for soft level', () => {
      const params = { ...baseParams, volumeLevel: 'soft' as const };
      const result = applyVoiceParametersToSSML('Hello', params);

      expect(result).toContain('<prosody volume="soft">');
    });

    it('should add loud volume for energetic level', () => {
      const params = { ...baseParams, volumeLevel: 'energetic' as const };
      const result = applyVoiceParametersToSSML('Hello', params);

      expect(result).toContain('<prosody volume="loud">');
    });

    it('should add breathing pauses when enabled', () => {
      const params = {
        ...baseParams,
        ssmlHints: { ...baseParams.ssmlHints, addBreathingPauses: true },
      };
      const ssml = 'Hello. How are you. I hope well.';
      const result = applyVoiceParametersToSSML(ssml, params);

      expect(result).toContain('<break time="400ms"/>');
    });

    it('should extend existing breaks for high pause multiplier', () => {
      const params = { ...baseParams, pauseMultiplier: 1.5 };
      const ssml = 'Hello <break time="200ms"/> there';
      const result = applyVoiceParametersToSSML(ssml, params);

      // 200ms * 1.5 = 300ms
      expect(result).toContain('<break time="300ms"/>');
    });

    it('should not extend breaks for low pause multiplier', () => {
      const params = { ...baseParams, pauseMultiplier: 1.05 };
      const ssml = 'Hello <break time="200ms"/> there';
      const result = applyVoiceParametersToSSML(ssml, params);

      // Should keep original 200ms since 1.05 < 1.1
      expect(result).toContain('<break time="200ms"/>');
    });

    it('should combine multiple prosody wrappers', () => {
      const params = {
        ...baseParams,
        speedMultiplier: 0.9,
        volumeLevel: 'soft' as const,
      };
      const result = applyVoiceParametersToSSML('Hello', params);

      expect(result).toContain('<prosody rate="90%">');
      expect(result).toContain('<prosody volume="soft">');
    });
  });

  // ===========================================================================
  // getVoiceParameterSummary
  // ===========================================================================
  describe('getVoiceParameterSummary', () => {
    const baseParams: VoiceParameters = {
      speedMultiplier: 1.0,
      pauseMultiplier: 1.0,
      volumeLevel: 'normal',
      emotionalTone: 'warm',
      ssmlHints: {
        addBreathingPauses: false,
        emphasizeComfort: false,
        softenDelivery: false,
      },
    };

    it('should return "normal" for default parameters', () => {
      const result = getVoiceParameterSummary(baseParams);
      expect(result).toBe('normal');
    });

    it('should include "slower" for slow speed', () => {
      const params = { ...baseParams, speedMultiplier: 0.85 };
      const result = getVoiceParameterSummary(params);

      expect(result).toContain('slower');
    });

    it('should include "faster" for fast speed', () => {
      const params = { ...baseParams, speedMultiplier: 1.1 };
      const result = getVoiceParameterSummary(params);

      expect(result).toContain('faster');
    });

    it('should include "softer" for soft volume', () => {
      const params = { ...baseParams, volumeLevel: 'soft' as const };
      const result = getVoiceParameterSummary(params);

      expect(result).toContain('softer');
    });

    it('should include "energetic" for energetic volume', () => {
      const params = { ...baseParams, volumeLevel: 'energetic' as const };
      const result = getVoiceParameterSummary(params);

      expect(result).toContain('energetic');
    });

    it('should include "more pauses" for high pause multiplier', () => {
      const params = { ...baseParams, pauseMultiplier: 1.4 };
      const result = getVoiceParameterSummary(params);

      expect(result).toContain('more pauses');
    });

    it('should include "gentler" for soften delivery', () => {
      const params = {
        ...baseParams,
        ssmlHints: { ...baseParams.ssmlHints, softenDelivery: true },
      };
      const result = getVoiceParameterSummary(params);

      expect(result).toContain('gentler');
    });

    it('should combine multiple descriptors', () => {
      const params = {
        ...baseParams,
        speedMultiplier: 0.85,
        volumeLevel: 'soft' as const,
        pauseMultiplier: 1.4,
        ssmlHints: { ...baseParams.ssmlHints, softenDelivery: true },
      };
      const result = getVoiceParameterSummary(params);

      expect(result).toContain('slower');
      expect(result).toContain('softer');
      expect(result).toContain('more pauses');
      expect(result).toContain('gentler');
      expect(result.split(', ').length).toBe(4);
    });
  });
});
