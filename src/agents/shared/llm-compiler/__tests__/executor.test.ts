/**
 * LLMCompiler Executor Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeLLMCompilerPlan } from '../executor.js';
import type { LLMCompilerPlan } from '../types.js';

// Mock the json-function-executor
vi.mock('../../json-function-executor.js', () => ({
  executeJsonFunction: vi.fn(),
}));

import { executeJsonFunction } from '../../json-function-executor.js';

const mockExecuteJsonFunction = vi.mocked(executeJsonFunction);

describe('LLMCompiler Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeLLMCompilerPlan', () => {
    it('executes independent tasks in parallel', async () => {
      // Track execution order
      const executionOrder: string[] = [];

      mockExecuteJsonFunction.mockImplementation(async (call) => {
        executionOrder.push(call.fn);
        // Simulate some work
        await new Promise((r) => setTimeout(r, 10));
        return {
          success: true,
          fn: call.fn,
          args: call.args,
          result: `Result from ${call.fn}`,
          durationMs: 10,
        };
      });

      const plan: LLMCompilerPlan = {
        tasks: [
          { id: 't1', fn: 'taskA', args: {}, dependsOn: [] },
          { id: 't2', fn: 'taskB', args: {}, dependsOn: [] },
          { id: 't3', fn: 'taskC', args: {}, dependsOn: [] },
        ],
        allowReplan: false,
      };

      const result = await executeLLMCompilerPlan(plan, {});

      expect(result.taskResults).toHaveLength(3);
      expect(result.stats.successCount).toBe(3);
      expect(result.stats.failureCount).toBe(0);
      // All 3 tasks should run in 1 batch (parallel)
      expect(result.stats.parallelBatches).toBe(1);
    });

    it('executes dependent tasks in correct order', async () => {
      const executionOrder: string[] = [];

      mockExecuteJsonFunction.mockImplementation(async (call) => {
        executionOrder.push(call.fn);
        return {
          success: true,
          fn: call.fn,
          args: call.args,
          result: `Result from ${call.fn}`,
          durationMs: 10,
        };
      });

      const plan: LLMCompilerPlan = {
        tasks: [
          { id: 't1', fn: 'first', args: {}, dependsOn: [] },
          { id: 't2', fn: 'second', args: {}, dependsOn: ['t1'] },
          { id: 't3', fn: 'third', args: {}, dependsOn: ['t2'] },
        ],
        allowReplan: false,
      };

      const result = await executeLLMCompilerPlan(plan, {});

      expect(result.stats.parallelBatches).toBe(3);
      expect(executionOrder).toEqual(['first', 'second', 'third']);
    });

    it('handles partial failures', async () => {
      mockExecuteJsonFunction.mockImplementation(async (call) => {
        if (call.fn === 'failTask') {
          return {
            success: false,
            fn: call.fn,
            args: call.args,
            error: 'Task failed',
            durationMs: 5,
          };
        }
        return {
          success: true,
          fn: call.fn,
          args: call.args,
          result: `Result from ${call.fn}`,
          durationMs: 10,
        };
      });

      const plan: LLMCompilerPlan = {
        tasks: [
          { id: 't1', fn: 'successTask', args: {}, dependsOn: [] },
          { id: 't2', fn: 'failTask', args: {}, dependsOn: [] },
        ],
        allowReplan: true,
      };

      const result = await executeLLMCompilerPlan(plan, {});

      expect(result.stats.successCount).toBe(1);
      expect(result.stats.failureCount).toBe(1);
      expect(result.needsReplan).toBe(true);
    });

    it('resolves variable references', async () => {
      const capturedArgs: Record<string, unknown>[] = [];

      mockExecuteJsonFunction.mockImplementation(async (call) => {
        capturedArgs.push(call.args);
        return {
          success: true,
          fn: call.fn,
          args: call.args,
          result: `output-${call.fn}`,
          durationMs: 10,
        };
      });

      const plan: LLMCompilerPlan = {
        tasks: [
          { id: 't1', fn: 'getWeather', args: { city: 'NYC' }, dependsOn: [] },
          { id: 't2', fn: 'summarize', args: { weather: '$t1' }, dependsOn: ['t1'] },
        ],
        allowReplan: false,
      };

      await executeLLMCompilerPlan(plan, {});

      // Second task should have resolved $t1
      expect(capturedArgs[1].weather).toBe('output-getWeather');
    });

    it('calls callbacks on task events', async () => {
      mockExecuteJsonFunction.mockResolvedValue({
        success: true,
        fn: 'test',
        args: {},
        result: 'done',
        durationMs: 5,
      });

      const onTaskStart = vi.fn();
      const onTaskComplete = vi.fn();

      const plan: LLMCompilerPlan = {
        tasks: [{ id: 't1', fn: 'test', args: {}, dependsOn: [] }],
        allowReplan: false,
      };

      await executeLLMCompilerPlan(plan, {
        onTaskStart,
        onTaskComplete,
      });

      expect(onTaskStart).toHaveBeenCalledWith(
        expect.objectContaining({ id: 't1', fn: 'test' })
      );
      expect(onTaskComplete).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 't1', success: true })
      );
    });

    it('includes context in tool execution', async () => {
      mockExecuteJsonFunction.mockResolvedValue({
        success: true,
        fn: 'test',
        args: {},
        result: 'done',
        durationMs: 5,
      });

      const plan: LLMCompilerPlan = {
        tasks: [{ id: 't1', fn: 'test', args: {}, dependsOn: [] }],
        allowReplan: false,
      };

      await executeLLMCompilerPlan(plan, {
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      });

      expect(mockExecuteJsonFunction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'user-123',
          sessionId: 'session-456',
          personaId: 'ferni',
          fromLLMCompiler: true,
        })
      );
    });

    it('calculates parallelism ratio correctly', async () => {
      mockExecuteJsonFunction.mockResolvedValue({
        success: true,
        fn: 'test',
        args: {},
        result: 'done',
        durationMs: 5,
      });

      // 4 tasks in 2 batches = ratio of 2
      const plan: LLMCompilerPlan = {
        tasks: [
          { id: 't1', fn: 'a', args: {}, dependsOn: [] },
          { id: 't2', fn: 'b', args: {}, dependsOn: [] },
          { id: 't3', fn: 'c', args: {}, dependsOn: ['t1'] },
          { id: 't4', fn: 'd', args: {}, dependsOn: ['t2'] },
        ],
        allowReplan: false,
      };

      const result = await executeLLMCompilerPlan(plan, {});

      expect(result.stats.totalTasks).toBe(4);
      expect(result.stats.parallelBatches).toBe(2);
      expect(result.stats.parallelismRatio).toBe(2);
    });

    it('handles empty plan', async () => {
      const plan: LLMCompilerPlan = {
        tasks: [],
        allowReplan: false,
      };

      const result = await executeLLMCompilerPlan(plan, {});

      expect(result.taskResults).toHaveLength(0);
      expect(result.stats.totalTasks).toBe(0);
      expect(result.aggregatedResult).toBe('');
    });

    it('aggregates results into readable string', async () => {
      mockExecuteJsonFunction.mockImplementation(async (call) => ({
        success: true,
        fn: call.fn,
        args: call.args,
        result: `output-${call.fn}`,
        durationMs: 5,
      }));

      const plan: LLMCompilerPlan = {
        tasks: [
          { id: 't1', fn: 'getWeather', args: {}, dependsOn: [] },
          { id: 't2', fn: 'playMusic', args: {}, dependsOn: [] },
        ],
        allowReplan: false,
      };

      const result = await executeLLMCompilerPlan(plan, {});

      expect(result.aggregatedResult).toContain('[getWeather]: output-getWeather');
      expect(result.aggregatedResult).toContain('[playMusic]: output-playMusic');
    });
  });
});
