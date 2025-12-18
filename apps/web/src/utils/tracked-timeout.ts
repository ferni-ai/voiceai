/**
 * Tracked Timeout Utility
 *
 * Provides setTimeout tracking for memory leak prevention during HMR and cleanup.
 * Use this module in UI components that need to track their timeouts.
 *
 * Usage:
 * ```typescript
 * import { createTimeoutTracker } from '../utils/tracked-timeout.js';
 *
 * const { trackedTimeout, clearAll } = createTimeoutTracker();
 *
 * // Use like setTimeout but auto-tracked
 * trackedTimeout(() => doSomething(), 500);
 *
 * // In dispose/cleanup function
 * clearAll();
 * ```
 */

/**
 * Creates a timeout tracker for a module.
 * Each module should create its own tracker to isolate cleanup.
 */
export function createTimeoutTracker() {
  const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

  /**
   * Tracked setTimeout that automatically removes itself when done.
   * All timeouts are cleared on clearAll() to prevent memory leaks.
   */
  function trackedTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      activeTimeouts.delete(id);
      callback();
    }, delay);
    activeTimeouts.add(id);
    return id;
  }

  /**
   * Clear a tracked timeout early (e.g., if animation is cancelled).
   */
  function clearTracked(id: ReturnType<typeof setTimeout>): void {
    clearTimeout(id);
    activeTimeouts.delete(id);
  }

  /**
   * Clear all tracked timeouts (called on dispose/cleanup).
   */
  function clearAll(): void {
    for (const id of activeTimeouts) {
      clearTimeout(id);
    }
    activeTimeouts.clear();
  }

  /**
   * Get count of active timeouts (for debugging).
   */
  function getActiveCount(): number {
    return activeTimeouts.size;
  }

  return {
    trackedTimeout,
    clearTracked,
    clearAll,
    getActiveCount,
  };
}

/**
 * Type for the timeout tracker returned by createTimeoutTracker.
 */
export type TimeoutTracker = ReturnType<typeof createTimeoutTracker>;






















