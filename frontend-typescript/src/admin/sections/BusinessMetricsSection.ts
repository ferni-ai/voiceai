/**
 * Business Metrics Dashboard Section
 *
 * Shows key business metrics:
 * - Daily/Weekly/Monthly Active Users
 * - Session counts and duration
 * - Subscriber vs free tier breakdown
 * - Persona popularity
 * - Peak usage times
 * - Subscription metrics (from Stripe)
 */

import { createLogger } from '../../utils/logger.js';
import { ICONS } from '../icons.js';

const log = createLogger('BusinessMetricsSection');

// ============================================================================
// TYPES
// ============================================================================

interface DailyAnalytics {
  date: string;
  uniqueUsers: number;
  totalSessions: number;
  totalMinutes: number;
  avgSessionMinutes: number;
  peakConcurrent: number;
  byPersona: Record<string, number>;
  byHour: number[];
  newUsers: number;
  returningUsers: number;
  subscriberSessions: number;
  freeTierSessions: number;
}

interface AnalyticsSummary {
  today: DailyAnalytics;
  yesterday: DailyAnalytics;
  thisWeek: { uniqueUsers: number; totalSessions: number; totalMinutes: number };
  thisMonth: { uniqueUsers: number; totalSessions: number; totalMinutes: number };
  trends: { usersVsYesterday: number; sessionsVsYesterday: number; usersVsLastWeek: number };
  topPersonas: Array<{ personaId: string; sessions: number }>;
  peakHours: number[];
  currentConcurrent: number;
}

interface SubscriptionMetrics {
  activeSubscribers: number;
  mrr: number;
  churnRate: number;
  conversionRate: number;
  recentEvents: Array<{ type: string; timestamp: string; amount?: number }>;
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
    <div class="admin-section business-metrics-section">
      <div class="section-header">
        <h2>${ICONS.chart} Business Metrics</h2>
        <div class="header-actions">
          <span class="live-indicator">
            <span class="live-dot"></span>
            <span id="concurrent-count">0</span> active now
          </span>
          <button class="btn-secondary" onclick="window.businessMetrics?.refresh()">
            ${ICONS.refresh} Refresh
          </button>
        </div>
      </div>

      <!-- Key Metrics Cards -->
      <div class="metrics-grid">
        <div class="metric-card highlight">
          <div class="metric-icon">${ICONS.team}</div>
          <div class="metric-content">
            <div class="metric-value" id="dau-value">--</div>
            <div class="metric-label">Daily Active Users</div>
            <div class="metric-trend" id="dau-trend"></div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">${ICONS.chart}</div>
          <div class="metric-content">
            <div class="metric-value" id="wau-value">--</div>
            <div class="metric-label">Weekly Active Users</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">${ICONS.chart}</div>
          <div class="metric-content">
            <div class="metric-value" id="mau-value">--</div>
            <div class="metric-label">Monthly Active Users</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">${ICONS['trend-up']}</div>
          <div class="metric-content">
            <div class="metric-value" id="sessions-value">--</div>
            <div class="metric-label">Sessions Today</div>
            <div class="metric-trend" id="sessions-trend"></div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">${ICONS.history}</div>
          <div class="metric-content">
            <div class="metric-value" id="avg-duration">--</div>
            <div class="metric-label">Avg Session (min)</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">${ICONS.sparkles}</div>
          <div class="metric-content">
            <div class="metric-value" id="subscriber-pct">--</div>
            <div class="metric-label">Subscriber Sessions</div>
          </div>
        </div>
      </div>

      <!-- Subscription Metrics -->
      <div class="subsection">
        <h3>${ICONS.shield} Subscription Metrics</h3>
        <div class="metrics-grid small">
          <div class="metric-card">
            <div class="metric-content">
              <div class="metric-value" id="active-subs">--</div>
              <div class="metric-label">Active Subscribers</div>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-content">
              <div class="metric-value" id="mrr-value">$--</div>
              <div class="metric-label">MRR</div>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-content">
              <div class="metric-value" id="conversion-rate">--%</div>
              <div class="metric-label">Conversion Rate</div>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-content">
              <div class="metric-value" id="churn-rate">--%</div>
              <div class="metric-label">Churn Rate</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Two Column Layout -->
      <div class="two-column">
        <!-- Top Personas -->
        <div class="subsection">
          <h3>${ICONS.user} Top Personas</h3>
          <div class="persona-list" id="top-personas">
            <div class="loading">Loading...</div>
          </div>
        </div>

        <!-- Peak Hours -->
        <div class="subsection">
          <h3>${ICONS.history} Usage by Hour</h3>
          <div class="hour-chart" id="hour-chart">
            <div class="loading">Loading...</div>
          </div>
        </div>
      </div>

      <!-- User Breakdown -->
      <div class="subsection">
        <h3>${ICONS.team} User Breakdown (Today)</h3>
        <div class="user-breakdown" id="user-breakdown">
          <div class="breakdown-bar">
            <div class="bar-segment new" id="new-users-bar" style="width: 0%"></div>
            <div class="bar-segment returning" id="returning-users-bar" style="width: 0%"></div>
          </div>
          <div class="breakdown-legend">
            <span class="legend-item new">
              <span class="legend-dot"></span>
              New: <span id="new-users-count">0</span>
            </span>
            <span class="legend-item returning">
              <span class="legend-dot"></span>
              Returning: <span id="returning-users-count">0</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Recent Subscription Events -->
      <div class="subsection">
        <h3>${ICONS['trend-up']} Recent Subscription Events</h3>
        <div class="event-list" id="subscription-events">
          <div class="empty-state">No recent events</div>
        </div>
      </div>
    </div>

    <style>
      .business-metrics-section {
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
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--space-md);
        margin-bottom: var(--space-lg);
      }

      .metrics-grid.small {
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
        font-size: 1.75rem;
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

      .metric-trend {
        font-size: 0.75rem;
        margin-top: var(--space-xs);
      }

      .metric-trend.up { color: var(--color-semantic-success); }
      .metric-trend.down { color: var(--color-semantic-error); }

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
      }

      @media (max-width: 768px) {
        .two-column {
          grid-template-columns: 1fr;
        }
      }

      .persona-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
      }

      .persona-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-sm) var(--space-md);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
      }

      .persona-name {
        font-weight: 500;
      }

      .persona-count {
        color: var(--color-text-secondary);
        font-size: 0.875rem;
      }

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

      .user-breakdown {
        padding: var(--space-md);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
      }

      .breakdown-bar {
        height: 24px;
        display: flex;
        border-radius: var(--radius-sm);
        overflow: hidden;
        margin-bottom: var(--space-sm);
      }

      .bar-segment {
        transition: width 0.3s ease;
      }

      .bar-segment.new {
        background: var(--color-accent-primary);
      }

      .bar-segment.returning {
        background: var(--color-accent-secondary);
      }

      .breakdown-legend {
        display: flex;
        gap: var(--space-lg);
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        font-size: 0.875rem;
      }

      .legend-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
      }

      .legend-item.new .legend-dot {
        background: var(--color-accent-primary);
      }

      .legend-item.returning .legend-dot {
        background: var(--color-accent-secondary);
      }

      .event-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
        max-height: 200px;
        overflow-y: auto;
      }

      .event-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-sm) var(--space-md);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
        font-size: 0.875rem;
      }

      .event-type {
        font-weight: 500;
      }

      .event-type.subscribe { color: var(--color-semantic-success); }
      .event-type.cancel { color: var(--color-semantic-error); }
      .event-type.upgrade { color: var(--color-semantic-warning); }

      .event-amount {
        color: var(--color-semantic-success);
        font-weight: 500;
      }

      .event-time {
        color: var(--color-text-muted);
      }

      .loading, .empty-state {
        color: var(--color-text-muted);
        text-align: center;
        padding: var(--space-md);
      }
    </style>
  `;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchAnalytics(): Promise<AnalyticsSummary | null> {
  try {
    const response = await fetch('/api/analytics/summary');
    if (!response.ok) return null;
    const data = await response.json();
    return data.data as AnalyticsSummary;
  } catch (error) {
    log.error({ error }, 'Failed to fetch analytics');
    return null;
  }
}

async function fetchSubscriptionMetrics(): Promise<SubscriptionMetrics | null> {
  try {
    const response = await fetch('/api/subscription/metrics');
    if (!response.ok) return null;
    const data = await response.json();
    return data as SubscriptionMetrics;
  } catch (error) {
    log.debug({ error }, 'Subscription metrics not available');
    return null;
  }
}

async function fetchConcurrent(): Promise<number> {
  try {
    const response = await fetch('/api/analytics/concurrent');
    if (!response.ok) return 0;
    const data = await response.json();
    return data.concurrent || 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateUI(analytics: AnalyticsSummary): void {
  // DAU
  const dauEl = document.getElementById('dau-value');
  const dauTrendEl = document.getElementById('dau-trend');
  if (dauEl) dauEl.textContent = analytics.today.uniqueUsers.toString();
  if (dauTrendEl) {
    const trend = analytics.trends.usersVsYesterday;
    dauTrendEl.textContent = `${trend >= 0 ? '+' : ''}${trend}% vs yesterday`;
    dauTrendEl.className = `metric-trend ${trend >= 0 ? 'up' : 'down'}`;
  }

  // WAU & MAU
  const wauEl = document.getElementById('wau-value');
  const mauEl = document.getElementById('mau-value');
  if (wauEl) wauEl.textContent = analytics.thisWeek.uniqueUsers.toString();
  if (mauEl) mauEl.textContent = analytics.thisMonth.uniqueUsers.toString();

  // Sessions
  const sessionsEl = document.getElementById('sessions-value');
  const sessionsTrendEl = document.getElementById('sessions-trend');
  if (sessionsEl) sessionsEl.textContent = analytics.today.totalSessions.toString();
  if (sessionsTrendEl) {
    const trend = analytics.trends.sessionsVsYesterday;
    sessionsTrendEl.textContent = `${trend >= 0 ? '+' : ''}${trend}% vs yesterday`;
    sessionsTrendEl.className = `metric-trend ${trend >= 0 ? 'up' : 'down'}`;
  }

  // Avg duration
  const avgDurationEl = document.getElementById('avg-duration');
  if (avgDurationEl) avgDurationEl.textContent = analytics.today.avgSessionMinutes.toFixed(1);

  // Subscriber percentage
  const subscriberPctEl = document.getElementById('subscriber-pct');
  if (subscriberPctEl) {
    const total = analytics.today.subscriberSessions + analytics.today.freeTierSessions;
    const pct = total > 0 ? Math.round((analytics.today.subscriberSessions / total) * 100) : 0;
    subscriberPctEl.textContent = `${pct}%`;
  }

  // Concurrent
  const concurrentEl = document.getElementById('concurrent-count');
  if (concurrentEl) concurrentEl.textContent = analytics.currentConcurrent.toString();

  // Top personas
  const personasEl = document.getElementById('top-personas');
  if (personasEl) {
    if (analytics.topPersonas.length === 0) {
      personasEl.innerHTML = '<div class="empty-state">No data yet</div>';
    } else {
      personasEl.innerHTML = analytics.topPersonas
        .map(
          (p) => `
        <div class="persona-item">
          <span class="persona-name">${p.personaId}</span>
          <span class="persona-count">${p.sessions} sessions</span>
        </div>
      `
        )
        .join('');
    }
  }

  // Hour chart
  const hourChartEl = document.getElementById('hour-chart');
  if (hourChartEl) {
    const maxHour = Math.max(...analytics.today.byHour, 1);
    hourChartEl.innerHTML = analytics.today.byHour
      .map((count, hour) => {
        const height = Math.max(4, (count / maxHour) * 100);
        const isPeak = analytics.peakHours.includes(hour);
        return `<div class="hour-bar ${isPeak ? 'peak' : ''}" style="height: ${height}%" title="${hour}:00 - ${count} sessions"></div>`;
      })
      .join('');
  }

  // User breakdown
  const newUsersBar = document.getElementById('new-users-bar') as HTMLElement;
  const returningUsersBar = document.getElementById('returning-users-bar') as HTMLElement;
  const newUsersCount = document.getElementById('new-users-count');
  const returningUsersCount = document.getElementById('returning-users-count');

  const totalUsers = analytics.today.newUsers + analytics.today.returningUsers;
  if (totalUsers > 0) {
    const newPct = (analytics.today.newUsers / totalUsers) * 100;
    const returningPct = (analytics.today.returningUsers / totalUsers) * 100;
    if (newUsersBar) newUsersBar.style.width = `${newPct}%`;
    if (returningUsersBar) returningUsersBar.style.width = `${returningPct}%`;
  }
  if (newUsersCount) newUsersCount.textContent = analytics.today.newUsers.toString();
  if (returningUsersCount) returningUsersCount.textContent = analytics.today.returningUsers.toString();
}

function updateSubscriptionUI(metrics: SubscriptionMetrics): void {
  const activeSubs = document.getElementById('active-subs');
  const mrrValue = document.getElementById('mrr-value');
  const conversionRate = document.getElementById('conversion-rate');
  const churnRate = document.getElementById('churn-rate');
  const eventsList = document.getElementById('subscription-events');

  if (activeSubs) activeSubs.textContent = metrics.activeSubscribers.toString();
  if (mrrValue) mrrValue.textContent = `$${metrics.mrr.toFixed(0)}`;
  if (conversionRate) conversionRate.textContent = `${metrics.conversionRate.toFixed(1)}%`;
  if (churnRate) churnRate.textContent = `${metrics.churnRate.toFixed(1)}%`;

  if (eventsList && metrics.recentEvents.length > 0) {
    eventsList.innerHTML = metrics.recentEvents
      .slice(0, 10)
      .map(
        (event) => `
      <div class="event-item">
        <span class="event-type ${event.type}">${event.type}</span>
        ${event.amount ? `<span class="event-amount">$${event.amount}</span>` : ''}
        <span class="event-time">${new Date(event.timestamp).toLocaleTimeString()}</span>
      </div>
    `
      )
      .join('');
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

export async function init(): Promise<void> {
  log.info('Initializing Business Metrics section');

  // Initial fetch
  await refresh();

  // Set up polling
  refreshInterval = setInterval(async () => {
    const concurrent = await fetchConcurrent();
    const concurrentEl = document.getElementById('concurrent-count');
    if (concurrentEl) concurrentEl.textContent = concurrent.toString();
  }, 10000); // Every 10 seconds for concurrent

  // Full refresh every minute
  setInterval(refresh, 60000);

  // Expose refresh function globally
  (window as unknown as { businessMetrics: { refresh: () => Promise<void> } }).businessMetrics = {
    refresh,
  };
}

export async function refresh(): Promise<void> {
  const [analytics, subscriptionMetrics] = await Promise.all([
    fetchAnalytics(),
    fetchSubscriptionMetrics(),
  ]);

  if (analytics) {
    updateUI(analytics);
  }

  if (subscriptionMetrics) {
    updateSubscriptionUI(subscriptionMetrics);
  }
}

export function cleanup(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
