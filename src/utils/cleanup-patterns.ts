/**
 * Cleanup Patterns for Event Listeners and Resources
 *
 * This module provides utilities and patterns for proper cleanup of:
 * - Event listeners (to prevent memory leaks)
 * - Timers (setTimeout/setInterval)
 * - Subscriptions
 *
 * USAGE GUIDELINES:
 * 1. Always pair addEventListener/on with removeEventListener/off
 * 2. Store timer IDs and clear them on cleanup
 * 3. Use the CleanupManager for complex components
 *
 * COMMON PATTERNS:
 *
 * Pattern 1: Named Handler Functions
 * ```typescript
 * // ✅ Good - handler can be removed
 * const handleData = (data: unknown) => { ... };
 * emitter.on('data', handleData);
 * // Later:
 * emitter.off('data', handleData);
 *
 * // ❌ Bad - anonymous function can't be removed
 * emitter.on('data', (data) => { ... });
 * ```
 *
 * Pattern 2: Cleanup in Disconnect Handler
 * ```typescript
 * // Store handlers for cleanup
 * const handlers = {
 *   dataReceived: (data: unknown) => { ... },
 *   stateChange: (state: string) => { ... },
 * };
 *
 * // Register
 * room.on('dataReceived', handlers.dataReceived);
 * room.on('stateChange', handlers.stateChange);
 *
 * // Cleanup on disconnect
 * room.on('disconnected', () => {
 *   room.off('dataReceived', handlers.dataReceived);
 *   room.off('stateChange', handlers.stateChange);
 * });
 * ```
 *
 * Pattern 3: Use CleanupManager
 * ```typescript
 * const cleanup = new CleanupManager();
 *
 * cleanup.addListener(emitter, 'event', handler);
 * cleanup.addTimer(setTimeout(...));
 *
 * // On component destroy:
 * cleanup.dispose();
 * ```
 */

import type { EventEmitter } from 'events';

/**
 * Interface for objects that can have event listeners
 */
interface EventTarget {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
}

/**
 * Cleanup item types
 */
type CleanupItem =
  | { type: 'listener'; target: EventTarget; event: string; handler: (...args: unknown[]) => void }
  | { type: 'timer'; id: ReturnType<typeof setTimeout> }
  | { type: 'interval'; id: ReturnType<typeof setInterval> }
  | { type: 'callback'; fn: () => void | Promise<void> };

/**
 * Manages cleanup of event listeners, timers, and other resources.
 *
 * Usage:
 * ```typescript
 * const cleanup = new CleanupManager();
 *
 * // Add listener - will be auto-removed on dispose
 * cleanup.addListener(eventEmitter, 'message', (msg) => { ... });
 *
 * // Add timer - will be auto-cleared on dispose
 * cleanup.addTimeout(() => { ... }, 5000);
 *
 * // Add custom cleanup callback
 * cleanup.onDispose(() => {
 *   closeConnection();
 * });
 *
 * // When done:
 * await cleanup.dispose();
 * ```
 */
export class CleanupManager {
  private items: CleanupItem[] = [];
  private disposed = false;

  /**
   * Add an event listener that will be removed on dispose
   */
  addListener<T extends EventTarget>(
    target: T,
    event: string,
    handler: (...args: unknown[]) => void
  ): void {
    if (this.disposed) {
      throw new Error('CleanupManager already disposed');
    }
    target.on(event, handler);
    this.items.push({ type: 'listener', target, event, handler });
  }

  /**
   * Add a setTimeout that will be cleared on dispose
   */
  addTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    if (this.disposed) {
      throw new Error('CleanupManager already disposed');
    }
    const id = setTimeout(callback, ms);
    this.items.push({ type: 'timer', id });
    return id;
  }

  /**
   * Add a setInterval that will be cleared on dispose
   */
  addInterval(callback: () => void, ms: number): ReturnType<typeof setInterval> {
    if (this.disposed) {
      throw new Error('CleanupManager already disposed');
    }
    const id = setInterval(callback, ms);
    this.items.push({ type: 'interval', id });
    return id;
  }

  /**
   * Add a custom cleanup callback to run on dispose
   */
  onDispose(callback: () => void | Promise<void>): void {
    if (this.disposed) {
      throw new Error('CleanupManager already disposed');
    }
    this.items.push({ type: 'callback', fn: callback });
  }

  /**
   * Remove a specific timer (if still tracked)
   */
  clearTimer(id: ReturnType<typeof setTimeout>): boolean {
    const index = this.items.findIndex(
      (item) => (item.type === 'timer' || item.type === 'interval') && item.id === id
    );
    if (index !== -1) {
      const item = this.items[index];
      if (!item) return false; // Guard for noUncheckedIndexedAccess
      if (item.type === 'timer') {
        clearTimeout(item.id);
      } else if (item.type === 'interval') {
        clearInterval(item.id);
      }
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Dispose all tracked resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    // Process in reverse order (LIFO)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item) continue; // Guard for noUncheckedIndexedAccess
      try {
        switch (item.type) {
          case 'listener':
            item.target.off(item.event, item.handler);
            break;
          case 'timer':
            clearTimeout(item.id);
            break;
          case 'interval':
            clearInterval(item.id);
            break;
          case 'callback':
            await item.fn();
            break;
        }
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.items = [];
  }

  /**
   * Check if already disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get count of tracked items
   */
  get size(): number {
    return this.items.length;
  }
}

/**
 * Create a self-removing event listener
 *
 * Usage:
 * ```typescript
 * const remove = addAutoCleanupListener(emitter, 'event', (data) => {
 *   // Handle event
 * });
 *
 * // Later, to remove:
 * remove();
 * ```
 */
export function addAutoCleanupListener<T extends EventTarget>(
  target: T,
  event: string,
  handler: (...args: unknown[]) => void
): () => void {
  target.on(event, handler);
  return () => target.off(event, handler);
}

/**
 * Create a one-time listener that auto-removes after firing
 */
export function addOnceListener<T extends EventTarget>(
  target: T,
  event: string,
  handler: (...args: unknown[]) => void
): () => void {
  const wrappedHandler = (...args: unknown[]) => {
    target.off(event, wrappedHandler);
    handler(...args);
  };
  target.on(event, wrappedHandler);
  return () => target.off(event, wrappedHandler);
}

export default CleanupManager;
