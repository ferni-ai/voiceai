/**
 * Accent Settings UI
 *
 * Allows users to view and change their voice accent preference.
 * Brand-compliant centered modal with warm, human design.
 *
 * FEATURES:
 *   - Show auto-detected accent from location
 *   - Allow manual override
 *   - Preview description of each accent
 *   - Persist preference to backend
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('AccentSettingsUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

type EnglishAccent = 'american' | 'british' | 'australian' | 'indian';

interface AccentOption {
  value: EnglishAccent;
  label: string;
  description: string;
  flagSvg: string;
}

interface AccentSettingsState {
  isOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  currentAccent: EnglishAccent;
  detectedAccent: EnglishAccent;
  autoDetected: boolean;
  error?: string;
  success?: string;
}

// ============================================================================
// ACCENT OPTIONS
// ============================================================================

// SVG flag icons (brand-compliant, no emojis)
// @design-tokens-ignore - Official country flag colors must be exact
const FLAG_SVGS = {
  us: `<svg viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="16" fill="#B22234"/>
    <rect y="1.23" width="24" height="1.23" fill="white"/>
    <rect y="3.69" width="24" height="1.23" fill="white"/>
    <rect y="6.15" width="24" height="1.23" fill="white"/>
    <rect y="8.62" width="24" height="1.23" fill="white"/>
    <rect y="11.08" width="24" height="1.23" fill="white"/>
    <rect y="13.54" width="24" height="1.23" fill="white"/>
    <rect width="9.6" height="8.62" fill="#3C3B6E"/>
  </svg>`,
  gb: `<svg viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="16" fill="#012169"/>
    <path d="M0 0L24 16M24 0L0 16" stroke="white" stroke-width="2.5"/>
    <path d="M0 0L24 16M24 0L0 16" stroke="#C8102E" stroke-width="1.5"/>
    <path d="M12 0V16M0 8H24" stroke="white" stroke-width="4"/>
    <path d="M12 0V16M0 8H24" stroke="#C8102E" stroke-width="2.5"/>
  </svg>`,
  au: `<svg viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="16" fill="#00008B"/>
    <rect width="12" height="8" fill="#012169"/>
    <path d="M0 0L12 8M12 0L0 8" stroke="white" stroke-width="1.5"/>
    <path d="M0 0L12 8M12 0L0 8" stroke="#C8102E" stroke-width="0.8"/>
    <path d="M6 0V8M0 4H12" stroke="white" stroke-width="2.5"/>
    <path d="M6 0V8M0 4H12" stroke="#C8102E" stroke-width="1.5"/>
    <circle cx="6" cy="12" r="1.2" fill="white"/>
    <circle cx="18" cy="5" r="0.8" fill="white"/>
    <circle cx="20" cy="8" r="0.8" fill="white"/>
    <circle cx="18" cy="11" r="0.8" fill="white"/>
    <circle cx="15" cy="9" r="0.8" fill="white"/>
  </svg>`,
  in: `<svg viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="5.33" fill="#FF9933"/>
    <rect y="5.33" width="24" height="5.34" fill="white"/>
    <rect y="10.67" width="24" height="5.33" fill="#138808"/>
    <circle cx="12" cy="8" r="2" fill="#000080"/>
    <circle cx="12" cy="8" r="1.5" fill="white"/>
    <circle cx="12" cy="8" r="0.5" fill="#000080"/>
  </svg>`,
};

const ACCENT_OPTIONS: AccentOption[] = [
  {
    value: 'american',
    label: 'American English',
    description: 'Standard American accent, warm and familiar',
    flagSvg: FLAG_SVGS.us,
  },
  {
    value: 'british',
    label: 'British English',
    description: 'Received Pronunciation, elegant and clear',
    flagSvg: FLAG_SVGS.gb,
  },
  {
    value: 'australian',
    label: 'Australian English',
    description: 'Friendly Australian accent, relaxed and approachable',
    flagSvg: FLAG_SVGS.au,
  },
  {
    value: 'indian',
    label: 'Indian English',
    description: 'Indian English accent, melodic and expressive',
    flagSvg: FLAG_SVGS.in,
  },
];

// ============================================================================
// STATE
// ============================================================================

const state: AccentSettingsState = {
  isOpen: false,
  isLoading: false,
  isSaving: false,
  currentAccent: 'american',
  detectedAccent: 'american',
  autoDetected: true,
};

let modalContainer: HTMLElement | null = null;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  sparkle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('accent-settings-styles')) return;

  const style = document.createElement('style');
  style.id = 'accent-settings-styles';
  style.textContent = `
    .accent-settings-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-tooltip);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
      pointer-events: none;
    }

    .accent-settings-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .accent-settings-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .accent-settings-modal {
      position: relative;
      width: 90%;
      max-width: clamp(294px, 90vw, 420px);
      max-height: 90vh;
      overflow-y: auto;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .accent-settings-overlay.open .accent-settings-modal {
      transform: scale(1) translateY(0);
    }

    .accent-settings-header {
      padding: 24px 24px 0;
      text-align: center;
    }

    .accent-settings-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      padding: 12px;
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border-radius: 50%;
      color: white;
    }

    .accent-settings-icon svg {
      width: 24px;
      height: 24px;
    }

    .accent-settings-eyebrow {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-accent-text, #4a6741);
      margin-bottom: 4px;
    }

    .accent-settings-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 8px 0;
    }

    .accent-settings-subtitle {
      font-size: 0.9rem;
      color: var(--color-text-secondary, #5c544a);
      margin: 0;
      line-height: 1.5;
    }

    .accent-settings-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-tertiary, #ebe6df);
      border: none;
      border-radius: 50%;
      color: var(--color-text-secondary, #5c544a);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .accent-settings-close:hover {
      background: var(--color-background-secondary, #f5f2ed);
      color: var(--color-text-primary, #2c2520);
      transform: scale(1.05);
    }

    .accent-settings-close svg {
      width: 16px;
      height: 16px;
    }

    .accent-settings-content {
      padding: 20px 24px 24px;
    }

    /* Detected accent badge */
    .accent-detected-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-full, 9999px);
      font-size: 0.8rem;
      color: var(--color-accent-text, #4a6741);
      margin-bottom: 20px;
    }

    .accent-detected-badge svg {
      width: 14px;
      height: 14px;
    }

    /* Accent options */
    .accent-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .accent-option {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 16px;
      background: var(--color-background-secondary, #f5f2ed);
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      text-align: left;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .accent-option:hover {
      background: var(--color-background-tertiary, #ebe6df);
    }

    .accent-option.selected {
      background: var(--persona-tint, rgba(74, 103, 65, 0.12));
      border-color: var(--persona-primary, #4a6741);
    }

    .accent-option-flag {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-md, 8px);
      overflow: hidden;
      padding: 6px;
    }

    .accent-option-flag svg {
      width: 100%;
      height: auto;
      border-radius: 2px;
    }

    .accent-option-info {
      flex: 1;
    }

    .accent-option-label {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 2px 0;
    }

    .accent-option-desc {
      font-size: 0.8rem;
      color: var(--color-text-secondary, #5c544a);
      margin: 0;
    }

    .accent-option-check {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--persona-primary, #4a6741);
      border-radius: 50%;
      color: white;
      opacity: 0;
      transform: scale(0.8);
      transition: all ${DURATION.FAST}ms ${EASING.SPRING};
    }

    .accent-option.selected .accent-option-check {
      opacity: 1;
      transform: scale(1);
    }

    .accent-option-check svg {
      width: 14px;
      height: 14px;
    }

    /* Auto-detect toggle */
    .accent-auto-detect {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      margin-top: 16px;
      background: var(--color-background-secondary, #f5f2ed);
      border-radius: var(--radius-lg, 12px);
    }

    .accent-auto-detect-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .accent-auto-detect-icon {
      width: 20px;
      height: 20px;
      color: var(--color-accent-text, #4a6741);
    }

    .accent-auto-detect-label {
      font-size: 0.9rem;
      color: var(--color-text-primary, #2c2520);
    }

    .accent-toggle {
      position: relative;
      width: 48px;
      height: 26px;
      background: var(--color-background-tertiary, #ebe6df);
      border: none;
      border-radius: 13px;
      cursor: pointer;
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .accent-toggle.on {
      background: var(--persona-primary, #4a6741);
    }

    .accent-toggle-knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
    }

    .accent-toggle.on .accent-toggle-knob {
      transform: translateX(22px);
    }

    /* Save button */
    .accent-save-btn {
      width: 100%;
      margin-top: 20px;
      padding: 14px 24px;
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: white;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .accent-save-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
    }

    .accent-save-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .accent-save-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Messages */
    .accent-message {
      padding: 12px 16px;
      margin-top: 16px;
      border-radius: var(--radius-md, 8px);
      font-size: 0.85rem;
      text-align: center;
    }

    .accent-message.error {
      background: var(--color-error-tint, rgba(220, 53, 69, 0.1));
      color: var(--color-error, #dc3545);
    }

    .accent-message.success {
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      color: var(--color-accent-text, #4a6741);
    }

    /* Loading state */
    .accent-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    .accent-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-background-tertiary, #ebe6df);
      border-top-color: var(--persona-primary, #4a6741);
      border-radius: 50%;
      animation: accent-spin 0.8s linear infinite;
    }

    @keyframes accent-spin {
      to { transform: rotate(360deg); }
    }

    /* Dark theme */
    [data-theme="midnight"] .accent-settings-modal {
      background: var(--color-background-elevated, #70605a);
    }

    [data-theme="midnight"] .accent-settings-title {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .accent-settings-subtitle {
      color: var(--color-text-secondary, #f0ebe4);
    }

    [data-theme="midnight"] .accent-settings-close {
      background: var(--color-background-tertiary, #685852);
      color: var(--color-text-secondary, #f0ebe4);
    }

    [data-theme="midnight"] .accent-option {
      background: var(--color-background-secondary, #60504a);
    }

    [data-theme="midnight"] .accent-option:hover {
      background: var(--color-background-tertiary, #685852);
    }

    [data-theme="midnight"] .accent-option-label {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .accent-option-desc {
      color: var(--color-text-secondary, #f0ebe4);
    }

    [data-theme="midnight"] .accent-auto-detect {
      background: var(--color-background-secondary, #60504a);
    }

    [data-theme="midnight"] .accent-auto-detect-label {
      color: var(--color-text-primary, #faf6f0);
    }

    /* Responsive */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .accent-settings-modal {
        max-width: 100%;
        max-height: 100%;
        border-radius: 0;
      }

      .accent-settings-header {
        padding-top: 40px;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .accent-settings-overlay,
      .accent-settings-modal,
      .accent-option,
      .accent-toggle,
      .accent-toggle-knob,
      .accent-save-btn {
        transition: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): void {
  if (!modalContainer) return;

  if (state.isLoading) {
    modalContainer.innerHTML = `
      <div class="accent-settings-overlay ${state.isOpen ? 'open' : ''}">
        <div class="accent-settings-backdrop"></div>
        <div class="accent-settings-modal">
          <div class="accent-loading">
            <div class="accent-spinner"></div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  modalContainer.innerHTML = `
    <div class="accent-settings-overlay ${state.isOpen ? 'open' : ''}">
      <div class="accent-settings-backdrop"></div>
      <div class="accent-settings-modal">
        <button class="accent-settings-close" aria-label="${t('common.close')}">${ICONS.close}</button>
        
        <div class="accent-settings-header">
          <div class="accent-settings-icon">${ICONS.mic}</div>
          <p class="accent-settings-eyebrow">Voice Preferences</p>
          <h2 class="accent-settings-title">How should Ferni sound?</h2>
          <p class="accent-settings-subtitle">
            Choose your preferred English accent. Ferni will speak to you in a voice that feels like home.
          </p>
        </div>

        <div class="accent-settings-content">
          ${
            state.autoDetected && state.detectedAccent !== state.currentAccent
              ? `
            <div class="accent-detected-badge">
              ${ICONS.sparkle}
              <span>We detected you might prefer ${ACCENT_OPTIONS.find((o) => o.value === state.detectedAccent)?.label ?? 'American English'}</span>
            </div>
          `
              : ''
          }

          <div class="accent-options">
            ${ACCENT_OPTIONS.map(
              (option) => `
              <button aria-label="Confirm" class="accent-option ${state.currentAccent === option.value ? 'selected' : ''}" 
                      data-accent="${option.value}">
                <span class="accent-option-flag">${option.flagSvg}</span>
                <div class="accent-option-info">
                  <p class="accent-option-label">${option.label}</p>
                  <p class="accent-option-desc">${option.description}</p>
                </div>
                <span class="accent-option-check">${ICONS.check}</span>
              </button>
            `
            ).join('')}
          </div>

          <div class="accent-auto-detect">
            <div class="accent-auto-detect-info">
              <span class="accent-auto-detect-icon">${ICONS.globe}</span>
              <span class="accent-auto-detect-label">Auto-detect from location</span>
            </div>
            <button aria-label="Toggle" class="accent-toggle ${state.autoDetected ? 'on' : ''}" data-action="toggle-auto">
              <span class="accent-toggle-knob" role="button" tabindex="0"></span>
            </button>
          </div>

          ${state.error ? `<div class="accent-message error">${state.error}</div>` : ''}
          ${state.success ? `<div class="accent-message success">${state.success}</div>` : ''}

          <button aria-label="Save" class="accent-save-btn" ${state.isSaving ? 'disabled' : ''}>
            ${state.isSaving ? t('common.saving') : 'Save Preference'}
          </button>
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Close button
  const closeBtn = modalContainer.querySelector('.accent-settings-close');
  closeBtn?.addEventListener('click', close);

  // Backdrop click
  const backdrop = modalContainer.querySelector('.accent-settings-backdrop');
  backdrop?.addEventListener('click', close);

  // Accent options
  const options = modalContainer.querySelectorAll('.accent-option');
  options.forEach((option) => {
    option.addEventListener('click', () => {
      const accent = (option as HTMLElement).dataset.accent as EnglishAccent;
      if (accent) {
        state.currentAccent = accent;
        state.autoDetected = false; // User made a manual choice
        state.error = undefined;
        state.success = undefined;
        render();
      }
    });
  });

  // Auto-detect toggle
  const toggleBtn = modalContainer.querySelector('[data-action="toggle-auto"]');
  toggleBtn?.addEventListener('click', () => {
    state.autoDetected = !state.autoDetected;
    if (state.autoDetected) {
      // Reset to detected accent
      state.currentAccent = state.detectedAccent;
    }
    render();
  });

  // Save button
  const saveBtn = modalContainer.querySelector('.accent-save-btn');
  saveBtn?.addEventListener('click', () => { void savePreference(); });

  // Escape key
  document.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    close();
  }
}

// ============================================================================
// API
// ============================================================================

async function loadCurrentPreference(): Promise<void> {
  state.isLoading = true;
  render();

  try {
    const response = await apiGet<{ accent?: EnglishAccent; autoDetected?: boolean }>('/api/user/accent');

    if (response.ok && response.data) {
      state.currentAccent = response.data.accent ?? 'american';
      state.detectedAccent = response.data.accent ?? 'american';
      state.autoDetected = response.data.autoDetected ?? true;
      log.debug('Loaded accent preference:', response.data);
    }
  } catch (err) {
    log.warn('Failed to load accent preference:', err);
    // Use defaults
  } finally {
    state.isLoading = false;
    render();
  }
}

async function savePreference(): Promise<void> {
  state.isSaving = true;
  state.error = undefined;
  state.success = undefined;
  render();

  try {
    // 1. Save preference for future sessions
    const response = await apiPost<{ error?: string }>('/api/user/accent', {
      accent: state.currentAccent,
      autoDetected: state.autoDetected,
    });

    if (!response.ok) {
      throw new Error(response.data?.error ?? response.error ?? 'Failed to save preference');
    }

    log.info('Accent preference saved:', state.currentAccent);

    // 2. If there's an active session, also apply the change immediately
    const connectionState = appState.get('connection');
    const hasActiveSession = connectionState === 'connected' || connectionState === 'reconnecting';

    if (hasActiveSession) {
      // Call mid-session accent change API to switch voice immediately
      // Use a timeout to prevent hanging if Cartesia API is slow
      try {
        const sessionPromise = apiPost<{ error?: string; message?: string }>(
          '/api/session/accent',
          {
            accent: state.currentAccent,
          }
        );

        // Timeout after 10 seconds
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Session accent change timed out')), 10000)
        );

        const sessionResponse = await Promise.race([sessionPromise, timeoutPromise]);

        if (sessionResponse.ok) {
          log.info('Mid-session accent change applied:', state.currentAccent);
          state.success = 'Accent updated! The voice will change on the next response.';
        } else {
          // Session change failed, but preference was saved - still show partial success
          log.warn('Mid-session accent change failed, but preference saved');
          state.success =
            'Your preference is saved. The voice will update when you start a new conversation.';
        }
      } catch (sessionErr) {
        // Mid-session change failed or timed out - still a partial success
        log.warn('Mid-session accent change failed:', sessionErr);
        state.success =
          'Your preference is saved. The voice will update when you start a new conversation.';
      }
    } else {
      // No active session - will take effect next time
      state.success =
        'Your accent preference has been saved! Ferni will use this voice in your next conversation.';
    }

    // Close after a short delay
    trackedTimeout(() => {
      close();
    }, 2000);
  } catch (err) {
    state.error = err instanceof Error ? err.message : 'Failed to save preference';
    log.error('Failed to save accent preference:', err);
  } finally {
    state.isSaving = false;
    render();
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function open(): void {
  injectStyles();

  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'accent-settings-container';
    document.body.appendChild(modalContainer);
  }

  state.isOpen = true;
  state.error = undefined;
  state.success = undefined;

  render();
  loadCurrentPreference();

  // Trigger animation
  requestAnimationFrame(() => {
    const overlay = modalContainer?.querySelector('.accent-settings-overlay');
    overlay?.classList.add('open');
  });

  log.debug('Accent settings opened');
}

export function close(): void {
  state.isOpen = false;
  state.error = undefined;
  state.success = undefined;

  const overlay = modalContainer?.querySelector('.accent-settings-overlay');
  overlay?.classList.remove('open');

  document.removeEventListener('keydown', handleKeyDown);

  // Remove after animation
  trackedTimeout(() => {
    if (modalContainer) {
      modalContainer.remove();
      modalContainer = null;
    }
  }, DURATION.NORMAL);

  log.debug('Accent settings closed');
}

export function isOpen(): boolean {
  return state.isOpen;
}

/**
 * Set the detected accent (called from app initialization)
 */
export function setDetectedAccent(accent: EnglishAccent): void {
  state.detectedAccent = accent;
  if (state.autoDetected) {
    state.currentAccent = accent;
  }
}

// Default export for convenience
export default {
  open,
  close,
  isOpen,
  setDetectedAccent,
};
