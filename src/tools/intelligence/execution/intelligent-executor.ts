/**
 * Intelligent Executor
 *
 * Executes tool plans with intelligent parallelization, retry logic,
 * and real-time streaming of results.
 *
 * @module tools/intelligence/execution/intelligent-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { ParallelDispatcher } from './parallel-dispatcher.js';
import {
  getResultAggregator,
  type ResultAggregator,
  type AggregatedResult,
} from './result-aggregator.js';
import type {
  ExecutionStep,
  ExecutionPlan,
  ExecutionResult,
  StepResult,
  ExecutorConfig,
  ToolExecutor,
  DEFAULT_EXECUTOR_CONFIG,
} from './types.js';
import type { ToolSequence, SequenceStep } from '../planning/sequence-predictor.js';
import type { MCTSPlan } from '../planning/mcts/types.js';

const log = createLogger({ module: 'ftis:intelligent-executor' });

// ============================================================================
// INTELLIGENT EXECUTOR
// ============================================================================

export class IntelligentExecutor {
  private config: ExecutorConfig;
  private toolExecutor: ToolExecutor;
  private aggregator: ResultAggregator;

  // Execution statistics
  private totalExecutions = 0;
  private totalSuccesses = 0;
  private totalFailures = 0;
  private totalDurationMs = 0;

  constructor(toolExecutor: ToolExecutor, config: Partial<ExecutorConfig> = {}) {
    this.config = {
      maxParallelism: 5,
      defaultTimeoutMs: 10000,
      defaultRetryAttempts: 2,
      continueOnFailure: true,
      skipOptionalOnFailure: true,
      ...config,
    };
    this.toolExecutor = toolExecutor;
    this.aggregator = getResultAggregator();
  }

  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  /**
   * Execute a tool sequence from the sequence predictor
   */
  async executeSequence(sequence: ToolSequence): Promise<ExecutionResult> {
    const plan = this.convertSequenceToPlan(sequence);
    return this.executePlan(plan);
  }

  /**
   * Execute an MCTS plan
   */
  async executeMCTSPlan(mctsPlan: MCTSPlan): Promise<ExecutionResult> {
    const plan = this.convertMCTSPlanToPlan(mctsPlan);
    return this.executePlan(plan);
  }

  /**
   * Execute a list of tools directly
   */
  async executeTools(
    tools: string[],
    options?: {
      parallel?: boolean;
      args?: Record<string, Record<string, unknown>>;
    }
  ): Promise<ExecutionResult> {
    const plan = this.createSimplePlan(tools, options?.parallel ?? false, options?.args);
    return this.executePlan(plan);
  }

  /**
   * Execute a single tool
   */
  async executeTool(toolId: string, args: Record<string, unknown> = {}): Promise<StepResult> {
    const startTime = new Date();
    const result = await this.toolExecutor(toolId, args);
    const endTime = new Date();

    const stepResult: StepResult = {
      stepIndex: 0,
      toolId,
      success: result.success,
      data: result.data,
      error: result.error,
      durationMs: endTime.getTime() - startTime.getTime(),
      attempts: 1,
      startTime,
      endTime,
    };

    // Update stats
    this.totalExecutions++;
    if (result.success) {
      this.totalSuccesses++;
    } else {
      this.totalFailures++;
    }
    this.totalDurationMs += stepResult.durationMs;

    return stepResult;
  }

  /**
   * Execute a plan with parallel dispatch
   */
  async executePlan(plan: ExecutionPlan): Promise<ExecutionResult> {
    const startTime = Date.now();

    log.info(
      {
        stepCount: plan.steps.length,
        parallelGroups: plan.parallelGroups.length,
      },
      'Starting plan execution'
    );

    // Create dispatcher with callbacks
    const dispatcher = new ParallelDispatcher(
      {
        ...this.config,
        onStepComplete: (result) => {
          this.config.onStepComplete?.(result);

          // Update stats
          this.totalExecutions++;
          if (result.success) {
            this.totalSuccesses++;
          } else {
            this.totalFailures++;
          }
          this.totalDurationMs += result.durationMs;
        },
        onProgress: this.config.onProgress,
      },
      this.toolExecutor
    );

    // Execute all steps
    const results = await dispatcher.executeAll(plan.steps);

    // Calculate overall result
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter(
      (r) => !r.success && r.error !== 'Skipped due to failed dependency'
    ).length;
    const skippedCount = results.length - successCount - failureCount;
    const totalDuration = Date.now() - startTime;

    const executionResult: ExecutionResult = {
      results,
      success: failureCount === 0,
      totalDurationMs: totalDuration,
      successCount,
      failureCount,
      skippedCount,
      errors: results.filter((r) => r.error).map((r) => r.error!),
    };

    log.info(
      {
        success: executionResult.success,
        successCount,
        failureCount,
        skippedCount,
        durationMs: totalDuration,
      },
      'Plan execution complete'
    );

    return executionResult;
  }

  // ==========================================================================
  // AGGREGATION
  // ==========================================================================

  /**
   * Aggregate results into a coherent response
   */
  aggregateResults(results: StepResult[]): AggregatedResult {
    return this.aggregator.aggregate(results);
  }

  /**
   * Execute and aggregate in one step
   */
  async executeAndAggregate(plan: ExecutionPlan): Promise<{
    execution: ExecutionResult;
    aggregated: AggregatedResult;
  }> {
    const execution = await this.executePlan(plan);
    const aggregated = this.aggregateResults(execution.results);
    return { execution, aggregated };
  }

  // ==========================================================================
  // PLAN CONVERSION
  // ==========================================================================

  /**
   * Convert sequence predictor output to execution plan
   */
  private convertSequenceToPlan(sequence: ToolSequence): ExecutionPlan {
    const steps: ExecutionStep[] = sequence.steps.map((step, index) => ({
      toolId: step.toolId,
      args: {},
      dependencies: step.dependsOn,
      optional: step.optional,
      priority: sequence.steps.length - index, // Earlier steps have higher priority
      timeoutMs: this.config.defaultTimeoutMs,
      retry: {
        maxAttempts: this.config.defaultRetryAttempts,
        backoffMs: 1000,
      },
    }));

    // Compute parallel groups
    const parallelGroups = this.computeParallelGroups(steps);

    return {
      steps,
      parallelGroups,
      estimatedDurationMs: sequence.estimatedDurationMs,
      priority: 1,
    };
  }

  /**
   * Convert MCTS plan to execution plan
   */
  private convertMCTSPlanToPlan(mctsPlan: MCTSPlan): ExecutionPlan {
    const steps: ExecutionStep[] = mctsPlan.tools.map((toolId, index) => ({
      toolId,
      args: {},
      dependencies: index > 0 ? [index - 1] : [], // Sequential by default
      optional: false,
      priority: mctsPlan.tools.length - index,
      timeoutMs: this.config.defaultTimeoutMs,
      retry: {
        maxAttempts: this.config.defaultRetryAttempts,
        backoffMs: 1000,
      },
    }));

    return {
      steps,
      parallelGroups: steps.map((_, i) => [i]), // Sequential
      estimatedDurationMs: mctsPlan.estimatedDurationMs,
      priority: Math.floor(mctsPlan.confidence * 10),
    };
  }

  /**
   * Create a simple plan from tool list
   */
  private createSimplePlan(
    tools: string[],
    parallel: boolean,
    args?: Record<string, Record<string, unknown>>
  ): ExecutionPlan {
    const steps: ExecutionStep[] = tools.map((toolId, index) => ({
      toolId,
      args: args?.[toolId] || {},
      dependencies: parallel ? [] : index > 0 ? [index - 1] : [],
      optional: false,
      priority: tools.length - index,
      timeoutMs: this.config.defaultTimeoutMs,
      retry: {
        maxAttempts: this.config.defaultRetryAttempts,
        backoffMs: 1000,
      },
    }));

    const parallelGroups = parallel ? [tools.map((_, i) => i)] : tools.map((_, i) => [i]);

    return {
      steps,
      parallelGroups,
      estimatedDurationMs: parallel ? 500 : tools.length * 300,
      priority: 1,
    };
  }

  /**
   * Compute parallel groups from dependencies
   */
  private computeParallelGroups(steps: ExecutionStep[]): number[][] {
    const groups: number[][] = [];
    const assigned = new Set<number>();

    while (assigned.size < steps.length) {
      const group: number[] = [];

      for (let i = 0; i < steps.length; i++) {
        if (assigned.has(i)) continue;

        // Check if all dependencies are assigned
        const depsAssigned = steps[i].dependencies.every((d) => assigned.has(d));
        if (depsAssigned) {
          group.push(i);
        }
      }

      if (group.length === 0) {
        // Deadlock prevention
        log.warn('Could not assign more steps - possible circular dependency');
        break;
      }

      groups.push(group);
      group.forEach((i) => assigned.add(i));
    }

    return groups;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get executor statistics
   */
  getStats(): {
    totalExecutions: number;
    totalSuccesses: number;
    totalFailures: number;
    successRate: number;
    avgDurationMs: number;
  } {
    return {
      totalExecutions: this.totalExecutions,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      successRate: this.totalExecutions > 0 ? this.totalSuccesses / this.totalExecutions : 0,
      avgDurationMs: this.totalExecutions > 0 ? this.totalDurationMs / this.totalExecutions : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalExecutions = 0;
    this.totalSuccesses = 0;
    this.totalFailures = 0;
    this.totalDurationMs = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let executorInstance: IntelligentExecutor | null = null;

export function getIntelligentExecutor(
  toolExecutor?: ToolExecutor,
  config?: Partial<ExecutorConfig>
): IntelligentExecutor {
  if (!executorInstance) {
    if (!toolExecutor) {
      throw new Error('Tool executor required for first initialization');
    }
    executorInstance = new IntelligentExecutor(toolExecutor, config);
  }
  return executorInstance;
}

export function initializeIntelligentExecutor(
  toolExecutor: ToolExecutor,
  config?: Partial<ExecutorConfig>
): IntelligentExecutor {
  executorInstance = new IntelligentExecutor(toolExecutor, config);
  return executorInstance;
}

export function resetIntelligentExecutor(): void {
  executorInstance = null;
}
