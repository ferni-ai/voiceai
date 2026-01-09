/**
 * Activity Dashboard UI
 *
 * Displays user's recent Ferni actions (calls, texts, emails, calendar events)
 * with real-time status updates and filtering.
 *
 * @module ui/activity
 */

import { DURATION_GENERATED, EASING_GENERATED } from '../config/animation-constants.generated.js';
import { apiGet } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

// Alias for cleaner usage
const DURATION = DURATION_GENERATED;
const EASING = EASING_GENERATED;

const log = createLogger('ActivityUI');

// ============================================================================
// TYPES
// ============================================================================

type ActionType = 'call' | 'text' | 'email' | 'calendar' | 'reminder';
type ActionStatus = 'requested' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

interface FerniAction {
  id: string;
  userId: string;
  type: ActionType;
  status: ActionStatus;
  request: {
    description: string;
    target?: string;
    requestedAt: string;
    sessionId?: string;
  };
  execution?: {
    toolId: string;
    startedAt: string;
    completedAt?: string;
    success: boolean;
    resultSummary?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface ActionsResponse {
  actions: FerniAction[];
  count: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ACTION_ICONS: Record<ActionType, string> = {
  call: 'phone',
  text: 'message-square',
  email: 'mail',
  calendar: 'calendar',
  reminder: 'bell',
};

const ACTION_LABELS: Record<ActionType, string> = {
  call: 'Call',
  text: 'Text',
  email: 'Email',
  calendar: 'Calendar',
  reminder: 'Reminder',
};

const STATUS_LABELS: Record<ActionStatus, string> = {
  requested: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

// ============================================================================
// STYLES
// ============================================================================

const ACTIVITY_STYLES = `
  .activity-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: min(400px, 100vw);
    height: 100vh;
    background: var(--color-bg-primary);
    border-left: 1px solid var(--color-border-subtle);
    transform: translateX(100%);
    transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    z-index: var(--z-modal);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .activity-panel--visible {
    transform: translateX(0);
  }

  .activity-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .activity-panel__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .activity-panel__close {
    background: transparent;
    border: none;
    padding: var(--space-xs);
    cursor: pointer;
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm);
    transition: background ${DURATION.FAST}ms ease;
  }

  .activity-panel__close:hover {
    background: var(--color-bg-secondary);
  }

  .activity-panel__close:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
  }

  .activity-panel__filters {
    display: flex;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
    overflow-x: auto;
  }

  .activity-filter {
    padding: var(--space-xs) var(--space-sm);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-full);
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: all ${DURATION.FAST}ms ease;
  }

  .activity-filter:hover {
    background: var(--color-bg-tertiary);
  }

  .activity-filter:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
  }

  .activity-filter--active {
    background: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: var(--color-text-on-accent);
  }

  .activity-panel__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
  }

  .activity-group {
    margin-bottom: var(--space-lg);
  }

  .activity-group__label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: var(--space-sm);
  }

  .activity-card {
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-sm);
    border: 1px solid var(--color-border-subtle);
    transition: border-color ${DURATION.FAST}ms ease;
  }

  .activity-card:hover {
    border-color: var(--color-border-medium);
  }

  .activity-card__header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .activity-card__icon {
    width: 20px;
    height: 20px;
    color: var(--color-text-secondary);
  }

  .activity-card__type {
    font-weight: 500;
    color: var(--color-text-primary);
    flex: 1;
  }

  .activity-card__time {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .activity-card__status {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.875rem;
    margin-bottom: var(--space-xs);
  }

  .activity-card__status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .activity-card__status-dot--completed {
    background: var(--color-semantic-success);
  }

  .activity-card__status-dot--in_progress {
    background: var(--color-accent-primary);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .activity-card__status-dot--requested {
    background: var(--color-text-muted);
  }

  .activity-card__status-dot--failed {
    background: var(--color-semantic-error);
  }

  .activity-card__status-dot--cancelled {
    background: var(--color-text-dimmed);
  }

  .activity-card__description {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .activity-card__result {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-top: var(--space-xs);
    font-style: italic;
  }

  .activity-empty {
    text-align: center;
    padding: var(--space-xl);
    color: var(--color-text-muted);
  }

  .activity-empty__icon {
    font-size: 3rem;
    margin-bottom: var(--space-md);
    opacity: 0.5;
  }

  .activity-empty__text {
    font-size: 0.875rem;
  }

  .activity-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    color: var(--color-text-muted);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (prefers-reduced-motion: reduce) {
    .activity-panel {
      transition: none;
    }
    .activity-card__status-dot--in_progress {
      animation: none;
    }
  }
`;

// ============================================================================
// UI CLASS
// ============================================================================

class ActivityUI {
  private panel: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private actions: FerniAction[] = [];
  private activeFilter: ActionType | 'all' = 'all';
  private isVisible = false;
  private styleElement: HTMLStyleElement | null = null;

  /**
   * Initialize the Activity UI
   */
  initialize(): void {
    if (this.panel) return;

    this.injectStyles();
    this.createPanel();
    this.attachEventListeners();

    log.debug({}, 'Activity UI initialized');
  }

  /**
   * Show the activity panel and load data
   */
  async show(): Promise<void> {
    if (!this.panel) {
      this.initialize();
    }

    this.isVisible = true;
    this.panel?.classList.add('activity-panel--visible');

    await this.loadActions();
  }

  /**
   * Hide the activity panel
   */
  hide(): void {
    this.isVisible = false;
    this.panel?.classList.remove('activity-panel--visible');
  }

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      void this.show();
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.panel?.remove();
    this.styleElement?.remove();
    this.panel = null;
    this.content = null;
    this.styleElement = null;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = ACTIVITY_STYLES;
    document.head.appendChild(this.styleElement);
  }

  private createPanel(): void {
    this.panel = document.createElement('aside');
    this.panel.className = 'activity-panel';
    this.panel.setAttribute('role', 'complementary');
    this.panel.setAttribute('aria-label', 'Activity history');

    // Header
    const header = this.createHeader();
    this.panel.appendChild(header);

    // Filters
    const filters = this.createFilters();
    this.panel.appendChild(filters);

    // Content area
    this.content = document.createElement('div');
    this.content.className = 'activity-panel__content';
    this.panel.appendChild(this.content);

    document.body.appendChild(this.panel);
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'activity-panel__header';

    const title = document.createElement('h2');
    title.className = 'activity-panel__title';
    title.textContent = 'Activity';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'activity-panel__close';
    closeBtn.setAttribute('aria-label', 'Close activity panel');
    closeBtn.innerHTML = this.createSvgIcon('x');
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);

    return header;
  }

  private createFilters(): HTMLElement {
    const filters = document.createElement('div');
    filters.className = 'activity-panel__filters';
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Filter by action type');

    // All filter
    const allBtn = this.createFilterButton('all', 'All');
    filters.appendChild(allBtn);

    // Type-specific filters
    const types: ActionType[] = ['call', 'text', 'email', 'calendar', 'reminder'];
    for (const type of types) {
      const btn = this.createFilterButton(type, ACTION_LABELS[type]);
      filters.appendChild(btn);
    }

    return filters;
  }

  private createFilterButton(filter: ActionType | 'all', label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'activity-filter';
    if (filter === this.activeFilter) {
      btn.classList.add('activity-filter--active');
    }
    btn.setAttribute('data-filter', filter);
    btn.textContent = label;
    btn.addEventListener('click', () => this.setFilter(filter));
    return btn;
  }

  private setFilter(filter: ActionType | 'all'): void {
    this.activeFilter = filter;

    // Update button states
    const buttons = this.panel?.querySelectorAll('.activity-filter');
    buttons?.forEach((btn) => {
      const btnFilter = btn.getAttribute('data-filter');
      btn.classList.toggle('activity-filter--active', btnFilter === filter);
    });

    // Re-render with filtered data
    this.renderActions();
  }

  private async loadActions(): Promise<void> {
    if (!this.content) return;

    // Show loading state
    this.content.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'activity-loading';
    loading.textContent = 'Loading activity...';
    this.content.appendChild(loading);

    try {
      const response = await apiGet<ActionsResponse>('/api/actions?limit=50');

      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Failed to load actions');
      }

      this.actions = response.data.actions;
      this.renderActions();
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to load actions');
      this.renderError();
    }
  }

  private renderActions(): void {
    if (!this.content) return;

    // Clear content
    this.content.innerHTML = '';

    // Filter actions
    const filtered =
      this.activeFilter === 'all'
        ? this.actions
        : this.actions.filter((a) => a.type === this.activeFilter);

    if (filtered.length === 0) {
      this.renderEmpty();
      return;
    }

    // Group by date
    const groups = this.groupByDate(filtered);

    for (const [label, actions] of Object.entries(groups)) {
      if (actions.length === 0) continue;

      const group = this.createGroup(label, actions);
      this.content.appendChild(group);
    }
  }

  private groupByDate(actions: FerniAction[]): Record<string, FerniAction[]> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const groups: Record<string, FerniAction[]> = {
      Today: [],
      Yesterday: [],
      'This Week': [],
      Earlier: [],
    };

    for (const action of actions) {
      const date = new Date(action.createdAt);
      if (date >= today) {
        groups['Today'].push(action);
      } else if (date >= yesterday) {
        groups['Yesterday'].push(action);
      } else if (date >= weekAgo) {
        groups['This Week'].push(action);
      } else {
        groups['Earlier'].push(action);
      }
    }

    return groups;
  }

  private createGroup(label: string, actions: FerniAction[]): HTMLElement {
    const group = document.createElement('div');
    group.className = 'activity-group';

    const labelEl = document.createElement('div');
    labelEl.className = 'activity-group__label';
    labelEl.textContent = label;
    group.appendChild(labelEl);

    for (const action of actions) {
      const card = this.createActionCard(action);
      group.appendChild(card);
    }

    return group;
  }

  private createActionCard(action: FerniAction): HTMLElement {
    const card = document.createElement('div');
    card.className = 'activity-card';

    // Header row: icon, type label, time
    const header = document.createElement('div');
    header.className = 'activity-card__header';

    const iconWrapper = document.createElement('span');
    iconWrapper.className = 'activity-card__icon';
    iconWrapper.innerHTML = this.createSvgIcon(ACTION_ICONS[action.type]);
    header.appendChild(iconWrapper);

    const typeLabel = document.createElement('span');
    typeLabel.className = 'activity-card__type';
    typeLabel.textContent = this.formatTypeLabel(action);
    header.appendChild(typeLabel);

    const time = document.createElement('span');
    time.className = 'activity-card__time';
    time.textContent = this.formatTime(action.createdAt);
    header.appendChild(time);

    card.appendChild(header);

    // Status row
    const status = document.createElement('div');
    status.className = 'activity-card__status';

    const statusDot = document.createElement('span');
    statusDot.className = `activity-card__status-dot activity-card__status-dot--${action.status}`;
    status.appendChild(statusDot);

    const statusText = document.createElement('span');
    statusText.textContent = STATUS_LABELS[action.status];
    status.appendChild(statusText);

    card.appendChild(status);

    // Description
    const description = document.createElement('div');
    description.className = 'activity-card__description';
    description.textContent = action.request.description;
    card.appendChild(description);

    // Result summary (if completed)
    if (action.execution?.resultSummary) {
      const result = document.createElement('div');
      result.className = 'activity-card__result';
      result.textContent = action.execution.resultSummary;
      card.appendChild(result);
    }

    return card;
  }

  private renderEmpty(): void {
    if (!this.content) return;

    const empty = document.createElement('div');
    empty.className = 'activity-empty';

    const icon = document.createElement('div');
    icon.className = 'activity-empty__icon';
    icon.textContent = '📋';
    empty.appendChild(icon);

    const text = document.createElement('p');
    text.className = 'activity-empty__text';
    text.textContent =
      this.activeFilter === 'all'
        ? "No activity yet. Ask Ferni to call someone or send a message!"
        : `No ${ACTION_LABELS[this.activeFilter as ActionType].toLowerCase()} activity yet.`;
    empty.appendChild(text);

    this.content.appendChild(empty);
  }

  private renderError(): void {
    if (!this.content) return;

    this.content.innerHTML = '';

    const empty = document.createElement('div');
    empty.className = 'activity-empty';

    const icon = document.createElement('div');
    icon.className = 'activity-empty__icon';
    icon.textContent = '😔';
    empty.appendChild(icon);

    const text = document.createElement('p');
    text.className = 'activity-empty__text';
    text.textContent = "Couldn't load activity. Try again?";
    empty.appendChild(text);

    this.content.appendChild(empty);
  }

  private formatTypeLabel(action: FerniAction): string {
    const baseLabel = ACTION_LABELS[action.type];
    if (action.request.target) {
      return `${baseLabel} to ${action.request.target}`;
    }
    return baseLabel;
  }

  private formatTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than 1 hour: show "Xm ago"
    if (diff < 60 * 60 * 1000) {
      const mins = Math.floor(diff / (60 * 1000));
      return mins <= 1 ? 'Just now' : `${mins}m ago`;
    }

    // Less than 24 hours: show time
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    // Otherwise: show date
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  private createSvgIcon(name: string): string {
    // Simple SVG icons (safe - no user content)
    const icons: Record<string, string> = {
      x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
      phone:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>',
      'message-square':
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
      mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
      calendar:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    };
    return icons[name] || '';
  }

  private attachEventListeners(): void {
    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    // Keyboard shortcut to toggle (Cmd/Ctrl + Shift + A)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        this.toggle();
      }
    });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let activityUI: ActivityUI | null = null;

/**
 * Get or create the Activity UI singleton
 */
export function getActivityUI(): ActivityUI {
  if (!activityUI) {
    activityUI = new ActivityUI();
  }
  return activityUI;
}

/**
 * Initialize the Activity UI
 */
export function initActivityUI(): void {
  getActivityUI().initialize();
}

/**
 * Show the Activity panel
 */
export function showActivity(): void {
  void getActivityUI().show();
}

/**
 * Hide the Activity panel
 */
export function hideActivity(): void {
  getActivityUI().hide();
}

/**
 * Toggle the Activity panel
 */
export function toggleActivity(): void {
  getActivityUI().toggle();
}
