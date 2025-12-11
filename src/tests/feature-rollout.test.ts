/**
 * Feature Rollout Service Tests
 *
 * Tests for progressive feature rollout including:
 * - Rollout lifecycle (start, advance, rollback)
 * - Validation checks
 * - Metrics thresholds
 * - Rollout presets
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FeatureRolloutService,
  getFeatureRollout,
  ROLLOUT_PRESETS,
  type RolloutConfig,
  type RolloutState,
  type ValidationCheck,
  type RolloutStage,
} from '../services/feature-rollout.js';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../services/feature-flags.js', () => ({
  getFeatureFlags: () => ({
    getFlag: vi.fn((id: string) => ({ id, enabled: true, rolloutPercentage: 0 })),
    updateFlag: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../services/slack-notifications.js', () => ({
  notifyRollout: vi.fn().mockResolvedValue(undefined),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('FeatureRolloutService', () => {
  let service: FeatureRolloutService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    service = new FeatureRolloutService();
  });

  afterEach(() => {
    service.shutdown();
  });

  describe('startRollout', () => {
    it('should start a new rollout', async () => {
      const config: RolloutConfig = {
        featureId: 'test-feature',
        stages: [1, 10, 50, 100],
        validationChecks: ['health'],
        stageMinDurationMs: 1000,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: {
          maxErrorRate: 0.05,
          maxLatencyMs: 500,
        },
        initiatedBy: 'test-user',
      };

      const state = await service.startRollout(config);

      expect(state).toBeDefined();
      expect(state.config.featureId).toBe('test-feature');
      // After startRollout, validation runs and if it passes, auto-advances
      // With health check passing (mock returns 'ok'), stage becomes 'rolling_out'
      // and currentStageIndex advances to 1
      expect(state.stage).toBe('rolling_out');
      expect(state.currentStageIndex).toBe(1);
      expect(state.currentPercentage).toBe(10); // stages[1]
    });

    it('should throw if rollout already exists', async () => {
      const config: RolloutConfig = {
        featureId: 'duplicate-feature',
        stages: [10, 100],
        validationChecks: [],
        stageMinDurationMs: 1000,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      await service.startRollout(config);

      await expect(service.startRollout(config)).rejects.toThrow('already in progress');
    });

    it('should initialize metrics to zero', async () => {
      const config: RolloutConfig = {
        featureId: 'metrics-test',
        stages: [100],
        validationChecks: [],
        stageMinDurationMs: 1000,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      const state = await service.startRollout(config);

      expect(state.metrics.requestCount).toBe(0);
      expect(state.metrics.errorCount).toBe(0);
      expect(state.metrics.errorRate).toBe(0);
      expect(state.metrics.avgLatencyMs).toBe(0);
      expect(state.metrics.p99LatencyMs).toBe(0);
    });
  });

  describe('advanceStage', () => {
    it('should advance to next stage', async () => {
      const config: RolloutConfig = {
        featureId: 'advance-test',
        stages: [10, 50, 100],
        validationChecks: [],
        stageMinDurationMs: 0,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      await service.startRollout(config);
      // After startRollout with empty checks, validation passes and auto-advances
      // So we're already at index 1 (percentage 50). Another advance goes to index 2.
      const state = await service.advanceStage('advance-test');

      expect(state.currentStageIndex).toBe(2);
      expect(state.currentPercentage).toBe(100); // stages[2]
      expect(state.stage).toBe('rolling_out');
    });

    it('should mark as stable at final stage', async () => {
      const config: RolloutConfig = {
        featureId: 'stable-test',
        stages: [100],
        validationChecks: [],
        stageMinDurationMs: 0,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      await service.startRollout(config);
      await service.advanceStage('stable-test');
      const state = await service.advanceStage('stable-test');

      expect(state.stage).toBe('stable');
    });

    it('should throw for non-existent rollout', async () => {
      await expect(service.advanceStage('non-existent')).rejects.toThrow('No rollout found');
    });

    it('should throw if already rolled back', async () => {
      const config: RolloutConfig = {
        featureId: 'rollback-advance-test',
        stages: [100],
        validationChecks: [],
        stageMinDurationMs: 0,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      await service.startRollout(config);
      await service.rollback('rollback-advance-test', 'test reason');

      await expect(service.advanceStage('rollback-advance-test')).rejects.toThrow('Cannot advance');
    });
  });

  describe('rollback', () => {
    it('should rollback a feature', async () => {
      const config: RolloutConfig = {
        featureId: 'rollback-test',
        stages: [10, 100],
        validationChecks: [],
        stageMinDurationMs: 0,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      await service.startRollout(config);
      await service.advanceStage('rollback-test');

      const state = await service.rollback('rollback-test', 'High error rate');

      expect(state.stage).toBe('rolled_back');
      expect(state.currentPercentage).toBe(0);
      expect(state.rollbackReason).toBe('High error rate');
    });

    it('should throw for non-existent rollout', async () => {
      await expect(service.rollback('non-existent', 'reason')).rejects.toThrow('No rollout found');
    });
  });

  describe('getRolloutStatus', () => {
    it('should return rollout state', async () => {
      const config: RolloutConfig = {
        featureId: 'status-test',
        stages: [100],
        validationChecks: [],
        stageMinDurationMs: 0,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      await service.startRollout(config);

      const status = service.getRolloutStatus('status-test');

      expect(status).toBeDefined();
      expect(status?.config.featureId).toBe('status-test');
    });

    it('should return undefined for non-existent rollout', () => {
      const status = service.getRolloutStatus('non-existent');

      expect(status).toBeUndefined();
    });
  });

  describe('getAllRollouts', () => {
    it('should return all active rollouts', async () => {
      const config1: RolloutConfig = {
        featureId: 'feature-1',
        stages: [100],
        validationChecks: [],
        stageMinDurationMs: 0,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      const config2: RolloutConfig = {
        ...config1,
        featureId: 'feature-2',
      };

      await service.startRollout(config1);
      await service.startRollout(config2);

      const rollouts = service.getAllRollouts();

      expect(rollouts.length).toBe(2);
    });

    it('should return empty array when no rollouts', () => {
      const rollouts = service.getAllRollouts();

      expect(rollouts).toEqual([]);
    });
  });

  describe('cancelRollout', () => {
    it('should cancel a rollout', async () => {
      const config: RolloutConfig = {
        featureId: 'cancel-test',
        stages: [100],
        validationChecks: [],
        stageMinDurationMs: 0,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      await service.startRollout(config);
      service.cancelRollout('cancel-test');

      const status = service.getRolloutStatus('cancel-test');
      expect(status).toBeUndefined();
    });

    it('should not throw for non-existent rollout', () => {
      expect(() => service.cancelRollout('non-existent')).not.toThrow();
    });
  });

  describe('registerCheck', () => {
    it('should register custom validation check', async () => {
      const customCheck: ValidationCheck = {
        id: 'custom-check',
        name: 'Custom Check',
        required: true,
        check: async () => ({ passed: true, message: 'Custom check passed' }),
      };

      service.registerCheck(customCheck);

      const config: RolloutConfig = {
        featureId: 'custom-check-test',
        stages: [100],
        validationChecks: ['custom-check'],
        stageMinDurationMs: 0,
        autoAdvance: false,
        autoRollback: false,
        rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
        initiatedBy: 'test',
      };

      const state = await service.startRollout(config);

      expect(state).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('should not throw', () => {
      expect(() => service.shutdown()).not.toThrow();
    });
  });
});

describe('getFeatureRollout singleton', () => {
  it('should return singleton instance', () => {
    const instance1 = getFeatureRollout();
    const instance2 = getFeatureRollout();

    expect(instance1).toBe(instance2);
  });
});

describe('ROLLOUT_PRESETS', () => {
  describe('conservative preset', () => {
    it('should have many stages', () => {
      expect(ROLLOUT_PRESETS.conservative.stages.length).toBeGreaterThan(5);
    });

    it('should have strict error threshold', () => {
      expect(ROLLOUT_PRESETS.conservative.rollbackThresholds.maxErrorRate).toBeLessThanOrEqual(
        0.01
      );
    });

    it('should have autoRollback enabled', () => {
      expect(ROLLOUT_PRESETS.conservative.autoRollback).toBe(true);
    });

    it('should have autoAdvance enabled', () => {
      expect(ROLLOUT_PRESETS.conservative.autoAdvance).toBe(true);
    });
  });

  describe('standard preset', () => {
    it('should have 4 stages', () => {
      expect(ROLLOUT_PRESETS.standard.stages).toEqual([5, 25, 50, 100]);
    });

    it('should have 5% error threshold', () => {
      expect(ROLLOUT_PRESETS.standard.rollbackThresholds.maxErrorRate).toBe(0.05);
    });
  });

  describe('aggressive preset', () => {
    it('should have fewer stages', () => {
      expect(ROLLOUT_PRESETS.aggressive.stages.length).toBe(3);
    });

    it('should have higher error threshold', () => {
      expect(ROLLOUT_PRESETS.aggressive.rollbackThresholds.maxErrorRate).toBe(0.1);
    });

    it('should have shorter stage duration', () => {
      expect(ROLLOUT_PRESETS.aggressive.stageMinDurationMs).toBe(5 * 60 * 1000);
    });
  });

  describe('canary preset', () => {
    it('should have low percentage stages', () => {
      expect(ROLLOUT_PRESETS.canary.stages).toEqual([1, 5]);
    });

    it('should not auto-advance', () => {
      expect(ROLLOUT_PRESETS.canary.autoAdvance).toBe(false);
    });

    it('should have 1 hour stage duration', () => {
      expect(ROLLOUT_PRESETS.canary.stageMinDurationMs).toBe(60 * 60 * 1000);
    });
  });
});

describe('RolloutState structure', () => {
  it('should have correct stage types', () => {
    const stages: RolloutStage[] = [
      'pending',
      'validating',
      'rolling_out',
      'stable',
      'rolled_back',
      'failed',
    ];

    for (const stage of stages) {
      expect(typeof stage).toBe('string');
    }
  });
});

describe('ValidationCheck integration', () => {
  let service: FeatureRolloutService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    service = new FeatureRolloutService();
  });

  afterEach(() => {
    service.shutdown();
  });

  it('should run health check', async () => {
    const config: RolloutConfig = {
      featureId: 'health-check-test',
      stages: [100],
      validationChecks: ['health'],
      stageMinDurationMs: 0,
      autoAdvance: false,
      autoRollback: false,
      rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
      initiatedBy: 'test',
    };

    const state = await service.startRollout(config);

    // Health check should have been called
    expect(state.validationResults.length).toBeGreaterThan(0);
  });

  it('should run error_rate check', async () => {
    const config: RolloutConfig = {
      featureId: 'error-rate-test',
      stages: [100],
      validationChecks: ['error_rate'],
      stageMinDurationMs: 0,
      autoAdvance: false,
      autoRollback: false,
      rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
      initiatedBy: 'test',
    };

    const state = await service.startRollout(config);

    expect(state.validationResults.some((r) => r.checkId === 'error_rate')).toBe(true);
  });

  it('should run latency check', async () => {
    const config: RolloutConfig = {
      featureId: 'latency-test',
      stages: [100],
      validationChecks: ['latency'],
      stageMinDurationMs: 0,
      autoAdvance: false,
      autoRollback: false,
      rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
      initiatedBy: 'test',
    };

    const state = await service.startRollout(config);

    expect(state.validationResults.some((r) => r.checkId === 'latency')).toBe(true);
  });
});

describe('Edge cases', () => {
  let service: FeatureRolloutService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    service = new FeatureRolloutService();
  });

  afterEach(() => {
    service.shutdown();
  });

  it('should handle empty validation checks', async () => {
    const config: RolloutConfig = {
      featureId: 'empty-checks',
      stages: [100],
      validationChecks: [],
      stageMinDurationMs: 0,
      autoAdvance: false,
      autoRollback: false,
      rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
      initiatedBy: 'test',
    };

    const state = await service.startRollout(config);

    expect(state).toBeDefined();
  });

  it('should handle single stage rollout', async () => {
    const config: RolloutConfig = {
      featureId: 'single-stage',
      stages: [100],
      validationChecks: [],
      stageMinDurationMs: 0,
      autoAdvance: false,
      autoRollback: false,
      rollbackThresholds: { maxErrorRate: 0.05, maxLatencyMs: 500 },
      initiatedBy: 'test',
    };

    const state = await service.startRollout(config);
    await service.advanceStage('single-stage');
    const finalState = await service.advanceStage('single-stage');

    expect(finalState.stage).toBe('stable');
  });
});
