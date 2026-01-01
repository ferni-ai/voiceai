/**
 * Session Registry Utility
 *
 * Generic utility for managing session-scoped service instances.
 * Provides a consistent pattern for creating, accessing, and cleaning up
 * session-specific state across the codebase.
 *
 * This eliminates the duplicated boilerplate found in many modules:
 * - const instances = new Map<string, Service>()
 * - function getService(sessionId) { ... }
 * - function resetService(sessionId) { ... }
 * - function resetAllServices() { ... }
 *
 * @example
 * ```typescript
 * // Create a registry for your service
 * const userSessionRegistry = createSessionRegistry(
 *   (sessionId) => new UserSessionService(sessionId),
 *   (service) => service.cleanup()
 * );
 *
 * // Use it
 * const service = userSessionRegistry.get('session-123');
 * userSessionRegistry.reset('session-123');
 * userSessionRegistry.resetAll();
 * ```
 */

import { getLogger } from './safe-logger.js';

const log = getLogger().child({ module: 'SessionRegistry' });

/**
 * Session registry interface
 */
export interface SessionRegistry<T> {
  /**
   * Get or create a service instance for the given session.
   * If the instance doesn't exist, it will be created using the factory.
   */
  get: (sessionId: string) => T;

  /**
   * Check if a session has an active instance
   */
  has: (sessionId: string) => boolean;

  /**
   * Reset (cleanup and remove) a specific session's instance.
   * Calls the cleanup function if provided.
   */
  reset: (sessionId: string) => void;

  /**
   * Reset all session instances.
   * Useful for testing or shutdown.
   */
  resetAll: () => void;

  /**
   * Get the count of active sessions
   */
  getActiveCount: () => number;

  /**
   * Get all active session IDs (for debugging/monitoring)
   */
  getActiveSessionIds: () => string[];

  /**
   * Get the registry name (for debugging)
   */
  getName: () => string;
}

/**
 * Options for creating a session registry
 */
export interface SessionRegistryOptions<T> {
  /**
   * Optional name for the registry (used in logging)
   */
  name?: string;

  /**
   * Optional cleanup function called when a session is reset.
   * If the service has a reset() method, it will be called automatically.
   */
  cleanup?: (instance: T) => void;

  /**
   * Whether to log lifecycle events (default: false)
   */
  verbose?: boolean;
}

/**
 * Create a session registry for managing session-scoped service instances.
 *
 * @param factory - Function that creates a new instance for a session
 * @param options - Configuration options
 * @returns A session registry with get/reset/resetAll methods
 *
 * @example
 * ```typescript
 * // Simple usage
 * const registry = createSessionRegistry(
 *   (sessionId) => new MyService(sessionId)
 * );
 *
 * // With custom cleanup
 * const registry = createSessionRegistry(
 *   (sessionId) => new MyService(sessionId),
 *   { cleanup: (service) => service.dispose(), name: 'MyService' }
 * );
 *
 * // Usage
 * const service = registry.get('session-123');
 * registry.reset('session-123');
 * ```
 */
export function createSessionRegistry<T>(
  factory: (sessionId: string) => T,
  options: SessionRegistryOptions<T> = {}
): SessionRegistry<T> {
  const instances = new Map<string, T>();
  const { name = 'SessionRegistry', cleanup, verbose = false } = options;

  const registry: SessionRegistry<T> = {
    get(sessionId: string): T {
      let instance = instances.get(sessionId);
      if (!instance) {
        instance = factory(sessionId);
        instances.set(sessionId, instance);
        if (verbose) {
          log.debug({ sessionId, registry: name }, 'Created session instance');
        }
      }
      return instance;
    },

    has(sessionId: string): boolean {
      return instances.has(sessionId);
    },

    reset(sessionId: string): void {
      const instance = instances.get(sessionId);
      if (instance) {
        // Try to call reset() if it exists on the instance
        const maybeResettable = instance as unknown as { reset?: () => void };
        if (typeof maybeResettable.reset === 'function') {
          maybeResettable.reset();
        }
        // Call custom cleanup if provided
        if (cleanup) {
          cleanup(instance);
        }
        instances.delete(sessionId);
        if (verbose) {
          log.debug({ sessionId, registry: name }, 'Reset session instance');
        }
      }
    },

    resetAll(): void {
      const sessionIds = [...instances.keys()];
      for (const sessionId of sessionIds) {
        registry.reset(sessionId);
      }
      if (verbose && sessionIds.length > 0) {
        log.debug({ count: sessionIds.length, registry: name }, 'Reset all session instances');
      }
    },

    getActiveCount(): number {
      return instances.size;
    },

    getActiveSessionIds(): string[] {
      return [...instances.keys()];
    },

    getName(): string {
      return name;
    },
  };

  return registry;
}

/**
 * Global registry of all session registries (for coordinated cleanup)
 */
const globalRegistries: Array<SessionRegistry<unknown>> = [];

/**
 * Register a session registry for global tracking.
 * This allows coordinated cleanup of all registries.
 */
export function registerGlobalRegistry<T>(registry: SessionRegistry<T>): void {
  globalRegistries.push(registry as SessionRegistry<unknown>);
}

/**
 * Reset a specific session across ALL registered registries.
 * Useful for session cleanup where you want to ensure all state is cleared.
 */
export function resetSessionGlobally(sessionId: string): void {
  for (const registry of globalRegistries) {
    registry.reset(sessionId);
  }
}

/**
 * Reset ALL sessions across ALL registered registries.
 * Use with caution - typically only for shutdown or testing.
 */
export function resetAllSessionsGlobally(): void {
  for (const registry of globalRegistries) {
    registry.resetAll();
  }
}

/**
 * Get stats about all registered registries.
 */
export function getGlobalRegistryStats(): Array<{
  name: string;
  activeCount: number;
  sessionIds: string[];
}> {
  return globalRegistries.map((registry) => ({
    name: registry.getName(),
    activeCount: registry.getActiveCount(),
    sessionIds: registry.getActiveSessionIds(),
  }));
}

// ============================================================================
// SESSION ID HELPERS
// ============================================================================

/**
 * Safely get a session ID with fallback, logging a warning when fallback is used.
 *
 * This helps detect places where sessionId propagation is broken.
 * Every time 'unknown' is used as a fallback, we log it so developers can investigate.
 *
 * @param sessionId - The primary session ID (may be undefined/null)
 * @param context - Description of where this is called (for debugging)
 * @param fallback - What to use if sessionId is missing (default: 'unknown')
 * @returns The sessionId or fallback value
 *
 * @example
 * ```typescript
 * const sid = safeSessionId(ctx.sessionId, 'handoff-executor');
 * // If ctx.sessionId is undefined, logs a warning and returns 'unknown'
 * ```
 */
export function safeSessionId(
  sessionId: string | undefined | null,
  context: string,
  fallback = 'unknown'
): string {
  if (sessionId && sessionId !== 'unknown') {
    return sessionId;
  }

  // Log warning for debugging - this indicates a propagation issue
  log.warn(
    {
      context,
      hadValue: !!sessionId,
      fallback,
      stack: new Error().stack?.split('\n').slice(2, 5).join(' <- '),
    },
    '⚠️ SessionId fallback used - check sessionId propagation'
  );

  return fallback;
}

/**
 * Assert that a session ID is valid (not 'unknown' or empty).
 * Throws if invalid - use when sessionId is required.
 *
 * @param sessionId - The session ID to validate
 * @param context - Description of where this is called (for error messages)
 * @throws Error if sessionId is invalid
 *
 * @example
 * ```typescript
 * assertSessionId(ctx.sessionId, 'speech-coordinator'); // throws if invalid
 * ```
 */
export function assertSessionId(
  sessionId: string | undefined | null,
  context: string
): asserts sessionId is string {
  if (!sessionId || sessionId === 'unknown') {
    const error = new Error(
      `SessionId is required for ${context} but got: ${sessionId || 'undefined'}`
    );
    log.error(
      { context, sessionId, stack: error.stack },
      '❌ Required sessionId is missing or invalid'
    );
    throw error;
  }
}

/**
 * Check if a session ID is valid (not 'unknown', empty, or undefined).
 *
 * @param sessionId - The session ID to check
 * @returns true if the sessionId is valid
 */
export function isValidSessionId(sessionId: string | undefined | null): sessionId is string {
  return !!sessionId && sessionId !== 'unknown';
}

export default {
  createSessionRegistry,
  registerGlobalRegistry,
  resetSessionGlobally,
  resetAllSessionsGlobally,
  getGlobalRegistryStats,
  safeSessionId,
  assertSessionId,
  isValidSessionId,
};
