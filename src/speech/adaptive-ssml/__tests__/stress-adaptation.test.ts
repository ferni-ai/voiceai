/**
 * Stress Adaptation Tests
 *
 * Tests the gradual stress adaptation system that modulates TTS parameters
 * based on detected user stress levels over multiple turns.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getStressAdaptationEngine,
  resetStressAdaptationEngine,
  recordStressReading,
  calculateStressAdaptation,
  applyStressAdaptationSsml,
  getStressAdaptationState,
  STRESS_ADAPTATION_CONFIG,
  type StressReading,
} from '../stress-adaptation.js';

describe('StressAdaptation', () => {
  const testSessionId = 'test-session-123';

  beforeEach(() => {
    resetStressAdaptationEngine(testSessionId);
  });

  afterEach(() => {
    resetStressAdaptationEngine(testSessionId);
  });

  describe('Engine Lifecycle', () => {
    it('creates a new engine for a session', () => {
      const engine = getStressAdaptationEngine(testSessionId);
      expect(engine).toBeDefined();
      expect(engine.sessionId).toBe(testSessionId);
      expect(engine.stressHistory).toHaveLength(0);
      expect(engine.adaptationLevel).toBe(0);
    });

    it('returns the same engine for the same session', () => {
      const engine1 = getStressAdaptationEngine(testSessionId);
      const engine2 = getStressAdaptationEngine(testSessionId);
      expect(engine1).toBe(engine2);
    });

    it('resets engine state on reset', () => {
      const engine = getStressAdaptationEngine(testSessionId);

      // Record some readings
      recordStressReading(testSessionId, createReading({ stressLevel: 0.7 }));

      // Reset
      resetStressAdaptationEngine(testSessionId);

      // Get new engine - should be fresh
      const newEngine = getStressAdaptationEngine(testSessionId);
      expect(newEngine.stressHistory).toHaveLength(0);
      expect(newEngine).not.toBe(engine);
    });
  });

  describe('Stress Recording', () => {
    it('records stress readings', () => {
      recordStressReading(testSessionId, createReading({ stressLevel: 0.5 }));
      recordStressReading(testSessionId, createReading({ stressLevel: 0.6 }));

      const state = getStressAdaptationState(testSessionId);
      expect(state?.historyLength).toBe(2);
    });

    it('trims old readings beyond MAX_HISTORY', () => {
      // Record more than MAX_HISTORY readings
      for (let i = 0; i < STRESS_ADAPTATION_CONFIG.MAX_HISTORY + 5; i++) {
        recordStressReading(testSessionId, createReading({ stressLevel: 0.5 }));
      }

      const state = getStressAdaptationState(testSessionId);
      expect(state?.historyLength).toBe(STRESS_ADAPTATION_CONFIG.MAX_HISTORY);
    });
  });

  describe('Adaptation Calculation', () => {
    it('returns zero adaptation with no readings', () => {
      const adaptation = calculateStressAdaptation(testSessionId);
      expect(adaptation.adaptationLevel).toBe(0);
      expect(adaptation.speedMultiplier).toBe(1.0);
      expect(adaptation.pauseMultiplier).toBe(1.0);
    });

    it('returns zero adaptation for low stress', () => {
      recordStressReading(testSessionId, createReading({ stressLevel: 0.1 }));
      recordStressReading(testSessionId, createReading({ stressLevel: 0.15 }));
      recordStressReading(testSessionId, createReading({ stressLevel: 0.1 }));

      const adaptation = calculateStressAdaptation(testSessionId);
      expect(adaptation.adaptationLevel).toBeLessThan(0.1);
    });

    it('detects mild stress', () => {
      // Record mild stress levels with multiple signals
      // Note: weighted stress = 0.5*0.35 + 0.2*0.20 + 0.2*0.15 = 0.245, with anxietyMarkers pushes over STRESS_MILD
      for (let i = 0; i < 6; i++) {
        recordStressReading(
          testSessionId,
          createReading({
            stressLevel: 0.5,
            anxietyMarkers: true, // Adds 0.20 to weighted stress
          })
        );
        calculateStressAdaptation(testSessionId); // Process each turn
      }

      const adaptation = calculateStressAdaptation(testSessionId);
      expect(adaptation.adaptationLevel).toBeGreaterThan(0);
      expect(adaptation.adaptationLevel).toBeLessThan(0.5);
      expect(adaptation.speedMultiplier).toBeLessThan(1.0);
    });

    it('detects high stress with multiple indicators', () => {
      // Record high stress with multiple signals
      // Need 8+ iterations to ramp up past 0.5 (cooldown=2, max_ramp=0.15 per change)
      for (let i = 0; i < 8; i++) {
        recordStressReading(
          testSessionId,
          createReading({
            stressLevel: 0.8,
            anxietyMarkers: true,
            breathPattern: 'shaky',
            voiceTremor: true,
            concernLevel: 'high',
          })
        );
        calculateStressAdaptation(testSessionId);
      }

      const adaptation = calculateStressAdaptation(testSessionId);
      expect(adaptation.adaptationLevel).toBeGreaterThan(0.5);
      expect(adaptation.speedMultiplier).toBeLessThan(0.9);
      expect(adaptation.pauseMultiplier).toBeGreaterThan(1.2);
      // warmthLevel is 'high' at adaptation > 0.6, 'medium' at > 0.3
      expect(['medium', 'high']).toContain(adaptation.warmthLevel);
    });
  });

  describe('Gradual Ramping', () => {
    it('ramps up gradually over multiple turns', () => {
      // Sudden high stress should not immediately max out adaptation
      // Need multiple readings to build up, respecting cooldown
      for (let i = 0; i < 3; i++) {
        recordStressReading(
          testSessionId,
          createReading({ stressLevel: 0.9, anxietyMarkers: true, breathPattern: 'shaky' })
        );
        calculateStressAdaptation(testSessionId);
      }

      const firstAdaptation = calculateStressAdaptation(testSessionId);

      // Continue with high stress for more turns
      for (let i = 0; i < 3; i++) {
        recordStressReading(
          testSessionId,
          createReading({ stressLevel: 0.9, anxietyMarkers: true, breathPattern: 'shaky' })
        );
        calculateStressAdaptation(testSessionId);
      }

      const secondAdaptation = calculateStressAdaptation(testSessionId);

      // Should have ramped up more, but still gradual
      expect(secondAdaptation.adaptationLevel).toBeGreaterThanOrEqual(
        firstAdaptation.adaptationLevel
      );
      // Both should be non-zero for high stress
      expect(secondAdaptation.adaptationLevel).toBeGreaterThan(0);
    });

    it('ramps down when stress decreases', () => {
      // Build up stress with strong signals
      for (let i = 0; i < 8; i++) {
        recordStressReading(
          testSessionId,
          createReading({
            stressLevel: 0.85,
            anxietyMarkers: true,
            breathPattern: 'shaky',
            voiceTremor: true,
          })
        );
        calculateStressAdaptation(testSessionId);
      }

      const highPoint = calculateStressAdaptation(testSessionId);
      const highLevel = highPoint.adaptationLevel;

      // Verify we actually built up stress
      expect(highLevel).toBeGreaterThan(0);

      // Now stress decreases significantly
      for (let i = 0; i < 8; i++) {
        recordStressReading(testSessionId, createReading({ stressLevel: 0.1 }));
        calculateStressAdaptation(testSessionId);
      }

      const lowPoint = calculateStressAdaptation(testSessionId);
      expect(lowPoint.adaptationLevel).toBeLessThan(highLevel);
    });
  });

  describe('Hysteresis', () => {
    it('ignores small stress fluctuations', () => {
      // Establish a baseline
      recordStressReading(testSessionId, createReading({ stressLevel: 0.5 }));
      const baseline = calculateStressAdaptation(testSessionId);

      // Small fluctuation
      recordStressReading(testSessionId, createReading({ stressLevel: 0.52 }));
      const afterFluctuation = calculateStressAdaptation(testSessionId);

      // Should not have changed significantly
      expect(Math.abs(afterFluctuation.adaptationLevel - baseline.adaptationLevel)).toBeLessThan(
        STRESS_ADAPTATION_CONFIG.HYSTERESIS_THRESHOLD
      );
    });
  });

  describe('SSML Application', () => {
    it('does not modify text when adaptation is low', () => {
      const text = 'Hello, how are you?';
      const adaptation = {
        speedMultiplier: 1.0,
        pauseMultiplier: 1.0,
        warmthLevel: 'normal' as const,
        emotion: '',
        shouldAcknowledge: false,
        adaptationLevel: 0.05,
        reason: 'no stress detected',
      };

      const result = applyStressAdaptationSsml(text, adaptation);
      expect(result).toBe(text);
    });

    it('applies speed adjustment for moderate stress', () => {
      const text = 'Hello, how are you?';
      const adaptation = {
        speedMultiplier: 0.88,
        pauseMultiplier: 1.35,
        warmthLevel: 'medium' as const,
        emotion: 'calm',
        shouldAcknowledge: false,
        adaptationLevel: 0.5,
        reason: 'moderate stress',
      };

      const result = applyStressAdaptationSsml(text, adaptation);
      expect(result).toContain('<speed ratio="0.88"/>');
      expect(result).toContain('<emotion value="calm">');
    });

    it('extends existing pauses', () => {
      const text = 'Take a breath.<break time="200ms"/> You\'re doing great.';
      const adaptation = {
        speedMultiplier: 0.85,
        pauseMultiplier: 1.5,
        warmthLevel: 'high' as const,
        emotion: 'serene',
        shouldAcknowledge: false,
        adaptationLevel: 0.7,
        reason: 'high stress',
      };

      const result = applyStressAdaptationSsml(text, adaptation);
      // 200ms * 1.5 = 300ms
      expect(result).toContain('<break time="300ms"/>');
    });

    it('does not double-wrap emotions', () => {
      const text = '<emotion value="happy">Great news!</emotion>';
      const adaptation = {
        speedMultiplier: 0.9,
        pauseMultiplier: 1.2,
        warmthLevel: 'medium' as const,
        emotion: 'calm',
        shouldAcknowledge: false,
        adaptationLevel: 0.4,
        reason: 'mild stress',
      };

      const result = applyStressAdaptationSsml(text, adaptation);
      // Should not add another emotion wrapper
      const emotionCount = (result.match(/<emotion/g) || []).length;
      expect(emotionCount).toBe(1);
    });
  });

  describe('State Monitoring', () => {
    it('returns null for unknown session', () => {
      const state = getStressAdaptationState('unknown-session');
      expect(state).toBeNull();
    });

    it('returns current state for active session', () => {
      recordStressReading(testSessionId, createReading({ stressLevel: 0.6 }));
      calculateStressAdaptation(testSessionId);

      const state = getStressAdaptationState(testSessionId);
      expect(state).toBeDefined();
      expect(state?.historyLength).toBe(1);
      expect(state?.lastReading?.stressLevel).toBe(0.6);
    });
  });
});

// ============================================================================
// HELPERS
// ============================================================================

function createReading(overrides: Partial<StressReading>): StressReading {
  return {
    timestamp: Date.now(),
    stressLevel: 0,
    anxietyMarkers: false,
    breathPattern: 'normal',
    voiceTremor: false,
    concernLevel: 'none',
    ...overrides,
  };
}
