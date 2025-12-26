/**
 * Result Type Pattern for Memory Operations
 *
 * Provides type-safe error handling for expected failures in memory operations.
 * Distinguishes between recoverable errors (use Result) and unexpected failures (throw).
 *
 * Philosophy: Memory operations can fail for many expected reasons (network, rate limits,
 * missing data). Rather than throwing everywhere, we use Result types to make
 * error handling explicit and composable.
 */

// ============================================================================
// CORE RESULT TYPE
// ============================================================================

/**
 * A Result type that represents either success or failure
 *
 * @example
 * const result = await embedSafe("hello");
 * if (result.ok) {
 *   // result.value is number[]
 *   processEmbedding(result.value);
 * } else {
 *   // result.error is MemoryError
 *   log.error({ error: result.error }, 'Embedding failed');
 * }
 */
export type Result<T, E = MemoryError> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a successful result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create a failed result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Base memory error type
 */
export interface MemoryError {
  type: MemoryErrorType;
  message: string;
  recoverable: boolean;
  retryable: boolean;
  context?: Record<string, unknown>;
  cause?: Error;
}

/**
 * Memory error type enumeration
 */
export type MemoryErrorType =
  | 'embedding_failed'
  | 'store_unavailable'
  | 'document_not_found'
  | 'validation_failed'
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'dimension_mismatch'
  | 'consolidation_failed'
  | 'deduplication_failed'
  | 'serialization_failed'
  | 'unknown';

/**
 * Create a memory error
 */
export function memoryError(
  type: MemoryErrorType,
  message: string,
  options?: {
    recoverable?: boolean;
    retryable?: boolean;
    context?: Record<string, unknown>;
    cause?: Error;
  }
): MemoryError {
  return {
    type,
    message,
    recoverable: options?.recoverable ?? true,
    retryable: options?.retryable ?? false,
    context: options?.context,
    cause: options?.cause,
  };
}

// ============================================================================
// RESULT UTILITIES
// ============================================================================

/**
 * Map over a successful result
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (!result.ok) {
    return err((result as { ok: false; error: E }).error);
  }
  return ok(fn((result as { ok: true; value: T }).value));
}

/**
 * Map over a failed result
 */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return err(fn((result as { ok: false; error: E }).error));
  }
  return ok((result as { ok: true; value: T }).value);
}

/**
 * Chain results together (flatMap)
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn((result as { ok: true; value: T }).value);
  }
  return err((result as { ok: false; error: E }).error);
}

/**
 * Provide a fallback value for a failed result
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Throw if error, otherwise return value
 */
export function unwrap<T, E extends { message: string }>(result: Result<T, E>): T {
  if (result.ok) {
    return (result as { ok: true; value: T }).value;
  }
  throw new Error((result as { ok: false; error: E }).error.message);
}

/**
 * Check if result is ok
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/**
 * Check if result is error
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Combine multiple results into a single result
 * Returns first error if any fail, otherwise array of values
 */
export function all<T, E>(results: Array<Result<T, E>>): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return err((result as { ok: false; error: E }).error);
    }
    values.push((result as { ok: true; value: T }).value);
  }
  return ok(values);
}

/**
 * Combine results, collecting all errors
 */
export function allSettled<T, E>(results: Array<Result<T, E>>): { successes: T[]; errors: E[] } {
  const successes: T[] = [];
  const errors: E[] = [];

  for (const result of results) {
    if (result.ok) {
      successes.push((result as { ok: true; value: T }).value);
    } else {
      errors.push((result as { ok: false; error: E }).error);
    }
  }

  return { successes, errors };
}

/**
 * Try executing a function, returning Result instead of throwing
 */
export async function tryAsync<T>(
  fn: () => Promise<T>,
  errorType: MemoryErrorType = 'unknown'
): Promise<Result<T, MemoryError>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    return err(
      memoryError(errorType, error instanceof Error ? error.message : String(error), {
        cause: error instanceof Error ? error : undefined,
        recoverable: true,
      })
    );
  }
}

/**
 * Synchronous version of tryAsync
 */
export function trySync<T>(
  fn: () => T,
  errorType: MemoryErrorType = 'unknown'
): Result<T, MemoryError> {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    return err(
      memoryError(errorType, error instanceof Error ? error.message : String(error), {
        cause: error instanceof Error ? error : undefined,
        recoverable: true,
      })
    );
  }
}

/**
 * Retry a Result-returning operation with exponential backoff
 */
export async function retry<T, E extends { retryable: boolean }>(
  fn: () => Promise<Result<T, E>>,
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  }
): Promise<Result<T, E>> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 100;
  const maxDelayMs = options?.maxDelayMs ?? 5000;

  let lastError: E | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fn();

    if (result.ok) {
      return result;
    }

    const errorResult = result as { ok: false; error: E };
    lastError = errorResult.error;

    // Don't retry if error isn't retryable
    if (!errorResult.error.retryable) {
      return err(errorResult.error);
    }

    // Don't sleep after last attempt
    if (attempt < maxAttempts - 1) {
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }

  return err(lastError!);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ok,
  err,
  memoryError,
  map,
  mapError,
  andThen,
  unwrapOr,
  unwrap,
  isOk,
  isErr,
  all,
  allSettled,
  tryAsync,
  trySync,
  retry,
};
