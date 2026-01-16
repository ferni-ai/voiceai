/**
 * Intelligent Executor Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntelligentExecutor, resetIntelligentExecutor } from '../intelligent-executor.js';
import type { ExecutionPlan, ToolExecutor } from '../types.js';
import type { ToolSequence } from '../../planning/sequence-predictor.js';

describe('IntelligentExecutor', () => {
  let executor: IntelligentExecutor;
  let mockToolExecutor: ToolExecutor;

  beforeEach(() => {
    resetIntelligentExecutor();

    // Mock tool executor
    mockToolExecutor = vi.fn().mockResolvedValue({
      success: true,
      data: { result: 'test' },
    });

    executor = new IntelligentExecutor(mockToolExecutor);
  });

  describe('executeTool', () => {
    it('should execute a single tool', async () => {
      const result = await executor.executeTool('weather_current', { city: 'SF' });

      expect(result.success).toBe(true);
      expect(result.toolId).toBe('weather_current');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockToolExecutor).toHaveBeenCalledWith('weather_current', { city: 'SF' });
    });

    it('should track failure', async () => {
      mockToolExecutor = vi.fn().mockResolvedValue({
        success: false,
        error: 'API error',
      });
      executor = new IntelligentExecutor(mockToolExecutor);

      const result = await executor.executeTool('weather_current');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });
  });

  describe('executeTools', () => {
    it('should execute multiple tools sequentially', async () => {
      const result = await executor.executeTools(['weather_current', 'calendar_list'], {
        parallel: false,
      });

      expect(result.results.length).toBe(2);
      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
    });

    it('should execute tools in parallel when requested', async () => {
      const result = await executor.executeTools(
        ['weather_current', 'calendar_list', 'tasks_list'],
        { parallel: true }
      );

      expect(result.results.length).toBe(3);
      expect(result.success).toBe(true);
    });

    it('should pass tool-specific args', async () => {
      await executor.executeTools(['weather_current', 'calendar_list'], {
        parallel: false,
        args: {
          weather_current: { city: 'NYC' },
          calendar_list: { days: 7 },
        },
      });

      expect(mockToolExecutor).toHaveBeenCalledWith('weather_current', { city: 'NYC' });
      expect(mockToolExecutor).toHaveBeenCalledWith('calendar_list', { days: 7 });
    });
  });

  describe('executePlan', () => {
    it('should execute a plan with dependencies', async () => {
      const plan: ExecutionPlan = {
        steps: [
          {
            toolId: 'weather_current',
            args: {},
            dependencies: [],
            optional: false,
            priority: 2,
            timeoutMs: 5000,
            retry: { maxAttempts: 2, backoffMs: 1000 },
          },
          {
            toolId: 'calendar_list',
            args: {},
            dependencies: [0],
            optional: false,
            priority: 1,
            timeoutMs: 5000,
            retry: { maxAttempts: 2, backoffMs: 1000 },
          },
        ],
        parallelGroups: [[0], [1]],
        estimatedDurationMs: 1000,
        priority: 1,
      };

      const result = await executor.executePlan(plan);

      expect(result.results.length).toBe(2);
      expect(result.success).toBe(true);
    });

    it('should handle step failure with continueOnFailure', async () => {
      mockToolExecutor = vi
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'Failed' })
        .mockResolvedValue({ success: true, data: {} });

      executor = new IntelligentExecutor(mockToolExecutor, {
        continueOnFailure: true,
      });

      const plan: ExecutionPlan = {
        steps: [
          {
            toolId: 'tool_a',
            dependencies: [],
            optional: false,
            priority: 1,
            timeoutMs: 5000,
            retry: { maxAttempts: 1, backoffMs: 100 },
          },
          {
            toolId: 'tool_b',
            dependencies: [],
            optional: false,
            priority: 1,
            timeoutMs: 5000,
            retry: { maxAttempts: 1, backoffMs: 100 },
          },
        ],
        parallelGroups: [[0, 1]],
        estimatedDurationMs: 500,
        priority: 1,
      };

      const result = await executor.executePlan(plan);

      expect(result.failureCount).toBe(1);
      expect(result.successCount).toBe(1);
    });

    it('should skip optional steps when dependency fails', async () => {
      mockToolExecutor = vi
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'Failed' })
        .mockResolvedValue({ success: true, data: {} });

      executor = new IntelligentExecutor(mockToolExecutor, {
        skipOptionalOnFailure: true,
      });

      const plan: ExecutionPlan = {
        steps: [
          {
            toolId: 'tool_a',
            dependencies: [],
            optional: false,
            priority: 2,
            timeoutMs: 5000,
            retry: { maxAttempts: 1, backoffMs: 100 },
          },
          {
            toolId: 'tool_b',
            dependencies: [0],
            optional: true,
            priority: 1,
            timeoutMs: 5000,
            retry: { maxAttempts: 1, backoffMs: 100 },
          },
        ],
        parallelGroups: [[0], [1]],
        estimatedDurationMs: 500,
        priority: 1,
      };

      const result = await executor.executePlan(plan);

      expect(result.skippedCount).toBe(1);
    });
  });

  describe('executeSequence', () => {
    it('should execute a tool sequence', async () => {
      const sequence: ToolSequence = {
        steps: [
          {
            toolId: 'weather',
            confidence: 0.9,
            dependsOn: [],
            optional: false,
            parallelizable: false,
            source: 'router',
          },
          {
            toolId: 'calendar',
            confidence: 0.8,
            dependsOn: [0],
            optional: false,
            parallelizable: false,
            source: 'transition',
          },
        ],
        confidence: 0.85,
        executionStrategy: 'sequential',
        estimatedDurationMs: 600,
      };

      const result = await executor.executeSequence(sequence);

      expect(result.results.length).toBe(2);
    });
  });

  describe('aggregateResults', () => {
    it('should aggregate results into summary', async () => {
      const result = await executor.executeTools(['weather', 'calendar']);
      const aggregated = executor.aggregateResults(result.results);

      expect(aggregated).toHaveProperty('summary');
      expect(aggregated).toHaveProperty('tone');
      expect(aggregated.metadata.toolsExecuted).toBe(2);
    });
  });

  describe('statistics', () => {
    it('should track execution statistics', async () => {
      await executor.executeTool('weather');
      await executor.executeTool('calendar');

      const stats = executor.getStats();

      expect(stats.totalExecutions).toBe(2);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.successRate).toBe(1);
    });

    it('should reset statistics', async () => {
      await executor.executeTool('weather');
      executor.resetStats();

      const stats = executor.getStats();
      expect(stats.totalExecutions).toBe(0);
    });
  });

  describe('callbacks', () => {
    it('should call onStepComplete callback', async () => {
      const onStepComplete = vi.fn();
      executor.updateConfig({ onStepComplete });

      // executeTools uses the parallel dispatcher which invokes callbacks
      await executor.executeTools(['weather'], { parallel: false });

      expect(onStepComplete).toHaveBeenCalled();
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();
      executor.updateConfig({ onProgress });

      await executor.executeTools(['weather', 'calendar'], { parallel: false });

      expect(onProgress).toHaveBeenCalled();
    });
  });
});
