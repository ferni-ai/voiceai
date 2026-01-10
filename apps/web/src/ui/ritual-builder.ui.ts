// TODO: Fix type errors - step array indexing
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
import { t } from '../i18n/index.js';
import {
  createAnimationConfig,
  escapeAttr,
  escapeHtml,
  ICONS,
  injectSharedStyles,
  renderBackButton,
  renderCloseButton,
} from './engagement-components.js';
import { apiGet } from '../utils/api.js';

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const displayMinute = String(minute).padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
}

function parseDurationToMinutes(duration: string): number {
  const match = duration.match(/(\d+)\s*(min|sec)/i);
  if (!match) return 5; // default
  const valueStr = match[1];
  const unitStr = match[2];
  if (!valueStr || !unitStr) return 5;
  const value = parseInt(valueStr, 10);
  const unit = unitStr.toLowerCase();
  return unit === 'sec' ? Math.ceil(value / 60) : value;
}

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

  // Calendar integration
  scheduleInCalendar?: boolean;
  specificTime?: { hour: number; minute: number };
  reminderMinutes?: number[];
}

export interface TimeSuggestion {
  time: string;
  hour: number;
  minute: number;
  dayOfWeek: string;
  confidence: number;
  reasoning: string;
  freeMinutes: number;
}

export interface RitualBuilderUICallbacks {
  onClose?: () => void;
  onSave?: (ritual: CustomRitual) => void;
}

// ============================================================================
// HUMANIZED COPY
// ============================================================================

const BUILDER_COPY = {
  title: 'Create Custom Practice',
  templateIntro: 'Choose a starting point or build from scratch',
  customizeTitle: 'Make it yours',
  calendarTitle: 'Add to Calendar',
  previewTitle: 'Looking good',
  fieldLabels: {
    name: 'Give it a name',
    description: 'What will you do?',
    duration: 'How long?',
    frequency: 'How often?',
    time: 'Best time',
    scheduleInCalendar: 'Add to your calendar',
    specificTime: 'Specific time',
    reminders: 'Remind me',
  },
  placeholders: {
    name: 'My Morning Practice',
    description: "A brief description of what you'll do...",
  },
  buttons: {
    preview: 'Preview',
    edit: 'Adjust',
    save: 'Create Practice',
    close: 'Close',
    back: 'Go back',
    suggestTimes: 'Find best time',
    skipCalendar: 'Skip calendar',
  },
  calendar: {
    enabled: "I'll add this to your calendar with reminders",
    disabled: 'No calendar events',
    loadingSuggestions: 'Finding the best times...',
    noSuggestions: 'No suggestions found',
    suggestion: 'Your calendar shows this time is usually free',
  },
  validation: {
    nameRequired: 'Every practice needs a name',
  },
  confirmation: {
    created: "Your practice is ready. You've got this.",
    withCalendar: "Your practice is scheduled. I'll remind you!",
  },
};

// ============================================================================
// RITUAL TEMPLATES - Powered by Behavioral Science
// ============================================================================

interface RitualTemplate {
  name: string;
  icon: keyof typeof ICONS;
  humanName: string;
  defaults: Partial<CustomRitual>;
  // Behavioral science context
  scienceNote: string;
  keystonePotential: number; // 0-100, how much this cascades into other habits
  habitLoop: {
    cue: string;
    routine: string;
    reward: string;
  };
  stacksWellWith: string[];
  tinyVersion: string; // Glidepath level 1
  outcomePreview: string; // What success looks like
  mayaGuidance: string; // Maya's coaching voice
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
    scienceNote: 'Morning intentions improve focus by 31% (Harvard Business Review)',
    keystonePotential: 85,
    habitLoop: {
      cue: 'After your feet hit the floor',
      routine: 'Pause, breathe, set one intention',
      reward: 'Feeling of clarity and control',
    },
    stacksWellWith: ['Gratitude pause', 'Movement'],
    tinyVersion: 'Just pause and take one conscious breath',
    outcomePreview: 'In 30 days: More focused mornings, clearer priorities',
    mayaGuidance: 'This is a keystone habit—it tends to make other good choices easier.',
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
    scienceNote: 'Gratitude practices increase happiness by 25% (UC Berkeley)',
    keystonePotential: 70,
    habitLoop: {
      cue: 'When you put your phone on the charger at night',
      routine: 'Name three things—big or small—that were good today',
      reward: 'Warm feeling of appreciation',
    },
    stacksWellWith: ['Evening wind-down', 'Journaling'],
    tinyVersion: 'Notice just one good thing from today',
    outcomePreview: 'In 30 days: Better sleep, more positive outlook',
    mayaGuidance: 'Evening gratitude helps your brain process the day. Even on hard days, there\'s always one thing.',
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
    scienceNote: 'Weekly reflection improves goal achievement by 42% (Dominican University)',
    keystonePotential: 75,
    habitLoop: {
      cue: 'Sunday morning with coffee/tea',
      routine: 'Review wins, note learnings, set intentions for the week',
      reward: 'Sense of progress and direction',
    },
    stacksWellWith: ['Calendar review', 'Planning session'],
    tinyVersion: 'Write down just one win from the week',
    outcomePreview: 'In 3 months: Clear sense of progress, better decisions',
    mayaGuidance: 'This is where the magic happens—seeing patterns over time that daily life hides.',
  },
  {
    name: 'Custom',
    humanName: 'Start fresh',
    icon: 'plus',
    defaults: {},
    scienceNote: 'Custom practices built around your life are 3x more likely to stick',
    keystonePotential: 50,
    habitLoop: {
      cue: 'You choose the trigger',
      routine: 'You design the practice',
      reward: 'You define what success feels like',
    },
    stacksWellWith: [],
    tinyVersion: 'Start with the smallest possible version',
    outcomePreview: 'A practice that\'s uniquely yours',
    mayaGuidance: 'Let\'s build something that fits your life perfectly. I\'ll help you make it stick.',
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
  private timeSuggestions: TimeSuggestion[] = [];
  private loadingSuggestions = false;
  private selectedTemplate: RitualTemplate | null = null;
  private ritual: CustomRitual = {
    name: '',
    description: '',
    duration: '2 min',
    frequency: 'daily',
    preferredTime: 'morning',
    scheduleInCalendar: false,
    reminderMinutes: [5],
  };

  initialize(): void {
    if (this.panel) return;
    // HMR protection: clean up any orphaned elements from previous instances
    this.cleanupOrphanedElements();
    // Inject shared design system styles
    injectSharedStyles();
    this.injectStyles();
    this.createPanel();
  }

  /**
   * HMR Protection: Remove orphaned elements from previous instances
   * Required per .cursorrules to prevent duplicate elements during hot reload
   */
  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.ritual-builder').forEach((el) => el.remove());
    document.querySelectorAll('#ritual-builder-styles').forEach((el) => el.remove());
  }

  setCallbacks(callbacks: RitualBuilderUICallbacks): void {
    this.callbacks = callbacks;
  }

  show(): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    // Reset state
    this.currentStep = 0;
    this.timeSuggestions = [];
    this.loadingSuggestions = false;
    this.selectedTemplate = null;
    this.ritual = {
      name: '',
      description: '',
      duration: '2 min',
      frequency: 'daily',
      preferredTime: 'morning',
      scheduleInCalendar: false,
      reminderMinutes: [5],
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
        this.renderCalendarStep();
        break;
      case 3:
        this.renderPreviewStep();
        break;
    }
  }

  private renderTemplateStep(): void {
    if (!this.wrapper) return;

    // Build rich template cards with behavioral science context
    const templatesHtml = RITUAL_TEMPLATES.map(
      (t, i) => `
      <button class="ritual-builder__template-card" data-index="${i}" aria-label="Choose ${t.humanName}">
        <div class="ritual-builder__template-header">
          <span class="ritual-builder__template-icon">${ICONS[t.icon]}</span>
          <div class="ritual-builder__template-title-row">
            <span class="ritual-builder__template-name">${escapeHtml(t.humanName)}</span>
            ${t.keystonePotential >= 75 ? `
              <span class="ritual-builder__keystone-badge" title="Keystone habit - tends to cascade into other positive changes">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                Keystone
              </span>
            ` : ''}
          </div>
        </div>
        <p class="ritual-builder__template-desc">${escapeHtml(t.defaults.description || t.outcomePreview)}</p>
        
        <!-- Behavioral Science Context -->
        <div class="ritual-builder__template-science">
          <span class="ritual-builder__science-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </span>
          <span class="ritual-builder__science-text">${escapeHtml(t.scienceNote)}</span>
        </div>
        
        <!-- Tiny Version Hint -->
        <div class="ritual-builder__tiny-hint">
          <span class="ritual-builder__tiny-label">Start tiny:</span>
          <span class="ritual-builder__tiny-text">${escapeHtml(t.tinyVersion)}</span>
        </div>
        
        ${t.duration ? `
          <div class="ritual-builder__template-meta">
            ${ICONS.clock}
            <span>${t.defaults.duration || '2 min'}</span>
          </div>
        ` : ''}
      </button>
    `
    ).join('');

    this.wrapper.innerHTML = `
      <header class="ritual-builder__header">
        <h2>${BUILDER_COPY.title}</h2>
        ${renderCloseButton(BUILDER_COPY.buttons.close)}
      </header>

      <!-- Maya's Guidance -->
      <div class="ritual-builder__maya-intro">
        <div class="ritual-builder__maya-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
        <div class="ritual-builder__maya-message">
          <p class="ritual-builder__maya-text">
            The best practice is one you'll actually do. Start smaller than you think—
            <em>tiny habits compound into transformation</em>.
          </p>
        </div>
      </div>

      <div class="ritual-builder__templates-list">
        ${templatesHtml}
      </div>

      <!-- Better Than Human Footer -->
      <div class="ritual-builder__bth-footer">
        <span class="ritual-builder__bth-icon">✨</span>
        <span class="ritual-builder__bth-text">
          I'll learn your patterns and find the perfect time for your practice.
        </span>
      </div>
    `;

    // Bind close button (using shared class)
    this.wrapper
      .querySelector('.engagement-close-btn')
      ?.addEventListener('click', () => this.hide());

    // Bind template buttons
    this.wrapper.querySelectorAll('.ritual-builder__template-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt((btn as HTMLElement).dataset.index || '0', 10);
        const template = RITUAL_TEMPLATES[index];
        if (template) {
          this.selectedTemplate = template;
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
      this.wrapper.querySelectorAll('.ritual-builder__template-card').forEach((el, i) => {
        (el as HTMLElement).style.opacity = '0';
        (el as HTMLElement).animate(
          [
            { opacity: 0, transform: 'translateY(12px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: DURATION.MODERATE,
            easing: EASING.SPRING,
            delay: 100 + (i * 80),
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
              ${durationOptions
                .map(
                  (d) => `
                <option value="${d}" ${this.ritual.duration === d ? 'selected' : ''}>${d}</option>
              `
                )
                .join('')}
            </select>
          </div>

          <div class="ritual-builder__field">
            <label>${BUILDER_COPY.fieldLabels.frequency}</label>
            <select id="ritual-frequency" class="engagement-select">
              ${frequencyOptions
                .map(
                  ([v, l]) => `
                <option value="${v}" ${this.ritual.frequency === v ? 'selected' : ''}>${l}</option>
              `
                )
                .join('')}
            </select>
          </div>
        </div>

        <div class="ritual-builder__field">
          <label>${BUILDER_COPY.fieldLabels.time}</label>
          <div class="ritual-builder__time-options">
            ${timeOptions
              .map(
                (t) => `
              <button 
                class="ritual-builder__time-btn ${this.ritual.preferredTime === t ? 'ritual-builder__time-btn--active' : ''}" 
                data-time="${t}"
                type="button"
              >
                ${t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            `
              )
              .join('')}
          </div>
        </div>
      </div>

      <div class="ritual-builder__actions" role="button" tabindex="0">
        <button aria-label="${t('accessibility.copy')}" class="engagement-btn-primary" type="button">${BUILDER_COPY.buttons.preview}</button>
      </div>
    `;

    // Bind buttons
    this.wrapper
      .querySelector('.engagement-close-btn')
      ?.addEventListener('click', () => this.hide());
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
        this.ritual.preferredTime = (btn as HTMLElement).dataset
          .time as CustomRitual['preferredTime'];
        this.wrapper
          ?.querySelectorAll('.ritual-builder__time-btn')
          .forEach((b) => b.classList.remove('ritual-builder__time-btn--active'));
        btn.classList.add('ritual-builder__time-btn--active');
      });
    });

    // Next button (to calendar step)
    this.wrapper.querySelector('.engagement-btn-primary')?.addEventListener('click', () => {
      if (!this.ritual.name.trim()) {
        nameInput.focus();
        nameInput.classList.add('ritual-builder__input--error');
        return;
      }
      this.currentStep = 2; // Go to calendar step
      this.renderStep();
    });
  }

  /**
   * Render the calendar integration step
   */
  private renderCalendarStep(): void {
    if (!this.wrapper) return;

    const reminderOptions = [
      { value: 5, label: '5 min before' },
      { value: 15, label: '15 min before' },
      { value: 30, label: '30 min before' },
      { value: 60, label: '1 hour before' },
    ];

    this.wrapper.innerHTML = `
      <header class="ritual-builder__header">
        ${renderBackButton(BUILDER_COPY.buttons.back)}
        <h2>${BUILDER_COPY.calendarTitle}</h2>
        ${renderCloseButton(BUILDER_COPY.buttons.close)}
      </header>

      <div class="ritual-builder__form">
        <div class="ritual-builder__calendar-toggle" role="button" tabindex="0">
          <label class="ritual-builder__toggle-container">
            <input type="checkbox" id="schedule-toggle" ${this.ritual.scheduleInCalendar ? 'checked' : ''} />
            <span class="ritual-builder__toggle-slider" role="button" tabindex="0"></span>
            <span class="ritual-builder__toggle-label" role="button" tabindex="0">${BUILDER_COPY.fieldLabels.scheduleInCalendar}</span>
          </label>
          <p class="ritual-builder__toggle-hint">
            ${this.ritual.scheduleInCalendar ? BUILDER_COPY.calendar.enabled : BUILDER_COPY.calendar.disabled}
          </p>
        </div>

        <div class="ritual-builder__calendar-options ${this.ritual.scheduleInCalendar ? '' : 'ritual-builder__calendar-options--hidden'}">
          <div class="ritual-builder__field">
            <label>${BUILDER_COPY.fieldLabels.specificTime}</label>
            <div class="ritual-builder__time-picker">
              <input 
                type="time" 
                id="specific-time"
                class="engagement-input"
                value="${this.ritual.specificTime ? `${String(this.ritual.specificTime.hour).padStart(2, '0')}:${String(this.ritual.specificTime.minute).padStart(2, '0')}` : ''}"
              />
              <button aria-label="${t('accessibility.copy')}" type="button" class="engagement-btn-secondary ritual-builder__suggest-btn">
                ${ICONS.clock}
                ${BUILDER_COPY.buttons.suggestTimes}
              </button>
            </div>
          </div>

          <div class="ritual-builder__suggestions ${this.timeSuggestions.length > 0 || this.loadingSuggestions ? '' : 'ritual-builder__suggestions--hidden'}">
            ${this.loadingSuggestions ? `
              <div class="ritual-builder__loading">${BUILDER_COPY.calendar.loadingSuggestions}</div>
            ` : this.timeSuggestions.length > 0 ? `
              <p class="ritual-builder__suggestion-hint">${BUILDER_COPY.calendar.suggestion}</p>
              <div class="ritual-builder__suggestion-list">
                ${this.timeSuggestions.slice(0, 3).map((s, i) => `
                  <button type="button" class="ritual-builder__suggestion-item" data-hour="${s.hour}" data-minute="${s.minute}" data-index="${i}">
                    <span class="ritual-builder__suggestion-time">${formatTime(s.hour, s.minute)}</span>
                    <span class="ritual-builder__suggestion-day">${s.dayOfWeek}</span>
                    <span class="ritual-builder__suggestion-reason">${s.reasoning}</span>
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="ritual-builder__field">
            <label>${BUILDER_COPY.fieldLabels.reminders}</label>
            <div class="ritual-builder__reminder-options">
              ${reminderOptions.map(opt => `
                <label class="ritual-builder__reminder-option">
                  <input 
                    type="checkbox" 
                    value="${opt.value}" 
                    ${this.ritual.reminderMinutes?.includes(opt.value) ? 'checked' : ''}
                  />
                  <span>${opt.label}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="ritual-builder__actions" role="button" tabindex="0">
        <button aria-label="${t('accessibility.copy')}" class="engagement-btn-secondary" type="button">${BUILDER_COPY.buttons.skipCalendar}</button>
        <button aria-label="${t('accessibility.copy')}" class="engagement-btn-primary" type="button">${BUILDER_COPY.buttons.preview}</button>
      </div>
    `;

    // Bind event handlers
    this.bindCalendarStepHandlers();

    // Animate entrance
    if (!prefersReducedMotion()) {
      const options = this.wrapper.querySelector('.ritual-builder__calendar-options');
      if (options && this.ritual.scheduleInCalendar) {
        (options as HTMLElement).animate(
          [
            { opacity: 0, transform: 'translateY(-8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          createAnimationConfig(DURATION.MODERATE, EASING.EXPO_OUT)
        );
      }
    }
  }

  private bindCalendarStepHandlers(): void {
    if (!this.wrapper) return;

    // Close button
    this.wrapper
      .querySelector('.engagement-close-btn')
      ?.addEventListener('click', () => this.hide());

    // Back button
    this.wrapper.querySelector('.engagement-back-btn')?.addEventListener('click', () => {
      this.currentStep = 1;
      this.renderStep();
    });

    // Schedule toggle
    const scheduleToggle = this.wrapper.querySelector('#schedule-toggle') as HTMLInputElement;
    scheduleToggle?.addEventListener('change', () => {
      this.ritual.scheduleInCalendar = scheduleToggle.checked;
      this.renderCalendarStep();
    });

    // Specific time input
    const timeInput = this.wrapper.querySelector('#specific-time') as HTMLInputElement;
    timeInput?.addEventListener('change', () => {
      if (timeInput.value) {
        const timeParts = timeInput.value.split(':').map(Number);
        const hours = timeParts[0] ?? 0;
        const minutes = timeParts[1] ?? 0;
        if (!isNaN(hours) && !isNaN(minutes)) {
          this.ritual.specificTime = { hour: hours, minute: minutes };
        }
      } else {
        this.ritual.specificTime = undefined;
      }
    });

    // Suggest times button
    this.wrapper.querySelector('.ritual-builder__suggest-btn')?.addEventListener('click', () => {
      this.fetchTimeSuggestions();
    });

    // Time suggestion items
    this.wrapper.querySelectorAll('.ritual-builder__suggestion-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const hour = parseInt((btn as HTMLElement).dataset.hour || '0', 10);
        const minute = parseInt((btn as HTMLElement).dataset.minute || '0', 10);
        this.ritual.specificTime = { hour, minute };
        
        // Update time input
        if (timeInput) {
          timeInput.value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        }

        // Highlight selected
        this.wrapper?.querySelectorAll('.ritual-builder__suggestion-item').forEach(b => 
          b.classList.remove('ritual-builder__suggestion-item--selected')
        );
        btn.classList.add('ritual-builder__suggestion-item--selected');
      });
    });

    // Reminder checkboxes
    this.wrapper.querySelectorAll('.ritual-builder__reminder-option input').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const checked = this.wrapper?.querySelectorAll('.ritual-builder__reminder-option input:checked') || [];
        this.ritual.reminderMinutes = Array.from(checked).map(
          c => parseInt((c as HTMLInputElement).value, 10)
        );
      });
    });

    // Skip calendar button
    this.wrapper.querySelector('.engagement-btn-secondary')?.addEventListener('click', () => {
      this.ritual.scheduleInCalendar = false;
      this.currentStep = 3;
      this.renderStep();
    });

    // Preview button
    this.wrapper.querySelector('.engagement-btn-primary')?.addEventListener('click', () => {
      this.currentStep = 3;
      this.renderStep();
    });
  }

  private async fetchTimeSuggestions(): Promise<void> {
    this.loadingSuggestions = true;
    this.renderCalendarStep();

    try {
      const durationMinutes = parseDurationToMinutes(this.ritual.duration);
      const params = new URLSearchParams({
        durationMinutes: String(durationMinutes),
        preferredTime: this.ritual.preferredTime,
        frequency: this.ritual.frequency,
      });

      const response = await apiGet<{ suggestions?: string[] }>(
        `/api/practices/time-suggestions?${params}`
      );
      if (response.ok && response.data) {
        this.timeSuggestions = response.data.suggestions || [];
      }
    } catch (err) {
      // Silently fail - suggestions are optional
      this.timeSuggestions = [];
    } finally {
      this.loadingSuggestions = false;
      this.renderCalendarStep();
    }
  }

  private renderPreviewStep(): void {
    if (!this.wrapper) return;

    const frequencyLabel = {
      daily: 'Every day',
      weekday: 'Weekdays',
      weekend: 'Weekends',
      weekly: 'Weekly',
    }[this.ritual.frequency];

    const timeLabel =
      this.ritual.preferredTime.charAt(0).toUpperCase() + this.ritual.preferredTime.slice(1);

    // Get template data for rich preview
    const template = this.selectedTemplate;

    // Calendar badge content
    const calendarBadgeHtml = this.ritual.scheduleInCalendar
      ? `<div class="ritual-builder__preview-calendar">
          <span class="ritual-builder__preview-calendar-badge">
            ${ICONS.calendar}
            On your calendar
          </span>
          ${this.ritual.specificTime 
            ? `<span class="ritual-builder__preview-calendar-time">
                ${formatTime(this.ritual.specificTime.hour, this.ritual.specificTime.minute)}
              </span>` 
            : ''}
          ${this.ritual.reminderMinutes?.length 
            ? `<span class="ritual-builder__preview-calendar-reminder">
                Reminder ${this.ritual.reminderMinutes.includes(5) ? '5 min' : this.ritual.reminderMinutes[0] + ' min'} before
              </span>` 
            : ''}
        </div>`
      : '';

    // Habit Loop visualization if template has one
    const habitLoopHtml = template?.habitLoop ? `
      <div class="ritual-builder__habit-loop">
        <h4 class="ritual-builder__habit-loop-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
          </svg>
          Your habit loop
        </h4>
        <div class="ritual-builder__loop-steps">
          <div class="ritual-builder__loop-step">
            <span class="ritual-builder__loop-badge ritual-builder__loop-badge--cue">Cue</span>
            <span class="ritual-builder__loop-text">${escapeHtml(template.habitLoop.cue)}</span>
          </div>
          <div class="ritual-builder__loop-arrow">→</div>
          <div class="ritual-builder__loop-step">
            <span class="ritual-builder__loop-badge ritual-builder__loop-badge--routine">Routine</span>
            <span class="ritual-builder__loop-text">${escapeHtml(template.habitLoop.routine)}</span>
          </div>
          <div class="ritual-builder__loop-arrow">→</div>
          <div class="ritual-builder__loop-step">
            <span class="ritual-builder__loop-badge ritual-builder__loop-badge--reward">Reward</span>
            <span class="ritual-builder__loop-text">${escapeHtml(template.habitLoop.reward)}</span>
          </div>
        </div>
      </div>
    ` : '';

    // Outcome preview if template has one
    const outcomeHtml = template?.outcomePreview ? `
      <div class="ritual-builder__outcome-preview">
        <div class="ritual-builder__outcome-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          </svg>
        </div>
        <div class="ritual-builder__outcome-content">
          <span class="ritual-builder__outcome-label">What to expect</span>
          <span class="ritual-builder__outcome-text">${escapeHtml(template.outcomePreview)}</span>
        </div>
      </div>
    ` : '';

    // Maya's encouragement
    const mayaGuidanceHtml = template?.mayaGuidance ? `
      <div class="ritual-builder__maya-guidance">
        <div class="ritual-builder__maya-mini">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83"/>
          </svg>
        </div>
        <p class="ritual-builder__maya-note">${escapeHtml(template.mayaGuidance)}</p>
      </div>
    ` : '';

    this.wrapper.innerHTML = `
      <header class="ritual-builder__header">
        ${renderBackButton(BUILDER_COPY.buttons.back)}
        <h2>${BUILDER_COPY.previewTitle}</h2>
        ${renderCloseButton(BUILDER_COPY.buttons.close)}
      </header>

      <div class="ritual-builder__preview">
        <!-- Main Practice Card -->
        <div class="ritual-builder__preview-card ${this.ritual.scheduleInCalendar ? 'ritual-builder__preview-card--calendar' : ''}">
          <div class="ritual-builder__preview-header">
            <h3>${escapeHtml(this.ritual.name)}</h3>
            ${template && template.keystonePotential >= 75 ? `
              <span class="ritual-builder__preview-keystone">
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="12" height="12">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                Keystone
              </span>
            ` : ''}
          </div>
          <p class="ritual-builder__preview-desc">${escapeHtml(this.ritual.description) || 'No description yet'}</p>
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
          ${calendarBadgeHtml}
        </div>

        <!-- Habit Loop Visualization -->
        ${habitLoopHtml}

        <!-- Outcome Preview -->
        ${outcomeHtml}

        <!-- Maya's Guidance -->
        ${mayaGuidanceHtml}
      </div>

      <div class="ritual-builder__actions" role="button" tabindex="0">
        <button aria-label="${t('accessibility.edit')}" class="engagement-btn-secondary" type="button">${BUILDER_COPY.buttons.edit}</button>
        <button aria-label="${t('accessibility.copy')}" class="engagement-btn-primary" type="button">${BUILDER_COPY.buttons.save}</button>
      </div>
    `;

    // Bind buttons
    this.wrapper
      .querySelector('.engagement-close-btn')
      ?.addEventListener('click', () => this.hide());
    this.wrapper.querySelector('.engagement-back-btn')?.addEventListener('click', () => {
      this.currentStep = 2; // Go back to calendar step
      this.renderStep();
    });

    this.wrapper.querySelector('.engagement-btn-secondary')?.addEventListener('click', () => {
      this.currentStep = 1; // Go to details step for editing
      this.renderStep();
    });

    this.wrapper.querySelector('.engagement-btn-primary')?.addEventListener('click', () => {
      this.callbacks.onSave?.(this.ritual);
      this.hide();
    });

    // Preview card entrance animation
    if (!prefersReducedMotion()) {
      // Staggered entrance for all preview sections
      const sections = this.wrapper.querySelectorAll('.ritual-builder__preview > *');
      sections.forEach((section, i) => {
        (section as HTMLElement).style.opacity = '0';
        (section as HTMLElement).animate(
          [
            { opacity: 0, transform: 'translateY(12px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: DURATION.MODERATE,
            easing: EASING.SPRING,
            delay: i * 80,
            fill: 'forwards',
          }
        );
      });
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
        background: rgba(44, 37, 32, 0.75);
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
        max-width: clamp(294px, 90vw, 420px);
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

      /* ========================================
         MAYA'S INTRO - Coaching Voice
         ======================================== */

      .ritual-builder__maya-intro {
        display: flex;
        gap: var(--ma-pause);
        padding: var(--ma-pause) var(--ma-silence);
        background: linear-gradient(
          135deg,
          rgba(166, 122, 106, 0.08),
          var(--color-background-secondary)
        );
        border-radius: var(--radius-lg);
        margin: var(--ma-pause) var(--ma-silence);
      }

      .ritual-builder__maya-avatar {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, var(--persona-maya, #a67a6a), #8a635a);
        border-radius: var(--radius-full);
        color: white;
      }

      .ritual-builder__maya-message {
        flex: 1;
      }

      .ritual-builder__maya-text {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed);
        margin: 0;
      }

      .ritual-builder__maya-text em {
        color: var(--persona-maya, #a67a6a);
        font-style: normal;
        font-weight: var(--font-weight-medium, 500);
      }

      /* ========================================
         TEMPLATE CARDS - Rich Behavioral Science Context
         ======================================== */

      .ritual-builder__templates-list {
        display: flex;
        flex-direction: column;
        gap: var(--ma-pause);
        padding: 0 var(--ma-silence) var(--ma-pause);
      }

      .ritual-builder__template-card {
        display: flex;
        flex-direction: column;
        gap: var(--ma-breath);
        padding: var(--ma-rest);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg);
        cursor: pointer;
        text-align: left;
        transition: 
          background var(--duration-fast) var(--ease-gentle),
          transform var(--duration-fast) var(--ease-spring),
          border-color var(--duration-fast) var(--ease-gentle),
          box-shadow var(--duration-fast) var(--ease-gentle);
      }

      .ritual-builder__template-card:hover {
        background: var(--color-background-tertiary);
        border-color: var(--persona-maya, #a67a6a);
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
      }

      .ritual-builder__template-card:active {
        transform: scale(0.99);
      }

      .ritual-builder__template-header {
        display: flex;
        align-items: flex-start;
        gap: var(--ma-pause);
      }

      .ritual-builder__template-icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-tint, rgba(166, 122, 106, 0.1));
        border-radius: var(--radius-md);
        color: var(--persona-maya, #a67a6a);
        flex-shrink: 0;
      }

      .ritual-builder__template-icon svg {
        width: 22px;
        height: 22px;
      }

      .ritual-builder__template-title-row {
        flex: 1;
        display: flex;
        align-items: center;
        gap: var(--ma-breath);
        flex-wrap: wrap;
      }

      .ritual-builder__template-name {
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
      }

      .ritual-builder__keystone-badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 8px;
        background: linear-gradient(135deg, rgba(166, 122, 106, 0.15), rgba(166, 122, 106, 0.08));
        border-radius: var(--radius-full);
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--persona-maya, #a67a6a);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .ritual-builder__keystone-badge svg {
        fill: currentColor;
        stroke: none;
      }

      .ritual-builder__template-desc {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed);
        margin: 0;
      }

      /* Science Note */
      .ritual-builder__template-science {
        display: flex;
        align-items: flex-start;
        gap: var(--ma-breath);
        padding: var(--ma-breath) var(--ma-pause);
        background: var(--color-background-tertiary);
        border-radius: var(--radius-md);
        margin-top: var(--ma-breath);
      }

      .ritual-builder__science-icon {
        color: var(--persona-peter, #3a6b73);
        flex-shrink: 0;
        margin-top: 1px;
      }

      .ritual-builder__science-text {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        line-height: 1.4;
        font-style: italic;
      }

      /* Tiny Hint */
      .ritual-builder__tiny-hint {
        display: flex;
        align-items: baseline;
        gap: var(--ma-breath);
        margin-top: var(--ma-breath);
      }

      .ritual-builder__tiny-label {
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--persona-maya, #a67a6a);
        flex-shrink: 0;
      }

      .ritual-builder__tiny-text {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
      }

      .ritual-builder__template-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        padding-top: var(--ma-breath);
        border-top: 1px solid var(--color-border-subtle);
        margin-top: var(--ma-breath);
      }

      .ritual-builder__template-meta svg {
        width: 12px;
        height: 12px;
      }

      /* Better Than Human Footer */
      .ritual-builder__bth-footer {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--ma-breath);
        padding: var(--ma-pause) var(--ma-silence);
        background: var(--color-background-secondary);
        border-top: 1px solid var(--color-border-subtle);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .ritual-builder__bth-icon {
        font-size: var(--text-sm);
      }

      .ritual-builder__bth-text {
        font-style: italic;
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
        border-color: var(--color-accent-text);
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

      /* ========================================
         CALENDAR STEP
         ======================================== */

      .ritual-builder__calendar-toggle {
        margin-bottom: var(--ma-rest);
      }

      .ritual-builder__toggle-container {
        display: flex;
        align-items: center;
        gap: var(--ma-pause);
        cursor: pointer;
        user-select: none;
      }

      .ritual-builder__toggle-container input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }

      .ritual-builder__toggle-slider {
        position: relative;
        width: 48px;
        height: 26px;
        background: var(--color-background-tertiary);
        border-radius: var(--radius-full);
        transition: background var(--duration-fast) var(--ease-gentle);
      }

      .ritual-builder__toggle-slider::before {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        box-shadow: var(--shadow-sm);
        transition: transform var(--duration-fast) var(--ease-spring);
      }

      .ritual-builder__toggle-container input:checked + .ritual-builder__toggle-slider {
        background: var(--persona-primary, var(--color-accent-primary));
      }

      .ritual-builder__toggle-container input:checked + .ritual-builder__toggle-slider::before {
        transform: translateX(22px);
      }

      .ritual-builder__toggle-label {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .ritual-builder__toggle-hint {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin: var(--ma-breath) 0 0 0;
        padding-left: calc(48px + var(--ma-pause));
      }

      .ritual-builder__calendar-options {
        opacity: 1;
        max-height: 500px;
        overflow: hidden;
        transition: 
          opacity var(--duration-moderate) var(--ease-gentle),
          max-height var(--duration-moderate) var(--ease-gentle);
      }

      .ritual-builder__calendar-options--hidden {
        opacity: 0;
        max-height: 0;
        pointer-events: none;
      }

      .ritual-builder__time-picker {
        display: flex;
        gap: var(--ma-pause);
      }

      .ritual-builder__time-picker input[type="time"] {
        flex: 1;
      }

      .ritual-builder__suggest-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }

      .ritual-builder__suggest-btn svg {
        width: 16px;
        height: 16px;
      }

      .ritual-builder__suggestions {
        margin-top: var(--ma-pause);
        padding: var(--ma-pause);
        background: var(--color-background-tertiary);
        border-radius: var(--radius-md);
      }

      .ritual-builder__suggestions--hidden {
        display: none;
      }

      .ritual-builder__loading {
        text-align: center;
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        padding: var(--ma-pause);
      }

      .ritual-builder__suggestion-hint {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin: 0 0 var(--ma-breath) 0;
      }

      .ritual-builder__suggestion-list {
        display: flex;
        flex-direction: column;
        gap: var(--ma-breath);
      }

      .ritual-builder__suggestion-item {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ma-breath);
        padding: var(--ma-breath) var(--ma-pause);
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        cursor: pointer;
        text-align: left;
        transition: 
          background var(--duration-fast) var(--ease-gentle),
          border-color var(--duration-fast) var(--ease-gentle);
      }

      .ritual-builder__suggestion-item:hover {
        background: var(--color-background-secondary);
        border-color: var(--persona-primary, var(--color-accent-primary));
      }

      .ritual-builder__suggestion-item--selected {
        background: var(--color-background-secondary);
        border-color: var(--persona-primary, var(--color-accent-primary));
        border-width: 2px;
      }

      .ritual-builder__suggestion-time {
        font-family: var(--font-display);
        font-weight: var(--font-weight-semibold, 600);
        font-size: var(--text-sm);
        color: var(--color-text-primary);
      }

      .ritual-builder__suggestion-day {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        padding: 2px 6px;
        background: var(--color-background-tertiary);
        border-radius: var(--radius-sm);
      }

      .ritual-builder__suggestion-reason {
        flex: 1 0 100%;
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        margin-top: 2px;
      }

      .ritual-builder__reminder-options {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ma-breath);
      }

      .ritual-builder__reminder-option {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: var(--ma-breath) var(--ma-pause);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        cursor: pointer;
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        transition: 
          background var(--duration-fast) var(--ease-gentle),
          border-color var(--duration-fast) var(--ease-gentle);
      }

      .ritual-builder__reminder-option:has(input:checked) {
        background: var(--color-background-tertiary);
        border-color: var(--persona-primary, var(--color-accent-primary));
        color: var(--color-text-primary);
      }

      .ritual-builder__reminder-option input {
        accent-color: var(--persona-primary, var(--color-accent-primary));
      }

      /* ========================================
         PREVIEW STEP - Rich Outcome Visualization
         ======================================== */

      .ritual-builder__preview {
        padding: var(--ma-rest) var(--ma-silence);
        display: flex;
        flex-direction: column;
        gap: var(--ma-pause);
      }

      .ritual-builder__preview-card {
        padding: var(--ma-rest);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
        border-left: 4px solid var(--persona-maya, #a67a6a);
      }

      .ritual-builder__preview-card--calendar {
        border-color: var(--color-semantic-success, #4caf50);
      }

      .ritual-builder__preview-header {
        display: flex;
        align-items: center;
        gap: var(--ma-breath);
        margin-bottom: var(--ma-breath);
      }

      .ritual-builder__preview-header h3 {
        flex: 1;
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .ritual-builder__preview-keystone {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 8px;
        background: linear-gradient(135deg, rgba(166, 122, 106, 0.15), rgba(166, 122, 106, 0.08));
        border-radius: var(--radius-full);
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--persona-maya, #a67a6a);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .ritual-builder__preview-desc {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--ma-pause) 0;
        line-height: var(--leading-relaxed);
      }

      .ritual-builder__preview-calendar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ma-breath);
        margin-top: var(--ma-pause);
        padding-top: var(--ma-pause);
        border-top: 1px solid var(--color-border-subtle);
      }

      .ritual-builder__preview-calendar-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--text-xs);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-semantic-success, #4caf50);
        background: rgba(76, 175, 80, 0.1);
        padding: 4px var(--ma-breath);
        border-radius: var(--radius-full);
      }

      .ritual-builder__preview-calendar-badge svg {
        width: 12px;
        height: 12px;
      }

      .ritual-builder__preview-calendar-time,
      .ritual-builder__preview-calendar-reminder {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
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

      /* Habit Loop Visualization */
      .ritual-builder__habit-loop {
        padding: var(--ma-rest);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-border-subtle);
      }

      .ritual-builder__habit-loop-title {
        display: flex;
        align-items: center;
        gap: var(--ma-breath);
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--ma-pause) 0;
      }

      .ritual-builder__habit-loop-title svg {
        color: var(--persona-maya, #a67a6a);
      }

      .ritual-builder__loop-steps {
        display: flex;
        flex-direction: column;
        gap: var(--ma-breath);
      }

      .ritual-builder__loop-step {
        display: flex;
        align-items: flex-start;
        gap: var(--ma-breath);
      }

      .ritual-builder__loop-badge {
        flex-shrink: 0;
        padding: 2px 8px;
        border-radius: var(--radius-sm);
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .ritual-builder__loop-badge--cue {
        background: rgba(58, 107, 115, 0.12);
        color: var(--persona-peter, #3a6b73);
      }

      .ritual-builder__loop-badge--routine {
        background: rgba(166, 122, 106, 0.12);
        color: var(--persona-maya, #a67a6a);
      }

      .ritual-builder__loop-badge--reward {
        background: rgba(196, 133, 106, 0.12);
        color: var(--persona-jordan, #c4856a);
      }

      .ritual-builder__loop-text {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: 1.4;
      }

      .ritual-builder__loop-arrow {
        display: none; /* Use vertical layout on mobile */
        color: var(--color-text-dimmed);
      }

      /* Outcome Preview */
      .ritual-builder__outcome-preview {
        display: flex;
        align-items: flex-start;
        gap: var(--ma-pause);
        padding: var(--ma-pause);
        background: linear-gradient(
          135deg,
          rgba(196, 133, 106, 0.08),
          var(--color-background-secondary)
        );
        border-radius: var(--radius-lg);
        border: 1px solid rgba(196, 133, 106, 0.15);
      }

      .ritual-builder__outcome-icon {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, var(--persona-jordan, #c4856a), #a86d55);
        border-radius: var(--radius-md);
        color: white;
      }

      .ritual-builder__outcome-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .ritual-builder__outcome-label {
        font-size: var(--text-2xs, 0.625rem);
        font-weight: var(--font-weight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--persona-jordan, #c4856a);
      }

      .ritual-builder__outcome-text {
        font-size: var(--text-sm);
        color: var(--color-text-primary);
        line-height: 1.4;
      }

      /* Maya's Guidance */
      .ritual-builder__maya-guidance {
        display: flex;
        align-items: flex-start;
        gap: var(--ma-breath);
        padding: var(--ma-pause);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
        border-left: 3px solid var(--persona-maya, #a67a6a);
      }

      .ritual-builder__maya-mini {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-maya, #a67a6a);
        border-radius: var(--radius-full);
        color: white;
      }

      .ritual-builder__maya-note {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed);
        margin: 0;
        font-style: italic;
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

      [data-theme="midnight"] .ritual-builder__template-card,
      [data-theme="midnight"] .ritual-builder__preview-card,
      [data-theme="midnight"] .ritual-builder__habit-loop,
      [data-theme="midnight"] .ritual-builder__maya-guidance {
        background: var(--color-background-secondary);
        border-color: var(--color-border-subtle);
      }

      [data-theme="midnight"] .ritual-builder__template-card:hover {
        background: var(--color-background-tertiary);
      }

      [data-theme="midnight"] .ritual-builder__outcome-preview {
        background: linear-gradient(
          135deg,
          rgba(196, 133, 106, 0.12),
          var(--color-background-tertiary)
        );
      }

      [data-theme="midnight"] .ritual-builder__loop-badge--cue {
        background: rgba(58, 107, 115, 0.2);
      }

      [data-theme="midnight"] .ritual-builder__loop-badge--routine {
        background: rgba(166, 122, 106, 0.2);
      }

      [data-theme="midnight"] .ritual-builder__loop-badge--reward {
        background: rgba(196, 133, 106, 0.2);
      }

      [data-theme="midnight"] .ritual-builder__maya-intro {
        background: linear-gradient(
          135deg,
          rgba(166, 122, 106, 0.12),
          var(--color-background-tertiary)
        );
      }

      [data-theme="midnight"] .ritual-builder__template-science {
        background: var(--color-background-tertiary);
      }

      [data-theme="midnight"] .ritual-builder__keystone-badge {
        background: linear-gradient(135deg, rgba(166, 122, 106, 0.2), rgba(166, 122, 106, 0.1));
      }

      [data-theme="midnight"] .ritual-builder__bth-footer {
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
