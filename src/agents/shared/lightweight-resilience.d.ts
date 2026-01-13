/**
 * Lightweight Resilience Utilities for Child Processes
 *
 * This module provides MINIMAL retry and error handling without importing
 * the full self-healing module chain. Designed for child process hot path.
 *
 * ZERO EXTERNAL DEPENDENCIES - only Node.js built-ins.
 *
 * For full self-healing features (AI diagnostics, circuit breakers, alerting),
 * use the full module: import('../services/self-healing/index.js')
 *
 * @module lightweight-resilience
 */
export interface RetryOptions {
    /** Maximum number of retry attempts (default: 3) */
    maxRetries: number;
    /** Base delay in ms before first retry (default: 1000) */
    baseDelay: number;
    /** Maximum delay in ms (default: 30000) */
    maxDelay?: number;
    /** Operation name for logging */
    operationName?: string;
    /** Callback on each retry (synchronous, for logging) */
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
    /**
     * Async cleanup before retry - use this to disconnect/cleanup resources.
     * Called BEFORE the delay, allowing cleanup to complete before retry.
     * This prevents race conditions like "Participant already exists" when
     * a slow first connection completes while retry is in progress.
     */
    onBeforeRetry?: () => Promise<void>;
}
export interface HumanizedError {
    /** User-friendly message to speak */
    userMessage: string;
    /** Error severity level */
    severity: 'low' | 'medium' | 'high';
    /** Whether to notify the user via voice */
    shouldNotifyUser: boolean;
    /** Original error category */
    category: 'network' | 'timeout' | 'rate_limit' | 'auth' | 'unknown';
}
/**
 * Execute a function with exponential backoff retry.
 *
 * This is a lightweight alternative to the full self-healing withResilience()
 * that doesn't require importing the entire self-healing module chain.
 *
 * @example
 * ```ts
 * await withResilience(
 *   () => connectToRoom(),
 *   { maxRetries: 3, baseDelay: 500, operationName: 'room-connect' }
 * );
 * ```
 */
export declare function withResilience<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>;
/**
 * Convert technical errors to user-friendly messages.
 *
 * This is a lightweight pattern-matching approach that doesn't require
 * the full AI-powered error analysis from self-healing.
 *
 * @example
 * ```ts
 * const humanized = humanizeError(error);
 * if (humanized.shouldNotifyUser) {
 *   await session.say(humanized.userMessage);
 * }
 * ```
 */
export declare function humanizeError(error: Error): HumanizedError;
/**
 * Simple failure tracking for deciding when to skip retries.
 * This is NOT a full circuit breaker - just a lightweight counter.
 */
export declare class FailureTracker {
    private failures;
    private readonly windowMs;
    private readonly threshold;
    constructor(options?: {
        windowMs?: number;
        threshold?: number;
    });
    /** Record a failure */
    recordFailure(): void;
    /** Record a success (clears failure history) */
    recordSuccess(): void;
    /** Check if we should skip the operation due to too many failures */
    shouldSkip(): boolean;
    /** Get current failure count in window */
    getFailureCount(): number;
}
//# sourceMappingURL=lightweight-resilience.d.ts.map