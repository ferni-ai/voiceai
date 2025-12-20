/**
 * Insights Debug Panel UI
 *
 * Admin tool for debugging cross-persona insights, superhuman services,
 * and performance monitoring.
 *
 * Access: Only visible in dev mode (Cmd/Ctrl+Shift+I)
 *
 * @module ui/insights-debug-panel
 */

import { createLogger } from '../utils/logger.js';
import { getState as getNotificationState } from '../services/cross-team-notifications.service.js';

const log = createLogger('InsightsDebugPanel');

// ============================================================================
// STATE
// ============================================================================

let panelElement: HTMLElement | null = null;
let isVisible = false;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// STYLES
// ============================================================================

const PANEL_STYLES = `
  .insights-debug-panel {
    position: fixed;
    top: 60px;
    right: 20px;
    width: 400px;
    max-height: 80vh;
    background: var(--color-bg-elevated, #1a1a2e);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-xl, 0 20px 40px rgba(0,0,0,0.3));
    z-index: var(--z-modal, 2100);
    overflow: hidden;
    font-family: var(--font-body, 'Inter', sans-serif);
    color: var(--color-text-primary, #faf6f0);
    font-size: 13px;
  }

  .insights-debug-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--color-bg-secondary, #2d2d44);
    border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.1));
  }

  .insights-debug-panel__title {
    font-weight: 600;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .insights-debug-panel__close {
    background: none;
    border: none;
    color: var(--color-text-secondary, #e8e2da);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }

  .insights-debug-panel__close:hover {
    background: var(--color-bg-tertiary, rgba(255,255,255,0.1));
  }

  .insights-debug-panel__content {
    padding: 16px;
    overflow-y: auto;
    max-height: calc(80vh - 50px);
  }

  .insights-debug-panel__section {
    margin-bottom: 16px;
  }

  .insights-debug-panel__section-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #c0b8ae);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .insights-debug-panel__stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .insights-debug-panel__stat {
    background: var(--color-bg-tertiary, rgba(255,255,255,0.05));
    padding: 8px 12px;
    border-radius: 8px;
  }

  .insights-debug-panel__stat-label {
    font-size: 10px;
    color: var(--color-text-muted, #c0b8ae);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .insights-debug-panel__stat-value {
    font-size: 16px;
    font-weight: 600;
    margin-top: 2px;
  }

  .insights-debug-panel__stat-value--good {
    color: var(--color-semantic-success, #4ade80);
  }

  .insights-debug-panel__stat-value--warning {
    color: var(--color-semantic-warning, #fbbf24);
  }

  .insights-debug-panel__stat-value--error {
    color: var(--color-semantic-error, #f87171);
  }

  .insights-debug-panel__insight-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .insights-debug-panel__insight {
    background: var(--color-bg-tertiary, rgba(255,255,255,0.05));
    padding: 10px 12px;
    border-radius: 8px;
    border-left: 3px solid var(--color-accent-primary, #4a6741);
  }

  .insights-debug-panel__insight--high {
    border-left-color: var(--color-semantic-error, #f87171);
  }

  .insights-debug-panel__insight--medium {
    border-left-color: var(--color-semantic-warning, #fbbf24);
  }

  .insights-debug-panel__insight-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .insights-debug-panel__insight-type {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--color-text-muted, #c0b8ae);
  }

  .insights-debug-panel__insight-time {
    font-size: 10px;
    color: var(--color-text-dimmed, #a09890);
  }

  .insights-debug-panel__insight-message {
    font-size: 12px;
    line-height: 1.4;
  }

  .insights-debug-panel__insight-meta {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    font-size: 10px;
    color: var(--color-text-dimmed, #a09890);
  }

  .insights-debug-panel__actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .insights-debug-panel__btn {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .insights-debug-panel__btn--primary {
    background: var(--color-accent-primary, #4a6741);
    color: white;
  }

  .insights-debug-panel__btn--primary:hover {
    background: var(--color-accent-secondary, #3d5a35);
  }

  .insights-debug-panel__btn--secondary {
    background: var(--color-bg-tertiary, rgba(255,255,255,0.1));
    color: var(--color-text-primary, #faf6f0);
  }

  .insights-debug-panel__btn--secondary:hover {
    background: rgba(255,255,255,0.15);
  }

  .insights-debug-panel__empty {
    text-align: center;
    padding: 20px;
    color: var(--color-text-muted, #c0b8ae);
    font-size: 12px;
  }

  .insights-debug-panel__perf-entry {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.05));
  }

  .insights-debug-panel__perf-entry:last-child {
    border-bottom: none;
  }

  .insights-debug-panel__perf-name {
    font-size: 11px;
  }

  .insights-debug-panel__perf-time {
    font-size: 11px;
    font-family: monospace;
  }
`;

// ============================================================================
// PANEL STRUCTURE
// ============================================================================

function createPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'insights-debug-panel';
  panel.innerHTML = `
    <div class="insights-debug-panel__header">
      <div class="insights-debug-panel__title">
        <span>🔍</span>
        <span>Cross-Persona Insights</span>
      </div>
      <button class="insights-debug-panel__close" aria-label="Close">&times;</button>
    </div>
    <div class="insights-debug-panel__content">
      <div class="insights-debug-panel__section">
        <div class="insights-debug-panel__section-title">
          <span>📊</span> Connection Status
        </div>
        <div class="insights-debug-panel__stat-grid" id="insights-connection-stats"></div>
      </div>
      
      <div class="insights-debug-panel__section">
        <div class="insights-debug-panel__section-title">
          <span>⚡</span> Performance
        </div>
        <div class="insights-debug-panel__stat-grid" id="insights-perf-stats"></div>
        <div id="insights-perf-entries" style="margin-top: 8px;"></div>
      </div>
      
      <div class="insights-debug-panel__section">
        <div class="insights-debug-panel__section-title">
          <span>💡</span> Recent Insights
        </div>
        <div class="insights-debug-panel__insight-list" id="insights-list"></div>
      </div>
      
      <div class="insights-debug-panel__actions">
        <button class="insights-debug-panel__btn insights-debug-panel__btn--primary" id="insights-refresh-btn">
          Refresh
        </button>
        <button class="insights-debug-panel__btn insights-debug-panel__btn--secondary" id="insights-clear-btn">
          Clear Cache
        </button>
      </div>
    </div>
  `;

  return panel;
}

// ============================================================================
// RENDERING
// ============================================================================

function renderConnectionStats(): void {
  const container = document.getElementById('insights-connection-stats');
  if (!container) return;

  const state = getNotificationState();

  container.innerHTML = `
    <div class="insights-debug-panel__stat">
      <div class="insights-debug-panel__stat-label">WebSocket</div>
      <div class="insights-debug-panel__stat-value ${state.wsConnected ? 'insights-debug-panel__stat-value--good' : 'insights-debug-panel__stat-value--error'}">
        ${state.wsConnected ? 'Connected' : 'Disconnected'}
      </div>
    </div>
    <div class="insights-debug-panel__stat">
      <div class="insights-debug-panel__stat-label">Reconnect Attempts</div>
      <div class="insights-debug-panel__stat-value ${state.reconnectAttempts > 3 ? 'insights-debug-panel__stat-value--warning' : ''}">
        ${state.reconnectAttempts}
      </div>
    </div>
    <div class="insights-debug-panel__stat">
      <div class="insights-debug-panel__stat-label">Notifications</div>
      <div class="insights-debug-panel__stat-value">${state.notificationCount}</div>
    </div>
    <div class="insights-debug-panel__stat">
      <div class="insights-debug-panel__stat-label">Session</div>
      <div class="insights-debug-panel__stat-value">${Math.round(state.sessionDurationMs / 1000 / 60)}m</div>
    </div>
  `;
}

async function renderPerformanceStats(): Promise<void> {
  const statsContainer = document.getElementById('insights-perf-stats');
  const entriesContainer = document.getElementById('insights-perf-entries');
  if (!statsContainer || !entriesContainer) return;

  try {
    const { getPerformanceStats } = await import(
      '../../../../src/intelligence/context-builders/superhuman-integration.js'
    );
    const stats = getPerformanceStats();

    statsContainer.innerHTML = `
      <div class="insights-debug-panel__stat">
        <div class="insights-debug-panel__stat-label">Total Calls</div>
        <div class="insights-debug-panel__stat-value">${stats.totalCalls}</div>
      </div>
      <div class="insights-debug-panel__stat">
        <div class="insights-debug-panel__stat-label">Avg Duration</div>
        <div class="insights-debug-panel__stat-value ${stats.averageDurationMs > 200 ? 'insights-debug-panel__stat-value--warning' : 'insights-debug-panel__stat-value--good'}">
          ${stats.averageDurationMs}ms
        </div>
      </div>
      <div class="insights-debug-panel__stat">
        <div class="insights-debug-panel__stat-label">Cache Hit Rate</div>
        <div class="insights-debug-panel__stat-value ${stats.cacheHitRate > 0.5 ? 'insights-debug-panel__stat-value--good' : ''}">
          ${Math.round(stats.cacheHitRate * 100)}%
        </div>
      </div>
      <div class="insights-debug-panel__stat">
        <div class="insights-debug-panel__stat-label">Slowest</div>
        <div class="insights-debug-panel__stat-value ${stats.slowestCall && stats.slowestCall.durationMs > 300 ? 'insights-debug-panel__stat-value--error' : ''}">
          ${stats.slowestCall?.durationMs || 0}ms
        </div>
      </div>
    `;

    // Render recent entries
    if (stats.recentCalls.length > 0) {
      entriesContainer.innerHTML = stats.recentCalls
        .slice(-5)
        .reverse()
        .map(
          (entry) => `
        <div class="insights-debug-panel__perf-entry">
          <span class="insights-debug-panel__perf-name">
            ${entry.persona} ${entry.cacheHit ? '(cached)' : ''}
          </span>
          <span class="insights-debug-panel__perf-time ${entry.durationMs > 200 ? 'insights-debug-panel__stat-value--warning' : ''}">
            ${entry.durationMs}ms
          </span>
        </div>
      `
        )
        .join('');
    } else {
      entriesContainer.innerHTML = '<div class="insights-debug-panel__empty">No performance data yet</div>';
    }
  } catch (err) {
    log.debug('Could not load performance stats:', err);
    statsContainer.innerHTML = '<div class="insights-debug-panel__empty">Performance tracking unavailable</div>';
    entriesContainer.innerHTML = '';
  }
}

async function renderInsightsList(): Promise<void> {
  const container = document.getElementById('insights-list');
  if (!container) return;

  try {
    // Fetch insights from API
    const response = await fetch('/api/team-insights?limit=10');
    if (!response.ok) throw new Error('Failed to fetch insights');

    const data = await response.json();
    const insights = data.insights || [];

    if (insights.length === 0) {
      container.innerHTML = '<div class="insights-debug-panel__empty">No recent insights</div>';
      return;
    }

    container.innerHTML = insights
      .map(
        (insight: {
          id: string;
          type: string;
          priority: string;
          message: string;
          sourcePersona: string;
          targetPersona: string;
          timestamp: string;
        }) => `
        <div class="insights-debug-panel__insight insights-debug-panel__insight--${insight.priority}">
          <div class="insights-debug-panel__insight-header">
            <span class="insights-debug-panel__insight-type">${insight.type}</span>
            <span class="insights-debug-panel__insight-time">${formatTimeAgo(new Date(insight.timestamp))}</span>
          </div>
          <div class="insights-debug-panel__insight-message">${insight.message}</div>
          <div class="insights-debug-panel__insight-meta">
            <span>${insight.sourcePersona} → ${insight.targetPersona}</span>
            <span>•</span>
            <span>${insight.priority}</span>
          </div>
        </div>
      `
      )
      .join('');
  } catch (err) {
    log.debug('Could not load insights:', err);
    container.innerHTML = '<div class="insights-debug-panel__empty">Could not load insights</div>';
  }
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

async function refreshAll(): Promise<void> {
  renderConnectionStats();
  await renderPerformanceStats();
  await renderInsightsList();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventListeners(): void {
  const closeBtn = panelElement?.querySelector('.insights-debug-panel__close');
  closeBtn?.addEventListener('click', hideInsightsDebugPanel);

  const refreshBtn = document.getElementById('insights-refresh-btn');
  refreshBtn?.addEventListener('click', () => {
    refreshAll();
  });

  const clearBtn = document.getElementById('insights-clear-btn');
  clearBtn?.addEventListener('click', async () => {
    try {
      const { clearAllSuperhumanCache, clearPerformanceLog } = await import(
        '../../../../src/intelligence/context-builders/superhuman-integration.js'
      );
      clearAllSuperhumanCache();
      clearPerformanceLog();
      refreshAll();
      log.info('Cleared caches');
    } catch (err) {
      log.warn('Could not clear caches:', err);
    }
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the insights debug panel
 */
export function showInsightsDebugPanel(): void {
  if (isVisible) return;

  // Inject styles if needed
  if (!document.getElementById('insights-debug-panel-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'insights-debug-panel-styles';
    styleEl.textContent = PANEL_STYLES;
    document.head.appendChild(styleEl);
  }

  // Create panel
  panelElement = createPanel();
  document.body.appendChild(panelElement);
  setupEventListeners();

  // Initial render
  refreshAll();

  // Auto-refresh every 5 seconds
  refreshInterval = setInterval(refreshAll, 5000);

  isVisible = true;
  log.info('Insights debug panel opened');
}

/**
 * Hide the insights debug panel
 */
export function hideInsightsDebugPanel(): void {
  if (!isVisible) return;

  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }

  panelElement?.remove();
  panelElement = null;
  isVisible = false;
  log.info('Insights debug panel closed');
}

/**
 * Toggle the insights debug panel
 */
export function toggleInsightsDebugPanel(): void {
  if (isVisible) {
    hideInsightsDebugPanel();
  } else {
    showInsightsDebugPanel();
  }
}

/**
 * Initialize keyboard shortcut (Cmd/Ctrl+Shift+I)
 */
export function initInsightsDebugPanel(): void {
  // Only in dev mode
  const isDevMode =
    window.location.search.includes('dev') ||
    localStorage.getItem('ferni_dev_mode') === 'true' ||
    import.meta.env?.DEV;

  if (!isDevMode) {
    log.debug('Insights debug panel disabled (not in dev mode)');
    return;
  }

  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + Shift + I
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      toggleInsightsDebugPanel();
    }
  });

  log.info('Insights debug panel initialized (Cmd/Ctrl+Shift+I to open)');
}

/**
 * Cleanup
 */
export function disposeInsightsDebugPanel(): void {
  hideInsightsDebugPanel();
  
  // Remove styles
  const styleEl = document.getElementById('insights-debug-panel-styles');
  styleEl?.remove();
}

