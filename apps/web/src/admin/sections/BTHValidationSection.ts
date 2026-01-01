/**
 * BTH Validation Section
 *
 * Admin dashboard for BTH (Better Than Human) validation metrics.
 * Displays benchmark scores, capability gaps, and production telemetry.
 *
 * This surfaces the validation framework data:
 * - F1/precision/recall for each capability
 * - Known gaps by category (slang, ESL, cultural, etc.)
 * - Real-time production telemetry
 * - Blind evaluation results
 *
 * @module BTHValidationSection
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { createLogger } from '../../utils/logger.js';
import { getAdminHeadersAsync } from '../admin-api.js';
import {
  ICON_CHART,
  ICON_CHECK,
  ICON_EXTERNAL,
  ICON_FLAGS,
  ICON_SEARCH,
  ICON_TARGET,
  ICON_WARNING,
  ICON_ZAP,
  iconSm,
} from '../icons.js';

const log = createLogger('BTHValidationSection');

// ============================================================================
// SECURITY: HTML ESCAPING
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS.
 * Used for ALL dynamic content from API responses.
 */
function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ============================================================================
// TYPES
// ============================================================================

interface BenchmarkResult {
  capability: string;
  totalCases: number;
  passed: number;
  failed: number;
  precision: number;
  recall: number;
  f1Score: number;
}

interface GapExample {
  input: string;
  expected: boolean;
  actual: boolean;
  confidence: number;
}

interface KnownGap {
  category: string;
  description: string;
  exampleCount: number;
  examples: GapExample[];
}

interface TelemetryEntry {
  capability: string;
  triggeredCount: number;
  successRate: number;
  avgConfidence: number;
  lastTriggered: string;
}

interface ValidationData {
  benchmark: {
    overallF1: number;
    capabilities: BenchmarkResult[];
    lastRun: string;
  };
  gaps: {
    totalGaps: number;
    byCategory: KnownGap[];
  };
  telemetry: {
    period: string;
    entries: TelemetryEntry[];
  };
}

// ============================================================================
// STATE
// ============================================================================

let currentTab: 'benchmarks' | 'gaps' | 'telemetry' = 'benchmarks';
let cachedData: ValidationData | null = null;

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchValidationData(): Promise<ValidationData> {
  if (cachedData) return cachedData;

  try {
    const headers = await getAdminHeadersAsync();

    // Fetch all validation endpoints in parallel
    const [benchmarkRes, gapsRes, telemetryRes] = await Promise.all([
      fetch('/api/v1/admin/bth/validation/benchmark', { headers }),
      fetch('/api/v1/admin/bth/validation/gaps', { headers }),
      fetch('/api/v1/admin/bth/validation/telemetry', { headers }),
    ]);

    const benchmark = benchmarkRes.ok ? await benchmarkRes.json() : getDefaultBenchmark();
    const gaps = gapsRes.ok ? await gapsRes.json() : getDefaultGaps();
    const telemetry = telemetryRes.ok ? await telemetryRes.json() : getDefaultTelemetry();

    cachedData = { benchmark, gaps, telemetry };
    return cachedData;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to fetch validation data');
    return {
      benchmark: getDefaultBenchmark(),
      gaps: getDefaultGaps(),
      telemetry: getDefaultTelemetry(),
    };
  }
}

function getDefaultBenchmark() {
  return {
    overallF1: 0,
    capabilities: [],
    lastRun: 'Never',
  };
}

function getDefaultGaps() {
  return {
    totalGaps: 0,
    byCategory: [],
  };
}

function getDefaultTelemetry() {
  return {
    period: 'No data',
    entries: [],
  };
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

/**
 * Render the BTH Validation section
 */
export async function render(): Promise<string> {
  log.debug('Rendering BTH Validation section');

  const data = await fetchValidationData();

  return `
    <div class="bth-validation-section">
      ${renderStyles()}

      <!-- Overview Stats -->
      <div class="admin-grid bth-stats">
        ${renderStatCard('F1 Score', formatPercent(data.benchmark.overallF1), ICON_TARGET, getF1StatusClass(data.benchmark.overallF1))}
        ${renderStatCard('Known Gaps', escapeHtml(data.gaps.totalGaps), ICON_WARNING, data.gaps.totalGaps > 10 ? 'warning' : 'success')}
        ${renderStatCard('Capabilities', escapeHtml(data.benchmark.capabilities.length), ICON_CHECK, 'neutral')}
        ${renderStatCard('Triggers (24h)', getTotalTriggers(data.telemetry.entries), ICON_ZAP, 'neutral')}
      </div>

      <!-- Tab Navigation -->
      <div class="admin-card bth-tabs-container">
        <div class="bth-tabs" role="tablist">
          <button
            role="tab"
            aria-selected="${currentTab === 'benchmarks'}"
            class="bth-tab ${currentTab === 'benchmarks' ? 'bth-tab--active' : ''}"
            data-tab="benchmarks"
          >
            ${iconSm(ICON_CHART)} Benchmarks
          </button>
          <button
            role="tab"
            aria-selected="${currentTab === 'gaps'}"
            class="bth-tab ${currentTab === 'gaps' ? 'bth-tab--active' : ''}"
            data-tab="gaps"
          >
            ${iconSm(ICON_FLAGS)} Gaps (${escapeHtml(data.gaps.totalGaps)})
          </button>
          <button
            role="tab"
            aria-selected="${currentTab === 'telemetry'}"
            class="bth-tab ${currentTab === 'telemetry' ? 'bth-tab--active' : ''}"
            data-tab="telemetry"
          >
            ${iconSm(ICON_ZAP)} Telemetry
          </button>
        </div>

        <!-- Tab Content -->
        <div class="bth-tab-content" role="tabpanel">
          ${currentTab === 'benchmarks' ? renderBenchmarksTab(data.benchmark) : ''}
          ${currentTab === 'gaps' ? renderGapsTab(data.gaps) : ''}
          ${currentTab === 'telemetry' ? renderTelemetryTab(data.telemetry) : ''}
        </div>
      </div>

      <!-- Actions -->
      <div class="admin-card bth-actions">
        <h2 class="admin-section-title">
          ${iconSm(ICON_ZAP)} Actions
        </h2>
        <div class="bth-actions-grid">
          <button class="admin-btn admin-btn--primary" data-action="run-benchmark">
            ${iconSm(ICON_CHART)} Run Benchmark
          </button>
          <button class="admin-btn" data-action="refresh-telemetry">
            ${iconSm(ICON_SEARCH)} Refresh Telemetry
          </button>
          <button class="admin-btn" data-action="export-report">
            ${iconSm(ICON_EXTERNAL)} Export Report
          </button>
        </div>
        <p class="bth-last-run">Last benchmark: ${escapeHtml(data.benchmark.lastRun)}</p>
      </div>
    </div>
  `;
}

function renderStatCard(
  label: string,
  value: string,
  icon: string,
  status: 'success' | 'warning' | 'neutral'
): string {
  return `
    <div class="admin-card bth-stat">
      <div class="bth-stat-icon">${iconSm(icon)}</div>
      <div class="bth-stat-value bth-stat-value--${status}">${value}</div>
      <div class="bth-stat-label">${escapeHtml(label)}</div>
    </div>
  `;
}

function renderBenchmarksTab(benchmark: ValidationData['benchmark']): string {
  if (benchmark.capabilities.length === 0) {
    return `
      <div class="bth-empty">
        <p>No benchmark data available.</p>
        <p>Click "Run Benchmark" to generate results.</p>
      </div>
    `;
  }

  return `
    <div class="bth-benchmark-table-container">
      <table class="bth-table">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Cases</th>
            <th>Precision</th>
            <th>Recall</th>
            <th>F1 Score</th>
          </tr>
        </thead>
        <tbody>
          ${benchmark.capabilities
            .sort((a, b) => b.f1Score - a.f1Score)
            .map((cap) => renderBenchmarkRow(cap))
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderBenchmarkRow(cap: BenchmarkResult): string {
  const f1Class = getF1Class(cap.f1Score);
  return `
    <tr class="bth-table-row">
      <td class="bth-capability-name">${escapeHtml(cap.capability)}</td>
      <td>${escapeHtml(cap.totalCases)}</td>
      <td>${formatPercent(cap.precision)}</td>
      <td>${formatPercent(cap.recall)}</td>
      <td class="bth-f1 bth-f1--${f1Class}">${formatPercent(cap.f1Score)}</td>
    </tr>
  `;
}

function renderGapsTab(gaps: ValidationData['gaps']): string {
  if (gaps.byCategory.length === 0) {
    return `
      <div class="bth-empty">
        <p>No gaps identified yet.</p>
        <p>Run benchmarks to identify capability gaps.</p>
      </div>
    `;
  }

  return `
    <div class="bth-gaps-container">
      ${gaps.byCategory.map((gap) => renderGapCategory(gap)).join('')}
    </div>
  `;
}

function renderGapCategory(gap: KnownGap): string {
  return `
    <div class="bth-gap-category">
      <div class="bth-gap-header">
        <span class="bth-gap-title">${escapeHtml(gap.category)}</span>
        <span class="bth-gap-count">${escapeHtml(gap.exampleCount)} examples</span>
      </div>
      <p class="bth-gap-description">${escapeHtml(gap.description)}</p>
      ${gap.examples.length > 0 ? renderGapExamples(gap.examples.slice(0, 3)) : ''}
    </div>
  `;
}

function renderGapExamples(examples: GapExample[]): string {
  return `
    <div class="bth-gap-examples">
      ${examples
        .map(
          (ex) => `
        <div class="bth-gap-example">
          <span class="bth-gap-input">${escapeHtml(truncate(ex.input, 60))}</span>
          <span class="bth-gap-result ${ex.expected === ex.actual ? 'success' : 'error'}">
            Expected: ${escapeHtml(ex.expected)}, Got: ${escapeHtml(ex.actual)}
          </span>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

function renderTelemetryTab(telemetry: ValidationData['telemetry']): string {
  if (telemetry.entries.length === 0) {
    return `
      <div class="bth-empty">
        <p>No telemetry data available.</p>
        <p>Telemetry will appear as capabilities are triggered in production.</p>
      </div>
    `;
  }

  return `
    <div class="bth-telemetry-period">Period: ${escapeHtml(telemetry.period)}</div>
    <div class="bth-telemetry-table-container">
      <table class="bth-table">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Triggers</th>
            <th>Success Rate</th>
            <th>Avg Confidence</th>
            <th>Last Triggered</th>
          </tr>
        </thead>
        <tbody>
          ${telemetry.entries
            .sort((a, b) => b.triggeredCount - a.triggeredCount)
            .map((entry) => renderTelemetryRow(entry))
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTelemetryRow(entry: TelemetryEntry): string {
  return `
    <tr class="bth-table-row">
      <td class="bth-capability-name">${escapeHtml(entry.capability)}</td>
      <td>${escapeHtml(entry.triggeredCount)}</td>
      <td class="bth-rate ${getRateClass(entry.successRate)}">${formatPercent(entry.successRate)}</td>
      <td>${formatPercent(entry.avgConfidence)}</td>
      <td class="bth-timestamp">${escapeHtml(formatTime(entry.lastTriggered))}</td>
    </tr>
  `;
}

// ============================================================================
// STYLES
// ============================================================================

function renderStyles(): string {
  return `
    <style>
      .bth-validation-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-lg);
      }

      .bth-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-md);
      }

      .bth-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--space-lg);
        text-align: center;
      }

      .bth-stat-icon {
        color: var(--color-text-muted);
        margin-bottom: var(--space-sm);
      }

      .bth-stat-value {
        font-size: 2rem;
        font-weight: 600;
        line-height: 1;
      }

      .bth-stat-value--success { color: var(--color-semantic-success); }
      .bth-stat-value--warning { color: var(--color-semantic-warning); }
      .bth-stat-value--neutral { color: var(--color-text-primary); }

      .bth-stat-label {
        color: var(--color-text-muted);
        font-size: 0.875rem;
        margin-top: var(--space-xs);
      }

      /* Tabs */
      .bth-tabs-container {
        padding: 0;
        overflow: hidden;
      }

      .bth-tabs {
        display: flex;
        border-bottom: 1px solid var(--color-border-subtle);
        padding: 0 var(--space-md);
      }

      .bth-tab {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        padding: var(--space-md) var(--space-lg);
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .bth-tab:hover {
        color: var(--color-text-primary);
      }

      .bth-tab--active {
        color: var(--color-accent-primary);
        border-bottom-color: var(--color-accent-primary);
      }

      .bth-tab-content {
        padding: var(--space-lg);
      }

      /* Tables */
      .bth-table {
        width: 100%;
        border-collapse: collapse;
      }

      .bth-table th {
        text-align: left;
        padding: var(--space-sm) var(--space-md);
        font-weight: 600;
        color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .bth-table td {
        padding: var(--space-sm) var(--space-md);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .bth-table-row:hover {
        background: var(--color-bg-elevated);
      }

      .bth-capability-name {
        font-weight: 500;
      }

      .bth-f1--excellent { color: var(--color-semantic-success); }
      .bth-f1--good { color: var(--color-accent-primary); }
      .bth-f1--fair { color: var(--color-semantic-warning); }
      .bth-f1--poor { color: var(--color-semantic-error); }

      .bth-rate.success { color: var(--color-semantic-success); }
      .bth-rate.warning { color: var(--color-semantic-warning); }
      .bth-rate.error { color: var(--color-semantic-error); }

      .bth-timestamp {
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }

      /* Gaps */
      .bth-gaps-container {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
      }

      .bth-gap-category {
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        padding: var(--space-md);
      }

      .bth-gap-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-xs);
      }

      .bth-gap-title {
        font-weight: 600;
        color: var(--color-semantic-warning);
      }

      .bth-gap-count {
        font-size: 0.875rem;
        color: var(--color-text-muted);
      }

      .bth-gap-description {
        color: var(--color-text-secondary);
        margin-bottom: var(--space-sm);
      }

      .bth-gap-examples {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
        font-size: 0.875rem;
      }

      .bth-gap-example {
        display: flex;
        justify-content: space-between;
        padding: var(--space-xs) var(--space-sm);
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-sm);
      }

      .bth-gap-input {
        color: var(--color-text-secondary);
        font-family: monospace;
      }

      .bth-gap-result.success { color: var(--color-semantic-success); }
      .bth-gap-result.error { color: var(--color-semantic-error); }

      /* Telemetry */
      .bth-telemetry-period {
        color: var(--color-text-muted);
        font-size: 0.875rem;
        margin-bottom: var(--space-md);
      }

      /* Actions */
      .bth-actions-grid {
        display: flex;
        gap: var(--space-md);
        margin-bottom: var(--space-md);
      }

      .bth-last-run {
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }

      /* Empty state */
      .bth-empty {
        text-align: center;
        padding: var(--space-xl);
        color: var(--color-text-muted);
      }

      .bth-empty p {
        margin: var(--space-xs) 0;
      }

      /* Responsive */
      @media (max-width: 768px) {
        .bth-stats {
          grid-template-columns: repeat(2, 1fr);
        }

        .bth-actions-grid {
          flex-direction: column;
        }
      }
    </style>
  `;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

function getF1Class(f1: number): string {
  if (f1 >= 0.9) return 'excellent';
  if (f1 >= 0.75) return 'good';
  if (f1 >= 0.5) return 'fair';
  return 'poor';
}

function getF1StatusClass(f1: number): 'success' | 'warning' | 'neutral' {
  if (f1 >= 0.75) return 'success';
  if (f1 >= 0.5) return 'warning';
  return 'neutral';
}

function getRateClass(rate: number): string {
  if (rate >= 0.8) return 'success';
  if (rate >= 0.5) return 'warning';
  return 'error';
}

function getTotalTriggers(entries: TelemetryEntry[]): string {
  const total = entries.reduce((sum, e) => sum + e.triggeredCount, 0);
  return escapeHtml(total);
}

function formatTime(isoString: string): string {
  if (!isoString || isoString === 'Never') return 'Never';
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

// ============================================================================
// EVENT SETUP
// ============================================================================

/**
 * Set up event listeners for the BTH Validation section
 */
export function setupEvents(container: HTMLElement): void {
  // Tab switching
  container.querySelectorAll('.bth-tab').forEach((tab) => {
    tab.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLElement;
      const tabName = target.dataset.tab as 'benchmarks' | 'gaps' | 'telemetry';
      if (tabName && tabName !== currentTab) {
        currentTab = tabName;
        // Re-render tab content
        const data = await fetchValidationData();
        const tabContent = container.querySelector('.bth-tab-content');
        if (tabContent) {
          tabContent.innerHTML =
            currentTab === 'benchmarks'
              ? renderBenchmarksTab(data.benchmark)
              : currentTab === 'gaps'
                ? renderGapsTab(data.gaps)
                : renderTelemetryTab(data.telemetry);
        }
        // Update active tab
        container.querySelectorAll('.bth-tab').forEach((t) => {
          const tabEl = t as HTMLElement;
          tabEl.classList.toggle('bth-tab--active', tabEl.dataset.tab === currentTab);
          tabEl.setAttribute('aria-selected', String(tabEl.dataset.tab === currentTab));
        });
      }
    });
  });

  // Action buttons
  container.querySelector('[data-action="run-benchmark"]')?.addEventListener('click', async () => {
    log.info('Running benchmark...');
    try {
      const headers = await getAdminHeadersAsync();
      const res = await fetch('/api/v1/admin/bth/validation/benchmark?run=true', { headers });
      if (res.ok) {
        cachedData = null; // Clear cache
        const section = container.closest('.admin-section-content');
        if (section) {
          section.innerHTML = await render();
          setupEvents(section as HTMLElement);
        }
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Benchmark failed');
    }
  });

  container.querySelector('[data-action="refresh-telemetry"]')?.addEventListener('click', async () => {
    log.info('Refreshing telemetry...');
    cachedData = null;
    currentTab = 'telemetry';
    const section = container.closest('.admin-section-content');
    if (section) {
      section.innerHTML = await render();
      setupEvents(section as HTMLElement);
    }
  });

  container.querySelector('[data-action="export-report"]')?.addEventListener('click', async () => {
    log.info('Exporting report...');
    const data = await fetchValidationData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bth-validation-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/**
 * Cleanup function
 */
export function cleanup(): void {
  cachedData = null;
  currentTab = 'benchmarks';
}
