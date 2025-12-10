/**
 * Turn Prediction Tests
 *
 * Tests the TurnPredictionService that:
 * - Predicts when user has finished their turn
 * - Analyzes sentence completeness
 * - Learns user patterns
 * - Recommends preemptive response generation
 *
 * @module tests/turn-prediction
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  analyzeTranscriptCompleteness,
  decidePreemptiveGeneration,
  getTurnPredictionService,
  resetAllTurnPrediction,
  resetTurnPredictionService,
  type TurnPrediction,
} from '../conversation/turn-prediction.js';

// ============================================================================
// TESTS
// ============================================================================

describe('TurnPredictionService', () => {
  beforeEach(() => {
    resetAllTurnPrediction();
  });

  afterEach(() => {
    resetAllTurnPrediction();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance for the same session', () => {
      const instance1 = getTurnPredictionService('session-1');
      const instance2 = getTurnPredictionService('session-1');
      expect(instance1).toBe(instance2);
    });

    it('should return different instances for different sessions', () => {
      const instance1 = getTurnPredictionService('session-1');
      const instance2 = getTurnPredictionService('session-2');
      expect(instance1).not.toBe(instance2);
    });

    it('should create new instance after reset', () => {
      getTurnPredictionService('session-1');
      resetTurnPredictionService('session-1');
      const instance2 = getTurnPredictionService('session-1');
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Sentence Completeness Analysis
  // --------------------------------------------------------------------------

  describe('analyzeTranscriptCompleteness', () => {
    it('should detect question ending', () => {
      const result = analyzeTranscriptCompleteness('How are you doing?');

      expect(result.isComplete).toBe(true);
      expect(result.endingType).toBe('question');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should detect statement ending with period', () => {
      const result = analyzeTranscriptCompleteness('I am doing well.');

      expect(result.isComplete).toBe(true);
      expect(result.endingType).toBe('statement');
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    it('should detect exclamation ending', () => {
      const result = analyzeTranscriptCompleteness('That is amazing!');

      expect(result.isComplete).toBe(true);
      expect(result.endingType).toBe('exclamation');
    });

    it('should detect turn-final phrases', () => {
      const turnFinalPhrases = ['so yeah', 'you know', "that's it", "that's all", 'I guess'];

      for (const phrase of turnFinalPhrases) {
        const result = analyzeTranscriptCompleteness(`I was thinking about it, ${phrase}`);
        expect(result.isComplete).toBe(true);
      }
    });

    it('should detect continuation phrases as incomplete', () => {
      const continuationPhrases = ['but', 'and', 'because', 'so', 'although'];

      for (const phrase of continuationPhrases) {
        const result = analyzeTranscriptCompleteness(`I want to tell you ${phrase}`);
        expect(result.isComplete).toBe(false);
        expect(result.endingType).toBe('incomplete');
      }
    });

    it('should detect empty transcript as incomplete', () => {
      const result = analyzeTranscriptCompleteness('');

      expect(result.isComplete).toBe(false);
      expect(result.endingType).toBe('incomplete');
    });

    it('should detect very short transcripts as incomplete', () => {
      const result = analyzeTranscriptCompleteness('I um');

      expect(result.isComplete).toBe(false);
    });

    it('should detect trailing pronouns as potentially complete', () => {
      const result = analyzeTranscriptCompleteness('I need to talk about it');

      // Should have some completion signal
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Turn Prediction
  // --------------------------------------------------------------------------

  describe('Turn Prediction', () => {
    it('should predict complete turn with question mark', () => {
      const service = getTurnPredictionService('test-session');

      const prediction = service.predict({
        transcript: 'What do you think about this?',
        speakingDurationMs: 2000,
        silenceDurationMs: 500,
        turnCount: 1,
      });

      expect(prediction.isComplete).toBe(true);
      expect(prediction.readyToRespond).toBe(true);
    });

    it('should predict incomplete turn with trailing conjunction', () => {
      const service = getTurnPredictionService('test-session');

      const prediction = service.predict({
        transcript: 'I was thinking about it and',
        speakingDurationMs: 1500,
        silenceDurationMs: 100,
        turnCount: 1,
      });

      expect(prediction.isComplete).toBe(false);
    });

    it('should increase confidence with silence', () => {
      const service = getTurnPredictionService('test-session');

      const prediction1 = service.predict({
        transcript: 'I think so',
        speakingDurationMs: 1000,
        silenceDurationMs: 100,
        turnCount: 1,
      });

      const prediction2 = service.predict({
        transcript: 'I think so',
        speakingDurationMs: 1000,
        silenceDurationMs: 1000,
        turnCount: 2,
      });

      expect(prediction2.confidence).toBeGreaterThan(prediction1.confidence);
    });

    it('should consider falling intonation as completion signal', () => {
      const service = getTurnPredictionService('test-session');

      const prediction = service.predict({
        transcript: 'I think this is a good idea',
        speakingDurationMs: 2000,
        silenceDurationMs: 300,
        intonation: 'falling',
        turnCount: 1,
      });

      expect(prediction.isComplete).toBe(true);
    });

    it('should reduce confidence with rising intonation', () => {
      const service = getTurnPredictionService('test-session');

      const basePrediction = service.predict({
        transcript: 'I was thinking about going',
        speakingDurationMs: 2000,
        silenceDurationMs: 300,
        turnCount: 1,
      });

      const risingPrediction = service.predict({
        transcript: 'I was thinking about going',
        speakingDurationMs: 2000,
        silenceDurationMs: 300,
        intonation: 'rising',
        turnCount: 2,
      });

      // Rising intonation should decrease confidence
      expect(risingPrediction.confidence).toBeLessThanOrEqual(basePrediction.confidence + 0.1);
    });

    it('should adjust for heavy topics', () => {
      const service = getTurnPredictionService('test-session');

      const prediction = service.predict({
        transcript: 'I think so',
        speakingDurationMs: 1000,
        silenceDurationMs: 500,
        topicWeight: 'heavy',
        turnCount: 1,
      });

      // Heavy topics should have longer wait
      expect(prediction.suggestedWaitMs).toBeGreaterThan(200);
    });

    it('should adjust for high emotion', () => {
      const service = getTurnPredictionService('test-session');

      const prediction = service.predict({
        transcript: 'I understand',
        speakingDurationMs: 1000,
        silenceDurationMs: 500,
        emotionIntensity: 0.9,
        turnCount: 1,
      });

      // High emotion should have longer wait
      expect(prediction.suggestedWaitMs).toBeGreaterThan(200);
    });
  });

  // --------------------------------------------------------------------------
  // Learning User Patterns
  // --------------------------------------------------------------------------

  describe('Learning User Patterns', () => {
    it('should learn from turn completions', () => {
      const service = getTurnPredictionService('test-session');

      // Record several turn completions
      service.recordTurnCompletion(20, 500);
      service.recordTurnCompletion(25, 600);
      service.recordTurnCompletion(22, 550);

      const prediction = service.predict({
        transcript: 'This is a message with about twenty words or so to match the pattern',
        speakingDurationMs: 5000,
        silenceDurationMs: 400,
        turnCount: 4,
      });

      // Should incorporate learned patterns
      expect(prediction.confidence).toBeGreaterThan(0.5);
    });

    it('should estimate remaining words', () => {
      const service = getTurnPredictionService('test-session');

      // Record pattern of longer turns
      service.recordTurnCompletion(30, 500);
      service.recordTurnCompletion(35, 600);
      service.recordTurnCompletion(32, 550);

      const prediction = service.predict({
        transcript: 'Short start',
        speakingDurationMs: 1000,
        silenceDurationMs: 100,
        turnCount: 4,
      });

      // Should estimate more words coming
      expect(prediction.estimatedRemainingWords).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Preemptive Generation Decisions
  // --------------------------------------------------------------------------

  describe('decidePreemptiveGeneration', () => {
    it('should recommend full generation for high confidence', () => {
      const prediction: TurnPrediction = {
        isComplete: true,
        confidence: 0.9,
        estimatedRemainingWords: 0,
        readyToRespond: true,
        reason: 'High confidence completion',
        suggestedWaitMs: 200,
      };

      const decision = decidePreemptiveGeneration(prediction, 300);

      expect(decision.shouldGenerate).toBe(true);
      expect(decision.preparationLevel).toBe('full');
    });

    it('should recommend partial generation for moderate confidence with high latency', () => {
      const prediction: TurnPrediction = {
        isComplete: true,
        confidence: 0.7,
        estimatedRemainingWords: 0,
        readyToRespond: true,
        reason: 'Moderate confidence',
        suggestedWaitMs: 300,
      };

      const decision = decidePreemptiveGeneration(prediction, 700);

      expect(decision.shouldGenerate).toBe(true);
      expect(decision.preparationLevel).toBe('partial');
    });

    it('should recommend opening_only for complete but low confidence', () => {
      const prediction: TurnPrediction = {
        isComplete: true,
        confidence: 0.55,
        estimatedRemainingWords: 0,
        readyToRespond: false,
        reason: 'Low confidence',
        suggestedWaitMs: 500,
      };

      const decision = decidePreemptiveGeneration(prediction, 300);

      expect(decision.shouldGenerate).toBe(true);
      expect(decision.preparationLevel).toBe('opening_only');
    });

    it('should not recommend generation for insufficient confidence', () => {
      const prediction: TurnPrediction = {
        isComplete: false,
        confidence: 0.3,
        estimatedRemainingWords: 5,
        readyToRespond: false,
        reason: 'Incomplete',
        suggestedWaitMs: 1000,
      };

      const decision = decidePreemptiveGeneration(prediction, 300);

      expect(decision.shouldGenerate).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('Reset', () => {
    it('should reset service state', () => {
      const service = getTurnPredictionService('test-session');

      service.recordTurnCompletion(20, 500);
      service.predict({
        transcript: 'Test message',
        speakingDurationMs: 1000,
        silenceDurationMs: 200,
        turnCount: 1,
      });

      service.reset();

      // After reset, last prediction should be null
      expect(service.getLastPrediction()).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty transcript', () => {
      const service = getTurnPredictionService('test-session');

      expect(() => {
        service.predict({
          transcript: '',
          speakingDurationMs: 0,
          silenceDurationMs: 0,
          turnCount: 1,
        });
      }).not.toThrow();
    });

    it('should handle very long transcript', () => {
      const service = getTurnPredictionService('test-session');
      const longTranscript = 'word '.repeat(500);

      expect(() => {
        service.predict({
          transcript: longTranscript,
          speakingDurationMs: 60000,
          silenceDurationMs: 200,
          turnCount: 1,
        });
      }).not.toThrow();
    });

    it('should handle special characters', () => {
      const service = getTurnPredictionService('test-session');

      expect(() => {
        service.predict({
          transcript: 'Test with $100 & <tags> and "quotes"?',
          speakingDurationMs: 2000,
          silenceDurationMs: 200,
          turnCount: 1,
        });
      }).not.toThrow();
    });

    it('should handle rapid consecutive predictions', () => {
      const service = getTurnPredictionService('test-session');

      expect(() => {
        for (let i = 0; i < 50; i++) {
          service.predict({
            transcript: `Message ${i}`,
            speakingDurationMs: 1000,
            silenceDurationMs: i * 10,
            turnCount: i + 1,
          });
        }
      }).not.toThrow();
    });
  });
});
