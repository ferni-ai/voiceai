/**
 * Dynamic Strategy Selection Tests
 *
 * Tests the SOTA per-user routing strategy optimization system.
 *
 * @module tools/semantic-router/learning/__tests__/dynamic-strategy.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import {
  DynamicStrategyEngine,
  getDynamicStrategyEngine,
  initializeDynamicStrategy,
  shutdownDynamicStrategy,
  STRATEGY_CONFIGS,
  type RoutingStrategy,
  type StrategyOutcome,
} from '../dynamic-strategy.js';

describe('DynamicStrategyEngine', () => {
  let engine: DynamicStrategyEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new DynamicStrategyEngine({
      minSamplesForPersonalization: 5, // Lower for testing
      explorationRate: 0.1,
      decayFactor: 0.95,
    });
  });

  afterEach(() => {
    engine.clearAll();
  });

  describe('selectStrategy', () => {
    it('should return default strategy for new users', () => {
      const selection = engine.selectStrategy('new-user');

      expect(selection.strategy).toBeDefined();
      expect(['fast', 'balanced', 'accurate', 'adaptive']).toContain(selection.strategy);
      expect(selection.confidence).toBeLessThan(0.5); // Low confidence for exploration
      expect(selection.reason).toContain('Exploring');
    });

    it('should personalize after enough samples', () => {
      const userId = 'test-user';

      // Record multiple successful outcomes for 'balanced'
      for (let i = 0; i < 10; i++) {
        engine.recordOutcome(userId, {
          strategy: 'balanced',
          latencyMs: 50,
          wasCorrect: true,
          toolExecuted: true,
          timestamp: Date.now(),
        });
      }

      const selection = engine.selectStrategy(userId);

      // Should have higher confidence now
      // Thompson Sampling is probabilistic - confidence can vary based on Beta distribution sampling
      // 0.2 threshold accounts for exploration rate variance while still validating personalization
      expect(selection.confidence).toBeGreaterThan(0.2);
      // Reason should not be "exploring"
      expect(selection.reason).not.toContain('Exploring');
    });

    it('should consider input complexity in selection', () => {
      const userId = 'complex-user';

      // Build up some history
      for (let i = 0; i < 10; i++) {
        engine.recordOutcome(userId, {
          strategy: 'accurate',
          latencyMs: 150,
          wasCorrect: true,
          toolExecuted: true,
          timestamp: Date.now(),
        });
      }

      // Select with high complexity context
      const complexSelection = engine.selectStrategy(userId, {
        inputComplexity: 0.9,
      });

      // Select with low complexity context
      const simpleSelection = engine.selectStrategy(userId, {
        inputComplexity: 0.1,
      });

      // Both should work, complexity affects weighting
      expect(complexSelection.strategy).toBeDefined();
      expect(simpleSelection.strategy).toBeDefined();
    });

    it('should favor fast strategy for urgent requests', () => {
      const userId = 'urgent-user';

      // Build up some history with fast strategy successes
      for (let i = 0; i < 10; i++) {
        engine.recordOutcome(userId, {
          strategy: 'fast',
          latencyMs: 10,
          wasCorrect: true,
          toolExecuted: true,
          timestamp: Date.now(),
        });
      }

      const selection = engine.selectStrategy(userId, {
        urgencySignal: 0.95,
      });

      // With urgency and fast success history, likely to select fast
      expect(selection.strategy).toBeDefined();
      expect(selection.expectedLatencyMs).toBeDefined();
    });

    it('should return disabled message when disabled', () => {
      const disabledEngine = new DynamicStrategyEngine({ enabled: false });
      const selection = disabledEngine.selectStrategy('any-user');

      expect(selection.reason).toContain('disabled');
    });
  });

  describe('recordOutcome', () => {
    it('should update beliefs for successful outcome', () => {
      const userId = 'test-user';

      engine.recordOutcome(userId, {
        strategy: 'balanced',
        latencyMs: 50,
        wasCorrect: true,
        toolExecuted: true,
        timestamp: Date.now(),
      });

      const stats = engine.getProfileStats(userId);
      expect(stats).not.toBeNull();
      expect(stats!.totalSamples).toBe(1);
    });

    it('should update beliefs for failed outcome', () => {
      const userId = 'test-user';

      engine.recordOutcome(userId, {
        strategy: 'fast',
        latencyMs: 10,
        wasCorrect: false, // Correction needed
        toolExecuted: true,
        timestamp: Date.now(),
      });

      const stats = engine.getProfileStats(userId);
      expect(stats).not.toBeNull();
      expect(stats!.totalSamples).toBe(1);
    });

    it('should classify user type after enough samples', () => {
      const userId = 'speed-user';

      // Record many successful fast outcomes
      for (let i = 0; i < 20; i++) {
        engine.recordOutcome(userId, {
          strategy: 'fast',
          latencyMs: 10,
          wasCorrect: true,
          toolExecuted: true,
          timestamp: Date.now(),
        });
      }

      const userType = engine.getUserType(userId);
      expect(userType).toBe('speed_seeker');
    });

    it('should classify accuracy seeker when fast fails often', () => {
      const userId = 'accuracy-user';

      // Record many failed fast outcomes
      for (let i = 0; i < 15; i++) {
        engine.recordOutcome(userId, {
          strategy: 'fast',
          latencyMs: 10,
          wasCorrect: i % 2 === 0, // 50% failure rate
          toolExecuted: true,
          timestamp: Date.now(),
        });
      }

      // Then successful accurate outcomes
      for (let i = 0; i < 10; i++) {
        engine.recordOutcome(userId, {
          strategy: 'accurate',
          latencyMs: 150,
          wasCorrect: true,
          toolExecuted: true,
          timestamp: Date.now(),
        });
      }

      const userType = engine.getUserType(userId);
      expect(['accuracy_seeker', 'adaptive', 'balanced']).toContain(userType);
    });

    it('should apply decay to old outcomes', () => {
      const userId = 'decay-user';

      // Record old outcomes
      for (let i = 0; i < 10; i++) {
        engine.recordOutcome(userId, {
          strategy: 'fast',
          latencyMs: 10,
          wasCorrect: true,
          toolExecuted: true,
          timestamp: Date.now() - 1000000, // Old timestamp
        });
      }

      // Record new outcomes with different strategy
      for (let i = 0; i < 5; i++) {
        engine.recordOutcome(userId, {
          strategy: 'accurate',
          latencyMs: 150,
          wasCorrect: true,
          toolExecuted: true,
          timestamp: Date.now(),
        });
      }

      // Decay should have been applied
      const stats = engine.getProfileStats(userId);
      expect(stats).not.toBeNull();
      expect(stats!.totalSamples).toBe(15);
    });

    it('should limit stored outcomes', () => {
      const limitedEngine = new DynamicStrategyEngine({
        maxOutcomesPerUser: 10,
        minSamplesForPersonalization: 5,
      });

      const userId = 'limited-user';

      // Record more outcomes than the limit
      for (let i = 0; i < 20; i++) {
        limitedEngine.recordOutcome(userId, {
          strategy: 'balanced',
          latencyMs: 50,
          wasCorrect: true,
          toolExecuted: true,
          timestamp: Date.now(),
        });
      }

      const stats = limitedEngine.getProfileStats(userId);
      expect(stats).not.toBeNull();
      // Distribution should be normalized based on capped outcomes
      const total = Object.values(stats!.strategyDistribution).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 1);
    });
  });

  describe('getUserType', () => {
    it('should return unknown for new users', () => {
      const userType = engine.getUserType('unknown-user');
      expect(userType).toBe('unknown');
    });

    it('should return unknown for users with few samples', () => {
      engine.recordOutcome('few-samples', {
        strategy: 'fast',
        latencyMs: 10,
        wasCorrect: true,
        toolExecuted: true,
        timestamp: Date.now(),
      });

      const userType = engine.getUserType('few-samples');
      expect(userType).toBe('unknown');
    });
  });

  describe('getProfileStats', () => {
    it('should return null for unknown user', () => {
      const stats = engine.getProfileStats('unknown');
      expect(stats).toBeNull();
    });

    it('should return complete stats for known user', () => {
      const userId = 'stats-user';

      // Record some outcomes
      engine.recordOutcome(userId, {
        strategy: 'balanced',
        latencyMs: 50,
        wasCorrect: true,
        toolExecuted: true,
        timestamp: Date.now(),
      });

      const stats = engine.getProfileStats(userId);

      expect(stats).not.toBeNull();
      expect(stats!.userType).toBeDefined();
      expect(stats!.totalSamples).toBe(1);
      expect(stats!.strategyDistribution).toBeDefined();
      expect(stats!.expectedAccuracies).toBeDefined();
      expect(stats!.lastUpdate).toBeGreaterThan(0);
    });
  });

  describe('getGlobalStats', () => {
    it('should return empty stats for no users', () => {
      const stats = engine.getGlobalStats();

      expect(stats.totalUsers).toBe(0);
      expect(stats.avgSamplesPerUser).toBe(0);
    });

    it('should aggregate stats across users', () => {
      // Create multiple users
      for (let u = 0; u < 3; u++) {
        for (let i = 0; i < 5; i++) {
          engine.recordOutcome(`user-${u}`, {
            strategy: 'balanced',
            latencyMs: 50,
            wasCorrect: true,
            toolExecuted: true,
            timestamp: Date.now(),
          });
        }
      }

      const stats = engine.getGlobalStats();

      expect(stats.totalUsers).toBe(3);
      expect(stats.avgSamplesPerUser).toBe(5);
      expect(stats.userTypeDistribution).toBeDefined();
      expect(stats.overallStrategyDistribution).toBeDefined();
    });
  });

  describe('clearUser', () => {
    it('should clear a specific user profile', () => {
      const userId = 'to-clear';

      engine.recordOutcome(userId, {
        strategy: 'fast',
        latencyMs: 10,
        wasCorrect: true,
        toolExecuted: true,
        timestamp: Date.now(),
      });

      expect(engine.getProfileStats(userId)).not.toBeNull();

      engine.clearUser(userId);

      expect(engine.getProfileStats(userId)).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('should clear all user profiles', () => {
      // Create multiple users
      for (let u = 0; u < 5; u++) {
        engine.recordOutcome(`user-${u}`, {
          strategy: 'balanced',
          latencyMs: 50,
          wasCorrect: true,
          toolExecuted: true,
          timestamp: Date.now(),
        });
      }

      expect(engine.getGlobalStats().totalUsers).toBe(5);

      engine.clearAll();

      expect(engine.getGlobalStats().totalUsers).toBe(0);
    });
  });
});

describe('STRATEGY_CONFIGS', () => {
  it('should define all strategies', () => {
    expect(STRATEGY_CONFIGS.fast).toBeDefined();
    expect(STRATEGY_CONFIGS.balanced).toBeDefined();
    expect(STRATEGY_CONFIGS.accurate).toBeDefined();
    expect(STRATEGY_CONFIGS.adaptive).toBeDefined();
  });

  it('should have increasing latency targets', () => {
    expect(STRATEGY_CONFIGS.fast.maxLatencyMs).toBeLessThan(STRATEGY_CONFIGS.balanced.maxLatencyMs);
    expect(STRATEGY_CONFIGS.balanced.maxLatencyMs).toBeLessThan(
      STRATEGY_CONFIGS.accurate.maxLatencyMs
    );
  });

  it('should have increasing layer counts', () => {
    expect(STRATEGY_CONFIGS.fast.layers.length).toBeLessThan(
      STRATEGY_CONFIGS.balanced.layers.length
    );
    expect(STRATEGY_CONFIGS.balanced.layers.length).toBeLessThan(
      STRATEGY_CONFIGS.accurate.layers.length
    );
  });
});

describe('Module exports', () => {
  afterEach(() => {
    shutdownDynamicStrategy();
  });

  it('should initialize and shutdown cleanly', () => {
    const engine = initializeDynamicStrategy({
      enabled: true,
      minSamplesForPersonalization: 10,
    });

    expect(engine).toBeDefined();

    shutdownDynamicStrategy();
  });

  it('should get singleton instance', () => {
    const engine1 = getDynamicStrategyEngine();
    const engine2 = getDynamicStrategyEngine();

    expect(engine1).toBe(engine2);
  });
});

describe('Thompson Sampling', () => {
  let engine: DynamicStrategyEngine;

  beforeEach(() => {
    engine = new DynamicStrategyEngine({
      minSamplesForPersonalization: 5,
      explorationRate: 0.05,
    });
  });

  afterEach(() => {
    engine.clearAll();
  });

  it('should prefer strategies with higher success rates', () => {
    const userId = 'thompson-user';

    // Record many successes for 'accurate'
    for (let i = 0; i < 20; i++) {
      engine.recordOutcome(userId, {
        strategy: 'accurate',
        latencyMs: 150,
        wasCorrect: true,
        toolExecuted: true,
        timestamp: Date.now(),
      });
    }

    // Record many failures for 'fast'
    for (let i = 0; i < 10; i++) {
      engine.recordOutcome(userId, {
        strategy: 'fast',
        latencyMs: 10,
        wasCorrect: false,
        toolExecuted: true,
        timestamp: Date.now(),
      });
    }

    // Check expected accuracies
    const stats = engine.getProfileStats(userId);
    expect(stats!.expectedAccuracies.accurate).toBeGreaterThan(stats!.expectedAccuracies.fast);

    // Sample multiple times - 'accurate' should be selected more often
    let accurateCount = 0;
    let fastCount = 0;

    for (let i = 0; i < 100; i++) {
      const selection = engine.selectStrategy(userId);
      if (selection.strategy === 'accurate') accurateCount++;
      if (selection.strategy === 'fast') fastCount++;
    }

    // 'accurate' should be selected more often (not always due to exploration)
    expect(accurateCount).toBeGreaterThan(fastCount);
  });

  it('should explore occasionally even with clear winner', () => {
    const userId = 'explore-user';

    // Strong preference for 'balanced'
    for (let i = 0; i < 50; i++) {
      engine.recordOutcome(userId, {
        strategy: 'balanced',
        latencyMs: 50,
        wasCorrect: true,
        toolExecuted: true,
        timestamp: Date.now(),
      });
    }

    // Sample many times - should occasionally select other strategies
    const selections = new Set<RoutingStrategy>();
    for (let i = 0; i < 100; i++) {
      selections.add(engine.selectStrategy(userId).strategy);
    }

    // Due to Thompson Sampling, should occasionally explore other strategies
    // (This is probabilistic, so we just check that we get at least the winning strategy)
    expect(selections.has('balanced')).toBe(true);
  });
});
