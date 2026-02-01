/**
 * Semantic Routing Dashboard UI
 *
 * Admin dashboard for monitoring semantic tool routing performance.
 * Shows routing accuracy, confidence distribution, top corrections,
 * and defense system status.
 *
 * Usage:
 * - Access via admin panel or directly at /admin/routing
 * - Requires admin authentication
 *
 * @module ui/admin/routing-dashboard.ui
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('RoutingDashboard');

// ============================================================================
// TYPES
// ============================================================================

interface SummaryStats {
  directExecutionRate: string;
  avgConfidence: string;
  avgLatencyMs: number;
  p95LatencyMs: number;
  cacheHitRate: string;
  correctionRate: string;
  threatsBlocked: number;
}

interface AggregateStats {
  totalRoutes: number;
  successfulRoutes: number;
  bypassedLLM: number;
  hints: number;
  conversations: number;
  errors: number;
  matchPathBreakdown: Record<string, number>;
}

interface ConfidenceBucket {
  range: string;
  count: number;
}

interface CorrectionPair {
  query: string;
  predicted: string;
  actual: string;
  timestamp: string;
}

interface DefenseStats {
  totalInputs: number;
  threatsDetected: number;
  inputsBlocked: number;
  blockRate: string;
  avgRiskScore: string;
  threatsByType: Record<string, number>;
  threatsBySeverity: { high: number; medium: number; low: number };
}

interface LearningStats {
  isActive: boolean;
  pendingExamples: number;
  adjustedTools: number;
  lastRetrainTime: string | null;
  recentRetrains: Array<{
    examplesProcessed: number;
    toolsUpdated: number;
    avgEmbeddingDelta: number;
    duration: number;
    timestamp: number;
  }>;
}

interface TopTool {
  toolId: string;
  count: number;
  percentage: number;
}

interface DashboardData {
  summary: SummaryStats;
  aggregate: AggregateStats;
  confidenceDistribution: ConfidenceBucket[];
  topCorrections: CorrectionPair[];
  defense: DefenseStats;
  learning: LearningStats;
  topTools: TopTool[];
  collectedAt: string;
}

// ============================================================================
// DASHBOARD CLASS
// ============================================================================

export class RoutingDashboard {
  private container: HTMLElement | null = null;
  private refreshInterval: number | null = null;
  private data: DashboardData | null = null;

  constructor() {
    this.cleanup();
  }

  /**
   * Initialize and render the dashboard
   */
  async init(targetId = 'routing-dashboard'): Promise<void> {
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
      const response = await fetch('/api/observability/routing-dashboard', {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.data = await response.json();
      this.render();
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to fetch routing dashboard data');
      if (this.container) {
        this.container.innerHTML = this.renderError(String(error));
      }
    }
  }

  /**
   * Start auto-refresh interval
   */
  private startAutoRefresh(): void {
    this.refreshInterval = window.setInterval(() => {
      this.refresh();
    }, 30000); // Refresh every 30 seconds
  }

  /**
   * Render loading state
   */
  private renderLoading(): string {
    return `
      <div class="routing-dashboard">
        <div class="routing-loading">
          <div class="loading-spinner"></div>
          <p>Loading routing metrics...</p>
        </div>
      </div>
    `;
  }

  /**
   * Render error state
   */
  private renderError(message: string): string {
    return `
      <div class="routing-dashboard">
        <div class="routing-error">
          <p>Failed to load routing data</p>
          <p class="error-detail">${message}</p>
          <button class="refresh-btn" onclick="window.routingDashboard?.refresh()">
            Retry
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Main render method
   */
  private render(): void {
    if (!this.container || !this.data) return;

    const { summary, aggregate, confidenceDistribution, topCorrections, defense, learning, topTools } =
      this.data;

    // Parse percentage strings to numbers for status determination
    const directExecRate = parseFloat(summary.directExecutionRate) / 100;
    const avgConfidence = parseFloat(summary.avgConfidence) / 100;

    this.container.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="routing-dashboard">
        <div class="routing-header">
          <h2>Semantic Routing Dashboard</h2>
          <button class="refresh-btn" onclick="window.routingDashboard?.refresh()">
            Refresh
          </button>
        </div>

        <!-- Summary Cards -->
        <div class="summary-cards">
          ${this.renderSummaryCard(
            'Direct Execution Rate',
            summary.directExecutionRate,
            `${aggregate.bypassedLLM.toLocaleString()} / ${aggregate.totalRoutes.toLocaleString()} routes`,
            this.getDirectExecStatus(directExecRate)
          )}
          ${this.renderSummaryCard(
            'Avg Confidence',
            summary.avgConfidence,
            'Mean confidence score',
            this.getConfidenceStatus(avgConfidence)
          )}
          ${this.renderSummaryCard(
            'Avg Latency',
            `${summary.avgLatencyMs}ms`,
            `P95: ${summary.p95LatencyMs}ms`,
            this.getLatencyStatus(summary.avgLatencyMs)
          )}
          ${this.renderSummaryCard(
            'Correction Rate',
            summary.correctionRate,
            `${learning.pendingExamples} pending corrections`,
            this.getCorrectionStatus(parseFloat(summary.correctionRate) / 100)
          )}
          ${this.renderSummaryCard(
            'Threats Blocked',
            summary.threatsBlocked.toLocaleString(),
            `${defense.threatsDetected.toLocaleString()} detected`,
            summary.threatsBlocked > 0 ? 'warning' : 'good'
          )}
        </div>

        <!-- Confidence Distribution -->
        <div class="metrics-section">
          <h3>Confidence Distribution</h3>
          ${this.renderConfidenceHistogram(confidenceDistribution)}
        </div>

        <!-- Two Column Layout -->
        <div class="two-column">
          <!-- Top Tools -->
          <div class="metrics-section">
            <h3>Top Routed Tools</h3>
            ${this.renderTopTools(topTools)}
          </div>

          <!-- Top Corrections -->
          <div class="metrics-section">
            <h3>Top Corrections (Learning Opportunities)</h3>
            ${this.renderCorrections(topCorrections)}
          </div>
        </div>

        <!-- Defense Stats -->
        <div class="metrics-section">
          <h3>Defense System Status</h3>
          ${this.renderDefenseStats(defense)}
        </div>

        <!-- Learning Loop Status -->
        <div class="metrics-section">
          <h3>Learning Loop Status</h3>
          ${this.renderLearningStats(learning)}
        </div>

        <div class="last-updated">
          Last updated: ${new Date(this.data.collectedAt).toLocaleString()}
        </div>
      </div>
    `;

    // Store reference for onclick handlers
    (window as unknown as { routingDashboard: RoutingDashboard }).routingDashboard = this;
  }

  /**
   * Render a summary card
   */
  private renderSummaryCard(
    label: string,
    value: string,
    subvalue: string,
    status: 'good' | 'warning' | 'critical'
  ): string {
    return `
      <div class="summary-card ${status}">
        <div class="summary-card-label">${label}</div>
        <div class="summary-card-value">${value}</div>
        <div class="summary-card-subvalue">${subvalue}</div>
      </div>
    `;
  }

  /**
   * Render confidence histogram
   */
  private renderConfidenceHistogram(buckets: ConfidenceBucket[]): string {
    const maxCount = Math.max(...buckets.map((b) => b.count), 1);
    const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);

    return `
      <div class="histogram">
        ${buckets
          .map(
            (bucket) => `
          <div class="histogram-bar-container">
            <div class="histogram-bar ${this.getConfidenceBucketClass(bucket.range)}"
                 style="height: ${(bucket.count / maxCount) * 100}%"
                 title="${bucket.count} routes (${totalCount > 0 ? ((bucket.count / totalCount) * 100).toFixed(1) : 0}%)">
            </div>
            <div class="histogram-label">${bucket.range}</div>
            <div class="histogram-count">${bucket.count}</div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  /**
   * Render top tools table
   */
  private renderTopTools(tools: TopTool[]): string {
    if (tools.length === 0) {
      return '<p class="no-data">No tool data available</p>';
    }

    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Count</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          ${tools
            .slice(0, 10)
            .map(
              (tool) => `
            <tr>
              <td class="tool-name">${tool.toolId}</td>
              <td>${tool.count.toLocaleString()}</td>
              <td>${tool.percentage.toFixed(1)}%</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Render corrections table
   */
  private renderCorrections(corrections: CorrectionPair[]): string {
    if (corrections.length === 0) {
      return '<p class="no-data">No corrections recorded yet. Learning loop will capture them over time.</p>';
    }

    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Query</th>
            <th>Predicted</th>
            <th></th>
            <th>Actual</th>
          </tr>
        </thead>
        <tbody>
          ${corrections
            .slice(0, 10)
            .map(
              (pair) => `
            <tr>
              <td class="correction-query" title="${pair.query}">${pair.query.slice(0, 30)}${pair.query.length > 30 ? '...' : ''}</td>
              <td class="tool-name predicted">${pair.predicted}</td>
              <td class="arrow">→</td>
              <td class="tool-name actual">${pair.actual}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Render defense statistics
   */
  private renderDefenseStats(defense: DefenseStats): string {
    const threatTypes = Object.entries(defense.threatsByType).filter(([, count]) => count > 0);

    return `
      <div class="defense-grid">
        <div class="defense-stat">
          <div class="defense-label">Inputs Analyzed</div>
          <div class="defense-value">${defense.totalInputs.toLocaleString()}</div>
        </div>
        <div class="defense-stat">
          <div class="defense-label">Threats Detected</div>
          <div class="defense-value ${defense.threatsDetected > 0 ? 'warning' : ''}">
            ${defense.threatsDetected.toLocaleString()}
          </div>
        </div>
        <div class="defense-stat">
          <div class="defense-label">Inputs Blocked</div>
          <div class="defense-value ${defense.inputsBlocked > 0 ? 'critical' : ''}">
            ${defense.inputsBlocked.toLocaleString()}
          </div>
        </div>
        <div class="defense-stat">
          <div class="defense-label">Block Rate</div>
          <div class="defense-value">${defense.blockRate}</div>
        </div>
        <div class="defense-stat">
          <div class="defense-label">Avg Risk Score</div>
          <div class="defense-value">${defense.avgRiskScore}</div>
        </div>
      </div>
      ${
        threatTypes.length > 0
          ? `
        <div class="threat-breakdown">
          <h4>Threats by Type</h4>
          <div class="threat-bars">
            ${threatTypes
              .sort((a, b) => b[1] - a[1])
              .map(
                ([type, count]) => `
              <div class="threat-bar-row">
                <span class="threat-type">${this.formatThreatType(type)}</span>
                <div class="threat-bar" style="width: ${defense.threatsDetected > 0 ? (count / defense.threatsDetected) * 100 : 0}%"></div>
                <span class="threat-count">${count}</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }
    `;
  }

  /**
   * Render learning loop statistics
   */
  private renderLearningStats(learning: LearningStats): string {
    const recentRetrain = learning.recentRetrains[0];
    return `
      <div class="learning-grid">
        <div class="learning-stat">
          <div class="learning-label">Status</div>
          <div class="learning-value ${learning.isActive ? 'active' : 'inactive'}">
            ${learning.isActive ? 'Active' : 'Inactive'}
          </div>
        </div>
        <div class="learning-stat">
          <div class="learning-label">Pending Examples</div>
          <div class="learning-value">${learning.pendingExamples.toLocaleString()}</div>
          <div class="learning-hint">Awaiting next retrain</div>
        </div>
        <div class="learning-stat">
          <div class="learning-label">Adjusted Tools</div>
          <div class="learning-value">${learning.adjustedTools.toLocaleString()}</div>
          <div class="learning-hint">Tools with learned weights</div>
        </div>
        <div class="learning-stat">
          <div class="learning-label">Last Retrain</div>
          <div class="learning-value">
            ${learning.lastRetrainTime ? new Date(learning.lastRetrainTime).toLocaleDateString() : 'Never'}
          </div>
        </div>
        ${
          recentRetrain
            ? `
        <div class="learning-stat">
          <div class="learning-label">Last Retrain Stats</div>
          <div class="learning-value">${recentRetrain.toolsUpdated} tools</div>
          <div class="learning-hint">${recentRetrain.examplesProcessed} examples in ${recentRetrain.duration}ms</div>
        </div>
        `
            : ''
        }
      </div>
    `;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private getDirectExecStatus(rate: number): 'good' | 'warning' | 'critical' {
    if (rate >= 0.7) return 'good';
    if (rate >= 0.5) return 'warning';
    return 'critical';
  }

  private getConfidenceStatus(conf: number): 'good' | 'warning' | 'critical' {
    if (conf >= 0.8) return 'good';
    if (conf >= 0.6) return 'warning';
    return 'critical';
  }

  private getLatencyStatus(ms: number): 'good' | 'warning' | 'critical' {
    if (ms <= 30) return 'good';
    if (ms <= 100) return 'warning';
    return 'critical';
  }

  private getCorrectionStatus(rate: number): 'good' | 'warning' | 'critical' {
    if (rate <= 0.05) return 'good';
    if (rate <= 0.15) return 'warning';
    return 'critical';
  }

  private getConfidenceBucketClass(range: string): string {
    if (range.startsWith('0.9') || range === '1.0') return 'bucket-excellent';
    if (range.startsWith('0.8')) return 'bucket-good';
    if (range.startsWith('0.7') || range.startsWith('0.6')) return 'bucket-moderate';
    return 'bucket-low';
  }


  private formatThreatType(type: string): string {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  private getStyles(): string {
    return `
      .routing-dashboard {
        padding: var(--space-4);
        max-width: min(1400px, 100%);
        margin: 0 auto;
      }

      .routing-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-6);
      }

      .routing-header h2 {
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
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
        font-size: var(--text-2xl);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }

      .summary-card-subvalue {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin-top: var(--space-1);
      }

      .two-column {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: var(--space-4);
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

      /* Histogram */
      .histogram {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        height: 200px;
        padding: var(--space-4) 0;
        gap: var(--space-2);
      }

      .histogram-bar-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
      }

      .histogram-bar {
        width: 100%;
        max-width: 60px;
        border-radius: var(--radius-sm) var(--radius-sm) 0 0;
        transition: height 0.3s ease;
        min-height: 4px;
      }

      .bucket-excellent { background: var(--color-semantic-success); }
      .bucket-good { background: var(--color-natural-bamboo); }
      .bucket-moderate { background: var(--color-semantic-warning); }
      .bucket-low { background: var(--color-semantic-error); }

      .histogram-label {
        font-size: var(--text-2xs);
        color: var(--color-text-muted);
        margin-top: var(--space-2);
      }

      .histogram-count {
        font-size: var(--text-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }

      .histogram-accuracy {
        font-size: var(--text-2xs);
        color: var(--color-text-secondary);
      }

      /* Tables */
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
      }

      .data-table th,
      .data-table td {
        padding: var(--space-2) var(--space-3);
        text-align: left;
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .data-table th {
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider);
      }

      .tool-name {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
      }

      .tool-name.predicted {
        color: var(--color-semantic-error);
      }

      .tool-name.actual {
        color: var(--color-semantic-success);
      }

      .arrow {
        color: var(--color-text-muted);
        text-align: center;
      }

      .success-high { color: var(--color-semantic-success); }
      .success-medium { color: var(--color-semantic-warning); }
      .success-low { color: var(--color-semantic-error); }

      /* Defense Stats */
      .defense-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }

      .defense-stat {
        text-align: center;
        padding: var(--space-3);
        background: var(--color-background-secondary);
        border-radius: var(--radius-md);
      }

      .defense-label {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin-bottom: var(--space-1);
      }

      .defense-value {
        font-size: var(--text-xl);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }

      .defense-value.warning {
        color: var(--color-semantic-warning);
      }

      .defense-value.critical {
        color: var(--color-semantic-error);
      }

      .threat-breakdown {
        margin-top: var(--space-4);
      }

      .threat-breakdown h4 {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin-bottom: var(--space-3);
      }

      .threat-bar-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-2);
      }

      .threat-type {
        width: 140px;
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
      }

      .threat-bar {
        height: 8px;
        background: var(--color-semantic-warning);
        border-radius: var(--radius-full);
        max-width: 300px;
      }

      .threat-count {
        font-size: var(--text-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
        min-width: 30px;
      }

      /* Learning Stats */
      .learning-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: var(--space-4);
      }

      .learning-stat {
        text-align: center;
        padding: var(--space-3);
        background: var(--color-background-secondary);
        border-radius: var(--radius-md);
      }

      .learning-label {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin-bottom: var(--space-1);
      }

      .learning-value {
        font-size: var(--text-xl);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }

      .learning-value.model-version {
        font-family: var(--font-mono);
        font-size: var(--text-sm);
      }

      .learning-value.active {
        color: var(--color-semantic-success);
      }

      .learning-value.inactive {
        color: var(--color-text-muted);
      }

      .correction-query {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .learning-hint {
        font-size: var(--text-2xs);
        color: var(--color-text-muted);
        margin-top: var(--space-1);
      }

      /* Loading & Error States */
      .routing-loading,
      .routing-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-12);
        color: var(--color-text-secondary);
      }

      .loading-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle);
        border-top-color: var(--color-accent-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: var(--space-4);
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .error-detail {
        font-size: var(--text-sm);
        color: var(--color-semantic-error);
        margin: var(--space-2) 0 var(--space-4) 0;
      }

      .no-data {
        text-align: center;
        color: var(--color-text-muted);
        padding: var(--space-4);
      }

      .last-updated {
        text-align: center;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin-top: var(--space-4);
      }
    `;
  }
}

// Export singleton instance
export const routingDashboard = new RoutingDashboard();
