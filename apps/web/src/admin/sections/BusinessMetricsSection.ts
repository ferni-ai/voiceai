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
    <div class="admin-section business-metrics-section" role="region" aria-label="Business Metrics Dashboard">
      <div class="section-header">
        <h2><span aria-hidden="true">${ICONS.chart}</span> Business Metrics</h2>
        <div class="header-actions" role="button" tabindex="0">
          <span class="live-indicator" role="status" aria-live="polite" aria-atomic="true">
            <span class="live-dot" aria-hidden="true"></span>
            <span id="concurrent-count" aria-label="Active users now">0</span> active now
          </span>
          <button class="btn-secondary" onclick="window.businessMetrics?.refresh()" aria-label="Refresh business metrics">
            <span aria-hidden="true">${ICONS.refresh}</span> Refresh
          </button>
        </div>
      </div>

      <!-- Key Metrics Cards - Live region for screen readers -->
      <div class="metrics-grid" role="region" aria-label="Key metrics" aria-live="polite" aria-atomic="false">
        <article class="metric-card highlight" aria-labelledby="dau-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.team}</div>
          <div class="metric-content">
            <div class="metric-value" id="dau-value" aria-describedby="dau-label">--</div>
            <div class="metric-label" id="dau-label">Daily Active Users</div>
            <div class="metric-trend" id="dau-trend" role="status" aria-live="polite"></div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="wau-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.chart}</div>
          <div class="metric-content">
            <div class="metric-value" id="wau-value" aria-describedby="wau-label">--</div>
            <div class="metric-label" id="wau-label">Weekly Active Users</div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="mau-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.chart}</div>
          <div class="metric-content">
            <div class="metric-value" id="mau-value" aria-describedby="mau-label">--</div>
            <div class="metric-label" id="mau-label">Monthly Active Users</div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="sessions-label">
          <div class="metric-icon" aria-hidden="true">${ICONS['trend-up']}</div>
          <div class="metric-content">
            <div class="metric-value" id="sessions-value" aria-describedby="sessions-label">--</div>
            <div class="metric-label" id="sessions-label">Sessions Today</div>
            <div class="metric-trend" id="sessions-trend" role="status" aria-live="polite"></div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="duration-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.history}</div>
          <div class="metric-content">
            <div class="metric-value" id="avg-duration" aria-describedby="duration-label">--</div>
            <div class="metric-label" id="duration-label">Avg Session (min)</div>
          </div>
        </article>

        <article class="metric-card" aria-labelledby="subscriber-label">
          <div class="metric-icon" aria-hidden="true">${ICONS.sparkles}</div>
          <div class="metric-content">
            <div class="metric-value" id="subscriber-pct" aria-describedby="subscriber-label">--</div>
            <div class="metric-label" id="subscriber-label">Subscriber Sessions</div>
          </div>
        </article>
      </div>

      <!-- Subscription Metrics -->
      <section class="subsection" aria-labelledby="subscription-heading">
        <h3 id="subscription-heading"><span aria-hidden="true">${ICONS.shield}</span> Subscription Metrics</h3>
        <div class="metrics-grid small" role="region" aria-live="polite">
          <article class="metric-card" aria-labelledby="active-subs-label">
            <div class="metric-content">
              <div class="metric-value" id="active-subs" aria-describedby="active-subs-label">--</div>
              <div class="metric-label" id="active-subs-label">Active Subscribers</div>
            </div>
          </article>
          <article class="metric-card" aria-labelledby="mrr-label">
            <div class="metric-content">
              <div class="metric-value" id="mrr-value" aria-describedby="mrr-label">$--</div>
              <div class="metric-label" id="mrr-label">MRR</div>
            </div>
          </article>
          <article class="metric-card" aria-labelledby="conversion-label">
            <div class="metric-content">
              <div class="metric-value" id="conversion-rate" aria-describedby="conversion-label">--%</div>
              <div class="metric-label" id="conversion-label">Conversion Rate</div>
            </div>
          </article>
          <article class="metric-card" aria-labelledby="churn-label">
            <div class="metric-content">
              <div class="metric-value" id="churn-rate" aria-describedby="churn-label">--%</div>
              <div class="metric-label" id="churn-label">Churn Rate</div>
            </div>
          </article>
        </div>
      </section>

      <!-- Two Column Layout -->
      <div class="two-column">
        <!-- Top Personas -->
        <section class="subsection" aria-labelledby="personas-heading">
          <h3 id="personas-heading"><span aria-hidden="true">${ICONS.user}</span> Top Personas</h3>
          <div class="persona-list" id="top-personas" role="list" aria-label="Persona usage rankings">
            <div class="loading" role="status">Loading...</div>
          </div>
        </section>

        <!-- Peak Hours Chart -->
        <section class="subsection" aria-labelledby="hours-heading">
          <h3 id="hours-heading"><span aria-hidden="true">${ICONS.history}</span> Usage by Hour</h3>
          <div class="hour-chart" id="hour-chart" role="img" aria-label="Sessions by hour bar chart">
            <div class="loading" role="status">Loading...</div>
          </div>
          <!-- Screen reader accessible data table (visually hidden) -->
          <table class="sr-only" id="hour-chart-data" aria-label="Sessions by hour data">
            <caption>Session counts for each hour of the day</caption>
            <thead><tr><th scope="col">Hour</th><th scope="col">Sessions</th></tr></thead>
            <tbody id="hour-chart-tbody"></tbody>
          </table>
        </section>
      </div>

      <!-- User Breakdown -->
      <section class="subsection" aria-labelledby="breakdown-heading">
        <h3 id="breakdown-heading"><span aria-hidden="true">${ICONS.team}</span> User Breakdown (Today)</h3>
        <div class="user-breakdown" id="user-breakdown" role="figure" aria-labelledby="breakdown-heading">
          <div class="breakdown-bar" role="img" aria-label="User breakdown bar chart">
            <div class="bar-segment new" id="new-users-bar" style="width: 0%" role="presentation" aria-hidden="true"></div>
            <div class="bar-segment returning" id="returning-users-bar" style="width: 0%" role="presentation" aria-hidden="true"></div>
          </div>
          <div class="breakdown-legend" role="list">
            <span class="legend-item new" role="listitem">
              <span class="legend-dot" aria-hidden="true"></span>
              New: <span id="new-users-count" aria-label="New users count">0</span>
            </span>
            <span class="legend-item returning" role="listitem">
              <span class="legend-dot" aria-hidden="true"></span>
              Returning: <span id="returning-users-count" aria-label="Returning users count">0</span>
            </span>
          </div>
          <!-- Screen reader summary -->
          <p class="sr-only" id="breakdown-summary" aria-live="polite">User breakdown: Loading data...</p>
        </div>
      </section>

      <!-- Recent Subscription Events -->
      <section class="subsection" aria-labelledby="events-heading">
        <h3 id="events-heading"><span aria-hidden="true">${ICONS['trend-up']}</span> Recent Subscription Events</h3>
        <div class="event-list" id="subscription-events" role="log" aria-label="Recent subscription events" aria-live="polite">
          <div class="empty-state">No recent events</div>
        </div>
      </section>
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

      @media (max-width: clamp(538px, 90vw, 768px)) {
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

      /* Accessibility: Screen reader only class */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      /* Accessibility: Focus visible styles */
      .btn-secondary:focus-visible,
      .metric-card:focus-visible,
      .persona-item:focus-visible,
      .event-item:focus-visible {
        outline: 2px solid var(--admin-accent, #4a6741);
        outline-offset: 2px;
      }

      /* Accessibility: Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .live-dot,
        .bar-segment,
        .hour-bar {
          animation: none;
          transition: none;
        }
      }

      /* Accessibility: High contrast mode support */
      @media (forced-colors: active) {
        .live-dot {
          background: CanvasText;
        }
        .bar-segment.new,
        .bar-segment.returning {
          forced-color-adjust: none;
        }
        .metric-trend.up,
        .metric-trend.down {
          color: CanvasText;
        }
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
  // DAU with accessible trend indicator
  const dauEl = document.getElementById('dau-value');
  const dauTrendEl = document.getElementById('dau-trend');
  if (dauEl) dauEl.textContent = analytics.today.uniqueUsers.toString();
  if (dauTrendEl) {
    const trend = analytics.trends.usersVsYesterday;
    const trendDirection = trend >= 0 ? 'up' : 'down';
    const trendIcon = trend >= 0 ? '↑' : '↓';
    // Include icon for visual users and descriptive text for screen readers
    dauTrendEl.innerHTML = `<span aria-hidden="true">${trendIcon}</span> ${trend >= 0 ? '+' : ''}${trend}% vs yesterday`;
    dauTrendEl.className = `metric-trend ${trendDirection}`;
    dauTrendEl.setAttribute('aria-label', `${Math.abs(trend)}% ${trendDirection} compared to yesterday`);
  }

  // WAU & MAU
  const wauEl = document.getElementById('wau-value');
  const mauEl = document.getElementById('mau-value');
  if (wauEl) wauEl.textContent = analytics.thisWeek.uniqueUsers.toString();
  if (mauEl) mauEl.textContent = analytics.thisMonth.uniqueUsers.toString();

  // Sessions with accessible trend indicator
  const sessionsEl = document.getElementById('sessions-value');
  const sessionsTrendEl = document.getElementById('sessions-trend');
  if (sessionsEl) sessionsEl.textContent = analytics.today.totalSessions.toString();
  if (sessionsTrendEl) {
    const trend = analytics.trends.sessionsVsYesterday;
    const trendDirection = trend >= 0 ? 'up' : 'down';
    const trendIcon = trend >= 0 ? '↑' : '↓';
    sessionsTrendEl.innerHTML = `<span aria-hidden="true">${trendIcon}</span> ${trend >= 0 ? '+' : ''}${trend}% vs yesterday`;
    sessionsTrendEl.className = `metric-trend ${trendDirection}`;
    sessionsTrendEl.setAttribute('aria-label', `${Math.abs(trend)}% ${trendDirection} compared to yesterday`);
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

  // Concurrent - use aria-label for context
  const concurrentEl = document.getElementById('concurrent-count');
  if (concurrentEl) {
    concurrentEl.textContent = analytics.currentConcurrent.toString();
    concurrentEl.setAttribute('aria-label', `${analytics.currentConcurrent} users active now`);
  }

  // Top personas with accessible list items
  const personasEl = document.getElementById('top-personas');
  if (personasEl) {
    if (analytics.topPersonas.length === 0) {
      personasEl.innerHTML = '<div class="empty-state" role="status">No data yet</div>';
    } else {
      personasEl.innerHTML = analytics.topPersonas
        .map(
          (p, index) => `
        <div class="persona-item" role="listitem" tabindex="0" aria-label="${p.personaId}: ${p.sessions} sessions, rank ${index + 1}">
          <span class="persona-name">${escapeHtml(p.personaId)}</span>
          <span class="persona-count">${p.sessions} sessions</span>
        </div>
      `
        )
        .join('');
    }
  }

  // Hour chart with accessible data table
  const hourChartEl = document.getElementById('hour-chart');
  const hourChartTbody = document.getElementById('hour-chart-tbody');
  if (hourChartEl) {
    const maxHour = Math.max(...analytics.today.byHour, 1);
    // Visual bar chart
    hourChartEl.innerHTML = analytics.today.byHour
      .map((count, hour) => {
        const height = Math.max(4, (count / maxHour) * 100);
        const isPeak = analytics.peakHours.includes(hour);
        const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
        // Use aria-hidden since we have an accessible table alternative
        return `<div class="hour-bar ${isPeak ? 'peak' : ''}" style="height: ${height}%" aria-hidden="true" data-hour="${hour}" data-count="${count}"><span class="sr-only">${timeLabel}: ${count} sessions${isPeak ? ' (peak)' : ''}</span></div>`;
      })
      .join('');
    
    // Update accessible data table
    if (hourChartTbody) {
      hourChartTbody.innerHTML = analytics.today.byHour
        .map((count, hour) => {
          const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
          const isPeak = analytics.peakHours.includes(hour);
          return `<tr><td>${timeLabel}${isPeak ? ' (peak)' : ''}</td><td>${count}</td></tr>`;
        })
        .join('');
    }
    
    // Update aria-label with summary
    const totalSessions = analytics.today.byHour.reduce((a, b) => a + b, 0);
    const peakHour = analytics.peakHours[0] ?? 0;
    hourChartEl.setAttribute('aria-label', `Sessions by hour bar chart. Total: ${totalSessions} sessions. Peak hour: ${peakHour}:00`);
  }

  // User breakdown with accessible summary
  const newUsersBar = document.getElementById('new-users-bar') as HTMLElement;
  const returningUsersBar = document.getElementById('returning-users-bar') as HTMLElement;
  const newUsersCount = document.getElementById('new-users-count');
  const returningUsersCount = document.getElementById('returning-users-count');
  const breakdownSummary = document.getElementById('breakdown-summary');

  const totalUsers = analytics.today.newUsers + analytics.today.returningUsers;
  if (totalUsers > 0) {
    const newPct = (analytics.today.newUsers / totalUsers) * 100;
    const returningPct = (analytics.today.returningUsers / totalUsers) * 100;
    if (newUsersBar) {
      newUsersBar.style.width = `${newPct}%`;
      newUsersBar.setAttribute('aria-label', `New users: ${newPct.toFixed(1)}%`);
    }
    if (returningUsersBar) {
      returningUsersBar.style.width = `${returningPct}%`;
      returningUsersBar.setAttribute('aria-label', `Returning users: ${returningPct.toFixed(1)}%`);
    }
    // Update screen reader summary
    if (breakdownSummary) {
      breakdownSummary.textContent = `User breakdown: ${analytics.today.newUsers} new users (${newPct.toFixed(1)}%), ${analytics.today.returningUsers} returning users (${returningPct.toFixed(1)}%)`;
    }
  }
  if (newUsersCount) newUsersCount.textContent = analytics.today.newUsers.toString();
  if (returningUsersCount) returningUsersCount.textContent = analytics.today.returningUsers.toString();
}

/**
 * Escape HTML to prevent XSS in dynamic content
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

  if (eventsList) {
    if (metrics.recentEvents.length === 0) {
      eventsList.innerHTML = '<div class="empty-state" role="status">No recent events</div>';
    } else {
      eventsList.innerHTML = metrics.recentEvents
        .slice(0, 10)
        .map(
          (event) => {
            const time = new Date(event.timestamp).toLocaleTimeString();
            const amountText = event.amount ? ` for $${event.amount}` : '';
            const ariaLabel = `${event.type} event${amountText} at ${time}`;
            return `
        <article class="event-item" role="article" tabindex="0" aria-label="${escapeHtml(ariaLabel)}">
          <span class="event-type ${escapeHtml(event.type)}">${escapeHtml(event.type)}</span>
          ${event.amount ? `<span class="event-amount">$${event.amount}</span>` : ''}
          <time class="event-time" datetime="${event.timestamp}">${time}</time>
        </article>
      `;
          }
        )
        .join('');
    }
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
