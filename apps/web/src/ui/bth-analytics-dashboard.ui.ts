/**
 * Better Than Human (BTH) Analytics Dashboard UI
 *
 * Displays capability effectiveness metrics from the resonance feedback system.
 * Shows which superhuman capabilities resonate with users and their effectiveness over time.
 *
 * Fetches data from:
 * - GET /api/admin/bth-analytics/stats - All capability stats
 * - GET /api/admin/bth-analytics/top - Most effective capabilities
 * - GET /api/admin/bth-analytics/trend - Effectiveness trend
 *
 * @module @ferni/ui/bth-analytics-dashboard
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';
import { t } from '../i18n/index.js';
import { apiGet } from '../utils/api.js';

const log = createLogger('BTHAnalyticsDashboard');

// ============================================================================
// TYPES
// ============================================================================

interface CapabilityStats {
  capability: string;
  totalUsage: number;
  appliedCount: number;
  positiveReactions: number;
  neutralReactions: number;
  negativeReactions: number;
  effectivenessScore: number;
}

interface TrendPoint {
  date: string;
  effectiveness: number;
  usageCount: number;
}

interface DashboardData {
  stats: CapabilityStats[];
  topCapabilities: Array<{ capability: string; score: number }>;
  trend: TrendPoint[];
}

// ============================================================================
// STATE
// ============================================================================

let dashboardEl: HTMLElement | null = null;
let isVisible = false;

// ============================================================================
// DOM HELPERS (Safe DOM creation)
// ============================================================================

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: {
    className?: string;
    textContent?: string;
    attributes?: Record<string, string>;
    style?: Partial<CSSStyleDeclaration>;
    children?: (HTMLElement | string)[];
  }
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options?.className) el.className = options.className;
  if (options?.textContent) el.textContent = options.textContent;
  if (options?.attributes) {
    for (const [key, value] of Object.entries(options.attributes)) {
      el.setAttribute(key, value);
    }
  }
  if (options?.style) {
    for (const [key, value] of Object.entries(options.style)) {
      el.style.setProperty(key, value as string);
    }
  }
  if (options?.children) {
    for (const child of options.children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}

// ============================================================================
// RENDERING (Safe DOM methods)
// ============================================================================

function renderDashboard(data: DashboardData | null, loading = false, error: string | null = null): HTMLElement {
  const container = createElement('div', { className: 'bth-dashboard' });

  // Header
  const header = createElement('div', { className: 'bth-dashboard__header' });
  header.appendChild(createElement('h2', { textContent: 'Better Than Human Analytics' }));
  header.appendChild(createElement('p', {
    className: 'bth-dashboard__subtitle',
    textContent: 'Superhuman capability effectiveness metrics',
  }));
  const closeBtn = createElement('button', {
    className: 'bth-dashboard__close',
    textContent: '×',
    attributes: { 'data-action': 'close', 'aria-label': 'Close dashboard' },
  });
  header.appendChild(closeBtn);
  container.appendChild(header);

  // Content
  const content = createElement('div', { className: 'bth-dashboard__content' });
  if (loading) {
    content.appendChild(renderLoading());
  } else if (error) {
    content.appendChild(renderError(error));
  } else {
    content.appendChild(renderContent(data));
  }
  container.appendChild(content);

  // Footer
  const footer = createElement('div', { className: 'bth-dashboard__footer' });
  footer.appendChild(createElement('button', {
    className: 'bth-btn bth-btn--secondary',
    textContent: 'Refresh',
    attributes: { 'data-action': 'refresh' },
  }));
  footer.appendChild(createElement('button', {
    className: 'bth-btn bth-btn--primary',
    textContent: 'Done',
    attributes: { 'data-action': 'close' },
  }));
  container.appendChild(footer);

  return container;
}

function renderLoading(): HTMLElement {
  const loading = createElement('div', { className: 'bth-loading' });
  loading.appendChild(createElement('div', { className: 'bth-loading__spinner' }));
  loading.appendChild(createElement('p', { textContent: 'Loading analytics...' }));
  return loading;
}

function renderError(message: string): HTMLElement {
  const errorEl = createElement('div', { className: 'bth-error' });
  errorEl.appendChild(createElement('p', { textContent: "Couldn't load analytics" }));
  errorEl.appendChild(createElement('p', { className: 'bth-error__detail', textContent: message }));
  errorEl.appendChild(createElement('button', {
    className: 'bth-btn bth-btn--secondary',
    textContent: 'Try Again',
    attributes: { 'data-action': 'refresh' },
  }));
  return errorEl;
}

function renderContent(data: DashboardData | null): HTMLElement {
  const content = createElement('div');

  if (!data || data.stats.length === 0) {
    const empty = createElement('div', { className: 'bth-empty' });
    empty.appendChild(createElement('p', { textContent: 'No data yet' }));
    empty.appendChild(createElement('p', {
      className: 'bth-empty__hint',
      textContent: 'Resonance checks will appear here once users start responding to "Does that track?" prompts.',
    }));
    return empty;
  }

  // Top Performers Section
  if (data.topCapabilities.length > 0) {
    const topSection = createElement('section', { className: 'bth-section' });
    topSection.appendChild(createElement('h3', {
      className: 'bth-section__title',
      textContent: 'Top Performing Capabilities',
    }));

    const topGrid = createElement('div', { className: 'bth-top-grid' });
    data.topCapabilities.slice(0, 5).forEach((cap, i) => {
      const card = createElement('div', { className: `bth-top-card bth-top-card--rank-${i + 1}` });
      card.appendChild(createElement('span', { className: 'bth-top-card__rank', textContent: `#${i + 1}` }));
      card.appendChild(createElement('span', {
        className: 'bth-top-card__name',
        textContent: formatCapabilityName(cap.capability),
      }));
      card.appendChild(createElement('span', {
        className: 'bth-top-card__score',
        textContent: `${Math.round(cap.score * 100)}%`,
      }));
      topGrid.appendChild(card);
    });
    topSection.appendChild(topGrid);
    content.appendChild(topSection);
  }

  // All Capabilities Table
  const tableSection = createElement('section', { className: 'bth-section' });
  tableSection.appendChild(createElement('h3', {
    className: 'bth-section__title',
    textContent: 'All Capabilities',
  }));

  const tableContainer = createElement('div', { className: 'bth-table-container' });
  const table = createElement('table', { className: 'bth-table' });

  // Table header
  const thead = createElement('thead');
  const headerRow = createElement('tr');
  ['Capability', 'Usage', 'Applied', '+', '○', '-', 'Effectiveness'].forEach((text, i) => {
    const th = createElement('th', { textContent: text });
    if (i === 3) th.className = 'bth-positive';
    if (i === 4) th.className = 'bth-neutral';
    if (i === 5) th.className = 'bth-negative';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = createElement('tbody');
  data.stats.forEach(stat => {
    const row = createElement('tr');

    row.appendChild(createElement('td', {
      className: 'bth-capability-name',
      textContent: formatCapabilityName(stat.capability),
    }));
    row.appendChild(createElement('td', { textContent: String(stat.totalUsage) }));
    row.appendChild(createElement('td', { textContent: String(stat.appliedCount) }));
    row.appendChild(createElement('td', {
      className: 'bth-positive',
      textContent: String(stat.positiveReactions),
    }));
    row.appendChild(createElement('td', {
      className: 'bth-neutral',
      textContent: String(stat.neutralReactions),
    }));
    row.appendChild(createElement('td', {
      className: 'bth-negative',
      textContent: String(stat.negativeReactions),
    }));

    // Effectiveness cell with bar
    const effectivenessCell = createElement('td');
    const effectivenessDiv = createElement('div', { className: 'bth-effectiveness' });
    const bar = createElement('div', {
      className: 'bth-effectiveness__bar',
      style: { width: `${Math.round(stat.effectivenessScore * 100)}%` },
    });
    effectivenessDiv.appendChild(bar);
    effectivenessDiv.appendChild(createElement('span', {
      textContent: `${Math.round(stat.effectivenessScore * 100)}%`,
    }));
    effectivenessCell.appendChild(effectivenessDiv);
    row.appendChild(effectivenessCell);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  tableContainer.appendChild(table);
  tableSection.appendChild(tableContainer);
  content.appendChild(tableSection);

  // Trend Section
  if (data.trend.length > 0) {
    const trendSection = createElement('section', { className: 'bth-section' });
    trendSection.appendChild(createElement('h3', {
      className: 'bth-section__title',
      textContent: '7-Day Trend',
    }));

    const trend = createElement('div', { className: 'bth-trend' });
    data.trend.forEach(point => {
      const pointEl = createElement('div', {
        className: 'bth-trend__point',
        style: { ['--height' as string]: `${Math.round(point.effectiveness * 100)}%` },
      });
      pointEl.appendChild(createElement('span', { className: 'bth-trend__bar' }));
      pointEl.appendChild(createElement('span', {
        className: 'bth-trend__label',
        textContent: formatDate(point.date),
      }));
      trend.appendChild(pointEl);
    });
    trendSection.appendChild(trend);
    content.appendChild(trendSection);
  }

  return content;
}

function formatCapabilityName(capability: string): string {
  // Convert SCREAMING_SNAKE_CASE to Title Case
  return capability
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchDashboardData(): Promise<DashboardData> {
  const [statsRes, topRes, trendRes] = await Promise.all([
    apiGet<{ stats?: CapabilityStats[] }>('/api/admin/bth-analytics/stats'),
    apiGet<{ capabilities?: CapabilityStats[] }>('/api/admin/bth-analytics/top?limit=5'),
    apiGet<{ trend?: TrendPoint[] }>('/api/admin/bth-analytics/trend?days=7'),
  ]);

  if (!statsRes.ok || !topRes.ok || !trendRes.ok) {
    throw new Error('Failed to fetch analytics data');
  }

  return {
    stats: statsRes.data?.stats || [],
    topCapabilities: topRes.data?.capabilities || [],
    trend: trendRes.data?.trend || [],
  };
}

// ============================================================================
// LIFECYCLE
// ============================================================================

async function loadAndRender(): Promise<void> {
  if (!dashboardEl) return;

  // Clear and show loading
  dashboardEl.replaceChildren(renderDashboard(null, true, null));

  try {
    const data = await fetchDashboardData();
    dashboardEl.replaceChildren(renderDashboard(data, false, null));
    attachEventListeners();
  } catch (err) {
    log.error({ err }, 'Failed to load BTH analytics');
    dashboardEl.replaceChildren(renderDashboard(null, false, (err as Error).message));
    attachEventListeners();
  }
}

function attachEventListeners(): void {
  if (!dashboardEl) return;

  dashboardEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleAction);
  });

  // Click backdrop to close
  dashboardEl.addEventListener('click', (e) => {
    if (e.target === dashboardEl) {
      hide();
    }
  });
}

function handleAction(e: Event): void {
  const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');

  switch (action) {
    case 'close':
      hide();
      break;
    case 'refresh':
      void loadAndRender();
      toast.info(t('toasts.refreshing'));
      break;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the BTH Analytics dashboard
 */
export async function showBTHAnalyticsDashboard(): Promise<void> {
  if (isVisible) return;

  // Create container
  dashboardEl = document.createElement('div');
  dashboardEl.className = 'bth-dashboard-overlay';
  dashboardEl.setAttribute('role', 'dialog');
  dashboardEl.setAttribute('aria-modal', 'true');
  dashboardEl.setAttribute('aria-label', 'Better Than Human Analytics Dashboard');

  document.body.appendChild(dashboardEl);
  injectStyles();

  isVisible = true;
  await loadAndRender();

  // Animate in
  requestAnimationFrame(() => {
    dashboardEl?.classList.add('bth-dashboard-overlay--visible');
  });

  log.info('BTH Analytics dashboard opened');
}

/**
 * Hide the BTH Analytics dashboard
 */
export function hide(): void {
  if (!isVisible || !dashboardEl) return;

  dashboardEl.classList.remove('bth-dashboard-overlay--visible');

  setTimeout(() => {
    dashboardEl?.remove();
    dashboardEl = null;
    isVisible = false;
  }, 200);

  log.info('BTH Analytics dashboard closed');
}

// ============================================================================
// STYLES
// ============================================================================

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;

  const style = document.createElement('style');
  style.id = 'bth-analytics-styles';
  style.textContent = `
    .bth-dashboard-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      background: var(--backdrop-heavy, rgba(0, 0, 0, 0.7));
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity var(--duration-normal, 200ms) ease;
    }

    .bth-dashboard-overlay--visible {
      opacity: 1;
    }

    .bth-dashboard {
      background: var(--color-bg-elevated, #1a1a2e);
      border-radius: var(--radius-xl, 16px);
      width: min(900px, 95vw);
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.5));
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    }

    .bth-dashboard__header {
      padding: var(--space-lg, 1.5rem);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      position: relative;
    }

    .bth-dashboard__header h2 {
      margin: 0;
      font-size: 1.25rem;
      color: var(--color-text-primary, #fff);
    }

    .bth-dashboard__subtitle {
      margin: var(--space-xs, 0.25rem) 0 0;
      font-size: 0.875rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .bth-dashboard__close {
      position: absolute;
      top: var(--space-md, 1rem);
      right: var(--space-md, 1rem);
      background: none;
      border: none;
      font-size: 1.5rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      cursor: pointer;
      padding: var(--space-xs, 0.25rem);
      line-height: 1;
    }

    .bth-dashboard__close:hover {
      color: var(--color-text-primary, #fff);
    }

    .bth-dashboard__content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 1.5rem);
    }

    .bth-dashboard__footer {
      padding: var(--space-md, 1rem) var(--space-lg, 1.5rem);
      border-top: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.5rem);
    }

    .bth-btn {
      padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
      border-radius: var(--radius-md, 8px);
      border: 1px solid transparent;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all var(--duration-fast, 150ms) ease;
    }

    .bth-btn--primary {
      background: var(--color-accent-primary, #3D5A45);
      color: var(--color-text-primary, #fff);
    }

    .bth-btn--primary:hover {
      background: var(--color-accent-hover, #4a6a52);
    }

    .bth-btn--secondary {
      background: transparent;
      border-color: var(--color-border-medium, rgba(255, 255, 255, 0.2));
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.8));
    }

    .bth-btn--secondary:hover {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.05));
    }

    .bth-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-xl, 3rem);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .bth-loading__spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      border-top-color: var(--color-accent-primary, #3D5A45);
      border-radius: 50%;
      animation: bth-spin 1s linear infinite;
    }

    @keyframes bth-spin {
      to { transform: rotate(360deg); }
    }

    .bth-error {
      text-align: center;
      padding: var(--space-xl, 3rem);
      color: var(--color-semantic-error, #ef4444);
    }

    .bth-error__detail {
      font-size: 0.875rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin-bottom: var(--space-md, 1rem);
    }

    .bth-empty {
      text-align: center;
      padding: var(--space-xl, 3rem);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .bth-empty__hint {
      font-size: 0.875rem;
      margin-top: var(--space-sm, 0.5rem);
    }

    .bth-section {
      margin-bottom: var(--space-lg, 1.5rem);
    }

    .bth-section__title {
      font-size: 1rem;
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.8));
      margin: 0 0 var(--space-md, 1rem);
    }

    .bth-top-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: var(--space-sm, 0.5rem);
    }

    .bth-top-card {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-md, 8px);
      padding: var(--space-md, 1rem);
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 0.25rem);
      border-left: 3px solid var(--color-accent-primary, #3D5A45);
    }

    .bth-top-card--rank-1 { border-left-color: var(--color-semantic-success, #22c55e); }
    .bth-top-card--rank-2 { border-left-color: var(--color-accent-primary, #3D5A45); }
    .bth-top-card--rank-3 { border-left-color: var(--color-text-muted, rgba(255, 255, 255, 0.5)); }

    .bth-top-card__rank {
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .bth-top-card__name {
      font-size: 0.875rem;
      color: var(--color-text-primary, #fff);
      font-weight: 500;
    }

    .bth-top-card__score {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-semantic-success, #22c55e);
    }

    .bth-table-container {
      overflow-x: auto;
    }

    .bth-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .bth-table th,
    .bth-table td {
      padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
      text-align: left;
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.05));
    }

    .bth-table th {
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .bth-table td {
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.8));
    }

    .bth-capability-name {
      color: var(--color-text-primary, #fff);
      font-weight: 500;
    }

    .bth-positive { color: var(--color-semantic-success, #22c55e); }
    .bth-neutral { color: var(--color-text-muted, rgba(255, 255, 255, 0.5)); }
    .bth-negative { color: var(--color-semantic-error, #ef4444); }

    .bth-effectiveness {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
    }

    .bth-effectiveness__bar {
      height: 6px;
      min-width: 60px;
      max-width: 100px;
      background: var(--color-semantic-success, #22c55e);
      border-radius: 3px;
    }

    .bth-trend {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      height: 120px;
      gap: var(--space-xs, 0.25rem);
      padding-top: var(--space-md, 1rem);
    }

    .bth-trend__point {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      height: 100%;
    }

    .bth-trend__bar {
      width: 100%;
      max-width: 40px;
      height: var(--height, 50%);
      background: linear-gradient(to top, var(--color-accent-primary, #3D5A45), var(--color-semantic-success, #22c55e));
      border-radius: 4px 4px 0 0;
      transition: height var(--duration-normal, 200ms) ease;
    }

    .bth-trend__label {
      font-size: 0.625rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin-top: var(--space-xs, 0.25rem);
    }
  `;

  document.head.appendChild(style);
  stylesInjected = true;
}

export const bthAnalyticsDashboard = {
  show: showBTHAnalyticsDashboard,
  hide,
};
