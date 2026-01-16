/**
 * Parallel Dispatcher
 *
 * Dispatches tool executions in parallel while respecting dependencies.
 *
 * @module tools/intelligence/execution/parallel-dispatcher
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  ExecutionStep,
  StepResult,
  StepStatus,
  ExecutorConfig,
  ToolExecutor,
} from './types.js';

const log = createLogger({ module: 'ftis:parallel-dispatcher' });

// ============================================================================
// PARALLEL DISPATCHER
// ============================================================================

export class ParallelDispatcher {
  private config: ExecutorConfig;
  private executor: ToolExecutor;

  // Execution state
  private stepStatus = new Map<number, StepStatus>();
  private stepResults = new Map<number, StepResult>();
  private runningCount = 0;

  constructor(config: ExecutorConfig, executor: ToolExecutor) {
    this.config = config;
    this.executor = executor;
  }

  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  /**
   * Execute all steps in the plan
   */
  async executeAll(steps: ExecutionStep[]): Promise<StepResult[]> {
    this.reset();

    // Initialize all steps as pending
    for (let i = 0; i < steps.length; i++) {
      this.stepStatus.set(i, 'pending');
    }

    const startTime = Date.now();
    const totalSteps = steps.length;
    let completedSteps = 0;

    // Keep dispatching until all done
    while (completedSteps < totalSteps) {
      // Find steps ready to run
      const ready = this.findReadySteps(steps);

      if (ready.length === 0) {
        // No steps ready - check if we're blocked
        const hasRunning = Array.from(this.stepStatus.values()).some(
          (s) => s === 'running' || s === 'waiting'
        );

        if (!hasRunning) {
          // Deadlock or all done
          log.warn('No steps ready and none running - possible deadlock');
          break;
        }

        // Wait for running steps to complete
        await this.waitForAnyCompletion();
        continue;
      }

      // Dispatch ready steps (up to parallelism limit)
      const toDispatch = ready.slice(0, this.config.maxParallelism - this.runningCount);

      for (const stepIndex of toDispatch) {
        this.dispatchStep(steps[stepIndex], stepIndex);
      }

      // Wait for at least one to complete
      await this.waitForAnyCompletion();

      // Update completed count
      completedSteps = Array.from(this.stepStatus.values()).filter(
        (s) => s === 'completed' || s === 'failed' || s === 'skipped'
      ).length;

      // Progress callback
      this.config.onProgress?.(completedSteps, totalSteps);
    }

    log.info({ totalSteps, durationMs: Date.now() - startTime }, 'Parallel dispatch complete');

    // Return results in order
    return steps.map((_, i) => this.stepResults.get(i)!).filter(Boolean);
  }

  // ==========================================================================
  // STEP MANAGEMENT
  // ==========================================================================

  /**
   * Find steps that are ready to run
   */
  private findReadySteps(steps: ExecutionStep[]): number[] {
    const ready: number[] = [];

    for (let i = 0; i < steps.length; i++) {
      const status = this.stepStatus.get(i);
      if (status !== 'pending') continue;

      const step = steps[i];

      // Check dependencies
      const depsResolved = step.dependencies.every((depIdx) => {
        const depStatus = this.stepStatus.get(depIdx);
        return depStatus === 'completed' || depStatus === 'skipped';
      });

      // Check for failed dependencies (optional steps)
      const depsFailed = step.dependencies.some((depIdx) => {
        return this.stepStatus.get(depIdx) === 'failed';
      });

      if (depsFailed && step.optional && this.config.skipOptionalOnFailure) {
        // Skip optional step if dependency failed
        this.stepStatus.set(i, 'skipped');
        this.stepResults.set(i, {
          stepIndex: i,
          toolId: step.toolId,
          success: false,
          error: 'Skipped due to failed dependency',
          durationMs: 0,
          attempts: 0,
          startTime: new Date(),
          endTime: new Date(),
        });
        continue;
      }

      if (depsFailed && !this.config.continueOnFailure) {
        // Abort on failure
        this.stepStatus.set(i, 'skipped');
        continue;
      }

      if (depsResolved) {
        ready.push(i);
      }
    }

    // Sort by priority (higher first)
    ready.sort((a, b) => steps[b].priority - steps[a].priority);

    return ready;
  }

  /**
   * Dispatch a step for execution
   */
  private dispatchStep(step: ExecutionStep, stepIndex: number): void {
    this.stepStatus.set(stepIndex, 'running');
    this.runningCount++;

    const startTime = new Date();

    // Execute with retry and timeout
    this.executeWithRetry(step, stepIndex)
      .then((result) => {
        const endTime = new Date();
        const stepResult: StepResult = {
          stepIndex,
          toolId: step.toolId,
          success: result.success,
          data: result.data,
          error: result.error,
          durationMs: endTime.getTime() - startTime.getTime(),
          attempts: result.attempts,
          startTime,
          endTime,
        };

        this.stepResults.set(stepIndex, stepResult);
        this.stepStatus.set(stepIndex, result.success ? 'completed' : 'failed');
        this.runningCount--;

        // Callback
        this.config.onStepComplete?.(stepResult);
      })
      .catch((error) => {
        const endTime = new Date();
        const stepResult: StepResult = {
          stepIndex,
          toolId: step.toolId,
          success: false,
          error: String(error),
          durationMs: endTime.getTime() - startTime.getTime(),
          attempts: step.retry.maxAttempts,
          startTime,
          endTime,
        };

        this.stepResults.set(stepIndex, stepResult);
        this.stepStatus.set(stepIndex, 'failed');
        this.runningCount--;

        this.config.onStepComplete?.(stepResult);
      });
  }

  /**
   * Execute step with retry and timeout
   */
  private async executeWithRetry(
    step: ExecutionStep,
    stepIndex: number
  ): Promise<{ success: boolean; data?: unknown; error?: string; attempts: number }> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= step.retry.maxAttempts; attempt++) {
      try {
        // Execute with timeout
        const result = await Promise.race([
          this.executor(step.toolId, step.args || {}),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), step.timeoutMs)
          ),
        ]);

        if (result.success) {
          return { ...result, attempts: attempt };
        }

        lastError = result.error;
      } catch (error) {
        lastError = String(error);
        log.debug(
          { stepIndex, tool: step.toolId, attempt, error: lastError },
          'Step execution attempt failed'
        );
      }

      // Wait before retry (if not last attempt)
      if (attempt < step.retry.maxAttempts) {
        await this.delay(step.retry.backoffMs * attempt);
      }
    }

    return {
      success: false,
      error: lastError || 'Max retries exceeded',
      attempts: step.retry.maxAttempts,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Wait for any running step to complete
   */
  private async waitForAnyCompletion(): Promise<void> {
    // Simple polling - in production could use events
    while (this.runningCount > 0) {
      await this.delay(10);

      // Check if any status changed from running
      const stillRunning = Array.from(this.stepStatus.values()).filter(
        (s) => s === 'running'
      ).length;

      if (stillRunning < this.runningCount) {
        this.runningCount = stillRunning;
        return;
      }
    }
  }

  /**
   * Delay helper
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset state for new execution
   */
  private reset(): void {
    this.stepStatus.clear();
    this.stepResults.clear();
    this.runningCount = 0;
  }

  /**
   * Get current status
   */
  getStatus(): Map<number, StepStatus> {
    return new Map(this.stepStatus);
  }

  /**
   * Get current results
   */
  getResults(): Map<number, StepResult> {
    return new Map(this.stepResults);
  }
}
