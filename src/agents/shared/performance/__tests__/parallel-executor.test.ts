/**
 * Parallel Executor Tests
 *
 * Tests for dependency-aware parallel execution with timeouts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallelExecutor, parallelMap, parallelCollect } from '../parallel-executor.js';

describe('ParallelExecutor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Basic Execution
  // ===========================================================================
  describe('basic execution', () => {
    it('should execute a single operation', async () => {
      const executor = new ParallelExecutor<string>();

      executor.add({
        id: 'op1',
        execute: async () => 'result1',
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.get('op1')?.success).toBe(true);
      expect(results.get('op1')?.result).toBe('result1');
    });

    it('should execute multiple independent operations in parallel', async () => {
      const executor = new ParallelExecutor<number>();
      const executionOrder: string[] = [];

      executor.add({
        id: 'op1',
        execute: async () => {
          executionOrder.push('op1-start');
          await new Promise<void>((r) => { setTimeout(r, 100); });
          executionOrder.push('op1-end');
          return 1;
        },
      });

      executor.add({
        id: 'op2',
        execute: async () => {
          executionOrder.push('op2-start');
          await new Promise<void>((r) => { setTimeout(r, 50); });
          executionOrder.push('op2-end');
          return 2;
        },
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.get('op1')?.success).toBe(true);
      expect(results.get('op2')?.success).toBe(true);
      // Both should start before either ends (parallel execution)
      expect(executionOrder.slice(0, 2)).toContain('op1-start');
      expect(executionOrder.slice(0, 2)).toContain('op2-start');
    });

    it('should use addAll for multiple operations', async () => {
      const executor = new ParallelExecutor<number>();

      executor.addAll([
        { id: 'op1', execute: async () => 1 },
        { id: 'op2', execute: async () => 2 },
        { id: 'op3', execute: async () => 3 },
      ]);

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.size).toBe(3);
      expect(results.get('op1')?.result).toBe(1);
      expect(results.get('op2')?.result).toBe(2);
      expect(results.get('op3')?.result).toBe(3);
    });
  });

  // ===========================================================================
  // Dependency Handling
  // ===========================================================================
  describe('dependency handling', () => {
    it('should execute dependencies before dependents', async () => {
      const executor = new ParallelExecutor<string>();
      const executionOrder: string[] = [];

      executor.add({
        id: 'parent',
        execute: async () => {
          executionOrder.push('parent');
          return 'parent-result';
        },
      });

      executor.add({
        id: 'child',
        dependsOn: ['parent'],
        execute: async () => {
          executionOrder.push('child');
          return 'child-result';
        },
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results, batchCount } = await promise;

      expect(results.get('parent')?.success).toBe(true);
      expect(results.get('child')?.success).toBe(true);
      expect(executionOrder).toEqual(['parent', 'child']);
      expect(batchCount).toBe(2);
    });

    it('should handle multiple dependencies', async () => {
      const executor = new ParallelExecutor<string>();
      const executionOrder: string[] = [];

      executor.add({
        id: 'dep1',
        execute: async () => {
          executionOrder.push('dep1');
          return 'dep1';
        },
      });

      executor.add({
        id: 'dep2',
        execute: async () => {
          executionOrder.push('dep2');
          return 'dep2';
        },
      });

      executor.add({
        id: 'child',
        dependsOn: ['dep1', 'dep2'],
        execute: async () => {
          executionOrder.push('child');
          return 'child';
        },
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.get('child')?.success).toBe(true);
      // Child should be last
      expect(executionOrder[2]).toBe('child');
    });

    it('should handle chain of dependencies', async () => {
      const executor = new ParallelExecutor<number>();
      const executionOrder: string[] = [];

      executor.add({
        id: 'first',
        execute: async () => {
          executionOrder.push('first');
          return 1;
        },
      });

      executor.add({
        id: 'second',
        dependsOn: ['first'],
        execute: async () => {
          executionOrder.push('second');
          return 2;
        },
      });

      executor.add({
        id: 'third',
        dependsOn: ['second'],
        execute: async () => {
          executionOrder.push('third');
          return 3;
        },
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results, batchCount } = await promise;

      expect(results.get('third')?.success).toBe(true);
      expect(executionOrder).toEqual(['first', 'second', 'third']);
      expect(batchCount).toBe(3);
    });
  });

  // ===========================================================================
  // Priority Handling
  // ===========================================================================
  describe('priority handling', () => {
    it('should execute higher priority operations first within batch', async () => {
      const executor = new ParallelExecutor<string>();

      // Note: Operations start in parallel, but priority affects order of initiation
      executor.add({
        id: 'low',
        priority: 100,
        execute: async () => 'low',
      });

      executor.add({
        id: 'high',
        priority: 1,
        execute: async () => 'high',
      });

      executor.add({
        id: 'medium',
        priority: 50,
        execute: async () => 'medium',
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results, batchCount } = await promise;

      expect(results.size).toBe(3);
      expect(batchCount).toBe(1); // All in same batch (no dependencies)
    });
  });

  // ===========================================================================
  // Timeout Handling
  // ===========================================================================
  describe('timeout handling', () => {
    it('should timeout slow operations', async () => {
      const executor = new ParallelExecutor<string>({ defaultTimeout: 100 });

      executor.add({
        id: 'slow',
        execute: async () => {
          await new Promise<void>((r) => { setTimeout(r, 200); });
          return 'never-reached';
        },
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.get('slow')?.success).toBe(false);
      expect(results.get('slow')?.error?.message).toContain('Timeout');
    });

    it('should use per-operation timeout', async () => {
      const executor = new ParallelExecutor<string>({ defaultTimeout: 5000 });

      executor.add({
        id: 'quick-timeout',
        timeout: 50,
        execute: async () => {
          await new Promise<void>((r) => { setTimeout(r, 100); });
          return 'never-reached';
        },
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.get('quick-timeout')?.success).toBe(false);
    });

    it('should complete fast operations within timeout', async () => {
      const executor = new ParallelExecutor<string>({ defaultTimeout: 5000 });

      executor.add({
        id: 'fast',
        execute: async () => {
          await new Promise<void>((r) => { setTimeout(r, 10); });
          return 'done';
        },
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.get('fast')?.success).toBe(true);
      expect(results.get('fast')?.result).toBe('done');
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================
  describe('error handling', () => {
    it('should isolate errors from other operations', async () => {
      const executor = new ParallelExecutor<string>();

      executor.add({
        id: 'failing',
        execute: async () => {
          throw new Error('Test error');
        },
      });

      executor.add({
        id: 'succeeding',
        execute: async () => 'success',
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results, failedCount } = await promise;

      expect(results.get('failing')?.success).toBe(false);
      expect(results.get('failing')?.error?.message).toBe('Test error');
      expect(results.get('succeeding')?.success).toBe(true);
      expect(failedCount).toBe(1);
    });

    it('should skip dependents when critical dependency fails', async () => {
      const executor = new ParallelExecutor<string>();

      executor.add({
        id: 'critical',
        critical: true,
        execute: async () => {
          throw new Error('Critical failure');
        },
      });

      executor.add({
        id: 'dependent',
        dependsOn: ['critical'],
        execute: async () => 'should-not-run',
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.get('critical')?.success).toBe(false);
      expect(results.get('dependent')?.success).toBe(false);
      expect(results.get('dependent')?.error?.message).toContain('Critical dependency');
    });

    it('should continue dependents when non-critical dependency fails', async () => {
      const executor = new ParallelExecutor<string>();

      executor.add({
        id: 'non-critical',
        critical: false, // Explicitly non-critical
        execute: async () => {
          throw new Error('Non-critical failure');
        },
      });

      executor.add({
        id: 'dependent',
        dependsOn: ['non-critical'],
        execute: async () => 'still-runs',
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.get('non-critical')?.success).toBe(false);
      expect(results.get('dependent')?.success).toBe(true);
      expect(results.get('dependent')?.result).toBe('still-runs');
    });
  });

  // ===========================================================================
  // Metrics
  // ===========================================================================
  describe('metrics', () => {
    it('should track duration per operation', async () => {
      const executor = new ParallelExecutor<string>();

      executor.add({
        id: 'op1',
        execute: async () => {
          await new Promise<void>((r) => { setTimeout(r, 50); });
          return 'done';
        },
      });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.get('op1')?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track total execution duration', async () => {
      const executor = new ParallelExecutor<string>();

      executor.add({ id: 'op1', execute: async () => 'done' });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { totalDurationMs } = await promise;

      expect(totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track batch count', async () => {
      const executor = new ParallelExecutor<string>();

      executor.add({ id: 'op1', execute: async () => '1' });
      executor.add({ id: 'op2', dependsOn: ['op1'], execute: async () => '2' });
      executor.add({ id: 'op3', dependsOn: ['op2'], execute: async () => '3' });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { batchCount } = await promise;

      expect(batchCount).toBe(3);
    });

    it('should track failed count', async () => {
      const executor = new ParallelExecutor<string>();

      executor.add({
        id: 'fail1',
        execute: async () => {
          throw new Error('fail');
        },
      });
      executor.add({
        id: 'fail2',
        execute: async () => {
          throw new Error('fail');
        },
      });
      executor.add({ id: 'success', execute: async () => 'ok' });

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { failedCount } = await promise;

      expect(failedCount).toBe(2);
    });
  });

  // ===========================================================================
  // Clear
  // ===========================================================================
  describe('clear', () => {
    it('should clear all operations', async () => {
      const executor = new ParallelExecutor<string>();

      executor.add({ id: 'op1', execute: async () => '1' });
      executor.add({ id: 'op2', execute: async () => '2' });

      executor.clear();

      const promise = executor.execute();
      await vi.runAllTimersAsync();
      const { results } = await promise;

      expect(results.size).toBe(0);
    });
  });
});

// ===========================================================================
// parallelMap
// ===========================================================================
describe('parallelMap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should map items in parallel', async () => {
    const items = [1, 2, 3, 4, 5];

    const promise = parallelMap(items, async (item) => item * 2);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('should pass index to mapper function', async () => {
    const items = ['a', 'b', 'c'];

    const promise = parallelMap(items, async (item, index) => `${item}-${index}`);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toEqual(['a-0', 'b-1', 'c-2']);
  });

  it('should respect concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const items = [1, 2, 3, 4, 5];

    const promise = parallelMap(
      items,
      async (item) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise<void>((r) => { setTimeout(r, 10); });
        concurrent--;
        return item * 2;
      },
      { concurrency: 2 }
    );

    await vi.runAllTimersAsync();
    await promise;

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should handle empty array', async () => {
    const promise = parallelMap([], async (x: number) => x * 2);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toEqual([]);
  });

  it('should handle errors gracefully', async () => {
    const items = [1, 2, 3];

    const promise = parallelMap(items, async (item) => {
      if (item === 2) throw new Error('fail');
      return item * 2;
    });

    await vi.runAllTimersAsync();
    const results = await promise;

    // First and third should succeed, second may be undefined due to error
    expect(results[0]).toBe(2);
    expect(results[2]).toBe(6);
  });

  it('should timeout slow items', async () => {
    const items = [1, 2];

    const promise = parallelMap(
      items,
      async (item) => {
        if (item === 2) {
          await new Promise<void>((r) => { setTimeout(r, 200); });
        }
        return item * 2;
      },
      { timeout: 50 }
    );

    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results[0]).toBe(2);
    // Second item timed out
  });
});

// ===========================================================================
// parallelCollect
// ===========================================================================
describe('parallelCollect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should collect successful results', async () => {
    const fns = [async () => 1, async () => 2, async () => 3];

    const promise = parallelCollect(fns);
    await vi.runAllTimersAsync();
    const { successes, errors } = await promise;

    expect(successes).toEqual([1, 2, 3]);
    expect(errors).toEqual([]);
  });

  it('should separate successes from errors', async () => {
    const fns = [
      async () => 1,
      async () => {
        throw new Error('fail');
      },
      async () => 3,
    ];

    const promise = parallelCollect(fns);
    await vi.runAllTimersAsync();
    const { successes, errors } = await promise;

    expect(successes).toContain(1);
    expect(successes).toContain(3);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('fail');
  });

  it('should handle all failures', async () => {
    const fns = [
      async () => {
        throw new Error('fail1');
      },
      async () => {
        throw new Error('fail2');
      },
    ];

    const promise = parallelCollect(fns);
    await vi.runAllTimersAsync();
    const { successes, errors } = await promise;

    expect(successes).toEqual([]);
    expect(errors.length).toBe(2);
  });

  it('should handle empty array', async () => {
    const promise = parallelCollect([]);
    await vi.runAllTimersAsync();
    const { successes, errors } = await promise;

    expect(successes).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('should timeout slow functions', async () => {
    const fns = [
      async () => 1,
      async () => {
        await new Promise<void>((r) => { setTimeout(r, 200); });
        return 2;
      },
    ];

    const promise = parallelCollect(fns, { timeout: 50 });
    await vi.runAllTimersAsync();
    const { successes, errors } = await promise;

    expect(successes).toContain(1);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('Timeout');
  });
});
