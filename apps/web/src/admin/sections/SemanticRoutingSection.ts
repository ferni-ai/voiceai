/**
 * Semantic Routing Dashboard Section
 *
 * Shows semantic router metrics:
 * - Routing accuracy & bypass rate
 * - Latency P50/P95
 * - Cache hit rate
 * - Tool breakdown
 * - Match path distribution
 * - Correction rate (learning)
 * - A/B test status
 */

import { createLogger } from '../../utils/logger.js';
import { ICONS } from '../icons.js';

const log = createLogger('SemanticRoutingSection');

// ============================================================================
// TYPES
// ============================================================================

interface SemanticRoutingMetrics {
  aggregate: {
    totalRoutes: number;
    successfulRoutes: number;
    bypassedLLM: number;
    hints: number;
    conversations: number;
    errors: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    cacheHitRate: number;
    toolBreakdown: Record<string, number>;
    matchPathBreakdown: Record<string, number>;
  };
  learning: {
    totalCorrections: number;
    correctionRate: number;
    recentCorrections: Array<{
      query: string;
      predicted: string;
      actual: string;
      timestamp: string;
    }>;
  };
  abTests: {
    active: number;
    experiments: Array<{
      id: string;
      name: string;
      status: string;
      variants: number;
    }>;
  };
  proactive: {
    suggestionsToday: number;
    acceptanceRate: number;
  };
  community: {
    totalPatterns: number;
    avgConfidence: number;
    lastAggregation: string | null;
  };
  hourly: Array<{ hour: number; count: number; avgLatency: number }>;
  timestamp: string;
}

// ============================================================================
// STATE
// ============================================================================

let refreshInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// RENDER
// ============================================================================

export function render(): string {
  return `
    <div class="admin-section semantic-routing-section" role="region" aria-label="Semantic Routing Dashboard">
      <div class="section-header">
        <h2><span aria-hidden="true">${ICONS.routing}</span> Semantic Routing</h2>
        <div class="header-actions" role="toolbar" aria-label="Dashboard actions">
          <span class="live-indicator" role="status" aria-live="polite" aria-atomic="true">
            <span class="live-dot" aria-hidden="true"></span>
            <span id="total-routes">--</span> routes today
          </span>
          <button class="btn-secondary" onclick="window.semanticRouting?.refresh()" aria-label="Refresh metrics">
            <span aria-hidden="true">${ICONS.refresh}</span> Refresh
          </button>
        </div>
      </div>

      <!-- Key Metrics Cards -->
      <div class="metrics-grid" role="region" aria-label="Key metrics" aria-live="polite">
        <article class="metric-card highlight" aria-labelledby="bypass-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.zap}</div>
          <div class="metric-content">
            <div class="metric-value" id="bypass-rate" aria-describedby="bypass-label">--%</div>
            <div class="metric-label" id="bypass-label">LLM Bypass Rate</div>
            <div class="metric-subtext" id="bypass-count">-- direct executions</div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="latency-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.timer}</div>
          <div class="metric-content">
            <div class="metric-value" id="p50-latency" aria-describedby="latency-label">--ms</div>
            <div class="metric-label" id="latency-label">P50 Latency</div>
            <div class="metric-subtext" id="p95-latency">P95: --ms</div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="cache-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.database}</div>
          <div class="metric-content">
            <div class="metric-value" id="cache-hit-rate" aria-describedby="cache-label">--%</div>
            <div class="metric-label" id="cache-label">Cache Hit Rate</div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="correction-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.learning}</div>
          <div class="metric-content">
            <div class="metric-value" id="correction-rate" aria-describedby="correction-label">--%</div>
            <div class="metric-label" id="correction-label">Correction Rate</div>
            <div class="metric-subtext" id="corrections-count">-- corrections learned</div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="proactive-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.sparkles}</div>
          <div class="metric-content">
            <div class="metric-value" id="proactive-suggestions" aria-describedby="proactive-label">--</div>
            <div class="metric-label" id="proactive-label">Proactive Suggestions</div>
            <div class="metric-subtext" id="proactive-acceptance">--% accepted</div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="community-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.team}</div>
          <div class="metric-content">
            <div class="metric-value" id="community-patterns" aria-describedby="community-label">--</div>
            <div class="metric-label" id="community-label">Community Patterns</div>
            <div class="metric-subtext" id="community-confidence">--% avg confidence</div>
          </div>
        </article>
      </div>

      <!-- Two Column Layout -->
      <div class="two-column">
        <!-- Match Path Distribution -->
        <section class="subsection" aria-labelledby="match-path-heading">
          <h3 id="match-path-heading"><span aria-hidden="true">${ICONS.chart}</span> Match Path Distribution</h3>
          <div class="distribution-chart" id="match-path-chart" role="img" aria-label="Match path distribution">
            <div class="loading" role="status">Loading...</div>
          </div>
        </section>

        <!-- Hourly Volume -->
        <section class="subsection" aria-labelledby="hourly-heading">
          <h3 id="hourly-heading"><span aria-hidden="true">${ICONS.history}</span> Routing Volume (24h)</h3>
          <div class="hour-chart" id="routing-hour-chart" role="img" aria-label="Routing volume by hour">
            <div class="loading" role="status">Loading...</div>
          </div>
        </section>
      </div>

      <!-- Top Tools -->
      <section class="subsection" aria-labelledby="top-tools-heading">
        <h3 id="top-tools-heading"><span aria-hidden="true">${ICONS.wrench}</span> Top Routed Tools</h3>
        <div class="tool-list" id="top-tools" role="list" aria-label="Tool usage rankings">
          <div class="loading" role="status">Loading...</div>
        </div>
      </section>

      <!-- A/B Tests -->
      <section class="subsection" aria-labelledby="ab-tests-heading">
        <h3 id="ab-tests-heading"><span aria-hidden="true">${ICONS.beaker}</span> Active A/B Tests</h3>
        <div class="ab-tests-list" id="ab-tests-list" role="list" aria-label="Active experiments">
          <div class="empty-state">No active experiments</div>
        </div>
      </section>

      <!-- Recent Corrections (Learning) -->
      <section class="subsection" aria-labelledby="corrections-heading">
        <h3 id="corrections-heading"><span aria-hidden="true">${ICONS.learning}</span> Recent Corrections (Learning Loop)</h3>
        <div class="corrections-list" id="corrections-list" role="log" aria-label="Recent corrections" aria-live="polite">
          <div class="empty-state">No recent corrections</div>
        </div>
      </section>
    </div>

    <style>
      .semantic-routing-section {
        padding: var(--space-lg);
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-lg);
      }

      .section-header h2 {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        margin: 0;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--space-md);
      }

      .live-indicator {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        color: var(--color-text-secondary);
        font-size: 0.875rem;
      }

      .live-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-semantic-success);
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: var(--space-md);
        margin-bottom: var(--space-lg);
      }

      .metric-card {
        background: var(--color-bg-elevated);
        border-radius: var(--radius-lg);
        padding: var(--space-md);
        display: flex;
        gap: var(--space-sm);
      }

      .metric-card.highlight {
        background: linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary));
        color: white;
      }

      .metric-icon {
        font-size: 1.5rem;
        opacity: 0.7;
      }

      .metric-value {
        font-size: 1.5rem;
        font-weight: 700;
        line-height: 1;
      }

      .metric-label {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        margin-top: var(--space-xs);
      }

      .metric-card.highlight .metric-label {
        color: rgba(255,255,255,0.8);
      }

      .metric-subtext {
        font-size: 0.7rem;
        color: var(--color-text-muted);
        margin-top: 2px;
      }

      .metric-card.highlight .metric-subtext {
        color: rgba(255,255,255,0.6);
      }

      .subsection {
        margin-bottom: var(--space-lg);
      }

      .subsection h3 {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        font-size: 1rem;
        margin-bottom: var(--space-md);
        color: var(--color-text-secondary);
      }

      .two-column {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-lg);
        margin-bottom: var(--space-lg);
      }

      @media (max-width: 768px) {
        .two-column {
          grid-template-columns: 1fr;
        }
      }

      .distribution-chart {
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
        padding: var(--space-md);
      }

      .distribution-item {
        margin-bottom: var(--space-sm);
      }

      .distribution-label {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
        margin-bottom: var(--space-xs);
      }

      .distribution-bar-container {
        height: 8px;
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }

      .distribution-bar {
        height: 100%;
        background: var(--color-accent-primary);
        border-radius: var(--radius-sm);
        transition: width 0.3s ease;
      }

      .distribution-bar.pattern { background: var(--color-semantic-success); }
      .distribution-bar.keyword { background: var(--color-semantic-warning); }
      .distribution-bar.embedding { background: var(--color-accent-primary); }
      .distribution-bar.combined { background: var(--color-accent-secondary); }
      .distribution-bar.none { background: var(--color-text-muted); }

      .hour-chart {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 100px;
        padding: var(--space-sm);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
      }

      .hour-bar {
        flex: 1;
        background: var(--color-accent-primary);
        border-radius: 2px 2px 0 0;
        min-height: 4px;
        transition: height 0.3s ease;
      }

      .hour-bar.peak {
        background: var(--color-semantic-warning);
      }

      .tool-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-sm);
      }

      .tool-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-sm) var(--space-md);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
      }

      .tool-name {
        font-weight: 500;
        font-size: 0.875rem;
      }

      .tool-count {
        color: var(--color-text-secondary);
        font-size: 0.875rem;
      }

      .ab-tests-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
      }

      .ab-test-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-sm) var(--space-md);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
      }

      .ab-test-name {
        font-weight: 500;
      }

      .ab-test-status {
        font-size: 0.75rem;
        padding: 2px 8px;
        border-radius: var(--radius-full);
      }

      .ab-test-status.running {
        background: var(--color-semantic-success);
        color: white;
      }

      .ab-test-status.paused {
        background: var(--color-semantic-warning);
        color: white;
      }

      .corrections-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
        max-height: 200px;
        overflow-y: auto;
      }

      .correction-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: var(--space-sm) var(--space-md);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
        font-size: 0.875rem;
      }

      .correction-query {
        font-style: italic;
        color: var(--color-text-secondary);
      }

      .correction-change {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
      }

      .correction-predicted {
        color: var(--color-semantic-error);
        text-decoration: line-through;
      }

      .correction-arrow {
        color: var(--color-text-muted);
      }

      .correction-actual {
        color: var(--color-semantic-success);
        font-weight: 500;
      }

      .loading, .empty-state {
        color: var(--color-text-muted);
        text-align: center;
        padding: var(--space-md);
      }

      /* Accessibility */
      .btn-secondary:focus-visible,
      .metric-card:focus-visible,
      .tool-item:focus-visible,
      .ab-test-item:focus-visible,
      .correction-item:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .live-dot,
        .distribution-bar,
        .hour-bar {
          animation: none;
          transition: none;
        }
      }
    </style>
  `;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchSemanticMetrics(): Promise<SemanticRoutingMetrics | null> {
  try {
    const response = await fetch('/api/observability/semantic-routing');
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    log.error({ error }, 'Failed to fetch semantic routing metrics');
    return null;
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateUI(metrics: SemanticRoutingMetrics): void {
  const { aggregate, learning, abTests, proactive, community, hourly } = metrics;

  // Total routes
  const totalEl = document.getElementById('total-routes');
  if (totalEl) totalEl.textContent = aggregate.totalRoutes.toLocaleString();

  // Bypass rate
  const bypassRateEl = document.getElementById('bypass-rate');
  const bypassCountEl = document.getElementById('bypass-count');
  if (bypassRateEl && aggregate.totalRoutes > 0) {
    const rate = (aggregate.bypassedLLM / aggregate.totalRoutes) * 100;
    bypassRateEl.textContent = `${rate.toFixed(1)}%`;
  }
  if (bypassCountEl) {
    bypassCountEl.textContent = `${aggregate.bypassedLLM} direct executions`;
  }

  // Latency
  const p50El = document.getElementById('p50-latency');
  const p95El = document.getElementById('p95-latency');
  if (p50El) p50El.textContent = `${aggregate.p50LatencyMs}ms`;
  if (p95El) p95El.textContent = `P95: ${aggregate.p95LatencyMs}ms`;

  // Cache hit rate
  const cacheEl = document.getElementById('cache-hit-rate');
  if (cacheEl) cacheEl.textContent = `${(aggregate.cacheHitRate * 100).toFixed(1)}%`;

  // Correction rate
  const correctionRateEl = document.getElementById('correction-rate');
  const correctionsCountEl = document.getElementById('corrections-count');
  if (correctionRateEl) {
    correctionRateEl.textContent = `${(learning.correctionRate * 100).toFixed(2)}%`;
  }
  if (correctionsCountEl) {
    correctionsCountEl.textContent = `${learning.totalCorrections} corrections learned`;
  }

  // Proactive suggestions
  const proactiveEl = document.getElementById('proactive-suggestions');
  const proactiveAcceptEl = document.getElementById('proactive-acceptance');
  if (proactiveEl) proactiveEl.textContent = proactive.suggestionsToday.toString();
  if (proactiveAcceptEl) {
    proactiveAcceptEl.textContent = `${(proactive.acceptanceRate * 100).toFixed(0)}% accepted`;
  }

  // Community patterns
  const communityEl = document.getElementById('community-patterns');
  const communityConfEl = document.getElementById('community-confidence');
  if (communityEl) communityEl.textContent = community.totalPatterns.toString();
  if (communityConfEl) {
    communityConfEl.textContent = `${(community.avgConfidence * 100).toFixed(0)}% avg confidence`;
  }

  // Match path distribution
  const matchPathEl = document.getElementById('match-path-chart');
  if (matchPathEl) {
    const total = Object.values(aggregate.matchPathBreakdown).reduce((a, b) => a + b, 0) || 1;
    const paths = ['pattern', 'keyword', 'embedding', 'combined', 'none'];
    matchPathEl.innerHTML = paths
      .map((path) => {
        const count = aggregate.matchPathBreakdown[path] ?? 0;
        const pct = (count / total) * 100;
        return `
          <div class="distribution-item">
            <div class="distribution-label">
              <span>${formatMatchPath(path)}</span>
              <span>${count} (${pct.toFixed(1)}%)</span>
            </div>
            <div class="distribution-bar-container">
              <div class="distribution-bar ${path}" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Hourly chart
  const hourlyEl = document.getElementById('routing-hour-chart');
  if (hourlyEl && hourly.length > 0) {
    const maxCount = Math.max(...hourly.map((h) => h.count), 1);
    hourlyEl.innerHTML = hourly
      .map((h) => {
        const height = Math.max(4, (h.count / maxCount) * 100);
        const isPeak = h.count === maxCount && h.count > 0;
        return `<div class="hour-bar ${isPeak ? 'peak' : ''}" style="height: ${height}%" title="${h.hour}:00 - ${h.count} routes, ${h.avgLatency}ms avg"></div>`;
      })
      .join('');
  }

  // Top tools
  const topToolsEl = document.getElementById('top-tools');
  if (topToolsEl) {
    const tools = Object.entries(aggregate.toolBreakdown)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (tools.length === 0) {
      topToolsEl.innerHTML = '<div class="empty-state">No tools routed yet</div>';
    } else {
      topToolsEl.innerHTML = tools
        .map(
          ([toolId, count]) => `
          <div class="tool-item" role="listitem">
            <span class="tool-name">${escapeHtml(toolId)}</span>
            <span class="tool-count">${count}</span>
          </div>
        `
        )
        .join('');
    }
  }

  // A/B tests
  const abTestsEl = document.getElementById('ab-tests-list');
  if (abTestsEl) {
    if (abTests.experiments.length === 0) {
      abTestsEl.innerHTML = '<div class="empty-state">No active experiments</div>';
    } else {
      abTestsEl.innerHTML = abTests.experiments
        .map(
          (exp) => `
          <div class="ab-test-item" role="listitem">
            <div>
              <span class="ab-test-name">${escapeHtml(exp.name)}</span>
              <span class="ab-test-variants">(${exp.variants} variants)</span>
            </div>
            <span class="ab-test-status ${exp.status}">${exp.status}</span>
          </div>
        `
        )
        .join('');
    }
  }

  // Recent corrections
  const correctionsEl = document.getElementById('corrections-list');
  if (correctionsEl) {
    if (learning.recentCorrections.length === 0) {
      correctionsEl.innerHTML = '<div class="empty-state">No recent corrections</div>';
    } else {
      correctionsEl.innerHTML = learning.recentCorrections
        .slice(0, 10)
        .map(
          (c) => `
          <div class="correction-item" role="listitem">
            <span class="correction-query">"${escapeHtml(c.query)}"</span>
            <div class="correction-change">
              <span class="correction-predicted">${escapeHtml(c.predicted)}</span>
              <span class="correction-arrow">→</span>
              <span class="correction-actual">${escapeHtml(c.actual)}</span>
            </div>
          </div>
        `
        )
        .join('');
    }
  }
}

function formatMatchPath(path: string): string {
  const names: Record<string, string> = {
    pattern: 'Pattern Match',
    keyword: 'Keyword Match',
    embedding: 'Embedding Match',
    combined: 'Combined Score',
    none: 'No Match (Conversation)',
  };
  return names[path] ?? path;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// LIFECYCLE
// ============================================================================

export async function init(): Promise<void> {
  log.info('Initializing Semantic Routing section');

  // Initial fetch
  await refresh();

  // Refresh every 30 seconds
  refreshInterval = setInterval(refresh, 30000);

  // Expose refresh function globally
  (window as unknown as { semanticRouting: { refresh: () => Promise<void> } }).semanticRouting = {
    refresh,
  };
}

export async function refresh(): Promise<void> {
  const metrics = await fetchSemanticMetrics();
  if (metrics) {
    updateUI(metrics);
  }
}

export function cleanup(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

