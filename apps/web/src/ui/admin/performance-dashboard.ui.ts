/**
 * Performance Dashboard UI
 *
 * Admin dashboard for monitoring voice agent performance metrics.
 * Shows turn latency, tool cache hit rates, circuit breaker status, and more.
 *
 * Usage:
 * - Access via admin panel or directly at /admin/performance
 * - Requires admin authentication
 *
 * @module ui/admin/performance-dashboard.ui
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('PerformanceDashboard');

// ============================================================================
// TYPES
// ============================================================================

interface TurnMetrics {
  avgTurnMs: number;
  slowTurnPercentage: number;
  totalTurns: number;
  turnsByPerformanceTier: Record<string, number>;
}

interface ToolCacheMetrics {
  hits: number;
  misses: number;
  hitRatePercent: number;
  estimatedTimeSavedMs: number;
}

interface TTSMetrics {
  totalRequests: number;
  cacheHits: number;
  speculativeHits: number;
  cacheHitRatePercent: number;
  estimatedLatencySavedMs: number;
}

interface ReliabilityMetrics {
  totalCalls: number;
  totalRetries: number;
  totalFailures: number;
  overallSuccessRate: string;
  openCircuits: number;
}

interface TriggerStats {
  name: string;
  checked: number;
  matched: number;
  fired: number;
  fireRate: number;
}

interface TriggerMetrics {
  summary: {
    totalChecked: number;
    totalMatched: number;
    totalFired: number;
    matchRate: number;
    fireRate: number;
  };
  topTriggers: TriggerStats[];
  topBuilders: TriggerStats[];
}

interface DashboardData {
  summary: {
    avgTurnMs: number;
    slowTurnPercentage: number;
    toolCacheHitRate: string;
    ttsCacheHitRate: string;
    totalEstimatedSavingsMs: number;
    toolSuccessRate: string;
    openCircuits: number;
    // Trigger metrics
    triggersChecked?: number;
    triggersMatched?: number;
    triggersFired?: number;
    triggerMatchRate?: string;
    triggerFireRate?: string;
  };
  turns: TurnMetrics;
  toolCache: ToolCacheMetrics;
  speculativeTts: TTSMetrics;
  reliability: ReliabilityMetrics;
  triggers?: TriggerMetrics;
}

// ============================================================================
// DASHBOARD CLASS
// ============================================================================

export class PerformanceDashboard {
  private container: HTMLElement | null = null;
  private refreshInterval: number | null = null;
  private data: DashboardData | null = null;

  constructor() {
    this.cleanup();
  }

  /**
   * Initialize and render the dashboard
   */
  async init(targetId = 'performance-dashboard'): Promise<void> {
    this.cleanup();

    const target = document.getElementById(targetId);
    if (!target) {
      log.warn({ targetId }, 'Dashboard target element not found');
      return;
    }

    this.container = target;
    this.container.innerHTML = this.renderLoading();

    await this.refresh();
    this.startAutoRefresh();
  }

  /**
   * Cleanup and remove dashboard
   */
  cleanup(): void {
    if (this.refreshInterval) {
      window.clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }

  /**
   * Refresh data from API
   */
  async refresh(): Promise<void> {
    try {
      const response = await fetch('/api/performance/voice-dashboard', {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.data = await response.json();
      this.render();
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to fetch dashboard data');
      if (this.container) {
        this.container.innerHTML = this.renderError(String(error));
      }
    }
  }

  /**
   * Start auto-refresh every 10 seconds
   */
  private startAutoRefresh(): void {
    this.refreshInterval = window.setInterval(() => {
      this.refresh();
    }, 10000);
  }

  /**
   * Render the dashboard
   */
  private render(): void {
    if (!this.container || !this.data) return;

    this.container.innerHTML = `
      <div class="perf-dashboard">
        <header class="perf-header">
          <h2>Voice Agent Performance</h2>
          <button aria-label="Refresh" class="refresh-btn" onclick="window.perfDashboard?.refresh()">↻ Refresh</button>
        </header>

        ${this.renderSummaryCards()}
        ${this.renderTurnMetrics()}
        ${this.renderCacheMetrics()}
        ${this.renderReliabilityMetrics()}
        ${this.renderTriggerMetrics()}
      </div>

      <style>
        .perf-dashboard {
          font-family: var(--font-body);
          padding: var(--space-4);
          max-width: min(1200px, 100%);
          margin: 0 auto;
        }

        .perf-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-6);
        }

        .perf-header h2 {
          font-size: var(--text-2xl);
          font-weight: var(--font-weight-semibold);
          color: var(--color-text-primary);
          margin: 0;
        }

        .refresh-btn {
          padding: var(--space-2) var(--space-4);
          background: var(--color-accent-primary);
          color: var(--color-text-inverse);
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--text-sm);
          transition: var(--transition-all-fast);
        }

        .refresh-btn:hover {
          background: var(--color-accent-hover);
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--space-4);
          margin-bottom: var(--space-6);
        }

        .summary-card {
          background: var(--color-background-elevated);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          box-shadow: var(--shadow-sm);
        }

        .summary-card.warning {
          border-left: 4px solid var(--color-semantic-warning);
        }

        .summary-card.critical {
          border-left: 4px solid var(--color-semantic-error);
        }

        .summary-card.good {
          border-left: 4px solid var(--color-semantic-success);
        }

        .summary-card-label {
          font-size: var(--text-xs);
          text-transform: uppercase;
          letter-spacing: var(--tracking-wider);
          color: var(--color-text-muted);
          margin-bottom: var(--space-1);
        }

        .summary-card-value {
          font-size: var(--text-3xl);
          font-weight: var(--font-weight-semibold);
          color: var(--color-text-primary);
        }

        .summary-card-subvalue {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          margin-top: var(--space-1);
        }

        .metrics-section {
          background: var(--color-background-elevated);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          margin-bottom: var(--space-4);
          box-shadow: var(--shadow-sm);
        }

        .metrics-section h3 {
          font-size: var(--text-base);
          font-weight: var(--font-weight-semibold);
          margin: 0 0 var(--space-4) 0;
          color: var(--color-text-primary);
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: var(--space-3);
        }

        .metric-item {
          text-align: center;
          padding: var(--space-3);
          background: var(--color-background-secondary);
          border-radius: var(--radius-md);
        }

        .metric-label {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          margin-bottom: var(--space-1);
        }

        .metric-value {
          font-size: var(--text-xl);
          font-weight: var(--font-weight-semibold);
          color: var(--color-text-primary);
        }

        .tier-bar {
          display: flex;
          height: 24px;
          border-radius: var(--radius-xs);
          overflow: hidden;
          margin-top: var(--space-3);
        }

        .tier-segment {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-2xs);
          color: var(--color-text-inverse);
          font-weight: var(--font-weight-medium);
        }

        .tier-excellent { background: var(--color-semantic-success); }
        .tier-good { background: var(--color-natural-bamboo); }
        .tier-acceptable { background: var(--color-semantic-warning); }
        .tier-slow { background: var(--color-natural-cedar); }
        .tier-critical { background: var(--color-semantic-error); }

        .circuit-status {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1-5);
          padding: var(--space-1) var(--space-3);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: var(--font-weight-medium);
        }

        .circuit-status.open {
          background: var(--color-semantic-error-glow);
          color: var(--color-semantic-error);
        }

        .circuit-status.closed {
          background: var(--color-semantic-success-glow);
          color: var(--color-semantic-success);
        }

        .loading-state, .error-state {
          text-align: center;
          padding: var(--space-8);
          color: var(--color-text-muted);
        }

        .error-state {
          color: var(--color-semantic-error);
        }

        .trigger-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .trigger-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-2) var(--space-3);
          background: var(--color-background-secondary);
          border-radius: var(--radius-sm);
        }

        .trigger-name {
          font-weight: var(--font-weight-medium);
          color: var(--color-text-primary);
          font-size: var(--text-sm);
        }

        .trigger-stats {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
        }
      </style>
    `;

    // Make refresh accessible globally for button
    (window as unknown as { perfDashboard: PerformanceDashboard }).perfDashboard = this;
  }

  /**
   * Render summary cards
   */
  private renderSummaryCards(): string {
    if (!this.data) return '';

    const { summary } = this.data;
    const avgTurnClass =
      summary.avgTurnMs < 300 ? 'good' : summary.avgTurnMs < 500 ? '' : summary.avgTurnMs < 800 ? 'warning' : 'critical';

    const slowTurnClass = summary.slowTurnPercentage < 5 ? 'good' : summary.slowTurnPercentage < 10 ? '' : 'warning';

    const circuitClass = summary.openCircuits === 0 ? 'good' : 'critical';

    return `
      <div class="summary-cards">
        <div class="summary-card ${avgTurnClass}">
          <div class="summary-card-label">Avg Turn Latency</div>
          <div class="summary-card-value">${Math.round(summary.avgTurnMs)}ms</div>
          <div class="summary-card-subvalue">Target: < 500ms</div>
        </div>

        <div class="summary-card ${slowTurnClass}">
          <div class="summary-card-label">Slow Turns</div>
          <div class="summary-card-value">${summary.slowTurnPercentage.toFixed(1)}%</div>
          <div class="summary-card-subvalue">Target: < 10%</div>
        </div>

        <div class="summary-card">
          <div class="summary-card-label">Tool Cache Hit Rate</div>
          <div class="summary-card-value">${summary.toolCacheHitRate}</div>
          <div class="summary-card-subvalue">Saved: ~${Math.round(summary.totalEstimatedSavingsMs / 1000)}s</div>
        </div>

        <div class="summary-card">
          <div class="summary-card-label">Tool Success Rate</div>
          <div class="summary-card-value">${summary.toolSuccessRate}</div>
        </div>

        <div class="summary-card ${circuitClass}">
          <div class="summary-card-label">Circuit Breakers</div>
          <div class="summary-card-value">
            <span class="circuit-status ${summary.openCircuits === 0 ? 'closed' : 'open'}">
              ${summary.openCircuits === 0 ? '✓ All Closed' : `⚠ ${summary.openCircuits} Open`}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render turn metrics section
   */
  private renderTurnMetrics(): string {
    if (!this.data?.turns) return '';

    const { turns } = this.data;
    const tiers = turns.turnsByPerformanceTier || {};
    const total = Object.values(tiers).reduce((a, b) => a + b, 0) || 1;

    const tierSegments = ['excellent', 'good', 'acceptable', 'slow', 'critical']
      .map((tier) => {
        const count = tiers[tier] || 0;
        const pct = (count / total) * 100;
        if (pct < 1) return '';
        return `<div class="tier-segment tier-${tier}" style="width: ${pct}%">${Math.round(pct)}%</div>`;
      })
      .join('');

    return `
      <div class="metrics-section">
        <h3>Turn Performance</h3>
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-label">Total Turns</div>
            <div class="metric-value">${turns.totalTurns}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Avg Latency</div>
            <div class="metric-value">${Math.round(turns.avgTurnMs)}ms</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Slow Turns</div>
            <div class="metric-value">${turns.slowTurnPercentage.toFixed(1)}%</div>
          </div>
        </div>
        <div class="tier-bar">
          ${tierSegments || '<div style="flex:1;background:var(--color-border-subtle);"></div>'}
        </div>
        <div style="display:flex;gap:var(--space-3);justify-content:center;margin-top:var(--space-2);font-size:var(--text-2xs);color:var(--color-text-muted);">
          <span>🟢 Excellent</span>
          <span>🟩 Good</span>
          <span>🟡 Acceptable</span>
          <span>🟠 Slow</span>
          <span>🔴 Critical</span>
        </div>
      </div>
    `;
  }

  /**
   * Render cache metrics section
   */
  private renderCacheMetrics(): string {
    if (!this.data) return '';

    const { toolCache, speculativeTts } = this.data;

    return `
      <div class="metrics-section">
        <h3>Caching & Optimization</h3>
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-label">Tool Cache Hits</div>
            <div class="metric-value">${toolCache?.hits || 0}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Tool Cache Misses</div>
            <div class="metric-value">${toolCache?.misses || 0}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Tool Hit Rate</div>
            <div class="metric-value">${(toolCache?.hitRatePercent || 0).toFixed(1)}%</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">TTS Speculative Hits</div>
            <div class="metric-value">${speculativeTts?.speculativeHits || 0}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">TTS Hit Rate</div>
            <div class="metric-value">${(speculativeTts?.cacheHitRatePercent || 0).toFixed(1)}%</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Est. Time Saved</div>
            <div class="metric-value">${Math.round((toolCache?.estimatedTimeSavedMs || 0) + (speculativeTts?.estimatedLatencySavedMs || 0))}ms</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render reliability metrics section
   */
  private renderReliabilityMetrics(): string {
    if (!this.data?.reliability) return '';

    const { reliability } = this.data;

    return `
      <div class="metrics-section">
        <h3>Tool Reliability</h3>
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-label">Total Calls</div>
            <div class="metric-value">${reliability.totalCalls}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Retries</div>
            <div class="metric-value">${reliability.totalRetries}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Failures</div>
            <div class="metric-value">${reliability.totalFailures}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Success Rate</div>
            <div class="metric-value">${reliability.overallSuccessRate}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Open Circuits</div>
            <div class="metric-value">
              <span class="circuit-status ${reliability.openCircuits === 0 ? 'closed' : 'open'}">
                ${reliability.openCircuits}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render dynamic trigger metrics section
   */
  private renderTriggerMetrics(): string {
    if (!this.data?.triggers) return '';

    const { triggers } = this.data;
    const { summary, topTriggers, topBuilders } = triggers;

    // Format fire rate as percentage
    const fireRatePct = (summary.fireRate * 100).toFixed(1);
    const matchRatePct = (summary.matchRate * 100).toFixed(1);

    return `
      <div class="metrics-section">
        <h3>Dynamic Triggers (Better than Human)</h3>
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-label">Triggers Checked</div>
            <div class="metric-value">${summary.totalChecked}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Triggers Matched</div>
            <div class="metric-value">${summary.totalMatched}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Triggers Fired</div>
            <div class="metric-value">${summary.totalFired}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Match Rate</div>
            <div class="metric-value">${matchRatePct}%</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Fire Rate</div>
            <div class="metric-value">${fireRatePct}%</div>
          </div>
        </div>

        ${topTriggers.length > 0 ? `
          <div style="margin-top: var(--space-4);">
            <div class="metric-label" style="margin-bottom: var(--space-2);">Top Triggers</div>
            <div class="trigger-list" role="button" tabindex="0">
              ${topTriggers.map(t => `
                <div class="trigger-item" role="button" tabindex="0">
                  <span class="trigger-name" role="button" tabindex="0">${t.name}</span>
                  <span class="trigger-stats" role="button" tabindex="0">
                    ${t.fired} fired / ${t.matched} matched (${(t.fireRate * 100).toFixed(0)}%)
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${topBuilders.length > 0 ? `
          <div style="margin-top: var(--space-3);">
            <div class="metric-label" style="margin-bottom: var(--space-2);">By Builder</div>
            <div class="trigger-list" role="button" tabindex="0">
              ${topBuilders.map(b => `
                <div class="trigger-item" role="button" tabindex="0">
                  <span class="trigger-name" role="button" tabindex="0">${b.name}</span>
                  <span class="trigger-stats" role="button" tabindex="0">
                    ${b.fired} fired / ${b.checked} checked
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render loading state
   */
  private renderLoading(): string {
    return `
      <div class="loading-state">
        <p>Loading performance metrics...</p>
      </div>
    `;
  }

  /**
   * Render error state
   */
  private renderError(error: string): string {
    return `
      <div class="error-state">
        <p>Failed to load metrics</p>
        <p style="font-size:var(--text-sm)">${error}</p>
        <button aria-label="Retry" class="refresh-btn" onclick="window.perfDashboard?.refresh()">Retry</button>
      </div>
    `;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

let dashboardInstance: PerformanceDashboard | null = null;

export function initPerformanceDashboard(targetId?: string): PerformanceDashboard {
  if (dashboardInstance) {
    dashboardInstance.cleanup();
  }
  dashboardInstance = new PerformanceDashboard();
  dashboardInstance.init(targetId);
  return dashboardInstance;
}

export function getPerformanceDashboard(): PerformanceDashboard | null {
  return dashboardInstance;
}

export default PerformanceDashboard;

