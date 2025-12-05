/* eslint-disable no-restricted-syntax */
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
interface FallbackLogger {
  debug: typeof console.debug;
  info: typeof console.info;
  warn: typeof console.warn;
  error: typeof console.error;
  child: (bindings: Record<string, unknown>) => FallbackLogger;
}

/**
 * Create a fallback logger that uses console methods
 */
function createFallbackLogger(bindings?: Record<string, unknown>): FallbackLogger {
  const prefix = bindings ? `[${Object.values(bindings).join(':')}] ` : '';

  return {
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
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
export function safeLog(): ReturnType<typeof log> | FallbackLogger {
  try {
    return log();
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
    return baseLogger.child(bindings) as unknown as FallbackLogger;
  } catch {
    return createFallbackLogger(bindings);
  }
}

// Default export for convenience
export default safeLog;
