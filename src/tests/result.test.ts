/**
 * Result Type Tests
 *
 * Tests for the functional Result type and utility functions
 * that provide explicit error handling in the type system.
 */

import { describe, it, expect } from 'vitest';

import {
  success,
  failure,
  isSuccess,
  isFailure,
  unwrap,
  unwrapOr,
  map,
  mapError,
  chain,
  fromPromise,
  fromThrowable,
  combine,
  partition,
  DomainError,
  NotFoundError,
  ValidationError,
  PermissionError,
  RateLimitError,
  ExternalServiceError,
  TimeoutError,
  type Result,
} from '../types/result.js';

// ============================================================================
// CONSTRUCTOR TESTS
// ============================================================================

describe('success', () => {
  it('should create a success result', () => {
    const result = success(42);

    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
  });

  it('should work with objects', () => {
    const data = { name: 'test', value: 123 };
    const result = success(data);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(data);
  });

  it('should work with arrays', () => {
    const result = success([1, 2, 3]);

    expect(result.data).toEqual([1, 2, 3]);
  });

  it('should work with null', () => {
    const result = success(null);

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe('failure', () => {
  it('should create a failure result', () => {
    const error = new Error('Something went wrong');
    const result = failure(error);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });

  it('should work with string errors', () => {
    const result = failure('error message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('error message');
  });

  it('should work with custom error objects', () => {
    const customError = { code: 'ERR_001', message: 'Custom error' };
    const result = failure(customError);

    expect(result.error).toEqual(customError);
  });
});

// ============================================================================
// TYPE GUARD TESTS
// ============================================================================

describe('isSuccess', () => {
  it('should return true for success results', () => {
    const result = success('data');

    expect(isSuccess(result)).toBe(true);
  });

  it('should return false for failure results', () => {
    const result = failure(new Error('error'));

    expect(isSuccess(result)).toBe(false);
  });

  it('should narrow the type correctly', () => {
    const result: Result<number, Error> = success(42);

    if (isSuccess(result)) {
      // TypeScript should know this is Success<number>
      expect(result.data).toBe(42);
    }
  });
});

describe('isFailure', () => {
  it('should return true for failure results', () => {
    const result = failure(new Error('error'));

    expect(isFailure(result)).toBe(true);
  });

  it('should return false for success results', () => {
    const result = success('data');

    expect(isFailure(result)).toBe(false);
  });

  it('should narrow the type correctly', () => {
    const result: Result<number, string> = failure('error');

    if (isFailure(result)) {
      // TypeScript should know this is Failure<string>
      expect(result.error).toBe('error');
    }
  });
});

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

describe('unwrap', () => {
  it('should return data for success results', () => {
    const result = success(42);

    expect(unwrap(result)).toBe(42);
  });

  it('should throw for failure results', () => {
    const error = new Error('unwrap error');
    const result = failure(error);

    expect(() => unwrap(result)).toThrow('unwrap error');
  });
});

describe('unwrapOr', () => {
  it('should return data for success results', () => {
    const result = success(42);

    expect(unwrapOr(result, 0)).toBe(42);
  });

  it('should return default value for failure results', () => {
    const result = failure(new Error('error'));

    expect(unwrapOr(result, 0)).toBe(0);
  });

  it('should work with complex default values', () => {
    const result: Result<string[], Error> = failure(new Error('error'));
    const defaultValue = ['default'];

    expect(unwrapOr(result, defaultValue)).toEqual(['default']);
  });
});

describe('map', () => {
  it('should transform data on success', () => {
    const result = success(5);
    const mapped = map(result, (x) => x * 2);

    expect(isSuccess(mapped)).toBe(true);
    if (isSuccess(mapped)) {
      expect(mapped.data).toBe(10);
    }
  });

  it('should pass through failure unchanged', () => {
    const error = new Error('original error');
    const result = failure(error);
    const mapped = map(result, (x: number) => x * 2);

    expect(isFailure(mapped)).toBe(true);
    if (isFailure(mapped)) {
      expect(mapped.error).toBe(error);
    }
  });

  it('should allow type transformation', () => {
    const result = success(42);
    const mapped = map(result, (x) => x.toString());

    if (isSuccess(mapped)) {
      expect(mapped.data).toBe('42');
    }
  });
});

describe('mapError', () => {
  it('should transform error on failure', () => {
    const result = failure('simple error');
    const mapped = mapError(result, (e) => new Error(e));

    expect(isFailure(mapped)).toBe(true);
    if (isFailure(mapped)) {
      expect(mapped.error.message).toBe('simple error');
    }
  });

  it('should pass through success unchanged', () => {
    const result = success(42);
    const mapped = mapError(result, (e: Error) => e.message);

    expect(isSuccess(mapped)).toBe(true);
    if (isSuccess(mapped)) {
      expect(mapped.data).toBe(42);
    }
  });
});

describe('chain', () => {
  it('should chain successful operations', () => {
    const result = success(5);
    const chained = chain(result, (x) => success(x * 2));

    expect(isSuccess(chained)).toBe(true);
    if (isSuccess(chained)) {
      expect(chained.data).toBe(10);
    }
  });

  it('should short-circuit on failure', () => {
    const result = failure<number, Error>(new Error('first error'));
    const chained = chain(result, (x) => success(x * 2));

    expect(isFailure(chained)).toBe(true);
    if (isFailure(chained)) {
      expect(chained.error.message).toBe('first error');
    }
  });

  it('should propagate failure from chained function', () => {
    const result = success(5);
    const chained = chain(result, () => failure(new Error('chained error')));

    expect(isFailure(chained)).toBe(true);
    if (isFailure(chained)) {
      expect(chained.error.message).toBe('chained error');
    }
  });
});

describe('fromPromise', () => {
  it('should convert resolved promise to success', async () => {
    const promise = Promise.resolve(42);
    const result = await fromPromise(promise);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.data).toBe(42);
    }
  });

  it('should convert rejected promise to failure', async () => {
    const promise = Promise.reject(new Error('async error'));
    const result = await fromPromise(promise);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect((result.error as Error).message).toBe('async error');
    }
  });

  it('should use error mapper when provided', async () => {
    const promise = Promise.reject(new Error('string error'));
    const result = await fromPromise(promise, (e) => new Error(`Mapped: ${e}`));

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.message).toBe('Mapped: string error');
    }
  });
});

describe('fromThrowable', () => {
  it('should convert successful function to success', () => {
    const result = fromThrowable(() => 42);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.data).toBe(42);
    }
  });

  it('should convert throwing function to failure', () => {
    const result = fromThrowable(() => {
      throw new Error('thrown error');
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect((result.error as Error).message).toBe('thrown error');
    }
  });

  it('should use error mapper when provided', () => {
    const result = fromThrowable(
      () => {
        throw new Error('string thrown');
      },
      (e) => new Error(`Mapped: ${e instanceof Error ? e.message : e}`)
    );

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.message).toBe('Mapped: string thrown');
    }
  });
});

describe('combine', () => {
  it('should combine all successes into array', () => {
    const results = [success(1), success(2), success(3)];
    const combined = combine(results);

    expect(isSuccess(combined)).toBe(true);
    if (isSuccess(combined)) {
      expect(combined.data).toEqual([1, 2, 3]);
    }
  });

  it('should return first failure', () => {
    const results = [success(1), failure(new Error('first error')), success(3)];
    const combined = combine(results);

    expect(isFailure(combined)).toBe(true);
    if (isFailure(combined)) {
      expect(combined.error.message).toBe('first error');
    }
  });

  it('should handle empty array', () => {
    const combined = combine([]);

    expect(isSuccess(combined)).toBe(true);
    if (isSuccess(combined)) {
      expect(combined.data).toEqual([]);
    }
  });
});

describe('partition', () => {
  it('should separate successes and failures', () => {
    const results: Array<Result<number, string>> = [
      success(1),
      failure('error1'),
      success(2),
      failure('error2'),
      success(3),
    ];

    const { successes, failures } = partition(results);

    expect(successes).toEqual([1, 2, 3]);
    expect(failures).toEqual(['error1', 'error2']);
  });

  it('should handle all successes', () => {
    const results = [success(1), success(2)];
    const { successes, failures } = partition(results);

    expect(successes).toEqual([1, 2]);
    expect(failures).toEqual([]);
  });

  it('should handle all failures', () => {
    const results = [failure('e1'), failure('e2')];
    const { successes, failures } = partition(results);

    expect(successes).toEqual([]);
    expect(failures).toEqual(['e1', 'e2']);
  });

  it('should handle empty array', () => {
    const { successes, failures } = partition([]);

    expect(successes).toEqual([]);
    expect(failures).toEqual([]);
  });
});

// ============================================================================
// ERROR CLASS TESTS
// ============================================================================

describe('DomainError', () => {
  it('should create error with code and details', () => {
    const error = new DomainError('Something went wrong', 'ERR_001', { foo: 'bar' });

    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe('ERR_001');
    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.name).toBe('DomainError');
  });

  it('should work without details', () => {
    const error = new DomainError('Error message', 'ERR_002');

    expect(error.details).toBeUndefined();
  });

  it('should be instanceof Error', () => {
    const error = new DomainError('test', 'TEST');

    expect(error instanceof Error).toBe(true);
  });
});

describe('NotFoundError', () => {
  it('should create not found error', () => {
    const error = new NotFoundError('User', '123');

    expect(error.message).toBe("User with id '123' not found");
    expect(error.code).toBe('NOT_FOUND');
    expect(error.details).toEqual({ resource: 'User', id: '123' });
  });
});

describe('ValidationError', () => {
  it('should create validation error', () => {
    const error = new ValidationError('Invalid email', 'email', 'not-an-email');

    expect(error.message).toBe('Invalid email');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual({ field: 'email', value: 'not-an-email' });
  });

  it('should work without field and value', () => {
    const error = new ValidationError('General validation error');

    expect(error.details).toEqual({ field: undefined, value: undefined });
  });
});

describe('PermissionError', () => {
  it('should create permission error with resource', () => {
    const error = new PermissionError('delete', 'document');

    expect(error.message).toBe('Permission denied: cannot delete on document');
    expect(error.code).toBe('PERMISSION_DENIED');
  });

  it('should work without resource', () => {
    const error = new PermissionError('access');

    expect(error.message).toBe('Permission denied: cannot access');
  });
});

describe('RateLimitError', () => {
  it('should create rate limit error', () => {
    const error = new RateLimitError('API calls', 5000);

    expect(error.message).toBe('Rate limit exceeded for API calls');
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.retryAfterMs).toBe(5000);
  });

  it('should work without retryAfterMs', () => {
    const error = new RateLimitError('requests');

    expect(error.retryAfterMs).toBeUndefined();
  });
});

describe('ExternalServiceError', () => {
  it('should create external service error with cause', () => {
    const cause = new Error('Connection refused');
    const error = new ExternalServiceError('PaymentGateway', cause);

    expect(error.message).toBe('External service error: PaymentGateway');
    expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(error.details).toEqual({ service: 'PaymentGateway', cause: 'Connection refused' });
  });

  it('should work without cause', () => {
    const error = new ExternalServiceError('EmailService');

    expect(error.details).toEqual({ service: 'EmailService', cause: undefined });
  });
});

describe('TimeoutError', () => {
  it('should create timeout error', () => {
    const error = new TimeoutError('database query', 30000);

    expect(error.message).toBe("Operation 'database query' timed out after 30000ms");
    expect(error.code).toBe('TIMEOUT');
    expect(error.details).toEqual({ operation: 'database query', timeoutMs: 30000 });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Result Integration', () => {
  it('should work in a realistic workflow', async () => {
    // Simulate a data fetching and processing workflow
    const fetchUser = async (id: string): Promise<Result<{ name: string }, NotFoundError>> => {
      if (id === 'valid') {
        return success({ name: 'John' });
      }
      return failure(new NotFoundError('User', id));
    };

    const processName = (name: string): Result<string, ValidationError> => {
      if (name.length > 0) {
        return success(name.toUpperCase());
      }
      return failure(new ValidationError('Name cannot be empty'));
    };

    // Successful path
    const result1 = await fetchUser('valid');
    if (isSuccess(result1)) {
      const processed = processName(result1.data.name);
      expect(isSuccess(processed)).toBe(true);
      if (isSuccess(processed)) {
        expect(processed.data).toBe('JOHN');
      }
    }

    // Failure path
    const result2 = await fetchUser('invalid');
    expect(isFailure(result2)).toBe(true);
    if (isFailure(result2)) {
      expect(result2.error instanceof NotFoundError).toBe(true);
    }
  });

  it('should work with chained operations', () => {
    const parse = (s: string): Result<number, string> => {
      const n = parseInt(s, 10);
      if (isNaN(n)) return failure('Not a number');
      return success(n);
    };

    const double = (n: number): Result<number, string> => {
      return success(n * 2);
    };

    const result = chain(parse('21'), double);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.data).toBe(42);
    }

    const failResult = chain(parse('not a number'), double);

    expect(isFailure(failResult)).toBe(true);
    if (isFailure(failResult)) {
      expect(failResult.error).toBe('Not a number');
    }
  });
});
