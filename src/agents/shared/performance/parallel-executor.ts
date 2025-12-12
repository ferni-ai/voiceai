/**
 * Parallel Executor
 *
 * Optimizes concurrent execution of independent operations.
 * Groups operations by dependency and executes in optimal batches.
 *
 * Key Features:
 * - Dependency-aware execution ordering
 * - Timeout handling per operation
 * - Error isolation (one failure doesn't break others)
 * - Performance metrics tracking
 *
 * @module ParallelExecutor
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'ParallelExecutor' });

// ============================================================================
// TYPES
// ============================================================================

export interface ParallelOperation<T> {
  /** Unique identifier for this operation */
  id: string;
  /** The async function to execute */
  execute: () => Promise<T>;
  /** Operations that must complete before this one */
  dependsOn?: string[];
  /** Timeout in ms (default: 5000) */
  timeout?: number;
  /** Priority (lower = runs earlier in same batch) */
  priority?: number;
  /** Whether failure should stop dependent operations */
  critical?: boolean;
}

export interface ParallelResult<T> {
  id: string;
  success: boolean;
  result?: T;
  error?: Error;
  durationMs: number;
}

export interface ParallelExecutionResult<T> {
  results: Map<string, ParallelResult<T>>;
  totalDurationMs: number;
  batchCount: number;
  failedCount: number;
}

// ============================================================================
// PARALLEL EXECUTOR CLASS
// ============================================================================

/**
 * Execute operations in parallel with dependency awareness
 *
 * @example
 * ```ts
 * const executor = new ParallelExecutor<ContextInjection[]>();
 *
 * executor.add({
 *   id: 'safety',
 *   execute: () => buildSafetyInjections(ctx),
 *   priority: 0, // Highest priority
 * });
 *
 * executor.add({
 *   id: 'emotional',
 *   execute: () => buildEmotionalContext(ctx),
 *   dependsOn: ['safety'], // Waits for safety first
 * });
 *
 * const { results } = await executor.execute();
 * ```
 */
export class ParallelExecutor<T> {
  private operations: Map<string, ParallelOperation<T>> = new Map();
  private defaultTimeout: number;

  constructor(options: { defaultTimeout?: number } = {}) {
    this.defaultTimeout = options.defaultTimeout ?? 5000;
  }

  /**
   * Add an operation to be executed
   */
  add(operation: ParallelOperation<T>): this {
    this.operations.set(operation.id, operation);
    return this;
  }

  /**
   * Add multiple operations at once
   */
  addAll(operations: ParallelOperation<T>[]): this {
    for (const op of operations) {
      this.add(op);
    }
    return this;
  }

  /**
   * Execute all operations in optimal parallel batches
   */
  async execute(): Promise<ParallelExecutionResult<T>> {
    const startTime = Date.now();
    const results = new Map<string, ParallelResult<T>>();
    const completed = new Set<string>();
    const failed = new Set<string>();
    let batchCount = 0;

    // Build dependency graph
    const batches = this.buildExecutionBatches();

    // Execute each batch
    for (const batch of batches) {
      batchCount++;

      // Filter out operations whose critical dependencies failed
      const executableOps = batch.filter((op) => {
        if (!op.dependsOn) return true;

        for (const depId of op.dependsOn) {
          const depOp = this.operations.get(depId);
          if (depOp?.critical && failed.has(depId)) {
            // Skip this operation - critical dependency failed
            results.set(op.id, {
              id: op.id,
              success: false,
              error: new Error(`Critical dependency '${depId}' failed`),
              durationMs: 0,
            });
            failed.add(op.id);
            return false;
          }
        }
        return true;
      });

      // Execute batch in parallel
      const batchResults = await Promise.allSettled(
        executableOps.map((op) => this.executeWithTimeout(op))
      );

      // Process results
      batchResults.forEach((result, index) => {
        const op = executableOps[index];
        if (result.status === 'fulfilled') {
          results.set(op.id, result.value);
          if (result.value.success) {
            completed.add(op.id);
          } else {
            failed.add(op.id);
          }
        } else {
          results.set(op.id, {
            id: op.id,
            success: false,
            error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
            durationMs: 0,
          });
          failed.add(op.id);
        }
      });
    }

    const totalDurationMs = Date.now() - startTime;

    log.debug({
      totalDurationMs,
      batchCount,
      completed: completed.size,
      failed: failed.size,
    }, '⚡ Parallel execution complete');

    return {
      results,
      totalDurationMs,
      batchCount,
      failedCount: failed.size,
    };
  }

  /**
   * Build execution batches based on dependencies
   */
  private buildExecutionBatches(): ParallelOperation<T>[][] {
    const batches: ParallelOperation<T>[][] = [];
    const scheduled = new Set<string>();
    const remaining = new Set(this.operations.keys());

    while (remaining.size > 0) {
      // Find operations whose dependencies are all scheduled
      const batch: ParallelOperation<T>[] = [];
      const remainingIds = Array.from(remaining);

      for (const id of remainingIds) {
        const op = this.operations.get(id)!;
        const depsScheduled = !op.dependsOn || op.dependsOn.every((dep) => scheduled.has(dep));

        if (depsScheduled) {
          batch.push(op);
        }
      }

      if (batch.length === 0) {
        // Circular dependency detected - break cycle by scheduling all remaining
        log.warn({ remaining: remainingIds }, 'Circular dependency detected');
        for (const id of remainingIds) {
          batch.push(this.operations.get(id)!);
        }
      }

      // Sort batch by priority
      batch.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

      // Mark as scheduled
      for (const op of batch) {
        scheduled.add(op.id);
        remaining.delete(op.id);
      }

      batches.push(batch);
    }

    return batches;
  }

  /**
   * Execute a single operation with timeout
   */
  private async executeWithTimeout(op: ParallelOperation<T>): Promise<ParallelResult<T>> {
    const startTime = Date.now();
    const timeout = op.timeout ?? this.defaultTimeout;

    try {
      const result = await Promise.race([
        op.execute(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
        ),
      ]);

      return {
        id: op.id,
        success: true,
        result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      log.warn({ opId: op.id, error: String(error) }, 'Operation failed');

      return {
        id: op.id,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Clear all operations
   */
  clear(): void {
    this.operations.clear();
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute functions in parallel with concurrency limit
 *
 * @example
 * ```ts
 * const results = await parallelMap(
 *   items,
 *   async (item) => processItem(item),
 *   { concurrency: 5 }
 * );
 * ```
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: { concurrency?: number; timeout?: number } = {}
): Promise<R[]> {
  const { concurrency = 10, timeout = 5000 } = options;
  const results: R[] = [];
  let index = 0;

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (index < items.length) {
        const currentIndex = index++;
        const item = items[currentIndex];

        try {
          const result = await Promise.race([
            fn(item, currentIndex),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), timeout)
            ),
          ]);
          results[currentIndex] = result;
        } catch {
          // Error handling - could throw or continue based on requirements
        }
      }
    });

  await Promise.all(workers);
  return results;
}

/**
 * Execute functions in parallel and collect all results
 * (even if some fail)
 */
export async function parallelCollect<T>(
  fns: Array<() => Promise<T>>,
  options: { timeout?: number } = {}
): Promise<{ successes: T[]; errors: Error[] }> {
  const { timeout = 5000 } = options;
  const successes: T[] = [];
  const errors: Error[] = [];

  const wrapped = fns.map((fn) =>
    Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ])
  );

  const results = await Promise.allSettled(wrapped);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      successes.push(result.value);
    } else {
      errors.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
    }
  }

  return { successes, errors };
}

