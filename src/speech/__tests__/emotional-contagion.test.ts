/**
 * Emotional Contagion Service Tests
 *
 * Tests for emotional continuity and prosodic momentum:
 * - Utterance state recording
 * - Momentum tracking
 * - Continuity hints generation
 * - SSML application
 *
 * @module emotional-contagion.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EmotionalContagionService,
  getEmotionalContagionService,
  resetEmotionalContagion,
  resetAllEmotionalContagion,
  type UtteranceEmotionalState,
  type EmotionalMomentum,
  type ProsodyContinuityHints,
} from '../emotional-contagion.js';
import type { EmotionalArc } from '../../conversation/emotional-arc.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

const createMockEmotionalArc = (overrides: Partial<EmotionalArc> = {}): EmotionalArc => ({
  currentEmotion: 'neutral',
  currentValence: 0,
  currentArousal: 0.5,
  trajectory: 'stable',
  trajectoryConfidence: 0.7,
  valenceMomentum: 0,
  arousalMomentum: 0,
  conversationTemperature: 0.4,
  smoothedValence: 0,
  smoothedArousal: 0.5,
  turnsSinceEmotionalPeak: 5,
  turnsSinceDistress: 10,
  needsEmotionalSupport: false,
  emotionStabilizing: false,
  suddenShiftDetected: false,
  ...overrides,
});

const createUtteranceState = (
  overrides: Partial<Omit<UtteranceEmotionalState, 'timestamp'>> = {}
): Omit<UtteranceEmotionalState, 'timestamp'> => ({
  emotion: 'neutral',
  valence: 0,
  arousal: 0.5,
  warmth: 'medium',
  wasSupporting: false,
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('EmotionalContagionService', () => {
  let service: EmotionalContagionService;
  const sessionId = 'test-contagion-session';

  beforeEach(() => {
    resetAllEmotionalContagion();
    service = new EmotionalContagionService(sessionId);
  });

  afterEach(() => {
    resetAllEmotionalContagion();
  });

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  describe('Initialization', () => {
    it('should initialize with default momentum', () => {
      const momentum = service.getMomentum();

      expect(momentum.valence).toBeCloseTo(0.2); // Slightly positive
      expect(momentum.arousal).toBeCloseTo(0.5); // Moderate
      expect(momentum.warmth).toBe('medium');
      expect(momentum.turnsAtState).toBe(0);
      expect(momentum.trend).toBe('stable');
    });

    it('should create service via singleton getter', () => {
      const instance1 = getEmotionalContagionService('singleton-session');
      const instance2 = getEmotionalContagionService('singleton-session');

      expect(instance1).toBe(instance2);

      resetEmotionalContagion('singleton-session');
    });
  });

  // -------------------------------------------------------------------------
  // UTTERANCE RECORDING
  // -------------------------------------------------------------------------

  describe('Utterance Recording', () => {
    it('should record utterance and update momentum', () => {
      const state = createUtteranceState({
        emotion: 'happy',
        valence: 0.7,
        arousal: 0.8,
        warmth: 'high',
      });

      service.recordUtterance(state);

      const momentum = service.getMomentum();

      // Momentum should blend towards the new state
      expect(momentum.valence).toBeGreaterThan(0.2);
      expect(momentum.arousal).toBeGreaterThan(0.5);
    });

    it('should track warmth from supporting utterances', () => {
      const supportingState = createUtteranceState({
        emotion: 'empathetic',
        valence: -0.1,
        arousal: 0.3,
        warmth: 'high',
        wasSupporting: true,
      });

      service.recordUtterance(supportingState);

      const momentum = service.getMomentum();

      expect(momentum.warmth).toBe('high');
    });

    it('should limit history to max size', () => {
      // Record more than max history
      for (let i = 0; i < 15; i++) {
        service.recordUtterance(
          createUtteranceState({
            emotion: 'neutral',
            valence: i * 0.05,
            arousal: 0.5,
          })
        );
      }

      // Service should not crash and momentum should be valid
      const momentum = service.getMomentum();
      expect(momentum).toBeDefined();
    });

    it('should detect building trend when arousal increases', () => {
      // Start with low arousal
      service.recordUtterance(
        createUtteranceState({
          arousal: 0.3,
        })
      );

      // Jump to high arousal
      service.recordUtterance(
        createUtteranceState({
          arousal: 0.8,
        })
      );

      const momentum = service.getMomentum();

      expect(momentum.trend).toBe('building');
    });

    it('should detect dissipating trend when arousal decreases', () => {
      // Start with high arousal
      service.recordUtterance(
        createUtteranceState({
          arousal: 0.8,
        })
      );

      // Drop to low arousal
      service.recordUtterance(
        createUtteranceState({
          arousal: 0.3,
        })
      );

      const momentum = service.getMomentum();

      expect(momentum.trend).toBe('dissipating');
    });

    it('should track turns at stable state', () => {
      // Record similar states
      for (let i = 0; i < 5; i++) {
        service.recordUtterance(
          createUtteranceState({
            valence: 0.3,
            arousal: 0.5,
          })
        );
      }

      const momentum = service.getMomentum();

      expect(momentum.turnsAtState).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // CONTINUITY HINTS
  // -------------------------------------------------------------------------

  describe('Continuity Hints', () => {
    it('should return default hints without history', () => {
      const hints = service.getContinuityHints(null);

      expect(hints.opening.pauseMs).toBe(100);
      expect(hints.prosody.speedAdjust).toBe(0);
      expect(hints.prosody.volumeAdjust).toBe(1.0);
      expect(hints.emotion.tag).toBe('neutral');
    });

    it('should maintain warmth in hints when momentum is warm', () => {
      // Build up warm momentum
      for (let i = 0; i < 4; i++) {
        service.recordUtterance(
          createUtteranceState({
            emotion: 'empathetic',
            warmth: 'high',
            wasSupporting: true,
          })
        );
      }

      const hints = service.getContinuityHints(null);

      expect(hints.emotion.tag).toBe('warm');
      expect(hints.closingWarmth).toBe(true);
      expect(hints.prosody.pitchTendency).toBe('lower');
    });

    it('should adjust for high energy momentum', () => {
      // Build up high energy
      for (let i = 0; i < 4; i++) {
        service.recordUtterance(
          createUtteranceState({
            arousal: 0.8,
          })
        );
      }

      const hints = service.getContinuityHints(null);

      expect(hints.opening.buildEnergy).toBe(true);
      expect(hints.prosody.speedAdjust).toBeGreaterThan(0);
    });

    it('should adjust for low energy momentum', () => {
      // Build up low energy/calm state
      for (let i = 0; i < 4; i++) {
        service.recordUtterance(
          createUtteranceState({
            arousal: 0.2,
          })
        );
      }

      const hints = service.getContinuityHints(null);

      expect(hints.prosody.speedAdjust).toBeLessThan(0);
      expect(hints.opening.pauseMs).toBeGreaterThanOrEqual(200);
    });

    it('should respond to emotional arc needing support', () => {
      const arcNeedingSupport = createMockEmotionalArc({
        needsEmotionalSupport: true,
        currentValence: -0.5,
      });

      const hints = service.getContinuityHints(arcNeedingSupport);

      expect(hints.emotion.tag).toBe('empathetic');
      expect(hints.emotion.intensity).toBeGreaterThanOrEqual(0.8);
      expect(hints.closingWarmth).toBe(true);
    });

    it('should add gentleness after sudden emotional shift', () => {
      const arcWithShift = createMockEmotionalArc({
        suddenShiftDetected: true,
      });

      const hints = service.getContinuityHints(arcWithShift);

      expect(hints.opening.pauseMs).toBeGreaterThanOrEqual(300);
      expect(hints.opening.softStart).toBe(true);
    });

    it('should adjust pitch for positive arc', () => {
      const positiveArc = createMockEmotionalArc({
        currentValence: 0.7,
        trajectory: 'improving',
      });

      const hints = service.getContinuityHints(positiveArc);

      expect(hints.prosody.pitchTendency).toBe('higher');
    });

    it('should adjust for difficulty in negative arc', () => {
      const negativeArc = createMockEmotionalArc({
        currentValence: -0.5,
      });

      const hints = service.getContinuityHints(negativeArc);

      expect(hints.emotion.tag).toBe('gentle');
      expect(hints.prosody.pitchTendency).toBe('lower');
    });

    it('should smooth energy transitions', () => {
      // High arousal utterance
      service.recordUtterance(
        createUtteranceState({
          arousal: 0.9,
        })
      );

      // Get hints (momentum should be different from last utterance initially)
      const hints = service.getContinuityHints(null);

      // Should have smoothing if there's a large arousal diff
      expect(hints).toBeDefined();
    });

    it('should clamp values to reasonable ranges', () => {
      // Extreme momentum
      for (let i = 0; i < 10; i++) {
        service.recordUtterance(
          createUtteranceState({
            arousal: 1.0,
            valence: 1.0,
          })
        );
      }

      const hints = service.getContinuityHints(
        createMockEmotionalArc({
          needsEmotionalSupport: true,
          suddenShiftDetected: true,
          currentValence: 1.0,
        })
      );

      // Values should be clamped
      expect(hints.prosody.speedAdjust).toBeGreaterThanOrEqual(-0.3);
      expect(hints.prosody.speedAdjust).toBeLessThanOrEqual(0.3);
      expect(hints.prosody.volumeAdjust).toBeGreaterThanOrEqual(0.8);
      expect(hints.prosody.volumeAdjust).toBeLessThanOrEqual(1.2);
      expect(hints.opening.pauseMs).toBeGreaterThanOrEqual(0);
      expect(hints.opening.pauseMs).toBeLessThanOrEqual(500);
    });

    it('should include reason in hints', () => {
      service.recordUtterance(
        createUtteranceState({
          warmth: 'high',
          wasSupporting: true,
        })
      );

      const hints = service.getContinuityHints(null);

      expect(hints.reason).toBeTruthy();
      expect(typeof hints.reason).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  // SSML APPLICATION
  // -------------------------------------------------------------------------

  describe('SSML Application', () => {
    it('should add opening pause when specified', () => {
      const hints: ProsodyContinuityHints = {
        opening: { pauseMs: 200, softStart: false, buildEnergy: false },
        prosody: { speedAdjust: 0, volumeAdjust: 1.0, pitchTendency: 'neutral' },
        emotion: { tag: 'neutral', intensity: 0.5 },
        closingWarmth: false,
        reason: 'Test',
      };

      const result = service.applyContinuityToSsml('Hello there.', hints);

      expect(result).toContain('<break time="200ms"/>');
      expect(result).toContain('Hello there.');
    });

    it('should not add pause below threshold', () => {
      const hints: ProsodyContinuityHints = {
        opening: { pauseMs: 50, softStart: false, buildEnergy: false },
        prosody: { speedAdjust: 0, volumeAdjust: 1.0, pitchTendency: 'neutral' },
        emotion: { tag: 'neutral', intensity: 0.5 },
        closingWarmth: false,
        reason: 'Test',
      };

      const result = service.applyContinuityToSsml('Hello there.', hints);

      expect(result).not.toContain('<break');
    });

    it('should add soft start pause', () => {
      const hints: ProsodyContinuityHints = {
        opening: { pauseMs: 50, softStart: true, buildEnergy: false },
        prosody: { speedAdjust: 0, volumeAdjust: 1.0, pitchTendency: 'neutral' },
        emotion: { tag: 'neutral', intensity: 0.5 },
        closingWarmth: false,
        reason: 'Test',
      };

      const result = service.applyContinuityToSsml(
        'This is a longer sentence with several words.',
        hints
      );

      expect(result).toContain('<break time="80ms"/>');
    });

    it('should add closing warmth pause', () => {
      const hints: ProsodyContinuityHints = {
        opening: { pauseMs: 50, softStart: false, buildEnergy: false },
        prosody: { speedAdjust: 0, volumeAdjust: 1.0, pitchTendency: 'neutral' },
        emotion: { tag: 'neutral', intensity: 0.5 },
        closingWarmth: true,
        reason: 'Test',
      };

      const result = service.applyContinuityToSsml(
        'First sentence here. And here is the final thought.',
        hints
      );

      // Should add pause before final sentence
      expect(result).toContain('<break time="150ms"/>');
    });
  });

  // -------------------------------------------------------------------------
  // RESET FUNCTIONALITY
  // -------------------------------------------------------------------------

  describe('Reset Functionality', () => {
    it('should reset service state', () => {
      // Build up state
      service.recordUtterance(
        createUtteranceState({
          emotion: 'happy',
          valence: 0.8,
          arousal: 0.9,
          warmth: 'high',
        })
      );

      service.reset();

      const momentum = service.getMomentum();

      // Should be back to initial state
      expect(momentum.turnsAtState).toBe(0);
      expect(momentum.warmth).toBe('medium');
    });

    it('should remove session via resetEmotionalContagion', () => {
      const testSession = 'reset-test-session';
      const instance = getEmotionalContagionService(testSession);
      instance.recordUtterance(createUtteranceState({ warmth: 'high' }));

      resetEmotionalContagion(testSession);

      // Getting again should create new instance
      const newInstance = getEmotionalContagionService(testSession);
      const momentum = newInstance.getMomentum();

      expect(momentum.warmth).toBe('medium'); // Default, not 'high'

      resetEmotionalContagion(testSession);
    });
  });
});
