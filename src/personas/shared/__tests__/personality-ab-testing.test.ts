/**
 * Tests for the A/B Testing Module
 *
 * @module personas/shared/__tests__/personality-ab-testing.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createExperiment,
  getExperiment,
  updateRolloutPercentage,
  pauseExperiment,
  completeExperiment,
  getVariant,
  isFeatureEnabled,
  recordSessionEngagement,
  createSessionMetricsTracker,
  incrementMetric,
  getExperimentResults,
  generateExperimentReport,
  _testing,
} from '../personality-ab-testing.js';

describe('personality-ab-testing', () => {
  beforeEach(() => {
    // Clear all state before each test
    _testing.clearAll();
  });

  describe('createExperiment', () => {
    it('creates an experiment with correct defaults', () => {
      const experiment = createExperiment('test_exp', 'Test Experiment', 50);

      expect(experiment.id).toBe('test_exp');
      expect(experiment.name).toBe('Test Experiment');
      expect(experiment.treatmentPercentage).toBe(50);
      expect(experiment.status).toBe('active');
      expect(experiment.features.enableNoticing).toBe(true);
      expect(experiment.features.enableExpressions).toBe(true);
    });

    it('clamps treatment percentage to valid range', () => {
      const exp1 = createExperiment('exp1', 'Test 1', -10);
      const exp2 = createExperiment('exp2', 'Test 2', 150);

      expect(exp1.treatmentPercentage).toBe(0);
      expect(exp2.treatmentPercentage).toBe(100);
    });

    it('accepts custom options', () => {
      const experiment = createExperiment('custom', 'Custom', 75, {
        description: 'Custom description',
        personaScope: ['maya-santos', 'peter-john'],
        features: {
          enableNoticing: true,
          enableExpressions: false,
          enableResonance: true,
          enableTelemetry: false,
        },
      });

      expect(experiment.description).toBe('Custom description');
      expect(experiment.personaScope).toEqual(['maya-santos', 'peter-john']);
      expect(experiment.features.enableExpressions).toBe(false);
      expect(experiment.features.enableTelemetry).toBe(false);
    });
  });

  describe('getExperiment', () => {
    it('returns null for non-existent experiment', () => {
      expect(getExperiment('nonexistent')).toBeNull();
    });

    it('returns experiment after creation', () => {
      createExperiment('test_exp', 'Test', 50);
      const experiment = getExperiment('test_exp');

      expect(experiment).not.toBeNull();
      expect(experiment?.name).toBe('Test');
    });
  });

  describe('updateRolloutPercentage', () => {
    it('updates rollout percentage', () => {
      createExperiment('test_exp', 'Test', 50);

      const result = updateRolloutPercentage('test_exp', 75);

      expect(result).toBe(true);
      expect(getExperiment('test_exp')?.treatmentPercentage).toBe(75);
    });

    it('returns false for non-existent experiment', () => {
      expect(updateRolloutPercentage('nonexistent', 50)).toBe(false);
    });
  });

  describe('pauseExperiment', () => {
    it('pauses an experiment', () => {
      createExperiment('test_exp', 'Test', 50);

      pauseExperiment('test_exp');

      expect(getExperiment('test_exp')?.status).toBe('paused');
    });
  });

  describe('completeExperiment', () => {
    it('completes an experiment', () => {
      createExperiment('test_exp', 'Test', 50);

      completeExperiment('test_exp');

      expect(getExperiment('test_exp')?.status).toBe('completed');
    });
  });

  describe('getVariant', () => {
    it('returns control for non-existent experiment', () => {
      expect(getVariant('user1', 'nonexistent')).toBe('control');
    });

    it('returns control for paused experiment', () => {
      createExperiment('test_exp', 'Test', 50);
      pauseExperiment('test_exp');

      expect(getVariant('user1', 'test_exp')).toBe('control');
    });

    it('returns consistent variant for same user', () => {
      createExperiment('test_exp', 'Test', 50);

      const variant1 = getVariant('user123', 'test_exp');
      const variant2 = getVariant('user123', 'test_exp');
      const variant3 = getVariant('user123', 'test_exp');

      expect(variant1).toBe(variant2);
      expect(variant2).toBe(variant3);
    });

    it('distributes users across variants based on percentage', () => {
      createExperiment('test_exp', 'Test', 50);

      // Generate many users to test distribution
      let controlCount = 0;
      let treatmentCount = 0;

      for (let i = 0; i < 100; i++) {
        const variant = getVariant(`user_${i}`, 'test_exp');
        if (variant === 'control') controlCount++;
        else treatmentCount++;
      }

      // With 50% split, expect roughly even distribution (allowing variance)
      expect(controlCount).toBeGreaterThan(20);
      expect(treatmentCount).toBeGreaterThan(20);
    });

    it('assigns all to treatment at 100%', () => {
      createExperiment('test_exp', 'Test', 100);

      for (let i = 0; i < 20; i++) {
        expect(getVariant(`user_100_${i}`, 'test_exp')).toBe('treatment');
      }
    });

    it('assigns all to control at 0%', () => {
      createExperiment('test_exp', 'Test', 0);

      for (let i = 0; i < 20; i++) {
        expect(getVariant(`user_0_${i}`, 'test_exp')).toBe('control');
      }
    });

    it('respects persona scope', () => {
      createExperiment('scoped_exp', 'Scoped', 100, {
        personaScope: ['maya-santos'],
      });

      // Maya should get treatment
      expect(getVariant('user1', 'scoped_exp', 'maya-santos')).toBe('treatment');

      // Peter should get control (not in scope)
      expect(getVariant('user1', 'scoped_exp', 'peter-john')).toBe('control');
    });
  });

  describe('isFeatureEnabled', () => {
    it('returns true when no experiment exists', () => {
      expect(isFeatureEnabled('user1', 'nonexistent', 'enableNoticing')).toBe(true);
    });

    it('returns false for control group', () => {
      createExperiment('test_exp', 'Test', 0); // All control

      expect(isFeatureEnabled('user1', 'test_exp', 'enableNoticing')).toBe(false);
    });

    it('returns feature flag value for treatment group', () => {
      createExperiment('test_exp', 'Test', 100, {
        features: {
          enableNoticing: true,
          enableExpressions: false,
          enableResonance: true,
          enableTelemetry: true,
        },
      });

      expect(isFeatureEnabled('user1', 'test_exp', 'enableNoticing')).toBe(true);
      expect(isFeatureEnabled('user1', 'test_exp', 'enableExpressions')).toBe(false);
    });
  });

  describe('session metrics tracking', () => {
    it('creates session metrics tracker with zero values', () => {
      const metrics = createSessionMetricsTracker();

      expect(metrics.turnCount).toBe(0);
      expect(metrics.noticingsTriggered).toBe(0);
      expect(metrics.expressionsInjected).toBe(0);
    });

    it('increments metrics correctly', () => {
      const metrics = createSessionMetricsTracker();

      incrementMetric(metrics, 'turnCount');
      incrementMetric(metrics, 'turnCount');
      incrementMetric(metrics, 'noticingsTriggered');
      incrementMetric(metrics, 'positiveResponses', 5);

      expect(metrics.turnCount).toBe(2);
      expect(metrics.noticingsTriggered).toBe(1);
      expect(metrics.positiveResponses).toBe(5);
    });
  });

  describe('recordSessionEngagement', () => {
    it('records session engagement for control group', () => {
      createExperiment('test_exp', 'Test', 0); // All control

      const metrics = createSessionMetricsTracker();
      metrics.turnCount = 10;
      metrics.sessionDurationMs = 60000;

      // This user will be in control
      recordSessionEngagement('control_user', 'test_exp', metrics);

      const results = getExperimentResults('test_exp');
      expect(results).not.toBeNull();
      expect(results?.controlCount).toBe(1);
    });

    it('records session engagement for treatment group', () => {
      createExperiment('test_exp', 'Test', 100); // All treatment

      const metrics = createSessionMetricsTracker();
      metrics.turnCount = 15;
      metrics.sessionDurationMs = 90000;
      metrics.noticingsTriggered = 3;

      recordSessionEngagement('treatment_user', 'test_exp', metrics);

      const results = getExperimentResults('test_exp');
      expect(results).not.toBeNull();
      expect(results?.treatmentCount).toBe(1);
    });
  });

  describe('getExperimentResults', () => {
    it('returns null for non-existent experiment', () => {
      expect(getExperimentResults('nonexistent')).toBeNull();
    });

    it('calculates aggregated metrics correctly', () => {
      createExperiment('test_exp', 'Test', 100);

      // Record multiple sessions
      for (let i = 0; i < 3; i++) {
        const metrics = createSessionMetricsTracker();
        metrics.turnCount = 10;
        metrics.sessionDurationMs = 60000;
        metrics.positiveResponses = 5;
        metrics.negativeResponses = 1;
        metrics.neutralResponses = 4;
        metrics.noticingsTriggered = 2;
        metrics.noticingsAcknowledged = 1;

        recordSessionEngagement(`user_${i}`, 'test_exp', metrics);
      }

      const results = getExperimentResults('test_exp');

      expect(results).not.toBeNull();
      expect(results?.treatmentCount).toBe(3);
      expect(results?.treatmentMetrics.avgTurnCount).toBe(10);
      expect(results?.treatmentMetrics.avgSessionDurationMs).toBe(60000);
      expect(results?.treatmentMetrics.avgPositiveResponseRate).toBe(0.5); // 5/10
      expect(results?.treatmentMetrics.avgNoticingEngagementRate).toBe(0.5); // 1/2
    });
  });

  describe('generateExperimentReport', () => {
    it('returns "not found" for non-existent experiment', () => {
      expect(generateExperimentReport('nonexistent')).toBe('Experiment not found');
    });

    it('generates readable report', () => {
      createExperiment('test_exp', 'Test Experiment', 50);

      // Add some data
      for (let i = 0; i < 5; i++) {
        const metrics = createSessionMetricsTracker();
        metrics.turnCount = 10;
        metrics.sessionDurationMs = 60000;
        recordSessionEngagement(`user_${i}`, 'test_exp', metrics);
      }

      const report = generateExperimentReport('test_exp');

      expect(report).toContain('Test Experiment');
      expect(report).toContain('OVERVIEW');
      expect(report).toContain('KEY METRICS');
      expect(report).toContain('STATISTICAL SIGNIFICANCE');
    });
  });
});
