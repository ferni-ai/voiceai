/**
 * Result Type for Explicit Error Handling
 *
 * Inspired by Rust's Result<T, E> type. Forces explicit handling of
 * success and error cases, making code more robust.
 *
 * @module agents/core/result
 */

import type { AgentError } from './errors.js';

// ============================================================================
// RESULT TYPE
// ============================================================================

/**
 * Result type for operations that can fail.
 *
 * @example
 * ```ts
 * async function loadPersona(id: string): Promise<Result<PersonaConfig>> {
 *   try {
 *     const persona = await getPersonaAsync(id);
 *     if (!persona) return err(new PersonaNotFoundError(id));
 *     return ok(persona);
 *   } catch (e) {
 *     return err(new PersonaLoadError(id, e));
 *   }
 * }
 *
 * // Usage
 * const result = await loadPersona('ferni');
 * if (result.ok) {
 *   console.log(result.value.name);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export type Result<T, E = AgentError> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

// ============================================================================
// CONSTRUCTORS
// ============================================================================

/**
 * Create a successful result.
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create an error result.
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Unwrap a result, throwing if it's an error.
 * Use sparingly - prefer pattern matching.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value for errors.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Unwrap a result with a lazy default for errors.
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (result.ok) {
    return result.value;
  }
  return fn(result.error);
}

/**
 * Map a successful result's value.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map an error result's error.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return err(fn(result.error));
  }
  return ok(result.value);
}

/**
 * Chain results together (flatMap/andThen).
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return err(result.error);
}

/**
 * Provide an alternative result on error.
 */
export function orElse<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => Result<T, F>
): Result<T, F> {
  if (!result.ok) {
    return fn(result.error);
  }
  return ok(result.value);
}

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Wrap a promise in a Result.
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  errorMapper?: (e: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (e) {
    const error = errorMapper ? errorMapper(e) : (e as E);
    return err(error);
  }
}

/**
 * Execute an async function and wrap result.
 */
export async function tryAsync<T, E = Error>(
  fn: () => Promise<T>,
  errorMapper?: (e: unknown) => E
): Promise<Result<T, E>> {
  return fromPromise(fn(), errorMapper);
}

/**
 * Map over a successful async result.
 */
export async function mapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<U>
): Promise<Result<U, E>> {
  if (result.ok) {
    return ok(await fn(result.value));
  }
  return err(result.error);
}

/**
 * Chain async results together.
 */
export async function andThenAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  if (result.ok) {
    return fn(result.value);
  }
  return err(result.error);
}

// ============================================================================
// COLLECTION UTILITIES
// ============================================================================

/**
 * Collect an array of results into a result of array.
 * Returns first error if any result is an error.
 */
export function collect<T, E>(results: Array<Result<T, E>>): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (!result.ok) {
      return err(result.error);
    }
    values.push(result.value);
  }

  return ok(values);
}

/**
 * Like collect, but collects all errors instead of stopping at first.
 */
export function collectAll<T, E>(results: Array<Result<T, E>>): Result<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];

  for (const result of results) {
    if (result.ok) {
      values.push(result.value);
    } else {
      const errResult = result as Err<E>;
      errors.push(errResult.error);
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok(values);
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for Ok results.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/**
 * Type guard for Err results.
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}
