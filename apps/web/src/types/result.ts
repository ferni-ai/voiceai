/**
 * Result Types for Frontend - Functional Error Handling
 *
 * Mirrors the backend Result pattern (src/types/result.ts) for consistency.
 * Use these instead of throwing exceptions or returning null/undefined.
 *
 * Benefits:
 * - Errors are visible in function signatures
 * - Forces handling of error cases
 * - Better for async operations
 * - Type-safe error handling
 * - Consistent with backend patterns
 *
 * @example
 * // Define a function that can fail
 * async function fetchUser(id: string): Promise<Result<User, ApiError>> {
 *   const response = await apiGet<User>(`/api/users/${id}`);
 *   if (!response.ok) {
 *     return err(new ApiError(response.error || 'Not found'));
 *   }
 *   return ok(response.data!);
 * }
 *
 * // Use the result
 * const result = await fetchUser('123');
 * if (isOk(result)) {
 *   console.log(result.value.name);
 * } else {
 *   showError(result.error.message);
 * }
 */

// ============================================================================
// CORE RESULT TYPE
// ============================================================================

/**
 * Success result - operation completed successfully
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Error result - operation failed
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Result type - either success with value or error
 *
 * @template T - The type of successful value
 * @template E - The type of error (defaults to Error)
 *
 * @example
 * type FetchResult = Result<User, ApiError>;
 *
 * async function getUser(): Promise<FetchResult> {
 *   // ...
 * }
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Async Result - Promise that resolves to a Result
 * Cleaner than Promise<Result<T, E>> in function signatures
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// ============================================================================
// CONSTRUCTOR FUNCTIONS
// ============================================================================

/**
 * Create a success result
 *
 * @example
 * return ok(user);
 * return ok({ name: 'John', age: 30 });
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create an error result
 *
 * @example
 * return err(new Error('Not found'));
 * return err(new ValidationError('Invalid email'));
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if result is successful
 *
 * @example
 * const result = await fetchUser(id);
 * if (isOk(result)) {
 *   // TypeScript knows result.value exists here
 *   console.log(result.value.name);
 * }
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Check if result is an error
 *
 * @example
 * const result = await fetchUser(id);
 * if (isErr(result)) {
 *   // TypeScript knows result.error exists here
 *   showError(result.error.message);
 * }
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Unwrap a result, throwing if it's an error
 * Use sparingly - prefer pattern matching with isOk/isErr
 *
 * @example
 * const user = unwrap(result); // throws if error
 */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value for errors
 *
 * @example
 * const name = unwrapOr(result, 'Unknown');
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Map over a successful result
 *
 * @example
 * const nameResult = map(userResult, user => user.name);
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map over an error result
 *
 * @example
 * const friendlyResult = mapErr(result, e => new UserFriendlyError(e));
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chain results (flatMap) - for operations that return Results
 *
 * @example
 * const profileResult = chain(userResult, user => fetchProfile(user.id));
 */
export function chain<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Convert a Promise that might reject to AsyncResult
 *
 * @example
 * const result = await fromPromise(fetch('/api/user'));
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  errorMapper?: (error: unknown) => E
): AsyncResult<T, E> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
}

/**
 * Convert a function that might throw to one that returns Result
 *
 * @example
 * const result = fromThrowable(() => JSON.parse(jsonString));
 */
export function fromThrowable<T, E = Error>(
  fn: () => T,
  errorMapper?: (error: unknown) => E
): Result<T, E> {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
}

/**
 * Combine multiple results - returns first error or all values
 *
 * @example
 * const results = combine([userResult, profileResult, settingsResult]);
 * if (isOk(results)) {
 *   const [user, profile, settings] = results.value;
 * }
 */
export function combine<T, E>(results: Array<Result<T, E>>): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

/**
 * Partition results into successes and errors
 *
 * @example
 * const { successes, errors } = partition(results);
 */
export function partition<T, E>(
  results: Array<Result<T, E>>
): { successes: T[]; errors: E[] } {
  const successes: T[] = [];
  const errors: E[] = [];

  for (const result of results) {
    if (isOk(result)) {
      successes.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  return { successes, errors };
}

// ============================================================================
// COMMON ERROR TYPES
// ============================================================================

/**
 * Base class for application errors with error codes
 */
export class AppError extends Error {
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
 * API request failed
 */
export class ApiError extends AppError {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message, 'API_ERROR', { status });
  }
}

/**
 * Validation failed
 */
export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', { field });
  }
}

/**
 * User not authenticated
 */
export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTH_ERROR');
  }
}

/**
 * Operation timed out
 */
export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`, 'TIMEOUT', { operation, timeoutMs });
  }
}

/**
 * Network/offline error
 */
export class NetworkError extends AppError {
  constructor(message = 'Network error') {
    super(message, 'NETWORK_ERROR');
  }
}
