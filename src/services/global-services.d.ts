/**
 * Global Services Management
 *
 * Handles initialization and access to globally shared services.
 * These services are shared across all sessions.
 */
import { type StartupCapabilities } from './deployment/startup-validation.js';
import type { GlobalServices } from './types.js';
/**
 * Initialize all global services
 * @param indexPersona - Whether to index persona content (expensive, should only do once)
 */
export declare function initializeServices(indexPersona?: boolean): Promise<GlobalServices>;
/**
 * Get global services (initializes if needed, but skips persona indexing if already done)
 * FIX: Uses promise cache to prevent race conditions during concurrent initialization
 */
export declare function getGlobalServices(): Promise<GlobalServices>;
/**
 * Get global services synchronously (returns null if not initialized)
 */
export declare function getGlobalServicesSync(): GlobalServices | null;
/**
 * Reset global services (for testing)
 */
export declare function resetGlobalServices(): Promise<void>;
/**
 * Get startup capabilities (what features are available)
 */
export declare function getStartupCapabilities(): StartupCapabilities | null;
/**
 * Mark persona as indexed (for external tracking)
 */
export declare function markPersonaIndexed(): void;
/**
 * Check if persona has been indexed
 */
export declare function isPersonaIndexed(): boolean;
//# sourceMappingURL=global-services.d.ts.map