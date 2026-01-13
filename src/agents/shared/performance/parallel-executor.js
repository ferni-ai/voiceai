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
export class ParallelExecutor {
    operations = new Map();
    defaultTimeout;
    constructor(options = {}) {
        this.defaultTimeout = options.defaultTimeout ?? 5000;
    }
    /**
     * Add an operation to be executed
     */
    add(operation) {
        this.operations.set(operation.id, operation);
        return this;
    }
    /**
     * Add multiple operations at once
     */
    addAll(operations) {
        for (const op of operations) {
            this.add(op);
        }
        return this;
    }
    /**
     * Execute all operations in optimal parallel batches
     */
    async execute() {
        const startTime = Date.now();
        const results = new Map();
        const completed = new Set();
        const failed = new Set();
        let batchCount = 0;
        // Build dependency graph
        const batches = this.buildExecutionBatches();
        // Execute each batch
        for (const batch of batches) {
            batchCount++;
            // Filter out operations whose critical dependencies failed
            const executableOps = batch.filter((op) => {
                if (!op.dependsOn)
                    return true;
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
            const batchResults = await Promise.allSettled(executableOps.map(async (op) => this.executeWithTimeout(op)));
            // Process results
            batchResults.forEach((result, index) => {
                const op = executableOps[index];
                if (result.status === 'fulfilled') {
                    results.set(op.id, result.value);
                    if (result.value.success) {
                        completed.add(op.id);
                    }
                    else {
                        failed.add(op.id);
                    }
                }
                else {
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
    buildExecutionBatches() {
        const batches = [];
        const scheduled = new Set();
        const remaining = new Set(this.operations.keys());
        while (remaining.size > 0) {
            // Find operations whose dependencies are all scheduled
            const batch = [];
            const remainingIds = Array.from(remaining);
            for (const id of remainingIds) {
                const op = this.operations.get(id);
                const depsScheduled = !op.dependsOn || op.dependsOn.every((dep) => scheduled.has(dep));
                if (depsScheduled) {
                    batch.push(op);
                }
            }
            if (batch.length === 0) {
                // Circular dependency detected - break cycle by scheduling all remaining
                log.warn({ remaining: remainingIds }, 'Circular dependency detected');
                for (const id of remainingIds) {
                    batch.push(this.operations.get(id));
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
    async executeWithTimeout(op) {
        const startTime = Date.now();
        const timeout = op.timeout ?? this.defaultTimeout;
        let timeoutId;
        try {
            const result = await Promise.race([
                op.execute(),
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
                }),
            ]);
            return {
                id: op.id,
                success: true,
                result,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            log.warn({ opId: op.id, error: String(error) }, 'Operation failed');
            return {
                id: op.id,
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
                durationMs: Date.now() - startTime,
            };
        }
        finally {
            // FIX BUG: Always clear timeout to prevent timer leak
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId);
            }
        }
    }
    /**
     * Clear all operations
     */
    clear() {
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
export async function parallelMap(items, fn, options = {}) {
    const { concurrency = 10, timeout = 5000 } = options;
    const results = new Array(items.length);
    // FIX BUG: Use a proper work queue instead of non-atomic index++
    // The previous implementation had a race condition where multiple workers
    // could read the same index value before any incremented it.
    const workQueue = items.map((item, index) => ({
        item,
        index,
    }));
    let queueIndex = 0;
    // Simple mutex for atomic queue access
    const getNextWork = () => {
        if (queueIndex >= workQueue.length)
            return null;
        return workQueue[queueIndex++];
    };
    const workers = Array(Math.min(concurrency, items.length))
        .fill(null)
        .map(async () => {
        let work;
        while ((work = getNextWork()) !== null) {
            const { item, index } = work;
            let timeoutId;
            try {
                const result = await Promise.race([
                    fn(item, index),
                    new Promise((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error('Timeout')), timeout);
                    }),
                ]);
                results[index] = result;
            }
            catch (error) {
                // Log error but continue processing other items
                log.debug({ index, error: String(error) }, 'parallelMap item failed');
            }
            finally {
                // FIX BUG: Always clear timeout to prevent timer leak
                if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                }
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
export async function parallelCollect(fns, options = {}) {
    const { timeout = 5000 } = options;
    const successes = [];
    const errors = [];
    // FIX BUG: Track timeouts so we can clear them to prevent timer leaks
    const timeoutIds = [];
    const wrapped = fns.map(async (fn, index) => {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Timeout')), timeout);
            timeoutIds[index] = timeoutId;
        });
        return Promise.race([
            fn().finally(() => {
                // Clear timeout when the actual function completes (success or error)
                if (timeoutIds[index]) {
                    clearTimeout(timeoutIds[index]);
                }
            }),
            timeoutPromise,
        ]);
    });
    const results = await Promise.allSettled(wrapped);
    // Clean up any remaining timeouts (in case Promise.allSettled returns before all timeouts fire)
    for (const timeoutId of timeoutIds) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
    for (const result of results) {
        if (result.status === 'fulfilled') {
            successes.push(result.value);
        }
        else {
            errors.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
        }
    }
    return { successes, errors };
}
//# sourceMappingURL=parallel-executor.js.map