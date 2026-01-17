/**
 * Sleep Settings UI
 *
 * Settings panel for configuring user's sleep pattern.
 * This affects the circadian theming system - making the UI aware of
 * the user's actual sleep schedule for a more personalized ambient experience.
 *
 * Features:
 * - Wake time and sleep time sliders
 * - Night Owl / Early Bird toggles
 * - Auto-infer from usage history
 * - Preview current circadian period
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { circadianManager, type CircadianPeriod } from '../services/circadian-manager.js';
import { visualStorytellingService, type SleepPatternData } from '../services/visual-storytelling.service.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';

const log = createLogger('SleepSettings');

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let currentPattern: SleepPatternData = {
  wakeTime: 7,
  sleepTime: 23,
  isNightOwl: false,
  isEarlyBird: false,
};

// ============================================================================
// ICONS (Lucide style)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  moon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  sunrise: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`,
  sunset: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`,
  owl: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-4.97 0-9 4.03-9 9v9h18v-9c0-4.97-4.03-9-9-9z"/><circle cx="9" cy="10" r="2"/><circle cx="15" cy="10" r="2"/><path d="M12 17v-4"/><path d="M8 21v-2"/><path d="M16 21v-2"/></svg>`,
  bird: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>`,
};

// Circadian period emojis (names/descriptions come from i18n)
const PERIOD_EMOJI: Record<CircadianPeriod, string> = {
  earlyMorning: '🌅',
  morning: '☀️',
  midday: '🌞',
  afternoon: '🌤️',
  evening: '🌇',
  night: '🌙',
  lateNight: '🌃',
  deepNight: '✨',
};

function getPeriodInfo(period: CircadianPeriod): { name: string; description: string; emoji: string } {
  return {
    name: t(`sleepSettings.periods.${period}`) || period,
    description: t(`sleepSettings.periodDescriptions.${period}`) || '',
    emoji: PERIOD_EMOJI[period],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m > 0 ? `${displayHour}:${m.toString().padStart(2, '0')} ${period}` : `${displayHour} ${period}`;
}

function parseTime(timeStr: string): number {
  const match = timeStr.match(/^(\d+):?(\d+)?\s*(AM|PM)?$/i);
  if (!match) return 7;
  
  let hour = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toUpperCase();
  
  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  
  return hour + minutes / 60;
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  const styleId = 'sleep-settings-styles';
  if (document.getElementById(styleId)) return;

  const styles = document.createElement('style');
  styles.id = styleId;
  styles.textContent = `
    .sleep-settings {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal-backdrop, 2000);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 1rem);
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
                  visibility ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .sleep-settings--visible {
      opacity: 1;
      visibility: visible;
    }

    .sleep-settings__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
      backdrop-filter: blur(8px);
    }

    .sleep-settings__panel {
      position: relative;
      z-index: var(--z-modal, 2100);
      width: 100%;
      max-width: 420px;
      max-height: 85vh;
      overflow-y: auto;
      background: var(--color-bg-elevated, #fffdfb);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .sleep-settings--visible .sleep-settings__panel {
      transform: scale(1) translateY(0);
    }

    .sleep-settings__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-6, 1.5rem) var(--space-6, 1.5rem) var(--space-4, 1rem);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .sleep-settings__title-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 0.25rem);
    }

    .sleep-settings__eyebrow {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-accent, #3D5A45);
    }

    .sleep-settings__title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      color: var(--color-text-primary, #2C2520);
    }

    .sleep-settings__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: var(--radius-full, 50%);
      background: var(--color-background-tertiary, rgba(44, 37, 32, 0.04));
      color: var(--color-text-secondary, #5a524c);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
    }

    .sleep-settings__close:hover {
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.08));
      color: var(--color-text-primary, #2C2520);
    }

    .sleep-settings__content {
      padding: var(--space-6, 1.5rem);
      display: flex;
      flex-direction: column;
      gap: var(--space-6, 1.5rem);
    }

    /* Current Period Preview */
    .sleep-settings__preview {
      display: flex;
      align-items: center;
      gap: var(--space-4, 1rem);
      padding: var(--space-4, 1rem);
      background: var(--color-background-tertiary, rgba(44, 37, 32, 0.04));
      border-radius: var(--radius-lg, 12px);
    }

    .sleep-settings__preview-emoji {
      font-size: 2rem;
    }

    .sleep-settings__preview-info {
      flex: 1;
    }

    .sleep-settings__preview-name {
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .sleep-settings__preview-desc {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #5a524c);
      margin: 0;
    }

    /* Time Sliders */
    .sleep-settings__time-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
    }

    .sleep-settings__time-label {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
    }

    .sleep-settings__time-label svg {
      width: 20px;
      height: 20px;
      color: var(--persona-primary, #4a6741);
    }

    .sleep-settings__time-slider {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
    }

    .sleep-settings__slider {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.08));
      -webkit-appearance: none;
      appearance: none;
      cursor: pointer;
    }

    .sleep-settings__slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--persona-primary, #4a6741);
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      cursor: grab;
      transition: transform ${DURATION.FAST}ms;
    }

    .sleep-settings__slider::-webkit-slider-thumb:hover {
      transform: scale(1.1);
    }

    .sleep-settings__slider::-webkit-slider-thumb:active {
      cursor: grabbing;
      transform: scale(0.95);
    }

    .sleep-settings__time-value {
      min-width: 70px;
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--color-text-primary, #2C2520);
    }

    /* Toggles */
    .sleep-settings__toggles {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
    }

    .sleep-settings__toggle {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      background: var(--color-background-tertiary, rgba(44, 37, 32, 0.04));
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms;
    }

    .sleep-settings__toggle:hover {
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.08));
    }

    .sleep-settings__toggle-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md, 8px);
      background: var(--color-background-elevated, #fffdfb);
      color: var(--color-text-secondary, #5a524c);
    }

    .sleep-settings__toggle--active .sleep-settings__toggle-icon {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .sleep-settings__toggle-info {
      flex: 1;
    }

    .sleep-settings__toggle-name {
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .sleep-settings__toggle-desc {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, #5a524c);
      margin: 0;
    }

    .sleep-settings__toggle-switch {
      width: 44px;
      height: 24px;
      border-radius: 12px;
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.12));
      position: relative;
      transition: background ${DURATION.FAST}ms;
    }

    .sleep-settings__toggle--active .sleep-settings__toggle-switch {
      background: var(--persona-primary, #4a6741);
    }

    .sleep-settings__toggle-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
    }

    .sleep-settings__toggle--active .sleep-settings__toggle-switch::after {
      transform: translateX(20px);
    }

    /* Actions */
    .sleep-settings__actions {
      display: flex;
      gap: var(--space-3, 0.75rem);
      padding-top: var(--space-4, 1rem);
      border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .sleep-settings__btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .sleep-settings__btn--secondary {
      background: var(--color-background-tertiary, rgba(44, 37, 32, 0.04));
      color: var(--color-text-secondary, #5a524c);
    }

    .sleep-settings__btn--secondary:hover {
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.08));
      color: var(--color-text-primary, #2C2520);
    }

    .sleep-settings__btn--primary {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .sleep-settings__btn--primary:hover {
      background: var(--persona-secondary, #3d5a35);
    }

    .sleep-settings__btn svg {
      width: 18px;
      height: 18px;
    }

    /* Dark theme */
    [data-theme="midnight"] .sleep-settings__panel {
      background: var(--color-bg-elevated, #1a1a1f);
      border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.08));
    }

    [data-theme="midnight"] .sleep-settings__backdrop {
      background: rgba(0, 0, 0, 0.8);
    }
  `;
  document.head.appendChild(styles);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  const currentPeriod = circadianManager.getCurrentPeriod() || 'midday';
  const periodInfo = getPeriodInfo(currentPeriod);

  return `
    <div class="sleep-settings__backdrop"></div>
    <div class="sleep-settings__panel" role="dialog" aria-modal="true" aria-labelledby="sleep-settings-title">
      <header class="sleep-settings__header">
        <div class="sleep-settings__title-group">
          <span class="sleep-settings__eyebrow">${t('sleepSettings.eyebrow') || 'Ambient Experience'}</span>
          <h2 class="sleep-settings__title" id="sleep-settings-title">${t('sleepSettings.title') || 'Sleep Schedule'}</h2>
        </div>
        <button class="sleep-settings__close" aria-label="${t('common.close') || 'Close'}" data-action="close">
          ${ICONS.close}
        </button>
      </header>

      <div class="sleep-settings__content">
        <!-- Current Period Preview -->
        <div class="sleep-settings__preview" role="status" aria-live="polite">
          <span class="sleep-settings__preview-emoji" aria-hidden="true">${periodInfo.emoji}</span>
          <div class="sleep-settings__preview-info">
            <p class="sleep-settings__preview-name">${t('sleepSettings.currentPeriod', { period: periodInfo.name }) || `Currently: ${periodInfo.name}`}</p>
            <p class="sleep-settings__preview-desc">${periodInfo.description}</p>
          </div>
        </div>

        <!-- Wake Time -->
        <div class="sleep-settings__time-group">
          <label class="sleep-settings__time-label" for="wake-time-slider">
            ${ICONS.sunrise}
            <span>${t('sleepSettings.wakeTime') || 'Wake Time'}</span>
          </label>
          <div class="sleep-settings__time-slider">
            <input 
              type="range" 
              class="sleep-settings__slider" 
              id="wake-time-slider"
              min="4" 
              max="12" 
              step="0.5" 
              value="${currentPattern.wakeTime}"
              aria-valuemin="4"
              aria-valuemax="12"
              aria-valuenow="${currentPattern.wakeTime}"
              aria-valuetext="${formatTime(currentPattern.wakeTime)}"
            >
            <span class="sleep-settings__time-value" id="wake-time-value" aria-hidden="true">${formatTime(currentPattern.wakeTime)}</span>
          </div>
        </div>

        <!-- Sleep Time -->
        <div class="sleep-settings__time-group">
          <label class="sleep-settings__time-label" for="sleep-time-slider">
            ${ICONS.sunset}
            <span>${t('sleepSettings.sleepTime') || 'Sleep Time'}</span>
          </label>
          <div class="sleep-settings__time-slider">
            <input 
              type="range" 
              class="sleep-settings__slider" 
              id="sleep-time-slider"
              min="20" 
              max="28" 
              step="0.5" 
              value="${currentPattern.sleepTime > 20 ? currentPattern.sleepTime : currentPattern.sleepTime + 24}"
              aria-valuemin="20"
              aria-valuemax="28"
              aria-valuenow="${currentPattern.sleepTime > 20 ? currentPattern.sleepTime : currentPattern.sleepTime + 24}"
              aria-valuetext="${formatTime(currentPattern.sleepTime)}"
            >
            <span class="sleep-settings__time-value" id="sleep-time-value" aria-hidden="true">${formatTime(currentPattern.sleepTime)}</span>
          </div>
        </div>

        <!-- Toggles -->
        <div class="sleep-settings__toggles" role="group" aria-label="${t('sleepSettings.description') || 'Sleep preferences'}">
          <div 
            class="sleep-settings__toggle ${currentPattern.isNightOwl ? 'sleep-settings__toggle--active' : ''}" 
            data-toggle="nightOwl"
            role="switch"
            aria-checked="${currentPattern.isNightOwl}"
            aria-label="${t('sleepSettings.nightOwl.title') || 'Night Owl'}"
            tabindex="0"
          >
            <div class="sleep-settings__toggle-icon" aria-hidden="true">${ICONS.owl}</div>
            <div class="sleep-settings__toggle-info">
              <p class="sleep-settings__toggle-name">${t('sleepSettings.nightOwl.title') || 'Night Owl'}</p>
              <p class="sleep-settings__toggle-desc">${t('sleepSettings.nightOwl.description') || "I'm more active late at night"}</p>
            </div>
            <div class="sleep-settings__toggle-switch" aria-hidden="true"></div>
          </div>

          <div 
            class="sleep-settings__toggle ${currentPattern.isEarlyBird ? 'sleep-settings__toggle--active' : ''}" 
            data-toggle="earlyBird"
            role="switch"
            aria-checked="${currentPattern.isEarlyBird}"
            aria-label="${t('sleepSettings.earlyBird.title') || 'Early Bird'}"
            tabindex="0"
          >
            <div class="sleep-settings__toggle-icon" aria-hidden="true">${ICONS.bird}</div>
            <div class="sleep-settings__toggle-info">
              <p class="sleep-settings__toggle-name">${t('sleepSettings.earlyBird.title') || 'Early Bird'}</p>
              <p class="sleep-settings__toggle-desc">${t('sleepSettings.earlyBird.description') || "I'm most productive in early morning"}</p>
            </div>
            <div class="sleep-settings__toggle-switch" aria-hidden="true"></div>
          </div>
        </div>

        <!-- Actions -->
        <div class="sleep-settings__actions">
          <button class="sleep-settings__btn sleep-settings__btn--secondary" data-action="auto-detect">
            ${ICONS.sparkles}
            <span>${t('sleepSettings.autoDetect') || 'Auto-detect'}</span>
          </button>
          <button class="sleep-settings__btn sleep-settings__btn--primary" data-action="save">
            <span>${t('sleepSettings.save') || 'Save'}</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// HANDLERS
// ============================================================================

function setupEventHandlers(): void {
  if (!container) return;

  // Close handlers
  const closeBtn = container.querySelector('[data-action="close"]');
  const backdrop = container.querySelector('.sleep-settings__backdrop');
  
  closeBtn?.addEventListener('click', hide);
  backdrop?.addEventListener('click', hide);

  // Wake time slider
  const wakeSlider = container.querySelector('#wake-time-slider') as HTMLInputElement;
  const wakeValue = container.querySelector('#wake-time-value');
  
  wakeSlider?.addEventListener('input', () => {
    const value = parseFloat(wakeSlider.value);
    currentPattern.wakeTime = value;
    const timeStr = formatTime(value);
    if (wakeValue) wakeValue.textContent = timeStr;
    wakeSlider.setAttribute('aria-valuenow', value.toString());
    wakeSlider.setAttribute('aria-valuetext', timeStr);
    updatePreview();
  });

  // Sleep time slider
  const sleepSlider = container.querySelector('#sleep-time-slider') as HTMLInputElement;
  const sleepValue = container.querySelector('#sleep-time-value');
  
  sleepSlider?.addEventListener('input', () => {
    let value = parseFloat(sleepSlider.value);
    // Normalize to 0-24 range
    if (value >= 24) value -= 24;
    currentPattern.sleepTime = value;
    const timeStr = formatTime(value);
    if (sleepValue) sleepValue.textContent = timeStr;
    sleepSlider.setAttribute('aria-valuenow', value.toString());
    sleepSlider.setAttribute('aria-valuetext', timeStr);
    updatePreview();
  });

  // Toggle handlers
  const toggles = container.querySelectorAll('[data-toggle]');
  toggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const type = toggle.getAttribute('data-toggle');
      if (type === 'nightOwl') {
        currentPattern.isNightOwl = !currentPattern.isNightOwl;
      } else if (type === 'earlyBird') {
        currentPattern.isEarlyBird = !currentPattern.isEarlyBird;
      }
      toggle.classList.toggle('sleep-settings__toggle--active');
      toggle.setAttribute('aria-checked', toggle.classList.contains('sleep-settings__toggle--active').toString());
      updatePreview();
    });

    // Keyboard support
    toggle.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        (toggle as HTMLElement).click();
      }
    });
  });

  // Auto-detect button
  const autoDetectBtn = container.querySelector('[data-action="auto-detect"]');
  autoDetectBtn?.addEventListener('click', async () => {
    const btn = autoDetectBtn as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = `<span>${t('sleepSettings.detecting') || 'Detecting...'}</span>`;
    
    const inferred = await visualStorytellingService.autoInferSleepPattern();
    
    if (inferred) {
      currentPattern = { ...inferred };
      updateSliders();
      updateToggles();
      updatePreview();
      toast.success(t('sleepSettings.patternDetected') || 'Pattern detected!');
    } else {
      toast.info(t('sleepSettings.notEnoughData') || 'Not enough data yet');
    }
    
    btn.disabled = false;
    btn.innerHTML = `${ICONS.sparkles}<span>${t('sleepSettings.autoDetect') || 'Auto-detect'}</span>`;
  });

  // Save button
  const saveBtn = container.querySelector('[data-action="save"]');
  saveBtn?.addEventListener('click', async () => {
    const success = await visualStorytellingService.updateSleepPattern(currentPattern);
    if (success) {
      toast.success(t('sleepSettings.saved') || 'Saved!');
      hide();
    } else {
      toast.error(t('sleepSettings.saveError') || "Couldn't save. Try again?");
    }
  });

  // ESC key
  document.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    hide();
  }
}

function updateSliders(): void {
  if (!container) return;

  const wakeSlider = container.querySelector('#wake-time-slider') as HTMLInputElement;
  const wakeValue = container.querySelector('#wake-time-value');
  const sleepSlider = container.querySelector('#sleep-time-slider') as HTMLInputElement;
  const sleepValue = container.querySelector('#sleep-time-value');

  if (wakeSlider) wakeSlider.value = currentPattern.wakeTime.toString();
  if (wakeValue) wakeValue.textContent = formatTime(currentPattern.wakeTime);
  
  const sleepVal = currentPattern.sleepTime < 20 ? currentPattern.sleepTime + 24 : currentPattern.sleepTime;
  if (sleepSlider) sleepSlider.value = sleepVal.toString();
  if (sleepValue) sleepValue.textContent = formatTime(currentPattern.sleepTime);
}

function updateToggles(): void {
  if (!container) return;

  const nightOwl = container.querySelector('[data-toggle="nightOwl"]');
  const earlyBird = container.querySelector('[data-toggle="earlyBird"]');

  if (nightOwl) {
    nightOwl.classList.toggle('sleep-settings__toggle--active', currentPattern.isNightOwl);
    nightOwl.setAttribute('aria-checked', currentPattern.isNightOwl.toString());
  }

  if (earlyBird) {
    earlyBird.classList.toggle('sleep-settings__toggle--active', currentPattern.isEarlyBird);
    earlyBird.setAttribute('aria-checked', currentPattern.isEarlyBird.toString());
  }
}

function updatePreview(): void {
  if (!container) return;

  // Temporarily apply pattern to see what period it would result in
  circadianManager.setSleepPattern(currentPattern);
  const period = circadianManager.detectPeriod();
  const periodInfo = getPeriodInfo(period);

  const emoji = container.querySelector('.sleep-settings__preview-emoji');
  const name = container.querySelector('.sleep-settings__preview-name');
  const desc = container.querySelector('.sleep-settings__preview-desc');

  if (emoji) emoji.textContent = periodInfo.emoji;
  if (name) name.textContent = t('sleepSettings.currentPeriod', { period: periodInfo.name }) || `Currently: ${periodInfo.name}`;
  if (desc) desc.textContent = periodInfo.description;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function show(): void {
  injectStyles();

  // Load current pattern from service
  const data = visualStorytellingService.getData();
  if (data?.sleepPattern) {
    currentPattern = { ...data.sleepPattern };
  } else {
    currentPattern = circadianManager.getSleepPattern();
  }

  // Create or update container
  if (!container) {
    container = document.createElement('div');
    container.className = 'sleep-settings';
    document.body.appendChild(container);
  }

  container.innerHTML = render();
  setupEventHandlers();

  // Show with animation
  requestAnimationFrame(() => {
    container?.classList.add('sleep-settings--visible');
  });

  log.info('Sleep settings opened');
}

export function hide(): void {
  if (!container) return;

  container.classList.remove('sleep-settings--visible');
  document.removeEventListener('keydown', handleKeyDown);

  // Remove after animation
  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.NORMAL);

  log.info('Sleep settings closed');
}

export function isVisible(): boolean {
  return container?.classList.contains('sleep-settings--visible') ?? false;
}

export const sleepSettings = {
  show,
  hide,
  isVisible,
};

export default sleepSettings;
