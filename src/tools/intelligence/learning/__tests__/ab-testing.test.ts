/**
 * A/B Testing Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ABTestingManager, getABTestingManager, resetABTestingManager } from '../ab-testing.js';

describe('ABTestingManager', () => {
  let manager: ABTestingManager;

  beforeEach(() => {
    resetABTestingManager();
    manager = new ABTestingManager();
  });

  describe('createExperiment', () => {
    it('should create a valid experiment', () => {
      manager.createExperiment({
        id: 'test-exp',
        name: 'Test Experiment',
        description: 'Testing',
        variants: [
          { id: 'control', name: 'Control', trafficPercent: 50, config: {}, isControl: true },
          { id: 'treatment', name: 'Treatment', trafficPercent: 50, config: {}, isControl: false },
        ],
        startDate: new Date(),
        endDate: null,
        minSampleSize: 100,
        primaryMetric: 'success_rate',
        secondaryMetrics: [],
      });

      const experiments = manager.getActiveExperiments();
      expect(experiments.length).toBe(1);
      expect(experiments[0].id).toBe('test-exp');
    });

    it('should reject if traffic does not sum to 100', () => {
      expect(() => {
        manager.createExperiment({
          id: 'bad-exp',
          name: 'Bad',
          description: '',
          variants: [
            { id: 'control', name: 'Control', trafficPercent: 30, config: {}, isControl: true },
            {
              id: 'treatment',
              name: 'Treatment',
              trafficPercent: 30,
              config: {},
              isControl: false,
            },
          ],
          startDate: new Date(),
          endDate: null,
          minSampleSize: 100,
          primaryMetric: 'success_rate',
          secondaryMetrics: [],
        });
      }).toThrow('Traffic percentages must sum to 100');
    });

    it('should reject if no control variant', () => {
      expect(() => {
        manager.createExperiment({
          id: 'no-control',
          name: 'No Control',
          description: '',
          variants: [
            { id: 'a', name: 'A', trafficPercent: 50, config: {}, isControl: false },
            { id: 'b', name: 'B', trafficPercent: 50, config: {}, isControl: false },
          ],
          startDate: new Date(),
          endDate: null,
          minSampleSize: 100,
          primaryMetric: 'success_rate',
          secondaryMetrics: [],
        });
      }).toThrow('Exactly one variant must be control');
    });
  });

  describe('getVariant', () => {
    beforeEach(() => {
      manager.createExperiment({
        id: 'exp-1',
        name: 'Experiment 1',
        description: '',
        variants: [
          { id: 'control', name: 'Control', trafficPercent: 50, config: {}, isControl: true },
          { id: 'treatment', name: 'Treatment', trafficPercent: 50, config: {}, isControl: false },
        ],
        startDate: new Date(),
        endDate: null,
        minSampleSize: 100,
        primaryMetric: 'success_rate',
        secondaryMetrics: [],
      });
    });

    it('should return a variant for user', () => {
      const variant = manager.getVariant('user-123', 'exp-1');

      expect(variant).not.toBeNull();
      expect(['control', 'treatment']).toContain(variant!.id);
    });

    it('should return consistent variant for same user', () => {
      const variant1 = manager.getVariant('user-456', 'exp-1');
      const variant2 = manager.getVariant('user-456', 'exp-1');

      expect(variant1!.id).toBe(variant2!.id);
    });

    it('should return null for inactive experiment', () => {
      manager.stopExperiment('exp-1');
      const variant = manager.getVariant('user-789', 'exp-1');

      expect(variant).toBeNull();
    });

    it('should return null for non-existent experiment', () => {
      const variant = manager.getVariant('user-000', 'non-existent');
      expect(variant).toBeNull();
    });
  });

  describe('recordMetric', () => {
    beforeEach(() => {
      manager.createExperiment({
        id: 'exp-metrics',
        name: 'Metrics Test',
        description: '',
        variants: [
          { id: 'control', name: 'Control', trafficPercent: 50, config: {}, isControl: true },
          { id: 'treatment', name: 'Treatment', trafficPercent: 50, config: {}, isControl: false },
        ],
        startDate: new Date(),
        endDate: null,
        minSampleSize: 10,
        primaryMetric: 'success_rate',
        secondaryMetrics: [],
      });
    });

    it('should record metrics for a variant', () => {
      manager.recordMetric('exp-metrics', 'control', 1);
      manager.recordMetric('exp-metrics', 'control', 0);
      manager.recordMetric('exp-metrics', 'control', 1);

      const results = manager.calculateResults('exp-metrics');
      expect(results).not.toBeNull();
      expect(results!.variantMetrics.control.sampleSize).toBe(3);
    });

    it('should record conversions through user assignment', () => {
      const user = 'metric-user';
      manager.getVariant(user, 'exp-metrics'); // Assigns user
      manager.recordConversion(user, 'exp-metrics', true);

      const results = manager.calculateResults('exp-metrics');
      expect(
        results!.variantMetrics.control.conversions + results!.variantMetrics.treatment.conversions
      ).toBe(1);
    });
  });

  describe('calculateResults', () => {
    beforeEach(() => {
      manager.createExperiment({
        id: 'exp-calc',
        name: 'Calculation Test',
        description: '',
        variants: [
          { id: 'control', name: 'Control', trafficPercent: 50, config: {}, isControl: true },
          { id: 'treatment', name: 'Treatment', trafficPercent: 50, config: {}, isControl: false },
        ],
        startDate: new Date(),
        endDate: null,
        minSampleSize: 5,
        primaryMetric: 'success_rate',
        secondaryMetrics: [],
      });

      // Add sample data
      for (let i = 0; i < 10; i++) {
        manager.recordMetric('exp-calc', 'control', Math.random() > 0.5 ? 1 : 0);
        manager.recordMetric('exp-calc', 'treatment', Math.random() > 0.3 ? 1 : 0);
      }
    });

    it('should calculate variant metrics', () => {
      const results = manager.calculateResults('exp-calc');

      expect(results).not.toBeNull();
      expect(results!.variantMetrics.control).toHaveProperty('conversionRate');
      expect(results!.variantMetrics.treatment).toHaveProperty('conversionRate');
    });

    it('should provide a recommendation', () => {
      const results = manager.calculateResults('exp-calc');

      expect(results!.recommendation).toBeDefined();
      expect(['continue', 'winner_found', 'no_difference', 'insufficient_data']).toContain(
        results!.recommendation
      );
    });

    it('should return null for non-existent experiment', () => {
      const results = manager.calculateResults('non-existent');
      expect(results).toBeNull();
    });
  });

  describe('stopExperiment', () => {
    it('should stop an experiment', () => {
      manager.createExperiment({
        id: 'exp-stop',
        name: 'Stop Test',
        description: '',
        variants: [
          { id: 'control', name: 'Control', trafficPercent: 100, config: {}, isControl: true },
        ],
        startDate: new Date(),
        endDate: null,
        minSampleSize: 100,
        primaryMetric: 'success_rate',
        secondaryMetrics: [],
      });

      manager.stopExperiment('exp-stop');

      const experiments = manager.getActiveExperiments();
      expect(experiments.length).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const a = getABTestingManager();
      const b = getABTestingManager();
      expect(a).toBe(b);
    });
  });
});
