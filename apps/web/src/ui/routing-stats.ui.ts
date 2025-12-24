/**
 * Routing Stats UI - Semantic Router Observability Panel
 *
 * Displays real-time routing statistics in the dev panel.
 * Shows how tool calls are being handled (semantic router vs JSON workaround).
 *
 * @module ui/routing-stats
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('RoutingStatsUI');

// ============================================================================
// TYPES
// ============================================================================

export type RoutingPath =
  | 'semantic_auto_execute' // Semantic router executed tool directly
  | 'semantic_hint' // Semantic router provided hint to LLM
  | 'semantic_confirm' // Semantic router suggested confirmation to LLM
  | 'semantic_clarify' // Semantic router suggested clarification to LLM
  | 'semantic_conversation' // Semantic router determined conversation, no tool
  | 'json_fallback' // JSON workaround executed (LLM output JSON)
  | 'crisis_override' // Crisis detected, routing bypassed
  | 'disabled' // Semantic router was disabled
  | 'error'; // Semantic router encountered an error

export interface SemanticRoutingData {
  toolId?: string;
  confidence?: number;
  bypassed_llm?: boolean;
  routing_path?: RoutingPath;
}

interface RoutingStats {
  total: number;
  byPath: Map<RoutingPath, number>;
  toolsExecuted: Map<string, number>;
  avgConfidence: number;
  confidenceSum: number;
  confidenceCount: number;
}

// ============================================================================
// STATE
// ============================================================================

const stats: RoutingStats = {
  total: 0,
  byPath: new Map(),
  toolsExecuted: new Map(),
  avgConfidence: 0,
  confidenceSum: 0,
  confidenceCount: 0,
};

let panelElement: HTMLElement | null = null;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Handle incoming semantic routing data message
 */
export function handleRoutingData(data: SemanticRoutingData): void {
  stats.total++;

  // Track by path
  const path = data.routing_path || 'disabled';
  stats.byPath.set(path, (stats.byPath.get(path) || 0) + 1);

  // Track tools executed
  if (data.toolId) {
    stats.toolsExecuted.set(data.toolId, (stats.toolsExecuted.get(data.toolId) || 0) + 1);
  }

  // Track confidence
  if (typeof data.confidence === 'number') {
    stats.confidenceSum += data.confidence;
    stats.confidenceCount++;
    stats.avgConfidence = stats.confidenceSum / stats.confidenceCount;
  }

  log.debug('Routing stats updated', {
    total: stats.total,
    path,
    toolId: data.toolId,
    confidence: data.confidence,
  });

  // Update UI if panel is visible
  updatePanel();
}

/**
 * Reset routing stats (call on new session)
 */
export function resetRoutingStats(): void {
  stats.total = 0;
  stats.byPath.clear();
  stats.toolsExecuted.clear();
  stats.avgConfidence = 0;
  stats.confidenceSum = 0;
  stats.confidenceCount = 0;
  updatePanel();
}

/**
 * Get current stats (for export/debugging)
 */
export function getRoutingStats(): {
  total: number;
  byPath: Record<string, number>;
  toolsExecuted: Record<string, number>;
  avgConfidence: number;
} {
  return {
    total: stats.total,
    byPath: Object.fromEntries(stats.byPath),
    toolsExecuted: Object.fromEntries(stats.toolsExecuted),
    avgConfidence: stats.avgConfidence,
  };
}

/**
 * Create the routing stats panel element
 */
export function createRoutingStatsPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'routing-stats-panel';
  panel.innerHTML = `
    <style>
      .routing-stats-panel {
        background: var(--color-bg-tertiary, #1a1a2e);
        border-radius: var(--radius-md, 8px);
        padding: var(--space-md, 16px);
        font-size: 12px;
        margin-top: var(--space-sm, 8px);
      }
      .routing-stats-panel h4 {
        margin: 0 0 var(--space-sm, 8px) 0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted, #888);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .routing-stats-panel h4::before {
        content: '';
        display: inline-block;
        width: 8px;
        height: 8px;
        background: var(--color-semantic-success, #4ade80);
        border-radius: 50%;
      }
      .routing-stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-sm, 8px);
      }
      .routing-stat {
        background: var(--color-bg-elevated, #2a2a3e);
        padding: var(--space-sm, 8px);
        border-radius: var(--radius-sm, 4px);
      }
      .routing-stat-label {
        font-size: 10px;
        color: var(--color-text-muted, #888);
        margin-bottom: 2px;
      }
      .routing-stat-value {
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text-primary, #fff);
      }
      .routing-stat-value.good {
        color: var(--color-semantic-success, #4ade80);
      }
      .routing-stat-value.warning {
        color: var(--color-semantic-warning, #facc15);
      }
      .routing-paths {
        margin-top: var(--space-sm, 8px);
        padding-top: var(--space-sm, 8px);
        border-top: 1px solid var(--color-border-subtle, #333);
      }
      .routing-path {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
        font-size: 11px;
      }
      .routing-path-name {
        color: var(--color-text-secondary, #aaa);
      }
      .routing-path-count {
        color: var(--color-text-primary, #fff);
        font-weight: 500;
      }
      .routing-tools {
        margin-top: var(--space-sm, 8px);
        padding-top: var(--space-sm, 8px);
        border-top: 1px solid var(--color-border-subtle, #333);
      }
      .routing-tool {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
        font-size: 11px;
      }
      .routing-tool-name {
        color: var(--color-accent-primary, #3d5a45);
        font-family: monospace;
      }
      .no-data {
        color: var(--color-text-muted, #888);
        font-style: italic;
        text-align: center;
        padding: var(--space-md, 16px);
      }
    </style>
    <h4>Semantic Router Stats</h4>
    <div class="routing-stats-content">
      <div class="no-data">No routing data yet. Make a tool request!</div>
    </div>
  `;

  panelElement = panel;
  return panel;
}

// ============================================================================
// INTERNAL
// ============================================================================

function updatePanel(): void {
  if (!panelElement) return;

  const content = panelElement.querySelector('.routing-stats-content');
  if (!content) return;

  if (stats.total === 0) {
    content.innerHTML = `<div class="no-data">No routing data yet. Make a tool request!</div>`;
    return;
  }

  // Calculate percentages
  const semanticAutoCount = stats.byPath.get('semantic_auto_execute') || 0;
  const jsonFallbackCount = stats.byPath.get('json_fallback') || 0;
  const semanticPct = stats.total > 0 ? ((semanticAutoCount / stats.total) * 100).toFixed(0) : '0';
  const jsonPct = stats.total > 0 ? ((jsonFallbackCount / stats.total) * 100).toFixed(0) : '0';

  // Build path rows
  const pathRows = Array.from(stats.byPath.entries())
    .sort((a, b) => b[1] - a[1])
    .map(
      ([path, count]) => `
      <div class="routing-path">
        <span class="routing-path-name">${getPathLabel(path)}</span>
        <span class="routing-path-count">${count}</span>
      </div>
    `
    )
    .join('');

  // Build tool rows (top 5)
  const toolRows = Array.from(stats.toolsExecuted.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(
      ([tool, count]) => `
      <div class="routing-tool">
        <span class="routing-tool-name">${tool}</span>
        <span class="routing-path-count">${count}</span>
      </div>
    `
    )
    .join('');

  content.innerHTML = `
    <div class="routing-stats-grid">
      <div class="routing-stat">
        <div class="routing-stat-label">Total Requests</div>
        <div class="routing-stat-value">${stats.total}</div>
      </div>
      <div class="routing-stat">
        <div class="routing-stat-label">Avg Confidence</div>
        <div class="routing-stat-value ${stats.avgConfidence > 0.8 ? 'good' : stats.avgConfidence > 0.6 ? 'warning' : ''}">${(stats.avgConfidence * 100).toFixed(0)}%</div>
      </div>
      <div class="routing-stat">
        <div class="routing-stat-label">Semantic Auto</div>
        <div class="routing-stat-value good">${semanticPct}%</div>
      </div>
      <div class="routing-stat">
        <div class="routing-stat-label">JSON Fallback</div>
        <div class="routing-stat-value ${parseInt(jsonPct) > 30 ? 'warning' : ''}">${jsonPct}%</div>
      </div>
    </div>
    ${
      pathRows
        ? `
      <div class="routing-paths">
        <div class="routing-stat-label">By Routing Path</div>
        ${pathRows}
      </div>
    `
        : ''
    }
    ${
      toolRows
        ? `
      <div class="routing-tools">
        <div class="routing-stat-label">Top Tools</div>
        ${toolRows}
      </div>
    `
        : ''
    }
  `;
}

function getPathLabel(path: RoutingPath): string {
  switch (path) {
    case 'semantic_auto_execute':
      return '🚀 Auto Execute';
    case 'semantic_hint':
      return '💡 Hint';
    case 'semantic_confirm':
      return '❓ Confirm';
    case 'semantic_clarify':
      return '🤔 Clarify';
    case 'semantic_conversation':
      return '💬 Conversation';
    case 'json_fallback':
      return '🔄 JSON Fallback';
    case 'crisis_override':
      return '🚨 Crisis Override';
    case 'disabled':
      return '🚫 Disabled';
    case 'error':
      return '❌ Error';
    default:
      return path;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const routingStatsUI = {
  handleRoutingData,
  resetRoutingStats,
  getRoutingStats,
  createRoutingStatsPanel,
};

