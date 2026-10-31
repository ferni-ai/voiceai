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

import type { log } from '@livekit/agents';
import pino from 'pino';

import { redactLogDestination, redactPinoLogger } from './log-redaction.js';
import { redactErrorValue } from './error-text.js';

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

const MAX_LOG_DEPTH = 5;

/**
 * Sanitize values before pino serialization.
 * Prevents "Maximum call stack size exceeded" from circular / deeply nested objects
 * (seen in production transcript-handler crashes via pino multistream).
 */
/**
 * Size caps for logged values. Each log is one JSON line, and one oversized
 * line (the full essential-tool list) broke the LiveKit log stream
 * ("bufio.Scanner: token too long"), dropping every line after it.
 */
const MAX_LOG_STRING = 1000;
const MAX_LOG_ARRAY = 30;

function sanitizeForLog(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    if (value.length <= MAX_LOG_STRING || isFullLoggingEnabled()) return value;
    return `${value.slice(0, MAX_LOG_STRING)}…[+${value.length - MAX_LOG_STRING} chars]`;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return redactErrorValue(value); // any field: never the text an error quotes (error-text.ts)
  }

  if (depth >= MAX_LOG_DEPTH) {
    return '[MaxDepth]';
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_LOG_ARRAY)
      .map((item) => sanitizeForLog(item, depth + 1, seen));
    if (value.length > MAX_LOG_ARRAY) items.push(`[+${value.length - MAX_LOG_ARRAY} more]`);
    return items;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    result[key] = sanitizeForLog(nested, depth + 1, seen);
  }
  return result;
}

/**
 * Process logging bindings to ensure errors are serializable and objects are safe for pino.
 *
 * If the bindings contain an `error` key with an Error object,
 * it will be serialized to a plain object for proper JSON output.
 * All nested objects are depth-limited and circular-safe.
 */
function processBindings(bindings: Record<string, unknown>): Record<string, unknown> {
  if (!bindings || typeof bindings !== 'object') {
    return bindings;
  }

  const withErrors: Record<string, unknown> = { ...bindings };

  // err / error: name, message cut at its first quote, code, frames and cause only
  // (error-text.ts). A parse error quotes the caller text it choked on.
  if ('error' in withErrors) withErrors.error = redactErrorValue(withErrors.error);
  if ('err' in withErrors) withErrors.err = redactErrorValue(withErrors.err);

  return sanitizeForLog(withErrors) as Record<string, unknown>;
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
  return lazyLogger();
}

/**
 * Application log sink: JSON lines on stderr.
 *
 * In a LiveKit job process only stderr reaches the agent log; LiveKit's own
 * logger writes to the job's stdout, which is dropped. Module loggers that
 * bound to it (or whose info went to console.info/stdout) were invisible in
 * deployed calls: TURN_METRICS, tool counts, turn intelligence, and warnings
 * once they bound. One stderr sink works in the worker and in every job.
 */
let appSink: pino.Logger | null = null;

/**
 * stderr, written off the event loop. A pipe write is synchronous on Linux, and
 * a call's logs were the largest CPU owner left on a worker's first call (2.6 s
 * of 18.7 s busy, dev 2026-10-12): every line blocked the loop the VAD and the
 * reply's audio share. SonicBoom writes from libuv and batches what queues up
 * meanwhile; maxWrite stays at PIPE_BUF so a batch can't interleave with a line
 * another writer puts on fd 2. pino flushes it synchronously on exit. Tests keep
 * process.stderr, which they spy on.
 */
function appStream(): pino.DestinationStream {
  if (process.env.VITEST) return process.stderr;
  // Writes to fd 2 itself, past process.stderr, so it needs the phone redaction of its own
  return redactLogDestination(pino.destination({ dest: 2, sync: false, maxWrite: 4096 }));
}

function appLogger(): pino.Logger {
  appSink ??= redactPinoLogger(
    pino(
      {
        level: process.env.LOG_LEVEL || 'info',
        serializers: { error: redactErrorValue, err: redactErrorValue },
      },
      appStream()
    )
  );
  return appSink;
}

/** A logger whose output always goes to the stderr sink, whenever it was created. */
function lazyLogger(bindings?: Record<string, unknown>): FallbackLogger {
  let bound: FallbackLogger | null = null;
  const current = (): FallbackLogger => {
    if (bound) return bound;
    const base = appLogger();
    const target = bindings ? base.child(bindings) : base;
    bound = wrapLoggerWithErrorSerialization(target as unknown as ReturnType<typeof log>);
    return bound;
  };
  // A log line must never throw into its caller: a getter that throws while the
  // fields are sanitised, or a failed write, would otherwise turn a request's
  // reply into a 500 (an SMS's 988 or STOP confirmation among them).
  const call =
    (method: 'debug' | 'info' | 'warn' | 'error') =>
    (...args: unknown[]): void => {
      try {
        current()[method](...(args as Parameters<FallbackLogger['info']>));
      } catch (error) {
        // Dropped: losing one line beats breaking the caller. Counted and
        // announced on another channel, so a dark logger is never silent.
        noteDroppedLine(error);
      }
    };
  return {
    debug: call('debug'),
    info: call('info'),
    warn: call('warn'),
    error: call('error'),
    // Bindings whose getter throws (read by the spread) keep the parent's.
    child: (childBindings: Record<string, unknown>) => {
      try {
        return lazyLogger({ ...bindings, ...childBindings });
      } catch (error) {
        noteDroppedLine(error);
        return lazyLogger(bindings);
      }
    },
  };
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
let droppedLines = 0;

/** How many log lines were dropped because writing them failed (see lazyLogger). */
export function droppedLogLines(): number {
  return droppedLines;
}

/** Test helper: start the dropped-line count again. */
export function resetDroppedLogLinesForTests(): void {
  droppedLines = 0;
}

/** 1, 100, 10 000, …: an outage keeps announcing itself without a flood. */
function isPowerOf100(n: number): boolean {
  if (n < 1) return false;
  let x = n;
  while (x % 100 === 0) x /= 100;
  return x === 1;
}

/**
 * Counts a dropped line and, on the 1st, 100th, 10 000th…, says so through the
 * error sink (error-reporting sends it to Sentry, over the network), since the
 * write that failed may be stderr itself. The notice carries the count and the
 * failure's type only, never the line's fields.
 */
function noteDroppedLine(error: unknown): void {
  droppedLines += 1;
  if (!isPowerOf100(droppedLines)) return;
  try {
    const kind = error instanceof Error ? error.name : typeof error;
    const notice = new Error(
      `safe-logger dropped ${droppedLines} log line(s); last failure: ${kind}`
    );
    try {
      errorLogSink?.([{ error: notice }, 'Log lines are being dropped']);
    } catch {
      // The sink failing too leaves the count.
    }
    if (droppedLines === 1) process.stderr.write(`[safe-logger] ${notice.message}\n`);
  } catch {
    // Nothing left to tell; droppedLogLines() still has the count.
  }
}

export const getLogger = safeLog;

/** Receives the raw arguments of every error-level call (error reporting registers here). */
type ErrorLogSink = (args: unknown[]) => void;
let errorLogSink: ErrorLogSink | null = null;

/** Registers (or clears, with null) the sink that sees every error-level log call. */
export function setErrorLogSink(sink: ErrorLogSink | null): void {
  errorLogSink = sink;
}

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
      if (method === 'error' && errorLogSink) {
        try {
          errorLogSink(args);
        } catch {
          // A failing sink must not stop the log line.
        }
      }
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
  return lazyLogger(bindings);
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
