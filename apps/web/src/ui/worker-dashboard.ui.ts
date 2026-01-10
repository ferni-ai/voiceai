/**
 * Worker Dashboard UI
 *
 * Admin dashboard for monitoring background worker health and statistics.
 * Shows real-time metrics for all workers (trust, analytics, predictions, etc.)
 * and the AsyncEvents queue.
 *
 * Features:
 * - Real-time worker stats display
 * - AsyncEvents queue depth visualization
 * - Health status indicators (healthy/degraded/unhealthy)
 * - Auto-refresh every 10 seconds
 * - Admin-only flush action
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';

const log = createLogger('WorkerDashboard');

// ============================================================================
// ICONS (Lucide SVG - 2px stroke, rounded corners)
// ============================================================================

const ICONS = {
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
    <path d="M16 16h5v5"/>
  </svg>`,
  activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  alertTriangle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,
  xCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`,
  server: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
    <line x1="6" y1="6" x2="6.01" y2="6"/>
    <line x1="6" y1="18" x2="6.01" y2="18"/>
  </svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>`,
};

// ============================================================================
// TYPES
// ============================================================================

interface WorkerStats {
  messagesReceived: number;
  messagesProcessed: number;
  messagesFailed: number;
  averageProcessingMs: number;
  lastProcessedAt: number | null;
}

interface AudioAnalysisStats {
  activeJobs: number;
  queueLength: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  avgProcessingMs: number;
}

interface WorkerStatsResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  workers: {
    trust?: WorkerStats;
    analytics?: WorkerStats;
    predictions?: WorkerStats;
    embedding?: WorkerStats;
    summarization?: WorkerStats;
    audioAnalysis?: AudioAnalysisStats;
  };
  asyncEvents: {
    queueLength: number;
    emitted: number;
    processed: number;
    errors: number;
    dropped: number;
    handlerCount: number;
  };
  uptime: number;
  timestamp: string;
}

interface DashboardState {
  stats: WorkerStatsResponse | null;
  loading: boolean;
  error: string | null;
  autoRefresh: boolean;
}

// ============================================================================
// STATE
// ============================================================================

const state: DashboardState = {
  stats: null,
  loading: true,
  error: null,
  autoRefresh: true,
};

let refreshInterval: ReturnType<typeof setInterval> | null = null;
let container: HTMLElement | null = null;

// ============================================================================
// HMR CLEANUP - Required per brand guidelines
// ============================================================================

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.worker-dashboard').forEach((el) => el.remove());
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// ============================================================================
// API
// ============================================================================

async function fetchWorkerStats(): Promise<WorkerStatsResponse> {
  const response = await apiGet<WorkerStatsResponse>('/api/workers/stats');
  if (!response) {
    throw new Error('Failed to fetch worker stats');
  }
  return response;
}

async function flushAsyncEvents(): Promise<{ success: boolean; flushed: number }> {
  const response = await apiPost<{ success: boolean; flushed: number; remaining: number }>(
    '/api/workers/flush',
    {}
  );
  if (!response) {
    throw new Error('Failed to flush events');
  }
  return response;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the worker dashboard.
 * Call this when navigating to the worker monitoring page.
 */
export async function initWorkerDashboard(targetContainer?: HTMLElement): Promise<void> {
  // HMR cleanup first
  cleanupOrphanedElements();

  container = targetContainer || document.getElementById('workerDashboard');
  if (!container) {
    log.warn('Worker dashboard container not found');
    return;
  }

  // Show loading state
  container.innerHTML = renderLoading();

  // Fetch initial data
  await refreshStats();

  // Start auto-refresh
  if (state.autoRefresh) {
    startAutoRefresh();
  }

  log.debug('Worker dashboard initialized');
}

/**
 * Destroy the dashboard and cleanup
 */
export function destroyWorkerDashboard(): void {
  cleanupOrphanedElements();
  container = null;
  state.stats = null;
  state.loading = true;
  state.error = null;
}

// ============================================================================
// REFRESH
// ============================================================================

async function refreshStats(): Promise<void> {
  state.loading = true;
  render();

  try {
    state.stats = await fetchWorkerStats();
    state.error = null;
  } catch (err) {
    state.error = (err as Error).message;
    log.error({ error: state.error }, 'Failed to fetch worker stats');
  } finally {
    state.loading = false;
    render();
  }
}

function startAutoRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(() => {
    void refreshStats();
  }, 10000); // 10 seconds
}

function stopAutoRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function toggleAutoRefresh(): void {
  state.autoRefresh = !state.autoRefresh;
  if (state.autoRefresh) {
    startAutoRefresh();
    toast.info('Auto-refresh enabled');
  } else {
    stopAutoRefresh();
    toast.info('Auto-refresh disabled');
  }
  render();
}

// ============================================================================
// RENDERING
// ============================================================================

function render(): void {
  if (!container) return;

  if (state.loading && !state.stats) {
    container.innerHTML = renderLoading();
    return;
  }

  if (state.error && !state.stats) {
    container.innerHTML = renderError(state.error);
    attachEventListeners();
    return;
  }

  container.innerHTML = renderDashboard();
  attachEventListeners();
}

function renderLoading(): string {
  return `
    <div class="worker-dashboard worker-dashboard--loading">
      <div class="worker-loading">
        <div class="worker-spinner"></div>
        <p>Loading worker stats...</p>
      </div>
    </div>
  `;
}

function renderError(message: string): string {
  return `
    <div class="worker-dashboard worker-dashboard--error">
      <div class="worker-error">
        <span class="worker-error-icon">${ICONS.xCircle}</span>
        <h2>Error Loading Stats</h2>
        <p>${message}</p>
        <button class="worker-btn worker-btn--primary" data-action="retry">
          ${ICONS.refresh} Retry
        </button>
      </div>
    </div>
  `;
}

function renderDashboard(): string {
  const stats = state.stats!;
  const statusClass = `worker-status--${stats.status}`;
  const statusIcon =
    stats.status === 'healthy'
      ? ICONS.check
      : stats.status === 'degraded'
        ? ICONS.alertTriangle
        : ICONS.xCircle;

  return `
    <div class="worker-dashboard">
      <header class="worker-header">
        <div class="worker-header-title">
          <span class="worker-header-icon">${ICONS.server}</span>
          <h1>Worker Health</h1>
        </div>
        <div class="worker-header-actions">
          <button class="worker-btn ${state.autoRefresh ? 'worker-btn--active' : ''}" 
                  data-action="toggle-refresh" title="Toggle auto-refresh">
            ${ICONS.zap} Auto
          </button>
          <button class="worker-btn" data-action="refresh" title="Refresh now">
            ${ICONS.refresh} Refresh
          </button>
        </div>
      </header>

      <section class="worker-summary ${statusClass}">
        <div class="worker-summary-status">
          <span class="worker-summary-icon">${statusIcon}</span>
          <span class="worker-summary-label">${capitalize(stats.status)}</span>
        </div>
        <div class="worker-summary-uptime">
          Uptime: ${formatDuration(stats.uptime)}
        </div>
        <div class="worker-summary-timestamp">
          Updated: ${formatTime(stats.timestamp)}
        </div>
      </section>

      <section class="worker-section">
        <h2>Background Workers</h2>
        <div class="worker-cards">
          ${renderWorkerCard('Trust', stats.workers.trust)}
          ${renderWorkerCard('Analytics', stats.workers.analytics)}
          ${renderWorkerCard('Predictions', stats.workers.predictions)}
          ${renderWorkerCard('Embedding', stats.workers.embedding)}
          ${renderWorkerCard('Summarization', stats.workers.summarization)}
          ${stats.workers.audioAnalysis ? renderAudioAnalysisCard(stats.workers.audioAnalysis) : ''}
        </div>
      </section>

      <section class="worker-section">
        <h2>Async Events Queue</h2>
        <div class="worker-async-events">
          ${renderAsyncEventsPanel(stats.asyncEvents)}
        </div>
      </section>

      <section class="worker-section worker-section--admin">
        <h2>Admin Actions</h2>
        <div class="worker-admin-actions">
          <button class="worker-btn worker-btn--danger" data-action="flush" 
                  title="Flush all pending async events">
            ${ICONS.trash} Flush Queue
          </button>
          <p class="worker-admin-hint">
            Flushes all pending async events. Use with caution.
          </p>
        </div>
      </section>
    </div>
    ${renderStyles()}
  `;
}

function renderWorkerCard(name: string, stats?: WorkerStats): string {
  if (!stats) {
    return `
      <div class="worker-card worker-card--unavailable">
        <div class="worker-card-header">
          <span class="worker-card-icon">${ICONS.activity}</span>
          <span class="worker-card-name">${name}</span>
        </div>
        <div class="worker-card-body">
          <p class="worker-card-unavailable">Not initialized</p>
        </div>
      </div>
    `;
  }

  const failureRate =
    stats.messagesProcessed > 0
      ? ((stats.messagesFailed / stats.messagesProcessed) * 100).toFixed(1)
      : '0.0';
  const isHealthy = parseFloat(failureRate) < 5;

  return `
    <div class="worker-card ${isHealthy ? '' : 'worker-card--warning'}">
      <div class="worker-card-header">
        <span class="worker-card-icon">${ICONS.activity}</span>
        <span class="worker-card-name">${name}</span>
        <span class="worker-card-status ${isHealthy ? 'worker-card-status--ok' : 'worker-card-status--warn'}">
          ${isHealthy ? ICONS.check : ICONS.alertTriangle}
        </span>
      </div>
      <div class="worker-card-body">
        <div class="worker-stat">
          <span class="worker-stat-label">Received</span>
          <span class="worker-stat-value">${formatNumber(stats.messagesReceived)}</span>
        </div>
        <div class="worker-stat">
          <span class="worker-stat-label">Processed</span>
          <span class="worker-stat-value">${formatNumber(stats.messagesProcessed)}</span>
        </div>
        <div class="worker-stat">
          <span class="worker-stat-label">Failed</span>
          <span class="worker-stat-value worker-stat-value--${stats.messagesFailed > 0 ? 'warn' : 'ok'}">
            ${formatNumber(stats.messagesFailed)} (${failureRate}%)
          </span>
        </div>
        <div class="worker-stat">
          <span class="worker-stat-label">Avg Time</span>
          <span class="worker-stat-value">${stats.averageProcessingMs.toFixed(1)}ms</span>
        </div>
        <div class="worker-stat worker-stat--full">
          <span class="worker-stat-label">Last Processed</span>
          <span class="worker-stat-value">
            ${stats.lastProcessedAt ? formatTime(new Date(stats.lastProcessedAt).toISOString()) : 'Never'}
          </span>
        </div>
      </div>
    </div>
  `;
}

function renderAudioAnalysisCard(stats: AudioAnalysisStats): string {
  const failureRate =
    stats.totalJobs > 0 ? ((stats.failedJobs / stats.totalJobs) * 100).toFixed(1) : '0.0';
  const isHealthy = parseFloat(failureRate) < 5 && stats.queueLength < 50;

  return `
    <div class="worker-card worker-card--audio ${isHealthy ? '' : 'worker-card--warning'}">
      <div class="worker-card-header">
        <span class="worker-card-icon">${ICONS.activity}</span>
        <span class="worker-card-name">Audio Analysis</span>
        <span class="worker-card-status ${isHealthy ? 'worker-card-status--ok' : 'worker-card-status--warn'}">
          ${isHealthy ? ICONS.check : ICONS.alertTriangle}
        </span>
      </div>
      <div class="worker-card-body">
        <div class="worker-stat">
          <span class="worker-stat-label">Active Jobs</span>
          <span class="worker-stat-value">${stats.activeJobs}</span>
        </div>
        <div class="worker-stat">
          <span class="worker-stat-label">Queue</span>
          <span class="worker-stat-value">${stats.queueLength}</span>
        </div>
        <div class="worker-stat">
          <span class="worker-stat-label">Completed</span>
          <span class="worker-stat-value">${formatNumber(stats.completedJobs)}</span>
        </div>
        <div class="worker-stat">
          <span class="worker-stat-label">Failed</span>
          <span class="worker-stat-value worker-stat-value--${stats.failedJobs > 0 ? 'warn' : 'ok'}">
            ${formatNumber(stats.failedJobs)} (${failureRate}%)
          </span>
        </div>
        <div class="worker-stat">
          <span class="worker-stat-label">Avg Time</span>
          <span class="worker-stat-value">${stats.avgProcessingMs.toFixed(1)}ms</span>
        </div>
      </div>
    </div>
  `;
}

function renderAsyncEventsPanel(events: WorkerStatsResponse['asyncEvents']): string {
  const queuePercent = Math.min((events.queueLength / 1000) * 100, 100);
  const queueStatus =
    events.queueLength < 500 ? 'ok' : events.queueLength < 900 ? 'warn' : 'critical';

  return `
    <div class="worker-async-panel">
      <div class="worker-async-queue">
        <div class="worker-async-queue-header">
          <span>Queue Depth</span>
          <span class="worker-async-queue-value">${events.queueLength} / 1000</span>
        </div>
        <div class="worker-async-queue-bar">
          <div class="worker-async-queue-fill worker-async-queue-fill--${queueStatus}" 
               style="width: ${queuePercent}%"></div>
        </div>
      </div>

      <div class="worker-async-stats">
        <div class="worker-async-stat">
          <span class="worker-async-stat-label">Emitted</span>
          <span class="worker-async-stat-value">${formatNumber(events.emitted)}</span>
        </div>
        <div class="worker-async-stat">
          <span class="worker-async-stat-label">Processed</span>
          <span class="worker-async-stat-value">${formatNumber(events.processed)}</span>
        </div>
        <div class="worker-async-stat">
          <span class="worker-async-stat-label">Errors</span>
          <span class="worker-async-stat-value worker-async-stat-value--${events.errors > 0 ? 'warn' : 'ok'}">
            ${formatNumber(events.errors)}
          </span>
        </div>
        <div class="worker-async-stat">
          <span class="worker-async-stat-label">Dropped</span>
          <span class="worker-async-stat-value worker-async-stat-value--${events.dropped > 0 ? 'critical' : 'ok'}">
            ${formatNumber(events.dropped)}
          </span>
        </div>
        <div class="worker-async-stat">
          <span class="worker-async-stat-label">Handlers</span>
          <span class="worker-async-stat-value">${events.handlerCount}</span>
        </div>
      </div>
    </div>
  `;
}

function renderStyles(): string {
  return `
    <style>
      .worker-dashboard {
        padding: var(--space-6);
        max-width: 1200px;
        margin: 0 auto;
        font-family: var(--font-body);
      }

      .worker-dashboard--loading,
      .worker-dashboard--error {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 400px;
      }

      .worker-loading {
        text-align: center;
        color: var(--color-text-secondary);
      }

      .worker-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-accent);
        border-radius: 50%;
        animation: worker-spin 1s linear infinite;
        margin: 0 auto var(--space-4);
      }

      @keyframes worker-spin {
        to { transform: rotate(360deg); }
      }

      .worker-error {
        text-align: center;
        color: var(--color-text-secondary);
      }

      .worker-error-icon {
        display: block;
        width: 48px;
        height: 48px;
        margin: 0 auto var(--space-4);
        color: var(--color-error, #ef4444);
      }

      .worker-error-icon svg {
        width: 100%;
        height: 100%;
      }

      /* Header */
      .worker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-6);
      }

      .worker-header-title {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .worker-header-icon {
        width: 32px;
        height: 32px;
        color: var(--color-accent);
      }

      .worker-header-icon svg {
        width: 100%;
        height: 100%;
      }

      .worker-header h1 {
        font-family: var(--font-display);
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0;
      }

      .worker-header-actions {
        display: flex;
        gap: var(--space-2);
      }

      /* Buttons */
      .worker-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-4);
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        color: var(--color-text-secondary);
        font-size: 0.875rem;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .worker-btn:hover {
        background: var(--color-background-hover);
        color: var(--color-text-primary);
      }

      .worker-btn svg {
        width: 16px;
        height: 16px;
      }

      .worker-btn--primary {
        background: var(--color-accent);
        border-color: var(--color-accent);
        color: white;
      }

      .worker-btn--primary:hover {
        background: var(--color-accent-hover);
      }

      .worker-btn--active {
        background: var(--color-accent);
        border-color: var(--color-accent);
        color: white;
      }

      .worker-btn--danger {
        color: var(--color-error, #ef4444);
        border-color: var(--color-error, #ef4444);
      }

      .worker-btn--danger:hover {
        background: var(--color-error, #ef4444);
        color: white;
      }

      /* Summary */
      .worker-summary {
        display: flex;
        align-items: center;
        gap: var(--space-6);
        padding: var(--space-4) var(--space-6);
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg);
        margin-bottom: var(--space-6);
      }

      .worker-summary--healthy {
        border-left: 4px solid var(--color-success, #22c55e);
      }

      .worker-summary--degraded {
        border-left: 4px solid var(--color-warning, #f59e0b);
      }

      .worker-summary--unhealthy {
        border-left: 4px solid var(--color-error, #ef4444);
      }

      .worker-summary-status {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-weight: 600;
      }

      .worker-summary-icon {
        width: 24px;
        height: 24px;
      }

      .worker-summary-icon svg {
        width: 100%;
        height: 100%;
      }

      .worker-status--healthy .worker-summary-icon { color: var(--color-success, #22c55e); }
      .worker-status--degraded .worker-summary-icon { color: var(--color-warning, #f59e0b); }
      .worker-status--unhealthy .worker-summary-icon { color: var(--color-error, #ef4444); }

      .worker-summary-uptime,
      .worker-summary-timestamp {
        color: var(--color-text-secondary);
        font-size: 0.875rem;
      }

      /* Sections */
      .worker-section {
        margin-bottom: var(--space-8);
      }

      .worker-section h2 {
        font-family: var(--font-display);
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-4);
      }

      /* Worker Cards */
      .worker-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--space-4);
      }

      .worker-card {
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }

      .worker-card--warning {
        border-color: var(--color-warning, #f59e0b);
      }

      .worker-card--unavailable {
        opacity: 0.6;
      }

      .worker-card-header {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-4);
        background: var(--color-background);
        border-bottom: 1px solid var(--color-border);
      }

      .worker-card-icon {
        width: 20px;
        height: 20px;
        color: var(--color-accent);
      }

      .worker-card-icon svg {
        width: 100%;
        height: 100%;
      }

      .worker-card-name {
        flex: 1;
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .worker-card-status {
        width: 20px;
        height: 20px;
      }

      .worker-card-status svg {
        width: 100%;
        height: 100%;
      }

      .worker-card-status--ok { color: var(--color-success, #22c55e); }
      .worker-card-status--warn { color: var(--color-warning, #f59e0b); }

      .worker-card-body {
        padding: var(--space-4);
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-2);
      }

      .worker-card-unavailable {
        grid-column: 1 / -1;
        text-align: center;
        color: var(--color-text-muted);
        font-style: italic;
      }

      .worker-stat {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .worker-stat--full {
        grid-column: 1 / -1;
      }

      .worker-stat-label {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .worker-stat-value {
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .worker-stat-value--ok { color: var(--color-success, #22c55e); }
      .worker-stat-value--warn { color: var(--color-warning, #f59e0b); }

      /* Async Events Panel */
      .worker-async-panel {
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: var(--space-4);
      }

      .worker-async-queue {
        margin-bottom: var(--space-4);
      }

      .worker-async-queue-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: var(--space-2);
        font-size: 0.875rem;
        color: var(--color-text-secondary);
      }

      .worker-async-queue-value {
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .worker-async-queue-bar {
        height: 8px;
        background: var(--color-background);
        border-radius: var(--radius-full);
        overflow: hidden;
      }

      .worker-async-queue-fill {
        height: 100%;
        border-radius: var(--radius-full);
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .worker-async-queue-fill--ok { background: var(--color-success, #22c55e); }
      .worker-async-queue-fill--warn { background: var(--color-warning, #f59e0b); }
      .worker-async-queue-fill--critical { background: var(--color-error, #ef4444); }

      .worker-async-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: var(--space-4);
      }

      .worker-async-stat {
        text-align: center;
      }

      .worker-async-stat-label {
        display: block;
        font-size: 0.75rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: var(--space-1);
      }

      .worker-async-stat-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .worker-async-stat-value--ok { color: var(--color-success, #22c55e); }
      .worker-async-stat-value--warn { color: var(--color-warning, #f59e0b); }
      .worker-async-stat-value--critical { color: var(--color-error, #ef4444); }

      /* Admin Actions */
      .worker-section--admin {
        padding-top: var(--space-6);
        border-top: 1px solid var(--color-border);
      }

      .worker-admin-actions {
        display: flex;
        align-items: center;
        gap: var(--space-4);
      }

      .worker-admin-hint {
        color: var(--color-text-muted);
        font-size: 0.875rem;
        margin: 0;
      }

      /* Responsive */
      @media (max-width: 640px) {
        .worker-dashboard {
          padding: var(--space-4);
        }

        .worker-header {
          flex-direction: column;
          align-items: flex-start;
          gap: var(--space-4);
        }

        .worker-summary {
          flex-direction: column;
          align-items: flex-start;
          gap: var(--space-2);
        }

        .worker-cards {
          grid-template-columns: 1fr;
        }

        .worker-admin-actions {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    </style>
  `;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function attachEventListeners(): void {
  if (!container) return;

  // Refresh button
  container.querySelectorAll('[data-action="refresh"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void refreshStats();
    });
  });

  // Retry button (error state)
  container.querySelectorAll('[data-action="retry"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void refreshStats();
    });
  });

  // Toggle auto-refresh
  container.querySelectorAll('[data-action="toggle-refresh"]').forEach((btn) => {
    btn.addEventListener('click', toggleAutoRefresh);
  });

  // Flush button
  container.querySelectorAll('[data-action="flush"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to flush all pending async events?')) {
        return;
      }

      try {
        const result = await flushAsyncEvents();
        toast.success(`Flushed ${result.flushed} events`);
        void refreshStats();
      } catch (err) {
        toast.error("Couldn't flush events");
        log.error({ error: String(err) }, 'Failed to flush events');
      }
    });
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initWorkerDashboard,
  destroyWorkerDashboard,
};
