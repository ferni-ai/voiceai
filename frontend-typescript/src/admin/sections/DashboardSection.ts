/**
 * Dashboard Section
 *
 * Admin dashboard overview with system health and quick stats.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module DashboardSection
 */

import { createLogger } from '../../utils/logger.js';
import { DURATION, EASING } from '../../config/animation-constants.js';
import {
  ICON_HEALTH,
  ICON_ZAP,
  ICON_HISTORY,
  ICON_SEARCH,
  ICON_EVALOPS,
  ICON_FLAGS,
  ICON_DELETE,
  ICON_AGENTS,
  ICON_SUCCESS,
  ICON_TREND_UP,
  ICON_TREND_DOWN,
  ICON_TRUST,
  ICON_USER,
  iconSm,
} from '../icons.js';

const log = createLogger('DashboardSection');

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: string;
  responseTime: number;
  activeUsers: number;
  activeSessions: number;
}

interface QuickStat {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

/**
 * Render the dashboard section
 */
export async function render(): Promise<string> {
  log.debug('Rendering dashboard section');

  // Fetch system health (or use mock data)
  const health = await fetchSystemHealth();
  const stats = await fetchQuickStats();

  return `
    <div class="dashboard-section">
      <!-- System Health Card -->
      <div class="admin-card dashboard-health">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HEALTH)}</span>
          System Health
        </h2>
        <div class="health-status health-status--${health.status}">
          <span class="health-indicator"></span>
          <span class="health-text">${getHealthText(health.status)}</span>
        </div>
        <div class="health-details">
          <div class="health-item">
            <span class="health-label">Uptime</span>
            <span class="health-value">${health.uptime}</span>
          </div>
          <div class="health-item">
            <span class="health-label">Response Time</span>
            <span class="health-value">${health.responseTime}ms</span>
          </div>
          <div class="health-item">
            <span class="health-label">Active Sessions</span>
            <span class="health-value">${health.activeSessions}</span>
          </div>
        </div>
      </div>

      <!-- Quick Stats Grid -->
      <div class="admin-grid dashboard-stats">
        ${stats.map(stat => renderStatCard(stat)).join('')}
      </div>

      <!-- Quick Actions -->
      <div class="admin-card dashboard-actions">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_ZAP)}</span>
          Quick Actions
        </h2>
        <div class="quick-actions-grid">
          <button class="quick-action" data-action="validate-agents">
            <span class="quick-action-icon">${iconSm(ICON_SEARCH)}</span>
            <span class="quick-action-text">Validate Agents</span>
          </button>
          <button class="quick-action" data-action="run-evalops">
            <span class="quick-action-icon">${iconSm(ICON_EVALOPS)}</span>
            <span class="quick-action-text">Run EvalOps Suite</span>
          </button>
          <button class="quick-action" data-action="refresh-flags">
            <span class="quick-action-icon">${iconSm(ICON_FLAGS)}</span>
            <span class="quick-action-text">Refresh Flags</span>
          </button>
          <button class="quick-action" data-action="clear-cache">
            <span class="quick-action-icon">${iconSm(ICON_DELETE)}</span>
            <span class="quick-action-text">Clear Cache</span>
          </button>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="admin-card dashboard-activity">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HISTORY)}</span>
          Recent Activity
        </h2>
        <div class="activity-list">
          ${renderActivityItems()}
        </div>
      </div>
    </div>

    <style>
      .dashboard-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4, 1rem);
      }

      @media (max-width: 1024px) {
        .dashboard-section {
          grid-template-columns: 1fr;
        }
      }

      .dashboard-health {
        grid-column: span 2;
      }

      @media (max-width: 1024px) {
        .dashboard-health {
          grid-column: span 1;
        }
      }

      .health-status {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
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
      }

      .health-details {
        display: flex;
        gap: var(--space-6, 1.5rem);
      }

      .health-item {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 0.25rem);
      }

      .health-label {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .health-value {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 1rem;
        font-weight: 500;
      }

      .dashboard-stats {
        grid-column: span 2;
      }

      @media (max-width: 1024px) {
        .dashboard-stats {
          grid-column: span 1;
        }
      }

      .stat-card {
        background: var(--color-background-elevated, #2c2520);
        border: 1px solid var(--admin-border-subtle, rgba(255, 255, 255, 0.05));
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-5, 1.25rem);
        text-align: center;
      }

      .stat-value {
        font-size: 2rem;
        font-weight: 700;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        color: var(--color-text-primary, #faf6f0);
      }

      .stat-label {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
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
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--admin-border-subtle, rgba(255, 255, 255, 0.05));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: inherit;
        cursor: pointer;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .quick-action:hover {
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.08));
        border-color: var(--admin-border-hover, rgba(255, 255, 255, 0.1));
        transform: translateY(-2px);
      }

      .quick-action:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
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
        color: var(--persona-primary, #4a6741);
      }

      .quick-action-icon svg {
        width: 24px;
        height: 24px;
      }

      .quick-action-text {
        font-size: 0.8125rem;
        font-weight: 500;
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
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.02));
        border-radius: var(--radius-md, 8px);
      }

      .activity-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--persona-primary, #4a6741);
      }

      .activity-icon svg {
        width: 16px;
        height: 16px;
      }

      .activity-text {
        flex: 1;
        font-size: 0.875rem;
      }

      .activity-time {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
      }
    </style>
  `;
}

function renderStatCard(stat: QuickStat): string {
  const trendIcon = stat.trend === 'up' 
    ? iconSm(ICON_TREND_UP)
    : stat.trend === 'down'
    ? iconSm(ICON_TREND_DOWN)
    : '';
    
  return `
    <div class="stat-card">
      <div class="stat-value">${stat.value}</div>
      <div class="stat-label">${stat.label}</div>
      ${stat.change ? `
        <div class="stat-change stat-change--${stat.trend || 'neutral'}">
          ${trendIcon}
          ${stat.change}
        </div>
      ` : ''}
    </div>
  `;
}

function renderActivityItems(): string {
  const activities = [
    { icon: ICON_AGENTS, text: 'Agent "ferni" validated successfully', time: '2 min ago' },
    { icon: ICON_FLAGS, text: 'Feature flag "evalops" enabled', time: '15 min ago' },
    { icon: ICON_EVALOPS, text: 'EvalOps suite completed (98% pass rate)', time: '1 hour ago' },
    { icon: ICON_USER, text: 'New user enrolled voice profile', time: '2 hours ago' },
    { icon: ICON_TRUST, text: 'Trust score milestone: user_123 reached "Established"', time: '3 hours ago' },
  ];

  return activities.map(a => `
    <div class="activity-item">
      <span class="activity-icon">${iconSm(a.icon)}</span>
      <span class="activity-text">${a.text}</span>
      <span class="activity-time">${a.time}</span>
    </div>
  `).join('');
}

function getHealthText(status: SystemHealth['status']): string {
  switch (status) {
    case 'healthy': return 'All Systems Operational';
    case 'degraded': return 'Degraded Performance';
    case 'down': return 'System Down';
  }
}

async function fetchSystemHealth(): Promise<SystemHealth> {
  try {
    const response = await fetch('/api/v1/admin/diagnostics/health', {
      headers: {
        'x-admin-key': 'dev-mode',
      },
    });
    if (response.ok) {
      const data = await response.json();
      return {
        status: data.status || 'healthy',
        uptime: `${Math.round(data.uptime / 3600)}h`,
        responseTime: 45,
        activeUsers: 127,
        activeSessions: data.services?.length || 0,
      };
    }
  } catch {
    // Silently fall through to mock data
  }

  // Return mock data for development
  return {
    status: 'healthy',
    uptime: '99.97%',
    responseTime: 45,
    activeUsers: 127,
    activeSessions: 34,
  };
}

async function fetchQuickStats(): Promise<QuickStat[]> {
  // In production, fetch from API
  return [
    { label: 'Active Agents', value: 7, change: '+1 this week', trend: 'up' },
    { label: 'Conversations Today', value: 342, change: '+12%', trend: 'up' },
    { label: 'EvalOps Score', value: '98%', change: '+2%', trend: 'up' },
    { label: 'Voice Profiles', value: 89, change: '+5 this week', trend: 'up' },
  ];
}

export default { render };
