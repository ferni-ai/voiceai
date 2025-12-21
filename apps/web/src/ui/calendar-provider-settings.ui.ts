/**
 * Calendar Provider Settings UI
 *
 * Allows users to connect and manage multiple calendar providers
 * (Google, Apple, Outlook) from a unified settings panel.
 *
 * DESIGN PRINCIPLES:
 *   - Centered floating modal (brand-compliant)
 *   - Clear connection status for each provider
 *   - One-click connect/disconnect
 *   - Primary calendar selection
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';

const log = createLogger('CalendarProviderUI');

const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export type CalendarProvider = 'google' | 'apple' | 'outlook';

export interface ProviderStatus {
  provider: CalendarProvider;
  connected: boolean;
  email?: string;
  displayName?: string;
  calendars?: Array<{ id: string; name: string; selected: boolean; primary?: boolean }>;
  lastSyncedAt?: string;
  syncEnabled: boolean;
}

export interface CalendarProviderCallbacks {
  onClose?: () => void;
  onProviderConnected?: (provider: CalendarProvider) => void;
  onProviderDisconnected?: (provider: CalendarProvider) => void;
  onPrimaryCalendarChanged?: (provider: CalendarProvider, calendarId: string) => void;
}

// ============================================================================
// ICONS (Lucide-style + brand logos)
// ============================================================================

const ICONS = {
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>`,
  unlink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M5.16 11.75L3.44 13.46a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>`,
  // Provider logos (simplified SVG icons)
  google: `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>`,
  apple: `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>`,
  outlook: `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V12zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l-1.5 1.17 1.5 1.17v1.83h3v-6zm-5-9v3h3v-3zm0 4.5v3h3v-3zm0 4.5v4.5h3v-4.5zM2 17h4v-1.3l-.4-.3H2zm10-11v5.75q0 .66.47 1.13.47.46 1.13.46h3.9v5.66l-2 1.56v.13l2 1.56v.66h-5.5V13h-5v4h-.5q-.66 0-1.13-.47-.46-.47-.46-1.13V6z"/>
  </svg>`,
};

const PROVIDER_INFO: Record<CalendarProvider, { name: string; color: string; icon: string }> = {
  google: { name: 'Google Calendar', color: 'var(--color-semantic-info)', icon: ICONS.google },
  apple: { name: 'Apple Calendar', color: 'var(--color-text-primary)', icon: ICONS.apple },
  outlook: { name: 'Outlook', color: 'var(--color-accent-primary)', icon: ICONS.outlook },
};

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let providers: ProviderStatus[] = [];

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('calendar-provider-styles')) return;

  const style = document.createElement('style');
  style.id = 'calendar-provider-styles';
  style.textContent = `
    .calendar-provider-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal-backdrop);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-lg);
      opacity: 0;
      transition: opacity var(--duration-normal) var(--ease-out-expo);
    }

    .calendar-provider-overlay.visible {
      opacity: 1;
    }

    .calendar-provider-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy);
      backdrop-filter: blur(var(--glass-blur-heavy));
    }

    .calendar-provider-panel {
      position: relative;
      z-index: var(--z-modal);
      width: 100%;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      background: var(--color-bg-elevated);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-2xl);
      transform: scale(0.95) translateY(10px);
      transition: transform var(--duration-slow) var(--ease-spring);
    }

    .calendar-provider-overlay.visible .calendar-provider-panel {
      transform: scale(1) translateY(0);
    }

    .calendar-provider-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-lg);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .calendar-provider-header h2 {
      font-size: var(--text-lg);
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }

    .calendar-provider-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      border-radius: var(--radius-full);
      color: var(--color-text-muted);
      cursor: pointer;
      transition: all var(--duration-fast) var(--ease-out-expo);
    }

    .calendar-provider-close:hover,
    .calendar-provider-close:focus-visible {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }

    .calendar-provider-close:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .calendar-provider-close svg {
      width: 20px;
      height: 20px;
    }

    .calendar-provider-content {
      padding: var(--space-lg);
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .calendar-provider-card {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-md);
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-xl);
      border: 1px solid var(--color-border-subtle);
      transition: all var(--duration-fast) var(--ease-out-expo);
    }

    .calendar-provider-card.connected {
      border-color: var(--color-semantic-success);
    }

    .provider-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg);
      flex-shrink: 0;
    }

    .provider-icon svg {
      width: 24px;
      height: 24px;
    }

    .provider-info {
      flex: 1;
      min-width: 0;
    }

    .provider-name {
      font-size: var(--text-base);
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: var(--space-2xs);
    }

    .provider-status {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    .provider-status.connected {
      color: var(--color-semantic-success);
    }

    .provider-email {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .provider-actions {
      display: flex;
      gap: var(--space-xs);
    }

    .provider-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all var(--duration-fast) var(--ease-out-expo);
    }

    .provider-action-btn:hover,
    .provider-action-btn:focus-visible {
      background: var(--color-accent-primary);
      color: var(--color-bg-primary);
    }

    .provider-action-btn:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .provider-action-btn.disconnect:hover {
      background: var(--color-semantic-error);
    }

    .provider-action-btn svg {
      width: 18px;
      height: 18px;
    }

    .provider-connect-btn {
      padding: var(--space-sm) var(--space-md);
      border: none;
      background: var(--color-accent-primary);
      color: var(--color-bg-primary);
      font-size: var(--text-sm);
      font-weight: 500;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: all var(--duration-fast) var(--ease-out-expo);
    }

    .provider-connect-btn:hover,
    .provider-connect-btn:focus-visible {
      transform: scale(1.02);
      box-shadow: var(--shadow-md);
    }

    .provider-connect-btn:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    /* Calendar Selection */
    .calendar-list {
      margin-top: var(--space-sm);
      padding-top: var(--space-sm);
      border-top: 1px solid var(--color-border-subtle);
    }

    .calendar-list-title {
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--color-text-muted);
      margin-bottom: var(--space-xs);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .calendar-item {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-xs) 0;
    }

    .calendar-item input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--color-accent-primary);
      cursor: pointer;
    }

    .calendar-item label {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      cursor: pointer;
      flex: 1;
    }

    .calendar-item .primary-badge {
      font-size: var(--text-xs);
      color: var(--color-accent-primary);
      background: var(--color-accent-primary-light, rgba(74, 103, 65, 0.1));
      padding: var(--space-2xs) var(--space-xs);
      border-radius: var(--radius-sm);
    }

    /* Loading */
    .provider-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-xl);
    }

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--color-border-subtle);
      border-top-color: var(--color-accent-primary);
      border-radius: var(--radius-full);
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .calendar-provider-overlay,
      .calendar-provider-panel,
      .loading-spinner {
        transition: none;
        animation: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDERING
// ============================================================================

function renderProviderCard(status: ProviderStatus): string {
  const info = PROVIDER_INFO[status.provider];

  if (status.connected) {
    return `
      <div class="calendar-provider-card connected" data-provider="${status.provider}">
        <div class="provider-icon" style="color: ${info.color}">
          ${info.icon}
        </div>
        <div class="provider-info">
          <div class="provider-name">${info.name}</div>
          <div class="provider-status connected">
            ${ICONS.check} Connected
          </div>
          ${status.email ? `<div class="provider-email">${status.email}</div>` : ''}
          ${status.calendars && status.calendars.length > 0 ? `
            <div class="calendar-list">
              <div class="calendar-list-title">${t('calendar.providers.syncedCalendars', 'Synced Calendars')}</div>
              ${status.calendars.map((cal) => `
                <div class="calendar-item">
                  <input 
                    type="checkbox" 
                    id="cal-${status.provider}-${cal.id}" 
                    ${cal.selected ? 'checked' : ''}
                    data-calendar-id="${cal.id}"
                    data-provider="${status.provider}"
                  />
                  <label for="cal-${status.provider}-${cal.id}">${cal.name}</label>
                  ${cal.primary ? '<span class="primary-badge">Primary</span>' : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="provider-actions">
          <button 
            class="provider-action-btn" 
            data-action="sync" 
            data-provider="${status.provider}"
            aria-label="${t('calendar.providers.sync', 'Sync')}"
            title="${t('calendar.providers.sync', 'Sync now')}"
          >
            ${ICONS.refresh}
          </button>
          <button 
            class="provider-action-btn disconnect" 
            data-action="disconnect" 
            data-provider="${status.provider}"
            aria-label="${t('calendar.providers.disconnect', 'Disconnect')}"
            title="${t('calendar.providers.disconnect', 'Disconnect')}"
          >
            ${ICONS.unlink}
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="calendar-provider-card" data-provider="${status.provider}">
      <div class="provider-icon" style="color: ${info.color}">
        ${info.icon}
      </div>
      <div class="provider-info">
        <div class="provider-name">${info.name}</div>
        <div class="provider-status">${t('calendar.providers.notConnected', 'Not connected')}</div>
      </div>
      <button 
        class="provider-connect-btn" 
        data-action="connect" 
        data-provider="${status.provider}"
      >
        ${t('calendar.providers.connect', 'Connect')}
      </button>
    </div>
  `;
}

function renderContent(): string {
  if (providers.length === 0) {
    return `
      <div class="provider-loading">
        <div class="loading-spinner"></div>
      </div>
    `;
  }

  return `
    <div class="calendar-provider-content">
      ${providers.map(renderProviderCard).join('')}
    </div>
  `;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchProviderStatus(): Promise<ProviderStatus[]> {
  try {
    const response = await apiGet<{ providers: ProviderStatus[] }>('/api/calendar/providers/status');
    return response?.providers || [];
  } catch (error) {
    log.error('Failed to fetch provider status', error);
    // Return default disconnected states
    return [
      { provider: 'google', connected: false, syncEnabled: false },
      { provider: 'apple', connected: false, syncEnabled: false },
      { provider: 'outlook', connected: false, syncEnabled: false },
    ];
  }
}

async function connectProvider(provider: CalendarProvider): Promise<void> {
  try {
    if (provider === 'google') {
      // Redirect to Google OAuth
      const response = await apiGet<{ authUrl: string }>('/api/calendar/google/auth-url');
      if (response?.authUrl) {
        window.location.href = response.authUrl;
      }
    } else if (provider === 'apple') {
      // Show Apple credentials modal (handled separately)
      toast.info(t('calendar.providers.appleInstructions', 'Go to appleid.apple.com and generate an app-specific password.'));
      // Could emit an event or open another modal
    } else if (provider === 'outlook') {
      // Redirect to Microsoft OAuth
      const response = await apiGet<{ authUrl: string }>('/api/calendar/outlook/auth-url');
      if (response?.authUrl) {
        window.location.href = response.authUrl;
      }
    }
  } catch (error) {
    log.error('Failed to connect provider', { provider, error });
    toast.error(t('calendar.providers.connectError', "Couldn't connect. Try again?"));
  }
}

async function disconnectProvider(provider: CalendarProvider): Promise<void> {
  try {
    await apiPost(`/api/calendar/${provider}/disconnect`, {});
    toast.success(t('calendar.providers.disconnected', 'Disconnected'));
    
    // Refresh providers
    providers = await fetchProviderStatus();
    updateUI();
  } catch (error) {
    log.error('Failed to disconnect provider', { provider, error });
    toast.error(t('calendar.providers.disconnectError', "Couldn't disconnect. Try again?"));
  }
}

async function syncProvider(provider: CalendarProvider): Promise<void> {
  try {
    toast.info(t('calendar.providers.syncing', 'Syncing...'));
    await apiPost(`/api/calendar/${provider}/sync`, {});
    toast.success(t('calendar.providers.synced', 'Synced!'));
  } catch (error) {
    log.error('Failed to sync provider', { provider, error });
    toast.error(t('calendar.providers.syncError', "Couldn't sync. Try again?"));
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateUI(): void {
  if (!container) return;
  
  const body = container.querySelector('.calendar-provider-body');
  if (body) {
    body.innerHTML = renderContent();
    setupCardListeners();
  }
}

function setupCardListeners(): void {
  if (!container) return;

  // Calendar selection checkboxes
  container.querySelectorAll('.calendar-item input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      const provider = input.dataset.provider as CalendarProvider;
      const calendarId = input.dataset.calendarId;
      
      if (provider && calendarId) {
        try {
          await apiPost(`/api/calendar/${provider}/calendars/select`, {
            calendarId,
            selected: input.checked,
          });
        } catch (error) {
          log.error('Failed to update calendar selection', error);
          input.checked = !input.checked; // Revert
        }
      }
    });
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function showCalendarProviderSettings(
  callbacks: CalendarProviderCallbacks = {}
): Promise<void> {
  // Cleanup any existing instance
  hideCalendarProviderSettings();
  
  injectStyles();
  
  // Create container
  container = document.createElement('div');
  container.className = 'calendar-provider-overlay';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-label', t('calendar.providers.title', 'Calendar Settings'));
  
  container.innerHTML = `
    <div class="calendar-provider-backdrop"></div>
    <div class="calendar-provider-panel">
      <div class="calendar-provider-header">
        <h2>${t('calendar.providers.title', 'Calendar Connections')}</h2>
        <button class="calendar-provider-close" aria-label="${t('common.close', 'Close')}" data-action="close">
          ${ICONS.close}
        </button>
      </div>
      <div class="calendar-provider-body">
        <div class="provider-loading">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(container);
  
  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });
  
  // Setup event listeners
  setupEventListeners(callbacks);
  
  // Fetch provider data
  providers = await fetchProviderStatus();
  updateUI();
  
  log.debug('Calendar provider settings shown');
}

export function hideCalendarProviderSettings(): void {
  if (!container) return;
  
  container.classList.remove('visible');
  
  trackedTimeout(() => {
    container?.remove();
    container = null;
    providers = [];
    clearAllTimeouts();
  }, prefersReducedMotion() ? 0 : DURATION.NORMAL);
  
  log.debug('Calendar provider settings hidden');
}

function setupEventListeners(callbacks: CalendarProviderCallbacks): void {
  if (!container) return;
  
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    const provider = target.closest('[data-provider]')?.getAttribute('data-provider') as CalendarProvider | null;
    
    if (action === 'close' || target.classList.contains('calendar-provider-backdrop')) {
      hideCalendarProviderSettings();
      callbacks.onClose?.();
    } else if (action === 'connect' && provider) {
      await connectProvider(provider);
      callbacks.onProviderConnected?.(provider);
    } else if (action === 'disconnect' && provider) {
      await disconnectProvider(provider);
      callbacks.onProviderDisconnected?.(provider);
    } else if (action === 'sync' && provider) {
      await syncProvider(provider);
    }
  });
  
  // Escape key
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideCalendarProviderSettings();
      callbacks.onClose?.();
      document.removeEventListener('keydown', handleKeydown);
    }
  };
  document.addEventListener('keydown', handleKeydown);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { clearAllTimeouts as cleanupCalendarProviderSettings };

