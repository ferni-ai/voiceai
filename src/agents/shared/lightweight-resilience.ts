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

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// RETRY WITH EXPONENTIAL BACKOFF
// ============================================================================

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
export async function withResilience<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxRetries,
    baseDelay,
    maxDelay = 30000,
    operationName,
    onRetry,
    onBeforeRetry,
  } = options;

  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this was the last attempt, don't retry
      if (attempt > maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
      const delay = Math.min(exponentialDelay + jitter, maxDelay);

      // Notify callback if provided
      if (onRetry) {
        onRetry(attempt, lastError, delay);
      }

      // Log retry (using stderr to avoid importing logger)
      if (operationName) {
        process.stderr.write(
          `[lightweight-resilience] ${operationName} failed (attempt ${attempt}/${maxRetries + 1}), ` +
            `retrying in ${Math.round(delay)}ms: ${lastError.message}\n`
        );
      }

      // Run async cleanup BEFORE the delay - this prevents race conditions
      // where a slow first connection completes while the retry is waiting
      if (onBeforeRetry) {
        try {
          await onBeforeRetry();
        } catch (cleanupError) {
          // Log but don't fail - cleanup errors shouldn't prevent retry
          process.stderr.write(
            `[lightweight-resilience] ${operationName} cleanup warning: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`
          );
        }
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  throw lastError;
}

// ============================================================================
// ERROR HUMANIZATION (Pattern Matching - No AI)
// ============================================================================

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
export function humanizeError(error: Error): HumanizedError {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Timeout errors
  if (msg.includes('timeout') || msg.includes('timed out') || name.includes('timeout')) {
    return {
      userMessage: "I'm having a bit of trouble connecting. Give me just a moment.",
      severity: 'medium',
      shouldNotifyUser: true,
      category: 'timeout',
    };
  }

  // Network errors
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('socket') ||
    name.includes('network')
  ) {
    return {
      userMessage: 'My connection hiccupped. Let me try that again.',
      severity: 'medium',
      shouldNotifyUser: true,
      category: 'network',
    };
  }

  // Rate limiting
  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('429') ||
    msg.includes('quota')
  ) {
    return {
      userMessage: 'I need a quick breather. One moment please.',
      severity: 'low',
      shouldNotifyUser: true,
      category: 'rate_limit',
    };
  }

  // Authentication errors
  if (
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('auth')
  ) {
    return {
      userMessage: "I'm having trouble with my credentials. Let me sort this out.",
      severity: 'high',
      shouldNotifyUser: false, // Don't expose auth issues to users
      category: 'auth',
    };
  }

  // WebSocket/LiveKit specific
  if (msg.includes('websocket') || msg.includes('livekit') || msg.includes('room')) {
    return {
      userMessage: 'Our connection had a little hiccup. I should be back in just a second.',
      severity: 'medium',
      shouldNotifyUser: true,
      category: 'network',
    };
  }

  // Generic fallback
  return {
    userMessage: "Something unexpected happened, but I'm still here with you.",
    severity: 'high',
    shouldNotifyUser: false, // Don't confuse users with vague messages
    category: 'unknown',
  };
}

// ============================================================================
// SIMPLE CIRCUIT STATE (No full circuit breaker)
// ============================================================================

/**
 * Simple failure tracking for deciding when to skip retries.
 * This is NOT a full circuit breaker - just a lightweight counter.
 */
export class FailureTracker {
  private failures: number[] = [];
  private readonly windowMs: number;
  private readonly threshold: number;

  constructor(options: { windowMs?: number; threshold?: number } = {}) {
    this.windowMs = options.windowMs ?? 60_000; // 1 minute window
    this.threshold = options.threshold ?? 5; // 5 failures = circuit open
  }

  /** Record a failure */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    // Cleanup old failures
    this.failures = this.failures.filter((t) => now - t < this.windowMs);
  }

  /** Record a success (clears failure history) */
  recordSuccess(): void {
    this.failures = [];
  }

  /** Check if we should skip the operation due to too many failures */
  shouldSkip(): boolean {
    const now = Date.now();
    const recentFailures = this.failures.filter((t) => now - t < this.windowMs);
    return recentFailures.length >= this.threshold;
  }

  /** Get current failure count in window */
  getFailureCount(): number {
    const now = Date.now();
    return this.failures.filter((t) => now - t < this.windowMs).length;
  }
}
