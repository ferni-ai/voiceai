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
 * Create a successful result
 */
export function ok(value) {
    return { ok: true, value };
}
/**
 * Create a failed result
 */
export function err(error) {
    return { ok: false, error };
}
/**
 * Create a memory error
 */
export function memoryError(type, message, options) {
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
export function map(result, fn) {
    if (!result.ok) {
        return err(result.error);
    }
    return ok(fn(result.value));
}
/**
 * Map over a failed result
 */
export function mapError(result, fn) {
    if (!result.ok) {
        return err(fn(result.error));
    }
    return ok(result.value);
}
/**
 * Chain results together (flatMap)
 */
export function andThen(result, fn) {
    if (result.ok) {
        return fn(result.value);
    }
    return err(result.error);
}
/**
 * Provide a fallback value for a failed result
 */
export function unwrapOr(result, defaultValue) {
    if (result.ok) {
        return result.value;
    }
    return defaultValue;
}
/**
 * Throw if error, otherwise return value
 */
export function unwrap(result) {
    if (result.ok) {
        return result.value;
    }
    throw new Error(result.error.message);
}
/**
 * Check if result is ok
 */
export function isOk(result) {
    return result.ok;
}
/**
 * Check if result is error
 */
export function isErr(result) {
    return !result.ok;
}
/**
 * Combine multiple results into a single result
 * Returns first error if any fail, otherwise array of values
 */
export function all(results) {
    const values = [];
    for (const result of results) {
        if (!result.ok) {
            return err(result.error);
        }
        values.push(result.value);
    }
    return ok(values);
}
/**
 * Combine results, collecting all errors
 */
export function allSettled(results) {
    const successes = [];
    const errors = [];
    for (const result of results) {
        if (result.ok) {
            successes.push(result.value);
        }
        else {
            errors.push(result.error);
        }
    }
    return { successes, errors };
}
/**
 * Try executing a function, returning Result instead of throwing
 */
export async function tryAsync(fn, errorType = 'unknown') {
    try {
        const value = await fn();
        return ok(value);
    }
    catch (error) {
        return err(memoryError(errorType, error instanceof Error ? error.message : String(error), {
            cause: error instanceof Error ? error : undefined,
            recoverable: true,
        }));
    }
}
/**
 * Synchronous version of tryAsync
 */
export function trySync(fn, errorType = 'unknown') {
    try {
        const value = fn();
        return ok(value);
    }
    catch (error) {
        return err(memoryError(errorType, error instanceof Error ? error.message : String(error), {
            cause: error instanceof Error ? error : undefined,
            recoverable: true,
        }));
    }
}
/**
 * Retry a Result-returning operation with exponential backoff
 */
export async function retry(fn, options) {
    const maxAttempts = options?.maxAttempts ?? 3;
    const baseDelayMs = options?.baseDelayMs ?? 100;
    const maxDelayMs = options?.maxDelayMs ?? 5000;
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await fn();
        if (result.ok) {
            return result;
        }
        const errorResult = result;
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
    return err(lastError);
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
//# sourceMappingURL=result.js.map