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
export type Result<T, E = MemoryError> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
};
/**
 * Create a successful result
 */
export declare function ok<T>(value: T): Result<T, never>;
/**
 * Create a failed result
 */
export declare function err<E>(error: E): Result<never, E>;
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
export type MemoryErrorType = 'embedding_failed' | 'store_unavailable' | 'document_not_found' | 'validation_failed' | 'rate_limited' | 'timeout' | 'network_error' | 'dimension_mismatch' | 'consolidation_failed' | 'deduplication_failed' | 'serialization_failed' | 'unknown';
/**
 * Create a memory error
 */
export declare function memoryError(type: MemoryErrorType, message: string, options?: {
    recoverable?: boolean;
    retryable?: boolean;
    context?: Record<string, unknown>;
    cause?: Error;
}): MemoryError;
/**
 * Map over a successful result
 */
export declare function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;
/**
 * Map over a failed result
 */
export declare function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F>;
/**
 * Chain results together (flatMap)
 */
export declare function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E>;
/**
 * Provide a fallback value for a failed result
 */
export declare function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T;
/**
 * Throw if error, otherwise return value
 */
export declare function unwrap<T, E extends {
    message: string;
}>(result: Result<T, E>): T;
/**
 * Check if result is ok
 */
export declare function isOk<T, E>(result: Result<T, E>): result is {
    ok: true;
    value: T;
};
/**
 * Check if result is error
 */
export declare function isErr<T, E>(result: Result<T, E>): result is {
    ok: false;
    error: E;
};
/**
 * Combine multiple results into a single result
 * Returns first error if any fail, otherwise array of values
 */
export declare function all<T, E>(results: Array<Result<T, E>>): Result<T[], E>;
/**
 * Combine results, collecting all errors
 */
export declare function allSettled<T, E>(results: Array<Result<T, E>>): {
    successes: T[];
    errors: E[];
};
/**
 * Try executing a function, returning Result instead of throwing
 */
export declare function tryAsync<T>(fn: () => Promise<T>, errorType?: MemoryErrorType): Promise<Result<T, MemoryError>>;
/**
 * Synchronous version of tryAsync
 */
export declare function trySync<T>(fn: () => T, errorType?: MemoryErrorType): Result<T, MemoryError>;
/**
 * Retry a Result-returning operation with exponential backoff
 */
export declare function retry<T, E extends {
    retryable: boolean;
}>(fn: () => Promise<Result<T, E>>, options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
}): Promise<Result<T, E>>;
declare const _default: {
    ok: typeof ok;
    err: typeof err;
    memoryError: typeof memoryError;
    map: typeof map;
    mapError: typeof mapError;
    andThen: typeof andThen;
    unwrapOr: typeof unwrapOr;
    unwrap: typeof unwrap;
    isOk: typeof isOk;
    isErr: typeof isErr;
    all: typeof all;
    allSettled: typeof allSettled;
    tryAsync: typeof tryAsync;
    trySync: typeof trySync;
    retry: typeof retry;
};
export default _default;
//# sourceMappingURL=result.d.ts.map