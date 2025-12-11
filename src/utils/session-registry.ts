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

export default {
  createSessionRegistry,
  registerGlobalRegistry,
  resetSessionGlobally,
  resetAllSessionsGlobally,
  getGlobalRegistryStats,
};
