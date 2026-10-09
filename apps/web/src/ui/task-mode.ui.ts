/**
 * Task Mode UI
 * 
 * Structured work assistance mode for Professional agents.
 * Focus on specific tasks with templates, progress tracking, and deliverables.
 * 
 * @module task-mode.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { getCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';
import { soundUI } from './sound.ui.js';
import { t } from '../i18n/index.js';

const log = createLogger('TaskMode');

let taskModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;
let currentStep: 'select' | 'configure' | 'execute' = 'select';
let taskData = {
  template: null as TaskTemplate | null,
  inputs: {} as Record<string, string>
};

// ============================================================================
// TYPES
// ============================================================================

interface TaskTemplate {
  id: string;
  nameKey: string;
  icon: string;
  descriptionKey: string;
  estimatedTimeKey: string;
  inputs: TaskInput[];
  systemPrompt: string;
}

interface TaskInput {
  id: string;
  labelKey: string;
  type: 'text' | 'textarea' | 'select';
  placeholderKey?: string;
  optionKeys?: string[];
  required?: boolean;
}

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .task-mode-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .task-mode-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
  }

  .task-mode-modal {
    position: relative;
    width: 100%;
    max-width: clamp(385px, 90vw, 550px);
    max-height: 85vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.95);
    opacity: 0;
    transition: transform ${DURATION.SLOW}ms ${EASING.SPRING},
                opacity ${DURATION.SLOW}ms ${EASING.GENTLE};
  }

  .task-mode-modal.visible {
    transform: scale(1);
    opacity: 1;
  }

  .task-mode-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  .task-mode-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .task-mode-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .task-mode-name {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .task-close-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full);
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    transition: all ${DURATION.FAST}ms ease;
  }

  .task-close-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .task-mode-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
  }

  .task-progress {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }

  .task-progress-step {
    flex: 1;
    height: 4px;
    background: var(--color-background-subtle);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .task-progress-step.active {
    background: var(--color-accent);
  }

  .task-progress-step.completed {
    background: var(--color-accent);
  }

  .task-step-title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .task-step-subtitle {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-4);
  }

  .task-templates-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .task-template-card {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    background: var(--color-background-subtle);
    border: 2px solid transparent;
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
  }

  .task-template-card:hover {
    background: var(--color-background-hover);
    transform: translateX(4px);
  }

  .task-template-card.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-light);
  }

  .task-template-icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-lg);
    background: var(--color-accent-light);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .task-template-info {
    flex: 1;
    min-width: 0;
  }

  .task-template-name {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1);
  }

  .task-template-desc {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-2);
  }

  .task-template-time {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .task-input-group {
    margin-bottom: var(--space-4);
  }

  .task-label {
    display: block;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-text-primary);
    margin-bottom: var(--space-2);
  }

  .task-label .required {
    color: var(--color-semantic-error);
  }

  .task-input,
  .task-textarea,
  .task-select {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-background-subtle);
    color: var(--color-text-primary);
    font-size: 0.95rem;
    transition: all ${DURATION.FAST}ms ease;
  }

  .task-input:focus,
  .task-textarea:focus,
  .task-select:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-light);
  }

  .task-input::placeholder,
  .task-textarea::placeholder {
    color: var(--color-text-muted);
  }

  .task-textarea {
    resize: vertical;
    min-height: 100px;
  }

  .task-select {
    cursor: pointer;
  }

  .task-summary {
    background: linear-gradient(135deg, var(--color-accent-light), transparent);
    border-radius: var(--radius-xl);
    padding: var(--space-5);
    margin-bottom: var(--space-4);
  }

  .task-summary-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .task-summary-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    background: var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .task-summary-title {
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .task-summary-time {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .task-summary-inputs {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .task-summary-input {
    background: var(--color-background-elevated);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
  }

  .task-summary-input-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }

  .task-summary-input-value {
    font-size: 0.95rem;
    color: var(--color-text-primary);
  }

  .task-actions {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-5);
  }

  .task-btn {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    font-weight: 500;
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }

  .task-btn--secondary {
    background: var(--tonal-surface-2);
    border: none;
    color: var(--color-text-primary);
  }

  .task-btn--secondary:hover {
    background: var(--tonal-surface-3);
  }

  .task-btn--secondary:active {
    background: var(--tonal-surface-active);
  }

  .task-btn--primary {
    background: var(--color-accent);
    border: none;
    color: white;
  }

  .task-btn--primary:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .task-btn--primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

// ============================================================================
// DATA
// ============================================================================

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'email',
    nameKey: 'taskMode.templates.email.name',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    descriptionKey: 'taskMode.templates.email.description',
    estimatedTimeKey: 'taskMode.templates.email.time',
    inputs: [
      { id: 'recipient', labelKey: 'taskMode.templates.email.recipientLabel', type: 'text', placeholderKey: 'taskMode.templates.email.recipientPlaceholder', required: true },
      { id: 'purpose', labelKey: 'taskMode.templates.email.purposeLabel', type: 'textarea', placeholderKey: 'taskMode.templates.email.purposePlaceholder', required: true },
      { id: 'tone', labelKey: 'taskMode.templates.email.toneLabel', type: 'select', optionKeys: ['taskMode.common.professional', 'taskMode.common.friendly', 'taskMode.common.formal', 'taskMode.common.apologetic', 'taskMode.common.persuasive'], required: true }
    ],
    systemPrompt: 'Help me draft a professional email to {recipient}. The email should be {tone} in tone. Purpose: {purpose}'
  },
  {
    id: 'meeting-prep',
    nameKey: 'taskMode.templates.meetingPrep.name',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    descriptionKey: 'taskMode.templates.meetingPrep.description',
    estimatedTimeKey: 'taskMode.templates.meetingPrep.time',
    inputs: [
      { id: 'meeting_type', labelKey: 'taskMode.templates.meetingPrep.typeLabel', type: 'select', optionKeys: ['taskMode.common.teamSync', 'taskMode.common.oneOnOne', 'taskMode.common.clientPresentation', 'taskMode.common.projectKickoff', 'taskMode.common.performanceReview'], required: true },
      { id: 'attendees', labelKey: 'taskMode.templates.meetingPrep.attendeesLabel', type: 'text', placeholderKey: 'taskMode.templates.meetingPrep.attendeesPlaceholder' },
      { id: 'objectives', labelKey: 'taskMode.templates.meetingPrep.objectivesLabel', type: 'textarea', placeholderKey: 'taskMode.templates.meetingPrep.objectivesPlaceholder', required: true }
    ],
    systemPrompt: 'Help me prepare for a {meeting_type} meeting. Attendees: {attendees}. Objectives: {objectives}. Create an agenda and key talking points.'
  },
  {
    id: 'document-review',
    nameKey: 'taskMode.templates.documentReview.name',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    descriptionKey: 'taskMode.templates.documentReview.description',
    estimatedTimeKey: 'taskMode.templates.documentReview.time',
    inputs: [
      { id: 'doc_type', labelKey: 'taskMode.templates.documentReview.typeLabel', type: 'select', optionKeys: ['taskMode.common.report', 'taskMode.common.proposal', 'taskMode.common.presentation', 'taskMode.common.article', 'taskMode.common.policy', 'taskMode.common.other'], required: true },
      { id: 'content', labelKey: 'taskMode.templates.documentReview.contentLabel', type: 'textarea', placeholderKey: 'taskMode.templates.documentReview.contentPlaceholder', required: true },
      { id: 'focus', labelKey: 'taskMode.templates.documentReview.focusLabel', type: 'text', placeholderKey: 'taskMode.templates.documentReview.focusPlaceholder' }
    ],
    systemPrompt: 'Review this {doc_type} and provide feedback. Focus on: {focus}. Content: {content}'
  },
  {
    id: 'brainstorm',
    nameKey: 'taskMode.templates.brainstorm.name',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
    descriptionKey: 'taskMode.templates.brainstorm.description',
    estimatedTimeKey: 'taskMode.templates.brainstorm.time',
    inputs: [
      { id: 'challenge', labelKey: 'taskMode.templates.brainstorm.challengeLabel', type: 'textarea', placeholderKey: 'taskMode.templates.brainstorm.challengePlaceholder', required: true },
      { id: 'constraints', labelKey: 'taskMode.templates.brainstorm.constraintsLabel', type: 'text', placeholderKey: 'taskMode.templates.brainstorm.constraintsPlaceholder' },
      { id: 'style', labelKey: 'taskMode.templates.brainstorm.styleLabel', type: 'select', optionKeys: ['taskMode.common.wideRange', 'taskMode.common.practicalSolutions', 'taskMode.common.creative', 'taskMode.common.quickWins'], required: true }
    ],
    systemPrompt: 'Help me brainstorm solutions for: {challenge}. Constraints: {constraints}. Generate ideas in a {style} manner.'
  },
  {
    id: 'project-plan',
    nameKey: 'taskMode.templates.projectPlan.name',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    descriptionKey: 'taskMode.templates.projectPlan.description',
    estimatedTimeKey: 'taskMode.templates.projectPlan.time',
    inputs: [
      { id: 'project', labelKey: 'taskMode.templates.projectPlan.projectLabel', type: 'text', placeholderKey: 'taskMode.templates.projectPlan.projectPlaceholder', required: true },
      { id: 'goal', labelKey: 'taskMode.templates.projectPlan.goalLabel', type: 'textarea', placeholderKey: 'taskMode.templates.projectPlan.goalPlaceholder', required: true },
      { id: 'timeline', labelKey: 'taskMode.templates.projectPlan.timelineLabel', type: 'select', optionKeys: ['taskMode.common.oneWeek', 'taskMode.common.twoWeeks', 'taskMode.common.oneMonth', 'taskMode.common.threeMonths', 'taskMode.common.flexible'], required: true }
    ],
    systemPrompt: 'Help me create a project plan for: {project}. End goal: {goal}. Timeline: {timeline}. Break it down into milestones and tasks.'
  }
];

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  if (!currentAgent) return '';

  return `
    <div class="task-mode-overlay">
      <div class="task-mode-backdrop"></div>
      <div class="task-mode-modal" role="dialog" aria-labelledby="task-title">
        <header class="task-mode-header">
          <div class="task-mode-title">
            <span class="task-mode-eyebrow">${t('taskMode.workModeWith')}</span>
            <h2 class="task-mode-name" id="task-title">${currentAgent.displayName || currentAgent.name}</h2>
          </div>
          <button class="task-close-btn" aria-label="${t('accessibility.close')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <div class="task-mode-content" id="task-content">
          ${renderCurrentStep()}
        </div>
      </div>
    </div>
  `;
}

function renderCurrentStep(): string {
  switch (currentStep) {
    case 'select':
      return renderSelectStep();
    case 'configure':
      return renderConfigureStep();
    case 'execute':
      return renderExecuteStep();
    default:
      return renderSelectStep();
  }
}

function renderSelectStep(): string {
  return `
    <div class="task-progress">
      <div class="task-progress-step active"></div>
      <div class="task-progress-step"></div>
      <div class="task-progress-step"></div>
    </div>

    <h3 class="task-step-title">${t('taskMode.selectStep.title')}</h3>
    <p class="task-step-subtitle">${t('taskMode.selectStep.subtitle')}</p>

    <div class="task-templates-list">
      ${TASK_TEMPLATES.map(template => `
        <button class="task-template-card ${taskData.template?.id === template.id ? 'selected' : ''}" data-template="${template.id}">
          <div class="task-template-icon">${template.icon}</div>
          <div class="task-template-info">
            <p class="task-template-name">${t(template.nameKey)}</p>
            <p class="task-template-desc">${t(template.descriptionKey)}</p>
            <div class="task-template-time">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              ${t(template.estimatedTimeKey)}
            </div>
          </div>
        </button>
      `).join('')}
    </div>

    <div class="task-actions" role="button" tabindex="0">
      <button aria-label="${t('accessibility.cancel')}" class="task-btn task-btn--secondary" data-action="cancel">${t('common.cancel')}</button>
      <button aria-label="${t('accessibility.continue')}" class="task-btn task-btn--primary" data-action="next" ${!taskData.template ? 'disabled' : ''}>
        ${t('common.continue')}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  `;
}

function renderConfigureStep(): string {
  if (!taskData.template) return '';

  return `
    <div class="task-progress">
      <div class="task-progress-step completed"></div>
      <div class="task-progress-step active"></div>
      <div class="task-progress-step"></div>
    </div>

    <h3 class="task-step-title">${t(taskData.template.nameKey)}</h3>
    <p class="task-step-subtitle">${t('taskMode.configureStep.subtitle')}</p>

    ${taskData.template.inputs.map(input => `
      <div class="task-input-group">
        <label class="task-label" for="input-${input.id}">
          ${t(input.labelKey)}
          ${input.required ? '<span class="required">*</span>' : ''}
        </label>
        ${input.type === 'textarea' ? `
          <textarea
            id="input-${input.id}"
            class="task-textarea"
            placeholder="${input.placeholderKey ? t(input.placeholderKey) : ''}"
            data-input-id="${input.id}"
          >${taskData.inputs[input.id] || ''}</textarea>
        ` : input.type === 'select' ? `
          <select id="input-${input.id}" class="task-select" data-input-id="${input.id}">
            <option value="">${t('taskMode.selectOption')}</option>
            ${input.optionKeys?.map((optKey, idx) => `
              <option value="${t(optKey)}" ${taskData.inputs[input.id] === t(optKey) ? 'selected' : ''}>${t(optKey)}</option>
            `).join('')}
          </select>
        ` : `
          <input
            type="text"
            id="input-${input.id}"
            class="task-input"
            placeholder="${input.placeholderKey ? t(input.placeholderKey) : ''}"
            data-input-id="${input.id}"
            value="${taskData.inputs[input.id] || ''}"
          />
        `}
      </div>
    `).join('')}

    <div class="task-actions" role="button" tabindex="0">
      <button aria-label="${t('accessibility.back')}" class="task-btn task-btn--secondary" data-action="back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        ${t('common.back')}
      </button>
      <button aria-label="${t('accessibility.continue')}" class="task-btn task-btn--primary" data-action="next">
        ${t('common.continue')}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  `;
}

function renderExecuteStep(): string {
  if (!taskData.template) return '';

  return `
    <div class="task-progress">
      <div class="task-progress-step completed"></div>
      <div class="task-progress-step completed"></div>
      <div class="task-progress-step active"></div>
    </div>

    <div class="task-summary">
      <div class="task-summary-header">
        <div class="task-summary-icon">${taskData.template.icon}</div>
        <div>
          <h3 class="task-summary-title">${t(taskData.template.nameKey)}</h3>
          <div class="task-summary-time">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            ${t(taskData.template.estimatedTimeKey)}
          </div>
        </div>
      </div>

      <div class="task-summary-inputs">
        ${taskData.template.inputs.filter(i => taskData.inputs[i.id]).map(input => `
          <div class="task-summary-input">
            <div class="task-summary-input-label">${t(input.labelKey)}</div>
            <div class="task-summary-input-value">${taskData.inputs[input.id]}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="task-actions" role="button" tabindex="0">
      <button aria-label="${t('accessibility.edit')}" class="task-btn task-btn--secondary" data-action="back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        ${t('common.edit')}
      </button>
      <button aria-label="${t('accessibility.startWorking')}" class="task-btn task-btn--primary" data-action="start-task">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        ${t('taskMode.startWorking')}
      </button>
    </div>
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function openTaskMode(agentId: string): Promise<void> {
  log.debug('Opening Task Mode for agent:', agentId);

  closeTaskMode();

  // Reset state
  currentStep = 'select';
  taskData = { template: null, inputs: {} };

  currentAgent = await getCustomAgent(agentId);
  if (!currentAgent) {
    log.error('Agent not found:', agentId);
    const { toast } = await import('./whisper.ui.js');
    toast.error("Couldn't find this assistant");
    return;
  }

  if (!document.querySelector('#task-mode-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'task-mode-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  taskModal = document.createElement('div');
  taskModal.innerHTML = render();
  document.body.appendChild(taskModal);

  requestAnimationFrame(() => {
    const modal = taskModal?.querySelector('.task-mode-modal');
    modal?.classList.add('visible');
  });

  attachListeners();
  soundUI.play('open');
}

export function closeTaskMode(): void {
  if (!taskModal) return;

  const modal = taskModal.querySelector('.task-mode-modal');
  modal?.classList.remove('visible');

  setTimeout(() => {
    taskModal?.remove();
    taskModal = null;
    currentAgent = null;
  }, DURATION.SLOW);

  soundUI.play('close');
}

// ============================================================================
// NAVIGATION
// ============================================================================

function updateContent(): void {
  const content = taskModal?.querySelector('#task-content');
  if (content) {
    content.innerHTML = renderCurrentStep();
    attachStepListeners();
  }
}

function attachStepListeners(): void {
  if (!taskModal) return;

  // Template selection
  taskModal.querySelectorAll('.task-template-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const templateId = (e.currentTarget as HTMLElement).dataset.template;
      taskData.template = TASK_TEMPLATES.find(t => t.id === templateId) || null;
      taskModal?.querySelectorAll('.task-template-card').forEach(c => c.classList.remove('selected'));
      (e.currentTarget as HTMLElement).classList.add('selected');
      const nextBtn = taskModal?.querySelector('[data-action="next"]') as HTMLButtonElement;
      if (nextBtn) nextBtn.disabled = false;
    });
  });

  // Input listeners
  taskModal.querySelectorAll('[data-input-id]').forEach(input => {
    const inputId = (input as HTMLElement).dataset.inputId!;
    input.addEventListener('input', () => {
      taskData.inputs[inputId] = (input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    });
    input.addEventListener('change', () => {
      taskData.inputs[inputId] = (input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    });
  });

  // Navigation buttons
  taskModal.querySelector('[data-action="cancel"]')?.addEventListener('click', closeTaskMode);
  taskModal.querySelector('[data-action="back"]')?.addEventListener('click', handleBack);
  taskModal.querySelector('[data-action="next"]')?.addEventListener('click', handleNext);
  taskModal.querySelector('[data-action="start-task"]')?.addEventListener('click', handleStartTask);
}

function handleBack(): void {
  if (currentStep === 'configure') {
    currentStep = 'select';
  } else if (currentStep === 'execute') {
    currentStep = 'configure';
  }
  updateContent();
}

function handleNext(): void {
  if (currentStep === 'select' && taskData.template) {
    currentStep = 'configure';
    updateContent();
  } else if (currentStep === 'configure') {
    // Validate required fields
    const template = taskData.template;
    if (template) {
      const missingRequired = template.inputs.find(i => i.required && !taskData.inputs[i.id]);
      if (missingRequired) {
        import('./whisper.ui.js').then(({ toast }) => {
          toast.warning(t('toasts.fillInRequiredField', { field: t(missingRequired.labelKey) }));
        });
        return;
      }
    }
    currentStep = 'execute';
    updateContent();
  }
}

async function handleStartTask(): Promise<void> {
  if (!currentAgent || !taskData.template) return;

  closeTaskMode();

  // Build task-specific prompt
  let prompt = taskData.template.systemPrompt;
  
  // Replace placeholders with actual values
  Object.entries(taskData.inputs).forEach(([key, value]) => {
    prompt = prompt.replace(`{${key}}`, value || 'not specified');
  });

  // Open talk interface with task context
  const { openTalkToTwin } = await import('./talk-to-twin.ui.js');
  await openTalkToTwin(currentAgent.id, `[WORK MODE - ${t(taskData.template.nameKey)}]\n\n${prompt}`);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachListeners(): void {
  if (!taskModal) return;

  taskModal.querySelector('.task-close-btn')?.addEventListener('click', closeTaskMode);
  taskModal.querySelector('.task-mode-backdrop')?.addEventListener('click', closeTaskMode);

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeTaskMode();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  attachStepListeners();
}

