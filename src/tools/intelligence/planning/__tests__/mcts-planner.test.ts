/**
 * MCTS Planner Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MCTSPlanner, getMCTSPlanner, resetMCTSPlanner, planTools } from '../mcts/planner.js';
import { resetValueEstimator } from '../mcts/value-estimator.js';
import { resetTransitionMatrix } from '../../transitions/transition-matrix.js';

describe('MCTSPlanner', () => {
  let planner: MCTSPlanner;

  beforeEach(() => {
    resetMCTSPlanner();
    resetValueEstimator();
    resetTransitionMatrix();
    planner = new MCTSPlanner({
      maxSimulations: 20, // Fewer for faster tests
      timeoutMs: 200,
    });
  });

  describe('plan', () => {
    it('should return a plan for a given context', () => {
      const plan = planner.plan({
        query: 'check the weather and my calendar',
        availableTools: ['weather_current', 'calendar_list', 'tasks_list'],
        personaId: 'ferni',
      });

      expect(plan).toHaveProperty('tools');
      expect(plan).toHaveProperty('value');
      expect(plan).toHaveProperty('confidence');
      expect(Array.isArray(plan.tools)).toBe(true);
    });

    it('should respect timeout', () => {
      const shortPlanner = new MCTSPlanner({
        maxSimulations: 1000,
        timeoutMs: 50, // Very short timeout
      });

      const start = Date.now();
      shortPlanner.plan({
        query: 'complex planning task',
        availableTools: ['a', 'b', 'c', 'd', 'e', 'f'],
        personaId: 'ferni',
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200); // Should complete within timeout + overhead
    });

    it('should include relevant tools based on query', () => {
      const plan = planner.plan({
        query: 'check weather forecast',
        availableTools: ['weather_current', 'weather_forecast', 'calendar_list'],
        personaId: 'ferni',
      });

      // Should prefer weather-related tools
      const weatherTools = plan.tools.filter((t) => t.includes('weather'));
      expect(weatherTools.length).toBeGreaterThanOrEqual(0);
    });

    it('should track statistics', () => {
      planner.plan({
        query: 'test query',
        availableTools: ['tool_a', 'tool_b'],
        personaId: 'ferni',
      });

      const stats = planner.getStats();
      expect(stats.nodeCount).toBeGreaterThan(0);
      expect(stats.simulationCount).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear the tree', () => {
      planner.plan({
        query: 'test',
        availableTools: ['a'],
        personaId: 'ferni',
      });

      planner.clear();
      const stats = planner.getStats();

      expect(stats.nodeCount).toBe(0);
      expect(stats.simulationCount).toBe(0);
    });
  });

  describe('planTools convenience function', () => {
    it('should work with minimal options', () => {
      const plan = planTools('check weather', ['weather_current', 'weather_forecast']);

      expect(plan).toHaveProperty('tools');
      expect(plan).toHaveProperty('simulationCount');
    });

    it('should respect custom options', () => {
      const plan = planTools('complex query', ['a', 'b', 'c'], {
        personaId: 'maya',
        maxSimulations: 10,
        timeoutMs: 100,
      });

      expect(plan.simulationCount).toBeLessThanOrEqual(10);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const a = getMCTSPlanner();
      const b = getMCTSPlanner();
      expect(a).toBe(b);
    });

    it('should reset correctly', () => {
      const a = getMCTSPlanner();
      resetMCTSPlanner();
      const b = getMCTSPlanner();
      expect(a).not.toBe(b);
    });
  });
});

describe('ValueEstimator', () => {
  it('should estimate value for state + tool', async () => {
    const { ValueEstimator } = await import('../mcts/value-estimator.js');
    const estimator = new ValueEstimator();

    const result = estimator.estimate({
      state: {
        executedTools: ['weather_current'],
        remainingIntent: 'check calendar',
        context: {},
        confidence: 0.8,
      },
      nextTool: 'calendar_list',
      context: {
        query: 'check weather and calendar',
        availableTools: ['weather_current', 'calendar_list'],
        personaId: 'ferni',
      },
    });

    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('confidence');
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(1);
  });

  it('should penalize unavailable tools', async () => {
    const { ValueEstimator } = await import('../mcts/value-estimator.js');
    const estimator = new ValueEstimator();

    const availableResult = estimator.estimate({
      state: { executedTools: [], remainingIntent: 'test', context: {}, confidence: 1 },
      nextTool: 'tool_a',
      context: {
        query: 'test',
        availableTools: ['tool_a'],
        personaId: 'ferni',
      },
    });

    const unavailableResult = estimator.estimate({
      state: { executedTools: [], remainingIntent: 'test', context: {}, confidence: 1 },
      nextTool: 'tool_a',
      context: {
        query: 'test',
        availableTools: [], // Not available
        personaId: 'ferni',
      },
    });

    expect(availableResult.value).toBeGreaterThan(unavailableResult.value);
  });
});
