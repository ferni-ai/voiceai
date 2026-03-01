/**
 * Unified Tool Orchestrator (UTO)
 *
 * The single source of truth for tool selection in Ferni.
 * Combines semantic retrieval, dynamic loading, permission filtering,
 * and context awareness into one elegant API.
 *
 * DESIGN PRINCIPLES:
 * 1. SCALE: Handle 1000+ tools by never showing >40 to the LLM
 * 2. SPEED: <100ms tool selection via caching and pre-computation
 * 3. CORRECTNESS: Always include the right tool via semantic matching
 * 4. DELIGHT: Contextual tools that anticipate user needs
 *
 * USAGE:
 *
 * // Initialize once at startup
 * await toolOrchestrator.initialize();
 *
 * // Get tools for a conversation turn
 * const tools = await toolOrchestrator.getToolsForIntent({
 *   transcript: "Play some relaxing jazz",
 *   userId: "user-123",
 *   agentId: "ferni",
 *   context: { emotion: "calm", timeOfDay: "evening" }
 * });
 *
 * // Mid-session tool refresh (when context shifts)
 * const newTools = await toolOrchestrator.refreshToolsForContext({
 *   newTranscript: "Actually, I'm feeling pretty stressed about my job",
 *   previousTools: currentTools,
 *   sessionId: "session-456"
 * });
 */

import { isFtisEnabled } from '../../config/tool-config.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  getSuggestedReplacement,
  initializeToolLifecycle,
  isToolDeprecated,
} from '../advanced/tool-lifecycle.js';
import { buildEssentialTools } from '../builder.js';
import { detectToolIntent } from '../dynamic-tool-router.js';
import { toolRegistry } from '../registry/index.js';
import { initializeToolRegistry } from '../registry/loader.js';
import { EnvironmentServiceRegistry, type Tool, type ToolContext, type ToolDomain } from '../registry/types.js';
import { semanticRouter } from '../semantic-router/compat.js';
import { initializeHierarchicalClassifier } from '../semantic-router/advanced/intelligent/hierarchical-classifier.js';

// Internal modules (extracted for modularity)
import { getDefaultConfig } from './orchestrator-config.js';
import {
  fetchAlwaysAvailableTools,
  fetchContextualTools,
  fetchSemanticTools,
  fetchToolsByIds,
  fetchToolsForDomains,
} from './tool-fetchers.js';
import {
  buildCacheKey,
  emitToolSelectionEvent,
  explainSelection,
  limitTools,
} from './orchestrator-helpers.js';
import { getToolsSimplifiedRoute } from './simplified-routing.js';

// Re-export all types for backward compatibility
export type {
  ToolSelectionRequest,
  ToolSelectionContext,
  ToolSelectionResult,
  RefreshRequest,
  RefreshResult,
  OrchestratorConfig,
} from './orchestrator-types.js';

import type {
  OrchestratorConfig,
  ToolSelectionRequest,
  ToolSelectionResult,
} from './orchestrator-types.js';

const log = getLogger();

// ============================================================================
// ORCHESTRATOR CLASS
// ============================================================================

export class UnifiedToolOrchestrator {
  private config: OrchestratorConfig;
  private initialized = false;
  private selectionCache = new Map<string, { result: ToolSelectionResult; timestamp: number }>();
  private toolContext: ToolContext | null = null;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    const baseConfig = getDefaultConfig();
    this.config = { ...baseConfig, ...config };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn('Tool orchestrator already initialized');
      return;
    }

    const startTime = Date.now();
    log.info('🚀 Initializing Unified Tool Orchestrator...');

    try {
      // Check if we have pre-built artifacts for fast semantic search
      let useManifestForSemantics = false;
      try {
        const { isManifestLoaded, loadToolManifest } =
          await import('../registry/manifest-loader.js');
        const { areEmbeddingsLoaded, loadPrecomputedEmbeddings } =
          await import('../semantic-router/precomputed-embeddings.js');

        if (!isManifestLoaded()) {
          await loadToolManifest();
        }
        if (!areEmbeddingsLoaded()) {
          await loadPrecomputedEmbeddings();
        }

        useManifestForSemantics = isManifestLoaded() && areEmbeddingsLoaded();
        if (useManifestForSemantics) {
          log.info('⚡ Pre-built manifest + embeddings available for fast semantic search');
        }
      } catch (artifactError) {
        log.debug({ error: String(artifactError) }, 'Pre-built artifacts not available');
      }

      // 1. Initialize tool registry with LAZY LOADING (only essential domains)
      await initializeToolRegistry({
        lazyLoading: true,
        loadHighPriority: true,
      });
      const allTools = toolRegistry.getAll();
      log.info(
        { toolCount: allTools.length, lazyLoading: true },
        '📦 Tool registry initialized (essential only)'
      );

      // 2. Initialize semantic router (builds embedding index)
      if (this.config.precomputeEmbeddings) {
        await semanticRouter.initialize();
        log.info('🎯 Semantic router initialized');
      }

      // 2b. Initialize FTIS hierarchical classifier
      if (isFtisEnabled()) {
        try {
          await initializeHierarchicalClassifier();
          log.info('🧠 FTIS hierarchical classifier initialized (2-stage domain→meta-tool)');
        } catch (ftisError) {
          log.warn(
            { error: String(ftisError) },
            'FTIS initialization failed, using semantic fallback'
          );
        }
      }

      // 3. Initialize tool lifecycle (A/B testing, deprecation, etc.)
      await initializeToolLifecycle({
        buildSemanticIndex: true,
        checkDeprecations: this.config.enableDeprecationWarnings,
        toolDefinitions: allTools,
      });
      log.info('🔄 Tool lifecycle initialized');

      // 4. Pre-cache essential tools
      await buildEssentialTools();
      log.info('⚡ Essential tools pre-cached');

      this.initialized = true;
      const elapsed = Date.now() - startTime;

      log.info(
        {
          totalTools: allTools.length,
          semanticIndex: this.config.precomputeEmbeddings,
          alwaysDomains: this.config.alwaysDomains,
          maxTools: this.config.maxTools,
          elapsedMs: elapsed,
        },
        '✅ Unified Tool Orchestrator ready'
      );
    } catch (error) {
      log.error({ error }, '❌ Failed to initialize tool orchestrator');
      throw error;
    }
  }

  // ==========================================================================
  // MAIN API: GET TOOLS FOR INTENT
  // ==========================================================================

  async getToolsForIntent(request: ToolSelectionRequest): Promise<ToolSelectionResult> {
    // Simplified routing feature flag
    if (process.env.USE_SIMPLIFIED_ROUTING === 'true') {
      return this.getToolsSimplified(request);
    }

    const startTime = Date.now();

    if (!this.initialized) {
      log.warn('Orchestrator not initialized, initializing now...');
      await this.initialize();
    }

    // Check cache
    const cacheKey = buildCacheKey(request);
    const cached = this.selectionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.selectionCacheTtlMs) {
      log.debug({ cacheKey }, '📋 Returning cached tool selection');
      return cached.result;
    }

    const warnings: string[] = [];
    const sources = { essential: 0, semantic: 0, contextual: 0, mcp: 0, intelligence: 0 };

    // Build tool context
    const ctx: ToolContext = {
      userId: request.userId,
      agentId: request.agentId,
      agentDisplayName: request.agentDisplayName || request.agentId,
      services: new EnvironmentServiceRegistry(),
      userLocation: request.userLocation,
    };

    // Intent detection (sync)
    const intent = detectToolIntent(request.transcript);

    // Parallelized tool fetching
    const [alwaysTools, semanticResult, contextualTools, intentTools] = await Promise.all([
      fetchAlwaysAvailableTools(ctx, this.config.alwaysDomains),
      fetchSemanticTools(request.transcript, ctx, this.config.semanticThreshold, request.conversationHistory),
      this.config.enableContextualTools && request.context
        ? fetchContextualTools(request.context, ctx)
        : Promise.resolve({} as Record<string, Tool>),
      intent.domains.length > 0
        ? fetchToolsForDomains(intent.domains, ctx, this.config)
        : Promise.resolve({} as Record<string, Tool>),
    ]);

    const { semanticTools, matches } = semanticResult;

    sources.essential = Object.keys(alwaysTools).length;
    sources.semantic = Object.keys(semanticTools).length;
    sources.contextual = Object.keys(contextualTools).length;

    if (intent.domains.length > 0) {
      log.debug(
        { intent: intent.categories, domains: intent.domains },
        '🎯 Intent-based domains detected'
      );
    }

    // Merge all tools
    let allTools: Record<string, Tool> = {
      ...alwaysTools,
      ...semanticTools,
      ...contextualTools,
      ...intentTools,
    };

    // Apply config-level includedTools
    if (this.config.includedTools.length > 0) {
      const configIncludedTools = await fetchToolsByIds(this.config.includedTools, ctx);
      allTools = { ...allTools, ...configIncludedTools };
      if (this.config.debugMode) {
        log.debug({ includedTools: this.config.includedTools }, '🔧 Config: Force-included tools');
      }
    }

    // Apply request-level force include
    if (request.forceInclude?.length) {
      const forcedTools = await fetchToolsByIds(request.forceInclude, ctx);
      allTools = { ...allTools, ...forcedTools };
    }

    // Apply config-level excludedTools
    if (this.config.excludedTools.length > 0) {
      const beforeCount = Object.keys(allTools).length;
      for (const toolId of this.config.excludedTools) {
        delete allTools[toolId];
      }
      if (this.config.debugMode) {
        const afterCount = Object.keys(allTools).length;
        log.debug(
          { excludedTools: this.config.excludedTools, removed: beforeCount - afterCount },
          '🔧 Config: Excluded tools filtered out'
        );
      }
    }

    // Apply request-level force exclude
    if (request.forceExclude?.length) {
      for (const toolId of request.forceExclude) {
        delete allTools[toolId];
      }
    }

    // Handle deprecations
    if (this.config.enableDeprecationWarnings) {
      for (const [toolId] of Object.entries(allTools)) {
        if (isToolDeprecated(toolId)) {
          const replacement = getSuggestedReplacement(toolId);
          if (replacement && !allTools[replacement]) {
            warnings.push(`Tool ${toolId} is deprecated, consider ${replacement}`);
          }
        }
      }
    }

    // Limit to max tools
    const finalTools = limitTools(allTools, this.config.maxTools, this.config.alwaysDomains);

    // Debug logging from config
    if (this.config.logToolSchemas) {
      const toolSchemas = Object.entries(finalTools).map(([id, tool]) => ({
        id,
        description: tool.description?.slice(0, 100),
      }));
      log.info({ toolSchemas }, '📋 Tool schemas being sent to LLM');
    }

    // Build result
    const result: ToolSelectionResult = {
      tools: finalTools,
      meta: {
        totalAvailable: toolRegistry.getAll().length,
        selected: Object.keys(finalTools).length,
        selectionTimeMs: Date.now() - startTime,
        sources,
        detectedIntent: intent.domains.length > 0 ? intent : null,
        semanticMatches: matches,
        warnings,
      },
    };

    // Cache result
    this.selectionCache.set(cacheKey, { result, timestamp: Date.now() });

    // Token budget estimation
    const toolSchemaTokens = Object.values(finalTools).reduce((total, tool) => {
      const descLen = tool.description?.length || 0;
      return total + 10 + Math.round(descLen / 4) + 50;
    }, 0);

    const MAX_TOOL_TOKENS = 8000;
    const toolUsagePercent = Math.round((toolSchemaTokens / MAX_TOOL_TOKENS) * 100);

    if (toolUsagePercent > 80) {
      log.warn(
        {
          toolCount: result.meta.selected,
          estimatedTokens: toolSchemaTokens,
          usagePercent: toolUsagePercent,
          maxTools: this.config.maxTools,
        },
        `⚠️ Tool schema size at ${toolUsagePercent}% of safe limit - consider reducing maxTools`
      );
    }

    // Observability logging
    const observabilityData = {
      transcript: request.transcript.slice(0, 50),
      userId: request.userId.slice(0, 8),
      personaId: request.agentId,
      sessionId: request.context?.sessionId?.slice(0, 12),
      selected: result.meta.selected,
      totalAvailable: result.meta.totalAvailable,
      selectionTimeMs: result.meta.selectionTimeMs,
      toolTokens: toolSchemaTokens,
      toolUsagePercent,
      maxTools: this.config.maxTools,
      layers: {
        semantic: matches.length > 0,
        intent: intent.domains.length > 0,
      },
      ...(intent.domains.length > 0 && {
        detectedDomains: intent.domains.slice(0, 3),
        intentConfidence: Math.round(intent.confidence * 100),
      }),
      topMatches: matches.slice(0, 3).map((m) => ({
        tool: m.toolId,
        score: Math.round(m.similarity * 100),
      })),
      sources,
    };

    log.info(observabilityData, '🔧 Tool selection complete');

    emitToolSelectionEvent(observabilityData).catch((err) => {
      log.debug({ error: String(err) }, 'Tool selection event emission failed (non-critical)');
    });

    return result;
  }

  // ==========================================================================
  // SIMPLIFIED ROUTING (Feature Flag: USE_SIMPLIFIED_ROUTING=true)
  // Delegated to simplified-routing.ts for modularity
  // ==========================================================================

  private async getToolsSimplified(request: ToolSelectionRequest): Promise<ToolSelectionResult> {
    if (!this.initialized) {
      log.warn('Orchestrator not initialized, initializing now...');
      await this.initialize();
    }
    return getToolsSimplifiedRoute(request, this.config, this.selectionCache);
  }

  // ==========================================================================
  // MID-SESSION REFRESH
  // ==========================================================================

  async shouldRefreshTools(request: import('./orchestrator-types.js').RefreshRequest): Promise<import('./orchestrator-types.js').RefreshResult> {
    const intent = detectToolIntent(request.newTranscript);

    const newDomainsNeeded = intent.domains.filter((domain) => {
      const domainTools = toolRegistry.query({ domains: [domain as ToolDomain] });
      return !domainTools.some((t) => request.previousTools.includes(t.id));
    });

    if (newDomainsNeeded.length === 0 && intent.confidence < 0.5) {
      return {
        shouldRefresh: false,
        toolsToAdd: [],
        toolsToRemove: [],
        reason: 'Current tools sufficient for detected intent',
      };
    }

    const toolsToAdd: string[] = [];
    for (const domain of newDomainsNeeded) {
      const domainTools = toolRegistry.query({ domains: [domain as ToolDomain] });
      toolsToAdd.push(...domainTools.slice(0, 5).map((t) => t.id));
    }

    const toolsToRemove = request.previousTools.filter((toolId) => {
      const tool = toolRegistry.get(toolId);
      return (
        tool && !this.config.alwaysDomains.includes(tool.domain) && !toolsToAdd.includes(toolId)
      );
    });

    const netChange = toolsToAdd.length - toolsToRemove.length;
    const projectedTotal = request.previousTools.length + netChange;

    if (projectedTotal > this.config.maxTools) {
      // Remove oldest non-essential tools to make room
    }

    return {
      shouldRefresh: toolsToAdd.length > 0,
      toolsToAdd,
      toolsToRemove: toolsToRemove.slice(0, 5),
      reason: `Detected shift to ${intent.categories.join(', ')} - adding ${toolsToAdd.length} tools`,
    };
  }

  // ==========================================================================
  // DIAGNOSTICS
  // ==========================================================================

  explainSelection(result: ToolSelectionResult): string {
    return explainSelection(result);
  }

  getStats(): {
    initialized: boolean;
    totalTools: number;
    cacheSize: number;
    config: OrchestratorConfig;
  } {
    return {
      initialized: this.initialized,
      totalTools: this.initialized ? toolRegistry.getAll().length : 0,
      cacheSize: this.selectionCache.size,
      config: this.config,
    };
  }

  clearCaches(): void {
    this.selectionCache.clear();
    semanticRouter.clearCache();
    log.info('🧹 Orchestrator caches cleared');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const toolOrchestrator = new UnifiedToolOrchestrator();

export default toolOrchestrator;
