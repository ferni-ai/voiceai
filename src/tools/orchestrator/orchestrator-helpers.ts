/**
 * Helper utilities for the Unified Tool Orchestrator.
 *
 * Standalone functions for tool limiting, cache key building,
 * diagnostics, and observability.
 *
 * Extracted from tool-orchestrator.ts for modularity.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../registry/index.js';
import type { Tool, ToolDomain } from '../registry/types.js';
import type { ToolSelectionRequest, ToolSelectionResult } from './orchestrator-types.js';

const log = getLogger();

// ============================================================================
// TOOL LIMITING
// ============================================================================

/**
 * Limit tools to maxTools, prioritizing essential domains.
 *
 * maxTools <= 0 means unlimited (matches TOOL_LIMIT=0 / model-config maxTools: 0).
 */
export function limitTools(
  tools: Record<string, Tool>,
  maxTools: number,
  alwaysDomains: ToolDomain[]
): Record<string, Tool> {
  if (maxTools <= 0) {
    return tools;
  }

  const entries = Object.entries(tools);

  if (entries.length <= maxTools) {
    return tools;
  }

  // Sort: essential domains first, then preserve insertion order
  const sorted = entries.sort(([idA], [idB]) => {
    const toolA = toolRegistry.get(idA);
    const toolB = toolRegistry.get(idB);

    // Essential domains always come first
    const aEssential = toolA && alwaysDomains.includes(toolA.domain);
    const bEssential = toolB && alwaysDomains.includes(toolB.domain);

    if (aEssential && !bEssential) return -1;
    if (bEssential && !aEssential) return 1;

    return 0; // Stable sort preserves original order
  });

  const limited = sorted.slice(0, maxTools);
  const result: Record<string, Tool> = {};

  for (const [id, tool] of limited) {
    result[id] = tool;
  }

  log.debug({ original: entries.length, limited: limited.length }, '🔪 Tools limited to max');

  return result;
}

// ============================================================================
// CACHE KEY
// ============================================================================

/**
 * Build cache key for tool selection.
 */
export function buildCacheKey(request: ToolSelectionRequest): string {
  // Normalize transcript to reduce cache misses
  const normalizedTranscript = request.transcript
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .slice(0, 100);

  return `${request.agentId}:${request.userId}:${normalizedTranscript}`;
}

// ============================================================================
// SESSION CONTEXT
// ============================================================================

/**
 * Get recent tools used in the session from context carrier.
 */
export function getRecentToolsFromSession(sessionId: string): string[] {
  try {
    const { getContextCarrier } = require('../context-carrier.js');
    const carrier = getContextCarrier();
    const sessionContext = carrier.getSessionContext(sessionId);
    return sessionContext?.toolsUsed?.slice(-10) || [];
  } catch {
    return [];
  }
}

// ============================================================================
// OBSERVABILITY
// ============================================================================

/**
 * Emit tool selection event for external monitoring systems.
 * Fire-and-forget - errors are logged but don't affect tool selection.
 */
export async function emitToolSelectionEvent(data: Record<string, unknown>): Promise<void> {
  try {
    // Import the observability emitter lazily to avoid circular deps
    const { emitToolIntelligenceEvent } = await import('../../api/observability-routes.js');
    emitToolIntelligenceEvent('tool_selection', data);
  } catch (err) {
    // Silently ignore - observability should never break tool selection
    log.debug({ error: String(err) }, 'Tool selection event emission failed (non-critical)');
  }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Explain why tools were selected (for debugging).
 */
export function explainSelection(result: ToolSelectionResult): string {
  let explanation = '🔧 Tool Selection Breakdown\n\n';

  explanation += `Selected ${result.meta.selected} of ${result.meta.totalAvailable} tools\n`;
  explanation += `Selection time: ${result.meta.selectionTimeMs}ms\n\n`;

  explanation += 'Sources:\n';
  explanation += `  • Essential (always): ${result.meta.sources.essential}\n`;
  explanation += `  • Semantic (matched): ${result.meta.sources.semantic}\n`;
  explanation += `  • Contextual (smart): ${result.meta.sources.contextual}\n`;
  explanation += `  • MCP (external): ${result.meta.sources.mcp}\n`;
  explanation += `  • Intelligence (anticipated): ${result.meta.sources.intelligence}\n\n`;

  // Better Than Human intelligence enhancement
  if (result.meta.intelligenceEnhancement) {
    const ie = result.meta.intelligenceEnhancement;
    explanation += '🧠 Better Than Human Intelligence:\n';
    explanation += `  • Returning user: ${ie.isReturningUser ? 'Yes' : 'No'}\n`;
    if (ie.anticipatedTools.length > 0) {
      explanation += `  • Anticipated tools: ${ie.anticipatedTools.join(', ')}\n`;
    }
    if (ie.prioritizedTools.length > 0) {
      explanation += `  • Prioritized tools: ${ie.prioritizedTools.slice(0, 5).join(', ')}\n`;
    }
    if (ie.proactiveSuggestions > 0) {
      explanation += `  • Proactive suggestions ready: ${ie.proactiveSuggestions}\n`;
    }
    explanation += '\n';
  }

  if (result.meta.detectedIntent) {
    explanation += `Detected Intent:\n`;
    explanation += `  Categories: ${result.meta.detectedIntent.categories.join(', ')}\n`;
    explanation += `  Domains: ${result.meta.detectedIntent.domains.join(', ')}\n`;
    explanation += `  Confidence: ${(result.meta.detectedIntent.confidence * 100).toFixed(0)}%\n\n`;
  }

  if (result.meta.semanticMatches.length > 0) {
    explanation += 'Top Semantic Matches:\n';
    for (const match of result.meta.semanticMatches.slice(0, 5)) {
      explanation += `  • ${match.toolId} (${(match.similarity * 100).toFixed(0)}%)\n`;
    }
  }

  if (result.meta.warnings.length > 0) {
    explanation += '\n⚠️ Warnings:\n';
    for (const warning of result.meta.warnings) {
      explanation += `  • ${warning}\n`;
    }
  }

  return explanation;
}
