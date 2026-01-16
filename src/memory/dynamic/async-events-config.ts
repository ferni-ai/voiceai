/**
 * AsyncEvents Dependency Injection Configuration
 *
 * This module provides DI for the AsyncEvents service to avoid
 * architecture layer violations (memory L30 cannot import from services L60).
 *
 * The services layer calls `configureAsyncEvents()` during initialization
 * to inject the actual AsyncEvents implementation.
 *
 * @see src/memory/CLAUDE.md for the DI pattern documentation
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'AsyncEventsConfig' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Event emitter function type - matches AsyncEvents.emit signature
 */
export type AsyncEventEmitter = (event: string, data: unknown) => void;

/**
 * Event listener function type - matches AsyncEvents.on signature
 */
export type AsyncEventListener = (event: string, handler: (data: unknown) => void) => void;

/**
 * Configuration interface for AsyncEvents dependency injection
 */
export interface AsyncEventsConfig {
  /** Emit an event (fire-and-forget) */
  emit: AsyncEventEmitter;
  /** Listen for an event */
  on: AsyncEventListener;
}

// ============================================================================
// STATE
// ============================================================================

let asyncEventsConfig: AsyncEventsConfig | null = null;

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configure the AsyncEvents dependency.
 *
 * Called by services layer during initialization to inject the actual
 * AsyncEvents implementation without creating a layer violation.
 *
 * @example
 * ```typescript
 * // In services/index.ts or startup.ts
 * import { AsyncEvents } from '../services/async-events/index.js';
 * import { configureAsyncEvents } from '../memory/dynamic/async-events-config.js';
 *
 * configureAsyncEvents({
 *   emit: (event, data) => AsyncEvents.emit(event as never, data),
 *   on: (event, handler) => AsyncEvents.on(event as never, handler),
 * });
 * ```
 */
export function configureAsyncEvents(config: AsyncEventsConfig): void {
  asyncEventsConfig = config;
  log.info('AsyncEvents dependency configured for memory/dynamic module');
}

/**
 * Get the configured AsyncEvents instance.
 * Returns null if not configured - callers should handle gracefully.
 */
export function getAsyncEventsConfig(): AsyncEventsConfig | null {
  return asyncEventsConfig;
}

/**
 * Check if AsyncEvents is configured
 */
export function isAsyncEventsConfigured(): boolean {
  return asyncEventsConfig !== null;
}

/**
 * Reset configuration (for testing)
 */
export function resetAsyncEventsConfig(): void {
  asyncEventsConfig = null;
}

// ============================================================================
// SAFE WRAPPERS
// ============================================================================

/**
 * Safely emit an event. No-op if not configured.
 * Use this instead of direct AsyncEvents.emit to avoid layer violations.
 */
export function safeEmitEvent(event: string, data: unknown): boolean {
  if (!asyncEventsConfig) {
    log.debug({ event }, 'AsyncEvents not configured, skipping emit');
    return false;
  }

  try {
    asyncEventsConfig.emit(event, data);
    return true;
  } catch (error) {
    log.error({ error: String(error), event }, 'Failed to emit async event');
    return false;
  }
}

/**
 * Safely register an event listener. No-op if not configured.
 * Use this instead of direct AsyncEvents.on to avoid layer violations.
 */
export function safeOnEvent(event: string, handler: (data: unknown) => void): boolean {
  if (!asyncEventsConfig) {
    log.warn({ event }, 'AsyncEvents not configured, cannot register listener');
    return false;
  }

  try {
    asyncEventsConfig.on(event, handler);
    return true;
  } catch (error) {
    log.error({ error: String(error), event }, 'Failed to register event listener');
    return false;
  }
}
