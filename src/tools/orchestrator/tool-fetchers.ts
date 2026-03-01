/**
 * Tool fetching functions for the Unified Tool Orchestrator.
 *
 * Standalone functions that retrieve tools from various sources:
 * - Always-available domains (Tier 0)
 * - Semantic matching (embedding similarity)
 * - Contextual signals (emotion, time, crisis)
 * - Specific domains or IDs
 *
 * Extracted from tool-orchestrator.ts for modularity.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../registry/index.js';
import { loadToolDomainsLazy } from '../registry/loader.js';
import type { Tool, ToolContext, ToolDomain } from '../registry/types.js';
import { semanticRouter, type SemanticMatch } from '../semantic-router/compat.js';
import type { OrchestratorConfig, ToolSelectionContext } from './orchestrator-types.js';

const log = getLogger();

// ============================================================================
// ALWAYS-AVAILABLE TOOLS (Tier 0)
// ============================================================================

/**
 * Get tools that are ALWAYS available (Tier 0).
 * These should already be loaded during initialization, but we'll check just in case.
 */
export async function fetchAlwaysAvailableTools(
  ctx: ToolContext,
  alwaysDomains: ToolDomain[]
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  log.info({ alwaysDomains }, '📦 Always-available domains config');

  // Ensure always-available domains are loaded (should already be loaded at init)
  const domainsToLoad = alwaysDomains.filter((domain) => {
    const existing = toolRegistry.query({ domains: [domain] });
    return existing.length === 0;
  });

  if (domainsToLoad.length > 0) {
    log.info({ domains: domainsToLoad }, '🔄 Lazy loading always-available domains');
    await loadToolDomainsLazy(domainsToLoad);
  }

  for (const domain of alwaysDomains) {
    const domainTools = toolRegistry.query({ domains: [domain] });
    const toolNames = domainTools.map((t) => t.id);
    log.info(
      { domain, toolCount: domainTools.length, toolNames },
      '📦 Querying always-available domain'
    );
    for (const toolDef of domainTools) {
      try {
        tools[toolDef.id] = toolDef.create(ctx);
      } catch (error) {
        log.warn(
          { toolId: toolDef.id, error: String(error) },
          'Failed to create always-available tool'
        );
      }
    }
  }

  log.info(
    { totalTools: Object.keys(tools).length, toolNames: Object.keys(tools) },
    '📦 Total always-available tools'
  );
  return tools;
}

// ============================================================================
// SEMANTIC RETRIEVAL
// ============================================================================

/**
 * Get tools based on semantic similarity to the user's intent.
 *
 * OPTIMIZATION: Uses pre-computed embeddings when available for 100x faster matching!
 * Then lazy-loads only the domains we actually need.
 */
export async function fetchSemanticTools(
  transcript: string,
  ctx: ToolContext,
  semanticThreshold: number,
  conversationHistory?: string[]
): Promise<{ semanticTools: Record<string, Tool>; matches: SemanticMatch[] }> {
  // Build query from transcript + recent history for better context
  let query = transcript;
  if (conversationHistory?.length) {
    const recentHistory = conversationHistory.slice(-3).join(' ');
    query = `${recentHistory} ${transcript}`;
  }

  // =========================================================================
  // FAST PATH: Use pre-computed embeddings if available (100x faster!)
  // =========================================================================
  let matches: SemanticMatch[] = [];
  try {
    const { areEmbeddingsLoaded, semanticSearchTools } =
      await import('../semantic-router/precomputed-embeddings.js');

    if (areEmbeddingsLoaded()) {
      // Use pre-computed embeddings for matching (near-instant)
      const precomputedMatches = await semanticSearchTools(query, {
        topK: 20,
        minSimilarity: semanticThreshold,
      });

      // Convert to SemanticMatch format (need domain from manifest)
      const { getToolEntry } = await import('../registry/manifest-loader.js');
      for (const m of precomputedMatches) {
        const entry = await getToolEntry(m.toolId);
        matches.push({
          toolId: m.toolId,
          domain: (entry?.domain || 'unknown') as ToolDomain,
          similarity: m.similarity,
          description: entry?.description || '',
        });
      }

      log.debug(
        { matchCount: matches.length, topMatch: matches[0]?.toolId },
        '⚡ Used pre-computed embeddings for semantic matching'
      );
    }
  } catch {
    // Fall back to semantic router
  }

  // =========================================================================
  // FALLBACK: Use semantic router (slower but works without pre-computed)
  // =========================================================================
  if (matches.length === 0) {
    matches = await semanticRouter.findRelevantToolsAsync(query);
  }

  // =========================================================================
  // LAZY LOADING: Load domains on-demand for matched tools
  // =========================================================================
  const tools: Record<string, Tool> = {};
  const domainsToLoad = new Set<string>();

  // First pass: identify which domains need to be loaded
  for (const match of matches) {
    const toolDef = toolRegistry.get(match.toolId);
    if (!toolDef) {
      // Tool not in registry - need to load its domain
      try {
        const { getToolEntry } = await import('../registry/manifest-loader.js');
        const entry = await getToolEntry(match.toolId);
        if (entry?.domain) {
          domainsToLoad.add(entry.domain);
        }
      } catch {
        // Can't determine domain, skip this tool
      }
    }
  }

  // Load missing domains in parallel
  const domainsArray = Array.from(domainsToLoad);
  if (domainsArray.length > 0) {
    log.debug({ domains: domainsArray }, '🔄 Lazy-loading domains for matched tools');
    await loadToolDomainsLazy(domainsArray as ToolDomain[]);
  }

  // Second pass: create tools (now domains should be loaded)
  for (const match of matches) {
    const toolDef = toolRegistry.get(match.toolId);
    if (toolDef) {
      try {
        tools[match.toolId] = toolDef.create(ctx);
      } catch (error) {
        log.warn({ toolId: match.toolId, error }, 'Failed to create semantic tool');
      }
    }
  }

  return { semanticTools: tools, matches };
}

// ============================================================================
// CONTEXTUAL TOOLS
// ============================================================================

/**
 * Get tools based on contextual signals (emotion, time, crisis).
 * Lazy loads domains as needed.
 */
export async function fetchContextualTools(
  context: ToolSelectionContext,
  ctx: ToolContext
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};
  const domainsToLoad: ToolDomain[] = [];

  // Crisis mode - load crisis tools
  if (context.isCrisis) {
    domainsToLoad.push('crisis' as ToolDomain);
  }

  // Emotional context
  if (context.emotion) {
    switch (context.emotion) {
      case 'stressed':
      case 'anxious':
        domainsToLoad.push('presence' as ToolDomain, 'wellness' as ToolDomain);
        break;
      case 'sad':
        domainsToLoad.push('self-compassion' as ToolDomain, 'grief' as ToolDomain);
        break;
      case 'excited':
      case 'happy':
        domainsToLoad.push('play' as ToolDomain, 'engagement' as ToolDomain);
        break;
    }
  }

  // Time of day
  if (context.timeOfDay) {
    switch (context.timeOfDay) {
      case 'morning':
        domainsToLoad.push('habits' as ToolDomain, 'productivity' as ToolDomain);
        break;
      case 'evening':
      case 'night':
        domainsToLoad.push('wellness' as ToolDomain, 'presence' as ToolDomain);
        break;
    }
  }

  // New user context
  if (context.isNewUser) {
    domainsToLoad.push('engagement' as ToolDomain);
  }

  // Dedupe domains
  const uniqueDomains = Array.from(new Set(domainsToLoad));

  // Lazy load domains that aren't loaded yet
  const unloadedDomains = uniqueDomains.filter((domain) => {
    const existing = toolRegistry.query({ domains: [domain] });
    return existing.length === 0;
  });

  if (unloadedDomains.length > 0) {
    log.debug({ domains: unloadedDomains }, '🔄 Lazy loading contextual domains');
    await loadToolDomainsLazy(unloadedDomains);
  }

  // Load contextual domains
  for (const domain of uniqueDomains) {
    const domainTools = toolRegistry.query({ domains: [domain] });
    for (const toolDef of domainTools.slice(0, 3)) {
      // Limit per domain
      try {
        tools[toolDef.id] = toolDef.create(ctx);
      } catch {
        // Ignore creation errors for contextual tools
      }
    }
  }

  return tools;
}

// ============================================================================
// DOMAIN / ID BASED FETCHING
// ============================================================================

/**
 * Get tools for specific domains.
 * Automatically lazy-loads domains if they're not already loaded.
 * Respects enabledDomains filter from model-config.json.
 */
export async function fetchToolsForDomains(
  domains: string[],
  ctx: ToolContext,
  config: Pick<OrchestratorConfig, 'enabledDomains' | 'debugMode'>
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  // Filter domains by enabledDomains config (if set)
  let filteredDomains = domains;
  if (config.enabledDomains.length > 0) {
    filteredDomains = domains.filter((d) => config.enabledDomains.includes(d));
    if (config.debugMode && filteredDomains.length !== domains.length) {
      log.debug(
        {
          requested: domains,
          allowed: config.enabledDomains,
          filtered: filteredDomains,
        },
        '🔧 Config: Filtered domains by enabledDomains'
      );
    }
  }

  // Lazy load domains that aren't loaded yet
  const domainsToLoad = filteredDomains.filter((domain) => {
    const existing = toolRegistry.query({ domains: [domain as ToolDomain] });
    return existing.length === 0;
  });

  if (domainsToLoad.length > 0) {
    log.debug({ domains: domainsToLoad }, '🔄 Lazy loading unloaded domains');
    await loadToolDomainsLazy(domainsToLoad as ToolDomain[]);
  }

  for (const domain of filteredDomains) {
    const domainTools = toolRegistry.query({ domains: [domain as ToolDomain] });
    for (const toolDef of domainTools) {
      try {
        tools[toolDef.id] = toolDef.create(ctx);
      } catch {
        // Ignore
      }
    }
  }

  return tools;
}

/**
 * Get specific tools by ID.
 */
export async function fetchToolsByIds(
  toolIds: string[],
  ctx: ToolContext
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  for (const id of toolIds) {
    const toolDef = toolRegistry.get(id);
    if (toolDef) {
      try {
        tools[id] = toolDef.create(ctx);
      } catch {
        // Ignore
      }
    }
  }

  return tools;
}
