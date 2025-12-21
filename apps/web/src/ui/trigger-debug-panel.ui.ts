/**
 * Trigger Debug Panel UI
 *
 * Admin tool for debugging dynamic trigger activations from behavior JSON files.
 * Shows which triggers are firing, their confidence, and activation patterns.
 *
 * Access: Only visible in dev mode (Cmd/Ctrl+Shift+T)
 *
 * @module ui/trigger-debug-panel
 */

import { getApiHeadersAsync } from '../utils/api-helpers.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TriggerDebugPanel');

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
  .trigger-debug-panel {
    position: fixed;
    top: 60px;
    left: 20px;
    width: 420px;
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

  .trigger-debug-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--color-bg-secondary, #2d2d44);
    border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.1));
  }

  .trigger-debug-panel__title {
    font-weight: 600;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .trigger-debug-panel__close {
    background: none;
    border: none;
    color: var(--color-text-secondary, #e8e2da);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }

  .trigger-debug-panel__close:hover {
    background: var(--color-bg-tertiary, rgba(255,255,255,0.1));
  }

  .trigger-debug-panel__content {
    padding: 16px;
    overflow-y: auto;
    max-height: calc(80vh - 50px);
  }

  .trigger-debug-panel__section {
    margin-bottom: 16px;
  }

  .trigger-debug-panel__section-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #c0b8ae);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .trigger-debug-panel__stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .trigger-debug-panel__stat {
    background: var(--color-bg-tertiary, rgba(255,255,255,0.05));
    padding: 8px 12px;
    border-radius: 8px;
  }

  .trigger-debug-panel__stat-label {
    font-size: 10px;
    color: var(--color-text-muted, #c0b8ae);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .trigger-debug-panel__stat-value {
    font-size: 18px;
    font-weight: 600;
    margin-top: 2px;
  }

  .trigger-debug-panel__stat-value--good {
    color: var(--color-semantic-success, #4ade80);
  }

  .trigger-debug-panel__stat-value--warning {
    color: var(--color-semantic-warning, #fbbf24);
  }

  .trigger-debug-panel__stat-value--muted {
    color: var(--color-text-muted, #c0b8ae);
  }

  .trigger-debug-panel__trigger-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .trigger-debug-panel__trigger {
    background: var(--color-bg-tertiary, rgba(255,255,255,0.05));
    padding: 10px 12px;
    border-radius: 8px;
    border-left: 3px solid var(--color-text-muted, #c0b8ae);
  }

  .trigger-debug-panel__trigger--fired {
    border-left-color: var(--color-semantic-success, #4ade80);
  }

  .trigger-debug-panel__trigger--matched {
    border-left-color: var(--color-semantic-warning, #fbbf24);
  }

  .trigger-debug-panel__trigger-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .trigger-debug-panel__trigger-name {
    font-weight: 500;
    font-size: 12px;
  }

  .trigger-debug-panel__trigger-badge {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .trigger-debug-panel__trigger-badge--fired {
    background: var(--color-semantic-success, #4ade80);
    color: #000;
  }

  .trigger-debug-panel__trigger-badge--matched {
    background: var(--color-semantic-warning, #fbbf24);
    color: #000;
  }

  .trigger-debug-panel__trigger-meta {
    font-size: 10px;
    color: var(--color-text-muted, #c0b8ae);
    display: flex;
    gap: 12px;
  }

  .trigger-debug-panel__builder-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .trigger-debug-panel__builder {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--color-bg-tertiary, rgba(255,255,255,0.05));
    padding: 8px 12px;
    border-radius: 6px;
  }

  .trigger-debug-panel__builder-name {
    font-size: 12px;
  }

  .trigger-debug-panel__builder-stats {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--color-text-muted, #c0b8ae);
  }

  .trigger-debug-panel__empty {
    color: var(--color-text-muted, #c0b8ae);
    font-style: italic;
    font-size: 12px;
    text-align: center;
    padding: 16px;
  }

  .trigger-debug-panel__refresh-btn {
    background: var(--color-bg-tertiary, rgba(255,255,255,0.1));
    border: none;
    color: var(--color-text-secondary, #e8e2da);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    margin-left: 8px;
  }

  .trigger-debug-panel__refresh-btn:hover {
    background: var(--color-bg-elevated, rgba(255,255,255,0.15));
  }
`;

// ============================================================================
// TYPES
// ============================================================================

interface TriggerAnalyticsResponse {
  summary: {
    totalChecked: number;
    totalMatched: number;
    totalFired: number;
    matchRate: number;
    fireRate: number;
  };
  byTrigger: Array<{
    name: string;
    checked: number;
    matched: number;
    fired: number;
    fireRate: number;
  }>;
  byBuilder: Array<{
    name: string;
    checked: number;
    matched: number;
    fired: number;
    fireRate: number;
  }>;
  recentActivations: Array<{
    triggerName: string;
    builderSource: string;
    confidence: number;
    timestamp: string;
    userId?: string;
    fired: boolean;
  }>;
}

// ============================================================================
// RENDERING
// ============================================================================

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function fetchAnalytics(): Promise<TriggerAnalyticsResponse | null> {
  try {
    const headers = await getApiHeadersAsync();
    const response = await fetch('/api/debug/triggers', { headers });

    if (!response.ok) {
      log.warn({ status: response.status }, 'Failed to fetch trigger analytics');
      return null;
    }

    return await response.json();
  } catch (error) {
    log.error({ error: String(error) }, 'Error fetching trigger analytics');
    return null;
  }
}

function renderPanel(data: TriggerAnalyticsResponse | null): string {
  if (!data) {
    return `
      <div class="trigger-debug-panel__empty">
        Unable to fetch trigger analytics.
        <br>Make sure the backend API is running.
      </div>
    `;
  }

  const { summary, byTrigger, byBuilder, recentActivations } = data;

  // Summary section
  const summaryHTML = `
    <div class="trigger-debug-panel__section">
      <div class="trigger-debug-panel__section-title">
        Summary
      </div>
      <div class="trigger-debug-panel__stat-grid">
        <div class="trigger-debug-panel__stat">
          <div class="trigger-debug-panel__stat-label">Checked</div>
          <div class="trigger-debug-panel__stat-value trigger-debug-panel__stat-value--muted">
            ${summary.totalChecked}
          </div>
        </div>
        <div class="trigger-debug-panel__stat">
          <div class="trigger-debug-panel__stat-label">Matched</div>
          <div class="trigger-debug-panel__stat-value trigger-debug-panel__stat-value--warning">
            ${summary.totalMatched}
          </div>
        </div>
        <div class="trigger-debug-panel__stat">
          <div class="trigger-debug-panel__stat-label">Fired</div>
          <div class="trigger-debug-panel__stat-value trigger-debug-panel__stat-value--good">
            ${summary.totalFired}
          </div>
        </div>
      </div>
    </div>
  `;

  // Recent activations section
  let recentHTML = '';
  if (recentActivations.length > 0) {
    const activationsHTML = recentActivations
      .slice(0, 10)
      .map(
        (activation) => `
        <div class="trigger-debug-panel__trigger trigger-debug-panel__trigger--${activation.fired ? 'fired' : 'matched'}">
          <div class="trigger-debug-panel__trigger-header">
            <span class="trigger-debug-panel__trigger-name">${activation.triggerName}</span>
            <span class="trigger-debug-panel__trigger-badge trigger-debug-panel__trigger-badge--${activation.fired ? 'fired' : 'matched'}">
              ${activation.fired ? 'Fired' : 'Matched'}
            </span>
          </div>
          <div class="trigger-debug-panel__trigger-meta">
            <span>${activation.builderSource}</span>
            <span>${formatPercent(activation.confidence)} confidence</span>
            <span>${formatTime(activation.timestamp)}</span>
          </div>
        </div>
      `
      )
      .join('');

    recentHTML = `
      <div class="trigger-debug-panel__section">
        <div class="trigger-debug-panel__section-title">
          Recent Activations
        </div>
        <div class="trigger-debug-panel__trigger-list">
          ${activationsHTML}
        </div>
      </div>
    `;
  } else {
    recentHTML = `
      <div class="trigger-debug-panel__section">
        <div class="trigger-debug-panel__section-title">
          Recent Activations
        </div>
        <div class="trigger-debug-panel__empty">
          No trigger activations yet. Start a conversation!
        </div>
      </div>
    `;
  }

  // By builder section
  let builderHTML = '';
  if (byBuilder.length > 0) {
    const buildersHTML = byBuilder
      .slice(0, 5)
      .map(
        (builder) => `
        <div class="trigger-debug-panel__builder">
          <span class="trigger-debug-panel__builder-name">${builder.name}</span>
          <div class="trigger-debug-panel__builder-stats">
            <span>${builder.matched} matched</span>
            <span>${builder.fired} fired</span>
            <span>${formatPercent(builder.fireRate)}</span>
          </div>
        </div>
      `
      )
      .join('');

    builderHTML = `
      <div class="trigger-debug-panel__section">
        <div class="trigger-debug-panel__section-title">
          By Builder
        </div>
        <div class="trigger-debug-panel__builder-list">
          ${buildersHTML}
        </div>
      </div>
    `;
  }

  return summaryHTML + recentHTML + builderHTML;
}

async function refreshPanelContent(): Promise<void> {
  if (!panelElement) return;

  const contentEl = panelElement.querySelector('.trigger-debug-panel__content');
  if (!contentEl) return;

  const data = await fetchAnalytics();
  contentEl.innerHTML = renderPanel(data);
}

// ============================================================================
// PANEL LIFECYCLE
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('trigger-debug-panel-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'trigger-debug-panel-styles';
  styleEl.textContent = PANEL_STYLES;
  document.head.appendChild(styleEl);
}

async function createPanel(): Promise<HTMLElement> {
  const panel = document.createElement('div');
  panel.className = 'trigger-debug-panel';

  panel.innerHTML = `
    <div class="trigger-debug-panel__header">
      <div class="trigger-debug-panel__title">
        Dynamic Triggers
        <button class="trigger-debug-panel__refresh-btn" id="trigger-refresh-btn">
          Refresh
        </button>
      </div>
      <button class="trigger-debug-panel__close" id="trigger-close-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="trigger-debug-panel__content">
      <div class="trigger-debug-panel__empty">Loading...</div>
    </div>
  `;

  // Event listeners
  panel.querySelector('#trigger-close-btn')?.addEventListener('click', hidePanel);
  panel.querySelector('#trigger-refresh-btn')?.addEventListener('click', () => {
    void refreshPanelContent();
  });

  return panel;
}

export async function showPanel(): Promise<void> {
  if (isVisible) return;

  injectStyles();
  panelElement = await createPanel();
  document.body.appendChild(panelElement);
  isVisible = true;

  // Initial fetch
  await refreshPanelContent();

  // Auto-refresh every 5 seconds
  refreshInterval = setInterval(() => {
    void refreshPanelContent();
  }, 5000);

  log.debug('Trigger debug panel shown');
}

export function hidePanel(): void {
  if (!isVisible || !panelElement) return;

  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }

  panelElement.remove();
  panelElement = null;
  isVisible = false;

  log.debug('Trigger debug panel hidden');
}

export function togglePanel(): void {
  if (isVisible) {
    hidePanel();
  } else {
    void showPanel();
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + Shift + T
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      togglePanel();
    }
  });
}

export function initTriggerDebugPanel(): void {
  // Only initialize in dev mode
  const isDevMode =
    window.location.search.includes('dev') ||
    localStorage.getItem('ferni_dev_mode') === 'true' ||
    import.meta.env?.DEV;

  if (!isDevMode) {
    log.debug('Trigger debug panel not initialized (not in dev mode)');
    return;
  }

  setupKeyboardShortcuts();
  log.info('Trigger debug panel initialized (Cmd/Ctrl+Shift+T to toggle)');
}

export function disposeTriggerDebugPanel(): void {
  hidePanel();
  const styleEl = document.getElementById('trigger-debug-panel-styles');
  styleEl?.remove();
}
