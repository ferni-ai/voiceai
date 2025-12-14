/**
 * Marketplace Admin Review Queue UI
 *
 * Admin interface for reviewing and moderating marketplace submissions.
 *
 * Features:
 * - View pending tool/agent submissions
 * - Approve or reject with reasons
 * - Moderate user reviews
 * - View marketplace statistics
 *
 * DESIGN PRINCIPLES:
 *   - Clear, actionable queue
 *   - Easy approve/reject flow
 *   - Full context for decisions
 *
 * ACCESSIBILITY (WCAG AA):
 *   - Full keyboard navigation
 *   - Screen reader announcements
 *   - Focus management
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';

const log = createLogger('MarketplaceAdminUI');

// ============================================================================
// TYPES
// ============================================================================

interface QueueItem {
  id: string;
  type: 'tool' | 'agent';
  name: string;
  displayName?: string;
  version: string;
  publisher: {
    id: string;
    name: string;
    verified: boolean;
  };
  description: string;
  submittedAt: string;
  trustLevel: string;
  permissions: {
    required: number;
    optional: number;
  };
  category: string;
  tags: string[];
}

interface PendingReview {
  id: string;
  itemId: string;
  userName?: string;
  rating: number;
  title?: string;
  body: string;
  createdAt: string;
  status: string;
}

interface AdminState {
  queue: QueueItem[];
  pendingReviews: PendingReview[];
  stats: {
    items: { total: number; verified: number; pending: number };
    pendingReviews: number;
  };
  loading: boolean;
  activeTab: 'queue' | 'reviews' | 'stats';
  selectedItem: QueueItem | null;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  barChart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
};

// ============================================================================
// STATE
// ============================================================================

const state: AdminState = {
  queue: [],
  pendingReviews: [],
  stats: {
    items: { total: 0, verified: 0, pending: 0 },
    pendingReviews: 0,
  },
  loading: false,
  activeTab: 'queue',
  selectedItem: null,
};

let container: HTMLElement | null = null;

// Admin credentials (would come from auth in production)
let adminSession: { id: string; name: string } | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.marketplace-admin-panel').forEach((el) => el.remove());
  document.querySelectorAll('#marketplace-admin-styles').forEach((el) => el.remove());
}

// ============================================================================
// MAIN VIEW
// ============================================================================

/**
 * Open the admin review queue
 */
export async function openAdminQueue(session: { id: string; name: string }): Promise<void> {
  adminSession = session;
  state.loading = true;

  cleanupOrphanedElements();
  injectStyles();

  container = createContainer();
  document.body.appendChild(container);

  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });

  await loadData();
  renderPanel();
  state.loading = false;
}

/**
 * Close the admin panel
 */
export function closeAdminQueue(): void {
  if (!container) return;

  container.classList.remove('visible');
  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.SLOW);
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData(): Promise<void> {
  if (!adminSession) return;

  const headers = {
    'x-admin-id': adminSession.id,
    'x-admin-name': adminSession.name,
  };

  try {
    const [queueRes, reviewsRes, statsRes] = await Promise.all([
      fetch('/api/admin/marketplace/queue', { headers }),
      fetch('/api/admin/marketplace/reviews/pending', { headers }),
      fetch('/api/admin/marketplace/stats', { headers }),
    ]);

    if (queueRes.ok) {
      const data = await queueRes.json();
      state.queue = data.queue || [];
    }

    if (reviewsRes.ok) {
      const data = await reviewsRes.json();
      state.pendingReviews = data.reviews || [];
    }

    if (statsRes.ok) {
      const data = await statsRes.json();
      state.stats = data.stats || state.stats;
    }

    log.debug('Admin data loaded:', {
      queue: state.queue.length,
      reviews: state.pendingReviews.length,
    });
  } catch (error) {
    log.error('Failed to load admin data:', error);
    toast.error('Failed to load review queue');
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'marketplace-admin-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Marketplace Admin');

  el.innerHTML = `
    <div class="admin-backdrop"></div>
    <div class="admin-panel">
      <header class="admin-header">
        <button class="admin-close" aria-label="${t('accessibility.closeAdmin')}">
          ${ICONS.close}
        </button>
        <h1 class="admin-title">Marketplace Admin</h1>
        <p class="admin-subtitle">Review submissions and moderate content</p>
      </header>

      <nav class="admin-tabs" role="tablist">
        <button role="tab" class="admin-tab admin-tab--active" data-tab="queue">
          ${ICONS.clock} Review Queue
          <span class="tab-badge">${state.queue.length}</span>
        </button>
        <button role="tab" class="admin-tab" data-tab="reviews">
          ${ICONS.star} Reviews
          <span class="tab-badge">${state.pendingReviews.length}</span>
        </button>
        <button role="tab" class="admin-tab" data-tab="stats">
          ${ICONS.barChart} Stats
        </button>
      </nav>

      <main class="admin-content"></main>
    </div>
  `;

  // Event listeners
  el.querySelector('.admin-backdrop')?.addEventListener('click', closeAdminQueue);
  el.querySelector('.admin-close')?.addEventListener('click', closeAdminQueue);

  el.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab as 'queue' | 'reviews' | 'stats';
      state.activeTab = tabName;
      updateTabs();
      renderPanel();
    });
  });

  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeAdminQueue();
  });

  return el;
}

function updateTabs(): void {
  if (!container) return;

  container.querySelectorAll('.admin-tab').forEach((tab) => {
    const tabName = (tab as HTMLElement).dataset.tab;
    tab.classList.toggle('admin-tab--active', tabName === state.activeTab);
    tab.setAttribute('aria-selected', String(tabName === state.activeTab));
  });
}

function renderPanel(): void {
  if (!container) return;

  const content = container.querySelector('.admin-content');
  if (!content) return;

  switch (state.activeTab) {
    case 'queue':
      renderQueue(content);
      break;
    case 'reviews':
      renderReviews(content);
      break;
    case 'stats':
      renderStats(content);
      break;
  }
}

function renderQueue(content: Element): void {
  if (state.queue.length === 0) {
    content.innerHTML = `
      <div class="admin-empty">
        <div class="empty-icon">${ICONS.check}</div>
        <h3>All caught up!</h3>
        <p>No items pending review</p>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="queue-list" role="list">
      ${state.queue.map((item) => renderQueueItem(item)).join('')}
    </div>
  `;

  // Add action listeners
  content.querySelectorAll('[data-action="approve"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const itemId = (e.currentTarget as HTMLElement).dataset.itemId;
      if (itemId) void handleApprove(itemId);
    });
  });

  content.querySelectorAll('[data-action="reject"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const itemId = (e.currentTarget as HTMLElement).dataset.itemId;
      if (itemId) void handleReject(itemId);
    });
  });
}

function renderQueueItem(item: QueueItem): string {
  const typeIcon = item.type === 'agent' ? ICONS.bot : ICONS.tool;
  const timeAgo = formatTimeAgo(item.submittedAt);

  return `
    <article class="queue-item" data-item-id="${item.id}">
      <div class="queue-item-header">
        <div class="item-icon ${item.type}">${typeIcon}</div>
        <div class="item-info">
          <h3 class="item-name">${item.displayName || item.name}</h3>
          <p class="item-meta">
            ${item.type} • v${item.version} • by ${item.publisher.name}
            ${item.publisher.verified ? '<span class="verified-badge">✓</span>' : ''}
          </p>
        </div>
        <div class="item-trust" data-trust="${item.trustLevel}">
          ${ICONS.shield}
          ${item.trustLevel}
        </div>
      </div>

      <p class="item-description">${item.description}</p>

      <div class="item-details">
        <span class="detail">
          <strong>${item.permissions.required}</strong> required permissions
        </span>
        <span class="detail">
          <strong>${item.permissions.optional}</strong> optional
        </span>
        <span class="detail">
          ${item.category}
        </span>
        <span class="detail time">
          ${timeAgo}
        </span>
      </div>

      <div class="item-tags">
        ${item.tags
          .slice(0, 5)
          .map((tag) => `<span class="tag">${tag}</span>`)
          .join('')}
      </div>

      <div class="item-actions">
        <button class="action-btn action-btn--reject" data-action="reject" data-item-id="${item.id}">
          ${ICONS.x} Reject
        </button>
        <button class="action-btn action-btn--approve" data-action="approve" data-item-id="${item.id}">
          ${ICONS.check} Approve
        </button>
      </div>
    </article>
  `;
}

function renderReviews(content: Element): void {
  if (state.pendingReviews.length === 0) {
    content.innerHTML = `
      <div class="admin-empty">
        <div class="empty-icon">${ICONS.check}</div>
        <h3>All reviews moderated!</h3>
        <p>No reviews pending moderation</p>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="reviews-list" role="list">
      ${state.pendingReviews.map((review) => renderReviewItem(review)).join('')}
    </div>
  `;

  // Add action listeners
  content.querySelectorAll('[data-action="approve-review"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const reviewId = (e.currentTarget as HTMLElement).dataset.reviewId;
      if (reviewId) void handleModerateReview(reviewId, 'approved');
    });
  });

  content.querySelectorAll('[data-action="reject-review"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const reviewId = (e.currentTarget as HTMLElement).dataset.reviewId;
      if (reviewId) void handleModerateReview(reviewId, 'rejected');
    });
  });
}

function renderReviewItem(review: PendingReview): string {
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

  return `
    <article class="review-item" data-review-id="${review.id}">
      <div class="review-header">
        <span class="review-rating">${stars}</span>
        <span class="review-author">${review.userName || 'Anonymous'}</span>
        <span class="review-time">${formatTimeAgo(review.createdAt)}</span>
      </div>
      ${review.title ? `<h4 class="review-title">${review.title}</h4>` : ''}
      <p class="review-body">${review.body}</p>
      <div class="review-actions">
        <button class="action-btn action-btn--reject" data-action="reject-review" data-review-id="${review.id}">
          Reject
        </button>
        <button class="action-btn action-btn--approve" data-action="approve-review" data-review-id="${review.id}">
          Approve
        </button>
      </div>
    </article>
  `;
}

function renderStats(content: Element): void {
  content.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${state.stats.items.total}</div>
        <div class="stat-label">Total Items</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.stats.items.verified}</div>
        <div class="stat-label">Verified</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.stats.items.pending}</div>
        <div class="stat-label">Pending Review</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.stats.pendingReviews}</div>
        <div class="stat-label">Pending Reviews</div>
      </div>
    </div>
  `;
}

// ============================================================================
// ACTIONS
// ============================================================================

async function handleApprove(itemId: string): Promise<void> {
  if (!adminSession) return;

  try {
    const response = await fetch(`/api/admin/marketplace/item/${itemId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': adminSession.id,
        'x-admin-name': adminSession.name,
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      toast.success('Item approved!');
      state.queue = state.queue.filter((i) => i.id !== itemId);
      renderPanel();
    } else {
      const data = await response.json();
      toast.error(data.error || 'Failed to approve');
    }
  } catch (error) {
    log.error('Failed to approve item:', error);
    toast.error('Failed to approve item');
  }
}

async function handleReject(itemId: string): Promise<void> {
  if (!adminSession) return;

  const reason = prompt('Enter rejection reason:');
  if (!reason) return;

  try {
    const response = await fetch(`/api/admin/marketplace/item/${itemId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': adminSession.id,
        'x-admin-name': adminSession.name,
      },
      body: JSON.stringify({ reason }),
    });

    if (response.ok) {
      toast.success('Item rejected');
      state.queue = state.queue.filter((i) => i.id !== itemId);
      renderPanel();
    } else {
      const data = await response.json();
      toast.error(data.error || 'Failed to reject');
    }
  } catch (error) {
    log.error('Failed to reject item:', error);
    toast.error('Failed to reject item');
  }
}

async function handleModerateReview(
  reviewId: string,
  decision: 'approved' | 'rejected'
): Promise<void> {
  if (!adminSession) return;

  try {
    const response = await fetch(`/api/admin/marketplace/reviews/${reviewId}/moderate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': adminSession.id,
        'x-admin-name': adminSession.name,
      },
      body: JSON.stringify({ decision }),
    });

    if (response.ok) {
      toast.success(`Review ${decision}`);
      state.pendingReviews = state.pendingReviews.filter((r) => r.id !== reviewId);
      renderPanel();
    } else {
      const data = await response.json();
      toast.error(data.error || 'Failed to moderate');
    }
  } catch (error) {
    log.error('Failed to moderate review:', error);
    toast.error('Failed to moderate review');
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('marketplace-admin-styles')) return;

  const style = document.createElement('style');
  style.id = 'marketplace-admin-styles';
  style.textContent = `
    .marketplace-admin-panel {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .marketplace-admin-panel.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .admin-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.8);
      backdrop-filter: blur(20px);
    }

    .admin-panel {
      position: relative;
      width: 100%;
      max-width: 900px;
      margin: var(--space-8, 32px) auto;
      background: var(--color-background-elevated);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 64px);
      overflow: hidden;
    }

    .admin-header {
      padding: var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .admin-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 36px;
      height: 36px;
      border: none;
      background: var(--color-background-secondary);
      border-radius: var(--radius-full);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary);
      transition: all ${DURATION.FAST}ms;
    }

    .admin-close:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .admin-close svg {
      width: 18px;
      height: 18px;
    }

    .admin-title {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
    }

    .admin-subtitle {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: var(--space-1, 4px) 0 0;
    }

    .admin-tabs {
      display: flex;
      gap: var(--space-1, 4px);
      padding: var(--space-2, 8px) var(--space-6, 24px);
      background: var(--color-background-secondary);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .admin-tab {
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
      transition: all ${DURATION.FAST}ms;
    }

    .admin-tab:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .admin-tab--active {
      background: var(--persona-tint);
      color: var(--persona-primary);
    }

    .admin-tab svg {
      width: 16px;
      height: 16px;
    }

    .tab-badge {
      font-size: 0.75rem;
      padding: 2px 6px;
      background: var(--color-background-tertiary);
      border-radius: var(--radius-full);
    }

    .admin-tab--active .tab-badge {
      background: var(--persona-primary);
      color: white;
    }

    .admin-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6, 24px);
    }

    .admin-empty {
      text-align: center;
      padding: var(--space-12, 48px);
    }

    .empty-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-4, 16px);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-semantic-success-glow);
      border-radius: var(--radius-full);
      color: var(--color-semantic-success);
    }

    .empty-icon svg {
      width: 32px;
      height: 32px;
    }

    .admin-empty h3 {
      font-family: var(--font-display);
      font-size: 1.25rem;
      color: var(--color-text-primary);
      margin: 0;
    }

    .admin-empty p {
      color: var(--color-text-secondary);
      margin: var(--space-2, 8px) 0 0;
    }

    .queue-list, .reviews-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-4, 16px);
    }

    .queue-item, .review-item {
      background: var(--color-background-secondary);
      border-radius: var(--radius-xl);
      padding: var(--space-5, 20px);
    }

    .queue-item-header {
      display: flex;
      align-items: flex-start;
      gap: var(--space-4, 16px);
      margin-bottom: var(--space-3, 12px);
    }

    .item-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--persona-tint);
      border-radius: var(--radius-lg);
      color: var(--persona-primary);
    }

    .item-icon.agent {
      background: color-mix(in srgb, var(--color-semantic-info) 15%, transparent);
      color: var(--color-semantic-info);
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
      margin: 0;
    }

    .item-meta {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: var(--space-1, 4px) 0 0;
    }

    .verified-badge {
      color: var(--color-semantic-success);
      margin-left: var(--space-1, 4px);
    }

    .item-trust {
      display: flex;
      align-items: center;
      gap: var(--space-1, 4px);
      font-size: 0.75rem;
      font-weight: 500;
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-full);
      text-transform: capitalize;
    }

    .item-trust svg {
      width: 14px;
      height: 14px;
    }

    .item-trust[data-trust="verified"] {
      background: var(--color-semantic-success-glow);
      color: var(--color-semantic-success);
    }

    .item-trust[data-trust="community"] {
      background: var(--color-semantic-warning-glow);
      color: var(--color-semantic-warning);
    }

    .item-trust[data-trust="unverified"] {
      background: var(--color-semantic-error-glow);
      color: var(--color-semantic-error);
    }

    .item-description {
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
      line-height: 1.5;
      margin: 0 0 var(--space-3, 12px);
    }

    .item-details {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4, 16px);
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin-bottom: var(--space-3, 12px);
    }

    .item-details .detail.time {
      margin-left: auto;
    }

    .item-tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-4, 16px);
    }

    .tag {
      font-size: 0.75rem;
      padding: var(--space-1, 4px) var(--space-2, 8px);
      background: var(--color-background-tertiary);
      color: var(--color-text-secondary);
      border-radius: var(--radius-full);
    }

    .item-actions, .review-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3, 12px);
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-4, 16px);
      border-radius: var(--radius-lg);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .action-btn svg {
      width: 16px;
      height: 16px;
    }

    .action-btn--approve {
      background: var(--color-semantic-success);
      color: white;
      border: none;
    }

    .action-btn--approve:hover {
      filter: brightness(1.1);
    }

    .action-btn--reject {
      background: transparent;
      color: var(--color-semantic-error);
      border: 2px solid var(--color-semantic-error);
    }

    .action-btn--reject:hover {
      background: var(--color-semantic-error-glow);
    }

    .review-header {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-2, 8px);
    }

    .review-rating {
      color: var(--color-semantic-warning);
    }

    .review-author {
      font-weight: 500;
      color: var(--color-text-primary);
    }

    .review-time {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-left: auto;
    }

    .review-title {
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .review-body {
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
      line-height: 1.5;
      margin: 0 0 var(--space-4, 16px);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--space-4, 16px);
    }

    .stat-card {
      background: var(--color-background-secondary);
      border-radius: var(--radius-xl);
      padding: var(--space-6, 24px);
      text-align: center;
    }

    .stat-value {
      font-family: var(--font-display);
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .stat-label {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin-top: var(--space-1, 4px);
    }

    @media (max-width: 768px) {
      .admin-panel {
        margin: 0;
        border-radius: 0;
        max-height: 100vh;
      }

      .queue-item-header {
        flex-wrap: wrap;
      }

      .item-trust {
        order: 3;
        width: 100%;
        justify-content: center;
        margin-top: var(--space-2, 8px);
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const marketplaceAdminUI = {
  open: openAdminQueue,
  close: closeAdminQueue,
};
