/**
 * Safe Fire-and-Forget Utility
 *
 * Wraps async operations that should run without blocking the critical path,
 * with proper error handling to prevent unhandled promise rejections from
 * crashing the voice agent.
 *
 * PROBLEM: The voice agent has ~48 places where `void asyncFunction()` is called.
 * If any of these throw an unhandled error, it could crash the entire process.
 *
 * SOLUTION: This utility wraps those calls with:
 * - Error boundary (catch all errors)
 * - Structured logging
 * - Optional metrics tracking
 * - Timeout protection
 * - Deduplication for repeated failures
 *
 * @module utils/safe-fire-and-forget
 */

import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'SafeFireAndForget' });

// ============================================================================
// TYPES
// ============================================================================

export interface SafeFireAndForgetOptions {
  /** Context string for logging (e.g., 'pattern-detection', 'trust-recording') */
  context: string;
  /** Maximum execution time before logging a warning (default: 30000ms) */
  timeoutMs?: number;
  /** Whether to track this operation for metrics (default: true) */
  trackMetrics?: boolean;
  /** Whether to log success (default: false - only errors are logged) */
  logSuccess?: boolean;
  /** Critical level - if true, errors are logged as error instead of warn */
  critical?: boolean;
}

// ============================================================================
// METRICS TRACKING
// ============================================================================

interface FireAndForgetMetrics {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  byContext: Map<
    string,
    {
      calls: number;
      successes: number;
      failures: number;
      lastError?: string;
      lastErrorAt?: Date;
    }
  >;
}

const metrics: FireAndForgetMetrics = {
  totalCalls: 0,
  successCount: 0,
  failureCount: 0,
  timeoutCount: 0,
  byContext: new Map(),
};

// Deduplication: Don't spam logs for repeated failures of the same context
const recentFailures = new Map<string, { count: number; lastAt: number }>();
const FAILURE_DEDUP_WINDOW_MS = 60_000; // 1 minute window
const FAILURE_DEDUP_THRESHOLD = 5; // After 5 failures, batch log

function shouldLogFailure(context: string): boolean {
  const now = Date.now();
  const recent = recentFailures.get(context);

  if (!recent || now - recent.lastAt > FAILURE_DEDUP_WINDOW_MS) {
    // No recent failures or window expired
    recentFailures.set(context, { count: 1, lastAt: now });
    return true;
  }

  recent.count++;
  recent.lastAt = now;

  if (recent.count === FAILURE_DEDUP_THRESHOLD) {
    // Log a batch warning
    log.warn(
      { context, failureCount: recent.count, windowMs: FAILURE_DEDUP_WINDOW_MS },
      `Fire-and-forget "${context}" failing repeatedly - suppressing further logs`
    );
    return false;
  }

  // After threshold, only log every 10 failures
  if (recent.count > FAILURE_DEDUP_THRESHOLD) {
    return recent.count % 10 === 0;
  }

  return true;
}

// ============================================================================
// MAIN UTILITY
// ============================================================================

/**
 * Safely execute an async function without blocking the caller.
 *
 * This is a drop-in replacement for `void asyncFn()` that adds error handling.
 *
 * @example
 * // Before (dangerous - can crash process):
 * void processPatterns(userId, text);
 *
 * // After (safe):
 * safeFireAndForget(
 *   () => processPatterns(userId, text),
 *   { context: 'pattern-detection' }
 * );
 *
 * @example
 * // With all options:
 * safeFireAndForget(
 *   () => heavyAnalytics(data),
 *   {
 *     context: 'heavy-analytics',
 *     timeoutMs: 60000,
 *     critical: true,
 *     logSuccess: true,
 *   }
 * );
 */
export function safeFireAndForget(
  fn: () => Promise<unknown>,
  options: SafeFireAndForgetOptions
): void {
  const {
    context,
    timeoutMs = 30_000,
    trackMetrics = true,
    logSuccess = false,
    critical = false,
  } = options;

  if (trackMetrics) {
    metrics.totalCalls++;
    const contextMetrics = metrics.byContext.get(context) || {
      calls: 0,
      successes: 0,
      failures: 0,
    };
    contextMetrics.calls++;
    metrics.byContext.set(context, contextMetrics);
  }

  const startTime = Date.now();
  let timeoutId: NodeJS.Timeout | null = null;
  let didTimeout = false;

  // Set up timeout warning
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      if (trackMetrics) metrics.timeoutCount++;
      log.warn(
        { context, timeoutMs, elapsedMs: Date.now() - startTime },
        `Fire-and-forget "${context}" is taking longer than expected`
      );
    }, timeoutMs);
  }

  fn()
    .then(() => {
      if (timeoutId) clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;

      if (trackMetrics) {
        metrics.successCount++;
        const contextMetrics = metrics.byContext.get(context);
        if (contextMetrics) contextMetrics.successes++;
      }

      if (logSuccess) {
        log.debug({ context, durationMs, didTimeout }, `Fire-and-forget "${context}" completed`);
      }
    })
    .catch((error: unknown) => {
      if (timeoutId) clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (trackMetrics) {
        metrics.failureCount++;
        const contextMetrics = metrics.byContext.get(context);
        if (contextMetrics) {
          contextMetrics.failures++;
          contextMetrics.lastError = errorMessage;
          contextMetrics.lastErrorAt = new Date();
        }
      }

      // Log with deduplication
      if (shouldLogFailure(context)) {
        const logFn = critical ? log.error.bind(log) : log.warn.bind(log);
        logFn(
          {
            context,
            error: errorMessage,
            durationMs,
            didTimeout,
            stack:
              error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
          },
          `Fire-and-forget "${context}" failed (non-fatal)`
        );
      }
    });
}

/**
 * Convenience function for less critical operations.
 * Shorter name, default options.
 */
export function fireAndForget(fn: () => Promise<unknown>, context: string): void {
  safeFireAndForget(fn, { context });
}

/**
 * Create a wrapped version of an async function that's safe to fire-and-forget.
 *
 * @example
 * const safeProcessPatterns = createSafeFireAndForget(
 *   processPatterns,
 *   { context: 'pattern-detection' }
 * );
 *
 * // Now safe to call without awaiting:
 * safeProcessPatterns(userId, text);
 */
export function createSafeFireAndForget<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<unknown>,
  options: SafeFireAndForgetOptions
): (...args: TArgs) => void {
  return (...args: TArgs) => {
    safeFireAndForget(async () => fn(...args), options);
  };
}

// ============================================================================
// METRICS API
// ============================================================================

/**
 * Get current fire-and-forget metrics.
 */
export function getFireAndForgetMetrics(): {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  successRate: string;
  byContext: Array<{
    context: string;
    calls: number;
    successes: number;
    failures: number;
    lastError?: string;
    lastErrorAt?: Date;
  }>;
} {
  return {
    totalCalls: metrics.totalCalls,
    successCount: metrics.successCount,
    failureCount: metrics.failureCount,
    timeoutCount: metrics.timeoutCount,
    successRate:
      metrics.totalCalls > 0
        ? `${((metrics.successCount / metrics.totalCalls) * 100).toFixed(1)}%`
        : 'N/A',
    byContext: Array.from(metrics.byContext.entries()).map(([context, data]) => ({
      context,
      ...data,
    })),
  };
}

/**
 * Reset metrics (useful for testing).
 */
export function resetFireAndForgetMetrics(): void {
  metrics.totalCalls = 0;
  metrics.successCount = 0;
  metrics.failureCount = 0;
  metrics.timeoutCount = 0;
  metrics.byContext.clear();
  recentFailures.clear();
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Execute multiple fire-and-forget operations in parallel.
 *
 * @example
 * batchFireAndForget([
 *   { fn: () => processPatterns(userId, text), context: 'patterns' },
 *   { fn: () => recordTrust(userId, signal), context: 'trust' },
 *   { fn: () => trackQuality(response), context: 'quality' },
 * ]);
 */
export function batchFireAndForget(
  operations: Array<{
    fn: () => Promise<unknown>;
    context: string;
    options?: Omit<SafeFireAndForgetOptions, 'context'>;
  }>
): void {
  for (const op of operations) {
    safeFireAndForget(op.fn, { context: op.context, ...op.options });
  }
}

// ============================================================================
// GLOBAL ERROR HANDLER REGISTRATION
// ============================================================================

let globalHandlerRegistered = false;

/**
 * Register global handlers for unhandled rejections.
 * Call this once at application startup.
 *
 * This is a safety net for any `void promise` calls we might have missed.
 */
export function registerGlobalErrorHandlers(): void {
  if (globalHandlerRegistered) return;
  globalHandlerRegistered = true;

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    log.error(
      {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack:
          reason instanceof Error ? reason.stack?.split('\n').slice(0, 5).join('\n') : undefined,
        promise: String(promise),
      },
      '⚠️ Unhandled promise rejection caught by global handler (NOT crashing)'
    );

    // Track in metrics
    metrics.failureCount++;
    const contextMetrics = metrics.byContext.get('_unhandled_') || {
      calls: 0,
      successes: 0,
      failures: 0,
    };
    contextMetrics.calls++;
    contextMetrics.failures++;
    contextMetrics.lastError = reason instanceof Error ? reason.message : String(reason);
    contextMetrics.lastErrorAt = new Date();
    metrics.byContext.set('_unhandled_', contextMetrics);
  });

  // Handle uncaught exceptions - these are more serious
  process.on('uncaughtException', (error) => {
    log.error(
      {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 10).join('\n'),
        name: error.name,
      },
      '🚨 Uncaught exception - this may indicate a bug'
    );

    // For uncaught exceptions, we might want to exit gracefully
    // but for now we just log and continue (voice call in progress)
  });

  log.info('Global error handlers registered for fire-and-forget safety');
}
