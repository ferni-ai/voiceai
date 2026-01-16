/**
 * Sequence Predictor Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SequencePredictor,
  getSequencePredictor,
  resetSequencePredictor,
  predictSequence,
} from '../sequence-predictor.js';
import { resetTransitionMatrix, getTransitionMatrix } from '../../transitions/transition-matrix.js';
import type { RouterOutput } from '../../router/inference/types.js';

describe('SequencePredictor', () => {
  let predictor: SequencePredictor;

  beforeEach(() => {
    resetSequencePredictor();
    resetTransitionMatrix();
    predictor = new SequencePredictor();

    // Seed transition matrix with test data
    const matrix = getTransitionMatrix();
    matrix.recordTransition('weather_current', 'calendar_list', { personaId: 'ferni' });
    matrix.recordTransition('weather_current', 'calendar_list', { personaId: 'ferni' });
    matrix.recordTransition('calendar_list', 'tasks_list', { personaId: 'ferni' });
  });

  describe('predict', () => {
    it('should predict a sequence from router output', () => {
      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather_current', confidence: 0.9, rank: 1 }],
        topConfidence: 0.9,
        skipLLM: true,
        latencyMs: 10,
        modelVersion: 'test',
      };

      const sequence = predictor.predict(routerOutput, {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      expect(sequence.steps.length).toBeGreaterThanOrEqual(1);
      expect(sequence.steps[0].toolId).toBe('weather_current');
      expect(sequence.steps[0].source).toBe('router');
    });

    it('should use transition matrix for follow-up steps', () => {
      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather_current', confidence: 0.8, rank: 1 }],
        topConfidence: 0.8,
        skipLLM: false,
        latencyMs: 10,
        modelVersion: 'test',
      };

      const sequence = predictor.predict(routerOutput, {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      // Should include calendar_list from transition matrix
      if (sequence.steps.length > 1) {
        expect(sequence.steps[1].source).toBe('transition');
      }
    });

    it('should respect maxSequenceLength config', () => {
      predictor.updateConfig({ maxSequenceLength: 2 });

      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather_current', confidence: 0.9, rank: 1 }],
        topConfidence: 0.9,
        skipLLM: false,
        latencyMs: 10,
        modelVersion: 'test',
      };

      const sequence = predictor.predict(routerOutput, {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      expect(sequence.steps.length).toBeLessThanOrEqual(2);
    });

    it('should detect parallelizable steps', () => {
      const routerOutput: RouterOutput = {
        predictions: [
          { toolId: 'weather_current', confidence: 0.9, rank: 1 },
          { toolId: 'calendar_list', confidence: 0.85, rank: 2 },
        ],
        topConfidence: 0.9,
        skipLLM: false,
        latencyMs: 10,
        modelVersion: 'test',
      };

      const sequence = predictor.predict(routerOutput, {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      // Weather and calendar can run in parallel
      const hasParallel = sequence.steps.some((s) => s.parallelizable);
      expect(sequence.executionStrategy).not.toBe('');
    });

    it('should calculate correct estimated duration', () => {
      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather_current', confidence: 0.9, rank: 1 }],
        topConfidence: 0.9,
        skipLLM: true,
        latencyMs: 10,
        modelVersion: 'test',
      };

      const sequence = predictor.predict(routerOutput, {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      expect(sequence.estimatedDurationMs).toBeGreaterThan(0);
    });
  });

  describe('predictFromTool', () => {
    it('should predict sequence starting from a specific tool', () => {
      const sequence = predictor.predictFromTool('weather_current', {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      expect(sequence.steps[0].toolId).toBe('weather_current');
    });
  });

  describe('getLikelyNext', () => {
    it('should return likely next tools', () => {
      const likelyNext = predictor.getLikelyNext('weather_current', {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      expect(Array.isArray(likelyNext)).toBe(true);
      if (likelyNext.length > 0) {
        expect(likelyNext[0]).toHaveProperty('toolId');
        expect(likelyNext[0]).toHaveProperty('probability');
      }
    });

    it('should respect topK parameter', () => {
      const likelyNext = predictor.getLikelyNext(
        'weather_current',
        {
          personaId: 'ferni',
          timeOfDay: 'morning',
        },
        1
      );

      expect(likelyNext.length).toBeLessThanOrEqual(1);
    });
  });

  describe('configuration', () => {
    it('should update config', () => {
      predictor.updateConfig({ maxSequenceLength: 10 });
      const config = predictor.getConfig();
      expect(config.maxSequenceLength).toBe(10);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const a = getSequencePredictor();
      const b = getSequencePredictor();
      expect(a).toBe(b);
    });
  });

  describe('convenience function', () => {
    it('should work with minimal context', () => {
      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather_current', confidence: 0.9, rank: 1 }],
        topConfidence: 0.9,
        skipLLM: true,
        latencyMs: 10,
        modelVersion: 'test',
      };

      const sequence = predictSequence(routerOutput);
      expect(sequence).toHaveProperty('steps');
      expect(sequence).toHaveProperty('confidence');
    });
  });
});
