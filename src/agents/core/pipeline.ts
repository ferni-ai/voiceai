/**
 * Pipeline Infrastructure
 *
 * Composable pipeline pattern for session and turn processing.
 * Each step is a focused unit that can be tested independently.
 *
 * @module agents/core/pipeline
 */

import { PipelineStepError, wrapError } from './errors.js';
import { type Result, err, ok } from './result.js';
import type { Logger } from './types.js';

// ============================================================================
// PIPELINE STEP INTERFACE
// ============================================================================

/**
 * A single step in a processing pipeline.
 * Each step receives context and returns updated context or error.
 */
export interface PipelineStep<TContext, TResult = TContext> {
  /** Unique name for logging and debugging */
  readonly name: string;

  /** Execute the step */
  execute(context: TContext, logger: Logger): Promise<Result<TResult>>;

  /** Optional: Check if step should be skipped */
  shouldSkip?(context: TContext): boolean;

  /** Optional: Cleanup on error */
  cleanup?(context: TContext, error: Error): Promise<void>;
}

/**
 * Step execution options.
 */
export interface StepOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to continue on error (step becomes optional) */
  optional?: boolean;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier?: number;
  };
}

// ============================================================================
// PIPELINE CLASS
// ============================================================================

/**
 * Composable pipeline that executes steps in sequence.
 *
 * @example
 * ```ts
 * const pipeline = new Pipeline<SessionContext>('session-setup')
 *   .add(new IdentifyUserStep())
 *   .add(new LoadPersonaStep())
 *   .add(new ConnectRoomStep(), { timeoutMs: 30000 })
 *   .add(new SetupHandlersStep());
 *
 * const result = await pipeline.execute(initialContext, logger);
 * ```
 */
export class Pipeline<TContext> {
  readonly name: string;
  private steps: Array<{ step: PipelineStep<TContext>; options: StepOptions }> = [];

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Add a step to the pipeline.
   */
  add(step: PipelineStep<TContext>, options: StepOptions = {}): this {
    this.steps.push({ step, options });
    return this;
  }

  /**
   * Execute all steps in sequence.
   */
  async execute(
    initialContext: TContext,
    logger: Logger
  ): Promise<Result<TContext, PipelineStepError>> {
    let context = initialContext;
    const startTime = Date.now();

    logger.info(`Pipeline "${this.name}" starting`, { stepCount: this.steps.length });

    for (let i = 0; i < this.steps.length; i++) {
      const { step, options } = this.steps[i];

      // Check if step should be skipped
      if (step.shouldSkip?.(context)) {
        logger.debug(`Step "${step.name}" skipped`);
        continue;
      }

      const stepStart = Date.now();
      logger.debug(`Step "${step.name}" starting`, { index: i });

      try {
        const result = await this.executeStep(step, context, logger, options, i);

        if (!result.ok) {
          // If step is optional, log and continue
          if (options.optional) {
            logger.warn(`Optional step "${step.name}" failed`, { error: result.error.message });
            continue;
          }

          // Non-optional step failed
          logger.error(`Step "${step.name}" failed`, result.error);
          return result;
        }

        context = result.value;
        logger.debug(`Step "${step.name}" completed`, { durationMs: Date.now() - stepStart });
      } catch (error) {
        const wrapped = wrapError(error);
        const stepError = new PipelineStepError(step.name, i, wrapped.message, {
          cause: wrapped,
          recoverable: options.optional ?? false,
        });

        if (options.optional) {
          logger.warn(`Optional step "${step.name}" threw`, { error: wrapped.message });
          continue;
        }

        logger.error(`Step "${step.name}" threw`, wrapped);
        return err(stepError);
      }
    }

    logger.info(`Pipeline "${this.name}" completed`, {
      durationMs: Date.now() - startTime,
      stepCount: this.steps.length,
    });

    return ok(context);
  }

  /**
   * Execute a single step with timeout and retry.
   */
  private async executeStep(
    step: PipelineStep<TContext>,
    context: TContext,
    logger: Logger,
    options: StepOptions,
    index: number
  ): Promise<Result<TContext, PipelineStepError>> {
    const { timeoutMs, retry } = options;

    // Wrap execution with timeout
    const executeWithTimeout = async (): Promise<Result<TContext>> => {
      if (!timeoutMs) {
        return step.execute(context, logger);
      }

      return Promise.race([
        step.execute(context, logger),
        new Promise<Result<TContext>>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Step "${step.name}" timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        }),
      ]);
    };

    // Execute with retries
    if (retry) {
      let lastError: Error | null = null;
      let delay = retry.delayMs;

      for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
        try {
          const result = await executeWithTimeout();
          if (result.ok) {
            return result;
          }
          lastError = new Error(String(result.error));
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
        }

        if (attempt < retry.maxAttempts) {
          logger.debug(`Step "${step.name}" retrying`, { attempt, delayMs: delay });
          await sleep(delay);
          delay *= retry.backoffMultiplier ?? 1;
        }
      }

      return err(
        new PipelineStepError(step.name, index, `Failed after ${retry.maxAttempts} attempts`, {
          cause: lastError ?? undefined,
        })
      );
    }

    // Single execution
    try {
      const result = await executeWithTimeout();
      if (!result.ok) {
        return err(new PipelineStepError(step.name, index, String(result.error)));
      }
      return result;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(new PipelineStepError(step.name, index, error.message, { cause: error }));
    }
  }

  /**
   * Get step names for debugging.
   */
  getStepNames(): string[] {
    return this.steps.map((s) => s.step.name);
  }
}

// ============================================================================
// BASE STEP CLASSES
// ============================================================================

/**
 * Base class for pipeline steps with common functionality.
 */
export abstract class BaseStep<TContext, TResult = TContext> implements PipelineStep<
  TContext,
  TResult
> {
  abstract readonly name: string;
  abstract execute(context: TContext, logger: Logger): Promise<Result<TResult>>;

  shouldSkip?(_context: TContext): boolean;
  cleanup?(_context: TContext, _error: Error): Promise<void>;
}

/**
 * Step that transforms context (input and output are the same type).
 */
export abstract class TransformStep<TContext> extends BaseStep<TContext, TContext> {}

/**
 * Step that performs a side effect without modifying context.
 */
export abstract class SideEffectStep<TContext> extends BaseStep<TContext, TContext> {
  async execute(context: TContext, logger: Logger): Promise<Result<TContext>> {
    const result = await this.perform(context, logger);
    if (!result.ok) {
      return result;
    }
    return ok(context);
  }

  protected abstract perform(context: TContext, logger: Logger): Promise<Result<void>>;
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a simple step from a function.
 */
export function createStep<TContext>(
  name: string,
  execute: (context: TContext, logger: Logger) => Promise<Result<TContext>>
): PipelineStep<TContext> {
  return { name, execute };
}

/**
 * Create an optional step that logs and continues on failure.
 */
export function optionalStep<TContext>(step: PipelineStep<TContext>): {
  step: PipelineStep<TContext>;
  options: StepOptions;
} {
  return { step, options: { optional: true } };
}

/**
 * Create a step with timeout.
 */
export function withTimeout<TContext>(
  step: PipelineStep<TContext>,
  timeoutMs: number
): { step: PipelineStep<TContext>; options: StepOptions } {
  return { step, options: { timeoutMs } };
}

/**
 * Create a step with retry.
 */
export function withRetry<TContext>(
  step: PipelineStep<TContext>,
  maxAttempts: number,
  delayMs: number = 1000
): { step: PipelineStep<TContext>; options: StepOptions } {
  return { step, options: { retry: { maxAttempts, delayMs } } };
}
