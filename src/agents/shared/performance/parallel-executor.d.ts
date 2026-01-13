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
export declare class ParallelExecutor<T> {
    private operations;
    private defaultTimeout;
    constructor(options?: {
        defaultTimeout?: number;
    });
    /**
     * Add an operation to be executed
     */
    add(operation: ParallelOperation<T>): this;
    /**
     * Add multiple operations at once
     */
    addAll(operations: Array<ParallelOperation<T>>): this;
    /**
     * Execute all operations in optimal parallel batches
     */
    execute(): Promise<ParallelExecutionResult<T>>;
    /**
     * Build execution batches based on dependencies
     */
    private buildExecutionBatches;
    /**
     * Execute a single operation with timeout
     */
    private executeWithTimeout;
    /**
     * Clear all operations
     */
    clear(): void;
}
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
export declare function parallelMap<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, options?: {
    concurrency?: number;
    timeout?: number;
}): Promise<R[]>;
/**
 * Execute functions in parallel and collect all results
 * (even if some fail)
 */
export declare function parallelCollect<T>(fns: Array<() => Promise<T>>, options?: {
    timeout?: number;
}): Promise<{
    successes: T[];
    errors: Error[];
}>;
//# sourceMappingURL=parallel-executor.d.ts.map