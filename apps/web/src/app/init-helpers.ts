/**
 * Init Helpers
 *
 * Error-isolated module initialization and tracked event listeners.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

// FIX: Track event listeners to prevent memory leaks
// All document/window event listeners should be added via addTrackedListener()
// and will be automatically removed in dispose()
let trackedListeners: Array<{
  target: EventTarget;
  event: string;
  handler: EventListener;
}> = [];

/**
 * Add an event listener and track it for cleanup.
 * Use this instead of direct addEventListener to prevent memory leaks.
 */
export function addTrackedListener(
  target: EventTarget,
  event: string,
  handler: EventListener
): void {
  target.addEventListener(event, handler);
  trackedListeners.push({ target, event, handler });
}

/**
 * Remove every tracked listener.
 * @returns how many listeners were removed
 */
export function removeTrackedListeners(): number {
  for (const { target, event, handler } of trackedListeners) {
    target.removeEventListener(event, handler);
  }
  const count = trackedListeners.length;
  trackedListeners = [];
  return count;
}

/**
 * Safe UI initialization wrapper - catches errors so one module doesn't break the app.
 * Supports both sync and async init functions.
 */
export function safeInit(name: string, initFn: () => void | Promise<void>): void {
  try {
    const result = initFn();
    // Handle async functions - fire and forget but log errors
    if (result instanceof Promise) {
      result.catch((error) => {
        log.error(`Failed to initialize ${name} (async):`, error);
      });
    }
  } catch (error) {
    log.error(`Failed to initialize ${name}:`, error);
    // Continue loading other modules
  }
}

/**
 * Deferred initialization - loads module after a delay to not block first render.
 * Use for non-critical features that can load after the UI is visible.
 */
export function deferredInit(name: string, delayMs: number, initFn: () => Promise<void>): void {
  setTimeout(() => {
    initFn().catch((error) => {
      log.error(`Failed to initialize ${name} (deferred):`, error);
    });
  }, delayMs);
}
