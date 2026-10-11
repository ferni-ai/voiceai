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
import type { ToolDomain } from './registry/types.js';

// Team handler registry (new generic system)
import { teamHandlerRegistry } from '../services/team-handler-registry/index.js';

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
export async function initializeTools(options?: {
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
}> {
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

  getLogger().info(
    {
      totalTools: result.loaded,
      domains: Object.keys(result.byDomain).length,
      lazyLoading: result.lazyLoadingEnabled,
      remainingDomains: result.remainingDomains.length,
    },
    result.lazyLoadingEnabled
      ? '🚀 Tool registry initialized (lazy loading enabled)'
      : '🔧 Tool registry initialized'
  );

  return result;
}

/**
 * Check if the tool registry has been initialized
 */
export function isToolRegistryInitialized(): boolean {
  return toolRegistry.isInitialized();
}

// ============================================================================
// TEAM HANDLERS
// ============================================================================

/**
 * Start the proactive scheduler, the one part of team-handler startup still
 * running. The team handler registry was behind USE_NEW_TEAM_HANDLERS, which
 * was never set in any environment (flag audit 2026-10-11), and the default
 * path logged "Legacy team handlers have been removed. Enable
 * USE_NEW_TEAM_HANDLERS=true" on every prod boot. Both are gone.
 */
export async function initializeTeamHandlers(): Promise<void> {
  try {
    const { getProactiveScheduler } = await import('../services/scheduling/proactive-scheduler.js');
    getProactiveScheduler().start();
    getLogger().info('⏰ Proactive scheduler started');
  } catch (error) {
    getLogger().warn({ error }, 'Error starting the proactive scheduler');
  }
}

/**
 * Check if the team handler registry is initialized
 */
export function isTeamHandlerRegistryInitialized(): boolean {
  return teamHandlerRegistry.isInitialized();
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Gracefully shut down all tool services
 */
export async function shutdownTools(): Promise<void> {
  // Stop Spotify auto-refresh
  try {
    const { shutdownSpotify } = await import('./domains/entertainment/spotify.js');
    shutdownSpotify();
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down Spotify');
  }

  // Stop proactive scheduler
  try {
    const { getProactiveScheduler } = await import('../services/scheduling/proactive-scheduler.js');
    getProactiveScheduler().stop();
    getLogger().info('⏰ Proactive scheduler stopped');
  } catch (error) {
    getLogger().warn({ error }, 'Error stopping proactive scheduler');
  }

  // Clean up team handler registry
  try {
    teamHandlerRegistry.clear();
    getLogger().info('🤝 Team handler registry cleared');
  } catch (error) {
    getLogger().warn({ error }, 'Error clearing team handler registry');
  }

  getLogger().info('Tool services shut down');
}
