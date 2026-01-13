/**
 * Tools Lifecycle Management
 *
 * Handles initialization and shutdown of tool services.
 * Includes:
 * - Tool registry initialization (domain-based tools)
 * - Team handler registration for cross-agent communication
 * - NEW: Team handler registry (generic handler system)
 * - Service shutdown and cleanup
 */
import type { ToolDomain } from './registry/types.js';
/**
 * Initialize the tool registry with all available domains
 * Call this early during app startup before loading any agents
 *
 * Now supports lazy loading (enabled by default):
 * - Only essential domains load at startup
 * - Other domains are loaded on-demand
 */
export declare function initializeTools(options?: {
    domains?: ToolDomain[];
    skipDomains?: ToolDomain[];
    parallel?: boolean;
    /** Enable lazy loading (default: true) */
    lazyLoading?: boolean;
    /** Also load high-priority domains at startup */
    loadHighPriority?: boolean;
}): Promise<{
    loaded: number;
    byDomain: Record<ToolDomain, number>;
    errors: string[];
    lazyLoadingEnabled: boolean;
    remainingDomains: ToolDomain[];
}>;
/**
 * Check if the tool registry has been initialized
 */
export declare function isToolRegistryInitialized(): boolean;
/**
 * Initialize team integration handlers
 * Call this during app startup to enable cross-agent communication
 *
 * Supports two modes:
 * - Legacy: Uses individual *-team-handlers.ts files (default)
 * - New: Uses the team handler registry system
 */
export declare function initializeTeamHandlers(options?: {
    /** Use new registry-based system instead of legacy handlers */
    useNewSystem?: boolean;
}): Promise<void>;
/**
 * Check if the team handler registry is initialized
 */
export declare function isTeamHandlerRegistryInitialized(): boolean;
/**
 * Gracefully shut down all tool services
 */
export declare function shutdownTools(): Promise<void>;
//# sourceMappingURL=lifecycle.d.ts.map