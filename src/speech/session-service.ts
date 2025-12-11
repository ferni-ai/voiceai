/**
 * Session Service Manager
 *
 * Generic abstraction for session-scoped services.
 * Reduces boilerplate across the 27+ session-managed services in this module.
 *
 * @example
 * ```typescript
 * // Instead of repeating this pattern in every file:
 * const instances = new Map<string, MyService>();
 * export function getMyService(sessionId: string): MyService { ... }
 * export function resetMyService(sessionId: string): void { ... }
 *
 * // Use the abstraction:
 * const manager = createSessionManager('MyService', (sessionId) => new MyService(sessionId));
 * export const getMyService = manager.get;
 * export const resetMyService = manager.reset;
 * export const resetAllMyServices = manager.resetAll;
 * export const getActiveMyServiceCount = manager.getActiveCount;
 * ```
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'SessionService' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Interface that session-scoped services should implement
 */
export interface SessionService {
  /** Reset internal state (called before removal) */
  reset?: () => void;
}

/**
 * Factory function type for creating new service instances
 */
export type ServiceFactory<T extends SessionService> = (sessionId: string) => T;

/**
 * Session service manager interface
 */
export interface SessionServiceManager<T extends SessionService> {
  /** Get or create a service instance for a session */
  get: (sessionId: string) => T;

  /** Reset and remove a session's service instance */
  reset: (sessionId: string) => void;

  /** Reset all service instances */
  resetAll: () => void;

  /** Get count of active sessions */
  getActiveCount: () => number;

  /** Get all active session IDs */
  getActiveSessions: () => string[];

  /** Check if a session has an active instance */
  has: (sessionId: string) => boolean;
}

// ============================================================================
// SESSION SERVICE MANAGER FACTORY
// ============================================================================

/**
 * Create a session service manager for a given service type.
 *
 * This provides a standardized way to manage session-scoped service instances
 * with consistent naming, logging, and cleanup behavior.
 *
 * @param serviceName - Name for logging (e.g., 'AudioProsody', 'VoiceTremor')
 * @param factory - Factory function to create new instances
 * @returns Session service manager with get/reset/resetAll functions
 */
export function createSessionManager<T extends SessionService>(
  serviceName: string,
  factory: ServiceFactory<T>
): SessionServiceManager<T> {
  const instances = new Map<string, T>();

  return {
    get(sessionId: string): T {
      let instance = instances.get(sessionId);
      if (!instance) {
        instance = factory(sessionId);
        instances.set(sessionId, instance);
        log.debug({ sessionId, serviceName }, `Created ${serviceName} instance`);
      }
      return instance;
    },

    reset(sessionId: string): void {
      const instance = instances.get(sessionId);
      if (instance) {
        // Call reset if the service implements it
        if (typeof instance.reset === 'function') {
          instance.reset();
        }
        instances.delete(sessionId);
        log.debug({ sessionId, serviceName }, `Reset ${serviceName} instance`);
      }
    },

    resetAll(): void {
      const count = instances.size;
      for (const [sessionId, instance] of instances) {
        if (typeof instance.reset === 'function') {
          instance.reset();
        }
      }
      instances.clear();
      log.debug({ serviceName, count }, `Reset all ${serviceName} instances`);
    },

    getActiveCount(): number {
      return instances.size;
    },

    getActiveSessions(): string[] {
      return [...instances.keys()];
    },

    has(sessionId: string): boolean {
      return instances.has(sessionId);
    },
  };
}

// ============================================================================
// SESSION CLEANUP REGISTRY
// ============================================================================

/**
 * Registry of all session managers for centralized cleanup.
 * Services can register themselves here to be automatically cleaned up.
 */
const registeredManagers: Array<{
  name: string;
  manager: SessionServiceManager<SessionService>;
}> = [];

/**
 * Register a session manager for centralized cleanup.
 * Registered managers will be cleaned up when cleanupRegisteredServices is called.
 */
export function registerSessionManager<T extends SessionService>(
  name: string,
  manager: SessionServiceManager<T>
): void {
  registeredManagers.push({ name, manager: manager as SessionServiceManager<SessionService> });
}

/**
 * Clean up all registered session managers for a given session.
 * This provides an additional safety net beyond session-cleanup.ts.
 */
export function cleanupRegisteredServices(sessionId: string): void {
  for (const { name, manager } of registeredManagers) {
    try {
      manager.reset(sessionId);
    } catch (error) {
      log.warn({ sessionId, serviceName: name, error: String(error) }, 'Failed to cleanup service');
    }
  }
}

/**
 * Get count of registered session managers
 */
export function getRegisteredManagerCount(): number {
  return registeredManagers.length;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createSessionManager,
  registerSessionManager,
  cleanupRegisteredServices,
  getRegisteredManagerCount,
};
