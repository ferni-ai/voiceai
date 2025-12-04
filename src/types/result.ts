/**
 * Result Types for Consistent Error Handling
 *
 * Provides a functional approach to error handling that makes
 * errors explicit in the type system. Use these instead of
 * throwing exceptions or returning null/undefined.
 *
 * Benefits:
 * - Errors are visible in function signatures
 * - Forces handling of error cases
 * - Better for async operations
 * - More testable code
 *
 * Usage:
 *
 *   // Define a function that can fail
 *   async function getUser(id: string): Promise<Result<User, UserNotFoundError>> {
 *     const user = await db.findUser(id);
 *     if (!user) {
 *       return failure(new UserNotFoundError(id));
 *     }
 *     return success(user);
 *   }
 *
 *   // Use the result
 *   const result = await getUser('123');
 *   if (isSuccess(result)) {
 *     console.log(result.data.name);
 *   } else {
 *     console.error(result.error.message);
 *   }
 */

// ============================================================================
// CORE RESULT TYPE
// ============================================================================

/**
 * Success result - operation completed successfully
 */
export interface Success<T> {
  readonly success: true;
  readonly data: T;
}

/**
 * Failure result - operation failed with an error
 */
export interface Failure<E = Error> {
  readonly success: false;
  readonly error: E;
}

/**
 * Result type - either success with data or failure with error
 *
 * @template T - The type of successful data
 * @template E - The type of error (defaults to Error)
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

// ============================================================================
// CONSTRUCTOR FUNCTIONS
// ============================================================================

/**
 * Create a success result
 */
export function success<T>(data: T): Success<T> {
  return { success: true, data };
}

/**
 * Create a failure result
 */
export function failure<E = Error>(error: E): Failure<E> {
  return { success: false, error };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if result is successful
 */
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.success === true;
}

/**
 * Check if result is a failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.success === false;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Unwrap a result, throwing if it's a failure
 *
 * Use sparingly - prefer pattern matching with isSuccess/isFailure
 */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (isSuccess(result)) {
    return result.data;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value for failures
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isSuccess(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Map over a successful result
 */
export function map<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  if (isSuccess(result)) {
    return success(fn(result.data));
  }
  return result;
}

/**
 * Map over a failed result
 */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isFailure(result)) {
    return failure(fn(result.error));
  }
  return result;
}

/**
 * Chain results (flatMap)
 */
export function chain<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> {
  if (isSuccess(result)) {
    return fn(result.data);
  }
  return result;
}

/**
 * Convert a Promise that might reject to a Promise<Result>
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  errorMapper?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return success(data);
  } catch (error) {
    if (errorMapper) {
      return failure(errorMapper(error));
    }
    return failure(error as E);
  }
}

/**
 * Convert a function that might throw to one that returns Result
 */
export function fromThrowable<T, E = Error>(
  fn: () => T,
  errorMapper?: (error: unknown) => E
): Result<T, E> {
  try {
    const data = fn();
    return success(data);
  } catch (error) {
    if (errorMapper) {
      return failure(errorMapper(error));
    }
    return failure(error as E);
  }
}

/**
 * Combine multiple results into one
 * Returns failure on first error, or success with array of all data
 */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const data: T[] = [];
  for (const result of results) {
    if (isFailure(result)) {
      return result;
    }
    data.push(result.data);
  }
  return success(data);
}

/**
 * Collect all successes and failures separately
 */
export function partition<T, E>(results: Result<T, E>[]): {
  successes: T[];
  failures: E[];
} {
  const successes: T[] = [];
  const failures: E[] = [];

  for (const result of results) {
    if (isSuccess(result)) {
      successes.push(result.data);
    } else {
      failures.push(result.error);
    }
  }

  return { successes, failures };
}

// ============================================================================
// ASYNC RESULT TYPE
// ============================================================================

/**
 * Alias for Promise<Result<T, E>> for cleaner signatures
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// ============================================================================
// COMMON ERROR TYPES
// ============================================================================

/**
 * Base class for domain errors
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' not found`, 'NOT_FOUND', { resource, id });
  }
}

/**
 * Validation error
 */
export class ValidationError extends DomainError {
  constructor(message: string, field?: string, value?: unknown) {
    super(message, 'VALIDATION_ERROR', { field, value });
  }
}

/**
 * Permission denied error
 */
export class PermissionError extends DomainError {
  constructor(action: string, resource?: string) {
    super(`Permission denied: cannot ${action}${resource ? ` on ${resource}` : ''}`, 'PERMISSION_DENIED', {
      action,
      resource,
    });
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends DomainError {
  constructor(
    operation: string,
    public readonly retryAfterMs?: number
  ) {
    super(`Rate limit exceeded for ${operation}`, 'RATE_LIMIT', { operation, retryAfterMs });
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends DomainError {
  constructor(service: string, cause?: Error) {
    super(`External service error: ${service}`, 'EXTERNAL_SERVICE_ERROR', {
      service,
      cause: cause?.message,
    });
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends DomainError {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT', {
      operation,
      timeoutMs,
    });
  }
}

