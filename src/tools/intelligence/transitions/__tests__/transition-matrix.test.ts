/**
 * Transition Matrix Tests
 *
 * @module tools/intelligence/transitions/__tests__/transition-matrix.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TransitionMatrix, resetTransitionMatrix } from '../transition-matrix.js';
import { TransitionLearner, resetTransitionLearner } from '../transition-learner.js';

describe('TransitionMatrix', () => {
  let matrix: TransitionMatrix;

  beforeEach(() => {
    resetTransitionMatrix();
    matrix = new TransitionMatrix();
  });

  afterEach(() => {
    resetTransitionMatrix();
  });

  describe('Recording Transitions', () => {
    it('should record a single transition', () => {
      matrix.recordTransition('toolA', 'toolB', {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      const predictions = matrix.getPredictions('toolA');
      expect(predictions.length).toBe(1);
      expect(predictions[0].toolId).toBe('toolB');
      expect(predictions[0].probability).toBe(1);
    });

    it('should accumulate transition counts', () => {
      // Record same transition 3 times
      for (let i = 0; i < 3; i++) {
        matrix.recordTransition('toolA', 'toolB', {
          personaId: 'ferni',
          timeOfDay: 'morning',
        });
      }

      const predictions = matrix.getPredictions('toolA');
      expect(predictions[0].observationCount).toBe(3);
    });

    it('should calculate correct probabilities', () => {
      // Record different transitions
      matrix.recordTransition('toolA', 'toolB', { personaId: 'ferni', timeOfDay: 'morning' });
      matrix.recordTransition('toolA', 'toolB', { personaId: 'ferni', timeOfDay: 'morning' });
      matrix.recordTransition('toolA', 'toolC', { personaId: 'ferni', timeOfDay: 'morning' });

      const predictions = matrix.getPredictions('toolA');

      // toolB should have 2/3 probability, toolC should have 1/3
      const toolB = predictions.find((p) => p.toolId === 'toolB');
      const toolC = predictions.find((p) => p.toolId === 'toolC');

      expect(toolB?.probability).toBeCloseTo(0.667, 2);
      expect(toolC?.probability).toBeCloseTo(0.333, 2);
    });

    it('should track success rates', () => {
      matrix.recordTransition('toolA', 'toolB', {
        personaId: 'ferni',
        timeOfDay: 'morning',
        success: true,
      });
      matrix.recordTransition('toolA', 'toolB', {
        personaId: 'ferni',
        timeOfDay: 'morning',
        success: false,
      });

      const predictions = matrix.getPredictions('toolA');
      expect(predictions[0].successRate).toBe(0.5);
    });
  });

  describe('Context Conditioning', () => {
    it('should filter by persona', () => {
      matrix.recordTransition('toolA', 'toolB', { personaId: 'ferni', timeOfDay: 'morning' });
      matrix.recordTransition('toolA', 'toolC', { personaId: 'maya', timeOfDay: 'morning' });

      const ferniPredictions = matrix.getPredictions('toolA', { personaId: 'ferni' });
      expect(ferniPredictions.length).toBe(1);
      expect(ferniPredictions[0].toolId).toBe('toolB');

      const mayaPredictions = matrix.getPredictions('toolA', { personaId: 'maya' });
      expect(mayaPredictions.length).toBe(1);
      expect(mayaPredictions[0].toolId).toBe('toolC');
    });

    it('should filter by time of day', () => {
      matrix.recordTransition('toolA', 'toolB', { personaId: 'ferni', timeOfDay: 'morning' });
      matrix.recordTransition('toolA', 'toolC', { personaId: 'ferni', timeOfDay: 'night' });

      const morningPredictions = matrix.getPredictions('toolA', { timeOfDay: 'morning' });
      expect(morningPredictions[0].toolId).toBe('toolB');

      const nightPredictions = matrix.getPredictions('toolA', { timeOfDay: 'night' });
      expect(nightPredictions[0].toolId).toBe('toolC');
    });

    it('should fall back when no context match', () => {
      matrix.recordTransition('toolA', 'toolB', { personaId: 'ferni', timeOfDay: 'morning' });

      // Query with non-matching context should fall back
      const predictions = matrix.getPredictions('toolA', { personaId: 'alex' });
      expect(predictions.length).toBeGreaterThan(0);
    });
  });

  describe('High Confidence Predictions', () => {
    it('should mark high-confidence predictions for LLM skip', () => {
      // Record many observations to build confidence
      for (let i = 0; i < 10; i++) {
        matrix.recordTransition('toolA', 'toolB', {
          personaId: 'ferni',
          timeOfDay: 'morning',
        });
      }

      const result = matrix.shouldSkipLLM('toolA');
      expect(result.skip).toBe(true);
      expect(result.predictedTool).toBe('toolB');
      expect(result.confidence).toBe(1);
    });

    it('should not skip LLM for low-confidence predictions', () => {
      // Single observation
      matrix.recordTransition('toolA', 'toolB', {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      const result = matrix.shouldSkipLLM('toolA');
      expect(result.skip).toBe(false);
    });
  });

  describe('Sequence Recording', () => {
    it('should record all transitions in a sequence', () => {
      const tools = ['tool1', 'tool2', 'tool3', 'tool4'];
      const now = Date.now();
      const timestamps = tools.map((_, i) => new Date(now + i * 1000));

      matrix.recordSequence(tools, timestamps, { personaId: 'ferni' });

      // Should have transitions: 1→2, 2→3, 3→4
      expect(matrix.getPredictions('tool1')[0].toolId).toBe('tool2');
      expect(matrix.getPredictions('tool2')[0].toolId).toBe('tool3');
      expect(matrix.getPredictions('tool3')[0].toolId).toBe('tool4');
    });
  });

  describe('Export/Import', () => {
    it('should export and import transitions', () => {
      matrix.recordTransition('toolA', 'toolB', { personaId: 'ferni', timeOfDay: 'morning' });
      matrix.recordTransition('toolA', 'toolC', { personaId: 'ferni', timeOfDay: 'morning' });

      const exported = matrix.exportTransitions();
      expect(exported.length).toBe(2);

      // Create new matrix and import
      const newMatrix = new TransitionMatrix();
      newMatrix.loadTransitions(exported);

      const predictions = newMatrix.getPredictions('toolA');
      expect(predictions.length).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', () => {
      matrix.recordTransition('toolA', 'toolB', { personaId: 'ferni', timeOfDay: 'morning' });
      matrix.recordTransition('toolA', 'toolC', { personaId: 'ferni', timeOfDay: 'morning' });

      const stats = matrix.getStats();
      expect(stats.totalTransitions).toBe(2);
      expect(stats.totalObservations).toBe(2);
    });
  });
});

describe('TransitionLearner', () => {
  let learner: TransitionLearner;

  beforeEach(() => {
    resetTransitionLearner();
    resetTransitionMatrix();
    learner = new TransitionLearner();
  });

  afterEach(() => {
    resetTransitionLearner();
    resetTransitionMatrix();
  });

  describe('Session Tracking', () => {
    it('should track tool calls in a session', () => {
      learner.startSession('user1', 'session1', 'ferni');
      learner.recordToolCall('session1', 'toolA', true);
      learner.recordToolCall('session1', 'toolB', true);

      const stats = learner.getStats();
      expect(stats.activeSessions).toBe(1);
    });

    it('should create sequence on session end', () => {
      learner.startSession('user1', 'session1', 'ferni');
      learner.recordToolCall('session1', 'toolA', true);
      learner.recordToolCall('session1', 'toolB', true);
      learner.recordToolCall('session1', 'toolC', true);

      const sequence = learner.endSession('session1');

      expect(sequence).not.toBeNull();
      expect(sequence!.sequence).toEqual(['toolA', 'toolB', 'toolC']);
      expect(sequence!.userId).toBe('user1');
    });

    it('should skip short sessions', () => {
      learner.startSession('user1', 'session1', 'ferni');
      learner.recordToolCall('session1', 'toolA', true);

      const sequence = learner.endSession('session1');
      expect(sequence).toBeNull();
    });

    it('should record transitions to matrix', () => {
      learner.startSession('user1', 'session1', 'ferni');
      learner.recordToolCall('session1', 'toolA', true);
      learner.recordToolCall('session1', 'toolB', true);
      learner.endSession('session1');

      const matrix = learner.getMatrix();
      const predictions = matrix.getPredictions('toolA');
      expect(predictions[0].toolId).toBe('toolB');
    });
  });

  describe('Context Updates', () => {
    it('should update session context', () => {
      learner.startSession('user1', 'session1', 'ferni');
      learner.updateSessionContext('session1', { emotion: 'stressed' });
      learner.recordToolCall('session1', 'toolA', true);
      learner.recordToolCall('session1', 'toolB', true);

      const sequence = learner.endSession('session1');
      expect(sequence?.context.emotion).toBe('stressed');
    });
  });

  describe('Pattern Analysis', () => {
    it('should identify common patterns', () => {
      // Create multiple sessions with same pattern
      for (let i = 0; i < 3; i++) {
        learner.startSession('user1', `session${i}`, 'ferni');
        learner.recordToolCall(`session${i}`, 'toolA', true);
        learner.recordToolCall(`session${i}`, 'toolB', true);
        learner.recordToolCall(`session${i}`, 'toolC', true);
        learner.endSession(`session${i}`);
      }

      const patterns = learner.getCommonPatterns(2, 2);
      expect(patterns.length).toBeGreaterThan(0);

      // A→B pattern should appear at least 3 times
      const abPattern = patterns.find(
        (p) => p.pattern.length === 2 && p.pattern[0] === 'toolA' && p.pattern[1] === 'toolB'
      );
      expect(abPattern).toBeDefined();
      expect(abPattern!.occurrences).toBe(3);
    });
  });
});
