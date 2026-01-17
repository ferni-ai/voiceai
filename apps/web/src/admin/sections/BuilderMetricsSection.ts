/**
 * Builder Metrics Section
 *
 * Context builder monitoring dashboard showing performance metrics,
 * warnings, and real-time builder health.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module BuilderMetricsSection
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { createLogger } from '../../utils/logger.js';
import { getAdminHeadersAsync } from '../admin-api.js';
import { ICON_ACTIVITY, ICON_REFRESH, ICON_WARNING, ICON_ZAP, iconSm } from '../icons.js';

const log = createLogger('BuilderMetricsSection');

// ============================================================================
// TYPES
// ============================================================================

interface BuilderStats {
  builder: string;
  calls: number;
  totalDuration: number;
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  errors: number;
  errorRate: string;
  lastCalled?: string;
  injectionsProduced: number;
  avgInjections: string;
}

interface BuilderMetricsSummary {
  totalCalls: number;
  totalBuilders: number;
  avgDuration: string;
  totalErrors: number;
  totalInjections: number;
  lastUpdated: string;
  warnings: string[];
  builderStats: BuilderStats[];
}

// ============================================================================
// DATA FETCHING
// ============================================================================

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastData: BuilderMetricsSummary | null = null;

async function fetchBuilderMetrics(): Promise<BuilderMetricsSummary | null> {
  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/admin/builder-metrics', {
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    lastData = data;
    return data;
  } catch (error) {
    log.error('Failed to fetch builder metrics:', error);
    return null;
  }
}

export async function fetchWarnings(): Promise<string[]> {
  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/admin/builder-metrics/warnings', {
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.warnings ?? [];
  } catch {
    return [];
  }
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderSummaryCard(data: BuilderMetricsSummary): string {
  const errorClass = data.totalErrors > 0 ? 'has-errors' : '';
  return `
    <div class="summary-card ${errorClass}">
      <div class="summary-stat">
        <span class="stat-value">${data.totalCalls.toLocaleString()}</span>
        <span class="stat-label">Total Calls</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${data.totalBuilders}</span>
        <span class="stat-label">Active Builders</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${data.avgDuration}</span>
        <span class="stat-label">Avg Duration</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${data.totalInjections.toLocaleString()}</span>
        <span class="stat-label">Injections</span>
      </div>
      <div class="summary-stat ${data.totalErrors > 0 ? 'error' : ''}">
        <span class="stat-value">${data.totalErrors}</span>
        <span class="stat-label">Errors</span>
      </div>
    </div>
  `;
}

function renderWarnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return `
      <div class="warnings-section all-clear">
        ${iconSm(ICON_ZAP)}
        <span>All builders healthy</span>
      </div>
    `;
  }

  return `
    <div class="warnings-section has-warnings">
      <div class="warnings-header">
        ${iconSm(ICON_WARNING)}
        <span>${warnings.length} Warning${warnings.length > 1 ? 's' : ''}</span>
      </div>
      <ul class="warnings-list">
        ${warnings.map((w) => `<li>${w}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderBuilderTable(stats: BuilderStats[]): string {
  if (stats.length === 0) {
    return `<div class="empty-state">No builder metrics available yet</div>`;
  }

  // Sort by total calls descending
  const sorted = [...stats].sort((a, b) => b.calls - a.calls);

  return `
    <div class="builder-table-container">
      <table class="builder-table">
        <thead>
          <tr>
            <th scope="col">Builder</th>
            <th scope="col">Calls</th>
            <th scope="col">Avg (ms)</th>
            <th scope="col">Max (ms)</th>
            <th scope="col">Injections</th>
            <th scope="col">Errors</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map(
              (b) => `
            <tr class="${b.errors > 0 ? 'has-error' : ''}">
              <td class="builder-name">${b.builder}</td>
              <td class="numeric">${b.calls.toLocaleString()}</td>
              <td class="numeric ${b.avgDuration > 50 ? 'slow' : ''}">${b.avgDuration.toFixed(1)}</td>
              <td class="numeric ${b.maxDuration > 100 ? 'slow' : ''}">${b.maxDuration.toFixed(1)}</td>
              <td class="numeric">${b.injectionsProduced}</td>
              <td class="numeric ${b.errors > 0 ? 'error' : ''}">${b.errors}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderContent(data: BuilderMetricsSummary | null): string {
  if (!data) {
    return `
      <div class="loading-state">
        ${iconSm(ICON_REFRESH)}
        <span>Loading builder metrics...</span>
      </div>
    `;
  }

  return `
    <div class="builder-metrics-content">
      ${renderSummaryCard(data)}
      ${renderWarnings(data.warnings)}
      ${renderBuilderTable(data.builderStats)}
      <div class="last-updated">
        Last updated: ${new Date(data.lastUpdated).toLocaleTimeString()}
      </div>
    </div>
  `;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .builder-metrics-section {
    padding: var(--space-6);
  }

  .builder-metrics-section h2 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    color: var(--color-text-primary);
    font-size: var(--font-size-xl);
  }

  .builder-metrics-section .refresh-btn {
    margin-left: auto;
    padding: var(--space-2) var(--space-3);
    background: var(--color-background-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .builder-metrics-section .refresh-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .builder-metrics-section .refresh-btn.spinning svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .summary-card {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--color-background-elevated);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-4);
  }

  .summary-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .stat-value {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .stat-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .summary-stat.error .stat-value {
    color: var(--color-error);
  }

  .warnings-section {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
  }

  .warnings-section.all-clear {
    background: var(--color-success-subtle);
    color: var(--color-success);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .warnings-section.has-warnings {
    background: var(--color-warning-subtle);
  }

  .warnings-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-warning);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--space-2);
  }

  .warnings-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .warnings-list li {
    padding: var(--space-1) 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .builder-table-container {
    overflow-x: auto;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
  }

  .builder-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .builder-table th {
    padding: var(--space-3);
    text-align: left;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-muted);
    background: var(--color-background-elevated);
    border-bottom: 1px solid var(--color-border);
    text-transform: uppercase;
    font-size: var(--font-size-xs);
    letter-spacing: 0.05em;
  }

  .builder-table td {
    padding: var(--space-3);
    border-bottom: 1px solid var(--color-border-subtle);
    color: var(--color-text-secondary);
  }

  .builder-table tr:last-child td {
    border-bottom: none;
  }

  .builder-table tr:hover td {
    background: var(--color-background-hover);
  }

  .builder-table tr.has-error td {
    background: var(--color-error-subtle);
  }

  .builder-name {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .numeric.slow {
    color: var(--color-warning);
  }

  .numeric.error {
    color: var(--color-error);
    font-weight: var(--font-weight-medium);
  }

  .last-updated {
    margin-top: var(--space-4);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    text-align: right;
  }

  .loading-state,
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-8);
    color: var(--color-text-muted);
  }

  .loading-state svg {
    animation: spin 1s linear infinite;
  }
`;

// ============================================================================
// MAIN RENDER
// ============================================================================

export function render(): string {
  return `
    <style>${styles}</style>
    <section class="builder-metrics-section" id="builder-metrics-section">
      <h2>
        ${iconSm(ICON_ACTIVITY)}
        Context Builder Metrics
        <button aria-label="Refresh" class="refresh-btn" id="refresh-builder-metrics">
          ${iconSm(ICON_REFRESH)}
          Refresh
        </button>
      </h2>
      <div id="builder-metrics-container">
        ${renderContent(lastData)}
      </div>
    </section>
  `;
}

export function setupEvents(): void {
  const refreshBtn = document.getElementById('refresh-builder-metrics');
  const container = document.getElementById('builder-metrics-container');

  if (refreshBtn && container) {
    refreshBtn.addEventListener('click', () => {
      void (async () => {
        refreshBtn.classList.add('spinning');
        const data = await fetchBuilderMetrics();
        container.innerHTML = renderContent(data);
        refreshBtn.classList.remove('spinning');
      })();
    });
  }

  // Initial load
  void fetchBuilderMetrics().then((data) => {
    if (container) {
      container.innerHTML = renderContent(data);
    }
  });

  // Auto-refresh every 30 seconds
  refreshTimer = setInterval(async () => {
    const data = await fetchBuilderMetrics();
    if (container) {
      container.innerHTML = renderContent(data);
    }
  }, 30000);
}

export function cleanup(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
