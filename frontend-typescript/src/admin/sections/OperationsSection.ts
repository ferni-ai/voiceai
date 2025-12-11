/**
 * Operations Section
 *
 * Infrastructure monitoring dashboard showing service health,
 * latency metrics, error rates, and budget status.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module OperationsSection
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { createLogger } from '../../utils/logger.js';
import {
  ICON_ACTIVITY,
  ICON_EXTERNAL,
  ICON_REFRESH,
  ICON_TREND_UP,
  ICON_WARNING,
  ICON_ZAP,
  iconSm,
} from '../icons.js';

const log = createLogger('OperationsSection');

// ============================================================================
// TYPES
// ============================================================================

interface ServiceStatus {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  statusCode?: number;
  responseTime: number;
  critical: boolean;
  lastChecked: string;
}

interface OperationsMetrics {
  latency: {
    voiceAgent: { p50: number; p95: number; p99: number };
    uiServer: { p50: number; p95: number; p99: number };
  };
  errorRate: {
    voiceAgent: number;
    uiServer: number;
  };
  requestCount: {
    voiceAgent: number;
    uiServer: number;
  };
  instances: {
    voiceAgent: number;
    uiServer: number;
  };
}

interface BudgetStatus {
  name: string;
  limit: number;
  spent: number;
  percentage: number;
  currency: string;
  period: string;
  alertThresholds: number[];
}

interface OperationsData {
  services: ServiceStatus[];
  metrics: OperationsMetrics;
  budget: BudgetStatus;
  links: {
    dashboard: string;
    uptime: string;
    alerts: string;
    logs: string;
    budget: string;
  };
  lastUpdated: string;
}

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the operations section
 */
export async function render(): Promise<string> {
  log.debug('Rendering operations section');

  // Fetch operations data
  const data = await fetchOperationsData();

  const healthyCount = data.services.filter((s) => s.status === 'healthy').length;
  const totalCount = data.services.length;
  const overallStatus = healthyCount === totalCount ? 'healthy' : healthyCount > 0 ? 'degraded' : 'down';

  return `
    <div class="ops-section">
      <!-- Overall Status Banner -->
      <div class="ops-banner ops-banner--${overallStatus}">
        <div class="ops-banner-content">
          <span class="ops-banner-indicator"></span>
          <span class="ops-banner-text">${getStatusText(overallStatus, healthyCount, totalCount)}</span>
        </div>
        <div class="ops-banner-actions">
          <button class="admin-btn admin-btn--icon" data-action="refresh-ops" aria-label="Refresh">
            <span class="admin-icon">${iconSm(ICON_REFRESH)}</span>
          </button>
          <span class="ops-updated">Updated ${formatTime(data.lastUpdated)}</span>
        </div>
      </div>

      <!-- Service Status Grid -->
      <div class="admin-card">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_ACTIVITY)}</span>
          Service Status
        </h2>
        <div class="ops-services-grid">
          ${data.services.map((s) => renderServiceCard(s)).join('')}
        </div>
      </div>

      <!-- Metrics Row -->
      <div class="ops-metrics-row">
        <!-- Latency Card -->
        <div class="admin-card ops-latency-card">
          <h2 class="admin-section-title">
            <span class="admin-icon">${iconSm(ICON_ZAP)}</span>
            Response Latency
          </h2>
          <div class="ops-latency-grid">
            ${renderLatencyMetrics('Voice Agent', data.metrics.latency.voiceAgent)}
            ${renderLatencyMetrics('UI Server', data.metrics.latency.uiServer)}
          </div>
        </div>

        <!-- Error Rate Card -->
        <div class="admin-card ops-errors-card">
          <h2 class="admin-section-title">
            <span class="admin-icon">${iconSm(ICON_WARNING)}</span>
            Error Rates
          </h2>
          <div class="ops-error-rates">
            ${renderErrorRate('Voice Agent', data.metrics.errorRate.voiceAgent)}
            ${renderErrorRate('UI Server', data.metrics.errorRate.uiServer)}
          </div>
        </div>
      </div>

      <!-- Budget & Quick Links -->
      <div class="ops-bottom-row">
        <!-- Budget Card -->
        <div class="admin-card ops-budget-card">
          <h2 class="admin-section-title">
            <span class="admin-icon">${iconSm(ICON_TREND_UP)}</span>
            Monthly Budget
          </h2>
          ${renderBudgetStatus(data.budget)}
        </div>

        <!-- Quick Links Card -->
        <div class="admin-card ops-links-card">
          <h2 class="admin-section-title">
            <span class="admin-icon">${iconSm(ICON_EXTERNAL)}</span>
            GCP Console
          </h2>
          <div class="ops-links-grid">
            ${renderQuickLink('Dashboard', data.links.dashboard)}
            ${renderQuickLink('Uptime Checks', data.links.uptime)}
            ${renderQuickLink('Alert Policies', data.links.alerts)}
            ${renderQuickLink('Cloud Run Logs', data.links.logs)}
            ${renderQuickLink('Budget', data.links.budget)}
          </div>
        </div>
      </div>
    </div>

    <style>
      .ops-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
        color: var(--admin-text-primary, #faf6f0);
      }

      /* Status Banner */
      .ops-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4, 1rem) var(--space-5, 1.25rem);
        border-radius: var(--radius-lg, 12px);
        background: var(--admin-bg-card, #352e28);
        border: 1px solid var(--admin-border, rgba(250, 246, 240, 0.12));
      }

      .ops-banner-content {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
      }

      .ops-banner-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        animation: ops-pulse 2s infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .ops-banner-indicator {
          animation: none;
        }
      }

      .ops-banner--healthy .ops-banner-indicator {
        background: var(--color-semantic-success, #4a6741);
        box-shadow: 0 0 8px var(--color-semantic-success, #4a6741);
      }

      .ops-banner--degraded .ops-banner-indicator {
        background: var(--color-semantic-warning, #d4a84b);
        box-shadow: 0 0 8px var(--color-semantic-warning, #d4a84b);
      }

      .ops-banner--down .ops-banner-indicator {
        background: var(--color-semantic-error, #c44536);
        box-shadow: 0 0 8px var(--color-semantic-error, #c44536);
      }

      @keyframes ops-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .ops-banner-text {
        font-weight: 600;
        font-size: 1rem;
        color: var(--admin-text-primary, #faf6f0);
      }

      .ops-banner-actions {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
      }

      .ops-updated {
        font-size: 0.75rem;
        color: var(--admin-text-muted, #a89a8c);
      }

      /* Services Grid */
      .ops-services-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-3, 0.75rem);
      }

      .ops-service-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
        border-radius: var(--radius-md, 8px);
        border-left: 3px solid transparent;
      }

      .ops-service-card--healthy { border-left-color: var(--color-semantic-success, #4a6741); }
      .ops-service-card--degraded { border-left-color: var(--color-semantic-warning, #d4a84b); }
      .ops-service-card--down { border-left-color: var(--color-semantic-error, #c44536); }

      .ops-service-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .ops-service-name {
        font-weight: 600;
        font-size: 0.9375rem;
        color: var(--admin-text-primary, #faf6f0);
      }

      .ops-service-badge {
        font-size: 0.625rem;
        font-weight: 700;
        padding: 0.125rem 0.375rem;
        border-radius: var(--radius-full, 9999px);
        text-transform: uppercase;
      }

      .ops-service-badge--critical {
        background: var(--color-semantic-error, #c44536);
        color: white;
      }

      .ops-service-status {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
      }

      .ops-service-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .ops-service-dot--healthy { background: var(--color-semantic-success, #4a6741); }
      .ops-service-dot--degraded { background: var(--color-semantic-warning, #d4a84b); }
      .ops-service-dot--down { background: var(--color-semantic-error, #c44536); }

      .ops-service-status-text {
        font-size: 0.8125rem;
        color: var(--admin-text-secondary, #d4ccc4);
      }

      .ops-service-meta {
        display: flex;
        gap: var(--space-4, 1rem);
        font-size: 0.75rem;
        color: var(--admin-text-muted, #a89a8c);
      }

      .ops-service-meta span {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
      }

      /* Metrics Row */
      .ops-metrics-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4, 1rem);
      }

      @media (max-width: 768px) {
        .ops-metrics-row {
          grid-template-columns: 1fr;
        }
      }

      .ops-latency-grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .ops-latency-service {
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
        border-radius: var(--radius-md, 8px);
      }

      .ops-latency-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--admin-text-secondary, #d4ccc4);
        margin-bottom: var(--space-2, 0.5rem);
      }

      .ops-latency-values {
        display: flex;
        gap: var(--space-4, 1rem);
      }

      .ops-latency-item {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 0.25rem);
      }

      .ops-latency-percentile {
        font-size: 0.625rem;
        color: var(--admin-text-muted, #a89a8c);
        text-transform: uppercase;
      }

      .ops-latency-value {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--admin-text-primary, #faf6f0);
      }

      /* Error Rates */
      .ops-error-rates {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 0.75rem);
      }

      .ops-error-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
        border-radius: var(--radius-md, 8px);
      }

      .ops-error-label {
        font-size: 0.875rem;
        color: var(--admin-text-secondary, #d4ccc4);
      }

      .ops-error-value {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 1.25rem;
        font-weight: 600;
      }

      .ops-error-value--good { color: var(--color-semantic-success, #4a6741); }
      .ops-error-value--warning { color: var(--color-semantic-warning, #d4a84b); }
      .ops-error-value--bad { color: var(--color-semantic-error, #c44536); }

      /* Bottom Row */
      .ops-bottom-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4, 1rem);
      }

      @media (max-width: 768px) {
        .ops-bottom-row {
          grid-template-columns: 1fr;
        }
      }

      /* Budget */
      .ops-budget-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: var(--space-3, 0.75rem);
      }

      .ops-budget-name {
        font-size: 0.875rem;
        color: var(--admin-text-secondary, #d4ccc4);
      }

      .ops-budget-amount {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--admin-text-primary, #faf6f0);
      }

      .ops-budget-bar {
        height: 8px;
        background: var(--admin-surface-active, rgba(250, 246, 240, 0.12));
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
        margin-bottom: var(--space-2, 0.5rem);
      }

      .ops-budget-fill {
        height: 100%;
        border-radius: var(--radius-full, 9999px);
        transition: width var(--duration-slow, ${DURATION.SLOW}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .ops-budget-fill--good { background: var(--color-semantic-success, #4a6741); }
      .ops-budget-fill--warning { background: var(--color-semantic-warning, #d4a84b); }
      .ops-budget-fill--danger { background: var(--color-semantic-error, #c44536); }

      .ops-budget-meta {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: var(--admin-text-muted, #a89a8c);
      }

      /* Quick Links */
      .ops-links-grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
      }

      .ops-link {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
        border: 1px solid var(--admin-border, rgba(250, 246, 240, 0.12));
        border-radius: var(--radius-md, 8px);
        color: var(--admin-text-secondary, #d4ccc4);
        text-decoration: none;
        font-size: 0.875rem;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .ops-link:hover {
        background: var(--admin-surface-hover, rgba(250, 246, 240, 0.08));
        color: var(--admin-text-primary, #faf6f0);
        border-color: var(--admin-border-hover, rgba(250, 246, 240, 0.2));
      }

      .ops-link:focus-visible {
        outline: 2px solid var(--admin-accent, #4a6741);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .ops-link,
        .ops-budget-fill {
          transition: none;
        }
      }

      .ops-link-icon {
        color: var(--admin-accent, #4a6741);
      }

      .ops-link-icon svg {
        width: 14px;
        height: 14px;
      }
    </style>
  `;
}

// ============================================================================
// RENDER HELPERS
// ============================================================================

function renderServiceCard(service: ServiceStatus): string {
  return `
    <div class="ops-service-card ops-service-card--${service.status}">
      <div class="ops-service-header">
        <span class="ops-service-name">${service.name}</span>
        ${service.critical ? '<span class="ops-service-badge ops-service-badge--critical">Critical</span>' : ''}
      </div>
      <div class="ops-service-status">
        <span class="ops-service-dot ops-service-dot--${service.status}"></span>
        <span class="ops-service-status-text">${getServiceStatusText(service.status)}</span>
      </div>
      <div class="ops-service-meta">
        <span>${service.responseTime}ms</span>
        ${service.statusCode ? `<span>HTTP ${service.statusCode}</span>` : ''}
      </div>
    </div>
  `;
}

function renderLatencyMetrics(
  label: string,
  latency: { p50: number; p95: number; p99: number }
): string {
  return `
    <div class="ops-latency-service">
      <div class="ops-latency-label">${label}</div>
      <div class="ops-latency-values">
        <div class="ops-latency-item">
          <span class="ops-latency-percentile">p50</span>
          <span class="ops-latency-value">${Math.round(latency.p50)}ms</span>
        </div>
        <div class="ops-latency-item">
          <span class="ops-latency-percentile">p95</span>
          <span class="ops-latency-value">${Math.round(latency.p95)}ms</span>
        </div>
        <div class="ops-latency-item">
          <span class="ops-latency-percentile">p99</span>
          <span class="ops-latency-value">${Math.round(latency.p99)}ms</span>
        </div>
      </div>
    </div>
  `;
}

function renderErrorRate(label: string, rate: number): string {
  const percentage = (rate * 100).toFixed(2);
  const rateClass = rate < 0.01 ? 'good' : rate < 0.05 ? 'warning' : 'bad';

  return `
    <div class="ops-error-item">
      <span class="ops-error-label">${label}</span>
      <span class="ops-error-value ops-error-value--${rateClass}">${percentage}%</span>
    </div>
  `;
}

function renderBudgetStatus(budget: BudgetStatus): string {
  const fillClass =
    budget.percentage < 50 ? 'good' : budget.percentage < 80 ? 'warning' : 'danger';

  return `
    <div class="ops-budget-header">
      <span class="ops-budget-name">${budget.name}</span>
      <span class="ops-budget-amount">$${budget.spent} / $${budget.limit}</span>
    </div>
    <div class="ops-budget-bar">
      <div class="ops-budget-fill ops-budget-fill--${fillClass}" style="width: ${budget.percentage}%"></div>
    </div>
    <div class="ops-budget-meta">
      <span>${budget.percentage}% used</span>
      <span>${budget.period}</span>
    </div>
  `;
}

function renderQuickLink(label: string, url: string): string {
  return `
    <a href="${url}" target="_blank" rel="noopener noreferrer" class="ops-link">
      <span class="ops-link-icon">${iconSm(ICON_EXTERNAL)}</span>
      <span>${label}</span>
    </a>
  `;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchOperationsData(): Promise<OperationsData> {
  try {
    const response = await fetch('/api/v1/admin/operations', {
      headers: { 'x-admin-key': 'dev-mode' },
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch operations data');
  }

  // Fallback data
  return {
    services: [],
    metrics: {
      latency: {
        voiceAgent: { p50: 0, p95: 0, p99: 0 },
        uiServer: { p50: 0, p95: 0, p99: 0 },
      },
      errorRate: { voiceAgent: 0, uiServer: 0 },
      requestCount: { voiceAgent: 0, uiServer: 0 },
      instances: { voiceAgent: 0, uiServer: 0 },
    },
    budget: {
      name: 'No data',
      limit: 0,
      spent: 0,
      percentage: 0,
      currency: 'USD',
      period: 'monthly',
      alertThresholds: [],
    },
    links: {
      dashboard: 'https://console.cloud.google.com/monitoring/dashboards?project=johnb-2025',
      uptime: 'https://console.cloud.google.com/monitoring/uptime?project=johnb-2025',
      alerts: 'https://console.cloud.google.com/monitoring/alerting?project=johnb-2025',
      logs: 'https://console.cloud.google.com/run?project=johnb-2025',
      budget: 'https://console.cloud.google.com/billing/budgets?project=johnb-2025',
    },
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

function getStatusText(
  status: 'healthy' | 'degraded' | 'down',
  healthy: number,
  total: number
): string {
  switch (status) {
    case 'healthy':
      return 'All Systems Operational';
    case 'degraded':
      return `${healthy}/${total} Services Healthy`;
    case 'down':
      return 'System Outage';
  }
}

function getServiceStatusText(status: 'healthy' | 'degraded' | 'down'): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'degraded':
      return 'Degraded';
    case 'down':
      return 'Down';
  }
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default { render };
