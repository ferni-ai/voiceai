/**
 * Advanced Experiment Features Tests
 *
 * Tests for:
 * 1. Bayesian analysis
 * 2. Multi-Armed Bandit
 * 3. Experiment scheduling
 * 4. Segment analysis
 *
 * @module tests/experiment-advanced.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  performBayesianAnalysis,
  getBanditVariant,
  configureBandit,
  scheduleExperiment,
  cancelScheduledExperiment,
  getScheduledExperiments,
  recordSegmentMetric,
  getSegmentAnalysis,
  getAllSegments,
  registerSegment,
  type UserProfileForSegment,
} from '../services/experiments/advanced.js';
import {
  getAgentEvolution,
  resetAgentEvolution,
  type PersonaExperiment,
} from '../intelligence/agent-evolution.js';
import { startExperiment } from '../services/experiments/integration.js';

// ============================================================================
// TEST SETUP
// ============================================================================

beforeEach(() => {
  resetAgentEvolution();
});

afterEach(() => {
  resetAgentEvolution();
});

// ============================================================================
// BAYESIAN ANALYSIS TESTS
// ============================================================================

describe('Bayesian Analysis', () => {
  it('should calculate probability treatment wins', () => {
    const experiment = createMockExperiment({
      controlEngagement: 0.5,
      controlN: 100,
      treatmentEngagement: 0.6,
      treatmentN: 100,
    });

    const result = performBayesianAnalysis(experiment);

    expect(result.probabilityTreatmentWins).toBeGreaterThan(0.8);
    expect(result.probabilityTreatmentWins).toBeLessThanOrEqual(1);
  });

  it('should calculate credible interval', () => {
    const experiment = createMockExperiment({
      controlEngagement: 0.5,
      controlN: 100,
      treatmentEngagement: 0.6,
      treatmentN: 100,
    });

    const result = performBayesianAnalysis(experiment);

    expect(result.credibleInterval).toHaveLength(2);
    expect(result.credibleInterval[0]).toBeLessThan(result.credibleInterval[1]);
    expect(result.credibleInterval[0]).toBeLessThan(result.expectedImprovement);
    expect(result.credibleInterval[1]).toBeGreaterThan(result.expectedImprovement);
  });

  it('should recommend adopting treatment when clearly better', () => {
    const experiment = createMockExperiment({
      controlEngagement: 0.4,
      controlN: 200,
      treatmentEngagement: 0.6,
      treatmentN: 200,
    });

    const result = performBayesianAnalysis(experiment);

    expect(result.recommendation).toBe('adopt_treatment');
    expect(result.confidence).toBe('high');
  });

  it('should recommend keeping control when treatment is worse', () => {
    const experiment = createMockExperiment({
      controlEngagement: 0.6,
      controlN: 200,
      treatmentEngagement: 0.4,
      treatmentN: 200,
    });

    const result = performBayesianAnalysis(experiment);

    expect(result.recommendation).toBe('keep_control');
  });

  it('should recommend continue testing when inconclusive', () => {
    const experiment = createMockExperiment({
      controlEngagement: 0.5,
      controlN: 20,
      treatmentEngagement: 0.52,
      treatmentN: 20,
    });

    const result = performBayesianAnalysis(experiment);

    expect(result.recommendation).toBe('continue_testing');
    expect(result.confidence).toBe('low');
  });

  it('should calculate expected loss', () => {
    const experiment = createMockExperiment({
      controlEngagement: 0.5,
      controlN: 100,
      treatmentEngagement: 0.55,
      treatmentN: 100,
    });

    const result = performBayesianAnalysis(experiment);

    expect(result.expectedLoss).toBeGreaterThanOrEqual(0);
    expect(result.expectedLoss).toBeLessThan(0.5);
  });
});

// ============================================================================
// MULTI-ARMED BANDIT TESTS
// ============================================================================

describe('Multi-Armed Bandit', () => {
  it('should return variant when MAB disabled (fallback)', () => {
    configureBandit({ enabled: false });

    const experiment = createMockExperiment({
      controlEngagement: 0.5,
      controlN: 50,
      treatmentEngagement: 0.6,
      treatmentN: 50,
    });

    const variant = getBanditVariant(experiment, 'user-123');

    expect(['control', 'treatment']).toContain(variant);
  });

  it('should be deterministic for same user when MAB disabled', () => {
    configureBandit({ enabled: false });

    const experiment = createMockExperiment({
      controlEngagement: 0.5,
      controlN: 50,
      treatmentEngagement: 0.6,
      treatmentN: 50,
    });

    const variant1 = getBanditVariant(experiment, 'consistent-user');
    const variant2 = getBanditVariant(experiment, 'consistent-user');

    expect(variant1).toBe(variant2);
  });

  it('should favor better arm with Thompson Sampling', () => {
    configureBandit({ enabled: true, algorithm: 'thompson', minExplorationRate: 0 });

    const experiment = createMockExperiment({
      controlEngagement: 0.3,
      controlN: 100,
      treatmentEngagement: 0.7,
      treatmentN: 100,
    });

    // Run multiple times and count
    let treatmentCount = 0;
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const variant = getBanditVariant(experiment, `mab-user-${i}`);
      if (variant === 'treatment') treatmentCount++;
    }

    // With such a large difference, treatment should win most of the time
    expect(treatmentCount / iterations).toBeGreaterThan(0.6);
  });

  it('should favor better arm with UCB', () => {
    configureBandit({ enabled: true, algorithm: 'ucb', minExplorationRate: 0 });

    const experiment = createMockExperiment({
      controlEngagement: 0.3,
      controlN: 100,
      treatmentEngagement: 0.7,
      treatmentN: 100,
    });

    // UCB should consistently pick treatment
    const variant = getBanditVariant(experiment, 'ucb-user');
    expect(variant).toBe('treatment');
  });

  it('should explore with minimum exploration rate', () => {
    configureBandit({ enabled: true, algorithm: 'thompson', minExplorationRate: 1.0 });

    const experiment = createMockExperiment({
      controlEngagement: 0.3,
      controlN: 100,
      treatmentEngagement: 0.7,
      treatmentN: 100,
    });

    // With 100% exploration, should get both variants
    let controlCount = 0;
    let treatmentCount = 0;

    for (let i = 0; i < 100; i++) {
      const variant = getBanditVariant(experiment, `explore-user-${i}`);
      if (variant === 'control') controlCount++;
      else treatmentCount++;
    }

    // Both should have significant counts
    expect(controlCount).toBeGreaterThan(20);
    expect(treatmentCount).toBeGreaterThan(20);
  });
});

// ============================================================================
// EXPERIMENT SCHEDULING TESTS
// ============================================================================

describe('Experiment Scheduling', () => {
  it('should schedule an experiment', () => {
    const experiment = startExperiment({
      personaId: 'ferni',
      name: 'Scheduled Test',
      hypothesis: 'Testing scheduling',
      trafficAllocation: 0.5,
      minimumSampleSize: 10,
      control: { description: 'Control' },
      treatment: { description: 'Treatment' },
    });

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow

    scheduleExperiment(experiment.id, 'ferni', {
      startAt: futureDate,
      timezone: 'UTC',
    });

    const schedules = getScheduledExperiments();
    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules.some((s) => s.experimentId === experiment.id)).toBe(true);
  });

  it('should cancel a scheduled experiment', () => {
    const experiment = startExperiment({
      personaId: 'ferni',
      name: 'Cancel Test',
      hypothesis: 'Testing cancellation',
      trafficAllocation: 0.5,
      minimumSampleSize: 10,
      control: { description: 'Control' },
      treatment: { description: 'Treatment' },
    });

    scheduleExperiment(experiment.id, 'ferni', {
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      timezone: 'UTC',
    });

    const cancelled = cancelScheduledExperiment(experiment.id);
    expect(cancelled).toBe(true);

    const schedules = getScheduledExperiments();
    expect(schedules.some((s) => s.experimentId === experiment.id)).toBe(false);
  });

  it('should return false when cancelling non-existent schedule', () => {
    const cancelled = cancelScheduledExperiment('non-existent');
    expect(cancelled).toBe(false);
  });
});

// ============================================================================
// SEGMENT ANALYSIS TESTS
// ============================================================================

describe('Segment Analysis', () => {
  it('should have default segments', () => {
    const segments = getAllSegments();

    expect(segments.length).toBeGreaterThan(0);
    expect(segments.some((s) => s.id === 'new_users')).toBe(true);
    expect(segments.some((s) => s.id === 'returning_users')).toBe(true);
    expect(segments.some((s) => s.id === 'power_users')).toBe(true);
  });

  it('should register custom segment', () => {
    const initialCount = getAllSegments().length;

    registerSegment({
      id: 'test_segment',
      name: 'Test Segment',
      description: 'For testing',
      filter: () => true,
    });

    const newCount = getAllSegments().length;
    expect(newCount).toBe(initialCount + 1);
  });

  it('should record metrics to segments', () => {
    const experiment = startExperiment({
      personaId: 'ferni',
      name: 'Segment Test',
      hypothesis: 'Testing segments',
      trafficAllocation: 0.5,
      minimumSampleSize: 10,
      control: { description: 'Control' },
      treatment: { description: 'Treatment' },
    });

    // Record metrics for new users (both control and treatment - need 5 each minimum)
    for (let i = 0; i < 10; i++) {
      const userProfile: UserProfileForSegment = {
        userId: `new-user-ctrl-${i}`,
        totalConversations: 2, // New user
      };
      recordSegmentMetric(experiment.id, 'control', 0.5 + Math.random() * 0.1, userProfile);
    }
    for (let i = 0; i < 10; i++) {
      const userProfile: UserProfileForSegment = {
        userId: `new-user-treat-${i}`,
        totalConversations: 2, // New user
      };
      recordSegmentMetric(experiment.id, 'treatment', 0.7 + Math.random() * 0.2, userProfile);
    }

    const analysis = getSegmentAnalysis(experiment.id);

    // Should have segment results (new_users should qualify with 10 control + 10 treatment)
    expect(analysis.length).toBeGreaterThan(0);

    // Check that new_users segment has data
    const newUsersSegment = analysis.find((s) => s.segmentId === 'new_users');
    expect(newUsersSegment).toBeDefined();
    expect(newUsersSegment?.controlN).toBe(10);
    expect(newUsersSegment?.treatmentN).toBe(10);
  });

  it('should calculate improvement per segment', () => {
    const experiment = startExperiment({
      personaId: 'ferni',
      name: 'Segment Improvement Test',
      hypothesis: 'Testing segment improvement',
      trafficAllocation: 0.5,
      minimumSampleSize: 10,
      control: { description: 'Control' },
      treatment: { description: 'Treatment' },
    });

    // New users respond better to treatment
    for (let i = 0; i < 20; i++) {
      const userProfile: UserProfileForSegment = {
        userId: `segment-test-${i}`,
        totalConversations: 2,
      };
      const variant = i < 10 ? 'control' : 'treatment';
      const score = variant === 'control' ? 0.4 : 0.7;
      recordSegmentMetric(experiment.id, variant, score, userProfile);
    }

    const analysis = getSegmentAnalysis(experiment.id);
    const newUsersSegment = analysis.find((s) => s.segmentId === 'new_users');

    expect(newUsersSegment).toBeDefined();
    expect(newUsersSegment?.improvement).toBeGreaterThan(0.2);
    expect(newUsersSegment?.isSignificant).toBe(true);
  });

  it('should return empty array for unknown experiment', () => {
    const analysis = getSegmentAnalysis('non-existent');
    expect(analysis).toEqual([]);
  });
});

// ============================================================================
// HELPERS
// ============================================================================

function createMockExperiment(config: {
  controlEngagement: number;
  controlN: number;
  treatmentEngagement: number;
  treatmentN: number;
}): PersonaExperiment {
  return {
    id: `exp_mock_${Date.now()}`,
    name: 'Mock Experiment',
    personaId: 'ferni',
    hypothesis: 'Testing',
    status: 'running',
    trafficAllocation: 0.5,
    minimumSampleSize: 100,
    control: { description: 'Control' },
    treatment: { description: 'Treatment' },
    metrics: {
      engagement: {
        control: config.controlEngagement,
        treatment: config.treatmentEngagement,
        controlN: config.controlN,
        treatmentN: config.treatmentN,
      },
      satisfaction: {
        control: 0.5,
        treatment: 0.5,
        controlN: config.controlN,
        treatmentN: config.treatmentN,
      },
      depth: {
        control: 0.5,
        treatment: 0.5,
        controlN: config.controlN,
        treatmentN: config.treatmentN,
      },
    },
    startedAt: new Date(),
  };
}

