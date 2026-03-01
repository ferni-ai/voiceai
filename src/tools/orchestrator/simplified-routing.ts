/**
 * Simplified tool routing strategy.
 *
 * Feature flag: USE_SIMPLIFIED_ROUTING=true
 *
 * PHILOSOPHY: Modern LLMs (OpenAI, Gemini) have excellent native function calling.
 * Our job is just to pre-filter to ~40 relevant tools and let the LLM decide.
 *
 * 3-LAYER APPROACH:
 * 1. Essential tools (always-on domains like memory, calendar, music)
 * 2. Semantic tools (embedding matching for the user's transcript)
 * 3. Contextual tools (emotion/time/crisis based boosting)
 *
 * Plus optional FTIS hierarchical classifier fast path.
 *
 * Extracted from tool-orchestrator.ts for modularity.
 */

import { getFtisThreshold, isFtisEnabled } from '../../config/tool-config.js';
import { getLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../registry/index.js';
import { loadToolDomainsLazy } from '../registry/loader.js';
import { EnvironmentServiceRegistry, type Tool, type ToolContext } from '../registry/types.js';
import type { SemanticMatch } from '../semantic-router/compat.js';
import {
  classifyHierarchicalSafe,
  isHierarchicalClassifierAvailable,
} from '../semantic-router/advanced/intelligent/hierarchical-classifier.js';
import { mapV7DomainToToolDomains } from '../semantic-router/advanced/intelligent/v7-domain-map.js';

import type {
  OrchestratorConfig,
  ToolSelectionRequest,
  ToolSelectionResult,
} from './orchestrator-types.js';
import {
  fetchAlwaysAvailableTools,
  fetchContextualTools,
  fetchSemanticTools,
  fetchToolsByIds,
} from './tool-fetchers.js';
import { buildCacheKey, limitTools } from './orchestrator-helpers.js';

const log = getLogger();

/**
 * Simplified tool selection: Trust the LLM to pick the right tool.
 *
 * Expects the orchestrator to be already initialized.
 */
export async function getToolsSimplifiedRoute(
  request: ToolSelectionRequest,
  config: OrchestratorConfig,
  cache: Map<string, { result: ToolSelectionResult; timestamp: number }>
): Promise<ToolSelectionResult> {
  const startTime = Date.now();

  // Check cache
  const cacheKey = buildCacheKey(request);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < config.selectionCacheTtlMs) {
    log.debug({ cacheKey }, '📋 [SIMPLIFIED] Returning cached tool selection');
    return cached.result;
  }

  const warnings: string[] = [];

  // Build tool context
  const ctx: ToolContext = {
    userId: request.userId,
    agentId: request.agentId,
    agentDisplayName: request.agentDisplayName || request.agentId,
    services: new EnvironmentServiceRegistry(),
    userLocation: request.userLocation,
  };

  // FTIS classifier fast path
  const ftisTools = await fetchFtisClassifiedTools(request.transcript, ctx);

  // 3 simple parallel fetches
  const [essentialTools, semanticResult, contextualTools] = await Promise.all([
    fetchAlwaysAvailableTools(ctx, config.alwaysDomains),
    Object.keys(ftisTools).length > 0
      ? Promise.resolve({ semanticTools: {}, matches: [] as SemanticMatch[] })
      : fetchSemanticTools(request.transcript, ctx, config.semanticThreshold, request.conversationHistory),
    config.enableContextualTools && request.context
      ? fetchContextualTools(request.context, ctx)
      : Promise.resolve({} as Record<string, Tool>),
  ]);

  const { semanticTools, matches } = semanticResult;

  const sources = {
    essential: Object.keys(essentialTools).length,
    semantic: Object.keys(semanticTools).length,
    contextual: Object.keys(contextualTools).length,
    mcp: 0,
    intelligence: Object.keys(ftisTools).length,
  };

  // Merge and limit
  let allTools: Record<string, Tool> = {
    ...essentialTools,
    ...semanticTools,
    ...contextualTools,
    ...ftisTools,
  };

  // Apply force include/exclude from request
  if (request.forceInclude?.length) {
    const forcedTools = await fetchToolsByIds(request.forceInclude, ctx);
    allTools = { ...allTools, ...forcedTools };
  }
  if (request.forceExclude?.length) {
    for (const toolId of request.forceExclude) {
      delete allTools[toolId];
    }
  }

  // Apply config-level include/exclude
  if (config.includedTools.length > 0) {
    const configIncludedTools = await fetchToolsByIds(config.includedTools, ctx);
    allTools = { ...allTools, ...configIncludedTools };
  }
  if (config.excludedTools.length > 0) {
    for (const toolId of config.excludedTools) {
      delete allTools[toolId];
    }
  }

  const finalTools = limitTools(allTools, config.maxTools, config.alwaysDomains);

  const result: ToolSelectionResult = {
    tools: finalTools,
    meta: {
      totalAvailable: toolRegistry.getAll().length,
      selected: Object.keys(finalTools).length,
      selectionTimeMs: Date.now() - startTime,
      sources,
      detectedIntent: null,
      semanticMatches: matches,
      warnings,
    },
  };

  // Cache result
  cache.set(cacheKey, { result, timestamp: Date.now() });

  log.info(
    {
      mode: 'SIMPLIFIED',
      selected: result.meta.selected,
      selectionTimeMs: result.meta.selectionTimeMs,
      sources,
      topSemanticMatches: matches.slice(0, 3).map((m) => ({
        tool: m.toolId,
        score: Math.round(m.similarity * 100),
      })),
    },
    '🔧 [SIMPLIFIED] Tool selection complete'
  );

  return result;
}

// ============================================================================
// FTIS HIERARCHICAL CLASSIFIER FAST PATH
// ============================================================================

/**
 * Attempt FTIS hierarchical classification for fast tool routing.
 * Returns classified tools if confidence is above threshold, otherwise empty.
 */
async function fetchFtisClassifiedTools(
  transcript: string,
  ctx: ToolContext
): Promise<Record<string, Tool>> {
  if (!isFtisEnabled() || !isHierarchicalClassifierAvailable()) {
    return {};
  }

  try {
    const ftisClassification = classifyHierarchicalSafe(transcript);
    const threshold = getFtisThreshold();

    if (!ftisClassification || ftisClassification.predictions.length === 0) {
      return {};
    }

    const topPrediction = ftisClassification.predictions[0];

    if (topPrediction.combinedConfidence < threshold) {
      log.debug(
        {
          domain: topPrediction.domain,
          metaTool: topPrediction.metaTool,
          combinedConfidence: topPrediction.combinedConfidence.toFixed(3),
          threshold,
        },
        '🧠 [FTIS] Low confidence, falling through to semantic'
      );
      return {};
    }

    // High confidence - map domain label to tool registry domains
    const toolDomains = mapV7DomainToToolDomains(topPrediction.domain);
    if (toolDomains.length === 0) {
      return {};
    }

    await loadToolDomainsLazy(toolDomains);

    const ftisTools: Record<string, Tool> = {};
    for (const domain of toolDomains) {
      const domainToolDefs = toolRegistry.query({ domains: [domain] });
      for (const toolDef of domainToolDefs) {
        try {
          ftisTools[toolDef.id] = toolDef.create(ctx);
        } catch {
          // Skip tools that fail to create
        }
      }
    }

    log.info(
      {
        transcript: transcript.slice(0, 50),
        domain: topPrediction.domain,
        toolDomains: toolDomains.join(','),
        metaTool: topPrediction.metaTool,
        domainConfidence: topPrediction.domainConfidence.toFixed(3),
        metaToolConfidence: topPrediction.metaToolConfidence.toFixed(3),
        combinedConfidence: topPrediction.combinedConfidence.toFixed(3),
        toolCount: Object.keys(ftisTools).length,
        latencyMs: ftisClassification.latencyMs,
      },
      '🧠 [FTIS] High confidence hierarchical classification'
    );

    return ftisTools;
  } catch (ftisError) {
    log.warn({ error: String(ftisError) }, 'FTIS classification failed, falling through');
    return {};
  }
}
