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
import { adminFetch } from '../admin-fetch.js';
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
import {
  isUnavailable,
  loadJson,
  measured,
  renderUnavailable,
  type Unavailable,
} from '../unavailable-state.js';

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

// What src/api/v1/admin/better-than-human-analytics.ts sends.

interface KnownGap {
  category: string;
  examples: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface BenchmarkResult {
  capability: string;
  totalTestCases: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  knownGaps: KnownGap[];
}

interface TelemetryEntry {
  capability: string;
  totalTriggers: number;
  uniqueUsers: number;
  acknowledgmentRate: number | null;
  engagementRate: number | null;
  averageConfidence: number;
}

/** GET .../benchmark runs a synthetic benchmark: fixed test cases in code. */
type Benchmark = {
  results: { generatedAt: string; overallF1Score: number; capabilities: BenchmarkResult[] };
};
/** GET .../telemetry: production events over the last periodDays. */
type Telemetry = { periodDays: number; entries: TelemetryEntry[]; timestamp: string };

interface ValidationData {
  benchmark: Benchmark | Unavailable;
  telemetry: Telemetry | Unavailable;
}

// ============================================================================
// STATE
// ============================================================================

let currentTab: 'benchmarks' | 'gaps' | 'telemetry' = 'benchmarks';
let cachedData: ValidationData | null = null;

// ============================================================================
// DATA FETCHING
// ============================================================================

// Each GET of the benchmark route runs the benchmark, and its result carries the gaps
const loadBenchmark = () =>
  loadJson<Benchmark>(adminFetch('/api/v1/admin/bth/validation/benchmark'), 'BTH benchmark');
const loadTelemetry = () =>
  loadJson<Telemetry>(adminFetch('/api/v1/admin/bth/validation/telemetry'), 'BTH telemetry');

/** Held until cleanup() or an action button reloads a part; failures are held as reasons. */
async function fetchValidationData(): Promise<ValidationData> {
  if (cachedData) return cachedData;
  const [benchmark, telemetry] = await Promise.all([loadBenchmark(), loadTelemetry()]);
  cachedData = { benchmark, telemetry };
  return cachedData;
}

/** A stat card value, or the reason the request failed. */
function stat<T>(data: T | Unavailable, read: (value: T) => string): string {
  return isUnavailable(data) ? renderUnavailable(data.unavailable) : escapeHtml(read(data));
}

function allGaps(benchmark: Benchmark): Array<KnownGap & { capability: string }> {
  return benchmark.results.capabilities.flatMap((c) =>
    c.knownGaps.map((gap) => ({ ...gap, capability: c.capability }))
  );
}

/** "Synthetic benchmark: N fixed test cases in code, not production traffic. Run <when>." */
function syntheticLabel(benchmark: Benchmark | Unavailable): string {
  if (isUnavailable(benchmark)) {
    return `Synthetic benchmark: ${renderUnavailable(benchmark.unavailable)}`;
  }
  const cases = benchmark.results.capabilities.reduce((sum, c) => sum + c.totalTestCases, 0);
  return `Synthetic benchmark: ${cases} fixed test cases in code, not production traffic. Run ${escapeHtml(formatTime(benchmark.results.generatedAt))}.`;
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
  const bench = data.benchmark;
  const f1 = stat(bench, (b) => formatPercent(b.results.overallF1Score));
  const f1Status = isUnavailable(bench)
    ? 'neutral'
    : getF1StatusClass(bench.results.overallF1Score);
  const gapCount = stat(bench, (b) => String(allGaps(b).length));
  const capabilityCount = stat(bench, (b) => String(b.results.capabilities.length));

  return `
    <div class="bth-validation-section">
      ${renderStyles()}

      <!-- Overview Stats -->
      <div class="admin-grid bth-stats">
        ${renderStatCard('Benchmark F1', f1, ICON_TARGET, f1Status)}
        ${renderStatCard('Benchmark Gaps', gapCount, ICON_WARNING, 'neutral')}
        ${renderStatCard('Capabilities', capabilityCount, ICON_CHECK, 'neutral')}
        ${renderStatCard('Production Triggers', stat(data.telemetry, getTotalTriggers), ICON_ZAP, 'neutral')}
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
            ${iconSm(ICON_FLAGS)} Gaps${isUnavailable(data.benchmark) ? '' : ` (${allGaps(data.benchmark).length})`}
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
          ${currentTab === 'gaps' ? renderGapsTab(data.benchmark) : ''}
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
        <p class="bth-last-run">${syntheticLabel(data.benchmark)}</p>
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
  if (isUnavailable(benchmark)) return renderUnavailable(benchmark.unavailable);
  if (benchmark.results.capabilities.length === 0) {
    return `<div class="bth-empty"><p>The benchmark ran no capabilities.</p></div>`;
  }

  return `
    <div class="bth-benchmark-table-container">
      <table class="bth-table">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Cases</th>
            <th>TP</th>
            <th>FP</th>
            <th>FN</th>
            <th>TN</th>
            <th>Precision</th>
            <th>Recall</th>
            <th>F1 Score</th>
          </tr>
        </thead>
        <tbody>
          ${[...benchmark.results.capabilities]
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
      <td>${escapeHtml(cap.totalTestCases)}</td>
      <td>${escapeHtml(cap.truePositives)}</td>
      <td>${escapeHtml(cap.falsePositives)}</td>
      <td>${escapeHtml(cap.falseNegatives)}</td>
      <td>${escapeHtml(cap.trueNegatives)}</td>
      <td>${formatPercent(cap.precision)}</td>
      <td>${formatPercent(cap.recall)}</td>
      <td class="bth-f1 bth-f1--${f1Class}">${formatPercent(cap.f1Score)}</td>
    </tr>
  `;
}

function renderGapsTab(benchmark: ValidationData['benchmark']): string {
  if (isUnavailable(benchmark)) return renderUnavailable(benchmark.unavailable);
  const gaps = allGaps(benchmark);
  if (gaps.length === 0) {
    return `<div class="bth-empty"><p>The synthetic benchmark found no failing categories.</p></div>`;
  }

  return `
    <div class="bth-gaps-container">
      ${gaps.map((gap) => renderGapCategory(gap)).join('')}
    </div>
  `;
}

function renderGapCategory(gap: KnownGap & { capability: string }): string {
  return `
    <div class="bth-gap-category">
      <div class="bth-gap-header">
        <span class="bth-gap-title">${escapeHtml(gap.category)}</span>
        <span class="bth-gap-count">${escapeHtml(gap.capability)}, ${escapeHtml(gap.priority)} priority</span>
      </div>
      ${gap.examples.length > 0 ? renderGapExamples(gap.examples.slice(0, 3)) : ''}
    </div>
  `;
}

function renderGapExamples(examples: string[]): string {
  return `
    <div class="bth-gap-examples">
      ${examples
        .map(
          (ex) => `
        <div class="bth-gap-example">
          <span class="bth-gap-input">${escapeHtml(truncate(ex, 60))}</span>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

function renderTelemetryTab(telemetry: ValidationData['telemetry']): string {
  if (isUnavailable(telemetry)) return renderUnavailable(telemetry.unavailable);
  if (telemetry.entries.length === 0) {
    return `<div class="bth-empty"><p>No production events in the last ${escapeHtml(telemetry.periodDays)} days.</p></div>`;
  }

  return `
    <div class="bth-telemetry-period">Production events, last ${escapeHtml(telemetry.periodDays)} days. Read ${escapeHtml(formatTime(telemetry.timestamp))}.</div>
    <div class="bth-telemetry-table-container">
      <table class="bth-table">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Triggers</th>
            <th>People</th>
            <th>Acknowledged</th>
            <th>Engaged</th>
            <th>Avg Confidence</th>
          </tr>
        </thead>
        <tbody>
          ${[...telemetry.entries]
            .sort((a, b) => b.totalTriggers - a.totalTriggers)
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
      <td>${escapeHtml(entry.totalTriggers)}</td>
      <td>${escapeHtml(entry.uniqueUsers)}</td>
      <td>${measured(entry.acknowledgmentRate, formatPercent)}</td>
      <td>${measured(entry.engagementRate, formatPercent)}</td>
      <td>${formatPercent(entry.averageConfidence)}</td>
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

function getTotalTriggers(telemetry: Telemetry): string {
  return String(telemetry.entries.reduce((sum, e) => sum + e.totalTriggers, 0));
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

// ============================================================================
// EVENT SETUP
// ============================================================================

/** Draw the section again into `container` (the portal's content area) and wire it. */
async function rerender(container: HTMLElement): Promise<void> {
  container.innerHTML = await render();
  setupEvents(container);
}

/** Disable an action button and say what it is doing until the section redraws. */
function busy(container: HTMLElement, action: string, text: string): void {
  const button = container.querySelector(`[data-action="${action}"]`);
  if (!(button instanceof HTMLButtonElement)) return;
  button.disabled = true;
  button.textContent = text;
}

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
                ? renderGapsTab(data.benchmark)
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
    busy(container, 'run-benchmark', 'Running benchmark');
    // One request runs it; a failure is drawn as its reason
    const benchmark = await loadBenchmark();
    if (cachedData) cachedData.benchmark = benchmark;
    await rerender(container);
  });

  container
    .querySelector('[data-action="refresh-telemetry"]')
    ?.addEventListener('click', async () => {
      log.info('Refreshing telemetry...');
      busy(container, 'refresh-telemetry', 'Refreshing telemetry');
      // Telemetry only: clearing everything would run the benchmark again
      const telemetry = await loadTelemetry();
      if (cachedData) cachedData.telemetry = telemetry;
      currentTab = 'telemetry';
      await rerender(container);
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
