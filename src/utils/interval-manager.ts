/**
 * Global Interval Manager
 *
 * Tracks and manages module-level setInterval calls to ensure they're
 * properly cleaned up on shutdown. Prevents resource leaks.
 *
 * Usage:
 * ```typescript
 * import { registerInterval, clearAllIntervals } from '../utils/interval-manager.js';
 *
 * // Instead of:
 * setInterval(() => doCleanup(), 60000);
 *
 * // Use:
 * registerInterval('rate-limiter-cleanup', () => doCleanup(), 60000);
 *
 * // On shutdown:
 * clearAllIntervals();
 * ```
 *
 * @module utils/interval-manager
 */

import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'IntervalManager' });

interface RegisteredInterval {
  id: ReturnType<typeof setInterval>;
  name: string;
  intervalMs: number;
  registeredAt: Date;
  lastRun?: Date;
  runCount: number;
}

const intervals = new Map<string, RegisteredInterval>();

/**
 * Register a named interval that will be tracked and can be cleaned up.
 *
 * @param name - Unique name for this interval
 * @param callback - Function to call on each interval
 * @param intervalMs - Interval in milliseconds
 * @returns Function to clear this specific interval
 */
export function registerInterval(
  name: string,
  callback: () => void | Promise<void>,
  intervalMs: number
): () => void {
  // Clear existing interval with same name
  if (intervals.has(name)) {
    clearInterval(intervals.get(name)!.id);
    log.debug({ name }, 'Replacing existing interval');
  }

  const wrappedCallback = () => {
    const entry = intervals.get(name);
    if (entry) {
      entry.lastRun = new Date();
      entry.runCount++;
    }
    try {
      const result = callback();
      if (result instanceof Promise) {
        result.catch((err) => {
          log.warn({ name, error: String(err) }, 'Interval callback error');
        });
      }
    } catch (err) {
      log.warn({ name, error: String(err) }, 'Interval callback error');
    }
  };

  const id = setInterval(wrappedCallback, intervalMs);

  intervals.set(name, {
    id,
    name,
    intervalMs,
    registeredAt: new Date(),
    runCount: 0,
  });

  log.debug({ name, intervalMs }, 'Registered interval');

  return () => clearNamedInterval(name);
}

/**
 * Clear a specific named interval.
 */
export function clearNamedInterval(name: string): boolean {
  const entry = intervals.get(name);
  if (entry) {
    clearInterval(entry.id);
    intervals.delete(name);
    log.debug({ name, runCount: entry.runCount }, 'Cleared interval');
    return true;
  }
  return false;
}

/**
 * Clear ALL registered intervals (for shutdown).
 */
export function clearAllIntervals(): number {
  const count = intervals.size;
  for (const [name, entry] of intervals) {
    clearInterval(entry.id);
    log.debug({ name, runCount: entry.runCount }, 'Cleared interval (shutdown)');
  }
  intervals.clear();

  if (count > 0) {
    log.info({ count }, 'Cleared all intervals');
  }

  return count;
}

/**
 * Get statistics about registered intervals.
 */
export function getIntervalStats(): Array<{
  name: string;
  intervalMs: number;
  registeredAt: Date;
  lastRun: Date | undefined;
  runCount: number;
}> {
  return Array.from(intervals.values()).map((entry) => ({
    name: entry.name,
    intervalMs: entry.intervalMs,
    registeredAt: entry.registeredAt,
    lastRun: entry.lastRun,
    runCount: entry.runCount,
  }));
}

/**
 * Check if an interval is registered.
 */
export function hasInterval(name: string): boolean {
  return intervals.has(name);
}
