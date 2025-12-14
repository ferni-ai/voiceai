/**
 * Outreach Preferences UI
 *
 * Let users control how and when Ferni reaches out to them.
 * 
 * Settings:
 * - Enable/disable proactive check-ins
 * - Preferred channel (push/email/SMS)
 * - Frequency limits (per day, per week)
 * - Quiet hours
 * - Quiet days
 *
 * DESIGN: Centered modal with warm, conversational copy
 * 
 * @module OutreachPreferencesUI
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('OutreachPrefs');

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachPreferences {
  enabled: boolean;
  maxPerDay: number;
  maxPerWeek: number;
  preferredChannel: 'push' | 'email' | 'sms' | 'any';
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "08:00"
  quietDays: string[]; // ["saturday", "sunday"]
}

export interface OutreachPreferencesCallbacks {
  onSave?: (prefs: OutreachPreferences) => Promise<void>;
  onClose?: () => void;
}

// ============================================================================
// ICONS (Lucide)
// ============================================================================

const ICONS = {
  bell: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// ============================================================================
// DEFAULT PREFERENCES
// ============================================================================

const DEFAULT_PREFS: OutreachPreferences = {
  enabled: true,
  maxPerDay: 2,
  maxPerWeek: 5,
  preferredChannel: 'any',
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  quietDays: [],
};

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  /* Modal Overlay */
  .outreach-prefs-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 1400);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4, 16px);
    opacity: 0;
    visibility: hidden;
    transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
                visibility ${DURATION.NORMAL}ms ${EASING.STANDARD};
  }

  .outreach-prefs-overlay--visible {
    opacity: 1;
    visibility: visible;
  }

  .outreach-prefs-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.4);
    backdrop-filter: blur(var(--glass-blur-strong, 24px));
    -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
  }

  /* Modal Card */
  .outreach-prefs-card {
    position: relative;
    width: 100%;
    max-width: 420px;
    max-height: 85vh;
    background: var(--color-background-elevated, #fffdfb);
    border-radius: var(--radius-2xl, 24px);
    box-shadow: var(--shadow-2xl, 0 24px 48px rgba(44, 37, 32, 0.15));
    overflow: hidden;
    transform: scale(0.9);
    transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
  }

  .outreach-prefs-overlay--visible .outreach-prefs-card {
    transform: scale(1);
  }

  /* Header */
  .outreach-prefs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
  }

  .outreach-prefs-header-left {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
  }

  .outreach-prefs-eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .outreach-prefs-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary, #2C2520);
    margin: 0;
  }

  .outreach-prefs-close {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-full, 9999px);
    color: var(--color-text-secondary, #5c544a);
    cursor: pointer;
    transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .outreach-prefs-close:hover {
    background: var(--color-background-secondary, #f5f2ed);
  }

  .outreach-prefs-close svg {
    width: 20px;
    height: 20px;
  }

  /* Content */
  .outreach-prefs-content {
    padding: var(--space-6, 24px);
    overflow-y: auto;
    max-height: calc(85vh - 160px);
  }

  /* Section */
  .outreach-prefs-section {
    margin-bottom: var(--space-6, 24px);
  }

  .outreach-prefs-section:last-child {
    margin-bottom: 0;
  }

  .outreach-prefs-section-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--color-text-muted, #8a8078);
    margin-bottom: var(--space-3, 12px);
  }

  /* Toggle Row */
  .outreach-prefs-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4, 16px);
    background: var(--color-background-secondary, #f5f2ed);
    border-radius: var(--radius-lg, 12px);
    margin-bottom: var(--space-3, 12px);
  }

  .outreach-prefs-toggle-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
  }

  .outreach-prefs-toggle-label {
    font-weight: 500;
    color: var(--color-text-primary, #2C2520);
  }

  .outreach-prefs-toggle-desc {
    font-size: 13px;
    color: var(--color-text-muted, #8a8078);
  }

  /* Toggle Switch */
  .outreach-prefs-toggle {
    position: relative;
    width: 48px;
    height: 28px;
    background: var(--color-border, rgba(44, 37, 32, 0.2));
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .outreach-prefs-toggle--on {
    background: var(--persona-primary, #4a6741);
  }

  .outreach-prefs-toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 24px;
    height: 24px;
    background: white;
    border-radius: var(--radius-full, 9999px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
  }

  .outreach-prefs-toggle--on .outreach-prefs-toggle-knob {
    transform: translateX(20px);
  }

  /* Channel Selector */
  .outreach-prefs-channels {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2, 8px);
  }

  .outreach-prefs-channel {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px);
    background: var(--color-background-secondary, #f5f2ed);
    border: 2px solid transparent;
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .outreach-prefs-channel:hover {
    background: var(--color-background-tertiary, #eae7e2);
  }

  .outreach-prefs-channel--selected {
    border-color: var(--color-text-secondary);
    background: rgba(74, 103, 65, 0.08);
  }

  .outreach-prefs-channel-check {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-full, 9999px);
    border: 2px solid var(--color-border, rgba(44, 37, 32, 0.2));
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    background: transparent;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .outreach-prefs-channel--selected .outreach-prefs-channel-check {
    background: var(--persona-primary, #4a6741);
    border-color: var(--color-text-secondary);
  }

  .outreach-prefs-channel-check svg {
    width: 12px;
    height: 12px;
    opacity: 0;
    transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .outreach-prefs-channel--selected .outreach-prefs-channel-check svg {
    opacity: 1;
  }

  /* Slider */
  .outreach-prefs-slider-row {
    display: flex;
    align-items: center;
    gap: var(--space-4, 16px);
    padding: var(--space-3, 12px);
    background: var(--color-background-secondary, #f5f2ed);
    border-radius: var(--radius-lg, 12px);
    margin-bottom: var(--space-3, 12px);
  }

  .outreach-prefs-slider-label {
    flex: 1;
    font-weight: 500;
    color: var(--color-text-primary, #2C2520);
  }

  .outreach-prefs-slider-value {
    min-width: 40px;
    text-align: right;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .outreach-prefs-slider {
    width: 100px;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--color-border, rgba(44, 37, 32, 0.2));
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
  }

  .outreach-prefs-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--persona-primary, #4a6741);
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
  }

  .outreach-prefs-slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  /* Quiet Hours */
  .outreach-prefs-time-row {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    margin-bottom: var(--space-3, 12px);
  }

  .outreach-prefs-time-input {
    flex: 1;
    padding: var(--space-3, 12px);
    background: var(--color-background-secondary, #f5f2ed);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    border-radius: var(--radius-md, 8px);
    font-family: inherit;
    font-size: 14px;
    color: var(--color-text-primary, #2C2520);
  }

  .outreach-prefs-time-input:focus {
    outline: none;
    border-color: var(--color-text-secondary);
  }

  .outreach-prefs-time-label {
    font-size: 13px;
    color: var(--color-text-muted, #8a8078);
    min-width: 30px;
    text-align: center;
  }

  /* Day Selector */
  .outreach-prefs-days {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 8px);
  }

  .outreach-prefs-day {
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background: var(--color-background-secondary, #f5f2ed);
    border: 2px solid transparent;
    border-radius: var(--radius-md, 8px);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary, #5c544a);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .outreach-prefs-day:hover {
    background: var(--color-background-tertiary, #eae7e2);
  }

  .outreach-prefs-day--selected {
    border-color: var(--color-text-secondary);
    background: rgba(74, 103, 65, 0.08);
    color: var(--color-text-secondary);
  }

  /* Footer */
  .outreach-prefs-footer {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3, 12px);
  }

  .outreach-prefs-btn {
    padding: var(--space-3, 12px) var(--space-5, 20px);
    border-radius: var(--radius-lg, 12px);
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .outreach-prefs-btn--secondary {
    background: transparent;
    border: 1px solid var(--color-border, rgba(44, 37, 32, 0.2));
    color: var(--color-text-secondary, #5c544a);
  }

  .outreach-prefs-btn--secondary:hover {
    background: var(--color-background-secondary, #f5f2ed);
  }

  .outreach-prefs-btn--primary {
    background: var(--persona-primary, #4a6741);
    border: none;
    color: white;
  }

  .outreach-prefs-btn--primary:hover {
    background: var(--persona-secondary, #3d5a35);
    transform: translateY(-1px);
  }

  .outreach-prefs-btn--primary:active {
    transform: translateY(0);
  }

  /* Disabled state */
  .outreach-prefs-content--disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .outreach-prefs-overlay,
    .outreach-prefs-card,
    .outreach-prefs-toggle,
    .outreach-prefs-toggle-knob,
    .outreach-prefs-channel,
    .outreach-prefs-day,
    .outreach-prefs-btn {
      transition: none;
    }
  }
`;

// ============================================================================
// UI CLASS
// ============================================================================

class OutreachPreferencesUI {
  private overlay: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private callbacks: OutreachPreferencesCallbacks = {};
  private currentPrefs: OutreachPreferences = { ...DEFAULT_PREFS };
  private isVisible = false;

  /**
   * Initialize the UI
   */
  initialize(): void {
    if (this.overlay) return;

    this.cleanupOrphanedElements();
    this.injectStyles();
    this.createOverlay();
  }

  /**
   * HMR protection
   */
  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.outreach-prefs-overlay').forEach((el) => el.remove());
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: OutreachPreferencesCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Show the preferences modal
   */
  show(initialPrefs?: Partial<OutreachPreferences>): void {
    this.initialize();
    if (!this.overlay) return;

    // Merge with defaults
    this.currentPrefs = { ...DEFAULT_PREFS, ...initialPrefs };
    this.renderContent();

    this.overlay.classList.add('outreach-prefs-overlay--visible');
    this.isVisible = true;
    log.debug('Outreach preferences shown');
  }

  /**
   * Hide the modal
   */
  hide(): void {
    if (!this.overlay) return;

    this.overlay.classList.remove('outreach-prefs-overlay--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
    log.debug('Outreach preferences hidden');
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Inject styles
   */
  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = STYLES;
    document.head.appendChild(this.styleElement);
  }

  /**
   * Create overlay structure
   */
  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'outreach-prefs-overlay';
    this.overlay.innerHTML = `
      <div class="outreach-prefs-backdrop"></div>
      <div class="outreach-prefs-card">
        <header class="outreach-prefs-header">
          <div class="outreach-prefs-header-left">
            <span class="outreach-prefs-eyebrow">Stay in touch</span>
            <h2 class="outreach-prefs-title">Check-in Settings</h2>
          </div>
          <button class="outreach-prefs-close" aria-label="${t('common.close')}">
            ${ICONS.close}
          </button>
        </header>
        <div class="outreach-prefs-content"></div>
        <footer class="outreach-prefs-footer">
          <button class="outreach-prefs-btn outreach-prefs-btn--secondary" data-action="cancel">
            Cancel
          </button>
          <button class="outreach-prefs-btn outreach-prefs-btn--primary" data-action="save">
            Save Changes
          </button>
        </footer>
      </div>
    `;

    // Bind events
    this.overlay.querySelector('.outreach-prefs-backdrop')?.addEventListener('click', () => this.hide());
    this.overlay.querySelector('.outreach-prefs-close')?.addEventListener('click', () => this.hide());
    this.overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.hide());
    this.overlay.querySelector('[data-action="save"]')?.addEventListener('click', () => this.handleSave());

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    document.body.appendChild(this.overlay);
  }

  /**
   * Render content based on current preferences
   */
  private renderContent(): void {
    const content = this.overlay?.querySelector('.outreach-prefs-content');
    if (!content) return;

    const p = this.currentPrefs;

    content.innerHTML = `
      <!-- Master Toggle -->
      <div class="outreach-prefs-section">
        <div class="outreach-prefs-toggle-row">
          <div class="outreach-prefs-toggle-info">
            <span class="outreach-prefs-toggle-label">Proactive check-ins</span>
            <span class="outreach-prefs-toggle-desc">Let Ferni reach out when something comes to mind</span>
          </div>
          <div class="outreach-prefs-toggle ${p.enabled ? 'outreach-prefs-toggle--on' : ''}" data-pref="enabled">
            <div class="outreach-prefs-toggle-knob"></div>
          </div>
        </div>
      </div>

      <!-- Channel Preference -->
      <div class="outreach-prefs-section ${!p.enabled ? 'outreach-prefs-content--disabled' : ''}">
        <div class="outreach-prefs-section-label">How should I reach you?</div>
        <div class="outreach-prefs-channels">
          ${this.renderChannel('any', 'Any', p.preferredChannel)}
          ${this.renderChannel('push', 'Push', p.preferredChannel)}
          ${this.renderChannel('email', 'Email', p.preferredChannel)}
          ${this.renderChannel('sms', 'Text', p.preferredChannel)}
        </div>
      </div>

      <!-- Frequency -->
      <div class="outreach-prefs-section ${!p.enabled ? 'outreach-prefs-content--disabled' : ''}">
        <div class="outreach-prefs-section-label">How often?</div>
        <div class="outreach-prefs-slider-row">
          <span class="outreach-prefs-slider-label">Per day</span>
          <input type="range" class="outreach-prefs-slider" 
                 min="0" max="5" value="${p.maxPerDay}" 
                 data-pref="maxPerDay">
          <span class="outreach-prefs-slider-value">${p.maxPerDay}</span>
        </div>
        <div class="outreach-prefs-slider-row">
          <span class="outreach-prefs-slider-label">Per week</span>
          <input type="range" class="outreach-prefs-slider" 
                 min="0" max="14" value="${p.maxPerWeek}" 
                 data-pref="maxPerWeek">
          <span class="outreach-prefs-slider-value">${p.maxPerWeek}</span>
        </div>
      </div>

      <!-- Quiet Hours -->
      <div class="outreach-prefs-section ${!p.enabled ? 'outreach-prefs-content--disabled' : ''}">
        <div class="outreach-prefs-section-label">Quiet hours (no notifications)</div>
        <div class="outreach-prefs-time-row">
          <input type="time" class="outreach-prefs-time-input" 
                 value="${p.quietHoursStart}" data-pref="quietHoursStart">
          <span class="outreach-prefs-time-label">to</span>
          <input type="time" class="outreach-prefs-time-input" 
                 value="${p.quietHoursEnd}" data-pref="quietHoursEnd">
        </div>
      </div>

      <!-- Quiet Days -->
      <div class="outreach-prefs-section ${!p.enabled ? 'outreach-prefs-content--disabled' : ''}">
        <div class="outreach-prefs-section-label">Quiet days (no notifications)</div>
        <div class="outreach-prefs-days">
          ${this.renderDay('monday', 'Mon', p.quietDays)}
          ${this.renderDay('tuesday', 'Tue', p.quietDays)}
          ${this.renderDay('wednesday', 'Wed', p.quietDays)}
          ${this.renderDay('thursday', 'Thu', p.quietDays)}
          ${this.renderDay('friday', 'Fri', p.quietDays)}
          ${this.renderDay('saturday', 'Sat', p.quietDays)}
          ${this.renderDay('sunday', 'Sun', p.quietDays)}
        </div>
      </div>
    `;

    // Bind events
    this.bindContentEvents(content);
  }

  /**
   * Render channel option
   */
  private renderChannel(
    value: string,
    label: string,
    selected: string
  ): string {
    const isSelected = value === selected;
    return `
      <div class="outreach-prefs-channel ${isSelected ? 'outreach-prefs-channel--selected' : ''}" 
           data-channel="${value}">
        <div class="outreach-prefs-channel-check">${ICONS.check}</div>
        <span>${label}</span>
      </div>
    `;
  }

  /**
   * Render day option
   */
  private renderDay(value: string, label: string, selected: string[]): string {
    const isSelected = selected.includes(value);
    return `
      <div class="outreach-prefs-day ${isSelected ? 'outreach-prefs-day--selected' : ''}" 
           data-day="${value}">
        ${label}
      </div>
    `;
  }

  /**
   * Bind content events
   */
  private bindContentEvents(content: Element): void {
    // Toggle switch
    content.querySelector('[data-pref="enabled"]')?.addEventListener('click', () => {
      this.currentPrefs.enabled = !this.currentPrefs.enabled;
      this.renderContent();
    });

    // Channel selection
    content.querySelectorAll('[data-channel]').forEach((el) => {
      el.addEventListener('click', () => {
        const channel = (el as HTMLElement).dataset.channel as OutreachPreferences['preferredChannel'];
        if (channel) {
          this.currentPrefs.preferredChannel = channel;
          this.renderContent();
        }
      });
    });

    // Sliders
    content.querySelectorAll('.outreach-prefs-slider').forEach((slider) => {
      const input = slider as HTMLInputElement;
      input.addEventListener('input', () => {
        const pref = input.dataset.pref as 'maxPerDay' | 'maxPerWeek';
        const value = parseInt(input.value, 10);
        if (pref && !isNaN(value)) {
          this.currentPrefs[pref] = value;
          const valueEl = input.nextElementSibling;
          if (valueEl) valueEl.textContent = String(value);
        }
      });
    });

    // Time inputs
    content.querySelectorAll('.outreach-prefs-time-input').forEach((input) => {
      const timeInput = input as HTMLInputElement;
      timeInput.addEventListener('change', () => {
        const pref = timeInput.dataset.pref as 'quietHoursStart' | 'quietHoursEnd';
        if (pref) {
          this.currentPrefs[pref] = timeInput.value;
        }
      });
    });

    // Day selection
    content.querySelectorAll('[data-day]').forEach((el) => {
      el.addEventListener('click', () => {
        const day = (el as HTMLElement).dataset.day;
        if (day) {
          const idx = this.currentPrefs.quietDays.indexOf(day);
          if (idx >= 0) {
            this.currentPrefs.quietDays.splice(idx, 1);
          } else {
            this.currentPrefs.quietDays.push(day);
          }
          el.classList.toggle('outreach-prefs-day--selected');
        }
      });
    });
  }

  /**
   * Handle save
   */
  private async handleSave(): Promise<void> {
    try {
      await this.callbacks.onSave?.(this.currentPrefs);
      this.hide();
      log.info('Outreach preferences saved');
    } catch (error) {
      log.error('Failed to save outreach preferences', error);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const outreachPreferencesUI = new OutreachPreferencesUI();

export function initOutreachPreferencesUI(): void {
  outreachPreferencesUI.initialize();
}

export function showOutreachPreferences(initialPrefs?: Partial<OutreachPreferences>): void {
  outreachPreferencesUI.show(initialPrefs);
}

export function hideOutreachPreferences(): void {
  outreachPreferencesUI.hide();
}

export function setOutreachPreferencesCallbacks(callbacks: OutreachPreferencesCallbacks): void {
  outreachPreferencesUI.setCallbacks(callbacks);
}

export default outreachPreferencesUI;

