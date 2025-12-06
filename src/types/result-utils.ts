/**
 * Result Type Utilities
 *
 * Helper functions and test utilities for working with Result types.
 * Makes it easier to adopt Result types incrementally.
 */

import {
  type Result,
  type Success,
  type Failure,
  success,
  failure,
  isSuccess,
  isFailure,
  DomainError,
} from './result.js';

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

/**
 * Convert a throwing function to one that returns Result
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return success(fn());
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Convert a Promise that might reject to Promise<Result>
 */
export async function tryCatchAsync<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    const data = await promise;
    return success(data);
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Convert existing function with callbacks to Result
 */
export function wrapWithResult<T, A extends unknown[]>(
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<Result<T, Error>> {
  return async (...args: A) => {
    try {
      const result = await fn(...args);
      return success(result);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Assert that a result is successful and return the data
 */
export function expectSuccess<T, E>(result: Result<T, E>): T {
  if (!isSuccess(result)) {
    throw new Error(`Expected success but got failure: ${String(result.error)}`);
  }
  return result.data;
}

/**
 * Assert that a result is a failure and return the error
 */
export function expectFailure<T, E>(result: Result<T, E>): E {
  if (!isFailure(result)) {
    throw new Error(`Expected failure but got success: ${JSON.stringify(result.data)}`);
  }
  return result.error;
}

/**
 * Assert that a result matches expected success value
 */
export function assertSuccessEquals<T, E>(result: Result<T, E>, expected: T): void {
  const data = expectSuccess(result);
  if (JSON.stringify(data) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected success data ${JSON.stringify(expected)} but got ${JSON.stringify(data)}`
    );
  }
}

/**
 * Assert that a failure has expected error type
 */
export function assertFailureType<T, E extends Error>(
  result: Result<T, E>,
  expectedType: new (...args: unknown[]) => E
): void {
  const error = expectFailure(result);
  if (!(error instanceof expectedType)) {
    throw new Error(`Expected error type ${expectedType.name} but got ${error.constructor.name}`);
  }
}

/**
 * Create a mock success result for testing
 */
export function mockSuccess<T>(data: T): Success<T> {
  return success(data);
}

/**
 * Create a mock failure result for testing
 */
export function mockFailure<E = Error>(error: E): Failure<E> {
  return failure(error);
}

// ============================================================================
// MATCHER UTILITIES (for Vitest/Jest)
// ============================================================================

/**
 * Custom matchers for use with expect()
 *
 * Usage in test setup:
 *   import { resultMatchers } from '../types/result-utils.js';
 *   expect.extend(resultMatchers);
 *
 * Then in tests:
 *   expect(result).toBeSuccess();
 *   expect(result).toBeFailure();
 *   expect(result).toSucceedWith(expectedData);
 *   expect(result).toFailWith(ExpectedError);
 */
export const resultMatchers = {
  toBeSuccess<T, E>(received: Result<T, E>) {
    const pass = isSuccess(received);
    return {
      pass,
      message: () =>
        pass
          ? `Expected result not to be success`
          : `Expected result to be success but got failure: ${String((received as Failure<E>).error)}`,
    };
  },

  toBeFailure<T, E>(received: Result<T, E>) {
    const pass = isFailure(received);
    return {
      pass,
      message: () =>
        pass
          ? `Expected result not to be failure`
          : `Expected result to be failure but got success: ${JSON.stringify((received as Success<T>).data)}`,
    };
  },

  toSucceedWith<T, E>(received: Result<T, E>, expected: T) {
    if (!isSuccess(received)) {
      return {
        pass: false,
        message: () => `Expected success but got failure: ${String(received.error)}`,
      };
    }
    const pass = JSON.stringify(received.data) === JSON.stringify(expected);
    return {
      pass,
      message: () =>
        pass
          ? `Expected result not to succeed with ${JSON.stringify(expected)}`
          : `Expected success with ${JSON.stringify(expected)} but got ${JSON.stringify(received.data)}`,
    };
  },

  toFailWithType<T, E extends Error>(
    received: Result<T, E>,
    expectedType: new (...args: unknown[]) => E
  ) {
    if (!isFailure(received)) {
      return {
        pass: false,
        message: () => `Expected failure but got success`,
      };
    }
    const pass = received.error instanceof expectedType;
    return {
      pass,
      message: () =>
        pass
          ? `Expected result not to fail with ${expectedType.name}`
          : `Expected failure with ${expectedType.name} but got ${received.error.constructor.name}`,
    };
  },
};

// ============================================================================
// PIPELINE UTILITIES
// ============================================================================

/**
 * Pipe multiple Result-returning functions
 * Stops at first failure
 */
export function pipe<A, B, E>(a: Result<A, E>, fn: (a: A) => Result<B, E>): Result<B, E> {
  if (isFailure(a)) return a;
  return fn(a.data);
}

/**
 * Execute multiple operations in sequence, collecting all errors
 */
export async function executeAll<T, E>(
  operations: Array<() => Promise<Result<T, E>>>
): Promise<{ successes: T[]; failures: E[] }> {
  const successes: T[] = [];
  const failures: E[] = [];

  for (const op of operations) {
    const result = await op();
    if (isSuccess(result)) {
      successes.push(result.data);
    } else {
      failures.push(result.error);
    }
  }

  return { successes, failures };
}

/**
 * Retry an operation that returns Result
 */
export async function retryResult<T, E>(
  operation: () => Promise<Result<T, E>>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    shouldRetry?: (error: E) => boolean;
  } = {}
): Promise<Result<T, E>> {
  const { maxAttempts = 3, delayMs = 1000, shouldRetry = () => true } = options;

  let lastError: E | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await operation();

    if (isSuccess(result)) {
      return result;
    }

    lastError = result.error;

    if (attempt < maxAttempts && shouldRetry(result.error)) {
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs * attempt);
      });
    }
  }

  return failure(lastError!);
}
