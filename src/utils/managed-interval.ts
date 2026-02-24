/**
 * Managed Interval Utility
 *
 * Wraps setInterval with a dispose pattern to prevent leaked intervals.
 * All periodic cleanup tasks should use this instead of raw setInterval.
 *
 * @module utils/managed-interval
 */

import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'managed-interval' });

export interface ManagedInterval {
  dispose(): void;
}

/**
 * Create a managed interval that can be cleanly disposed.
 *
 * @param fn - Function to execute on each interval
 * @param ms - Interval period in milliseconds
 * @param options - Optional configuration
 * @returns ManagedInterval with dispose() method
 */
export function createManagedInterval(
  fn: () => void,
  ms: number,
  options?: { unref?: boolean; label?: string }
): ManagedInterval {
  const id = setInterval(fn, ms);
  if (options?.unref) {
    id.unref();
  }
  return {
    dispose() {
      clearInterval(id);
      if (options?.label) {
        log.debug({ label: options.label }, 'Interval disposed');
      }
    },
  };
}
