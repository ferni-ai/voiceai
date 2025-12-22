/**
 * Marketplace Publisher Portal UI
 *
 * Interface for developers/publishers to submit, manage, and
 * monitor their marketplace tools and agents.
 *
 * Features:
 * - Submit new tools/agents for review
 * - Manage existing submissions
 * - View analytics and performance
 * - Track revenue and payouts
 *
 * DESIGN PRINCIPLES:
 *   - Professional yet warm (building together)
 *   - Clear status indicators
 *   - Actionable analytics
 *
 * ACCESSIBILITY (WCAG AA):
 *   - Full keyboard navigation
 *   - Screen reader announcements
 *   - Focus management
 *   - Respects prefers-reduced-motion
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, STAGGER } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { toast } from './toast.ui.js';

// Use TIGHT for fast staggered animations
const STAGGER_FAST = STAGGER.TIGHT;

const log = createLogger('PublisherPortalUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface PublisherProfile {
  publisherId: string;
  publisherName: string;
  verified: boolean;
  email?: string;
  stats: {
    totalTools: number;
    totalAgents: number;
    approvedItems: number;
    pendingItems: number;
  };
}

export interface PublisherItem {
  id: string;
  name: string;
  type: 'tool' | 'agent';
  version: string;
  status: 'pending_review' | 'approved' | 'rejected';
  trustLevel: string;
  publishedAt?: string;
  stats?: {
    installs: number;
    executions: number;
    successRate: number;
    revenue: number;
  };
}

export interface PublisherAnalytics {
  itemId: string;
  period: string;
  metrics: {
    totalInstalls: number;
    activeInstalls: number;
    totalExecutions: number;
    successRate: number;
    avgExecutionTimeMs: number;
    errorCount: number;
    uniqueUsers: number;
  };
  revenue?: {
    totalCents: number;
    periodCents: number;
    currency: string;
  };
  topErrors: Array<{
    code: string;
    count: number;
    lastOccurred: string;
  }>;
}

interface PortalState {
  profile: PublisherProfile | null;
  items: PublisherItem[];
  loading: boolean;
  activeTab: 'items' | 'analytics' | 'submit';
  selectedItem: PublisherItem | null;
}

// ============================================================================
// ICONS (Lucide-style)
// ============================================================================

const ICONS = {
  close:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  clock:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  alertCircle:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  plus: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  upload:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  barChart:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  box: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
  tool: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  bot: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>',
  dollarSign:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  users:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  activity:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  loader:
    '<svg aria-hidden="true" class="publisher-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
};

// Status badges
type ItemStatus = 'pending_review' | 'approved' | 'rejected';

const STATUS_CONFIG: Record<ItemStatus, { label: string; color: string; icon: string }> = {
  pending_review: { label: 'In Review', color: 'var(--color-semantic-warning)', icon: ICONS.clock },
  approved: { label: 'Live', color: 'var(--color-semantic-success)', icon: ICONS.check },
  rejected: { label: 'Rejected', color: 'var(--color-semantic-error)', icon: ICONS.alertCircle },
};

const DEFAULT_STATUS = STATUS_CONFIG.pending_review;

// ============================================================================
// STATE
// ============================================================================

const state: PortalState = {
  profile: null,
  items: [],
  loading: false,
  activeTab: 'items',
  selectedItem: null,
};

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;

// Publisher session (would come from auth in production)
let publisherSession: { id: string; name: string } | null = null;

// ============================================================================
// ACCESSIBILITY HELPERS
// ============================================================================

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getAnimationDuration(baseDuration: number): number {
  return prefersReducedMotion() ? 0 : baseDuration;
}

function announceToScreenReader(message: string): void {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  announcer.textContent = message;
  document.body.appendChild(announcer);
  trackedTimeout(() => announcer.remove(), 1000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initPublisherPortalUI(): void {
  cleanupOrphanedElements();
  injectStyles();
  log.debug('Publisher Portal UI initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.publisher-portal').forEach((el) => el.remove());
  document.querySelectorAll('#publisher-portal-styles').forEach((el) => el.remove());
}

// ============================================================================
// MAIN VIEW
// ============================================================================

/**
 * Open the publisher portal
 */
export async function openPublisherPortal(session?: { id: string; name: string }): Promise<void> {
  if (session) {
    publisherSession = session;
  }

  if (!publisherSession) {
    toast.error('Sign in as a publisher first');
    return;
  }

  state.loading = true;

  container = createPortalContainer();
  document.body.appendChild(container);

  requestAnimationFrame(() => {
    container?.classList.add('publisher-portal--visible');
  });

  await loadPublisherData();
  renderPortal();
  state.loading = false;
}

/**
 * Close the publisher portal
 */
export function closePublisherPortal(): void {
  if (!container) return;

  container.classList.remove('publisher-portal--visible');
  trackedTimeout(() => {
    container?.remove();
    container = null;
  }, getAnimationDuration(DURATION.SLOW));
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadPublisherData(): Promise<void> {
  if (!publisherSession) return;

  try {
    const headers = {
      'x-publisher-id': publisherSession.id,
      'x-publisher-name': publisherSession.name,
    };

    // Load profile and items in parallel
    const [profileRes, itemsRes] = await Promise.all([
      fetch('/api/marketplace/publisher/profile', { headers }),
      fetch('/api/marketplace/publisher/items', { headers }),
    ]);

    if (profileRes.ok) {
      state.profile = await profileRes.json();
    }

    if (itemsRes.ok) {
      const data = await itemsRes.json();
      state.items = data.items || [];
    }

    log.debug('Publisher data loaded:', { items: state.items.length });
  } catch (error) {
    log.warn('Failed to load publisher data:', error);
    toast.error("Couldn't load your data. Try again?");
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function createPortalContainer(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'publisher-portal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Publisher Portal');

  el.innerHTML = `
    <div class="publisher-backdrop" aria-hidden="true"></div>
    <div class="publisher-panel">
      <header class="publisher-header">
        <button class="publisher-close" aria-label="${t('accessibility.closePublisher')}">
          ${ICONS.close}
        </button>
        <h1 class="publisher-title">Publisher Portal</h1>
        <p class="publisher-subtitle">Manage your tools and agents</p>
      </header>

      <nav class="publisher-tabs" role="tablist" aria-label="${t('accessibility.portalSections')}">
        <button aria-label="My Items"
          role="tab"
          class="publisher-tab ${state.activeTab === 'items' ? 'publisher-tab--active' : ''}"
          data-tab="items"
          aria-selected="${state.activeTab === 'items'}"
        >
          ${ICONS.box} My Items
        </button>
        <button aria-label="Analytics"
          role="tab"
          class="publisher-tab ${state.activeTab === 'analytics' ? 'publisher-tab--active' : ''}"
          data-tab="analytics"
          aria-selected="${state.activeTab === 'analytics'}"
        >
          ${ICONS.barChart} Analytics
        </button>
        <button aria-label="Add"
          role="tab"
          class="publisher-tab ${state.activeTab === 'submit' ? 'publisher-tab--active' : ''}"
          data-tab="submit"
          aria-selected="${state.activeTab === 'submit'}"
        >
          ${ICONS.plus} Submit New
        </button>
      </nav>

      <main class="publisher-content" role="tabpanel">
        <!-- Content rendered here -->
      </main>
    </div>
  `;

  // Event handlers
  el.querySelector('.publisher-backdrop')?.addEventListener('click', closePublisherPortal);
  el.querySelector('.publisher-close')?.addEventListener('click', closePublisherPortal);

  el.querySelectorAll('.publisher-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab as 'items' | 'analytics' | 'submit';
      state.activeTab = tabName;
      renderPortal();
    });
  });

  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePublisherPortal();
  });

  return el;
}

function renderPortal(): void {
  if (!container) return;

  // Update tab states
  container.querySelectorAll('.publisher-tab').forEach((tab) => {
    const tabName = (tab as HTMLElement).dataset.tab;
    const isActive = tabName === state.activeTab;
    tab.classList.toggle('publisher-tab--active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  // Render content based on active tab
  const content = container.querySelector('.publisher-content');
  if (!content) return;

  switch (state.activeTab) {
    case 'items':
      renderItemsList(content);
      break;
    case 'analytics':
      renderAnalytics(content);
      break;
    case 'submit':
      renderSubmitForm(content);
      break;
  }
}

function renderItemsList(content: Element): void {
  if (state.items.length === 0) {
    content.innerHTML = `
      <div class="publisher-empty">
        <div class="publisher-empty-icon" aria-hidden="true">${ICONS.box}</div>
        <h3 class="publisher-empty-title">No items yet</h3>
        <p class="publisher-empty-text">Submit your first tool or agent to get started</p>
        <button aria-label="Add" class="publisher-button publisher-button--primary" data-action="submit">
          ${ICONS.plus} Submit New Item
        </button>
      </div>
    `;

    content.querySelector('[data-action="submit"]')?.addEventListener('click', () => {
      state.activeTab = 'submit';
      renderPortal();
    });
    return;
  }

  content.innerHTML = `
    <div class="publisher-stats-bar">
      <div class="stat-card">
        <span class="stat-value">${state.profile?.stats.approvedItems || 0}</span>
        <span class="stat-label">Live</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${state.profile?.stats.pendingItems || 0}</span>
        <span class="stat-label">In Review</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${state.profile?.stats.totalTools || 0}</span>
        <span class="stat-label">Tools</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${state.profile?.stats.totalAgents || 0}</span>
        <span class="stat-label">Agents</span>
      </div>
    </div>

    <div class="publisher-items-list" role="list">
      ${state.items.map((item, i) => renderItemCard(item, i)).join('')}
    </div>
  `;

  // Item click handlers
  content.querySelectorAll('.publisher-item').forEach((card) => {
    card.addEventListener('click', () => {
      const itemId = (card as HTMLElement).dataset.itemId;
      const item = state.items.find((i) => i.id === itemId);
      if (item) {
        state.selectedItem = item;
        state.activeTab = 'analytics';
        renderPortal();
      }
    });
  });
}

function renderItemCard(item: PublisherItem, index: number): string {
  const isValidStatus = (s: string): s is ItemStatus => s in STATUS_CONFIG;
  const statusConfig = isValidStatus(item.status) ? STATUS_CONFIG[item.status] : DEFAULT_STATUS;

  return `
    <article
      class="publisher-item"
      data-item-id="${item.id}"
      style="animation-delay: ${prefersReducedMotion() ? 0 : index * STAGGER_FAST}ms"
      tabindex="0"
      role="button"
      aria-label="${item.name}, ${item.type}, ${statusConfig.label}"
    >
      <div class="item-icon" aria-hidden="true">
        ${item.type === 'agent' ? ICONS.bot : ICONS.tool}
      </div>
      <div class="item-info">
        <h3 class="item-name">${item.name}</h3>
        <p class="item-meta">v${item.version} • ${item.type}</p>
      </div>
      <div class="item-status" style="--status-color: ${statusConfig.color}">
        ${statusConfig.icon}
        <span>${statusConfig.label}</span>
      </div>
      ${
        item.stats
          ? `
        <div class="item-metrics">
          <span class="metric">${ICONS.users} ${formatNumber(item.stats.installs)}</span>
          <span class="metric">${ICONS.activity} ${item.stats.successRate.toFixed(0)}%</span>
        </div>
      `
          : ''
      }
    </article>
  `;
}

function renderAnalytics(content: Element): void {
  if (!state.selectedItem) {
    content.innerHTML = `
      <div class="publisher-empty">
        <div class="publisher-empty-icon" aria-hidden="true">${ICONS.barChart}</div>
        <h3 class="publisher-empty-title">Select an item</h3>
        <p class="publisher-empty-text">Choose an item from "My Items" to view its analytics</p>
      </div>
    `;
    return;
  }

  const item = state.selectedItem;

  content.innerHTML = `
    <div class="analytics-header">
      <button class="analytics-back" aria-label="${t('accessibility.backToItems')}">
        ← Back
      </button>
      <h2 class="analytics-title">${item.name}</h2>
      <span class="analytics-subtitle">v${item.version}</span>
    </div>

    <div class="analytics-period">
      <button aria-label="7 days" class="period-button period-button--active" data-period="7d">7 days</button>
      <button aria-label="30 days" class="period-button" data-period="30d">30 days</button>
      <button aria-label="90 days" class="period-button" data-period="90d">90 days</button>
    </div>

    <div class="analytics-grid">
      <div class="analytics-card">
        <div class="analytics-card-icon" aria-hidden="true">${ICONS.users}</div>
        <div class="analytics-card-content">
          <span class="analytics-card-value">${formatNumber(item.stats?.installs || 0)}</span>
          <span class="analytics-card-label">Total Installs</span>
        </div>
      </div>
      <div class="analytics-card">
        <div class="analytics-card-icon" aria-hidden="true">${ICONS.activity}</div>
        <div class="analytics-card-content">
          <span class="analytics-card-value">${formatNumber(item.stats?.executions || 0)}</span>
          <span class="analytics-card-label">Executions</span>
        </div>
      </div>
      <div class="analytics-card">
        <div class="analytics-card-icon" aria-hidden="true">${ICONS.check}</div>
        <div class="analytics-card-content">
          <span class="analytics-card-value">${(item.stats?.successRate || 100).toFixed(1)}%</span>
          <span class="analytics-card-label">Success Rate</span>
        </div>
      </div>
      <div class="analytics-card">
        <div class="analytics-card-icon" aria-hidden="true">${ICONS.dollarSign}</div>
        <div class="analytics-card-content">
          <span class="analytics-card-value">$${((item.stats?.revenue || 0) / 100).toFixed(2)}</span>
          <span class="analytics-card-label">Revenue (80%)</span>
        </div>
      </div>
    </div>

    <div class="analytics-chart-placeholder">
      <p>Usage chart coming soon</p>
    </div>
  `;

  content.querySelector('.analytics-back')?.addEventListener('click', () => {
    state.selectedItem = null;
    state.activeTab = 'items';
    renderPortal();
  });
}

function renderSubmitForm(content: Element): void {
  content.innerHTML = `
    <form class="submit-form" aria-label="${t('accessibility.submitNewItem')}">
      <div class="form-section">
        <h3 class="form-section-title">Basic Information</h3>

        <div class="form-group">
          <label for="item-type" class="form-label">Type</label>
          <div class="form-radio-group">
            <label class="form-radio">
              <input type="radio" name="type" value="tool" checked />
              <span class="radio-label">${ICONS.tool} Tool</span>
            </label>
            <label class="form-radio">
              <input type="radio" name="type" value="agent" />
              <span class="radio-label">${ICONS.bot} Agent</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="item-id" class="form-label">ID</label>
          <input
            type="text"
            id="item-id"
            name="id"
            class="form-input"
            placeholder="${t('placeholders.toolIdExample')}"
            pattern="^[a-z0-9-]+$"
            required
          />
          <span class="form-hint">Lowercase letters, numbers, and hyphens only</span>
        </div>

        <div class="form-group">
          <label for="item-name" class="form-label">Display Name</label>
          <input
            type="text"
            id="item-name"
            name="name"
            class="form-input"
            placeholder="${t('placeholders.toolNameExample')}"
            required
          />
        </div>

        <div class="form-group">
          <label for="item-version" class="form-label">Version</label>
          <input
            type="text"
            id="item-version"
            name="version"
            class="form-input"
            placeholder="${t('placeholders.versionExample')}"
            pattern="^\\d+\\.\\d+\\.\\d+$"
            required
          />
        </div>

        <div class="form-group">
          <label for="item-description" class="form-label">Description</label>
          <textarea
            id="item-description"
            name="description"
            class="form-textarea"
            placeholder="${t('placeholders.toolDescription')}"
            rows="3"
            required
          ></textarea>
        </div>
      </div>

      <div class="form-section">
        <h3 class="form-section-title">Pricing</h3>

        <div class="form-group">
          <label class="form-label">Pricing Model</label>
          <div class="form-radio-group form-radio-group--vertical">
            <label class="form-radio">
              <input type="radio" name="pricing" value="free" checked />
              <span class="radio-label">Free</span>
            </label>
            <label class="form-radio">
              <input type="radio" name="pricing" value="usage-based" />
              <span class="radio-label">Pay per use</span>
            </label>
            <label class="form-radio">
              <input type="radio" name="pricing" value="subscription" />
              <span class="radio-label">Subscription</span>
            </label>
          </div>
        </div>
      </div>

      <div class="form-actions" role="button" tabindex="0">
        <button aria-label="Cancel" type="button" class="publisher-button publisher-button--secondary" data-action="cancel">
          Cancel
        </button>
        <button aria-label="Upload" type="submit" class="publisher-button publisher-button--primary">
          ${ICONS.upload} Submit for Review
        </button>
      </div>

      <p class="form-note">
        Submissions are reviewed within 2-5 business days. You'll receive an email when your item is approved.
      </p>
    </form>
  `;

  const form = content.querySelector('.submit-form') as HTMLFormElement;

  form?.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
    state.activeTab = 'items';
    renderPortal();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSubmission(form);
  });
}

// ============================================================================
// SUBMISSION HANDLING
// ============================================================================

async function handleSubmission(form: HTMLFormElement): Promise<void> {
  if (!publisherSession) return;

  const formData = new FormData(form);
  const submitButton = form.querySelector('[type="submit"]') as HTMLButtonElement;

  submitButton.disabled = true;
  submitButton.innerHTML = `${ICONS.loader} Submitting...`;

  const type = formData.get('type') as 'tool' | 'agent';
  const id = formData.get('id') as string;
  const name = formData.get('name') as string;
  const version = formData.get('version') as string;
  const description = formData.get('description') as string;
  const pricing = formData.get('pricing') as string;

  // Build manifest based on type
  const baseManifest = {
    manifestVersion: '1.0.0' as const,
    id,
    name,
    version,
    publisher: {
      id: publisherSession.id,
      name: publisherSession.name,
      verified: false,
    },
    description: {
      short: description,
      long: description,
    },
    verification: {
      trustLevel: 'community' as const,
      verified: false,
    },
    licensing: {
      type: 'open-source' as const,
      pricing: { model: pricing as 'free' | 'usage-based' | 'subscription' },
    },
  };

  const manifest =
    type === 'tool'
      ? {
          ...baseManifest,
          execution: { runtime: { type: 'http' as const } },
          interface: {
            llmDescription: description,
            input: { type: 'object' as const, properties: {} },
            output: { type: 'object' as const },
          },
        }
      : {
          ...baseManifest,
          displayName: name,
          metadata: { category: 'general', tags: [] },
          permissions: { required: [], optional: [] },
          persona: {
            voice: { provider: 'cartesia' as const, voiceId: '' },
            personality: { warmth: 0.8, humorLevel: 0.5, description: '' },
          },
        };

  try {
    const response = await fetch('/api/marketplace/publisher/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-publisher-id': publisherSession.id,
        'x-publisher-name': publisherSession.name,
      },
      body: JSON.stringify({ type, manifest }),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      toast.success(`${name} submitted for review!`);
      announceToScreenReader(`Successfully submitted ${name} for review`);

      // Reload data and switch to items
      await loadPublisherData();
      state.activeTab = 'items';
      renderPortal();
    } else {
      toast.error(result.error || "Submission didn't go through. Try again?");
      if (result.validationErrors) {
        log.warn('Validation errors:', result.validationErrors);
      }
    }
  } catch (error) {
    log.error('Submission failed:', error);
    toast.error("Hmm, that didn't work. Try again?");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = `${ICONS.upload} Submit for Review`;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('publisher-portal-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'publisher-portal-styles';
  styleElement.textContent = `
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

    .publisher-portal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .publisher-portal--visible {
      opacity: 1;
      pointer-events: auto;
    }

    .publisher-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.7);
      backdrop-filter: blur(var(--glass-blur-modal, 20px));
    }

    .publisher-panel {
      position: relative;
      width: 100%;
      max-width: min(900px, 100%);
      margin: 0 auto;
      background: var(--color-background-elevated, #FFFDFB);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    @media (min-width: clamp(538px, 90vw, 768px)) {
      .publisher-panel {
        margin: var(--space-8, 32px) auto;
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl);
        max-height: calc(100vh - 64px);
      }
    }

    .publisher-header {
      padding: var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .publisher-close {
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

    .publisher-close:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .publisher-close:focus-visible {
      outline: 2px solid var(--persona-primary);
      outline-offset: 2px;
    }

    .publisher-close svg {
      width: 20px;
      height: 20px;
    }

    .publisher-title {
      font-family: var(--font-display);
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1, 4px);
    }

    .publisher-subtitle {
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
      margin: 0;
    }

    /* Tabs */
    .publisher-tabs {
      display: flex;
      gap: var(--space-1, 4px);
      padding: var(--space-2, 8px) var(--space-6, 24px);
      background: var(--color-background-secondary);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .publisher-tab {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-4, 16px);
      border: none;
      background: transparent;
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .publisher-tab:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .publisher-tab--active {
      background: var(--persona-tint);
      color: var(--persona-primary);
    }

    .publisher-tab:focus-visible {
      outline: 2px solid var(--persona-primary);
      outline-offset: -2px;
    }

    .publisher-tab svg {
      width: 18px;
      height: 18px;
    }

    /* Content */
    .publisher-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6, 24px);
    }

    /* Stats Bar */
    .publisher-stats-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-6, 24px);
    }

    .stat-card {
      text-align: center;
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg);
    }

    .stat-value {
      display: block;
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    /* Items List */
    .publisher-items-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .publisher-item {
      display: flex;
      align-items: center;
      gap: var(--space-4, 16px);
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-xl);
      cursor: pointer;
      border: 2px solid transparent;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
      opacity: 0;
      animation: publisher-item-in ${DURATION.SLOW}ms ${EASING.SPRING} forwards;
    }

    @media (prefers-reduced-motion: reduce) {
      .publisher-item {
        opacity: 1;
        animation: none;
      }
    }

    @keyframes publisher-item-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .publisher-item:hover {
      border-color: var(--persona-primary);
    }

    .publisher-item:focus-visible {
      outline: none;
      border-color: var(--persona-primary);
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .item-icon {
      width: 48px;
      height: 48px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--persona-tint);
      border-radius: var(--radius-lg);
      color: var(--persona-primary);
    }

    .item-icon svg {
      width: 24px;
      height: 24px;
    }

    .item-info {
      flex: 1;
    }

    .item-name {
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1, 4px);
    }

    .item-meta {
      font-size: 0.875rem;
      color: var(--color-text-muted);
      margin: 0;
    }

    .item-status {
      display: flex;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-1, 4px) var(--space-2, 8px);
      background: rgba(0, 0, 0, 0.05);
      border-radius: var(--radius-full);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--status-color);
    }

    .item-status svg {
      width: 14px;
      height: 14px;
    }

    .item-metrics {
      display: flex;
      gap: var(--space-3, 12px);
    }

    .metric {
      display: flex;
      align-items: center;
      gap: var(--space-1, 4px);
      font-size: 0.875rem;
      color: var(--color-text-muted);
    }

    .metric svg {
      width: 14px;
      height: 14px;
    }

    /* Empty State */
    .publisher-empty {
      text-align: center;
      padding: var(--space-12, 48px) var(--space-6, 24px);
    }

    .publisher-empty-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-4, 16px);
      color: var(--color-text-muted);
    }

    .publisher-empty-icon svg {
      width: 100%;
      height: 100%;
    }

    .publisher-empty-title {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .publisher-empty-text {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-6, 24px);
    }

    /* Buttons */
    .publisher-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      min-height: 44px;
      padding: var(--space-3, 12px) var(--space-5, 20px);
      border-radius: var(--radius-lg);
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .publisher-button svg {
      width: 18px;
      height: 18px;
    }

    .publisher-button--primary {
      background: var(--persona-primary);
      color: white;
      border: none;
    }

    .publisher-button--primary:hover:not(:disabled) {
      background: var(--persona-secondary);
    }

    .publisher-button--primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .publisher-button--primary:focus-visible {
      outline: 2px solid var(--persona-primary);
      outline-offset: 2px;
    }

    .publisher-button--secondary {
      background: transparent;
      color: var(--color-text-secondary);
      border: 2px solid var(--color-border-medium);
    }

    .publisher-button--secondary:hover {
      background: var(--color-background-secondary);
      border-color: var(--color-text-secondary);
    }

    /* Analytics */
    .analytics-header {
      display: flex;
      align-items: center;
      gap: var(--space-4, 16px);
      margin-bottom: var(--space-4, 16px);
    }

    .analytics-back {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      border: none;
      background: var(--color-background-secondary);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      cursor: pointer;
    }

    .analytics-back:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .analytics-title {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }

    .analytics-subtitle {
      font-size: 0.875rem;
      color: var(--color-text-muted);
    }

    .analytics-period {
      display: flex;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-6, 24px);
    }

    .period-button {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      border: none;
      background: var(--color-background-secondary);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      cursor: pointer;
    }

    .period-button--active {
      background: var(--persona-tint);
      color: var(--persona-primary);
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--space-4, 16px);
      margin-bottom: var(--space-6, 24px);
    }

    .analytics-card {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg);
    }

    .analytics-card-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--persona-tint);
      border-radius: var(--radius-md);
      color: var(--persona-primary);
    }

    .analytics-card-icon svg {
      width: 20px;
      height: 20px;
    }

    .analytics-card-value {
      display: block;
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .analytics-card-label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .analytics-chart-placeholder {
      padding: var(--space-12, 48px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg);
      text-align: center;
      color: var(--color-text-muted);
    }

    /* Submit Form */
    .submit-form {
      max-width: clamp(420px, 90vw, 600px);
    }

    .form-section {
      margin-bottom: var(--space-8, 32px);
    }

    .form-section-title {
      font-family: var(--font-display);
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-4, 16px);
    }

    .form-group {
      margin-bottom: var(--space-4, 16px);
    }

    .form-label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text-primary);
      margin-bottom: var(--space-2, 8px);
    }

    .form-input,
    .form-textarea {
      width: 100%;
      padding: var(--space-3, 12px);
      border: 2px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      background: var(--color-background-primary);
      font-size: 0.9375rem;
      color: var(--color-text-primary);
      transition: border-color ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .form-input:focus,
    .form-textarea:focus {
      outline: none;
      border-color: var(--persona-primary);
    }

    .form-textarea {
      resize: vertical;
      min-height: 80px;
    }

    .form-hint {
      display: block;
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-top: var(--space-1, 4px);
    }

    .form-radio-group {
      display: flex;
      gap: var(--space-4, 16px);
    }

    .form-radio-group--vertical {
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .form-radio {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      cursor: pointer;
    }

    .form-radio input {
      width: 18px;
      height: 18px;
      accent-color: var(--persona-primary);
    }

    .radio-label {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.9375rem;
      color: var(--color-text-primary);
    }

    .radio-label svg {
      width: 18px;
      height: 18px;
      color: var(--color-text-muted);
    }

    .form-actions {
      display: flex;
      gap: var(--space-3, 12px);
      margin-top: var(--space-6, 24px);
    }

    .form-note {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-top: var(--space-4, 16px);
    }

    /* Spinner */
    .publisher-spinner {
      animation: publisher-spin 1s linear infinite;
    }

    @keyframes publisher-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (prefers-reduced-motion: reduce) {
      .publisher-spinner {
        animation: none;
      }
    }

    /* Dark theme */
    @media (prefers-color-scheme: dark) {
      .publisher-panel {
        background: var(--color-background-elevated, #3a3330);
      }

      .publisher-tabs {
        background: var(--color-background-secondary, #4a4540);
      }

      .publisher-title,
      .item-name,
      .analytics-title,
      .stat-value,
      .analytics-card-value {
        color: var(--color-text-primary, #faf6f0);
      }

      .publisher-subtitle,
      .item-meta {
        color: var(--color-text-secondary, #e8e2da);
      }
    }

    /* Responsive */
    @media (max-width: clamp(538px, 90vw, 768px)) {
      .publisher-stats-bar {
        grid-template-columns: repeat(2, 1fr);
      }

      .analytics-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const publisherPortalUI = {
  init: initPublisherPortalUI,
  open: openPublisherPortal,
  close: closePublisherPortal,
};
