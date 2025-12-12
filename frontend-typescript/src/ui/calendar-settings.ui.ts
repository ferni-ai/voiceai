/**
 * Calendar Settings UI
 *
 * Allows users to connect their Google Calendar for smarter outreach timing.
 * A good friend doesn't call when you're in a meeting.
 *
 * DESIGN PRINCIPLES:
 * - Brand-compliant centered modal
 * - Clear connection status
 * - Privacy-focused messaging
 * - Warm, human copy
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('CalendarSettings');

// ============================================================================
// TYPES
// ============================================================================

interface CalendarStatus {
  connected: boolean;
  email?: string;
  lastSynced?: string;
  busySlotsToday?: number;
  configured: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let settingsPanel: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isOpen = false;
let currentStatus: CalendarStatus = {
  connected: false,
  configured: false,
};

// ============================================================================
// ICONS (Lucide SVG)
// ============================================================================

const ICONS = {
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  unlink: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  google: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
};

// ============================================================================
// API
// ============================================================================

async function fetchCalendarStatus(): Promise<CalendarStatus> {
  try {
    const response = await apiGet<{
      connected?: boolean;
      email?: string;
      lastSynced?: string;
      busySlotsToday?: number;
      configured?: boolean;
    }>('/api/calendar/status');

    if (response.ok && response.data) {
      return {
        connected: response.data.connected ?? false,
        email: response.data.email,
        lastSynced: response.data.lastSynced,
        busySlotsToday: response.data.busySlotsToday,
        configured: response.data.configured ?? true,
      };
    }
  } catch (error) {
    log.warn('Failed to fetch calendar status:', error);
  }
  return { connected: false, configured: false };
}

async function disconnectCalendar(): Promise<boolean> {
  try {
    const response = await apiPost('/api/calendar/disconnect');
    return response.ok;
  } catch (error) {
    log.error('Failed to disconnect calendar:', error);
    return false;
  }
}

async function syncCalendar(): Promise<boolean> {
  try {
    const response = await apiPost('/api/calendar/sync');
    return response.ok;
  } catch (error) {
    log.error('Failed to sync calendar:', error);
    return false;
  }
}

// ============================================================================
// UI CREATION
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.setAttribute('data-calendar-settings-styles', '');
  styleElement.textContent = `
    /* ========================================================================
       CALENDAR SETTINGS MODAL
       ======================================================================== */
    .calendar-settings-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 10000);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .calendar-settings-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .calendar-settings-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.5));
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .calendar-settings-card {
      position: relative;
      width: 90%;
      max-width: 440px;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(44, 37, 32, 0.25));
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
    }

    .calendar-settings-overlay.open .calendar-settings-card {
      transform: scale(1) translateY(0);
    }

    .calendar-settings-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .calendar-settings-title-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);
    }

    .calendar-settings-eyebrow {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xs, 11px);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-accent-text, var(--persona-primary, #4a6741));
    }

    .calendar-settings-eyebrow svg {
      width: 14px;
      height: 14px;
    }

    .calendar-settings-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 20px);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .calendar-settings-subtitle {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-muted, #756A5E);
      margin: 0;
    }

    .calendar-settings-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      background: var(--color-background-secondary, #F5F1E8);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .calendar-settings-close:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      color: var(--color-text-primary, #2C2520);
    }

    .calendar-settings-close svg {
      width: 18px;
      height: 18px;
    }

    .calendar-settings-content {
      padding: var(--space-6, 24px);
    }

    /* Connection Status */
    .calendar-status {
      display: flex;
      align-items: center;
      gap: var(--space-4, 16px);
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-lg, 12px);
      margin-bottom: var(--space-6, 24px);
    }

    .calendar-status-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-full, 9999px);
      flex-shrink: 0;
    }

    .calendar-status-icon svg {
      width: 24px;
      height: 24px;
    }

    .calendar-status-icon.connected {
      background: var(--color-semantic-success-bg, #e8f5e9);
      color: var(--color-semantic-success, #2e7d32);
    }

    .calendar-status-icon.disconnected {
      color: var(--color-text-muted, #756A5E);
    }

    .calendar-status-info {
      flex: 1;
      min-width: 0;
    }

    .calendar-status-label {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 16px);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px);
    }

    .calendar-status-detail {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-muted, #756A5E);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Action Buttons */
    .calendar-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .calendar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3, 12px);
      width: 100%;
      padding: var(--space-4, 16px);
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 16px);
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .calendar-btn svg {
      width: 20px;
      height: 20px;
    }

    .calendar-btn-primary {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .calendar-btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md, 0 4px 12px rgba(74, 103, 65, 0.3));
    }

    .calendar-btn-google {
      background: white;
      border: 2px solid var(--color-border-default, rgba(44, 37, 32, 0.15));
      color: var(--color-text-primary, #2C2520);
    }

    .calendar-btn-google:hover {
      background: var(--color-background-secondary, #F5F1E8);
      border-color: var(--color-border-subtle, rgba(44, 37, 32, 0.2));
    }

    .calendar-btn-secondary {
      background: var(--color-background-secondary, #F5F1E8);
      color: var(--color-text-secondary, #5C544A);
    }

    .calendar-btn-secondary:hover {
      background: var(--color-background-tertiary, #E8E0D5);
    }

    .calendar-btn-danger {
      background: transparent;
      color: var(--color-semantic-error, #c62828);
      border: 1px solid var(--color-semantic-error, #c62828);
    }

    .calendar-btn-danger:hover {
      background: var(--color-semantic-error-bg, #ffebee);
    }

    .calendar-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none !important;
    }

    /* Privacy Note */
    .calendar-privacy {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-lg, 12px);
      margin-top: var(--space-6, 24px);
    }

    .calendar-privacy-icon {
      color: var(--color-text-secondary);
      flex-shrink: 0;
    }

    .calendar-privacy-icon svg {
      width: 20px;
      height: 20px;
    }

    .calendar-privacy-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      line-height: 1.5;
      margin: 0;
    }

    /* Busy Slots Preview */
    .calendar-busy-preview {
      margin-top: var(--space-4, 16px);
      padding: var(--space-3, 12px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-md, 8px);
    }

    .calendar-busy-label {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xs, 11px);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted, #756A5E);
      margin: 0 0 var(--space-2, 8px);
    }

    .calendar-busy-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 18px);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
    }

    /* Loading State */
    .calendar-btn.loading svg {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Dark Theme */
    [data-theme="midnight"] .calendar-settings-card {
      background: var(--color-background-elevated, #70605a);
    }

    [data-theme="midnight"] .calendar-settings-title {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .calendar-settings-subtitle,
    [data-theme="midnight"] .calendar-status-detail,
    [data-theme="midnight"] .calendar-privacy-text {
      color: var(--color-text-secondary, #f0ebe4);
    }

    [data-theme="midnight"] .calendar-status,
    [data-theme="midnight"] .calendar-busy-preview {
      background: var(--color-background-secondary, #60504a);
    }

    [data-theme="midnight"] .calendar-status-label,
    [data-theme="midnight"] .calendar-busy-value {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .calendar-btn-google {
      background: var(--color-background-secondary, #60504a);
      border-color: var(--color-border-default, rgba(250, 246, 240, 0.15));
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .calendar-btn-secondary {
      background: var(--color-background-secondary, #60504a);
      color: var(--color-text-secondary, #f0ebe4);
    }
  `;
  document.head.appendChild(styleElement);
}

function createSettingsPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'calendar-settings-overlay';
  panel.innerHTML = renderContent();

  // Event listeners
  panel.querySelector('.calendar-settings-backdrop')?.addEventListener('click', close);
  panel.querySelector('.calendar-settings-close')?.addEventListener('click', close);

  setupActionListeners(panel);

  return panel;
}

function renderContent(): string {
  const { connected, email, lastSynced, busySlotsToday, configured } = currentStatus;

  if (!configured) {
    return `
      <div class="calendar-settings-backdrop"></div>
      <div class="calendar-settings-card">
        <header class="calendar-settings-header">
          <div class="calendar-settings-title-group">
            <div class="calendar-settings-eyebrow">
              ${ICONS.calendar}
              <span>Calendar</span>
            </div>
            <h2 class="calendar-settings-title">Smart Timing</h2>
            <p class="calendar-settings-subtitle">Coming soon</p>
          </div>
          <button class="calendar-settings-close" aria-label="Close">
            ${ICONS.close}
          </button>
        </header>
        <div class="calendar-settings-content">
          <p class="calendar-privacy-text" style="text-align: center; padding: var(--space-8, 32px);">
            Calendar integration is not yet configured. Check back soon!
          </p>
        </div>
      </div>
    `;
  }

  if (connected) {
    return `
      <div class="calendar-settings-backdrop"></div>
      <div class="calendar-settings-card">
        <header class="calendar-settings-header">
          <div class="calendar-settings-title-group">
            <div class="calendar-settings-eyebrow">
              ${ICONS.calendar}
              <span>Calendar</span>
            </div>
            <h2 class="calendar-settings-title">Connected</h2>
            <p class="calendar-settings-subtitle">I know when you're busy</p>
          </div>
          <button class="calendar-settings-close" aria-label="Close">
            ${ICONS.close}
          </button>
        </header>
        <div class="calendar-settings-content">
          <div class="calendar-status">
            <div class="calendar-status-icon connected">
              ${ICONS.check}
            </div>
            <div class="calendar-status-info">
              <p class="calendar-status-label">Google Calendar</p>
              <p class="calendar-status-detail">${email || 'Connected'}</p>
            </div>
          </div>

          ${typeof busySlotsToday === 'number' ? `
            <div class="calendar-busy-preview">
              <p class="calendar-busy-label">Events today</p>
              <p class="calendar-busy-value">${busySlotsToday} ${busySlotsToday === 1 ? 'event' : 'events'}</p>
            </div>
          ` : ''}

          <div class="calendar-actions">
            <button class="calendar-btn calendar-btn-secondary" data-action="sync">
              ${ICONS.refresh}
              <span>Sync Now</span>
            </button>
            <button class="calendar-btn calendar-btn-danger" data-action="disconnect">
              ${ICONS.unlink}
              <span>Disconnect Calendar</span>
            </button>
          </div>

          <div class="calendar-privacy">
            <span class="calendar-privacy-icon">${ICONS.shield}</span>
            <p class="calendar-privacy-text">
              I only see when you're free or busy, not what your events are about.
              ${lastSynced ? `Last synced ${formatRelativeTime(lastSynced)}.` : ''}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  // Not connected
  return `
    <div class="calendar-settings-backdrop"></div>
    <div class="calendar-settings-card">
      <header class="calendar-settings-header">
        <div class="calendar-settings-title-group">
          <div class="calendar-settings-eyebrow">
            ${ICONS.calendar}
            <span>Calendar</span>
          </div>
          <h2 class="calendar-settings-title">Smart Timing</h2>
          <p class="calendar-settings-subtitle">Know when to reach you</p>
        </div>
        <button class="calendar-settings-close" aria-label="Close">
          ${ICONS.close}
        </button>
      </header>
      <div class="calendar-settings-content">
        <div class="calendar-status">
          <div class="calendar-status-icon disconnected">
            ${ICONS.clock}
          </div>
          <div class="calendar-status-info">
            <p class="calendar-status-label">Not Connected</p>
            <p class="calendar-status-detail">Connect to enable smart timing</p>
          </div>
        </div>

        <div class="calendar-actions">
          <button class="calendar-btn calendar-btn-google" data-action="connect">
            ${ICONS.google}
            <span>Connect Google Calendar</span>
          </button>
        </div>

        <div class="calendar-privacy">
          <span class="calendar-privacy-icon">${ICONS.shield}</span>
          <p class="calendar-privacy-text">
            I'll only see when you're free or busy — never the details of your events.
            A good friend doesn't call when you're in a meeting.
          </p>
        </div>
      </div>
    </div>
  `;
}

function setupActionListeners(panel: HTMLElement): void {
  panel.querySelector('[data-action="connect"]')?.addEventListener('click', async () => {
    const btn = panel.querySelector('[data-action="connect"]') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
    }

    const userId = appState.getState().deviceId;
    const returnUrl = encodeURIComponent(window.location.href + '?calendar_linked=true');

    // Redirect to OAuth flow
    window.location.href = `/auth/google/login?user_id=${userId}&return_url=${returnUrl}`;
  });

  panel.querySelector('[data-action="sync"]')?.addEventListener('click', async () => {
    const btn = panel.querySelector('[data-action="sync"]') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
    }

    const success = await syncCalendar();

    if (success) {
      currentStatus = await fetchCalendarStatus();
      updatePanelContent();
    }

    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  });

  panel.querySelector('[data-action="disconnect"]')?.addEventListener('click', async () => {
    const btn = panel.querySelector('[data-action="disconnect"]') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Disconnecting...';
    }

    const success = await disconnectCalendar();

    if (success) {
      currentStatus = { connected: false, configured: true };
      updatePanelContent();
    } else if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${ICONS.unlink}<span>Disconnect Calendar</span>`;
    }
  });
}

function updatePanelContent(): void {
  if (!settingsPanel) return;

  const card = settingsPanel.querySelector('.calendar-settings-card');
  if (card) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderContent();
    const newCard = tempDiv.querySelector('.calendar-settings-card');
    if (newCard) {
      card.innerHTML = newCard.innerHTML;
      setupActionListeners(settingsPanel);
    }
  }
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
  return `${Math.floor(diffMins / 1440)} days ago`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the calendar settings panel
 */
export async function openCalendarSettings(): Promise<void> {
  if (isOpen) return;

  injectStyles();
  currentStatus = await fetchCalendarStatus();

  if (!settingsPanel) {
    settingsPanel = createSettingsPanel();
    document.body.appendChild(settingsPanel);
  } else {
    updatePanelContent();
  }

  // Trigger open animation
  requestAnimationFrame(() => {
    settingsPanel?.classList.add('open');
  });

  isOpen = true;
  log.info('Opened calendar settings');
}

/**
 * Close the calendar settings panel
 */
export function closeCalendarSettings(): void {
  if (!isOpen || !settingsPanel) return;

  settingsPanel.classList.remove('open');

  // Remove after animation
  setTimeout(() => {
    settingsPanel?.remove();
    settingsPanel = null;
  }, DURATION.MODERATE);

  isOpen = false;
  log.info('Closed calendar settings');
}

// Alias for module API consistency
export const close = closeCalendarSettings;

/**
 * Check if calendar is connected (for external use)
 */
export function isCalendarConnected(): boolean {
  return currentStatus.connected;
}

/**
 * Get current calendar status
 */
export function getCalendarStatus(): CalendarStatus {
  return { ...currentStatus };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const calendarSettings = {
  open: openCalendarSettings,
  close: closeCalendarSettings,
  isConnected: isCalendarConnected,
  getStatus: getCalendarStatus,
};

export default calendarSettings;

