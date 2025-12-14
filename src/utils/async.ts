/**
 * Async Utilities
 *
 * Common async patterns for the Ferni codebase:
 * - Debouncing async functions
 * - Throttling async functions
 * - Promise timeouts
 * - Retry with backoff
 * - Parallel execution with limits
 *
 * @module utils/async
 */

import { getLogger } from './safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms between retries (default: 30000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Whether to add jitter to delays (default: true) */
  jitter?: boolean;
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Callback on each retry */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

export interface ThrottleOptions {
  /** Whether to call on leading edge (default: true) */
  leading?: boolean;
  /** Whether to call on trailing edge (default: true) */
  trailing?: boolean;
}

// ============================================================================
// DEBOUNCE ASYNC
// ============================================================================

/**
 * Debounce an async function - only execute after delay with no new calls.
 *
 * Unlike regular debounce, this properly handles promises and cancellation.
 *
 * @example
 * const debouncedSearch = debounceAsync(async (query: string) => {
 *   return await searchAPI(query);
 * }, 300);
 *
 * // Only the last call within 300ms will execute
 * debouncedSearch('h');
 * debouncedSearch('he');
 * debouncedSearch('hel');
 * const results = await debouncedSearch('hello'); // Only this executes
 */
export function debounceAsync<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  delayMs: number
): ((...args: TArgs) => Promise<TResult>) & {
  cancel: () => void;
  flush: () => Promise<TResult | undefined>;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingPromise: Promise<TResult> | null = null;
  let pendingResolve: ((value: TResult) => void) | null = null;
  let pendingReject: ((error: Error) => void) | null = null;
  let lastArgs: TArgs | null = null;

  const debounced = (async (...args: TArgs): Promise<TResult> => {
    lastArgs = args;

    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Return existing promise if one is pending
    if (pendingPromise) {
      return pendingPromise;
    }

    // Create new promise
    pendingPromise = new Promise<TResult>((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
    });

    timeoutId = setTimeout(async () => {
      const currentArgs = lastArgs;
      const currentResolve = pendingResolve;
      const currentReject = pendingReject;

      // Reset state
      timeoutId = null;
      pendingPromise = null;
      pendingResolve = null;
      pendingReject = null;
      lastArgs = null;

      try {
        const result = await fn(...(currentArgs as TArgs));
        currentResolve?.(result);
      } catch (error) {
        currentReject?.(error instanceof Error ? error : new Error(String(error)));
      }
    }, delayMs);

    return pendingPromise;
  }) as ((...args: TArgs) => Promise<TResult>) & {
    cancel: () => void;
    flush: () => Promise<TResult | undefined>;
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (pendingReject) {
      pendingReject(new Error('Debounced function cancelled'));
    }
    pendingPromise = null;
    pendingResolve = null;
    pendingReject = null;
    lastArgs = null;
  };

  debounced.flush = async (): Promise<TResult | undefined> => {
    if (timeoutId && lastArgs) {
      clearTimeout(timeoutId);
      timeoutId = null;
      const args = lastArgs;
      lastArgs = null;
      return fn(...args);
    }
    return undefined;
  };

  return debounced;
}

// ============================================================================
// THROTTLE ASYNC
// ============================================================================

/**
 * Throttle an async function - limit execution to once per interval.
 *
 * @example
 * const throttledSave = throttleAsync(async (data) => {
 *   await saveToServer(data);
 * }, 1000);
 *
 * // First call executes immediately, subsequent calls within 1s are queued
 * await throttledSave({ a: 1 });
 * await throttledSave({ a: 2 }); // Waits ~1s
 */
export function throttleAsync<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  intervalMs: number,
  options: ThrottleOptions = {}
): ((...args: TArgs) => Promise<TResult>) & { cancel: () => void } {
  const { leading = true, trailing = true } = options;

  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: TArgs | null = null;
  let pendingPromise: Promise<TResult> | null = null;

  const throttled = (async (...args: TArgs): Promise<TResult> => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    // If enough time has passed, execute immediately (if leading)
    if (timeSinceLastCall >= intervalMs && leading) {
      lastCallTime = now;
      return fn(...args);
    }

    // Store args for trailing call
    lastArgs = args;

    // If no pending timeout, set one
    if (!timeoutId && trailing) {
      const remaining = intervalMs - timeSinceLastCall;

      pendingPromise = new Promise<TResult>((resolve, reject) => {
        timeoutId = setTimeout(async () => {
          timeoutId = null;
          lastCallTime = Date.now();

          if (lastArgs) {
            const currentArgs = lastArgs;
            lastArgs = null;
            try {
              const result = await fn(...currentArgs);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }
        }, remaining);
      });
    }

    return pendingPromise || Promise.resolve(undefined as unknown as TResult);
  }) as ((...args: TArgs) => Promise<TResult>) & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
    pendingPromise = null;
  };

  return throttled;
}

// ============================================================================
// TIMEOUT
// ============================================================================

/**
 * Error thrown when a promise times out.
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with a timeout.
 *
 * @example
 * try {
 *   const result = await withTimeout(fetchData(), 5000, 'Data fetch');
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log('Request timed out');
 *   }
 * }
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName = 'Operation'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// ============================================================================
// RETRY
// ============================================================================

/**
 * Default retry condition - retry on network-like errors.
 */
const DEFAULT_RETRYABLE_ERRORS = [
  /timeout/i,
  /network/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /socket hang up/i,
  /fetch failed/i,
  /temporarily unavailable/i,
  /rate limit/i,
  /429/,
  /502/,
  /503/,
  /504/,
];

function isRetryableError(error: Error): boolean {
  const errorStr = `${error.name} ${error.message}`;
  return DEFAULT_RETRYABLE_ERRORS.some((pattern) => pattern.test(errorStr));
}

/**
 * Retry an async function with exponential backoff.
 *
 * @example
 * const result = await retry(
 *   () => fetchFromUnreliableAPI(),
 *   {
 *     maxRetries: 3,
 *     initialDelay: 1000,
 *     onRetry: (err, attempt) => console.log(`Retry ${attempt}: ${err.message}`)
 *   }
 * );
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
    shouldRetry = isRetryableError,
    onRetry,
  } = options;

  const log = getLogger();
  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!shouldRetry(lastError, attempt)) {
        break;
      }

      // Calculate delay with optional jitter
      let actualDelay = Math.min(delay, maxDelay);
      if (jitter) {
        actualDelay = actualDelay * (0.5 + Math.random()); // 50-150% of delay
      }

      // Callback before retry
      onRetry?.(lastError, attempt + 1, actualDelay);
      log.debug(
        { attempt: attempt + 1, delay: actualDelay, error: lastError.message },
        'Retrying after error'
      );

      // Wait before retry
      await sleep(actualDelay);

      // Increase delay for next attempt
      delay = delay * backoffMultiplier;
    }
  }

  throw lastError!;
}

// ============================================================================
// PARALLEL EXECUTION
// ============================================================================

/**
 * Execute promises in parallel with a concurrency limit.
 *
 * @example
 * const urls = ['url1', 'url2', 'url3', 'url4', 'url5'];
 * const results = await parallelLimit(
 *   urls.map(url => () => fetch(url)),
 *   2 // Max 2 concurrent requests
 * );
 */
export async function parallelLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Array<Promise<void>> = [];

  for (const [index, task] of tasks.entries()) {
    const promise = task().then((result) => {
      results[index] = result;
    });

    executing.push(promise);

    // If we've hit the limit, wait for one to complete
    if (executing.length >= limit) {
      await Promise.race(executing);
      // Remove completed promises
      const newExecuting: Array<Promise<void>> = [];
      for (const p of executing) {
        // Check if promise is still pending by racing with resolved promise
        const isPending = await Promise.race([
          p.then(() => false).catch(() => false),
          Promise.resolve(true),
        ]);
        if (isPending) {
          newExecuting.push(p);
        }
      }
      executing.length = 0;
      executing.push(...newExecuting);
    }
  }

  // Wait for remaining tasks
  await Promise.all(executing);
  return results;
}

/**
 * Execute promises in sequence (one at a time).
 *
 * @example
 * const tasks = [() => step1(), () => step2(), () => step3()];
 * const results = await sequence(tasks);
 */
export async function sequence<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  const results: T[] = [];
  for (const task of tasks) {
    results.push(await task());
  }
  return results;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sleep for a given number of milliseconds.
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise (resolve/reject from outside).
 */
export function defer<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Wait for a condition to become true.
 *
 * @example
 * await waitFor(() => document.querySelector('.loaded') !== null, {
 *   timeout: 5000,
 *   interval: 100,
 * });
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 10000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }

  throw new TimeoutError(`Condition not met within ${timeout}ms`, timeout);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  debounceAsync,
  throttleAsync,
  withTimeout,
  retry,
  parallelLimit,
  sequence,
  sleep,
  defer,
  waitFor,
  TimeoutError,
};
