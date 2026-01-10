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
 * Serialize an Error object for JSON logging.
 *
 * Error objects don't serialize to JSON properly because their properties
 * (message, stack, name) are not enumerable. This function extracts those
 * properties into a plain object that serializes correctly.
 */
export function serializeError(error) {
    if (error instanceof Error) {
        // Extract standard Error properties plus any custom properties (e.g., `code` on Node.js errors)
        const serialized = {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
        // Copy any additional enumerable properties from the error
        for (const key of Object.keys(error)) {
            serialized[key] = error[key];
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
function processBindings(bindings) {
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
function createFallbackLogger(bindings) {
    const prefix = bindings ? `[${Object.values(bindings).join(':')}] ` : '';
    // Helper to process first arg if it's a bindings object
    const processFirstArg = (args) => {
        if (args.length > 0 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
            return [processBindings(args[0]), ...args.slice(1)];
        }
        return args;
    };
    return {
        debug: (...args) => console.debug(prefix, ...processFirstArg(args)),
        info: (...args) => console.info(prefix, ...processFirstArg(args)),
        warn: (...args) => console.warn(prefix, ...processFirstArg(args)),
        error: (...args) => console.error(prefix, ...processFirstArg(args)),
        child: (childBindings) => createFallbackLogger({ ...bindings, ...childBindings }),
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
export function safeLog() {
    try {
        const baseLogger = log();
        // Wrap the logger to automatically serialize errors
        return wrapLoggerWithErrorSerialization(baseLogger);
    }
    catch {
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
function wrapLoggerWithErrorSerialization(pinoLogger) {
    const wrapMethod = (method) => (...args) => {
        // If first arg is an object (bindings), process it for error serialization
        if (args.length > 0 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
            const processedBindings = processBindings(args[0]);
            return pinoLogger[method](processedBindings, ...args.slice(1));
        }
        return pinoLogger[method](...args);
    };
    return {
        debug: wrapMethod('debug'),
        info: wrapMethod('info'),
        warn: wrapMethod('warn'),
        error: wrapMethod('error'),
        child: (childBindings) => {
            const childLogger = pinoLogger.child(childBindings);
            return wrapLoggerWithErrorSerialization(childLogger);
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
export function createLogger(bindings) {
    try {
        const baseLogger = log();
        const childLogger = baseLogger.child(bindings);
        // Wrap the child logger to automatically serialize errors
        return wrapLoggerWithErrorSerialization(childLogger);
    }
    catch {
        return createFallbackLogger(bindings);
    }
}
// Default export for convenience
export default safeLog;
