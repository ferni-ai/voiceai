/**
 * Resilient Executor
 *
 * Automatic retry with exponential backoff for transient failures.
 */
export interface RetryOptions {
    /** Maximum number of retry attempts (default: 3) */
    maxRetries?: number;
    /** Base delay in ms (default: 1000) */
    baseDelay?: number;
    /** Maximum delay in ms (default: 30000) */
    maxDelay?: number;
    /** Jitter factor 0-1 to randomize delays (default: 0.1) */
    jitter?: number;
    /** Custom function to determine if error is retryable */
    shouldRetry?: (error: Error, attempt: number) => boolean;
    /** Callback on each retry attempt */
    onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
    /** Operation name for logging */
    operationName?: string;
}
export declare function withResilience<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>;
/**
 * Create a resilient version of an async function
 */
export declare function makeResilient<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, options?: RetryOptions): T;
//# sourceMappingURL=resilient-executor.d.ts.map