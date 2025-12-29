/**
 * Tests for Markov Sequence Predictor
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordTransition,
  recordSecondOrderTransition,
  predictNextStates,
  extractStatesFromTurn,
  type ObservableState,
} from '../markov-sequence-predictor.js';

describe('MarkovSequencePredictor', () => {
  const testUserId = 'test-user-markov';

  describe('recordTransition', () => {
    it('should record a state transition', () => {
      recordTransition(testUserId, 'emotion:anxious', 'topic:work');
      // No error means success - state is stored internally
    });

    it('should handle multiple transitions', () => {
      for (let i = 0; i < 10; i++) {
        recordTransition(testUserId, 'emotion:stressed', 'topic:sleep');
      }
      // Should not throw
    });
  });

  describe('recordSecondOrderTransition', () => {
    it('should record a second-order transition', () => {
      recordSecondOrderTransition(
        testUserId,
        'emotion:anxious',
        'topic:work',
        'behavior:venting'
      );
      // No error means success
    });
  });

  describe('predictNextStates', () => {
    it('should return predictions after sufficient training', () => {
      const userId = 'test-predict-user';

      // Train with enough data
      for (let i = 0; i < 15; i++) {
        recordTransition(userId, 'emotion:stressed', 'topic:sleep');
      }
      for (let i = 0; i < 5; i++) {
        recordTransition(userId, 'emotion:stressed', 'topic:work');
      }

      const prediction = predictNextStates(userId, 'emotion:stressed');

      expect(prediction.currentState).toBe('emotion:stressed');
      expect(Array.isArray(prediction.predictions)).toBe(true);
    });

    it('should return empty predictions for unknown user', () => {
      const prediction = predictNextStates('unknown-user-xyz', 'emotion:happy');

      expect(prediction.predictions).toHaveLength(0);
      expect(prediction.isReliable).toBe(false);
    });

    it('should use community patterns for cold start', () => {
      // Record some community data first
      for (let i = 0; i < 20; i++) {
        recordTransition(`community-user-${i}`, 'emotion:happy', 'topic:social');
      }

      const prediction = predictNextStates('brand-new-user', 'emotion:happy');

      // Should get some prediction from community patterns
      expect(prediction.source).toBe('community');
    });
  });

  describe('extractStatesFromTurn', () => {
    it('should extract emotion state', () => {
      const states = extractStatesFromTurn('I feel really anxious today', 'anxious');

      expect(states).toContain('emotion:anxious');
    });

    it('should extract topic state', () => {
      const states = extractStatesFromTurn('Work has been stressful', undefined, 'work');

      expect(states).toContain('topic:work');
    });

    it('should extract temporal states', () => {
      const morningDate = new Date();
      morningDate.setHours(9, 0, 0, 0);

      const states = extractStatesFromTurn('Good morning', undefined, undefined, morningDate);

      expect(states).toContain('temporal:morning');
    });

    it('should extract behavioral states from text patterns', () => {
      const ventingStates = extractStatesFromTurn("Ugh, I can't believe this happened!");
      expect(ventingStates).toContain('behavior:venting');

      const adviceStates = extractStatesFromTurn('What should I do about this situation?');
      expect(adviceStates).toContain('behavior:seeking_advice');

      const planningStates = extractStatesFromTurn("I'm going to start exercising tomorrow");
      expect(planningStates).toContain('behavior:planning');
    });

    it('should handle weekend vs weekday', () => {
      const saturday = new Date('2024-12-28T10:00:00'); // Saturday
      const monday = new Date('2024-12-30T10:00:00'); // Monday

      const weekendStates = extractStatesFromTurn('Hello', undefined, undefined, saturday);
      const weekdayStates = extractStatesFromTurn('Hello', undefined, undefined, monday);

      expect(weekendStates).toContain('temporal:weekend');
      expect(weekdayStates).toContain('temporal:weekday');
    });
  });
});
