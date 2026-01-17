/**
 * Safe Logger Utility
 *
 * Provides a safe wrapper around @livekit/agents log() that doesn't throw
 * if the logger hasn't been initialized yet.
 *
 * PROBLEM:
 *   The LiveKit agents SDK requires `initializeLogger()` to be called before
 *   using `log()`. During tool initialization and testing, this may not have
 *   happened yet, causing crashes.
 *
 * SOLUTION:
 *   Use `safeLog()` instead of `log()` from @livekit/agents. It falls back
 *   to console logging if the LiveKit logger isn't available.
 *
 * USAGE:
 *   // Instead of:
 *   import { log } from '@livekit/agents';
 *   const getLogger = () => log();
 *
 *   // Use:
 *   import { safeLog } from '../utils/safe-logger.js';
 *   const getLogger = () => safeLog();
 *
 *   // Or simply:
 *   import { getLogger } from '../utils/safe-logger.js';
 *
 * @module utils/safe-logger
 */

import { log } from '@livekit/agents';

/**
 * Console-based fallback logger that matches LiveKit's Logger interface
 */
export interface FallbackLogger {
  debug: typeof console.debug;
  info: typeof console.info;
  warn: typeof console.warn;
  error: typeof console.error;
  child: (bindings: Record<string, unknown>) => FallbackLogger;
}

/**
 * Serialize an Error object for JSON logging.
 *
 * Error objects don't serialize to JSON properly because their properties
 * (message, stack, name) are not enumerable. This function extracts those
 * properties into a plain object that serializes correctly.
 */
export function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    // Extract standard Error properties plus any custom properties (e.g., `code` on Node.js errors)
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    // Copy any additional enumerable properties from the error
    for (const key of Object.keys(error)) {
      serialized[key] = (error as unknown as Record<string, unknown>)[key];
    }

    return serialized;
  }
  return error;
}

/**
 * Process logging bindings to ensure errors are serializable.
 *
 * If the bindings contain an `error` key with an Error object,
 * it will be serialized to a plain object for proper JSON output.
 */
function processBindings(bindings: Record<string, unknown>): Record<string, unknown> {
  if (!bindings || typeof bindings !== 'object') {
    return bindings;
  }

  // Check if there's an 'error' key that needs serialization
  if ('error' in bindings && bindings.error instanceof Error) {
    return {
      ...bindings,
      error: serializeError(bindings.error),
    };
  }

  // Also check for 'err' key (pino convention)
  if ('err' in bindings && bindings.err instanceof Error) {
    return {
      ...bindings,
      err: serializeError(bindings.err),
    };
  }

  return bindings;
}

/**
 * Create a fallback logger that uses console methods
 */
function createFallbackLogger(bindings?: Record<string, unknown>): FallbackLogger {
  const prefix = bindings ? `[${Object.values(bindings).join(':')}] ` : '';

  // Helper to process first arg if it's a bindings object
  const processFirstArg = (args: unknown[]): unknown[] => {
    if (args.length > 0 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      return [processBindings(args[0] as Record<string, unknown>), ...args.slice(1)];
    }
    return args;
  };

  return {
    debug: (...args: unknown[]) => console.debug(prefix, ...processFirstArg(args)),
    info: (...args: unknown[]) => console.info(prefix, ...processFirstArg(args)),
    warn: (...args: unknown[]) => console.warn(prefix, ...processFirstArg(args)),
    error: (...args: unknown[]) => console.error(prefix, ...processFirstArg(args)),
    child: (childBindings: Record<string, unknown>) =>
      createFallbackLogger({ ...bindings, ...childBindings }),
  };
}

/**
 * Safe logger that falls back to console if LiveKit logger isn't initialized.
 *
 * This is the recommended way to get a logger throughout the codebase.
 * It prevents crashes when code runs outside of a LiveKit job context
 * (e.g., during tool registration, testing, or standalone scripts).
 *
 * @returns A logger instance (either LiveKit's or console fallback)
 *
 * @example
 * ```typescript
 * import { safeLog } from '../utils/safe-logger.js';
 *
 * const logger = safeLog();
 * logger.info({ userId: '123' }, 'Processing request');
 * logger.error({ error: err }, 'Something went wrong');
 * ```
 */
export function safeLog(): FallbackLogger {
  try {
    const baseLogger = log();
    // Wrap the logger to automatically serialize errors
    return wrapLoggerWithErrorSerialization(baseLogger);
  } catch {
    // LiveKit logger not initialized - use console fallback
    return createFallbackLogger();
  }
}

/**
 * Convenience alias for safeLog()
 *
 * Matches the common pattern used throughout the codebase:
 * `const getLogger = () => log();`
 *
 * Can be used directly or as a function:
 * - `import { getLogger } from '../utils/safe-logger.js';`
 * - `const logger = getLogger();`
 *
 * @returns A logger instance
 */
export const getLogger = safeLog;

/**
 * Wrap a pino-style logger to automatically serialize Error objects.
 *
 * Pino doesn't serialize Error objects by default (they appear as {}).
 * This wrapper intercepts log calls and serializes any `error` or `err`
 * properties in the bindings object.
 */
function wrapLoggerWithErrorSerialization(pinoLogger: ReturnType<typeof log>): FallbackLogger {
  const wrapMethod =
    (method: 'debug' | 'info' | 'warn' | 'error') =>
    (...args: unknown[]) => {
      // If first arg is an object (bindings), process it for error serialization
      if (args.length > 0 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        const processedBindings = processBindings(args[0] as Record<string, unknown>);
        return pinoLogger[method](processedBindings, ...(args.slice(1) as [string, ...unknown[]]));
      }
      return pinoLogger[method](...(args as [string, ...unknown[]]));
    };

  return {
    debug: wrapMethod('debug'),
    info: wrapMethod('info'),
    warn: wrapMethod('warn'),
    error: wrapMethod('error'),
    child: (childBindings: Record<string, unknown>) => {
      const childLogger = pinoLogger.child(childBindings);
      return wrapLoggerWithErrorSerialization(childLogger as unknown as ReturnType<typeof log>);
    },
  };
}

/**
 * Create a child logger with additional context bindings
 *
 * @param bindings - Key-value pairs to include in all log messages
 * @returns A logger with the bindings applied
 *
 * @example
 * ```typescript
 * import { createLogger } from '../utils/safe-logger.js';
 *
 * const logger = createLogger({ module: 'handoff', agentId: 'nayan-patel' });
 * logger.info('Starting handoff'); // Logs: [handoff:nayan-patel] Starting handoff
 * ```
 */
export function createLogger(bindings: Record<string, unknown>): FallbackLogger {
  try {
    const baseLogger = log();
    const childLogger = baseLogger.child(bindings);
    // Wrap the child logger to automatically serialize errors
    return wrapLoggerWithErrorSerialization(childLogger as unknown as ReturnType<typeof log>);
  } catch {
    return createFallbackLogger(bindings);
  }
}

// ============================================================================
// LOG TRUNCATION UTILITIES
// ============================================================================

/**
 * Check if full (non-truncated) logging is enabled.
 *
 * Set LOG_FULL_RESPONSES=true to see complete LLM responses, TTS text,
 * and other long strings in logs without truncation.
 *
 * WARNING: This can produce very large log output. Only use for debugging.
 */
export function isFullLoggingEnabled(): boolean {
  return process.env.LOG_FULL_RESPONSES === 'true';
}

/**
 * Truncate a string for logging, respecting LOG_FULL_RESPONSES env var.
 *
 * @param text - The text to potentially truncate
 * @param maxLength - Maximum length before truncation (default: 200)
 * @param suffix - Suffix to add when truncated (default: '...')
 * @returns The original text if full logging is enabled, otherwise truncated
 *
 * @example
 * ```typescript
 * import { truncateForLog } from '../utils/safe-logger.js';
 *
 * // With LOG_FULL_RESPONSES=false (default):
 * truncateForLog('very long text...', 50); // Returns: 'very long text...' (truncated)
 *
 * // With LOG_FULL_RESPONSES=true:
 * truncateForLog('very long text...', 50); // Returns full text
 * ```
 */
export function truncateForLog(text: string, maxLength = 200, suffix = '...'): string {
  if (!text) return text;
  if (isFullLoggingEnabled()) return text;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + suffix;
}

/**
 * Truncate for log with explicit full text capture option.
 *
 * Returns an object with both truncated preview and full text,
 * allowing logs to include the preview while optionally capturing full text.
 *
 * @param text - The text to process
 * @param maxLength - Maximum length for preview
 * @returns Object with preview and full text
 */
export function logPreview(
  text: string,
  maxLength = 200
): { preview: string; full: string; truncated: boolean } {
  if (!text) return { preview: '', full: '', truncated: false };
  const truncated = text.length > maxLength && !isFullLoggingEnabled();
  return {
    preview: truncated ? `${text.slice(0, maxLength)}...` : text,
    full: text,
    truncated,
  };
}

// Default export for convenience
export default safeLog;
