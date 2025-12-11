/**
 * Base Scheduled Job
 *
 * Abstract base class for scheduled jobs that provides:
 * - Consistent logging and metrics
 * - Error handling patterns
 * - Configuration management
 * - Dry run support
 */

import { createLogger, type FallbackLogger } from '../../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Base configuration for all scheduled jobs.
 */
export interface BaseJobConfig {
  /** Whether to dry run (log but don't execute) */
  dryRun: boolean;
  /** Job timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to collect metrics */
  collectMetrics?: boolean;
}

/**
 * Base result from all scheduled jobs.
 */
export interface BaseJobResult {
  /** When the job started */
  startedAt: Date;
  /** When the job completed */
  completedAt: Date;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Whether the job was a dry run */
  wasDryRun: boolean;
  /** Number of items processed */
  itemsProcessed: number;
  /** Number of successful operations */
  successCount: number;
  /** Number of skipped operations */
  skippedCount: number;
  /** Number of errors */
  errorCount: number;
}

/**
 * Job execution context.
 */
export interface JobContext {
  /** Job start time */
  startedAt: Date;
  /** Logger for this execution */
  log: FallbackLogger;
  /** Whether this is a dry run */
  isDryRun: boolean;
  /** Counters for tracking */
  counters: {
    processed: number;
    success: number;
    skipped: number;
    errors: number;
  };
}

// ============================================================================
// BASE JOB CLASS
// ============================================================================

/**
 * Abstract base class for scheduled jobs.
 *
 * @example
 * ```typescript
 * class MyJob extends ScheduledJob<MyConfig, MyResult> {
 *   name = 'MyJob';
 *   defaultConfig = { dryRun: false, maxItems: 100 };
 *
 *   async execute(config: MyConfig, ctx: JobContext): Promise<MyResult> {
 *     const items = await this.getItems(config.maxItems);
 *
 *     for (const item of items) {
 *       ctx.counters.processed++;
 *
 *       if (config.dryRun) {
 *         ctx.log.info({ item }, 'DRY RUN: Would process');
 *         ctx.counters.skipped++;
 *         continue;
 *       }
 *
 *       try {
 *         await this.processItem(item);
 *         ctx.counters.success++;
 *       } catch (error) {
 *         ctx.counters.errors++;
 *         ctx.log.error({ error, item }, 'Failed to process');
 *       }
 *     }
 *
 *     return { items: items.length };
 *   }
 * }
 * ```
 */
export abstract class ScheduledJob<
  TConfig extends BaseJobConfig = BaseJobConfig,
  TResult extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Job name for logging */
  abstract readonly name: string;

  /** Default configuration */
  abstract readonly defaultConfig: TConfig;

  /** Logger instance */
  protected log: FallbackLogger;

  constructor() {
    this.log = createLogger({ module: this.constructor.name });
  }

  /**
   * Execute the job logic.
   * Implement this in subclasses.
   */
  protected abstract execute(config: TConfig, ctx: JobContext): Promise<TResult>;

  /**
   * Run the job with full lifecycle management.
   */
  async run(config?: Partial<TConfig>): Promise<BaseJobResult & TResult> {
    const fullConfig = { ...this.defaultConfig, ...config } as TConfig;
    const startedAt = new Date();

    const ctx: JobContext = {
      startedAt,
      log: this.log,
      isDryRun: fullConfig.dryRun,
      counters: {
        processed: 0,
        success: 0,
        skipped: 0,
        errors: 0,
      },
    };

    this.log.info(
      { config: this.sanitizeConfig(fullConfig), dryRun: fullConfig.dryRun },
      `🚀 Starting ${this.name}`
    );

    try {
      // Execute with optional timeout
      let result: TResult;

      if (fullConfig.timeoutMs) {
        result = await this.executeWithTimeout(fullConfig, ctx, fullConfig.timeoutMs);
      } else {
        result = await this.execute(fullConfig, ctx);
      }

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      const baseResult: BaseJobResult = {
        startedAt,
        completedAt,
        durationMs,
        wasDryRun: fullConfig.dryRun,
        itemsProcessed: ctx.counters.processed,
        successCount: ctx.counters.success,
        skippedCount: ctx.counters.skipped,
        errorCount: ctx.counters.errors,
      };

      this.log.info(
        {
          durationMs,
          ...ctx.counters,
        },
        `✅ ${this.name} completed`
      );

      return { ...baseResult, ...result };
    } catch (error) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      this.log.error({ error, durationMs }, `❌ ${this.name} failed`);

      throw error;
    }
  }

  /**
   * Execute with timeout.
   */
  private async executeWithTimeout(
    config: TConfig,
    ctx: JobContext,
    timeoutMs: number
  ): Promise<TResult> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${this.name} timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    return Promise.race([this.execute(config, ctx), timeoutPromise]);
  }

  /**
   * Sanitize config for logging (remove sensitive data).
   * Override in subclasses if needed.
   */
  protected sanitizeConfig(config: TConfig): Partial<TConfig> {
    // By default, remove any fields with 'key', 'secret', 'password', 'token'
    const sanitized: Partial<TConfig> = {};

    for (const [key, value] of Object.entries(config)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('key') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('token')
      ) {
        (sanitized as Record<string, unknown>)[key] = '[REDACTED]';
      } else {
        (sanitized as Record<string, unknown>)[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Helper to process items in batches.
   */
  protected async processBatch<T>(
    items: T[],
    processor: (item: T, index: number) => Promise<void>,
    ctx: JobContext,
    options?: { batchSize?: number; delayBetweenBatches?: number }
  ): Promise<void> {
    const { batchSize = 10, delayBetweenBatches = 100 } = options ?? {};

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (item, batchIndex) => {
          try {
            await processor(item, i + batchIndex);
            ctx.counters.success++;
          } catch (error) {
            ctx.counters.errors++;
            ctx.log.error({ error, itemIndex: i + batchIndex }, 'Batch item failed');
          }
          ctx.counters.processed++;
        })
      );

      // Delay between batches to avoid overwhelming resources
      if (i + batchSize < items.length && delayBetweenBatches > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }
    }
  }

  /**
   * Helper to check if we're in quiet hours.
   */
  protected isQuietHours(quietHours: { start: number; end: number }): boolean {
    const hour = new Date().getHours();
    const { start, end } = quietHours;

    // Handle overnight quiet hours (e.g., 22-8)
    if (start > end) {
      return hour >= start || hour < end;
    }
    return hour >= start && hour < end;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a simple job runner function.
 */
export function createJobRunner<TConfig extends BaseJobConfig, TResult extends Record<string, unknown>>(
  JobClass: new () => ScheduledJob<TConfig, TResult>
): (config?: Partial<TConfig>) => Promise<BaseJobResult & TResult> {
  return async (config) => {
    const job = new JobClass();
    return job.run(config);
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ScheduledJob,
  createJobRunner,
};

