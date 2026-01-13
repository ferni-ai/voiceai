/**
 * Tool Registry Loader
 *
 * Auto-discovers and loads tools from the domains/ directory.
 * Each domain folder should have an index.ts that exports tool definitions.
 *
 * LAZY LOADING:
 * By default, only essential domains are loaded at startup.
 * Other domains are loaded on-demand when requested.
 *
 * USAGE:
 *
 * // At startup (loads only essential domains by default)
 * await initializeToolRegistry();
 *
 * // Load all domains (legacy behavior)
 * await initializeToolRegistry({ lazyLoading: false });
 *
 * // Or load specific domains on-demand
 * await loadToolDomain('calendar');
 */
import { type ToolDefinition, type ToolDomain } from './types.js';
/**
 * Essential domains that are always loaded at startup.
 * These are needed for basic agent functionality.
 *
 * NOTE: Without semantic router, Gemini needs tools available at session start.
 * If a tool isn't here, Gemini won't know it can call it!
 */
export declare const ESSENTIAL_DOMAINS: ToolDomain[];
/**
 * High-priority domains loaded shortly after essential.
 * These are commonly used but load after startup to keep initial load fast.
 */
export declare const HIGH_PRIORITY_DOMAINS: ToolDomain[];
/**
 * Check if a domain has been loaded
 */
export declare function isDomainLoaded(domain: ToolDomain): boolean;
/**
 * Get list of loaded domains
 */
export declare function getLoadedDomains(): ToolDomain[];
/**
 * Register a domain loader
 */
export declare function registerDomainLoader(domain: ToolDomain, loader: () => Promise<ToolDefinition[]>): void;
/**
 * Load tools from a specific domain
 * @param domain The domain to load
 * @param options.isLazy Whether this is a lazy load (for metrics)
 */
export declare function loadToolDomain(domain: ToolDomain, options?: {
    isLazy?: boolean;
}): Promise<number>;
/**
 * Load a domain lazily (on-demand)
 * This is the preferred method for loading domains after startup.
 */
export declare function loadToolDomainLazy(domain: ToolDomain): Promise<number>;
/**
 * Load multiple domains lazily with timeout protection.
 * Prevents hanging requests if domain loading gets stuck.
 */
export declare function loadToolDomainsLazy(domains: ToolDomain[]): Promise<number>;
/**
 * Auto-register all domain loaders using static imports
 * This is required for Vitest and bundlers that can't handle dynamic imports with variables
 *
 * Call this before initializeToolRegistry() in test/production environments
 *
 * ⚠️ CRITICAL: This MUST include ALL domains from ALL_TOOL_DOMAINS in types.ts!
 * Missing domains = tools not available to voice agent!
 */
export declare function autoRegisterAllDomains(): Promise<void>;
export interface InitializeToolRegistryOptions {
    /** Specific domains to load (overrides lazyLoading) */
    domains?: ToolDomain[];
    /** Domains to skip */
    skipDomains?: ToolDomain[];
    /** Load domains in parallel */
    parallel?: boolean;
    /**
     * Enable lazy loading (default: true)
     * When true, only essential domains are loaded at startup.
     * Other domains are loaded on-demand.
     */
    lazyLoading?: boolean;
    /**
     * Also load high-priority domains at startup (only with lazyLoading)
     * Default: true
     */
    loadHighPriority?: boolean;
}
/**
 * Initialize the tool registry
 *
 * By default, uses lazy loading which only loads essential domains at startup.
 * Set lazyLoading: false for legacy behavior (load all domains).
 */
export declare function initializeToolRegistry(options?: InitializeToolRegistryOptions): Promise<{
    loaded: number;
    byDomain: Record<ToolDomain, number>;
    errors: string[];
    lazyLoadingEnabled: boolean;
    remainingDomains: ToolDomain[];
}>;
/**
 * Helper to convert existing tool creator functions to ToolDefinitions
 *
 * USAGE:
 * const legacyTools = createSomeTools();
 * const definitions = convertLegacyTools(legacyTools, 'productivity');
 */
export declare function convertLegacyTools(tools: Record<string, unknown>, domain: ToolDomain, options?: {
    prefix?: string;
    tags?: string[];
}): ToolDefinition[];
/**
 * Register legacy tools directly
 */
export declare function registerLegacyTools(tools: Record<string, unknown>, domain: ToolDomain, options?: {
    prefix?: string;
    tags?: string[];
}): number;
/**
 * Helper for domain index files to create a standard structure
 *
 * USAGE (in domains/calendar/index.ts):
 *
 * import { createDomainExport } from '../../registry/loader.js';
 * import { appointmentTools } from './appointments.js';
 * import { schedulingTools } from './scheduling.js';
 *
 * export const { getToolDefinitions, domain } = createDomainExport(
 *   'calendar',
 *   [...appointmentTools, ...schedulingTools]
 * );
 *
 * export default getToolDefinitions;
 */
export declare function createDomainExport(domain: ToolDomain, definitions: ToolDefinition[]): {
    getToolDefinitions: () => Promise<ToolDefinition[]>;
    domain: ToolDomain;
    definitions: ToolDefinition[];
};
declare const _default: {
    initializeToolRegistry: typeof initializeToolRegistry;
    loadToolDomain: typeof loadToolDomain;
    loadToolDomainLazy: typeof loadToolDomainLazy;
    loadToolDomainsLazy: typeof loadToolDomainsLazy;
    registerDomainLoader: typeof registerDomainLoader;
    isDomainLoaded: typeof isDomainLoaded;
    getLoadedDomains: typeof getLoadedDomains;
    ESSENTIAL_DOMAINS: ToolDomain[];
    HIGH_PRIORITY_DOMAINS: ToolDomain[];
    convertLegacyTools: typeof convertLegacyTools;
    registerLegacyTools: typeof registerLegacyTools;
    createDomainExport: typeof createDomainExport;
};
export default _default;
//# sourceMappingURL=loader.d.ts.map