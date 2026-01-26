/**
 * LLMCompiler Executor
 *
 * DAG-based parallel execution engine.
 * Uses existing ParallelExecutor for dependency-aware batch execution.
 *
 * @module agents/shared/llm-compiler/executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { ParallelExecutor } from '../performance/parallel-executor.js';
import { executeJsonFunction } from '../json-function-executor.js';
import { resolveVariableReferences } from './planner.js';
import { aggregateResults } from './joiner.js';
import type {
  LLMCompilerPlan,
  LLMCompilerContext,
  LLMCompilerResult,
  LLMCompilerTaskResult,
} from './types.js';

const log = createLogger({ module: 'llm-compiler-executor' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default timeout per task (10 seconds) */
const DEFAULT_TASK_TIMEOUT_MS = 10000;

/** Maximum parallel tasks per batch */
const DEFAULT_MAX_PARALLEL = 5;

// ============================================================================
// EXECUTOR
// ============================================================================

/**
 * Execute an LLMCompiler plan with parallel DAG execution.
 *
 * @example
 * ```ts
 * const plan = parseLLMCompilerPlan(llmOutput);
 * const result = await executeLLMCompilerPlan(plan, {
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 * });
 *
 * // result.stats.parallelBatches shows how many batches ran
 * // result.aggregatedResult contains combined output
 * ```
 */
export async function executeLLMCompilerPlan(
  plan: LLMCompilerPlan,
  ctx: LLMCompilerContext = {}
): Promise<LLMCompilerResult> {
  const startTime = Date.now();

  log.info(
    {
      taskCount: plan.tasks.length,
      sessionId: ctx.sessionId,
    },
    '🔀 Starting LLMCompiler parallel execution'
  );

  // Store outputs for variable substitution
  const taskOutputs = new Map<string, unknown>();

  // Create executor with dependency support
  const executor = new ParallelExecutor<LLMCompilerTaskResult>({
    defaultTimeout: ctx.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS,
  });

  // Add all tasks with their dependencies
  for (const task of plan.tasks) {
    executor.add({
      id: task.id,
      dependsOn: task.dependsOn,
      execute: async () => {
        const taskStartTime = Date.now();

        // Notify task start
        ctx.onTaskStart?.(task);

        try {
          // Resolve variable references (e.g., $t1 → actual output)
          const resolvedArgs = resolveVariableReferences(task.args, taskOutputs);

          log.debug(
            {
              taskId: task.id,
              fn: task.fn,
              resolvedArgs,
            },
            'Executing task'
          );

          // Execute via existing json-function-executor
          const result = await executeJsonFunction(
            { fn: task.fn, args: resolvedArgs, raw: task.raw ?? '' },
            {
              userId: ctx.userId,
              sessionId: ctx.sessionId,
              personaId: ctx.personaId,
              publisherId: ctx.publisherId,
              inputText: ctx.inputText,
              // Mark as from LLMCompiler for telemetry
              fromLLMCompiler: true,
            }
          );

          const durationMs = Date.now() - taskStartTime;

          // Store output for downstream tasks
          if (result.success && result.result !== undefined) {
            taskOutputs.set(task.id, result.result);
          }

          const taskResult: LLMCompilerTaskResult = {
            taskId: task.id,
            fn: task.fn,
            success: result.success,
            result: result.result,
            error: result.error,
            durationMs,
          };

          // Notify task complete
          ctx.onTaskComplete?.(taskResult);

          log.debug(
            {
              taskId: task.id,
              success: result.success,
              durationMs,
            },
            'Task completed'
          );

          return taskResult;
        } catch (error) {
          const durationMs = Date.now() - taskStartTime;
          const errorMsg = error instanceof Error ? error.message : String(error);

          log.warn(
            {
              taskId: task.id,
              fn: task.fn,
              error: errorMsg,
              durationMs,
            },
            'Task failed with exception'
          );

          const taskResult: LLMCompilerTaskResult = {
            taskId: task.id,
            fn: task.fn,
            success: false,
            error: errorMsg,
            durationMs,
          };

          ctx.onTaskComplete?.(taskResult);

          return taskResult;
        }
      },
    });
  }

  // Execute all tasks with dependency-aware batching
  const { results, batchCount, failedCount } = await executor.execute();

  const totalDurationMs = Date.now() - startTime;

  log.info(
    {
      totalTasks: plan.tasks.length,
      parallelBatches: batchCount,
      failedCount,
      totalDurationMs,
      sessionId: ctx.sessionId,
    },
    '⚡ LLMCompiler execution complete'
  );

  // Aggregate results
  return aggregateResults(results, batchCount, totalDurationMs);
}
