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
import { getLogger } from '../utils/safe-logger.js';
import { initializeToolRegistry } from './registry/loader.js';
import { toolRegistry } from './registry/index.js';
// Team handler registry (new generic system)
import { teamHandlerRegistry } from '../services/team-handler-registry/index.js';
import { initializeTeamHandlerRegistry } from '../services/team-handler-registry/loader.js';
// ============================================================================
// TOOL REGISTRY INITIALIZATION
// ============================================================================
/**
 * Initialize the tool registry with all available domains
 * Call this early during app startup before loading any agents
 *
 * Now supports lazy loading (enabled by default):
 * - Only essential domains load at startup
 * - Other domains are loaded on-demand
 */
export async function initializeTools(options) {
    getLogger().info('🔧 Initializing tool registry...');
    const result = await initializeToolRegistry({
        parallel: options?.parallel ?? true,
        domains: options?.domains,
        skipDomains: options?.skipDomains,
        lazyLoading: options?.lazyLoading,
        loadHighPriority: options?.loadHighPriority,
    });
    if (result.errors.length > 0) {
        getLogger().warn({ errors: result.errors }, 'Some domains failed to load');
    }
    getLogger().info({
        totalTools: result.loaded,
        domains: Object.keys(result.byDomain).length,
        lazyLoading: result.lazyLoadingEnabled,
        remainingDomains: result.remainingDomains.length,
    }, result.lazyLoadingEnabled
        ? '🚀 Tool registry initialized (lazy loading enabled)'
        : '🔧 Tool registry initialized');
    return result;
}
/**
 * Check if the tool registry has been initialized
 */
export function isToolRegistryInitialized() {
    return toolRegistry.isInitialized();
}
// ============================================================================
// TEAM HANDLERS
// ============================================================================
/**
 * Initialize team integration handlers
 * Call this during app startup to enable cross-agent communication
 *
 * Supports two modes:
 * - Legacy: Uses individual *-team-handlers.ts files (default)
 * - New: Uses the team handler registry system
 */
export async function initializeTeamHandlers(options) {
    const useNewSystem = options?.useNewSystem ?? process.env.USE_NEW_TEAM_HANDLERS === 'true';
    if (useNewSystem) {
        // NEW: Use the team handler registry
        try {
            const result = await initializeTeamHandlerRegistry({
                loadLegacy: true,
                loadManifests: true,
            });
            getLogger().info({
                legacyAgents: result.legacy.loaded,
                manifestAgents: result.manifests.loaded,
            }, '🤝 Team handler registry initialized');
            // Also start the proactive scheduler
            const { getProactiveScheduler } = await import('../services/scheduling/proactive-scheduler.js');
            const scheduler = getProactiveScheduler();
            scheduler.start();
            getLogger().info('⏰ Proactive scheduler started');
        }
        catch (error) {
            getLogger().warn({ error }, 'Error initializing team handler registry, falling back to legacy');
            await initializeLegacyTeamHandlers();
        }
    }
    else {
        // LEGACY: Use individual team handler files
        await initializeLegacyTeamHandlers();
    }
}
/**
 * Initialize team handlers using legacy system
 * @internal
 * @deprecated Legacy team handlers have been removed. Use USE_NEW_TEAM_HANDLERS=true instead.
 */
async function initializeLegacyTeamHandlers() {
    try {
        // Legacy team handlers have been migrated to the team-handler-registry system.
        // This function now just starts the proactive scheduler.
        const { getProactiveScheduler } = await import('../services/scheduling/proactive-scheduler.js');
        // Start the proactive scheduler for background notifications
        const scheduler = getProactiveScheduler();
        scheduler.start();
        getLogger().info('⏰ Proactive scheduler started');
        getLogger().warn('⚠️ Legacy team handlers have been removed. Enable USE_NEW_TEAM_HANDLERS=true for the new system.');
    }
    catch (error) {
        getLogger().warn({ error }, 'Error initializing team handlers');
    }
}
/**
 * Check if the team handler registry is initialized
 */
export function isTeamHandlerRegistryInitialized() {
    return teamHandlerRegistry.isInitialized();
}
// ============================================================================
// SHUTDOWN
// ============================================================================
/**
 * Gracefully shut down all tool services
 */
export async function shutdownTools() {
    // Stop Spotify auto-refresh
    try {
        const { shutdownSpotify } = await import('./domains/entertainment/spotify.js');
        shutdownSpotify();
    }
    catch (error) {
        getLogger().warn({ error }, 'Error shutting down Spotify');
    }
    // Stop proactive scheduler
    try {
        const { getProactiveScheduler } = await import('../services/scheduling/proactive-scheduler.js');
        getProactiveScheduler().stop();
        getLogger().info('⏰ Proactive scheduler stopped');
    }
    catch (error) {
        getLogger().warn({ error }, 'Error stopping proactive scheduler');
    }
    // Clean up team handler registry
    try {
        teamHandlerRegistry.clear();
        getLogger().info('🤝 Team handler registry cleared');
    }
    catch (error) {
        getLogger().warn({ error }, 'Error clearing team handler registry');
    }
    getLogger().info('Tool services shut down');
}
//# sourceMappingURL=lifecycle.js.map