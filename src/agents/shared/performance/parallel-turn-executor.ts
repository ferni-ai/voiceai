/**
 * Parallel Turn Executor
 *
 * PERFORMANCE OPTIMIZATION: Maximizes parallelization during turn processing
 * by grouping independent operations and executing them concurrently.
 *
 * Key optimizations:
 * 1. Dependency-aware parallel execution
 * 2. Early termination for critical failures
 * 3. Timeout handling per operation
 * 4. Metrics collection for bottleneck identification
 *
 * @module performance/parallel-turn-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'ParallelTurnExecutor' });

// ============================================================================
// TYPES
// ============================================================================

export interface TurnOperation<T = unknown> {
  /** Unique operation ID */
  id: string;
  /** Human-readable name for logging */
  name: string;
  /** The async operation to execute */
  execute: () => Promise<T>;
  /** Operations this depends on (must complete first) */
  dependsOn?: string[];
  /** Whether failure should stop the turn */
  critical?: boolean;
  /** Timeout in ms (default: 1000) */
  timeoutMs?: number;
  /** Priority (lower = higher priority, runs first in its tier) */
  priority?: number;
}

export interface OperationResult<T = unknown> {
  id: string;
  name: string;
  success: boolean;
  result?: T;
  error?: Error;
  durationMs: number;
  timedOut: boolean;
}

export interface ParallelExecutionResult<T = unknown> {
  /** All operation results */
  results: Map<string, OperationResult<T>>;
  /** Total execution time */
  totalDurationMs: number;
  /** Number of successful operations */
  successCount: number;
  /** Number of failed operations */
  failedCount: number;
  /** Number of timed out operations */
  timedOutCount: number;
  /** Critical failure (if any) */
  criticalFailure?: OperationResult<T>;
  /** Execution order (for debugging) */
  executionOrder: string[];
}

// ============================================================================
// PARALLEL EXECUTOR
// ============================================================================

export class ParallelTurnExecutor<T = unknown> {
  private operations: Array<TurnOperation<T>> = [];
  private defaultTimeout = 1000;

  constructor(defaultTimeout = 1000) {
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Add an operation to execute
   */
  add(operation: TurnOperation<T>): this {
    this.operations.push(operation);
    return this;
  }

  /**
   * Add multiple operations
   */
  addAll(operations: Array<TurnOperation<T>>): this {
    this.operations.push(...operations);
    return this;
  }

  /**
   * Execute all operations with maximum parallelism
   *
   * Operations are grouped into tiers based on dependencies:
   * - Tier 0: No dependencies (run in parallel)
   * - Tier 1: Depends on Tier 0 (run after Tier 0 completes)
   * - etc.
   */
  async execute(): Promise<ParallelExecutionResult<T>> {
    const startTime = Date.now();
    const results = new Map<string, OperationResult<T>>();
    const executionOrder: string[] = [];

    if (this.operations.length === 0) {
      return {
        results,
        totalDurationMs: 0,
        successCount: 0,
        failedCount: 0,
        timedOutCount: 0,
        executionOrder,
      };
    }

    // Build dependency graph and compute tiers
    const tiers = this.computeTiers();

    // Execute each tier in sequence
    let criticalFailure: OperationResult<T> | undefined;

    for (const tier of tiers) {
      // Skip if we had a critical failure
      if (criticalFailure) break;

      // Execute all operations in this tier in parallel
      const tierResults = await Promise.all(
        tier.map(async (op) => {
          const opStart = Date.now();
          executionOrder.push(op.id);

          try {
            const result = await this.executeWithTimeout(op);
            const duration = Date.now() - opStart;

            const opResult: OperationResult<T> = {
              id: op.id,
              name: op.name,
              success: true,
              result,
              durationMs: duration,
              timedOut: false,
            };

            log.debug({ id: op.id, durationMs: duration }, `Operation completed: ${op.name}`);
            return opResult;
          } catch (error) {
            const duration = Date.now() - opStart;
            const isTimeout =
              error instanceof Error && error.message.includes('Operation timed out');

            const opResult: OperationResult<T> = {
              id: op.id,
              name: op.name,
              success: false,
              error: error instanceof Error ? error : new Error(String(error)),
              durationMs: duration,
              timedOut: isTimeout,
            };

            log.warn(
              { id: op.id, error: String(error), durationMs: duration, timedOut: isTimeout },
              `Operation failed: ${op.name}`
            );

            if (op.critical) {
              criticalFailure = opResult;
            }

            return opResult;
          }
        })
      );

      // Store results
      for (const result of tierResults) {
        results.set(result.id, result);
      }
    }

    // Calculate summary
    let successCount = 0;
    let failedCount = 0;
    let timedOutCount = 0;

    Array.from(results.values()).forEach((result) => {
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        if (result.timedOut) {
          timedOutCount++;
        }
      }
    });

    const totalDurationMs = Date.now() - startTime;

    return {
      results,
      totalDurationMs,
      successCount,
      failedCount,
      timedOutCount,
      criticalFailure,
      executionOrder,
    };
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout(op: TurnOperation<T>): Promise<T> {
    const timeout = op.timeoutMs ?? this.defaultTimeout;

    return Promise.race([
      op.execute(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeout}ms: ${op.name}`));
        }, timeout);
      }),
    ]);
  }

  /**
   * Compute execution tiers based on dependencies
   */
  private computeTiers(): Array<Array<TurnOperation<T>>> {
    const tiers: Array<Array<TurnOperation<T>>> = [];
    const completed = new Set<string>();
    const remaining = [...this.operations];

    // Sort by priority within tiers
    remaining.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

    while (remaining.length > 0) {
      const tier: Array<TurnOperation<T>> = [];

      for (let i = remaining.length - 1; i >= 0; i--) {
        const op = remaining[i];
        const deps = op.dependsOn ?? [];

        // Check if all dependencies are satisfied
        if (deps.every((dep) => completed.has(dep))) {
          tier.push(op);
          remaining.splice(i, 1);
        }
      }

      if (tier.length === 0 && remaining.length > 0) {
        // Circular dependency detected - force execution
        log.warn(
          { remaining: remaining.map((o) => o.id) },
          'Circular dependency detected, forcing execution'
        );
        tier.push(...remaining);
        remaining.length = 0;
      }

      // Sort tier by priority
      tier.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

      // Mark as completed
      for (const op of tier) {
        completed.add(op.id);
      }

      tiers.push(tier);
    }

    return tiers;
  }

  /**
   * Clear all operations (for reuse)
   */
  clear(): this {
    this.operations = [];
    return this;
  }

  /**
   * Get operation count
   */
  get operationCount(): number {
    return this.operations.length;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute operations in parallel with dependencies
 *
 * @example
 * ```ts
 * const { results, criticalFailure } = await executeParallel([
 *   { id: 'analyze', name: 'Message Analysis', execute: () => analyzeMessage() },
 *   { id: 'memory', name: 'Memory Retrieval', execute: () => retrieveMemories() },
 *   { id: 'context', name: 'Context Building', execute: () => buildContext(), dependsOn: ['analyze'] },
 * ]);
 *
 * if (criticalFailure) {
 *   throw criticalFailure.error;
 * }
 * ```
 */
export async function executeParallel<T>(
  operations: Array<TurnOperation<T>>
): Promise<ParallelExecutionResult<T>> {
  const executor = new ParallelTurnExecutor<T>();
  executor.addAll(operations);
  return executor.execute();
}

/**
 * Execute a simple parallel operation set (no dependencies)
 */
export async function executeSimpleParallel<T>(
  operations: Array<{ id: string; name: string; execute: () => Promise<T>; timeoutMs?: number }>
): Promise<Map<string, T>> {
  const result = await executeParallel(operations);

  const outputs = new Map<string, T>();
  Array.from(result.results.entries()).forEach(([id, opResult]) => {
    if (opResult.success && opResult.result !== undefined) {
      outputs.set(id, opResult.result);
    }
  });

  return outputs;
}

/**
 * Execute with automatic failure handling
 */
export async function executeParallelSafe<T>(
  operations: Array<TurnOperation<T>>,
  onCriticalFailure?: (failure: OperationResult<T>) => void
): Promise<Map<string, T>> {
  const result = await executeParallel(operations);

  if (result.criticalFailure && onCriticalFailure) {
    onCriticalFailure(result.criticalFailure);
  }

  const outputs = new Map<string, T>();
  Array.from(result.results.entries()).forEach(([id, opResult]) => {
    if (opResult.success && opResult.result !== undefined) {
      outputs.set(id, opResult.result);
    }
  });

  return outputs;
}

// ============================================================================
// TURN PROCESSING HELPER
// ============================================================================

/**
 * Pre-built turn processing operation templates
 */
export const TurnOperationTemplates = {
  messageAnalysis: <T>(execute: () => Promise<T>): TurnOperation<T> => ({
    id: 'analyze',
    name: 'Message Analysis',
    execute,
    priority: 0,
    critical: true,
    timeoutMs: 200,
  }),

  memoryRetrieval: <T>(execute: () => Promise<T>): TurnOperation<T> => ({
    id: 'memory',
    name: 'Memory Retrieval',
    execute,
    priority: 10,
    timeoutMs: 500,
  }),

  contextBuilding: <T>(execute: () => Promise<T>): TurnOperation<T> => ({
    id: 'context',
    name: 'Context Building',
    execute,
    dependsOn: ['analyze'],
    priority: 20,
    timeoutMs: 300,
  }),

  emotionalProcessing: <T>(execute: () => Promise<T>): TurnOperation<T> => ({
    id: 'emotional',
    name: 'Emotional Processing',
    execute,
    dependsOn: ['analyze'],
    priority: 15,
    timeoutMs: 200,
  }),

  humanization: <T>(execute: () => Promise<T>): TurnOperation<T> => ({
    id: 'humanization',
    name: 'Humanization',
    execute,
    dependsOn: ['emotional'],
    priority: 30,
    timeoutMs: 300,
  }),

  trustSystems: <T>(execute: () => Promise<T>): TurnOperation<T> => ({
    id: 'trust',
    name: 'Trust Systems',
    execute,
    priority: 40,
    timeoutMs: 200,
  }),

  fireAndForget: <T>(id: string, name: string, execute: () => Promise<T>): TurnOperation<T> => ({
    id,
    name,
    execute,
    priority: 100,
    critical: false,
    timeoutMs: 500,
  }),
};

export default {
  ParallelTurnExecutor,
  executeParallel,
  executeSimpleParallel,
  executeParallelSafe,
  TurnOperationTemplates,
};
