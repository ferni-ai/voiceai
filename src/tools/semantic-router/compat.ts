/**
 * Compatibility Layer for Legacy Semantic Router API
 *
 * Provides backward-compatible API for files that used the old
 * `src/tools/semantic-router.ts` module.
 *
 * DEPRECATED: Prefer using the new API directly:
 * ```typescript
 * import { createSemanticRouter, routeUserInput } from './semantic-router/index.js';
 * ```
 *
 * @module tools/semantic-router/compat
 */

import { createLogger } from '../../utils/safe-logger.js';
import { SemanticRouter, createSemanticRouter, routeUserInput } from './router.js';
import { getToolRegistry, type SemanticToolRegistry } from './registry.js';
import { allToolDefinitions } from './tool-definitions/index.js';
import { mergeLocaleIntoTools } from './i18n/index.js';
import type { ToolDomain } from '../registry/types.js';

const log = createLogger({ module: 'semantic-router-compat' });

// ============================================================================
// LEGACY SEMANTIC MATCH TYPE
// ============================================================================

/**
 * Legacy SemanticMatch interface for backward compatibility
 */
export interface SemanticMatch {
  toolId: string;
  domain: ToolDomain;
  similarity: number;
  description: string;
}

// ============================================================================
// SINGLETON ROUTER INSTANCE
// ============================================================================

let routerInstance: SemanticRouter | null = null;
let initialized = false;
let embeddingCache: Map<string, number[]> = new Map();

function getRouter(): SemanticRouter {
  if (!routerInstance) {
    routerInstance = createSemanticRouter();
  }
  return routerInstance;
}

// ============================================================================
// LEGACY API IMPLEMENTATION
// ============================================================================

/**
 * Legacy semanticRouter object - provides the same API as the old semantic-router.ts
 * @deprecated Use the new createSemanticRouter() API instead
 */
export const semanticRouter = {
  /**
   * Initialize the semantic router
   * @deprecated Use createSemanticRouter().initialize() instead
   */
  async initialize(): Promise<void> {
    if (initialized) return;

    log.info('🔄 [compat] Initializing semantic router via compatibility layer');

    // IMPORTANT: ALWAYS merge locale triggers into tool definitions
    // This adds patterns like "check the weather" from en.json
    // We always re-register to ensure locale is merged, even if tools were
    // registered elsewhere without locale (registry.registerMany overwrites)
    const registry = getToolRegistry();
    const localizedTools = await mergeLocaleIntoTools(allToolDefinitions);
    registry.registerMany(localizedTools);
    log.info(
      { toolCount: localizedTools.length, registrySize: registry.size },
      '🌐 [compat] Locale triggers merged into tool definitions'
    );

    const router = getRouter();
    await router.initialize();
    initialized = true;
    log.info('✅ [compat] Semantic router initialized');
  },

  /**
   * Find relevant tools for a query (async version)
   * @deprecated Use routeUserInput() instead for full routing
   */
  async findRelevantToolsAsync(query: string): Promise<SemanticMatch[]> {
    const router = getRouter();
    const result = await router.route(query);

    // Convert new format to legacy SemanticMatch format
    return result.matches.map((match) => ({
      toolId: match.toolId,
      domain: 'general' as ToolDomain, // Legacy format doesn't have category
      similarity: match.confidence,
      description: match.matchReason || match.toolId,
    }));
  },

  /**
   * Find relevant tools for a query (sync version - actually still async)
   * @deprecated Use routeUserInput() instead
   */
  findRelevantTools(query: string): SemanticMatch[] {
    log.warn('[compat] findRelevantTools called - this is sync but should be async');
    // Return empty array for sync calls - callers should use async version
    return [];
  },

  /**
   * Clear cached embeddings
   * @deprecated Cache management is now internal
   */
  clearCache(): void {
    embeddingCache.clear();
    log.debug('[compat] Cache cleared');
  },

  /**
   * Check if router is initialized
   */
  isInitialized(): boolean {
    return initialized;
  },

  /**
   * Get the underlying router instance
   * @deprecated Access router directly via createSemanticRouter()
   */
  getRouter(): SemanticRouter {
    return getRouter();
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export { SemanticRouter } from './router.js';
export type { SemanticRouterConfig, SemanticRouterResult, ToolMatch } from './types.js';

