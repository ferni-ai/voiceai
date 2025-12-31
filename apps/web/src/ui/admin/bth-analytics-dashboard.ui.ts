/**
 * Better Than Human (BTH) Analytics Dashboard
 *
 * Admin dashboard for monitoring superhuman capability effectiveness.
 * Shows which of the 31 capabilities are actually helping users.
 *
 * Key metrics:
 * - Usage counts per capability
 * - Effectiveness rates (positive/neutral/negative reactions)
 * - Trend analysis over time
 * - Per-user feedback history
 *
 * @module ui/admin/bth-analytics-dashboard.ui
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { createLogger } from '../../utils/logger.js';
import { toast } from '../toast.ui.js';
import { t } from '../../i18n/index.js';

const log = createLogger('BTHAnalyticsDashboard');

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

interface OverallStats {
  summary: {
    totalCapabilities: number;
    capabilitiesWithData: number;
    totalUsageEvents: number;
    totalFeedbackEvents: number;
    overallEffectivenessRate: number;
  };
  recentActivity: {
    period: string;
    usageCount: number;
    appliedCount: number;
  };
  topPerformers: Array<{
    capability: string;
    effectivenessRate: number;
  }>;
}

interface CapabilityStat {
  capability: string;
  usage: number;
  applied: number;
  applicationRate: number;
  positive: number;
  neutral: number;
  negative: number;
  effectivenessRate: number;
  priority: number;
}

interface CapabilityData {
  totalCapabilities: number;
  byCategory: {
    original10: CapabilityStat[];
    enhanced9: CapabilityStat[];
    legacy12: CapabilityStat[];
  };
  all: CapabilityStat[];
}

interface TrendData {
  capability: string;
  period: string;
  trends: Array<{ date: string; positive: number; neutral: number; negative: number }>;
  summary: {
    totalDays: number;
    totalFeedback: number;
    overallPositiveRate: number;
    trend: 'improving' | 'declining' | 'stable';
  };
}

interface FeedbackItem {
  capability: string;
  reaction: string;
  sessionId: string;
  insight?: string;
  timestamp: string;
}

interface UserFeedback {
  userId: string;
  feedbackCount: number;
  feedback: FeedbackItem[];
}

interface DashboardState {
  activeTab: 'overview' | 'capabilities' | 'trends' | 'users';
  stats: OverallStats | null;
  capabilities: CapabilityData | null;
  selectedCapability: string | null;
  trendData: TrendData | null;
  userIdInput: string;
  userFeedback: UserFeedback | null;
  loading: boolean;
  error: string | null;
  lastRefresh: Date | null;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isVisible = false;
const state: DashboardState = {
  activeTab: 'overview',
  stats: null,
  capabilities: null,
  selectedCapability: null,
  trendData: null,
  userIdInput: '',
  userFeedback: null,
  loading: false,
  error: null,
  lastRefresh: null,
};

// ============================================================================
// ICONS (Static SVG - safe)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>`,
  chart: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  trendUp: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  trendDown: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  search: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  thumbsUp: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
  thumbsDown: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`,
};

// ============================================================================
// API CALLS
// ============================================================================

function getAdminKey(): string {
  const storedKey = localStorage.getItem('admin_key') || localStorage.getItem('ferni_admin_key');
  if (storedKey) return storedKey;
  if (import.meta.env.DEV) return 'dev-mode';
  return '';
}

async function fetchStats(): Promise<OverallStats> {
  const response = await fetch('/api/v1/admin/bth/stats', {
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': getAdminKey(),
    },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchCapabilities(): Promise<CapabilityData> {
  const response = await fetch('/api/v1/admin/bth/capabilities', {
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': getAdminKey(),
    },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchTrends(capability: string): Promise<TrendData> {
  const response = await fetch(`/api/v1/admin/bth/trends/${encodeURIComponent(capability)}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': getAdminKey(),
    },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchUserFeedback(userId: string): Promise<UserFeedback> {
  const response = await fetch(`/api/v1/admin/bth/user/${encodeURIComponent(userId)}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': getAdminKey(),
    },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function triggerAggregateRefresh(): Promise<void> {
  const response = await fetch('/api/v1/admin/bth/aggregates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': getAdminKey(),
    },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderStyles(): string {
  return `
    <style>
      .bth-dashboard {
        font-family: var(--font-body);
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
        padding: var(--space-lg);
        min-height: 100vh;
        max-width: 1400px;
        margin: 0 auto;
      }

      .bth-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-lg);
        padding-bottom: var(--space-md);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .bth-header h1 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
        display: flex;
        align-items: center;
        gap: var(--space-sm);
      }

      .bth-header-actions {
        display: flex;
        gap: var(--space-sm);
      }

      .bth-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs);
        padding: var(--space-sm) var(--space-md);
        background: var(--color-bg-secondary);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        cursor: pointer;
        font-size: 0.875rem;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .bth-btn:hover {
        background: var(--color-bg-tertiary);
        border-color: var(--color-border-medium);
      }

      .bth-btn-primary {
        background: var(--color-accent-primary);
        color: white;
        border-color: var(--color-accent-primary);
      }

      .bth-btn-primary:hover {
        background: var(--color-accent-hover);
      }

      .bth-btn-icon {
        padding: var(--space-sm);
      }

      .bth-tabs {
        display: flex;
        gap: var(--space-xs);
        margin-bottom: var(--space-lg);
        border-bottom: 1px solid var(--color-border-subtle);
        padding-bottom: var(--space-xs);
      }

      .bth-tab {
        padding: var(--space-sm) var(--space-md);
        background: transparent;
        border: none;
        color: var(--color-text-secondary);
        cursor: pointer;
        font-size: 0.875rem;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .bth-tab:hover {
        color: var(--color-text-primary);
      }

      .bth-tab.active {
        color: var(--color-accent-primary);
        border-bottom-color: var(--color-accent-primary);
      }

      .bth-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: var(--space-md);
        margin-bottom: var(--space-lg);
      }

      .bth-card {
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg);
        padding: var(--space-md);
      }

      .bth-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-sm);
      }

      .bth-card-title {
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
      }

      .bth-card-value {
        font-size: 2rem;
        font-weight: 600;
        color: var(--color-text-primary);
        line-height: 1;
      }

      .bth-card-subtitle {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        margin-top: var(--space-xs);
      }

      .bth-stat-positive { color: var(--color-semantic-success); }
      .bth-stat-neutral { color: var(--color-text-muted); }
      .bth-stat-negative { color: var(--color-semantic-error); }

      .bth-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .bth-table th,
      .bth-table td {
        padding: var(--space-sm) var(--space-md);
        text-align: left;
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .bth-table th {
        font-weight: 500;
        color: var(--color-text-muted);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .bth-table tr:hover {
        background: var(--color-bg-tertiary);
      }

      .bth-capability-name {
        font-weight: 500;
        cursor: pointer;
        color: var(--color-accent-primary);
      }

      .bth-capability-name:hover {
        text-decoration: underline;
      }

      .bth-progress-bar {
        width: 100%;
        height: 6px;
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-full);
        overflow: hidden;
      }

      .bth-progress-fill {
        height: 100%;
        background: var(--color-accent-primary);
        border-radius: var(--radius-full);
        transition: width var(--duration-normal) var(--ease-out);
      }

      .bth-trend-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2xs);
        padding: var(--space-2xs) var(--space-xs);
        border-radius: var(--radius-full);
        font-size: 0.75rem;
        font-weight: 500;
      }

      .bth-trend-improving {
        background: rgba(var(--color-semantic-success-rgb), 0.15);
        color: var(--color-semantic-success);
      }

      .bth-trend-declining {
        background: rgba(var(--color-semantic-error-rgb), 0.15);
        color: var(--color-semantic-error);
      }

      .bth-trend-stable {
        background: var(--color-bg-tertiary);
        color: var(--color-text-muted);
      }

      .bth-section {
        margin-bottom: var(--space-xl);
      }

      .bth-section-title {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: var(--space-md);
        display: flex;
        align-items: center;
        gap: var(--space-sm);
      }

      .bth-category-badge {
        display: inline-block;
        padding: var(--space-2xs) var(--space-xs);
        border-radius: var(--radius-sm);
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .bth-category-original { background: var(--color-semantic-info); color: white; }
      .bth-category-enhanced { background: var(--color-semantic-success); color: white; }
      .bth-category-legacy { background: var(--color-text-muted); color: white; }

      .bth-search-input {
        width: 100%;
        max-width: 400px;
        padding: var(--space-sm) var(--space-md);
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        color: var(--color-text-primary);
        font-size: 0.875rem;
      }

      .bth-search-input:focus {
        outline: none;
        border-color: var(--color-accent-primary);
      }

      .bth-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-xl);
        color: var(--color-text-muted);
      }

      .bth-error {
        padding: var(--space-lg);
        background: rgba(var(--color-semantic-error-rgb), 0.1);
        border: 1px solid var(--color-semantic-error);
        border-radius: var(--radius-md);
        color: var(--color-semantic-error);
        text-align: center;
      }

      .bth-empty {
        padding: var(--space-xl);
        text-align: center;
        color: var(--color-text-muted);
      }

      .bth-feedback-item {
        padding: var(--space-md);
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        margin-bottom: var(--space-sm);
      }

      .bth-feedback-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-xs);
      }

      .bth-feedback-reaction {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2xs);
      }

      @media (max-width: 768px) {
        .bth-dashboard { padding: var(--space-md); }
        .bth-header { flex-direction: column; gap: var(--space-md); }
        .bth-tabs { overflow-x: auto; }
        .bth-grid { grid-template-columns: 1fr; }
      }
    </style>
  `;
}

function renderOverview(): string {
  const { stats } = state;
  if (!stats) return `<div class="bth-loading">Loading...</div>`;

  const s = stats.summary;
  const r = stats.recentActivity;
  const top = stats.topPerformers;

  return `
    <div class="bth-grid">
      <div class="bth-card">
        <div class="bth-card-title">Total Capabilities</div>
        <div class="bth-card-value">${escapeHtml(s.totalCapabilities)}</div>
        <div class="bth-card-subtitle">${escapeHtml(s.capabilitiesWithData)} with data</div>
      </div>

      <div class="bth-card">
        <div class="bth-card-title">Usage Events</div>
        <div class="bth-card-value">${escapeHtml(s.totalUsageEvents.toLocaleString())}</div>
        <div class="bth-card-subtitle">All time</div>
      </div>

      <div class="bth-card">
        <div class="bth-card-title">Feedback Events</div>
        <div class="bth-card-value">${escapeHtml(s.totalFeedbackEvents.toLocaleString())}</div>
        <div class="bth-card-subtitle">User reactions</div>
      </div>

      <div class="bth-card">
        <div class="bth-card-title">Effectiveness Rate</div>
        <div class="bth-card-value bth-stat-positive">${escapeHtml(s.overallEffectivenessRate)}%</div>
        <div class="bth-card-subtitle">Positive reactions</div>
      </div>
    </div>

    <div class="bth-section">
      <h3 class="bth-section-title">${ICONS.chart} Recent Activity (${escapeHtml(r.period)})</h3>
      <div class="bth-grid">
        <div class="bth-card">
          <div class="bth-card-title">Usage</div>
          <div class="bth-card-value">${escapeHtml(r.usageCount)}</div>
        </div>
        <div class="bth-card">
          <div class="bth-card-title">Applied</div>
          <div class="bth-card-value">${escapeHtml(r.appliedCount)}</div>
        </div>
      </div>
    </div>

    <div class="bth-section">
      <h3 class="bth-section-title">${ICONS.star} Top Performers</h3>
      ${
        top.length > 0
          ? `
        <table class="bth-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Effectiveness</th>
            </tr>
          </thead>
          <tbody>
            ${top
              .map(
                (t) => `
              <tr>
                <td class="bth-capability-name" onclick="window.bthDashboard?.viewTrends('${escapeHtml(t.capability)}')">${formatCapabilityName(t.capability)}</td>
                <td>
                  <div style="display: flex; align-items: center; gap: var(--space-sm);">
                    <div class="bth-progress-bar" style="width: 100px;">
                      <div class="bth-progress-fill" style="width: ${escapeHtml(t.effectivenessRate)}%;"></div>
                    </div>
                    <span class="bth-stat-positive">${escapeHtml(t.effectivenessRate)}%</span>
                  </div>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
          : `<div class="bth-empty">No data yet</div>`
      }
    </div>
  `;
}

function renderCapabilities(): string {
  const { capabilities } = state;
  if (!capabilities) return `<div class="bth-loading">Loading...</div>`;

  return `
    <div class="bth-section">
      <h3 class="bth-section-title">
        <span class="bth-category-badge bth-category-original">Original 10</span>
        Core superhuman capabilities
      </h3>
      ${renderCapabilityTable(capabilities.byCategory.original10)}
    </div>

    <div class="bth-section">
      <h3 class="bth-section-title">
        <span class="bth-category-badge bth-category-enhanced">Enhanced 9</span>
        Advanced emotional intelligence
      </h3>
      ${renderCapabilityTable(capabilities.byCategory.enhanced9)}
    </div>

    <div class="bth-section">
      <h3 class="bth-section-title">
        <span class="bth-category-badge bth-category-legacy">Legacy 12</span>
        Foundation capabilities
      </h3>
      ${renderCapabilityTable(capabilities.byCategory.legacy12)}
    </div>
  `;
}

function renderCapabilityTable(caps: CapabilityStat[]): string {
  if (!caps || caps.length === 0) {
    return `<div class="bth-empty">No capabilities in this category</div>`;
  }

  return `
    <table class="bth-table">
      <thead>
        <tr>
          <th>Capability</th>
          <th>Usage</th>
          <th>Applied</th>
          <th>${ICONS.thumbsUp}</th>
          <th>${ICONS.thumbsDown}</th>
          <th>Effectiveness</th>
        </tr>
      </thead>
      <tbody>
        ${caps
          .map(
            (c) => `
          <tr>
            <td class="bth-capability-name" onclick="window.bthDashboard?.viewTrends('${escapeHtml(c.capability)}')">${formatCapabilityName(c.capability)}</td>
            <td>${escapeHtml(c.usage)}</td>
            <td>${escapeHtml(c.applied)} (${escapeHtml(c.applicationRate)}%)</td>
            <td class="bth-stat-positive">${escapeHtml(c.positive)}</td>
            <td class="bth-stat-negative">${escapeHtml(c.negative)}</td>
            <td>
              <div style="display: flex; align-items: center; gap: var(--space-sm);">
                <div class="bth-progress-bar" style="width: 60px;">
                  <div class="bth-progress-fill" style="width: ${escapeHtml(c.effectivenessRate)}%; background: ${c.effectivenessRate >= 70 ? 'var(--color-semantic-success)' : c.effectivenessRate >= 50 ? 'var(--color-semantic-warning)' : 'var(--color-semantic-error)'};"></div>
                </div>
                <span>${escapeHtml(c.effectivenessRate)}%</span>
              </div>
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderTrends(): string {
  const { selectedCapability, trendData } = state;

  if (!selectedCapability) {
    return `
      <div class="bth-empty">
        <p>Select a capability from the Capabilities tab to view trends</p>
      </div>
    `;
  }

  if (!trendData) {
    return `<div class="bth-loading">Loading trends for ${formatCapabilityName(selectedCapability)}...</div>`;
  }

  const { trends, summary } = trendData;
  const trendIcon =
    summary.trend === 'improving' ? ICONS.trendUp : summary.trend === 'declining' ? ICONS.trendDown : '';
  const trendClass = `bth-trend-${summary.trend}`;

  return `
    <div class="bth-section">
      <h3 class="bth-section-title">
        ${formatCapabilityName(selectedCapability)}
        <span class="bth-trend-badge ${trendClass}">${trendIcon} ${escapeHtml(summary.trend)}</span>
      </h3>

      <div class="bth-grid">
        <div class="bth-card">
          <div class="bth-card-title">Period</div>
          <div class="bth-card-value">${escapeHtml(summary.totalDays)}</div>
          <div class="bth-card-subtitle">days</div>
        </div>

        <div class="bth-card">
          <div class="bth-card-title">Total Feedback</div>
          <div class="bth-card-value">${escapeHtml(summary.totalFeedback)}</div>
        </div>

        <div class="bth-card">
          <div class="bth-card-title">Positive Rate</div>
          <div class="bth-card-value bth-stat-positive">${escapeHtml(summary.overallPositiveRate)}%</div>
        </div>
      </div>
    </div>

    <div class="bth-section">
      <h4 class="bth-section-title">Daily Breakdown</h4>
      <table class="bth-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>${ICONS.thumbsUp} Positive</th>
            <th>Neutral</th>
            <th>${ICONS.thumbsDown} Negative</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${trends
            .map((t) => {
              const total = t.positive + t.neutral + t.negative;
              return `
              <tr>
                <td>${escapeHtml(t.date)}</td>
                <td class="bth-stat-positive">${escapeHtml(t.positive)}</td>
                <td class="bth-stat-neutral">${escapeHtml(t.neutral)}</td>
                <td class="bth-stat-negative">${escapeHtml(t.negative)}</td>
                <td>${escapeHtml(total)}</td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderUsers(): string {
  const { userIdInput, userFeedback } = state;

  return `
    <div class="bth-section">
      <h3 class="bth-section-title">${ICONS.search} User Feedback Lookup</h3>
      <div style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-lg);">
        <input
          type="text"
          class="bth-search-input"
          placeholder="Enter user ID..."
          value="${escapeHtml(userIdInput)}"
          onchange="window.bthDashboard?.setUserIdInput(this.value)"
          onkeydown="if(event.key==='Enter') window.bthDashboard?.searchUser()"
        />
        <button class="bth-btn bth-btn-primary" onclick="window.bthDashboard?.searchUser()">
          ${ICONS.search} Search
        </button>
      </div>
    </div>

    ${
      userFeedback
        ? `
      <div class="bth-section">
        <h3 class="bth-section-title">${ICONS.user} Feedback for ${escapeHtml(userFeedback.userId)}</h3>
        <p style="color: var(--color-text-muted); margin-bottom: var(--space-md);">
          ${escapeHtml(userFeedback.feedbackCount)} feedback items
        </p>

        ${
          userFeedback.feedback.length > 0
            ? userFeedback.feedback
                .map(
                  (f) => `
            <div class="bth-feedback-item">
              <div class="bth-feedback-header">
                <span class="bth-capability-name" onclick="window.bthDashboard?.viewTrends('${escapeHtml(f.capability)}')">${formatCapabilityName(f.capability)}</span>
                <span class="bth-feedback-reaction ${f.reaction === 'positive' ? 'bth-stat-positive' : f.reaction === 'negative' ? 'bth-stat-negative' : 'bth-stat-neutral'}">
                  ${f.reaction === 'positive' ? ICONS.thumbsUp : f.reaction === 'negative' ? ICONS.thumbsDown : ''} ${escapeHtml(f.reaction)}
                </span>
              </div>
              ${f.insight ? `<p style="font-size: 0.875rem; margin-top: var(--space-xs);">${escapeHtml(f.insight)}</p>` : ''}
              <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: var(--space-xs);">
                ${escapeHtml(f.timestamp)} • Session: ${escapeHtml(f.sessionId?.slice(0, 8) || 'N/A')}...
              </div>
            </div>
          `
                )
                .join('')
            : `<div class="bth-empty">No feedback found</div>`
        }
      </div>
    `
        : ''
    }
  `;
}

function formatCapabilityName(cap: string): string {
  return escapeHtml(
    cap
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

function renderContent(): string {
  if (state.error) {
    return `<div class="bth-error">${escapeHtml(state.error)}</div>`;
  }

  switch (state.activeTab) {
    case 'overview':
      return renderOverview();
    case 'capabilities':
      return renderCapabilities();
    case 'trends':
      return renderTrends();
    case 'users':
      return renderUsers();
    default:
      return '';
  }
}

function render(): void {
  if (!container) return;

  container.innerHTML = `
    ${renderStyles()}
    <div class="bth-dashboard">
      <header class="bth-header">
        <h1>${ICONS.chart} BTH Analytics</h1>
        <div class="bth-header-actions">
          <button class="bth-btn" onclick="window.bthDashboard?.refresh()" title="Refresh">
            ${ICONS.refresh} Refresh
          </button>
          <button class="bth-btn" onclick="window.bthDashboard?.refreshAggregates()" title="Recalculate aggregates">
            Recalculate
          </button>
          <button class="bth-btn bth-btn-icon" onclick="window.bthDashboard?.close()" title="Close">
            ${ICONS.close}
          </button>
        </div>
      </header>

      <nav class="bth-tabs">
        <button class="bth-tab ${state.activeTab === 'overview' ? 'active' : ''}" onclick="window.bthDashboard?.setTab('overview')">Overview</button>
        <button class="bth-tab ${state.activeTab === 'capabilities' ? 'active' : ''}" onclick="window.bthDashboard?.setTab('capabilities')">Capabilities</button>
        <button class="bth-tab ${state.activeTab === 'trends' ? 'active' : ''}" onclick="window.bthDashboard?.setTab('trends')">Trends</button>
        <button class="bth-tab ${state.activeTab === 'users' ? 'active' : ''}" onclick="window.bthDashboard?.setTab('users')">Users</button>
      </nav>

      <main>
        ${state.loading ? `<div class="bth-loading">Loading...</div>` : renderContent()}
      </main>

      ${state.lastRefresh ? `<footer style="text-align: center; padding: var(--space-md); color: var(--color-text-muted); font-size: 0.75rem;">Last updated: ${escapeHtml(state.lastRefresh.toLocaleTimeString())}</footer>` : ''}
    </div>
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const bthDashboard = {
  async open(): Promise<void> {
    if (isVisible) return;

    container = document.createElement('div');
    container.id = 'bth-analytics-dashboard';
    container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      background: var(--color-bg-primary);
      overflow-y: auto;
      animation: fadeIn ${DURATION.NORMAL}ms ${EASING.EASE_OUT};
    `;
    document.body.appendChild(container);

    isVisible = true;
    state.loading = true;
    render();

    await this.refresh();
    log.info('BTH Analytics dashboard opened');
  },

  close(): void {
    if (!isVisible || !container) return;

    container.style.animation = `fadeOut ${DURATION.FAST}ms ${EASING.EASE_OUT}`;
    setTimeout(() => {
      container?.remove();
      container = null;
      isVisible = false;
    }, DURATION.FAST);

    log.info('BTH Analytics dashboard closed');
  },

  async refresh(): Promise<void> {
    state.loading = true;
    state.error = null;
    render();

    try {
      const [stats, capabilities] = await Promise.all([fetchStats(), fetchCapabilities()]);

      state.stats = stats;
      state.capabilities = capabilities;
      state.lastRefresh = new Date();
      state.loading = false;
      render();
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to fetch BTH data');
      state.error = `Failed to load data: ${String(error)}`;
      state.loading = false;
      render();
    }
  },

  async refreshAggregates(): Promise<void> {
    try {
      await triggerAggregateRefresh();
      toast.success(t('toasts.aggregatesRefreshing'));
      setTimeout(() => this.refresh(), 2000);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to trigger aggregate refresh');
      toast.error('Couldn\'t refresh aggregates');
    }
  },

  setTab(tab: DashboardState['activeTab']): void {
    state.activeTab = tab;
    render();

    if (tab === 'capabilities' && !state.capabilities) {
      this.refresh();
    }
  },

  async viewTrends(capability: string): Promise<void> {
    state.selectedCapability = capability;
    state.activeTab = 'trends';
    state.trendData = null;
    render();

    try {
      state.trendData = await fetchTrends(capability);
      render();
    } catch (error) {
      log.error({ error: String(error), capability }, 'Failed to fetch trends');
      state.error = `Failed to load trends: ${String(error)}`;
      render();
    }
  },

  setUserIdInput(value: string): void {
    state.userIdInput = value;
  },

  async searchUser(): Promise<void> {
    const userId = state.userIdInput.trim();
    if (!userId || userId.length < 5) {
      toast.warning(t('toasts.enterValidUserId'));
      return;
    }

    state.userFeedback = null;
    render();

    try {
      state.userFeedback = await fetchUserFeedback(userId);
      render();
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to fetch user feedback');
      toast.error('Couldn\'t find user feedback');
    }
  },
};

// Expose globally for onclick handlers
declare global {
  interface Window {
    bthDashboard: typeof bthDashboard;
  }
}
window.bthDashboard = bthDashboard;

export default bthDashboard;
