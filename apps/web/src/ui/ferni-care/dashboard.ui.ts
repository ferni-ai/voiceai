/**
 * What I Do For You - Dashboard UI
 *
 * Shows the things Ferni takes care of automatically.
 * Warm, caring framing - not "automation" language.
 *
 * Design: Floating centered modal with personal, human copy.
 */

import { getLifeAutomationService, type Workflow } from '../../services/life-automation.service.js';
import { getUserId } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';
import { showIdeasGallery } from './ideas-gallery.ui.js';

const log = createLogger('FerniCare');

// ============================================================================
// HUMANIZED COPY - Warm, personal, relationship-focused
// ============================================================================

const COPY = {
  eyebrow: 'WHAT I DO FOR YOU',
  title: 'Little things I remember',
  subtitle: "So you don't have to",

  emptyTitle: 'Nothing set up yet',
  emptySubtitle: 'Want me to greet you each morning? Remind you to stretch? I can do that.',
  emptyButton: 'Show me some ideas',

  addNew: 'Add something new',

  // Trigger descriptions - conversational
  triggers: {
    time: (schedule: string) => `Every day at ${formatTimeFromCron(schedule)}`,
    phrase: (phrase: string) => `When you say "${phrase}"`,
    location: (name: string, action: string) =>
      action === 'enter' ? `When you arrive at ${name}` : `When you leave ${name}`,
    calendar: () => 'Before your calendar events',
    event: () => 'When something happens',
  },

  // Status labels - human
  status: {
    active: 'Taking care of it',
    paused: 'On hold',
    error: 'Needs attention',
  },

  tabs: {
    routines: 'My routines for you',
    ideas: 'Ideas',
    connections: 'Connected services',
  },
};

// Helper to make cron expressions human-readable
function formatTimeFromCron(cron: string): string {
  try {
    const parts = cron.split(' ');
    if (parts.length >= 2) {
      const minute = parseInt(parts[0] ?? '0', 10);
      const hour = parseInt(parts[1] ?? '9', 10);
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
    }
  } catch {
    // Fall through
  }
  return 'a set time';
}

// ============================================================================
// ICONS - Natural, friendly
// ============================================================================

const ICONS = {
  sunrise: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 1 0-7.894 0"/><path d="M2 12h2"/><path d="M12 17v5"/><path d="m8 21 4-4 4 4"/></svg>`,
  voice: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`,
  location: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  sparkle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>`,
  heart: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`,
  pause: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

const TRIGGER_ICONS: Record<string, string> = {
  time: ICONS.sunrise,
  phrase: ICONS.voice,
  location: ICONS.location,
  calendar: ICONS.calendar,
  event: ICONS.sparkle,
};

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .ferni-care-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 2100);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, 200ms) ease-out;
  }
  
  .ferni-care-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .ferni-care-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
    backdrop-filter: blur(8px);
  }
  
  .ferni-care {
    position: relative;
    width: 95%;
    max-width: 720px;
    max-height: 85vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    transition: transform var(--duration-slow, 300ms) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  }
  
  .ferni-care-overlay.visible .ferni-care {
    transform: scale(1);
  }
  
  /* Header - warm, personal */
  .ferni-care__header {
    padding: var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
  }
  
  .ferni-care__header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  
  .ferni-care__eyebrow {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ferni-text, #4a6741);
    margin-bottom: var(--space-1, 4px);
  }
  
  .ferni-care__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }
  
  .ferni-care__subtitle {
    font-size: 15px;
    color: var(--color-text-secondary);
    margin-top: var(--space-1, 4px);
    font-style: italic;
  }
  
  .ferni-care__close {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .ferni-care__close:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary);
  }
  
  /* Tabs - soft pills */
  .ferni-care__tabs {
    display: flex;
    gap: var(--space-2, 8px);
    margin-top: var(--space-4, 16px);
  }
  
  .ferni-care__tab {
    padding: var(--space-2, 8px) var(--space-4, 16px);
    border: none;
    background: transparent;
    border-radius: var(--radius-full, 9999px);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .ferni-care__tab:hover {
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    color: var(--color-text-primary);
  }
  
  .ferni-care__tab.active {
    background: var(--color-ferni, #4a6741);
    color: white;
  }
  
  /* Content */
  .ferni-care__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6, 24px);
  }
  
  /* Routine Cards - warm, caring design */
  .ferni-routines {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }
  
  .ferni-routine {
    display: flex;
    align-items: center;
    gap: var(--space-4, 16px);
    padding: var(--space-4, 16px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.08));
    border-radius: var(--radius-lg, 12px);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .ferni-routine:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.06));
    border-color: var(--color-border-medium, rgba(112, 96, 90, 0.15));
  }
  
  .ferni-routine__icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md, 8px);
    background: linear-gradient(135deg, var(--color-ferni, #4a6741) 0%, var(--color-ferni-dark, #3d5a35) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;
  }
  
  .ferni-routine__content {
    flex: 1;
    min-width: 0;
  }
  
  .ferni-routine__name {
    font-weight: 600;
    font-size: 15px;
    color: var(--color-text-primary);
    margin-bottom: 4px;
  }
  
  .ferni-routine__trigger {
    font-size: 13px;
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    gap: var(--space-1, 4px);
  }
  
  .ferni-routine__trigger svg {
    opacity: 0.6;
    width: 14px;
    height: 14px;
  }
  
  .ferni-routine__status {
    padding: var(--space-1, 4px) var(--space-3, 12px);
    border-radius: var(--radius-full, 9999px);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  
  .ferni-routine__status--active {
    background: rgba(74, 103, 65, 0.1);
    color: var(--color-ferni, #4a6741);
  }
  
  .ferni-routine__status--paused {
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.08));
    color: var(--color-text-muted);
  }
  
  .ferni-routine__status--error {
    background: rgba(196, 92, 92, 0.1);
    color: var(--color-semantic-error, #c45c5c);
  }
  
  .ferni-routine__actions {
    display: flex;
    gap: var(--space-2, 8px);
  }
  
  .ferni-routine__btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--color-bg-elevated, white);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .ferni-routine__btn:hover {
    background: var(--color-ferni, #4a6741);
    color: white;
  }
  
  /* Empty State - warm, inviting */
  .ferni-empty {
    text-align: center;
    padding: var(--space-12, 48px) var(--space-6, 24px);
  }
  
  .ferni-empty__icon {
    width: 80px;
    height: 80px;
    margin: 0 auto var(--space-5, 20px);
    color: var(--color-ferni, #4a6741);
    opacity: 0.4;
  }
  
  .ferni-empty__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--space-2, 8px);
  }
  
  .ferni-empty__description {
    font-size: 15px;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6, 24px);
    max-width: 340px;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.5;
  }
  
  .ferni-empty__btn {
    padding: var(--space-3, 12px) var(--space-6, 24px);
    border: none;
    background: var(--color-ferni, #4a6741);
    color: white;
    border-radius: var(--radius-full, 9999px);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .ferni-empty__btn:hover {
    filter: brightness(1.1);
    transform: scale(1.02);
  }
  
  /* Add New Button */
  .ferni-add-btn {
    width: 100%;
    padding: var(--space-4, 16px);
    border: 2px dashed var(--color-border-medium, rgba(112, 96, 90, 0.2));
    background: transparent;
    border-radius: var(--radius-lg, 12px);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
  }
  
  .ferni-add-btn:hover {
    border-color: var(--color-ferni, #4a6741);
    color: var(--color-ferni, #4a6741);
    background: rgba(74, 103, 65, 0.02);
  }
  
  /* Loading */
  .ferni-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-12, 48px);
    color: var(--color-text-muted);
  }
  
  .ferni-loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border-subtle);
    border-top-color: var(--color-ferni, #4a6741);
    border-radius: 50%;
    animation: ferni-spin 0.8s linear infinite;
  }
  
  @keyframes ferni-spin {
    to { transform: rotate(360deg); }
  }
`;

// ============================================================================
// STATE
// ============================================================================

let dashboardInstance: FerniCareDashboard | null = null;

// ============================================================================
// CLASS
// ============================================================================

export class FerniCareDashboard {
  private overlay: HTMLDivElement | null = null;
  private workflows: Workflow[] = [];
  private activeTab: 'routines' | 'ideas' | 'connections' = 'routines';
  private isLoading = false;

  constructor() {
    this.injectStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('ferni-care-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'ferni-care-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  async open(): Promise<void> {
    this.close();

    this.overlay = document.createElement('div');
    this.overlay.className = 'ferni-care-overlay';
    this.overlay.innerHTML = this.render();
    document.body.appendChild(this.overlay);

    this.attachEventListeners();

    requestAnimationFrame(() => {
      this.overlay?.classList.add('visible');
    });

    await this.loadWorkflows();
  }

  close(): void {
    if (this.overlay) {
      this.overlay.classList.remove('visible');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 300);
    }
  }

  private render(): string {
    return `
      <div class="ferni-care-backdrop" data-action="close"></div>
      <div class="ferni-care" role="dialog" aria-modal="true" aria-labelledby="ferni-care-title">
        <div class="ferni-care__header">
          <div class="ferni-care__header-top">
            <div>
              <div class="ferni-care__eyebrow">${COPY.eyebrow}</div>
              <h2 id="ferni-care-title" class="ferni-care__title">${COPY.title}</h2>
              <p class="ferni-care__subtitle">${COPY.subtitle}</p>
            </div>
            <button class="ferni-care__close" data-action="close" aria-label="Close">
              ${ICONS.close}
            </button>
          </div>
          <div class="ferni-care__tabs">
            <button class="ferni-care__tab active" data-tab="routines">${COPY.tabs.routines}</button>
            <button class="ferni-care__tab" data-tab="ideas">${COPY.tabs.ideas}</button>
            <button class="ferni-care__tab" data-tab="connections">${COPY.tabs.connections}</button>
          </div>
        </div>
        <div class="ferni-care__content" id="ferni-care-content">
          <div class="ferni-loading">
            <div class="ferni-loading-spinner"></div>
          </div>
        </div>
      </div>
    `;
  }

  private renderRoutines(): string {
    if (this.workflows.length === 0) {
      return `
        <div class="ferni-empty">
          <div class="ferni-empty__icon">
            ${ICONS.heart}
          </div>
          <h3 class="ferni-empty__title">${COPY.emptyTitle}</h3>
          <p class="ferni-empty__description">${COPY.emptySubtitle}</p>
          <button class="ferni-empty__btn" data-action="browse-ideas">${COPY.emptyButton}</button>
        </div>
      `;
    }

    return `
      <div class="ferni-routines">
        ${this.workflows.map((wf) => this.renderRoutineCard(wf)).join('')}
        <button class="ferni-add-btn" data-action="create-routine">
          ${ICONS.plus}
          ${COPY.addNew}
        </button>
      </div>
    `;
  }

  private renderRoutineCard(workflow: Workflow): string {
    const triggerIcon = TRIGGER_ICONS[workflow.trigger.type] || ICONS.sparkle;
    const triggerLabel = this.getTriggerLabel(workflow.trigger);
    const statusClass = `ferni-routine__status--${workflow.status}`;
    const statusLabel = COPY.status[workflow.status] || workflow.status;

    return `
      <div class="ferni-routine" data-workflow-id="${workflow.id}">
        <div class="ferni-routine__icon">${workflow.icon || ICONS.sparkle}</div>
        <div class="ferni-routine__content">
          <div class="ferni-routine__name">${this.escapeHtml(workflow.name)}</div>
          <div class="ferni-routine__trigger">
            ${triggerIcon}
            <span>${triggerLabel}</span>
          </div>
        </div>
        <span class="ferni-routine__status ${statusClass}">
          ${statusLabel}
        </span>
        <div class="ferni-routine__actions">
          <button class="ferni-routine__btn" data-action="toggle-status" data-workflow-id="${workflow.id}" title="${workflow.status === 'active' ? 'Pause' : 'Resume'}">
            ${workflow.status === 'active' ? ICONS.pause : ICONS.play}
          </button>
          <button class="ferni-routine__btn" data-action="run" data-workflow-id="${workflow.id}" title="Run now">
            ${ICONS.play}
          </button>
        </div>
      </div>
    `;
  }

  private getTriggerLabel(trigger: Workflow['trigger']): string {
    switch (trigger.type) {
      case 'time':
        return COPY.triggers.time(trigger.schedule || '0 9 * * *');
      case 'phrase':
        return COPY.triggers.phrase(trigger.phrases?.[0] || '...');
      case 'location':
        return COPY.triggers.location(
          trigger.locationName || 'somewhere',
          trigger.triggerOn || 'enter'
        );
      case 'calendar':
        return COPY.triggers.calendar();
      default:
        return COPY.triggers.event();
    }
  }

  private async loadWorkflows(): Promise<void> {
    const content = this.overlay?.querySelector('#ferni-care-content');
    if (!content) return;

    this.isLoading = true;
    content.innerHTML = `<div class="ferni-loading"><div class="ferni-loading-spinner"></div></div>`;

    try {
      const userId = getUserId();
      if (!userId) {
        content.innerHTML =
          '<div class="ferni-empty"><p>Sign in to see what I do for you</p></div>';
        return;
      }

      const service = getLifeAutomationService();
      this.workflows = await service.listWorkflows(userId);
      content.innerHTML = this.renderRoutines();
    } catch (error) {
      log.error('Failed to load workflows', error);
      content.innerHTML = '<div class="ferni-empty"><p>Couldn\'t load your routines</p></div>';
    } finally {
      this.isLoading = false;
    }
  }

  private attachEventListeners(): void {
    if (!this.overlay) return;

    this.overlay.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest('[data-action]')?.getAttribute('data-action');
      const tab = target.closest('[data-tab]')?.getAttribute('data-tab');
      const workflowId = target.closest('[data-workflow-id]')?.getAttribute('data-workflow-id');

      if (action === 'close') {
        this.close();
      } else if (action === 'browse-ideas' || action === 'create-routine') {
        this.close();
        showIdeasGallery();
      } else if (action === 'toggle-status' && workflowId) {
        await this.toggleWorkflowStatus(workflowId);
      } else if (action === 'run' && workflowId) {
        await this.runWorkflow(workflowId);
      } else if (tab) {
        this.switchTab(tab as typeof this.activeTab);
      }
    });

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }

  private switchTab(tab: typeof this.activeTab): void {
    this.activeTab = tab;

    this.overlay?.querySelectorAll('.ferni-care__tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    const content = this.overlay?.querySelector('#ferni-care-content');
    if (!content) return;

    if (tab === 'routines') {
      this.loadWorkflows();
    } else if (tab === 'ideas') {
      this.close();
      showIdeasGallery();
    } else if (tab === 'connections') {
      content.innerHTML = `<div class="ferni-empty"><p>Connected services coming soon...</p></div>`;
    }
  }

  private async toggleWorkflowStatus(workflowId: string): Promise<void> {
    const workflow = this.workflows.find((w) => w.id === workflowId);
    if (!workflow) return;

    const userId = getUserId();
    if (!userId) return;

    const service = getLifeAutomationService();

    try {
      if (workflow.status === 'active') {
        await service.pauseWorkflow(workflowId, userId);
      } else {
        await service.activateWorkflow(workflowId, userId);
      }
      await this.loadWorkflows();
    } catch (error) {
      log.error('Failed to toggle workflow', error);
    }
  }

  private async runWorkflow(workflowId: string): Promise<void> {
    const userId = getUserId();
    if (!userId) return;

    const service = getLifeAutomationService();

    try {
      const result = await service.runWorkflow(workflowId, userId);
      if (result) {
        log.info('Workflow started', { jobId: result.jobId });
      }
    } catch (error) {
      log.error('Failed to run workflow', error);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function showFerniCareDashboard(): void {
  if (!dashboardInstance) {
    dashboardInstance = new FerniCareDashboard();
  }
  dashboardInstance.open();
}
