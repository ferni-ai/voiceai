/**
 * Marketplace Billing Dashboard UI
 *
 * Display usage, quotas, and billing information for marketplace items.
 * For publishers: Revenue tracking and payout information.
 *
 * DESIGN PRINCIPLES:
 *   - Clear, scannable usage indicators
 *   - No anxiety-inducing language about limits
 *   - Celebrate engagement, not monetize fear
 *
 * ACCESSIBILITY (WCAG AA):
 *   - Full keyboard navigation
 *   - Screen reader support
 *   - Color contrast compliant
 *   - Respects prefers-reduced-motion
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// toast is available if needed for error messages
// import { toast } from './whisper.ui.js';

const log = createLogger('BillingUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface UsageSummary {
  period: string;
  itemId: string;
  itemName: string;
  totals: {
    executions: number;
    executionTimeMs: number;
    dataTransferBytes: number;
    tokens?: number;
  };
  quota: {
    maxExecutions: number;
    maxExecutionTimeMs: number;
    currentExecutions: number;
    currentExecutionTimeMs: number;
    usagePercentage: number;
    exceeded: boolean;
    resetsAt: string;
  };
  billedAmount: {
    amountCents: number;
    currency: string;
  };
}

export interface RevenueShare {
  itemId: string;
  itemName: string;
  period: string;
  grossRevenueCents: number;
  platformFeeCents: number;
  publisherShareCents: number;
  status: 'pending' | 'paid' | 'scheduled';
  payoutDate?: string;
}

interface BillingState {
  usage: UsageSummary[];
  revenue: RevenueShare[];
  loading: boolean;
  activeView: 'usage' | 'revenue';
  tier: 'free' | 'friend' | 'partner';
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  activity:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  clock:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  dollarSign:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  trendingUp:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  calendar:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  checkCircle:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  zap: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  database:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  sparkles:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
};

// Tier configurations
const TIER_CONFIG = {
  free: {
    name: 'Free',
    color: 'var(--color-text-muted)',
    limit: 100,
    description: 'Perfect for trying things out',
  },
  friend: {
    name: 'Friend',
    color: 'var(--persona-ferni)',
    limit: 1000,
    description: 'For regular users',
  },
  partner: {
    name: 'Partner',
    color: 'var(--color-accent-primary)',
    limit: -1, // Unlimited
    description: 'Unlimited everything',
  },
};

// ============================================================================
// STATE
// ============================================================================

const state: BillingState = {
  usage: [],
  revenue: [],
  loading: false,
  activeView: 'usage',
  tier: 'free',
};

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;

// ============================================================================
// ACCESSIBILITY HELPERS
// ============================================================================

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getAnimationDuration(baseDuration: number): number {
  return prefersReducedMotion() ? 0 : baseDuration;
}

/**
 * Announce a message to screen readers via ARIA live region.
 */
function announceToScreenReader(message: string): void {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.style.cssText =
    'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;';
  announcer.textContent = message;
  document.body.appendChild(announcer);
  trackedTimeout(() => announcer.remove(), 1000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initBillingUI(): void {
  cleanupOrphanedElements();
  injectStyles();
  log.debug('Billing UI initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.billing-dashboard').forEach((el) => el.remove());
  document.querySelectorAll('#billing-dashboard-styles').forEach((el) => el.remove());
}

// ============================================================================
// MAIN VIEW
// ============================================================================

/**
 * Open the billing dashboard
 */
export async function openBillingDashboard(options?: { view?: 'usage' | 'revenue' }): Promise<void> {
  state.loading = true;
  state.activeView = options?.view || 'usage';

  container = createDashboardContainer();
  container.setAttribute('aria-busy', 'true');
  document.body.appendChild(container);
  announceToScreenReader('Loading billing dashboard...');

  requestAnimationFrame(() => {
    container?.classList.add('billing-dashboard--visible');
  });

  await loadBillingData();
  renderDashboard();
  state.loading = false;
  container?.setAttribute('aria-busy', 'false');
  announceToScreenReader('Billing dashboard loaded');
}

/**
 * Close the billing dashboard
 */
export function closeBillingDashboard(): void {
  if (!container) return;

  container.classList.remove('billing-dashboard--visible');
  trackedTimeout(() => {
    container?.remove();
    container = null;
  }, getAnimationDuration(DURATION.SLOW));
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadBillingData(): Promise<void> {
  const deviceId = appState.getState().deviceId;
  if (!deviceId) return;

  try {
    const response = await fetch(`/api/marketplace/usage?userId=${encodeURIComponent(deviceId)}`);
    if (response.ok) {
      const data = await response.json();
      state.usage = data.usage || [];
      state.tier = data.tier || 'free';
      log.debug('Billing data loaded:', { usage: state.usage.length });
    }
  } catch (error) {
    log.warn('Failed to load billing data:', error);
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function createDashboardContainer(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'billing-dashboard';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Usage & Billing');

  el.innerHTML = `
    <div class="billing-backdrop" aria-hidden="true"></div>
    <div class="billing-panel">
      <header class="billing-header">
        <button class="billing-close" aria-label="${t('accessibility.closeBilling')}">
          ${ICONS.close}
        </button>
        <h1 class="billing-title">Usage & Billing</h1>
        <p class="billing-subtitle">Track your marketplace tool usage</p>
      </header>

      <main class="billing-content">
        <!-- Content rendered here -->
      </main>
    </div>
  `;

  el.querySelector('.billing-backdrop')?.addEventListener('click', closeBillingDashboard);
  el.querySelector('.billing-close')?.addEventListener('click', closeBillingDashboard);

  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeBillingDashboard();
  });

  return el;
}

function renderDashboard(): void {
  if (!container) return;

  const content = container.querySelector('.billing-content');
  if (!content) return;

  const tierConfig = TIER_CONFIG[state.tier];

  content.innerHTML = `
    <!-- Tier Banner -->
    <div class="tier-banner" style="--tier-color: ${tierConfig.color}">
      <div class="tier-icon" aria-hidden="true">${ICONS.sparkles}</div>
      <div class="tier-info">
        <span class="tier-name">${tierConfig.name} Plan</span>
        <span class="tier-desc">${tierConfig.description}</span>
      </div>
      ${state.tier === 'free' ? `<button aria-label="${t('accessibility.upgrade')}" class="tier-upgrade">Upgrade</button>` : ''}
    </div>

    <!-- Overall Usage Summary -->
    <div class="usage-summary">
      <h2 class="section-title">This Month</h2>
      ${renderOverallUsage()}
    </div>

    <!-- Per-Item Usage -->
    ${state.usage.length > 0 ? renderItemUsage() : renderNoUsage()}
  `;

  // Upgrade button handler
  content.querySelector('.tier-upgrade')?.addEventListener('click', () => {
    closeBillingDashboard();
    // Trigger subscription modal (would be imported from subscription.ui.ts)
    window.dispatchEvent(new CustomEvent('show-subscription-modal'));
  });
}

function renderOverallUsage(): string {
  // Aggregate all usage
  const totalExecutions = state.usage.reduce((sum, u) => sum + u.totals.executions, 0);
  const totalTimeMs = state.usage.reduce((sum, u) => sum + u.totals.executionTimeMs, 0);
  const totalBytes = state.usage.reduce((sum, u) => sum + u.totals.dataTransferBytes, 0);

  const tierConfig = TIER_CONFIG[state.tier];
  const maxExecutions = tierConfig.limit;
  const usagePercent = maxExecutions > 0 ? Math.min(100, (totalExecutions / maxExecutions) * 100) : 0;

  return `
    <div class="usage-cards">
      <div class="usage-card usage-card--main">
        <div class="usage-card-header">
          <span class="usage-card-icon" aria-hidden="true">${ICONS.zap}</span>
          <span class="usage-card-label">Executions</span>
        </div>
        <div class="usage-card-value">${formatNumber(totalExecutions)}</div>
        ${
          maxExecutions > 0
            ? `
          <div class="usage-progress" role="progressbar" aria-valuenow="${usagePercent}" aria-valuemin="0" aria-valuemax="100">
            <div class="usage-progress-bar" style="width: ${usagePercent}%; --bar-color: ${getProgressColor(usagePercent)}"></div>
          </div>
          <div class="usage-card-meta">
            <span>${formatNumber(totalExecutions)} of ${formatNumber(maxExecutions)}</span>
            <span>${(100 - usagePercent).toFixed(0)}% remaining</span>
          </div>
        `
            : `<div class="usage-card-meta"><span class="unlimited">Unlimited</span></div>`
        }
      </div>

      <div class="usage-card">
        <div class="usage-card-header">
          <span class="usage-card-icon" aria-hidden="true">${ICONS.clock}</span>
          <span class="usage-card-label">Time Used</span>
        </div>
        <div class="usage-card-value">${formatDuration(totalTimeMs)}</div>
      </div>

      <div class="usage-card">
        <div class="usage-card-header">
          <span class="usage-card-icon" aria-hidden="true">${ICONS.database}</span>
          <span class="usage-card-label">Data Transfer</span>
        </div>
        <div class="usage-card-value">${formatBytes(totalBytes)}</div>
      </div>
    </div>
  `;
}

function renderItemUsage(): string {
  return `
    <div class="item-usage">
      <h2 class="section-title">By Tool</h2>
      <div class="item-usage-list" role="list">
        ${state.usage.map((usage) => renderUsageItem(usage)).join('')}
      </div>
    </div>
  `;
}

function renderUsageItem(usage: UsageSummary): string {
  const usagePercent = usage.quota.maxExecutions > 0 ? usage.quota.usagePercentage : 0;

  return `
    <article class="usage-item" role="listitem">
      <div class="usage-item-header">
        <span class="usage-item-name">${usage.itemName}</span>
        <span class="usage-item-count">${formatNumber(usage.totals.executions)} uses</span>
      </div>
      ${
        usage.quota.maxExecutions > 0
          ? `
        <div class="usage-item-bar">
          <div
            class="usage-item-fill"
            style="width: ${usagePercent}%; --bar-color: ${getProgressColor(usagePercent)}"
          ></div>
        </div>
      `
          : ''
      }
      <div class="usage-item-meta">
        <span>${formatDuration(usage.totals.executionTimeMs)} total time</span>
        ${usage.quota.resetsAt ? `<span>Resets ${formatResetDate(usage.quota.resetsAt)}</span>` : ''}
      </div>
    </article>
  `;
}

function renderNoUsage(): string {
  return `
    <div class="no-usage">
      <div class="no-usage-icon" aria-hidden="true">${ICONS.activity}</div>
      <h3 class="no-usage-title">No usage yet</h3>
      <p class="no-usage-text">Install and use marketplace tools to see your usage here</p>
    </div>
  `;
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatResetDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return 'tomorrow';
  if (diffDays <= 7) return `in ${diffDays} days`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getProgressColor(percent: number): string {
  if (percent < 50) return 'var(--color-semantic-success)';
  if (percent < 80) return 'var(--color-semantic-warning)';
  return 'var(--color-semantic-error)';
}

// ============================================================================
// USAGE INDICATOR (Mini widget for main UI)
// ============================================================================

/**
 * Create a mini usage indicator for the main UI
 */
export function createUsageIndicator(): HTMLElement {
  const indicator = document.createElement('button');
  indicator.className = 'usage-indicator-mini';
  indicator.setAttribute('aria-label', 'View usage details');

  const updateIndicator = async () => {
    const deviceId = appState.getState().deviceId;
    if (!deviceId) return;

    try {
      const response = await fetch(`/api/marketplace/usage/summary?userId=${encodeURIComponent(deviceId)}`);
      if (response.ok) {
        const data = await response.json();
        const percent = data.usagePercentage || 0;

        indicator.innerHTML = `
          <div class="usage-mini-bar">
            <div class="usage-mini-fill" style="width: ${percent}%; --bar-color: ${getProgressColor(percent)}"></div>
          </div>
          <span class="usage-mini-text">${percent.toFixed(0)}% used</span>
        `;
      }
    } catch (error) {
      log.debug('Could not load usage summary');
    }
  };

  indicator.addEventListener('click', () => {
    void openBillingDashboard();
  });

  void updateIndicator();
  return indicator;
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('billing-dashboard-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'billing-dashboard-styles';
  styleElement.textContent = `
    .billing-dashboard {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .billing-dashboard--visible {
      opacity: 1;
      pointer-events: auto;
    }

    .billing-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .billing-panel {
      position: relative;
      background: var(--color-background-elevated);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      max-width: clamp(420px, 90vw, 600px);
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
    }

    .billing-header {
      padding: var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .billing-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 44px;
      height: 44px;
      border: none;
      background: var(--color-background-secondary);
      border-radius: var(--radius-full);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .billing-close:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .billing-close:focus-visible {
      outline: 2px solid var(--persona-primary);
      outline-offset: 2px;
    }

    .billing-close svg {
      width: 20px;
      height: 20px;
    }

    .billing-title {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1, 4px);
    }

    .billing-subtitle {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: 0;
    }

    .billing-content {
      padding: var(--space-6, 24px);
    }

    /* Tier Banner */
    .tier-banner {
      display: flex;
      align-items: center;
      gap: var(--space-4, 16px);
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--tier-color, var(--persona-ferni)) 0%, var(--color-background-secondary) 100%);
      background-size: 200% 200%;
      border-radius: var(--radius-xl);
      margin-bottom: var(--space-6, 24px);
    }

    .tier-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.2);
      border-radius: var(--radius-lg);
      color: white;
    }

    .tier-icon svg {
      width: 24px;
      height: 24px;
    }

    .tier-info {
      flex: 1;
    }

    .tier-name {
      display: block;
      font-weight: 600;
      color: white;
      font-size: 1.125rem;
    }

    .tier-desc {
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.8);
    }

    .tier-upgrade {
      padding: var(--space-2, 8px) var(--space-4, 16px);
      background: white;
      color: var(--tier-color);
      border: none;
      border-radius: var(--radius-full);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .tier-upgrade:hover {
      transform: scale(1.05);
    }

    .tier-upgrade:focus-visible {
      outline: 2px solid white;
      outline-offset: 2px;
    }

    /* Section Title */
    .section-title {
      font-family: var(--font-display);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-4, 16px);
    }

    /* Usage Cards */
    .usage-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-6, 24px);
    }

    .usage-card {
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg);
    }

    .usage-card--main {
      grid-column: 1 / -1;
    }

    .usage-card-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-2, 8px);
    }

    .usage-card-icon {
      width: 20px;
      height: 20px;
      color: var(--persona-text);
    }

    .usage-card-icon svg {
      width: 100%;
      height: 100%;
    }

    .usage-card-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .usage-card-value {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .usage-card--main .usage-card-value {
      font-size: 2rem;
    }

    .usage-progress {
      height: 8px;
      background: var(--color-background-tertiary);
      border-radius: var(--radius-full);
      margin: var(--space-3, 12px) 0;
      overflow: hidden;
    }

    .usage-progress-bar {
      height: 100%;
      background: var(--bar-color, var(--persona-primary));
      border-radius: var(--radius-full);
      transition: width ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .usage-card-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .unlimited {
      color: var(--color-semantic-success);
      font-weight: 500;
    }

    /* Item Usage */
    .item-usage-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .usage-item {
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg);
    }

    .usage-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-2, 8px);
    }

    .usage-item-name {
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .usage-item-count {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }

    .usage-item-bar {
      height: 6px;
      background: var(--color-background-tertiary);
      border-radius: var(--radius-full);
      margin-bottom: var(--space-2, 8px);
      overflow: hidden;
    }

    .usage-item-fill {
      height: 100%;
      background: var(--bar-color, var(--persona-primary));
      border-radius: var(--radius-full);
    }

    .usage-item-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    /* No Usage */
    .no-usage {
      text-align: center;
      padding: var(--space-10, 40px) var(--space-6, 24px);
    }

    .no-usage-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto var(--space-4, 16px);
      color: var(--color-text-muted);
    }

    .no-usage-icon svg {
      width: 100%;
      height: 100%;
    }

    .no-usage-title {
      font-family: var(--font-display);
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .no-usage-text {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: 0;
    }

    /* Mini Usage Indicator */
    .usage-indicator-mini {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--color-background-secondary);
      border: none;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .usage-indicator-mini:hover {
      background: var(--color-background-tertiary);
    }

    .usage-indicator-mini:focus-visible {
      outline: 2px solid var(--persona-primary);
      outline-offset: 2px;
    }

    .usage-mini-bar {
      width: 40px;
      height: 4px;
      background: var(--color-background-tertiary);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .usage-mini-fill {
      height: 100%;
      background: var(--bar-color, var(--persona-primary));
      border-radius: var(--radius-full);
    }

    .usage-mini-text {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-secondary);
    }

    /* Dark theme */
    @media (prefers-color-scheme: dark) {
      .billing-panel {
        background: var(--color-background-elevated);
      }

      .billing-title,
      .usage-card-value,
      .usage-item-name,
      .no-usage-title {
        color: var(--color-text-primary);
      }

      .billing-subtitle,
      .usage-item-count {
        color: var(--color-text-secondary);
      }
    }

    /* Responsive */
    @media (max-width: clamp(420px, 90vw, 600px)) {
      .usage-cards {
        grid-template-columns: 1fr;
      }

      .usage-card--main {
        grid-column: 1;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const billingUI = {
  init: initBillingUI,
  open: openBillingDashboard,
  close: closeBillingDashboard,
  createIndicator: createUsageIndicator,
};
