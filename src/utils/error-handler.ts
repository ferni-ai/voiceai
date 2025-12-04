/**
 * Unified Error Handling Utility
 *
 * Provides consistent error handling patterns across the codebase:
 * - Graceful error handling with logging
 * - Error classification (recoverable vs critical)
 * - Retry logic for transient failures
 * - Circuit breaker pattern for external services
 *
 * Replaces silent catch blocks with proper error management.
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

export type ErrorSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface ErrorContext {
  operation: string;
  component?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface HandledError {
  original: unknown;
  message: string;
  severity: ErrorSeverity;
  isRecoverable: boolean;
  context: ErrorContext;
  timestamp: Date;
}

export type ErrorHandler<T> = (error: HandledError) => T;

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Classify error severity based on error type
 */
function classifyError(error: unknown): { severity: ErrorSeverity; isRecoverable: boolean } {
  const errorString = String(error);
  const errorMessage = error instanceof Error ? error.message : errorString;

  // Network/connectivity errors - usually transient
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ENETUNREACH|fetch failed/i.test(errorMessage)) {
    return { severity: 'warn', isRecoverable: true };
  }

  // Rate limiting - recoverable with backoff
  if (/rate limit|too many requests|429/i.test(errorMessage)) {
    return { severity: 'warn', isRecoverable: true };
  }

  // Authentication errors - not recoverable without intervention
  if (/unauthorized|forbidden|401|403/i.test(errorMessage)) {
    return { severity: 'error', isRecoverable: false };
  }

  // Not found errors - usually expected
  if (/not found|404|does not exist/i.test(errorMessage)) {
    return { severity: 'debug', isRecoverable: true };
  }

  // Validation errors - not recoverable
  if (/invalid|validation|schema/i.test(errorMessage)) {
    return { severity: 'warn', isRecoverable: false };
  }

  // Database errors - may be transient
  if (/database|firestore|postgres|redis|connection/i.test(errorMessage)) {
    return { severity: 'error', isRecoverable: true };
  }

  // Default: treat as recoverable warning
  return { severity: 'warn', isRecoverable: true };
}

/**
 * Format error for logging
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

// ============================================================================
// CORE ERROR HANDLING
// ============================================================================

/**
 * Handle an error gracefully with logging and optional fallback
 *
 * @example
 * // With fallback value
 * const result = await someAsyncOp().catch(
 *   handleGracefully('fetch user', { fallback: null })
 * );
 *
 * @example
 * // Log and rethrow
 * await someOp().catch(handleGracefully('critical operation', { rethrow: true }));
 */
export function handleGracefully<T>(
  operation: string,
  options?: {
    fallback?: T;
    rethrow?: boolean;
    component?: string;
    silent?: boolean;
    onError?: ErrorHandler<void>;
  }
): (error: unknown) => T {
  return (error: unknown) => {
    const { severity, isRecoverable } = classifyError(error);
    const errorMessage = formatError(error);

    const context: ErrorContext = {
      operation,
      component: options?.component,
    };

    const handledError: HandledError = {
      original: error,
      message: errorMessage,
      severity,
      isRecoverable,
      context,
      timestamp: new Date(),
    };

    // Log based on severity (unless silent)
    if (!options?.silent) {
      const logData = {
        error: errorMessage,
        operation,
        component: options?.component,
        isRecoverable,
      };

      switch (severity) {
        case 'debug':
          getLogger().debug(logData, `[${operation}] ${errorMessage}`);
          break;
        case 'info':
          getLogger().info(logData, `[${operation}] ${errorMessage}`);
          break;
        case 'warn':
          getLogger().warn(logData, `[${operation}] ${errorMessage}`);
          break;
        case 'error':
        case 'critical':
          getLogger().error(logData, `[${operation}] ${errorMessage}`);
          break;
      }
    }

    // Call custom error handler if provided
    if (options?.onError) {
      options.onError(handledError);
    }

    // Rethrow if requested
    if (options?.rethrow) {
      throw error;
    }

    // Return fallback value
    return options?.fallback as T;
  };
}

/**
 * Wrap an async operation with error handling
 *
 * @example
 * const result = await withErrorHandling(
 *   () => fetchUserProfile(userId),
 *   'fetch profile',
 *   { fallback: null }
 * );
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string,
  options?: {
    fallback?: T;
    component?: string;
    retries?: number;
    retryDelayMs?: number;
  }
): Promise<T> {
  const retries = options?.retries ?? 0;
  const retryDelay = options?.retryDelayMs ?? 1000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const { isRecoverable } = classifyError(error);

      // Only retry if recoverable and we have retries left
      if (isRecoverable && attempt < retries) {
        getLogger().debug(
          {
            attempt: attempt + 1,
            maxRetries: retries,
            operation: operationName,
          },
          `Retrying ${operationName} after error...`
        );

        await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        continue;
      }

      // No more retries or not recoverable
      break;
    }
  }

  // All retries exhausted or not recoverable
  return handleGracefully<T>(operationName, {
    fallback: options?.fallback as T,
    component: options?.component,
  })(lastError);
}

// ============================================================================
// SPECIALIZED HANDLERS
// ============================================================================

/**
 * Handle database operation errors with appropriate fallbacks
 */
export function handleDatabaseError<T>(operation: string, fallback: T): (error: unknown) => T {
  return handleGracefully(operation, {
    fallback,
    component: 'database',
  });
}

/**
 * Handle external API errors
 */
export function handleApiError<T>(operation: string, fallback: T): (error: unknown) => T {
  return handleGracefully(operation, {
    fallback,
    component: 'external-api',
  });
}

/**
 * Handle non-critical errors silently (log at debug level only)
 */
export function handleSilently<T>(operation: string, fallback: T): (error: unknown) => T {
  return (error: unknown) => {
    getLogger().debug({ error: formatError(error), operation }, `[${operation}] Silent error`);
    return fallback;
  };
}

/**
 * Fire-and-forget error handler for non-critical async operations
 * Use this for operations where failure doesn't affect the main flow
 */
export function fireAndForget(operation: string): (error: unknown) => void {
  return handleGracefully(operation, {
    fallback: undefined,
    silent: false,
  });
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuits = new Map<string, CircuitState>();

/**
 * Circuit breaker for external service calls
 * Opens circuit after threshold failures, allows retry after cooldown
 */
export function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  serviceName: string,
  options?: {
    failureThreshold?: number;
    cooldownMs?: number;
    fallback?: T;
  }
): Promise<T> {
  const threshold = options?.failureThreshold ?? 5;
  const cooldown = options?.cooldownMs ?? 30000;

  const state = circuits.get(serviceName) ?? {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
  };

  // Check if circuit is open and cooldown hasn't passed
  if (state.isOpen) {
    const timeSinceFailure = Date.now() - state.lastFailure;
    if (timeSinceFailure < cooldown) {
      getLogger().debug(
        { serviceName, cooldownRemaining: cooldown - timeSinceFailure },
        `Circuit breaker open for ${serviceName}`
      );

      if (options?.fallback !== undefined) {
        return Promise.resolve(options.fallback);
      }
      return Promise.reject(new Error(`Circuit breaker open for ${serviceName}`));
    }

    // Cooldown passed, allow one attempt (half-open)
    state.isOpen = false;
  }

  return operation()
    .then((result) => {
      // Success - reset circuit
      state.failures = 0;
      state.isOpen = false;
      circuits.set(serviceName, state);
      return result;
    })
    .catch((error) => {
      // Failure - update circuit state
      state.failures++;
      state.lastFailure = Date.now();

      if (state.failures >= threshold) {
        state.isOpen = true;
        getLogger().warn(
          { serviceName, failures: state.failures },
          `Circuit breaker opened for ${serviceName} after ${state.failures} failures`
        );
      }

      circuits.set(serviceName, state);

      if (options?.fallback !== undefined) {
        return options.fallback;
      }
      throw error;
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  handleGracefully,
  withErrorHandling,
  handleDatabaseError,
  handleApiError,
  handleSilently,
  fireAndForget,
  withCircuitBreaker,
};
