/**
 * LLMCompiler Joiner
 *
 * Aggregates results from parallel task execution.
 * Combines outputs and determines if replanning is needed.
 *
 * @module agents/shared/llm-compiler/joiner
 */

import type { ParallelResult } from '../performance/parallel-executor.js';
import type {
  LLMCompilerResult,
  LLMCompilerTaskResult,
  LLMCompilerStats,
} from './types.js';

// ============================================================================
// RESULT AGGREGATION
// ============================================================================

/**
 * Aggregate results from parallel execution into final result.
 */
export function aggregateResults(
  results: Map<string, ParallelResult<LLMCompilerTaskResult>>,
  batchCount: number,
  totalDurationMs: number
): LLMCompilerResult {
  const taskResults: LLMCompilerTaskResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Collect all task results
  for (const [, result] of results) {
    if (result.success && result.result) {
      taskResults.push(result.result);
      if (result.result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    } else {
      // Execution failed (timeout, etc.)
      failureCount++;
      if (result.result) {
        taskResults.push(result.result);
      }
    }
  }

  // Build aggregated result string
  const aggregatedResult = buildAggregatedResult(taskResults);

  // Calculate stats
  const totalTasks = taskResults.length;
  const stats: LLMCompilerStats = {
    totalTasks,
    parallelBatches: batchCount,
    successCount,
    failureCount,
    parallelismRatio: batchCount > 0 ? totalTasks / batchCount : 0,
  };

  // Determine if replanning is needed
  // Replan if some tasks failed but some succeeded (partial failure)
  const needsReplan = failureCount > 0 && successCount > 0;

  return {
    taskResults,
    aggregatedResult,
    needsReplan,
    totalDurationMs,
    stats,
  };
}

/**
 * Build aggregated result string from task results.
 */
function buildAggregatedResult(taskResults: LLMCompilerTaskResult[]): string {
  const parts: string[] = [];

  for (const result of taskResults) {
    if (result.success && result.result !== undefined) {
      // Format successful result
      const resultStr =
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result);
      parts.push(`[${result.fn}]: ${resultStr}`);
    } else if (result.error) {
      // Note failed task
      parts.push(`[${result.fn}]: Failed - ${result.error}`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// REPLAN PROMPT GENERATION
// ============================================================================

/**
 * Generate a replan prompt for partial failures.
 * Used when some tasks succeeded but others failed.
 */
export function generateReplanPrompt(result: LLMCompilerResult): string | null {
  if (!result.needsReplan) return null;

  const failedTasks = result.taskResults.filter((r) => !r.success);
  const successTasks = result.taskResults.filter((r) => r.success);

  const failedList = failedTasks.map((t) => `- ${t.fn}: ${t.error}`).join('\n');
  const successList = successTasks.map((t) => `- ${t.fn}`).join('\n');

  return `Some tasks failed during parallel execution.

Successful:
${successList}

Failed:
${failedList}

Please retry the failed tasks or provide alternative approaches.`;
}
