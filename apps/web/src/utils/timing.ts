/**
 * Timing Utilities
 *
 * Centralized debounce and throttle functions for performance optimization.
 * Use these instead of creating inline versions in each file.
 *
 * USAGE:
 *   import { throttle, debounce, throttleRAF } from '../utils/timing.js';
 *
 *   // Throttle: Execute at most once per interval
 *   const throttledMove = throttle(handleMouseMove, 16); // ~60fps
 *
 *   // Debounce: Wait until activity stops
 *   const debouncedSearch = debounce(search, 300);
 *
 *   // RAF Throttle: Sync with animation frames
 *   const rafMove = throttleRAF(handleMouseMove);
 */

// ============================================================================
// THROTTLE
// ============================================================================

/**
 * Throttle a function to execute at most once per interval.
 * Good for: scroll, resize, mousemove handlers.
 *
 * @param fn - Function to throttle
 * @param limit - Minimum time (ms) between calls
 * @returns Throttled function
 *
 * @example
 * const handleScroll = throttle((e) => {
 *   console.log('scrolled', e.target.scrollTop);
 * }, 100);
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let lastArgs: Parameters<T> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = limit - (now - lastRun);

    lastArgs = args;

    if (remaining <= 0) {
      // Enough time passed, execute immediately
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastRun = now;
      fn(...args);
    } else if (!timeout) {
      // Schedule trailing call
      timeout = setTimeout(() => {
        lastRun = Date.now();
        timeout = null;
        if (lastArgs) {
          fn(...lastArgs);
        }
      }, remaining);
    }
  };
}

/**
 * Throttle using requestAnimationFrame.
 * Best for visual updates that should sync with browser repaints.
 *
 * @param fn - Function to throttle
 * @returns RAF-throttled function
 *
 * @example
 * const updatePosition = throttleRAF((x, y) => {
 *   element.style.transform = `translate(${x}px, ${y}px)`;
 * });
 */
export function throttleRAF<T extends (...args: unknown[]) => void>(
  fn: T
): (...args: Parameters<T>) => void {
  let frameId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    lastArgs = args;

    if (frameId === null) {
      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (lastArgs) {
          fn(...lastArgs);
        }
      });
    }
  };
}

// ============================================================================
// DEBOUNCE
// ============================================================================

/**
 * Debounce a function to execute only after activity stops.
 * Good for: search input, resize end, form validation.
 *
 * @param fn - Function to debounce
 * @param delay - Wait time (ms) after last call
 * @param options - Optional settings
 * @returns Debounced function with cancel method
 *
 * @example
 * const search = debounce(async (query) => {
 *   const results = await api.search(query);
 *   render(results);
 * }, 300);
 *
 * // Cancel pending call if needed
 * search.cancel();
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
  options: { leading?: boolean } = {}
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;

    // Leading edge execution
    if (options.leading && !timeout) {
      fn(...args);
    }

    // Clear existing timeout
    if (timeout) {
      clearTimeout(timeout);
    }

    // Set new timeout for trailing edge
    timeout = setTimeout(() => {
      timeout = null;
      // Only call if not leading, or if called again after leading
      if (!options.leading && lastArgs) {
        fn(...lastArgs);
      }
    }, delay);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

// ============================================================================
// LEADING EDGE THROTTLE
// ============================================================================

/**
 * Throttle that executes on the leading edge (immediately on first call).
 * Subsequent calls within the limit are ignored.
 *
 * @param fn - Function to throttle
 * @param limit - Minimum time (ms) between calls
 * @returns Leading-edge throttled function
 *
 * @example
 * const handleClick = throttleLeading(() => {
 *   submitForm();
 * }, 1000); // Prevent double-submit
 */
export function throttleLeading<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRun >= limit) {
      lastRun = now;
      fn(...args);
    }
  };
}
