/**
 * Outreach Settings UI
 *
 * User-facing settings panel for controlling proactive outreach preferences.
 * Allows users to configure when, how, and what types of outreach they receive.
 */

import { t } from '../i18n/index.js';
import { DURATION } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('OutreachSettings');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachPreferences {
  enabled: boolean;
  channels: {
    sms: boolean;
    email: boolean;
    call: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string; // "07:00"
  };
  frequency: 'minimal' | 'balanced' | 'active';
  triggerTypes: {
    commitments: boolean;
    emotional: boolean;
    celebrations: boolean;
    thinkingOfYou: boolean;
    reminders: boolean;
  };
}

// ============================================================================
// ICONS (Lucide SVG - 2px stroke, rounded corners)
// ============================================================================

const ICONS = {
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
  </svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  </svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
  </svg>`,
  thoughtBubble: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
};

// ============================================================================
// STATE
// ============================================================================

let settingsPanel: HTMLElement | null = null;
let isOpen = false;
// OPT-OUT BY DEFAULT: Users must explicitly enable proactive outreach
let currentPreferences: OutreachPreferences = {
  enabled: false, // DISABLED by default - user must opt in
  channels: {
    sms: false, // Disabled until user explicitly enables
    email: false, // Disabled until user explicitly enables
    call: false,
  },
  quietHours: {
    enabled: true, // Keep quiet hours ON for protection
    start: '22:00',
    end: '07:00',
  },
  frequency: 'minimal', // Start with minimal frequency
  triggerTypes: {
    commitments: true, // User-requested commitments should be allowed
    emotional: false, // Disabled until user opts in
    celebrations: false, // Disabled until user opts in
    thinkingOfYou: false, // Disabled until user opts in
    reminders: true, // User-requested reminders should be allowed
  },
};

// ============================================================================
// API
// ============================================================================

async function loadPreferences(): Promise<void> {
  try {
    const response = await apiGet<{
      success?: boolean;
      outreachEnabled?: boolean;
      allowedChannels?: string[];
      preferences?: {
        quietHours?: { enabled?: boolean; start?: string; end?: string };
        frequency?: 'minimal' | 'balanced' | 'active';
        triggerTypes?: Record<string, boolean>;
      };
    }>('/api/outreach/preferences');

    if (response.ok && response.data?.success && response.data.preferences) {
      const data = response.data;
      // Merge with defaults - OPT-OUT BY DEFAULT
      currentPreferences = {
        ...currentPreferences,
        enabled: data.outreachEnabled ?? false,
        channels: {
          sms: data.allowedChannels?.includes('sms') ?? true,
          email: data.allowedChannels?.includes('email') ?? true,
          call: data.allowedChannels?.includes('call') ?? false,
        },
        quietHours: {
          enabled: data.preferences?.quietHours?.enabled ?? true,
          start: data.preferences?.quietHours?.start ?? '22:00',
          end: data.preferences?.quietHours?.end ?? '07:00',
        },
        frequency: data.preferences?.frequency ?? 'balanced',
        triggerTypes: {
          commitments: data.preferences?.triggerTypes?.commitments ?? currentPreferences.triggerTypes.commitments,
          emotional: data.preferences?.triggerTypes?.emotional ?? currentPreferences.triggerTypes.emotional,
          celebrations: data.preferences?.triggerTypes?.celebrations ?? currentPreferences.triggerTypes.celebrations,
          thinkingOfYou: data.preferences?.triggerTypes?.thinkingOfYou ?? currentPreferences.triggerTypes.thinkingOfYou,
          reminders: data.preferences?.triggerTypes?.reminders ?? currentPreferences.triggerTypes.reminders,
        },
      };
    }
  } catch (error) {
    log.warn('Failed to load outreach preferences:', error);
  }
}

async function savePreferences(): Promise<void> {
  try {
    const allowedChannels: string[] = [];
    if (currentPreferences.channels.sms) allowedChannels.push('sms');
    if (currentPreferences.channels.email) allowedChannels.push('email');
    if (currentPreferences.channels.call) allowedChannels.push('call');

    const response = await apiPost('/api/outreach/preferences', {
      preferences: {
        enabled: currentPreferences.enabled,
        allowedChannels,
        quietHours: currentPreferences.quietHours,
        frequency: currentPreferences.frequency,
        triggerTypes: currentPreferences.triggerTypes,
        maxPerDay: currentPreferences.frequency === 'minimal' ? 1
          : currentPreferences.frequency === 'balanced' ? 3 : 5,
        maxPerWeek: currentPreferences.frequency === 'minimal' ? 3
          : currentPreferences.frequency === 'balanced' ? 10 : 20,
      },
    });

    if (response.ok) {
      log.info('Saved outreach preferences');
    } else {
      log.warn('Failed to save outreach preferences:', response.error);
    }
  } catch (error) {
    log.error('Failed to save outreach preferences:', error);
  }
}

// ============================================================================
// UI CREATION
// ============================================================================

function createSettingsPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'outreach-settings-overlay';
  panel.innerHTML = `
    <div class="outreach-settings-backdrop"></div>
    <div class="outreach-settings-card">
      <header class="outreach-settings-header">
        <div class="outreach-settings-title-group">
          <span class="outreach-settings-eyebrow">OUTREACH</span>
          <h2 class="outreach-settings-title">Stay Connected</h2>
          <p class="outreach-settings-subtitle">Control how I check in with you</p>
        </div>
        <button class="outreach-settings-close" aria-label="${t('accessibility.closeSettings')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>
      
      <div class="outreach-settings-content">
        <!-- Master Toggle -->
        <section class="outreach-settings-section">
          <div class="outreach-settings-toggle-row outreach-settings-master" role="button" tabindex="0">
            <div class="outreach-settings-toggle-info" role="button" tabindex="0">
              <span class="outreach-settings-toggle-label" role="button" tabindex="0">Proactive Outreach</span>
              <span class="outreach-settings-toggle-desc" role="button" tabindex="0">Allow me to reach out to you between conversations</span>
            </div>
            <label class="outreach-settings-switch">
              <input type="checkbox" id="outreach-enabled" ${currentPreferences.enabled ? 'checked' : ''}>
              <span class="outreach-settings-slider"></span>
            </label>
          </div>
        </section>
        
        <div id="outreach-settings-details" class="${currentPreferences.enabled ? '' : 'disabled'}">
          <!-- Channels -->
          <section class="outreach-settings-section">
            <h3 class="outreach-settings-section-title">How to reach you</h3>
            <div class="outreach-settings-channels">
              <label class="outreach-settings-channel">
                <input type="checkbox" id="channel-sms" ${currentPreferences.channels.sms ? 'checked' : ''}>
                <div class="outreach-settings-channel-content">
                  <span class="outreach-settings-channel-icon"></span>
                  <span class="outreach-settings-channel-name">Text (SMS)</span>
                </div>
              </label>
              <label class="outreach-settings-channel">
                <input type="checkbox" id="channel-email" ${currentPreferences.channels.email ? 'checked' : ''}>
                <div class="outreach-settings-channel-content">
                  <span class="outreach-settings-channel-icon"></span>
                  <span class="outreach-settings-channel-name">Email</span>
                </div>
              </label>
              <label class="outreach-settings-channel">
                <input type="checkbox" id="channel-call" ${currentPreferences.channels.call ? 'checked' : ''}>
                <div class="outreach-settings-channel-content">
                  <span class="outreach-settings-channel-icon"></span>
                  <span class="outreach-settings-channel-name">Phone Call</span>
                </div>
              </label>
            </div>
          </section>
          
          <!-- Frequency -->
          <section class="outreach-settings-section">
            <h3 class="outreach-settings-section-title">How often</h3>
            <div class="outreach-settings-frequency">
              <label class="outreach-settings-frequency-option ${currentPreferences.frequency === 'minimal' ? 'selected' : ''}">
                <input type="radio" name="frequency" value="minimal" ${currentPreferences.frequency === 'minimal' ? 'checked' : ''}>
                <div class="outreach-settings-frequency-content">
                  <span class="outreach-settings-frequency-name">Minimal</span>
                  <span class="outreach-settings-frequency-desc">Only important things</span>
                </div>
              </label>
              <label class="outreach-settings-frequency-option ${currentPreferences.frequency === 'balanced' ? 'selected' : ''}">
                <input type="radio" name="frequency" value="balanced" ${currentPreferences.frequency === 'balanced' ? 'checked' : ''}>
                <div class="outreach-settings-frequency-content">
                  <span class="outreach-settings-frequency-name">Balanced</span>
                  <span class="outreach-settings-frequency-desc">A thoughtful friend</span>
                </div>
              </label>
              <label class="outreach-settings-frequency-option ${currentPreferences.frequency === 'active' ? 'selected' : ''}">
                <input type="radio" name="frequency" value="active" ${currentPreferences.frequency === 'active' ? 'checked' : ''}>
                <div class="outreach-settings-frequency-content">
                  <span class="outreach-settings-frequency-name">Active</span>
                  <span class="outreach-settings-frequency-desc">Proactive partner</span>
                </div>
              </label>
            </div>
          </section>
          
          <!-- Quiet Hours -->
          <section class="outreach-settings-section">
            <div class="outreach-settings-toggle-row" role="button" tabindex="0">
              <div class="outreach-settings-toggle-info" role="button" tabindex="0">
                <span class="outreach-settings-toggle-label" role="button" tabindex="0">Quiet Hours</span>
                <span class="outreach-settings-toggle-desc" role="button" tabindex="0">No outreach during these times</span>
              </div>
              <label class="outreach-settings-switch">
                <input type="checkbox" id="quiet-hours-enabled" ${currentPreferences.quietHours.enabled ? 'checked' : ''}>
                <span class="outreach-settings-slider"></span>
              </label>
            </div>
            <div class="outreach-settings-time-range ${currentPreferences.quietHours.enabled ? '' : 'disabled'}">
              <div class="outreach-settings-time-input">
                <label for="quiet-start">From</label>
                <input type="time" id="quiet-start" value="${currentPreferences.quietHours.start}">
              </div>
              <span class="outreach-settings-time-separator">to</span>
              <div class="outreach-settings-time-input">
                <label for="quiet-end">Until</label>
                <input type="time" id="quiet-end" value="${currentPreferences.quietHours.end}">
              </div>
            </div>
          </section>
          
          <!-- Types -->
          <section class="outreach-settings-section">
            <h3 class="outreach-settings-section-title">What I'll reach out about</h3>
            <div class="outreach-settings-types">
              <label class="outreach-settings-type">
                <input type="checkbox" id="type-commitments" ${currentPreferences.triggerTypes.commitments ? 'checked' : ''}>
                <div class="outreach-settings-type-content">
                  <span class="outreach-settings-type-icon">${ICONS.clipboard}</span>
                  <div class="outreach-settings-type-text">
                    <span class="outreach-settings-type-name">Commitments</span>
                    <span class="outreach-settings-type-desc">Check in on things you said you'd do</span>
                  </div>
                </div>
              </label>
              <label class="outreach-settings-type">
                <input type="checkbox" id="type-emotional" ${currentPreferences.triggerTypes.emotional ? 'checked' : ''}>
                <div class="outreach-settings-type-content">
                  <span class="outreach-settings-type-icon">${ICONS.heart}</span>
                  <div class="outreach-settings-type-text">
                    <span class="outreach-settings-type-name">Support</span>
                    <span class="outreach-settings-type-desc">Check in when you might need it</span>
                  </div>
                </div>
              </label>
              <label class="outreach-settings-type">
                <input type="checkbox" id="type-celebrations" ${currentPreferences.triggerTypes.celebrations ? 'checked' : ''}>
                <div class="outreach-settings-type-content">
                  <span class="outreach-settings-type-icon">${ICONS.sparkles}</span>
                  <div class="outreach-settings-type-text">
                    <span class="outreach-settings-type-name">Celebrations</span>
                    <span class="outreach-settings-type-desc">Celebrate your wins with you</span>
                  </div>
                </div>
              </label>
              <label class="outreach-settings-type">
                <input type="checkbox" id="type-thinking" ${currentPreferences.triggerTypes.thinkingOfYou ? 'checked' : ''}>
                <div class="outreach-settings-type-content">
                  <span class="outreach-settings-type-icon">${ICONS.thoughtBubble}</span>
                  <div class="outreach-settings-type-text">
                    <span class="outreach-settings-type-name">Thinking of You</span>
                    <span class="outreach-settings-type-desc">Random moments of connection</span>
                  </div>
                </div>
              </label>
              <label class="outreach-settings-type">
                <input type="checkbox" id="type-reminders" ${currentPreferences.triggerTypes.reminders ? 'checked' : ''}>
                <div class="outreach-settings-type-content">
                  <span class="outreach-settings-type-icon">${ICONS.bell}</span>
                  <div class="outreach-settings-type-text">
                    <span class="outreach-settings-type-name">Reminders</span>
                    <span class="outreach-settings-type-desc">Important dates and events</span>
                  </div>
                </div>
              </label>
            </div>
          </section>
        </div>
      </div>
      
      <footer class="outreach-settings-footer">
        <button aria-label="Save Preferences" class="outreach-settings-save">Save Preferences</button>
      </footer>
    </div>
  `;

  // Add styles
  if (!document.getElementById('outreach-settings-styles')) {
    const styles = document.createElement('style');
    styles.id = 'outreach-settings-styles';
    styles.textContent = getStyles();
    document.head.appendChild(styles);
  }

  // Event listeners
  setupEventListeners(panel);

  return panel;
}

function setupEventListeners(panel: HTMLElement): void {
  // Close button
  panel.querySelector('.outreach-settings-close')?.addEventListener('click', close);
  panel.querySelector('.outreach-settings-backdrop')?.addEventListener('click', close);

  // Master toggle
  const enabledToggle = panel.querySelector('#outreach-enabled') as HTMLInputElement;
  enabledToggle?.addEventListener('change', () => {
    currentPreferences.enabled = enabledToggle.checked;
    const details = panel.querySelector('#outreach-settings-details');
    details?.classList.toggle('disabled', !enabledToggle.checked);
  });

  // Channel toggles
  (['sms', 'email', 'call'] as const).forEach((channel) => {
    const checkbox = panel.querySelector(`#channel-${channel}`) as HTMLInputElement;
    checkbox?.addEventListener('change', () => {
      currentPreferences.channels[channel] = checkbox.checked;
    });
  });

  // Frequency radio buttons
  panel.querySelectorAll('input[name="frequency"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const value = (radio as HTMLInputElement).value as OutreachPreferences['frequency'];
      currentPreferences.frequency = value;
      panel.querySelectorAll('.outreach-settings-frequency-option').forEach((opt) => {
        opt.classList.toggle('selected', (opt.querySelector('input') as HTMLInputElement).value === value);
      });
    });
  });

  // Quiet hours
  const quietToggle = panel.querySelector('#quiet-hours-enabled') as HTMLInputElement;
  quietToggle?.addEventListener('change', () => {
    currentPreferences.quietHours.enabled = quietToggle.checked;
    panel.querySelector('.outreach-settings-time-range')?.classList.toggle('disabled', !quietToggle.checked);
  });

  const quietStart = panel.querySelector('#quiet-start') as HTMLInputElement;
  quietStart?.addEventListener('change', () => {
    currentPreferences.quietHours.start = quietStart.value;
  });

  const quietEnd = panel.querySelector('#quiet-end') as HTMLInputElement;
  quietEnd?.addEventListener('change', () => {
    currentPreferences.quietHours.end = quietEnd.value;
  });

  // Trigger types
  const typeMap: Record<string, keyof OutreachPreferences['triggerTypes']> = {
    commitments: 'commitments',
    emotional: 'emotional',
    celebrations: 'celebrations',
    thinking: 'thinkingOfYou',
    reminders: 'reminders',
  };

  Object.entries(typeMap).forEach(([id, key]) => {
    const checkbox = panel.querySelector(`#type-${id}`) as HTMLInputElement;
    checkbox?.addEventListener('change', () => {
      currentPreferences.triggerTypes[key] = checkbox.checked;
    });
  });

  // Save button
  panel.querySelector('.outreach-settings-save')?.addEventListener('click', () => {
    void (async () => {
      const saveBtn = panel.querySelector('.outreach-settings-save') as HTMLButtonElement;
      saveBtn.textContent = t('common.saving');
      saveBtn.disabled = true;

      await savePreferences();

      saveBtn.textContent = t('common.saved');
      trackedTimeout(() => {
        saveBtn.textContent = t('buttons.savePreferences');
        saveBtn.disabled = false;
        close();
      }, 1000);
    })();
  });
}

function getStyles(): string {
  return `
    .outreach-settings-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-tooltip);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--duration-moderate) var(--ease-gentle);
    }

    .outreach-settings-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .outreach-settings-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .outreach-settings-card {
      position: relative;
      width: 90%;
      max-width: clamp(350px, 90vw, 500px);
      max-height: 85vh;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform var(--duration-moderate) var(--ease-spring);
    }

    .outreach-settings-overlay.open .outreach-settings-card {
      transform: scale(1);
    }

    .outreach-settings-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: var(--space-6);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .outreach-settings-title-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .outreach-settings-eyebrow {
      font-size: var(--text-xs);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-secondary);
    }

    .outreach-settings-title {
      font-family: var(--font-display);
      font-size: var(--text-xl);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
    }

    .outreach-settings-subtitle {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
      margin: 0;
    }

    .outreach-settings-close {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--duration-fast) var(--ease-gentle);
    }

    .outreach-settings-close:hover {
      background: var(--color-background-primary);
      color: var(--color-text-primary);
    }

    .outreach-settings-close svg {
      width: 20px;
      height: 20px;
    }

    .outreach-settings-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4) var(--space-6);
    }

    .outreach-settings-section {
      margin-bottom: var(--space-6);
    }

    .outreach-settings-section-title {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-3) 0;
    }

    /* Toggle Row */
    .outreach-settings-toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-3) var(--space-4);
      background: var(--color-background-primary);
      border-radius: var(--radius-lg);
    }

    .outreach-settings-master {
      background: var(--persona-tint);
      border: 1px solid var(--persona-primary);
    }

    .outreach-settings-toggle-info {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .outreach-settings-toggle-label {
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .outreach-settings-toggle-desc {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    /* Switch */
    .outreach-settings-switch {
      position: relative;
      width: 48px;
      height: 28px;
    }

    .outreach-settings-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .outreach-settings-slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background: var(--color-background-elevated);
      border: 2px solid var(--color-border-default);
      border-radius: var(--radius-full);
      transition: all var(--duration-fast) var(--ease-gentle);
    }

    .outreach-settings-slider::before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 2px;
      top: 2px;
      background: white;
      border-radius: 50%;
      transition: all var(--duration-fast) var(--ease-spring);
      box-shadow: var(--shadow-sm);
    }

    .outreach-settings-switch input:checked + .outreach-settings-slider {
      background: var(--persona-primary);
      border-color: var(--color-text-secondary);
    }

    .outreach-settings-switch input:checked + .outreach-settings-slider::before {
      transform: translateX(20px);
    }

    /* Channels */
    .outreach-settings-channels {
      display: flex;
      gap: var(--space-3);
    }

    .outreach-settings-channel {
      flex: 1;
      cursor: pointer;
    }

    .outreach-settings-channel input {
      display: none;
    }

    .outreach-settings-channel-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-4);
      background: var(--color-background-primary);
      border: 2px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      transition: all var(--duration-fast) var(--ease-gentle);
    }

    .outreach-settings-channel input:checked + .outreach-settings-channel-content {
      border-color: var(--color-text-secondary);
      background: var(--persona-tint);
    }

    .outreach-settings-channel-icon {
      font-size: 24px;
    }

    .outreach-settings-channel-name {
      font-size: var(--text-sm);
      font-weight: 500;
    }

    /* Frequency */
    .outreach-settings-frequency {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .outreach-settings-frequency-option {
      cursor: pointer;
    }

    .outreach-settings-frequency-option input {
      display: none;
    }

    .outreach-settings-frequency-content {
      display: flex;
      flex-direction: column;
      padding: var(--space-3) var(--space-4);
      background: var(--color-background-primary);
      border: 2px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      transition: all var(--duration-fast) var(--ease-gentle);
    }

    .outreach-settings-frequency-option.selected .outreach-settings-frequency-content {
      border-color: var(--color-text-secondary);
      background: var(--persona-tint);
    }

    .outreach-settings-frequency-name {
      font-weight: 600;
    }

    .outreach-settings-frequency-desc {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    /* Time Range */
    .outreach-settings-time-range {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-top: var(--space-3);
      padding: var(--space-3);
      background: var(--color-background-primary);
      border-radius: var(--radius-lg);
      transition: opacity var(--duration-fast);
    }

    .outreach-settings-time-range.disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .outreach-settings-time-input {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .outreach-settings-time-input label {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }

    .outreach-settings-time-input input {
      padding: var(--space-2);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-md);
      background: var(--color-background-elevated);
      color: var(--color-text-primary);
      font-family: var(--font-mono);
    }

    .outreach-settings-time-separator {
      color: var(--color-text-muted);
      margin-top: var(--space-4);
    }

    /* Types */
    .outreach-settings-types {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .outreach-settings-type {
      cursor: pointer;
    }

    .outreach-settings-type input {
      display: none;
    }

    .outreach-settings-type-content {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--color-background-primary);
      border: 2px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      transition: all var(--duration-fast) var(--ease-gentle);
    }

    .outreach-settings-type input:checked + .outreach-settings-type-content {
      border-color: var(--color-text-secondary);
      background: var(--persona-tint);
    }

    .outreach-settings-type-icon {
      width: 20px;
      height: 20px;
      color: var(--persona-primary, #4a6741);
      flex-shrink: 0;
    }

    .outreach-settings-type-icon svg {
      width: 100%;
      height: 100%;
    }

    .outreach-settings-type-text {
      display: flex;
      flex-direction: column;
    }

    .outreach-settings-type-name {
      font-weight: 500;
    }

    .outreach-settings-type-desc {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    /* Footer */
    .outreach-settings-footer {
      padding: var(--space-4) var(--space-6);
      border-top: 1px solid var(--color-border-subtle);
    }

    .outreach-settings-save {
      width: 100%;
      padding: var(--space-3) var(--space-6);
      background: var(--persona-primary);
      color: white;
      border: none;
      border-radius: var(--radius-lg);
      font-weight: 600;
      font-size: var(--text-base);
      cursor: pointer;
      transition: all var(--duration-fast) var(--ease-gentle);
    }

    .outreach-settings-save:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .outreach-settings-save:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    /* Disabled State */
    #outreach-settings-details.disabled {
      opacity: 0.4;
      pointer-events: none;
    }
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the outreach settings panel
 */
export async function open(): Promise<void> {
  if (isOpen) return;

  await loadPreferences();

  if (!settingsPanel) {
    settingsPanel = createSettingsPanel();
    document.body.appendChild(settingsPanel);
  } else {
    // Update the panel with current preferences
    updatePanelUI();
  }

  // Trigger open animation
  requestAnimationFrame(() => {
    settingsPanel?.classList.add('open');
  });

  isOpen = true;
  log.info('Opened outreach settings');
}

/**
 * Close the outreach settings panel
 */
export function close(): void {
  if (!isOpen || !settingsPanel) return;

  settingsPanel.classList.remove('open');

  // Remove after animation
  trackedTimeout(() => {
    settingsPanel?.remove();
    settingsPanel = null;
  }, DURATION.MODERATE);

  isOpen = false;
  log.info('Closed outreach settings');
}

/**
 * Toggle the outreach settings panel
 */
export function toggle(): void {
  if (isOpen) {
    close();
  } else {
    void open();
  }
}

/**
 * Update panel UI with current preferences
 */
function updatePanelUI(): void {
  if (!settingsPanel) return;

  // Master toggle
  const enabledToggle = settingsPanel.querySelector('#outreach-enabled') as HTMLInputElement;
  if (enabledToggle) enabledToggle.checked = currentPreferences.enabled;

  // Channels
  (['sms', 'email', 'call'] as const).forEach((channel) => {
    const checkbox = settingsPanel?.querySelector(`#channel-${channel}`) as HTMLInputElement;
    if (checkbox) checkbox.checked = currentPreferences.channels[channel];
  });

  // Other elements...
}

/**
 * Get current preferences (for external use)
 */
export function getPreferences(): OutreachPreferences {
  return { ...currentPreferences };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const outreachSettings = {
  open,
  close,
  toggle,
  getPreferences,
};

export default outreachSettings;

