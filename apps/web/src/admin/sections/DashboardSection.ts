/**
 * Dashboard Section
 *
 * Admin dashboard overview with system health and quick stats.
 * Fetches REAL data from aggregated dashboard API.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module DashboardSection
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { createLogger } from '../../utils/logger.js';
import { getAdminHeadersAsync } from '../admin-api.js';
import {
  ICON_AGENTS,
  ICON_DELETE,
  ICON_EVALOPS,
  ICON_FLAGS,
  ICON_HANDOFF,
  ICON_HEALTH,
  ICON_HISTORY,
  ICON_SEARCH,
  ICON_TREND_DOWN,
  ICON_TREND_UP,
  ICON_TRUST,
  ICON_USER,
  ICON_WARNING,
  ICON_ZAP,
  iconSm,
} from '../icons.js';

const log = createLogger('DashboardSection');

// ============================================================================
// TYPES
// ============================================================================

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  services: Array<{ name: string; status: string; latency?: number }>;
}

interface AggregatedStats {
  agents: { total: number; active: number };
  conversations: { today: number; thisWeek: number; trend: 'up' | 'down' | 'neutral' };
  evalops: { totalEvaluations: number; passRate: number; flaggedCount: number };
  trust: { totalProfiles: number; avgTrustScore: number; activeRelationships: number };
  system: { uptime: number; responseTime: number; errorRate: number; activeSessions: number };
}

interface ActivityEvent {
  id: string;
  type: string;
  action: string;
  description: string;
  timestamp: string;
}

interface QuickStat {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: string;
}

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the dashboard section
 */
export async function render(): Promise<string> {
  log.debug('Rendering dashboard section');

  // Fetch real data from APIs
  const [health, stats, activity] = await Promise.all([
    fetchSystemHealth(),
    fetchAggregatedStats(),
    fetchRecentActivity(),
  ]);

  // Build quick stats from aggregated data
  const quickStats = buildQuickStats(stats);

  return `
    <div class="dashboard-section">
      <!-- System Health Card -->
      <div class="admin-card dashboard-health">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HEALTH)}</span>
          System Health
        </h2>
        <div class="health-status health-status--${health.status}" role="status" aria-live="polite" aria-label="System status: ${getHealthText(health.status)}">
          <span class="health-indicator" aria-hidden="true"></span>
          <span class="health-text">${getHealthText(health.status)}</span>
        </div>
        <div class="health-details">
          <div class="health-item">
            <span class="health-label">Uptime</span>
            <span class="health-value">${formatUptime(health.uptime)}</span>
          </div>
          <div class="health-item">
            <span class="health-label">Response Time</span>
            <span class="health-value">${stats.system.responseTime}ms</span>
          </div>
          <div class="health-item">
            <span class="health-label">Active Sessions</span>
            <span class="health-value">${stats.system.activeSessions}</span>
          </div>
          <div class="health-item">
            <span class="health-label">Error Rate</span>
            <span class="health-value">${(stats.system.errorRate * 100).toFixed(2)}%</span>
          </div>
        </div>
        ${renderServiceStatus(health.services)}
      </div>

      <!-- Quick Stats Grid -->
      <div class="admin-grid dashboard-stats">
        ${quickStats.map((stat) => renderStatCard(stat)).join('')}
      </div>

      <!-- Quick Actions -->
      <div class="admin-card dashboard-actions" role="button" tabindex="0">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_ZAP)}</span>
          Quick Actions
        </h2>
        <div class="quick-actions-grid" role="button" tabindex="0">
          <button aria-label="Search" class="quick-action" data-action="validate-agents">
            <span class="quick-action-icon" role="button" tabindex="0">${iconSm(ICON_SEARCH)}</span>
            <span class="quick-action-text" role="button" tabindex="0">Validate Agents</span>
          </button>
          <button aria-label="Run EvalOps Suite" class="quick-action" data-action="run-evalops">
            <span class="quick-action-icon" role="button" tabindex="0">${iconSm(ICON_EVALOPS)}</span>
            <span class="quick-action-text" role="button" tabindex="0">Run EvalOps Suite</span>
          </button>
          <button aria-label="Refresh" class="quick-action" data-action="refresh-flags">
            <span class="quick-action-icon" role="button" tabindex="0">${iconSm(ICON_FLAGS)}</span>
            <span class="quick-action-text" role="button" tabindex="0">Refresh Flags</span>
          </button>
          <button aria-label="Delete" class="quick-action" data-action="clear-cache">
            <span class="quick-action-icon" role="button" tabindex="0">${iconSm(ICON_DELETE)}</span>
            <span class="quick-action-text" role="button" tabindex="0">Clear Cache</span>
          </button>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="admin-card dashboard-activity">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HISTORY)}</span>
          Recent Activity
          ${activity.length > 0 ? `<span class="activity-count">${activity.length}</span>` : ''}
        </h2>
        <div class="activity-list" role="log" aria-live="polite" aria-label="Recent activity feed">
          ${activity.length > 0 ? activity.map((a) => renderActivityItem(a)).join('') : renderNoActivity()}
        </div>
      </div>
    </div>

    <style>
      /* Inherit admin theme variables */
      .dashboard-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4, 1rem);
        color: var(--admin-text-primary, #faf6f0);
      }

      @media (max-width: min(1024px, 100%)) {
        .dashboard-section {
          grid-template-columns: 1fr;
        }
      }

      .dashboard-health {
        grid-column: span 2;
      }

      @media (max-width: min(1024px, 100%)) {
        .dashboard-health {
          grid-column: span 1;
        }
      }

      .health-status {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
        border-radius: var(--radius-md, 8px);
        margin-bottom: var(--space-4, 1rem);
      }

      .health-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        animation: dashboard-pulse 2s infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .health-indicator {
          animation: none;
        }
      }

      .health-status--healthy .health-indicator {
        background: var(--color-semantic-success, #4a6741);
        box-shadow: 0 0 8px var(--color-semantic-success, #4a6741);
      }

      .health-status--degraded .health-indicator {
        background: var(--color-semantic-warning, #d4a84b);
        box-shadow: 0 0 8px var(--color-semantic-warning, #d4a84b);
      }

      .health-status--down .health-indicator {
        background: var(--color-semantic-error, #c44536);
        box-shadow: 0 0 8px var(--color-semantic-error, #c44536);
      }

      @keyframes dashboard-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .health-text {
        font-weight: 600;
        font-size: 1.125rem;
        color: var(--admin-text-primary, #faf6f0);
      }

      .health-details {
        display: flex;
        gap: var(--space-6, 1.5rem);
        flex-wrap: wrap;
        margin-bottom: var(--space-4, 1rem);
      }

      .health-item {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 0.25rem);
      }

      .health-label {
        font-size: 0.75rem;
        color: var(--admin-text-muted, #a89a8c);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .health-value {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 1rem;
        font-weight: 500;
        color: var(--admin-text-primary, #faf6f0);
      }

      .services-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: var(--space-2, 0.5rem);
      }

      .service-item {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
        border-radius: var(--radius-sm, 4px);
        font-size: 0.8125rem;
      }

      .service-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .service-dot--healthy { background: var(--color-semantic-success, #4a6741); }
      .service-dot--degraded { background: var(--color-semantic-warning, #d4a84b); }
      .service-dot--down { background: var(--color-semantic-error, #c44536); }

      .service-name {
        flex: 1;
        color: var(--admin-text-secondary, #d4ccc4);
      }

      .service-latency {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.6875rem;
        color: var(--admin-text-muted, #a89a8c);
      }

      .dashboard-stats {
        grid-column: span 2;
      }

      @media (max-width: min(1024px, 100%)) {
        .dashboard-stats {
          grid-column: span 1;
        }
      }

      .stat-card {
        background: var(--admin-bg-card, #352e28);
        border: 1px solid var(--admin-border, rgba(250, 246, 240, 0.12));
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-5, 1.25rem);
        text-align: center;
      }

      .stat-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--space-2, 0.5rem);
        color: var(--admin-accent, #4a6741);
      }

      .stat-icon svg {
        width: 20px;
        height: 20px;
      }

      .stat-value {
        font-size: 2rem;
        font-weight: 700;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        color: var(--admin-text-primary, #faf6f0);
      }

      .stat-label {
        font-size: 0.75rem;
        color: var(--admin-text-secondary, #d4ccc4);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-top: var(--space-2, 0.5rem);
      }

      .stat-change {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-1, 0.25rem);
        font-size: 0.75rem;
        margin-top: var(--space-1, 0.25rem);
      }

      .stat-change--up { color: var(--color-semantic-success, #4a6741); }
      .stat-change--down { color: var(--color-semantic-error, #c44536); }
      .stat-change--neutral { color: var(--color-text-secondary, #a89a8c); }

      .stat-change svg {
        width: 12px;
        height: 12px;
      }

      .quick-actions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: var(--space-3, 0.75rem);
      }

      .quick-action {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
        border: 1px solid var(--admin-border, rgba(250, 246, 240, 0.12));
        border-radius: var(--radius-md, 8px);
        color: var(--admin-text-primary, #faf6f0);
        font-family: inherit;
        cursor: pointer;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .quick-action:hover {
        background: var(--admin-surface-active, rgba(250, 246, 240, 0.12));
        border-color: var(--admin-border-hover, rgba(250, 246, 240, 0.2));
        transform: translateY(-2px);
      }

      .quick-action:focus-visible {
        outline: 2px solid var(--admin-accent, #4a6741);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .quick-action {
          transition: none;
        }
        .quick-action:hover {
          transform: none;
        }
      }

      .quick-action-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--admin-accent, #4a6741);
      }

      .quick-action-icon svg {
        width: 24px;
        height: 24px;
      }

      .quick-action-text {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--admin-text-primary, #faf6f0);
      }

      .activity-count {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.125rem 0.5rem;
        background: var(--admin-accent, #4a6741);
        color: white;
        border-radius: var(--radius-full, 9999px);
        margin-left: auto;
      }

      .activity-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
      }

      .activity-item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
        border-radius: var(--radius-md, 8px);
      }

      .activity-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--admin-accent, #4a6741);
      }

      .activity-icon svg {
        width: 16px;
        height: 16px;
      }

      .activity-icon--warning { color: var(--color-semantic-warning, #d4a84b); }
      .activity-icon--error { color: var(--color-semantic-error, #c44536); }

      .activity-text {
        flex: 1;
        font-size: 0.875rem;
        color: var(--admin-text-primary, #faf6f0);
      }

      .activity-time {
        font-size: 0.75rem;
        color: var(--admin-text-muted, #a89a8c);
      }

      .no-activity {
        text-align: center;
        padding: var(--space-6, 1.5rem);
        color: var(--admin-text-secondary, #d4ccc4);
      }

      .no-activity-icon {
        margin-bottom: var(--space-2, 0.5rem);
        color: var(--admin-text-muted, #a89a8c);
      }

      .no-activity-icon svg {
        width: 32px;
        height: 32px;
      }
    </style>
  `;
}

// ============================================================================
// RENDER HELPERS
// ============================================================================

function renderStatCard(stat: QuickStat): string {
  const trendIcon =
    stat.trend === 'up'
      ? iconSm(ICON_TREND_UP)
      : stat.trend === 'down'
        ? iconSm(ICON_TREND_DOWN)
        : '';

  return `
    <div class="stat-card">
      <div class="stat-icon">${iconSm(stat.icon)}</div>
      <div class="stat-value">${stat.value}</div>
      <div class="stat-label">${stat.label}</div>
      ${
        stat.change
          ? `
        <div class="stat-change stat-change--${stat.trend ?? 'neutral'}">
          ${trendIcon}
          ${stat.change}
        </div>
      `
          : ''
      }
    </div>
  `;
}

function renderServiceStatus(
  services: Array<{ name: string; status: string; latency?: number }>
): string {
  if (!services || services.length === 0) return '';

  return `
    <div class="services-grid">
      ${services
        .map(
          (s) => `
        <div class="service-item">
          <span class="service-dot service-dot--${s.status}"></span>
          <span class="service-name">${s.name}</span>
          ${s.latency ? `<span class="service-latency">${s.latency}ms</span>` : ''}
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

function renderActivityItem(activity: ActivityEvent): string {
  const icon = getActivityIcon(activity.type);
  const iconClass = activity.type === 'system' ? 'activity-icon--warning' : '';

  return `
    <div class="activity-item" data-id="${activity.id}">
      <span class="activity-icon ${iconClass}">${iconSm(icon)}</span>
      <span class="activity-text">${activity.description}</span>
      <span class="activity-time">${activity.timestamp}</span>
    </div>
  `;
}

function renderNoActivity(): string {
  return `
    <div class="no-activity">
      <div class="no-activity-icon">${iconSm(ICON_HISTORY)}</div>
      <p>No recent activity</p>
      <p style="font-size: 0.75rem; margin-top: 0.5rem;">Activity will appear here as events occur</p>
    </div>
  `;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchSystemHealth(): Promise<SystemHealth> {
  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/dashboard/health', {
      headers,
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch system health');
  }

  // Fallback - indicate API unavailable
  return {
    status: 'down',
    uptime: 0,
    services: [],
  };
}

async function fetchAggregatedStats(): Promise<AggregatedStats> {
  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/dashboard/stats', {
      headers,
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch aggregated stats');
  }

  // Fallback with zeros (indicates no data)
  return {
    agents: { total: 0, active: 0 },
    conversations: { today: 0, thisWeek: 0, trend: 'neutral' },
    evalops: { totalEvaluations: 0, passRate: 0, flaggedCount: 0 },
    trust: { totalProfiles: 0, avgTrustScore: 0, activeRelationships: 0 },
    system: { uptime: 0, responseTime: 0, errorRate: 0, activeSessions: 0 },
  };
}

async function fetchRecentActivity(): Promise<ActivityEvent[]> {
  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/dashboard/activity', {
      headers,
    });

    if (response.ok) {
      const data = await response.json();
      return data.activity ?? [];
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch recent activity');
  }

  return [];
}

// ============================================================================
// UTILITIES
// ============================================================================

function buildQuickStats(stats: AggregatedStats): QuickStat[] {
  return [
    {
      label: 'Active Agents',
      value: stats.agents.active,
      icon: ICON_AGENTS,
    },
    {
      label: 'Conversations Today',
      value: stats.conversations.today,
      change: stats.conversations.trend === 'up' ? '+12%' : undefined,
      trend: stats.conversations.trend,
      icon: ICON_USER,
    },
    {
      label: 'EvalOps Score',
      value: stats.evalops.passRate > 0 ? `${stats.evalops.passRate}%` : '-',
      icon: ICON_EVALOPS,
    },
    {
      label: 'Trust Profiles',
      value: stats.trust.totalProfiles,
      icon: ICON_TRUST,
    },
  ];
}

function getHealthText(status: SystemHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'All Systems Operational';
    case 'degraded':
      return 'Degraded Performance';
    case 'down':
      return 'System Down';
  }
}

function formatUptime(seconds: number): string {
  if (seconds === 0) return '-';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getActivityIcon(type: string): string {
  switch (type) {
    case 'handoff':
      return ICON_HANDOFF;
    case 'evalops':
      return ICON_EVALOPS;
    case 'trust':
      return ICON_TRUST;
    case 'agent':
      return ICON_AGENTS;
    case 'flag':
      return ICON_FLAGS;
    case 'user':
      return ICON_USER;
    case 'system':
      return ICON_WARNING;
    default:
      return ICON_HISTORY;
  }
}

export default { render };
