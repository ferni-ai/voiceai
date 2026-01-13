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
export declare function createSessionManager<T extends SessionService>(serviceName: string, factory: ServiceFactory<T>): SessionServiceManager<T>;
/**
 * Register a session manager for centralized cleanup.
 * Registered managers will be cleaned up when cleanupRegisteredServices is called.
 */
export declare function registerSessionManager<T extends SessionService>(name: string, manager: SessionServiceManager<T>): void;
/**
 * Clean up all registered session managers for a given session.
 * This provides an additional safety net beyond session-cleanup.ts.
 */
export declare function cleanupRegisteredServices(sessionId: string): void;
/**
 * Get count of registered session managers
 */
export declare function getRegisteredManagerCount(): number;
declare const _default: {
    createSessionManager: typeof createSessionManager;
    registerSessionManager: typeof registerSessionManager;
    cleanupRegisteredServices: typeof cleanupRegisteredServices;
    getRegisteredManagerCount: typeof getRegisteredManagerCount;
};
export default _default;
//# sourceMappingURL=session-service.d.ts.map