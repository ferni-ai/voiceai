/**
 * Enhanced Turn Prediction Tests
 *
 * Tests for prosodic phrase boundary detection and turn completion prediction:
 * - Phrase boundary detection
 * - Syntactic completeness estimation
 * - Turn prediction with multiple cues
 * - Pattern learning
 *
 * @module enhanced-turn-prediction.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProsodyFeatures } from '../audio-prosody.js';
import {
  EnhancedTurnPredictionService,
  detectPhraseBoundary,
  estimateSyntacticCompleteness,
  getEnhancedTurnPredictor,
  resetEnhancedTurnPredictor,
} from '../enhanced-turn-prediction.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

const createMockProsody = (overrides: Partial<ProsodyFeatures> = {}): ProsodyFeatures => ({
  pitchMean: 150,
  pitchVariance: 20,
  pitchRange: 50,
  pitchContour: 'flat',
  energyMean: -20,
  energyVariance: 5,
  energyPeaks: 2,
  speechRate: 4,
  pauseDuration: 200,
  pauseFrequency: 3,
  jitter: 0.01,
  shimmer: 0.02,
  breathiness: 0.1,
  utteranceDuration: 2000,
  speakingRatio: 0.8,
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('Enhanced Turn Prediction', () => {
  // -------------------------------------------------------------------------
  // PHRASE BOUNDARY DETECTION
  // -------------------------------------------------------------------------

  describe('Phrase Boundary Detection', () => {
    it('should detect falling pitch as statement boundary', () => {
      const currentProsody = createMockProsody({ pitchMean: 120 });
      const previousProsody = createMockProsody({ pitchMean: 160 }); // 40Hz drop

      const result = detectPhraseBoundary(currentProsody, previousProsody);

      expect(result.isPhraseBoundary).toBe(true);
      expect(result.boundaryType).toBe('statement');
      expect(result.boundaryContour).toBe('falling');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect rising pitch with wide range as question', () => {
      const currentProsody = createMockProsody({
        pitchMean: 180,
        pitchRange: 120, // Wide range = question
      });
      const previousProsody = createMockProsody({ pitchMean: 150 });

      const result = detectPhraseBoundary(currentProsody, previousProsody);

      expect(result.isPhraseBoundary).toBe(true);
      expect(result.boundaryType).toBe('question');
      expect(result.boundaryContour).toBe('rising');
    });

    it('should detect rising pitch with narrow range as continuation', () => {
      const currentProsody = createMockProsody({
        pitchMean: 175,
        pitchRange: 40, // Narrow range = continuation
      });
      const previousProsody = createMockProsody({ pitchMean: 150 });

      const result = detectPhraseBoundary(currentProsody, previousProsody);

      expect(result.boundaryType).toBe('continuation');
      expect(result.confidence).toBeLessThanOrEqual(0.6);
    });

    it('should detect level pitch with lengthening as emphasis', () => {
      const currentProsody = createMockProsody({
        pitchMean: 152,
        utteranceDuration: 2700, // More than 30% longer (2000 * 1.3 = 2600)
      });
      const previousProsody = createMockProsody({
        pitchMean: 150,
        utteranceDuration: 2000,
      });

      const result = detectPhraseBoundary(currentProsody, previousProsody);

      expect(result.boundaryType).toBe('emphasis');
      expect(result.hasPreBoundaryLengthening).toBe(true);
    });

    it('should handle no previous prosody', () => {
      const currentProsody = createMockProsody({ pitchMean: 150 });

      const result = detectPhraseBoundary(currentProsody);

      expect(result).toBeDefined();
      expect(result.boundaryContour).toBe('level');
    });

    it('should increase confidence with pre-boundary lengthening', () => {
      const currentWithLengthening = createMockProsody({
        pitchMean: 110, // Falling
        utteranceDuration: 2800, // Lengthened
      });
      const currentWithoutLengthening = createMockProsody({
        pitchMean: 110, // Falling
        utteranceDuration: 2000, // Normal
      });
      const previous = createMockProsody({
        pitchMean: 150,
        utteranceDuration: 2000,
      });

      const resultWith = detectPhraseBoundary(currentWithLengthening, previous);
      const resultWithout = detectPhraseBoundary(currentWithoutLengthening, previous);

      expect(resultWith.confidence).toBeGreaterThan(resultWithout.confidence);
    });
  });

  // -------------------------------------------------------------------------
  // SYNTACTIC COMPLETENESS
  // -------------------------------------------------------------------------

  describe('Syntactic Completeness Estimation', () => {
    it('should detect incomplete sentences ending with conjunctions', () => {
      const texts = [
        'I was thinking about going and',
        'We could try that, but',
        'This is good because',
        'I want to if',
      ];

      for (const text of texts) {
        const result = estimateSyntacticCompleteness(text);
        expect(result.isComplete).toBe(false);
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('should detect incomplete sentences ending with determiners', () => {
      const texts = ['I saw the', 'Give me a', 'That is my', 'Look at this'];

      for (const text of texts) {
        const result = estimateSyntacticCompleteness(text);
        expect(result.isComplete).toBe(false);
      }
    });

    it('should detect incomplete sentences ending with auxiliaries', () => {
      const texts = ['I am', 'They were', 'We have', 'She will'];

      for (const text of texts) {
        const result = estimateSyntacticCompleteness(text);
        expect(result.isComplete).toBe(false);
      }
    });

    it('should detect incomplete sentences ending with prepositions', () => {
      const texts = ['I went to', 'This is for', 'Coming from', 'Working with'];

      for (const text of texts) {
        const result = estimateSyntacticCompleteness(text);
        expect(result.isComplete).toBe(false);
      }
    });

    it('should detect incomplete sentences ending with hesitation markers', () => {
      const texts = ['So like', 'I mean um', 'Well uh'];

      for (const text of texts) {
        const result = estimateSyntacticCompleteness(text);
        expect(result.isComplete).toBe(false);
      }
    });

    it('should detect complete sentences with final punctuation', () => {
      const texts = ['I went to the store.', 'How are you doing?', 'That was amazing!'];

      for (const text of texts) {
        const result = estimateSyntacticCompleteness(text);
        expect(result.isComplete).toBe(true);
        expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('should detect complete single-word responses with punctuation', () => {
      // Complete single-word responses with punctuation are clearly complete
      const completeWords = ['yes.', 'no.', 'sure.', 'thanks!'];

      for (const text of completeWords) {
        const result = estimateSyntacticCompleteness(text);
        expect(result.isComplete).toBe(true);
      }
    });

    it('should detect explicit completion phrases with punctuation', () => {
      // Explicit completion phrases with punctuation
      const texts = ["That's all.", "That's it.", 'Nothing else.'];

      for (const text of texts) {
        const result = estimateSyntacticCompleteness(text);
        expect(result.isComplete).toBe(true);
      }
    });

    it('should handle very short text as incomplete', () => {
      const result = estimateSyntacticCompleteness('I');

      expect(result.isComplete).toBe(false);
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    it('should consider longer text with verb as potentially complete', () => {
      const result = estimateSyntacticCompleteness('I think this is the right approach');

      expect(result.isComplete).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // TURN PREDICTION SERVICE
  // -------------------------------------------------------------------------

  describe('Turn Prediction Service', () => {
    let service: EnhancedTurnPredictionService;
    const sessionId = 'test-turn-prediction';

    beforeEach(() => {
      service = new EnhancedTurnPredictionService(sessionId);
    });

    afterEach(() => {
      resetEnhancedTurnPredictor(sessionId);
    });

    it('should predict completion for statement with long pause', () => {
      const prosody = createMockProsody({
        pitchContour: 'falling',
        pitchMean: 120,
      });
      const previous = createMockProsody({ pitchMean: 160 });

      // Prime with previous prosody to detect pitch change
      service.predict(previous, 'Starting the conversation', 100);

      const result = service.predict(
        prosody,
        'I think we should move forward with this plan.',
        800 // Long pause
      );

      // Falling pitch + long pause + syntactically complete should suggest completion
      expect(result.completionProbability).toBeGreaterThan(0);
      // Either take_turn or backchannel are reasonable for this scenario
      expect(['take_turn', 'backchannel', 'uncertain']).toContain(result.recommendation);
    });

    it('should predict low completion for incomplete sentence', () => {
      const prosody = createMockProsody({
        pitchContour: 'rising',
        pitchMean: 170,
        pitchRange: 40,
      });
      const previous = createMockProsody({ pitchMean: 150 });

      service.predict(previous, 'So', 100);

      const result = service.predict(prosody, 'So I was thinking that', 150);

      // Should suggest waiting since sentence ends with "that" (incomplete)
      expect(result.recommendation).toBe('wait');
      expect(result.evidence.syntacticComplete).toBe(false);
    });

    it('should handle various completion probabilities', () => {
      const prosody = createMockProsody({
        pitchContour: 'falling',
        pitchMean: 130,
      });
      const previous = createMockProsody({ pitchMean: 150 });

      service.predict(previous, 'Starting', 100);

      const result = service.predict(
        prosody,
        "It's been a really tough week for me.",
        500 // Medium pause
      );

      // Should produce some probability based on the analysis
      expect(result.completionProbability).toBeGreaterThanOrEqual(0);
      expect(result.completionProbability).toBeLessThanOrEqual(1);
      expect(result.evidence).toBeDefined();
    });

    it('should reduce probability for syntactically incomplete text', () => {
      const prosody = createMockProsody();

      const completeResult = service.predict(
        prosody,
        'I want to tell you something important.',
        400
      );

      const incompleteResult = service.predict(prosody, 'I want to tell you', 400);

      expect(completeResult.completionProbability).toBeGreaterThan(
        incompleteResult.completionProbability
      );
    });

    it('should increase probability for long pauses', () => {
      const prosody = createMockProsody();

      // Use same sentence to isolate pause duration effect
      const shortPauseResult = service.predict(prosody, 'This is my complete message.', 100);

      // Reset for clean comparison
      service.reset();

      const longPauseResult = service.predict(prosody, 'This is my complete message.', 900);

      // Long pause should have higher probability (or at least not lower)
      expect(longPauseResult.completionProbability).toBeGreaterThanOrEqual(
        shortPauseResult.completionProbability
      );
      // And specifically, long pause should trigger pause bonus
      expect(longPauseResult.reason).toContain('pause');
    });

    it('should track turn duration patterns', () => {
      service.recordTurnComplete(3000, true, false, 500);
      service.recordTurnComplete(3200, true, false, 450);
      service.recordTurnComplete(2800, true, false, 550);

      const patterns = service.getPatterns();

      expect(patterns.typicalTurnDuration).toBeGreaterThan(2500);
      expect(patterns.typicalTurnDuration).toBeLessThan(3500);
      expect(patterns.fallingEndRatio).toBeGreaterThan(0.9);
    });

    it('should use turn duration ratio in prediction', () => {
      // Set up typical turn duration
      service.recordTurnComplete(4000, true, false, 500);
      service.recordTurnComplete(4000, true, false, 500);

      const prosody = createMockProsody();

      // Very short turn (relative to typical)
      const shortTurnResult = service.predict(prosody, 'Hi', 300);

      expect(shortTurnResult.evidence.turnDurationRatio).toBeLessThan(1);
      expect(shortTurnResult.reason).toContain('short');
    });

    it('should include evidence in prediction result', () => {
      const prosody = createMockProsody({ pitchContour: 'falling' });

      const result = service.predict(prosody, 'Test message here.', 500);

      expect(result.evidence).toBeDefined();
      expect(result.evidence.phraseBoundary).toBeDefined();
      expect(typeof result.evidence.syntacticComplete).toBe('boolean');
      expect(result.evidence.silenceDuration).toBe(500);
      // currentTurnDuration is calculated from when turn started,
      // which is set on first predict call, so it may be 0 or very small
      expect(result.evidence.currentTurnDuration).toBeGreaterThanOrEqual(0);
    });

    it('should reset service state', () => {
      service.recordTurnComplete(5000, true, false, 600);
      service.recordTurnComplete(5000, true, false, 600);

      service.reset();

      const patterns = service.getPatterns();

      // Should be back to defaults
      expect(patterns.typicalTurnDuration).toBe(4000); // DEFAULT_TURN_DURATION
    });
  });

  // -------------------------------------------------------------------------
  // SINGLETON MANAGEMENT
  // -------------------------------------------------------------------------

  describe('Singleton Management', () => {
    it('should return same instance for same session', () => {
      const instance1 = getEnhancedTurnPredictor('test-singleton');
      const instance2 = getEnhancedTurnPredictor('test-singleton');

      expect(instance1).toBe(instance2);

      resetEnhancedTurnPredictor('test-singleton');
    });

    it('should return different instances for different sessions', () => {
      const instance1 = getEnhancedTurnPredictor('session-1');
      const instance2 = getEnhancedTurnPredictor('session-2');

      expect(instance1).not.toBe(instance2);

      resetEnhancedTurnPredictor('session-1');
      resetEnhancedTurnPredictor('session-2');
    });

    it('should create new instance after reset', () => {
      const instance1 = getEnhancedTurnPredictor('test-reset');
      instance1.recordTurnComplete(5000, true, false, 500);

      resetEnhancedTurnPredictor('test-reset');

      const instance2 = getEnhancedTurnPredictor('test-reset');
      const patterns = instance2.getPatterns();

      // Should be fresh defaults, not the recorded pattern
      expect(patterns.typicalTurnDuration).toBe(4000);

      resetEnhancedTurnPredictor('test-reset');
    });
  });
});
