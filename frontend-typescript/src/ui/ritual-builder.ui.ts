/**
 * Custom Ritual Builder UI
 *
 * Allows users to create their own daily practices.
 * Guides through ritual creation with supportive prompts.
 *
 * DESIGN SYSTEM COMPLIANCE:
 * - Uses shared components from engagement-components.ts
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Respects prefers-reduced-motion
 * - Humanized, encouraging copy
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import {
  ICONS,
  injectSharedStyles,
  escapeHtml,
  escapeAttr,
  renderCloseButton,
  renderBackButton,
  createAnimationConfig,
} from './engagement-components.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CustomRitual {
  name: string;
  description: string;
  duration: string;
  frequency: 'daily' | 'weekday' | 'weekend' | 'weekly';
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'anytime';
  personaId?: string;
  prompt?: string;
}

export interface RitualBuilderUICallbacks {
  onClose?: () => void;
  onSave?: (ritual: CustomRitual) => void;
}

// ============================================================================
// HUMANIZED COPY
// ============================================================================

const BUILDER_COPY = {
  title: 'Create a Practice',
  templateIntro: 'Choose a starting point or build from scratch',
  customizeTitle: 'Make it yours',
  previewTitle: 'Looking good',
  fieldLabels: {
    name: 'Give it a name',
    description: 'What will you do?',
    duration: 'How long?',
    frequency: 'How often?',
    time: 'Best time',
  },
  placeholders: {
    name: 'My Morning Practice',
    description: 'A brief description of what you\'ll do...',
  },
  buttons: {
    preview: 'Preview',
    edit: 'Adjust',
    save: 'Create Practice',
    close: 'Close',
    back: 'Go back',
  },
  validation: {
    nameRequired: 'Every practice needs a name',
  },
  confirmation: {
    created: 'Your practice is ready. You\'ve got this.',
  },
};

// ============================================================================
// RITUAL TEMPLATES
// ============================================================================

interface RitualTemplate {
  name: string;
  icon: keyof typeof ICONS;
  humanName: string;
  defaults: Partial<CustomRitual>;
}

const RITUAL_TEMPLATES: RitualTemplate[] = [
  {
    name: 'Morning Check-in',
    humanName: 'Morning moment',
    icon: 'sunny',
    defaults: {
      duration: '2 min',
      frequency: 'daily',
      preferredTime: 'morning',
      description: 'Start the day with intention',
    },
  },
  {
    name: 'Gratitude Moment',
    humanName: 'Gratitude pause',
    icon: 'heart',
    defaults: {
      duration: '1 min',
      frequency: 'daily',
      preferredTime: 'evening',
      description: 'Name three things you appreciate',
    },
  },
  {
    name: 'Weekly Review',
    humanName: 'Weekly reflection',
    icon: 'calendar',
    defaults: {
      duration: '10 min',
      frequency: 'weekly',
      preferredTime: 'morning',
      description: 'Reflect on wins and learnings',
    },
  },
  {
    name: 'Custom',
    humanName: 'Start fresh',
    icon: 'plus',
    defaults: {},
  },
];

// ============================================================================
// RITUAL BUILDER UI CLASS
// ============================================================================

class RitualBuilderUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: RitualBuilderUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private _isVisible = false;
  private currentStep = 0;
  private ritual: CustomRitual = {
    name: '',
    description: '',
    duration: '2 min',
    frequency: 'daily',
    preferredTime: 'morning',
  };

  initialize(): void {
    if (this.panel) return;
    // Inject shared design system styles
    injectSharedStyles();
    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: RitualBuilderUICallbacks): void {
    this.callbacks = callbacks;
  }

  show(): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    // Reset state
    this.currentStep = 0;
    this.ritual = {
      name: '',
      description: '',
      duration: '2 min',
      frequency: 'daily',
      preferredTime: 'morning',
    };

    this.renderStep();
    this.panel.classList.add('ritual-builder--visible');
    this._isVisible = true;

    // Entrance animation
    if (!prefersReducedMotion()) {
      this.wrapper.animate(
        [
          { opacity: 0, transform: 'scale(0.96) translateY(8px)' },
          { opacity: 1, transform: 'scale(1) translateY(0)' },
        ],
        createAnimationConfig(DURATION.MODERATE, EASING.EXPO_OUT)
      );
    }
  }

  hide(): void {
    if (!this.panel || !this.wrapper) return;

    if (!prefersReducedMotion()) {
      const anim = this.wrapper.animate(
        [
          { opacity: 1, transform: 'scale(1) translateY(0)' },
          { opacity: 0, transform: 'scale(0.98) translateY(8px)' },
        ],
        createAnimationConfig(DURATION.SLOW, EASING.STANDARD)
      );
      anim.onfinish = () => {
        this.panel?.classList.remove('ritual-builder--visible');
        this._isVisible = false;
        this.callbacks.onClose?.();
      };
    } else {
      this.panel.classList.remove('ritual-builder--visible');
      this._isVisible = false;
      this.callbacks.onClose?.();
    }
  }

  /** Check if the panel is currently visible */
  getIsVisible(): boolean {
    return this._isVisible;
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'ritual-builder';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', BUILDER_COPY.title);

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'ritual-builder__wrapper';
    this.panel.appendChild(this.wrapper);

    // Click outside to close
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isVisible) {
        this.hide();
      }
    });

    document.body.appendChild(this.panel);
  }

  private renderStep(): void {
    if (!this.wrapper) return;

    switch (this.currentStep) {
      case 0:
        this.renderTemplateStep();
        break;
      case 1:
        this.renderDetailsStep();
        break;
      case 2:
        this.renderPreviewStep();
        break;
    }
  }

  private renderTemplateStep(): void {
    if (!this.wrapper) return;

    const templatesHtml = RITUAL_TEMPLATES.map((t, i) => `
      <button class="ritual-builder__template" data-index="${i}" aria-label="Choose ${t.humanName}">
        <span class="ritual-builder__template-icon">${ICONS[t.icon]}</span>
        <span class="ritual-builder__template-name">${escapeHtml(t.humanName)}</span>
      </button>
    `).join('');

    this.wrapper.innerHTML = `
      <header class="ritual-builder__header">
        <h2>${BUILDER_COPY.title}</h2>
        ${renderCloseButton(BUILDER_COPY.buttons.close)}
      </header>

      <p class="ritual-builder__intro">${BUILDER_COPY.templateIntro}</p>

      <div class="ritual-builder__templates">
        ${templatesHtml}
      </div>
    `;

    // Bind close button (using shared class)
    this.wrapper.querySelector('.engagement-close-btn')?.addEventListener('click', () => this.hide());

    // Bind template buttons
    this.wrapper.querySelectorAll('.ritual-builder__template').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt((btn as HTMLElement).dataset.index || '0', 10);
        const template = RITUAL_TEMPLATES[index];
        if (template) {
          this.ritual = {
            ...this.ritual,
            name: template.name === 'Custom' ? '' : template.name,
            ...template.defaults,
          };
        }
        this.currentStep = 1;
        this.renderStep();
      });
    });

    // Staggered entrance for templates
    if (!prefersReducedMotion()) {
      this.wrapper.querySelectorAll('.ritual-builder__template').forEach((el, i) => {
        (el as HTMLElement).animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: DURATION.MODERATE,
            easing: EASING.EXPO_OUT,
            delay: i * 60,
            fill: 'forwards',
          }
        );
      });
    }
  }

  private renderDetailsStep(): void {
    if (!this.wrapper) return;

    const durationOptions = ['30 sec', '1 min', '2 min', '5 min', '10 min', '15 min'];
    const frequencyOptions: [string, string][] = [
      ['daily', 'Every day'],
      ['weekday', 'Weekdays'],
      ['weekend', 'Weekends'],
      ['weekly', 'Weekly'],
    ];
    const timeOptions = ['morning', 'afternoon', 'evening', 'anytime'];

    this.wrapper.innerHTML = `
      <header class="ritual-builder__header">
        ${renderBackButton(BUILDER_COPY.buttons.back)}
        <h2>${BUILDER_COPY.customizeTitle}</h2>
        ${renderCloseButton(BUILDER_COPY.buttons.close)}
      </header>

      <div class="ritual-builder__form">
        <div class="ritual-builder__field">
          <label for="ritual-name">${BUILDER_COPY.fieldLabels.name}</label>
          <input 
            type="text" 
            id="ritual-name" 
            class="engagement-input"
            value="${escapeAttr(this.ritual.name)}" 
            placeholder="${escapeAttr(BUILDER_COPY.placeholders.name)}" 
          />
        </div>

        <div class="ritual-builder__field">
          <label for="ritual-desc">${BUILDER_COPY.fieldLabels.description}</label>
          <textarea 
            id="ritual-desc" 
            class="engagement-textarea"
            rows="2" 
            placeholder="${escapeAttr(BUILDER_COPY.placeholders.description)}"
          >${escapeHtml(this.ritual.description)}</textarea>
        </div>

        <div class="ritual-builder__row">
          <div class="ritual-builder__field">
            <label>${BUILDER_COPY.fieldLabels.duration}</label>
            <select id="ritual-duration" class="engagement-select">
              ${durationOptions.map((d) => `
                <option value="${d}" ${this.ritual.duration === d ? 'selected' : ''}>${d}</option>
              `).join('')}
            </select>
          </div>

          <div class="ritual-builder__field">
            <label>${BUILDER_COPY.fieldLabels.frequency}</label>
            <select id="ritual-frequency" class="engagement-select">
              ${frequencyOptions.map(([v, l]) => `
                <option value="${v}" ${this.ritual.frequency === v ? 'selected' : ''}>${l}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="ritual-builder__field">
          <label>${BUILDER_COPY.fieldLabels.time}</label>
          <div class="ritual-builder__time-options">
            ${timeOptions.map((t) => `
              <button 
                class="ritual-builder__time-btn ${this.ritual.preferredTime === t ? 'ritual-builder__time-btn--active' : ''}" 
                data-time="${t}"
                type="button"
              >
                ${t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="ritual-builder__actions">
        <button class="engagement-btn-primary" type="button">${BUILDER_COPY.buttons.preview}</button>
      </div>
    `;

    // Bind buttons
    this.wrapper.querySelector('.engagement-close-btn')?.addEventListener('click', () => this.hide());
    this.wrapper.querySelector('.engagement-back-btn')?.addEventListener('click', () => {
      this.currentStep = 0;
      this.renderStep();
    });

    // Bind form inputs
    const nameInput = this.wrapper.querySelector('#ritual-name') as HTMLInputElement;
    const descInput = this.wrapper.querySelector('#ritual-desc') as HTMLTextAreaElement;
    const durationSelect = this.wrapper.querySelector('#ritual-duration') as HTMLSelectElement;
    const frequencySelect = this.wrapper.querySelector('#ritual-frequency') as HTMLSelectElement;

    nameInput?.addEventListener('input', () => {
      this.ritual.name = nameInput.value;
    });
    descInput?.addEventListener('input', () => {
      this.ritual.description = descInput.value;
    });
    durationSelect?.addEventListener('change', () => {
      this.ritual.duration = durationSelect.value;
    });
    frequencySelect?.addEventListener('change', () => {
      this.ritual.frequency = frequencySelect.value as CustomRitual['frequency'];
    });

    // Time buttons
    this.wrapper.querySelectorAll('.ritual-builder__time-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.ritual.preferredTime = (btn as HTMLElement).dataset.time as CustomRitual['preferredTime'];
        this.wrapper?.querySelectorAll('.ritual-builder__time-btn').forEach((b) =>
          b.classList.remove('ritual-builder__time-btn--active')
        );
        btn.classList.add('ritual-builder__time-btn--active');
      });
    });

    // Preview button
    this.wrapper.querySelector('.engagement-btn-primary')?.addEventListener('click', () => {
      if (!this.ritual.name.trim()) {
        nameInput.focus();
        nameInput.classList.add('ritual-builder__input--error');
        return;
      }
      this.currentStep = 2;
      this.renderStep();
    });
  }

  private renderPreviewStep(): void {
    if (!this.wrapper) return;

    const frequencyLabel = {
      daily: 'Every day',
      weekday: 'Weekdays',
      weekend: 'Weekends',
      weekly: 'Weekly',
    }[this.ritual.frequency];

    const timeLabel = this.ritual.preferredTime.charAt(0).toUpperCase() + this.ritual.preferredTime.slice(1);

    this.wrapper.innerHTML = `
      <header class="ritual-builder__header">
        ${renderBackButton(BUILDER_COPY.buttons.back)}
        <h2>${BUILDER_COPY.previewTitle}</h2>
        ${renderCloseButton(BUILDER_COPY.buttons.close)}
      </header>

      <div class="ritual-builder__preview">
        <div class="ritual-builder__preview-card">
          <h3>${escapeHtml(this.ritual.name)}</h3>
          <p>${escapeHtml(this.ritual.description) || 'No description yet'}</p>
          <div class="ritual-builder__preview-meta">
            <span class="ritual-builder__preview-tag">
              ${ICONS.clock}
              ${this.ritual.duration}
            </span>
            <span class="ritual-builder__preview-tag">
              ${ICONS.calendar}
              ${frequencyLabel}
            </span>
            <span class="ritual-builder__preview-tag">
              ${ICONS.sunny}
              ${timeLabel}
            </span>
          </div>
        </div>
      </div>

      <div class="ritual-builder__actions">
        <button class="engagement-btn-secondary" type="button">${BUILDER_COPY.buttons.edit}</button>
        <button class="engagement-btn-primary" type="button">${BUILDER_COPY.buttons.save}</button>
      </div>
    `;

    // Bind buttons
    this.wrapper.querySelector('.engagement-close-btn')?.addEventListener('click', () => this.hide());
    this.wrapper.querySelector('.engagement-back-btn')?.addEventListener('click', () => {
      this.currentStep = 1;
      this.renderStep();
    });

    this.wrapper.querySelector('.engagement-btn-secondary')?.addEventListener('click', () => {
      this.currentStep = 1;
      this.renderStep();
    });

    this.wrapper.querySelector('.engagement-btn-primary')?.addEventListener('click', () => {
      this.callbacks.onSave?.(this.ritual);
      this.hide();
    });

    // Preview card entrance animation
    if (!prefersReducedMotion()) {
      const card = this.wrapper.querySelector('.ritual-builder__preview-card');
      card?.animate(
        [
          { opacity: 0, transform: 'translateY(12px) scale(0.98)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        createAnimationConfig(DURATION.MODERATE, EASING.SPRING)
      );
    }
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'ritual-builder-styles';
    this.styleElement.textContent = `
      /* ========================================
         RITUAL BUILDER
         Design system compliant modal
         Uses shared button/input styles from engagement-components
         ======================================== */

      .ritual-builder {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest);
        background: var(--color-background-overlay);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        opacity: 0;
        visibility: hidden;
        transition: 
          opacity var(--duration-slow) var(--ease-standard), 
          visibility var(--duration-slow);
      }

      .ritual-builder--visible {
        opacity: 1;
        visibility: visible;
      }

      .ritual-builder__wrapper {
        width: 100%;
        max-width: 420px;
        max-height: 90vh;
        overflow-y: auto;
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-2xl);
      }

      /* Header */
      .ritual-builder__header {
        display: flex;
        align-items: center;
        gap: var(--ma-pause);
        padding: var(--ma-rest) var(--ma-silence);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .ritual-builder__header h2 {
        flex: 1;
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
        letter-spacing: var(--tracking-tight);
      }

      /* Intro text */
      .ritual-builder__intro {
        padding: var(--ma-pause) var(--ma-silence);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
        line-height: var(--leading-relaxed);
      }

      /* Template grid */
      .ritual-builder__templates {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--ma-pause);
        padding: var(--ma-pause) var(--ma-silence) var(--ma-rest);
      }

      .ritual-builder__template {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ma-breath);
        padding: var(--ma-rest);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: 
          background var(--duration-fast) var(--ease-gentle),
          transform var(--duration-fast) var(--ease-spring),
          box-shadow var(--duration-fast) var(--ease-gentle);
        opacity: 0; /* For staggered animation */
      }

      .ritual-builder__template:hover {
        background: var(--color-background-tertiary);
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
      }

      .ritual-builder__template:active {
        transform: scale(0.98);
      }

      .ritual-builder__template-icon {
        width: 32px;
        height: 32px;
        color: var(--persona-primary, var(--color-accent-primary));
      }

      .ritual-builder__template-icon svg {
        width: 100%;
        height: 100%;
      }

      .ritual-builder__template-name {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      /* Form */
      .ritual-builder__form {
        padding: var(--ma-rest) var(--ma-silence);
      }

      .ritual-builder__field {
        margin-bottom: var(--ma-pause);
      }

      .ritual-builder__field label {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
        margin-bottom: var(--ma-breath);
      }

      .ritual-builder__row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ma-pause);
      }

      /* Time options */
      .ritual-builder__time-options {
        display: flex;
        gap: var(--ma-breath);
      }

      .ritual-builder__time-btn {
        flex: 1;
        padding: var(--ma-breath) var(--ma-pause);
        font-family: var(--font-body);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: 
          background var(--duration-fast) var(--ease-gentle),
          color var(--duration-fast) var(--ease-gentle),
          border-color var(--duration-fast) var(--ease-gentle);
      }

      .ritual-builder__time-btn:hover {
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
      }

      .ritual-builder__time-btn--active {
        background: var(--persona-primary, var(--color-accent-primary));
        color: white;
        border-color: var(--persona-primary, var(--color-accent-primary));
      }

      /* Input error state */
      .ritual-builder__input--error {
        border-color: var(--color-semantic-error) !important;
        animation: inputShake var(--duration-slow) var(--ease-spring);
      }

      @keyframes inputShake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-4px); }
        40%, 80% { transform: translateX(4px); }
      }

      /* Preview */
      .ritual-builder__preview {
        padding: var(--ma-rest) var(--ma-silence);
      }

      .ritual-builder__preview-card {
        padding: var(--ma-rest);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
        border-left: 4px solid var(--persona-primary, var(--color-accent-primary));
      }

      .ritual-builder__preview-card h3 {
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--ma-breath) 0;
      }

      .ritual-builder__preview-card p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--ma-pause) 0;
        line-height: var(--leading-relaxed);
      }

      .ritual-builder__preview-meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ma-breath);
      }

      .ritual-builder__preview-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        background: var(--color-background-tertiary);
        padding: 4px var(--ma-breath);
        border-radius: var(--radius-full);
      }

      .ritual-builder__preview-tag svg {
        width: 12px;
        height: 12px;
      }

      /* Actions */
      .ritual-builder__actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--ma-pause);
        padding: var(--ma-pause) var(--ma-silence);
        border-top: 1px solid var(--color-border-subtle);
      }

      /* ========================================
         DARK THEME (Cedar Night)
         ======================================== */
      [data-theme="midnight"] .ritual-builder {
        background: var(--color-background-overlay);
      }

      [data-theme="midnight"] .ritual-builder__wrapper {
        background: var(--color-background-elevated);
        border-color: var(--color-border-medium);
      }

      [data-theme="midnight"] .ritual-builder__header h2,
      [data-theme="midnight"] .ritual-builder__template-name,
      [data-theme="midnight"] .ritual-builder__field label,
      [data-theme="midnight"] .ritual-builder__preview-card h3 {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .ritual-builder__intro,
      [data-theme="midnight"] .ritual-builder__preview-card p {
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .ritual-builder__template,
      [data-theme="midnight"] .ritual-builder__preview-card {
        background: var(--color-background-secondary);
        border-color: var(--color-border-subtle);
      }

      [data-theme="midnight"] .ritual-builder__template:hover {
        background: var(--color-background-tertiary);
      }

      [data-theme="midnight"] .ritual-builder__time-btn {
        background: var(--color-background-secondary);
        border-color: var(--color-border-subtle);
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .ritual-builder__time-btn:hover {
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .ritual-builder__preview-tag {
        background: var(--color-background-tertiary);
        color: var(--color-text-muted);
      }

      /* ========================================
         REDUCED MOTION
         ======================================== */
      @media (prefers-reduced-motion: reduce) {
        .ritual-builder {
          transition: opacity var(--duration-fast) linear;
        }

        .ritual-builder__template {
          opacity: 1;
        }

        .ritual-builder__template:hover {
          transform: none;
        }

        .ritual-builder__input--error {
          animation: none;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    this.hide();
    this.panel?.remove();
    this.styleElement?.remove();
    this.panel = null;
    this.wrapper = null;
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: RitualBuilderUI | null = null;

export function getRitualBuilderUI(): RitualBuilderUI {
  if (!instance) instance = new RitualBuilderUI();
  return instance;
}

export function initRitualBuilderUI(): void {
  getRitualBuilderUI().initialize();
}

export function showRitualBuilder(): void {
  getRitualBuilderUI().show();
}

export default RitualBuilderUI;
