/**
 * Routine Builder UI
 *
 * "Tell me what you'd like" - warm builder for personal routines.
 * Not "Create Workflow" - that's enterprise software speak.
 *
 * Design: Floating modal with conversational, friendly flow.
 */

import { createLogger } from '../../utils/logger.js';
import {
  getLifeAutomationService,
  type WorkflowTemplate,
  type Workflow,
  type WorkflowAction,
  type WorkflowTrigger,
} from '../../services/life-automation.service.js';
import { getUserId } from '../../utils/api.js';
import { showFerniCareDashboard } from './dashboard.ui.js';

const log = createLogger('RoutineBuilder');

// ============================================================================
// HUMANIZED COPY
// ============================================================================

const COPY = {
  titles: {
    new: 'Tell me what you\'d like',
    edit: 'Make some changes',
    fromTemplate: (name: string) => `Setting up "${name}"`,
  },

  sections: {
    name: 'What should I call this?',
    namePlaceholder: 'e.g., "Morning check-in" or "Wind down"',
    trigger: 'When should I do this?',
    actions: 'What should I do?',
    customize: 'Make it yours',
  },

  triggers: [
    { type: 'time', label: 'At a certain time', icon: '🌅', hint: 'Every day at 7am, weekdays at 9am...' },
    { type: 'phrase', label: 'When you say something', icon: '🗣️', hint: '"Good morning Ferni" or "Start my day"' },
    { type: 'location', label: 'When you arrive or leave', icon: '📍', hint: 'Coming home, leaving work...' },
    { type: 'calendar', label: 'Around calendar events', icon: '📅', hint: 'Before meetings, after workouts...' },
  ],

  triggerConfig: {
    time: {
      schedule: 'What time?',
      schedulePlaceholder: 'e.g., 7:00 AM',
      timezone: 'Your timezone',
    },
    phrase: {
      phrase: 'What phrase triggers this?',
      phrasePlaceholder: 'e.g., Good morning Ferni',
    },
    location: {
      name: 'What place?',
      namePlaceholder: 'e.g., Home, Office, Gym',
      when: 'Trigger when I...',
      options: { enter: 'Arrive', exit: 'Leave', both: 'Either' },
    },
  },

  actions: [
    { type: 'speak_message', label: 'Say something', icon: '💬', hint: 'I\'ll speak this to you' },
    { type: 'send_notification', label: 'Send a notification', icon: '🔔', hint: 'A gentle nudge' },
    { type: 'add_reminder', label: 'Set a reminder', icon: '⏰', hint: 'I\'ll remind you later' },
    { type: 'log_habit', label: 'Log a habit', icon: '✅', hint: 'Track your progress' },
    { type: 'control_lights', label: 'Adjust lights', icon: '💡', hint: 'Set the mood' },
    { type: 'set_thermostat', label: 'Set temperature', icon: '🌡️', hint: 'Get comfortable' },
    { type: 'play_music', label: 'Play music', icon: '🎵', hint: 'Set the vibe' },
  ],

  buttons: {
    cancel: 'Never mind',
    save: 'Start doing this for me',
    saveEdit: 'Save changes',
    addAction: 'Add something else',
  },

  validation: {
    needsName: 'Give it a name first',
  },
};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  remove: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .routine-builder-overlay {
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
  
  .routine-builder-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .routine-builder-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
    backdrop-filter: blur(8px);
  }
  
  .routine-builder {
    position: relative;
    width: 95%;
    max-width: 580px;
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
  
  .routine-builder-overlay.visible .routine-builder {
    transform: scale(1);
  }
  
  .routine-builder__header {
    padding: var(--space-5, 20px) var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .routine-builder__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }
  
  .routine-builder__close {
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
  
  .routine-builder__close:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary);
  }
  
  .routine-builder__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6, 24px);
  }
  
  /* Form Sections */
  .rb-section {
    margin-bottom: var(--space-6, 24px);
  }
  
  .rb-section__label {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--space-2, 8px);
  }
  
  .rb-input {
    width: 100%;
    padding: var(--space-3, 12px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    border-radius: var(--radius-md, 8px);
    background: var(--color-bg-elevated, white);
    font-size: 15px;
    color: var(--color-text-primary);
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .rb-input::placeholder {
    color: var(--color-text-muted);
  }
  
  .rb-input:focus {
    outline: none;
    border-color: var(--color-ferni, #4a6741);
    box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
  }
  
  .rb-input--lg {
    font-size: 18px;
    font-weight: 500;
    padding: var(--space-4, 16px);
  }
  
  /* Trigger Options */
  .rb-triggers {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2, 8px);
  }
  
  .rb-trigger {
    padding: var(--space-3, 12px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    border-radius: var(--radius-md, 8px);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .rb-trigger:hover {
    border-color: var(--color-ferni, #4a6741);
    background: rgba(74, 103, 65, 0.02);
  }
  
  .rb-trigger.selected {
    border-color: var(--color-ferni, #4a6741);
    background: rgba(74, 103, 65, 0.05);
  }
  
  .rb-trigger__icon {
    font-size: 20px;
    margin-bottom: var(--space-1, 4px);
  }
  
  .rb-trigger__label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 2px;
  }
  
  .rb-trigger__hint {
    font-size: 11px;
    color: var(--color-text-muted);
    line-height: 1.3;
  }
  
  /* Trigger Config Panel */
  .rb-trigger-config {
    margin-top: var(--space-4, 16px);
    padding: var(--space-4, 16px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.08));
  }
  
  .rb-field {
    margin-bottom: var(--space-3, 12px);
  }
  
  .rb-field:last-child {
    margin-bottom: 0;
  }
  
  .rb-field__label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-1, 4px);
  }
  
  /* Actions List */
  .rb-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }
  
  .rb-action-item {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: var(--space-3, 12px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.08));
    border-radius: var(--radius-md, 8px);
  }
  
  .rb-action-item__icon {
    font-size: 20px;
    flex-shrink: 0;
  }
  
  .rb-action-item__content {
    flex: 1;
    min-width: 0;
  }
  
  .rb-action-item__name {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-primary);
  }
  
  .rb-action-item__hint {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  
  .rb-action-item__remove {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .rb-action-item__remove:hover {
    background: rgba(196, 92, 92, 0.1);
    color: var(--color-semantic-error, #c45c5c);
  }
  
  .rb-add-action {
    width: 100%;
    padding: var(--space-3, 12px);
    border: 2px dashed var(--color-border-medium, rgba(112, 96, 90, 0.2));
    background: transparent;
    border-radius: var(--radius-md, 8px);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
  }
  
  .rb-add-action:hover {
    border-color: var(--color-ferni, #4a6741);
    color: var(--color-ferni, #4a6741);
    background: rgba(74, 103, 65, 0.02);
  }
  
  /* Action Picker Overlay */
  .rb-action-picker {
    position: absolute;
    inset: 0;
    background: var(--color-bg-elevated, #FFFDFB);
    z-index: 10;
    display: none;
    flex-direction: column;
  }
  
  .rb-action-picker.visible {
    display: flex;
  }
  
  .rb-action-picker__header {
    padding: var(--space-4, 16px);
    border-bottom: 1px solid var(--color-border-subtle);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .rb-action-picker__title {
    font-size: 16px;
    font-weight: 600;
  }
  
  .rb-action-picker__list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4, 16px);
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3, 12px);
    align-content: start;
  }
  
  .rb-action-picker__item {
    padding: var(--space-4, 16px);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md, 8px);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .rb-action-picker__item:hover {
    border-color: var(--color-ferni, #4a6741);
    background: rgba(74, 103, 65, 0.05);
  }
  
  .rb-action-picker__item-icon {
    font-size: 24px;
    margin-bottom: var(--space-2, 8px);
  }
  
  .rb-action-picker__item-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 2px;
  }
  
  .rb-action-picker__item-hint {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  
  /* Footer */
  .routine-builder__footer {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-top: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }
  
  .rb-btn {
    padding: var(--space-3, 12px) var(--space-5, 20px);
    border: none;
    border-radius: var(--radius-full, 9999px);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .rb-btn--secondary {
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    color: var(--color-text-secondary);
  }
  
  .rb-btn--secondary:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
  }
  
  .rb-btn--primary {
    background: var(--color-ferni, #4a6741);
    color: white;
  }
  
  .rb-btn--primary:hover {
    filter: brightness(1.1);
  }
  
  .rb-btn--primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ============================================================================
// STATE
// ============================================================================

let builderInstance: RoutineBuilder | null = null;

// ============================================================================
// CLASS
// ============================================================================

export class RoutineBuilder {
  private overlay: HTMLDivElement | null = null;
  private template: WorkflowTemplate | null = null;
  private editingWorkflow: Workflow | null = null;
  private name = '';
  private triggerType = 'time';
  private triggerConfig: Record<string, unknown> = {};
  private actions: WorkflowAction[] = [];
  private variables: Record<string, unknown> = {};
  private showActionPicker = false;

  constructor() {
    this.injectStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('routine-builder-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'routine-builder-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  async open(template?: WorkflowTemplate, workflow?: Workflow): Promise<void> {
    this.close();

    this.template = template || null;
    this.editingWorkflow = workflow || null;

    // Initialize from template or workflow
    if (template) {
      this.name = template.name;
      this.triggerType = template.trigger.type;
      this.triggerConfig = { ...template.trigger };
      this.actions = [...template.actions];
      template.variables.forEach((v) => {
        this.variables[v.name] = v.defaultValue;
      });
    } else if (workflow) {
      this.name = workflow.name;
      this.triggerType = workflow.trigger.type;
      this.triggerConfig = { ...workflow.trigger };
      this.actions = [...workflow.actions];
      this.variables = { ...workflow.variables };
    } else {
      this.name = '';
      this.triggerType = 'time';
      this.triggerConfig = { schedule: '0 9 * * *', timezone: 'America/New_York' };
      this.actions = [];
      this.variables = {};
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'routine-builder-overlay';
    this.overlay.innerHTML = this.render();
    document.body.appendChild(this.overlay);

    this.attachEventListeners();

    requestAnimationFrame(() => {
      this.overlay?.classList.add('visible');
    });
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
    const title = this.editingWorkflow
      ? COPY.titles.edit
      : this.template
        ? COPY.titles.fromTemplate(this.template.name)
        : COPY.titles.new;

    const saveLabel = this.editingWorkflow ? COPY.buttons.saveEdit : COPY.buttons.save;

    return `
      <div class="routine-builder-backdrop" data-action="close"></div>
      <div class="routine-builder" role="dialog" aria-modal="true">
        <div class="routine-builder__header">
          <h2 class="routine-builder__title">${title}</h2>
          <button class="routine-builder__close" data-action="close" aria-label="Close">
            ${ICONS.close}
          </button>
        </div>
        
        <div class="routine-builder__content">
          <div class="rb-section">
            <label class="rb-section__label">${COPY.sections.name}</label>
            <input type="text" class="rb-input rb-input--lg" id="rb-name" value="${this.escapeHtml(this.name)}" placeholder="${COPY.sections.namePlaceholder}">
          </div>
          
          <div class="rb-section">
            <label class="rb-section__label">${COPY.sections.trigger}</label>
            <div class="rb-triggers">
              ${COPY.triggers
                .map(
                  (t) => `
                <button class="rb-trigger ${this.triggerType === t.type ? 'selected' : ''}" data-trigger="${t.type}">
                  <div class="rb-trigger__icon">${t.icon}</div>
                  <div class="rb-trigger__label">${t.label}</div>
                  <div class="rb-trigger__hint">${t.hint}</div>
                </button>
              `
                )
                .join('')}
            </div>
            ${this.renderTriggerConfig()}
          </div>
          
          <div class="rb-section">
            <label class="rb-section__label">${COPY.sections.actions}</label>
            <div class="rb-actions">
              ${this.actions.map((action, i) => this.renderActionItem(action, i)).join('')}
              <button class="rb-add-action" data-action="add-action">
                ${ICONS.plus}
                ${COPY.buttons.addAction}
              </button>
            </div>
          </div>
          
          ${this.template && this.template.variables.length > 0 ? this.renderVariables() : ''}
        </div>
        
        ${this.renderActionPicker()}
        
        <div class="routine-builder__footer">
          <button class="rb-btn rb-btn--secondary" data-action="cancel">${COPY.buttons.cancel}</button>
          <button class="rb-btn rb-btn--primary" data-action="save" ${!this.name ? 'disabled' : ''}>
            ${saveLabel}
          </button>
        </div>
      </div>
    `;
  }

  private renderTriggerConfig(): string {
    const cfg = COPY.triggerConfig;
    let fields = '';

    switch (this.triggerType) {
      case 'time':
        fields = `
          <div class="rb-field">
            <label class="rb-field__label">${cfg.time.schedule}</label>
            <input type="text" class="rb-input" id="rb-schedule" value="${this.triggerConfig.schedule || '7:00 AM'}" placeholder="${cfg.time.schedulePlaceholder}">
          </div>
        `;
        break;
      case 'phrase':
        fields = `
          <div class="rb-field">
            <label class="rb-field__label">${cfg.phrase.phrase}</label>
            <input type="text" class="rb-input" id="rb-phrase" value="${(this.triggerConfig.phrases as string[])?.[0] || ''}" placeholder="${cfg.phrase.phrasePlaceholder}">
          </div>
        `;
        break;
      case 'location':
        fields = `
          <div class="rb-field">
            <label class="rb-field__label">${cfg.location.name}</label>
            <input type="text" class="rb-input" id="rb-location-name" value="${this.triggerConfig.locationName || ''}" placeholder="${cfg.location.namePlaceholder}">
          </div>
          <div class="rb-field">
            <label class="rb-field__label">${cfg.location.when}</label>
            <select class="rb-input" id="rb-location-trigger">
              <option value="enter" ${this.triggerConfig.triggerOn === 'enter' ? 'selected' : ''}>${cfg.location.options.enter}</option>
              <option value="exit" ${this.triggerConfig.triggerOn === 'exit' ? 'selected' : ''}>${cfg.location.options.exit}</option>
              <option value="both" ${this.triggerConfig.triggerOn === 'both' ? 'selected' : ''}>${cfg.location.options.both}</option>
            </select>
          </div>
        `;
        break;
      default:
        fields = '<p style="color: var(--color-text-muted); font-size: 13px;">Coming soon...</p>';
    }

    return `<div class="rb-trigger-config">${fields}</div>`;
  }

  private renderActionItem(action: WorkflowAction, index: number): string {
    const actionDef = COPY.actions.find((a) => a.type === action.type);

    return `
      <div class="rb-action-item">
        <div class="rb-action-item__icon">${actionDef?.icon || '⚙️'}</div>
        <div class="rb-action-item__content">
          <div class="rb-action-item__name">${this.escapeHtml(action.name)}</div>
          <div class="rb-action-item__hint">${this.getActionSummary(action)}</div>
        </div>
        <button class="rb-action-item__remove" data-action="remove-action" data-index="${index}">
          ${ICONS.remove}
        </button>
      </div>
    `;
  }

  private getActionSummary(action: WorkflowAction): string {
    if (action.params.message) return `"${String(action.params.message).slice(0, 40)}..."`;
    if (action.params.habitId) return `Track: ${action.params.habitId}`;
    if (action.params.zone) return `${action.params.zone}`;
    return action.type;
  }

  private renderActionPicker(): string {
    return `
      <div class="rb-action-picker ${this.showActionPicker ? 'visible' : ''}">
        <div class="rb-action-picker__header">
          <h3 class="rb-action-picker__title">What should I do?</h3>
          <button class="routine-builder__close" data-action="close-picker">
            ${ICONS.close}
          </button>
        </div>
        <div class="rb-action-picker__list">
          ${COPY.actions
            .map(
              (a) => `
            <button class="rb-action-picker__item" data-add-action="${a.type}">
              <div class="rb-action-picker__item-icon">${a.icon}</div>
              <div class="rb-action-picker__item-label">${a.label}</div>
              <div class="rb-action-picker__item-hint">${a.hint}</div>
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  private renderVariables(): string {
    if (!this.template) return '';

    return `
      <div class="rb-section">
        <label class="rb-section__label">${COPY.sections.customize}</label>
        ${this.template.variables
          .map(
            (v) => `
          <div class="rb-field">
            <label class="rb-field__label">${v.label}</label>
            <input type="${v.type === 'number' ? 'number' : 'text'}" class="rb-input" id="rb-var-${v.name}" value="${this.variables[v.name] || v.defaultValue || ''}" placeholder="${v.description || ''}">
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  private attachEventListeners(): void {
    if (!this.overlay) return;

    this.overlay.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest('[data-action]')?.getAttribute('data-action');
      const triggerType = target.closest('[data-trigger]')?.getAttribute('data-trigger');
      const addActionType = target.closest('[data-add-action]')?.getAttribute('data-add-action');
      const removeIndex = target.closest('[data-index]')?.getAttribute('data-index');

      if (action === 'close' || action === 'cancel') {
        this.close();
      } else if (action === 'save') {
        await this.save();
      } else if (action === 'add-action') {
        this.showActionPicker = true;
        this.updateContent();
      } else if (action === 'close-picker') {
        this.showActionPicker = false;
        this.updateContent();
      } else if (action === 'remove-action' && removeIndex) {
        this.actions.splice(parseInt(removeIndex, 10), 1);
        this.updateContent();
      } else if (triggerType) {
        this.triggerType = triggerType;
        this.updateContent();
      } else if (addActionType) {
        this.addAction(addActionType);
      }
    });

    this.overlay.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.id === 'rb-name') {
        this.name = target.value;
        const saveBtn = this.overlay?.querySelector('[data-action="save"]') as HTMLButtonElement;
        if (saveBtn) saveBtn.disabled = !this.name;
      } else if (target.id === 'rb-schedule') {
        this.triggerConfig.schedule = target.value;
      } else if (target.id === 'rb-phrase') {
        this.triggerConfig.phrases = [target.value];
      } else if (target.id === 'rb-location-name') {
        this.triggerConfig.locationName = target.value;
      } else if (target.id === 'rb-location-trigger') {
        this.triggerConfig.triggerOn = target.value;
      } else if (target.id.startsWith('rb-var-')) {
        const varName = target.id.replace('rb-var-', '');
        this.variables[varName] = target.value;
      }
    });

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.showActionPicker) {
          this.showActionPicker = false;
          this.updateContent();
        } else {
          this.close();
          document.removeEventListener('keydown', handleKeydown);
        }
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }

  private updateContent(): void {
    const content = this.overlay?.querySelector('.routine-builder__content');
    const picker = this.overlay?.querySelector('.rb-action-picker');

    if (content) {
      const rendered = this.render();
      const parts = rendered.split('<div class="routine-builder__content">');
      const innerContent = parts[1]?.split('</div>\n        \n        <div class="rb-action-picker')[0] ?? '';
      content.innerHTML = innerContent;
    }

    if (picker) {
      picker.className = `rb-action-picker ${this.showActionPicker ? 'visible' : ''}`;
    }
  }

  private addAction(type: string): void {
    const actionDef = COPY.actions.find((a) => a.type === type);
    if (!actionDef) return;

    const newAction: WorkflowAction = {
      id: `action_${Date.now()}`,
      type,
      name: actionDef.label,
      params: this.getDefaultParams(type),
    };

    this.actions.push(newAction);
    this.showActionPicker = false;
    this.updateContent();
  }

  private getDefaultParams(type: string): Record<string, unknown> {
    switch (type) {
      case 'speak_message':
        return { message: 'Good morning! Ready to start the day?' };
      case 'send_notification':
        return { title: 'Ferni', body: '' };
      case 'add_reminder':
        return { time: '09:00', message: '' };
      case 'log_habit':
        return { habitId: '', action: 'complete' };
      case 'control_lights':
        return { zone: 'living_room', state: 'on', brightness: 100 };
      case 'set_thermostat':
        return { temperature: 72, mode: 'auto' };
      case 'play_music':
        return { playlist: 'morning', provider: 'spotify' };
      default:
        return {};
    }
  }

  private async save(): Promise<void> {
    const userId = getUserId();
    if (!userId) {
      log.error('No user ID');
      return;
    }

    const service = getLifeAutomationService();

    try {
      const trigger: WorkflowTrigger = {
        type: this.triggerType as WorkflowTrigger['type'],
        ...this.triggerConfig,
      };

      if (this.editingWorkflow) {
        await service.updateWorkflow(this.editingWorkflow.id, userId, {
          name: this.name,
          trigger,
          actions: this.actions,
          variables: this.variables,
        });
      } else if (this.template) {
        await service.createFromTemplate(this.template.id, userId, this.variables);
      } else {
        await service.createWorkflow(userId, {
          name: this.name,
          trigger,
          actions: this.actions,
        });
      }

      this.close();
      showFerniCareDashboard();
    } catch (error) {
      log.error('Failed to save routine', error);
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

export function showRoutineBuilder(template?: WorkflowTemplate, workflow?: Workflow): void {
  if (!builderInstance) {
    builderInstance = new RoutineBuilder();
  }
  builderInstance.open(template, workflow);
}
