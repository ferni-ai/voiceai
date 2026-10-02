/**
 * Connected Life Panel
 *
 * Unified hub for all integrations - Health, Calendar, Vibe (music/lights/temp).
 * Replaces 9+ separate integration settings into one tabbed interface.
 *
 * Design: Centered floating modal with category tabs
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { apiGet } from '../utils/api.js';
import {
  type IntegrationCategory,
  type Integration,
  type ConnectedLifeCallbacks,
  ICONS,
  type IntegrationStatuses,
} from './connected-life-config.js';

const log = createLogger('ConnectedLife');

// ============================================================================
// TYPES
// ============================================================================

class ConnectedLifeUI {
  private container: HTMLElement | null = null;
  private callbacks: ConnectedLifeCallbacks = {};
  private activeCategory: IntegrationCategory = 'health';
  private isVisible = false;
  private integrationStatuses: IntegrationStatuses = {
    appleHealth: 'disconnected',
    oura: 'disconnected',
    eightSleep: 'disconnected',
    wearables: 'disconnected',
    googleCalendar: 'disconnected',
    linkedin: 'disconnected',
    spotify: 'disconnected',
    ecobee: 'disconnected',
  };

  constructor() {
    this.cleanupOrphanedElements();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  async show(callbacks?: ConnectedLifeCallbacks): Promise<void> {
    if (this.isVisible) return;
    
    this.callbacks = callbacks || {};
    this.cleanupOrphanedElements();
    
    // Fetch current integration statuses before showing
    await this.fetchIntegrationStatuses();
    
    this.createModal();
    this.isVisible = true;
    
    log.debug('Connected Life panel opened');
  }

  hide(): void {
    if (!this.isVisible || !this.container) return;
    
    this.container.classList.remove('visible');
    setTimeout(() => {
      this.container?.remove();
      this.container = null;
      this.isVisible = false;
    }, DURATION.SLOW);
    
    this.callbacks.onClose?.();
    log.debug('Connected Life panel closed');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private async fetchIntegrationStatuses(): Promise<void> {
    try {
      // Fetch integration statuses from API
      const response = await apiGet<{
        integrations?: {
          biometrics?: { connected: boolean; platform?: string };
          calendar?: { connected: boolean };
          linkedin?: { connected: boolean };
          spotify?: { connected: boolean };
        };
      }>('/api/v1/integrations/status');

      if (response.ok && response.data?.integrations) {
        const { integrations } = response.data;
        
        // Map API response to our statuses
        if (integrations.biometrics?.connected) {
          // Determine which biometric platform is connected
          const platform = integrations.biometrics.platform?.toLowerCase() || '';
          if (platform.includes('apple')) {
            this.integrationStatuses.appleHealth = 'connected';
          } else if (platform.includes('oura')) {
            this.integrationStatuses.oura = 'connected';
          } else if (platform.includes('eight') || platform.includes('sleep')) {
            this.integrationStatuses.eightSleep = 'connected';
          } else {
            this.integrationStatuses.wearables = 'connected';
          }
        }
        
        if (integrations.calendar?.connected) {
          this.integrationStatuses.googleCalendar = 'connected';
        }
        
        if (integrations.linkedin?.connected) {
          this.integrationStatuses.linkedin = 'connected';
        }
        
        if (integrations.spotify?.connected) {
          this.integrationStatuses.spotify = 'connected';
        }
      }
      
      // Also check Spotify status separately (it has its own endpoint)
      try {
        const spotifyResponse = await apiGet<{ linked: boolean }>('/spotify/status');
        if (spotifyResponse.ok && spotifyResponse.data?.linked) {
          this.integrationStatuses.spotify = 'connected';
        }
      } catch {
        // Spotify status check is optional
      }
      
      // Check calendar status separately
      try {
        const calendarResponse = await apiGet<{ providers?: Record<string, { connected: boolean }> }>(
          '/api/calendar/providers/status'
        );
        const providers = calendarResponse.data?.providers;
        if (calendarResponse.ok && providers && Object.values(providers).some((p) => p.connected)) {
          this.integrationStatuses.googleCalendar = 'connected';
        }
      } catch {
        // Calendar status check is optional
      }
      
    } catch (error) {
      log.debug('Failed to fetch integration statuses, using defaults', error);
      // Keep default disconnected statuses
    }
  }

  private createModal(): void {
    const modal = document.createElement('div');
    modal.className = 'connected-life-overlay';
    modal.innerHTML = `
      <div class="connected-life-backdrop"></div>
      <div class="connected-life-modal">
        <header class="connected-life-header">
          <div class="connected-life-header-content">
            <span class="connected-life-eyebrow">SUPERPOWERS</span>
            <h2>${t('menu.sections.connectedLife')}</h2>
            <p class="connected-life-subtitle">Give Ferni awareness of your world</p>
          </div>
          <button class="connected-life-close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>
        
        <nav class="connected-life-tabs" role="tablist">
          ${this.renderTabs()}
        </nav>
        
        <main class="connected-life-content">
          ${this.renderIntegrations()}
        </main>
      </div>
    `;

    document.body.appendChild(modal);
    this.container = modal;

    // Bind events
    this.bindEvents();

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });
  }

  private renderTabs(): string {
    const tabs: { id: IntegrationCategory; icon: string; label: string }[] = [
      { id: 'health', icon: ICONS.health, label: 'Health & Body' },
      { id: 'calendar', icon: ICONS.calendar, label: 'Calendar & Work' },
      { id: 'vibe', icon: ICONS.vibe, label: 'Your Vibe' },
    ];

    return tabs
      .map(
        (tab) => `
        <button 
          class="connected-life-tab ${this.activeCategory === tab.id ? 'active' : ''}"
          data-tab="${tab.id}"
          role="tab"
          aria-selected="${this.activeCategory === tab.id}"
        >
          <span class="connected-life-tab-icon">${tab.icon}</span>
          <span class="connected-life-tab-label">${tab.label}</span>
        </button>
      `
      )
      .join('');
  }

  private getIntegrations(): Record<IntegrationCategory, Integration[]> {
    return {
      health: [
        {
          id: 'apple-health',
          name: t('menu.items.appleHealth'),
          icon: ICONS.appleHealth,
          status: this.integrationStatuses.appleHealth,
          description: 'Sleep, activity, and heart rate data',
        },
        {
          id: 'oura',
          name: t('menu.items.oura'),
          icon: ICONS.oura,
          status: this.integrationStatuses.oura,
          description: 'Sleep quality and readiness scores',
        },
        {
          id: 'eight-sleep',
          name: t('menu.items.eightSleep'),
          icon: ICONS.eightSleep,
          status: this.integrationStatuses.eightSleep,
          description: 'Sleep tracking and temperature',
        },
        {
          id: 'wearables',
          name: t('menu.items.wearables'),
          icon: ICONS.watch,
          status: this.integrationStatuses.wearables,
          description: 'Fitbit, Garmin, Whoop, and more',
        },
      ],
      calendar: [
        {
          id: 'google-calendar',
          name: t('menu.items.calendar'),
          icon: ICONS.google,
          status: this.integrationStatuses.googleCalendar,
          description: 'Events, meetings, and availability',
        },
        {
          id: 'linkedin',
          name: t('menu.items.linkedin'),
          icon: ICONS.linkedin,
          status: this.integrationStatuses.linkedin,
          description: 'Professional context and network',
        },
      ],
      vibe: [
        {
          id: 'spotify',
          name: 'Spotify',
          icon: ICONS.spotify,
          status: this.integrationStatuses.spotify,
          description: 'Music, mood playlists, listening history',
        },
        {
          id: 'ecobee',
          name: t('menu.items.thermostat'),
          icon: ICONS.ecobee,
          status: this.integrationStatuses.ecobee,
          description: 'Home temperature and comfort',
        },
        {
          id: 'vibe-controller',
          name: t('menu.items.vibeController'),
          icon: ICONS.controller,
          status: 'connected', // Always available
          description: 'Control music, lights, and more',
        },
      ],
    };
  }

  private renderIntegrations(): string {
    const integrations = this.getIntegrations()[this.activeCategory];
    
    return `
      <div class="connected-life-integrations">
        ${integrations
          .map(
            (int) => `
          <div class="connected-life-integration ${int.status === 'connected' ? 'connected' : ''}" data-integration="${int.id}">
            <div class="connected-life-integration-icon">${int.icon}</div>
            <div class="connected-life-integration-info">
              <h4>${int.name}</h4>
              <p>${int.description}</p>
            </div>
            <div class="connected-life-integration-action">
              ${
                int.status === 'connected'
                  ? `<span class="connected-life-status connected">${ICONS.check} Connected</span>`
                  : `<button class="connected-life-connect-btn" data-connect="${int.id}">Connect</button>`
              }
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.container) return;

    // Close button
    this.container.querySelector('.connected-life-close')?.addEventListener('click', () => {
      this.hide();
    });

    // Backdrop click
    this.container.querySelector('.connected-life-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    // Tab clicks
    this.container.querySelectorAll('.connected-life-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = (tab as HTMLElement).dataset.tab as IntegrationCategory;
        this.setTabActive(tabId);
      });
    });

    // Connect button clicks
    this.container.querySelectorAll('.connected-life-connect-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const integrationId = (btn as HTMLElement).dataset.connect;
        this.handleConnect(integrationId);
      });
    });

    // Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  private setTabActive(category: IntegrationCategory): void {
    this.activeCategory = category;
    
    // Update tab buttons
    this.container?.querySelectorAll('.connected-life-tab').forEach((el) => {
      const isActive = (el as HTMLElement).dataset.tab === category;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-selected', String(isActive));
    });

    // Update content
    const contentEl = this.container?.querySelector('.connected-life-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderIntegrations();
      // Re-bind connect buttons
      this.container?.querySelectorAll('.connected-life-connect-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const integrationId = (btn as HTMLElement).dataset.connect;
          this.handleConnect(integrationId);
        });
      });
    }
  }

  private handleConnect(integrationId: string | undefined): void {
    if (!integrationId) return;
    
    switch (integrationId) {
      case 'apple-health':
        this.callbacks.onConnectAppleHealth?.();
        break;
      case 'oura':
        this.callbacks.onConnectOura?.();
        break;
      case 'eight-sleep':
        this.callbacks.onConnectEightSleep?.();
        break;
      case 'wearables':
        this.callbacks.onConnectWearables?.();
        break;
      case 'google-calendar':
        this.callbacks.onConnectCalendar?.();
        break;
      case 'linkedin':
        this.callbacks.onConnectLinkedIn?.();
        break;
      case 'spotify':
        this.callbacks.onConnectSpotify?.();
        break;
      case 'ecobee':
        this.callbacks.onConnectEcobee?.();
        break;
      case 'vibe-controller':
        this.callbacks.onOpenVibeController?.();
        break;
    }
  }

  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.connected-life-overlay').forEach((el) => el.remove());
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = `
.connected-life-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 2100);
  opacity: 0;
  visibility: hidden;
  transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
              visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.connected-life-overlay.visible {
  opacity: 1;
  visibility: visible;
}

.connected-life-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.75);
}

.connected-life-modal {
  position: relative;
  background: var(--color-bg-elevated, #FFFDFB);
  border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
  border-radius: var(--radius-xl, 20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  width: calc(100% - var(--space-8, 32px));
  max-width: 560px;
  max-height: calc(100vh - var(--space-16, 64px));
  display: flex;
  flex-direction: column;
  transform: scale(0.95);
  transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
  overflow: hidden;
}

.connected-life-overlay.visible .connected-life-modal {
  transform: scale(1);
}

/* Header */
.connected-life-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
}

.connected-life-eyebrow {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--color-accent-text);
  text-transform: uppercase;
  margin-bottom: var(--space-1, 4px);
  display: block;
}

.connected-life-header h2 {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0;
}

.connected-life-subtitle {
  font-size: 0.9rem;
  color: var(--color-text-muted, #9a8f85);
  margin: var(--space-1, 4px) 0 0;
}

.connected-life-close {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-full, 9999px);
  color: var(--color-text-muted, #9a8f85);
  cursor: pointer;
  transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
}

.connected-life-close:hover {
  background: var(--color-background-subtle, rgba(44, 37, 32, 0.04));
  color: var(--color-text-primary, #2C2520);
}

.connected-life-close svg {
  width: 20px;
  height: 20px;
}

/* Tabs */
.connected-life-tabs {
  display: flex;
  gap: var(--space-2, 8px);
  padding: var(--space-4, 16px) var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
}

.connected-life-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1, 4px);
  padding: var(--space-3, 12px);
  background: var(--color-background-subtle, rgba(44, 37, 32, 0.02));
  border: 1px solid transparent;
  border-radius: var(--radius-lg, 12px);
  color: var(--color-text-muted, #9a8f85);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all ${DURATION.FAST}ms;
}

.connected-life-tab:hover {
  background: var(--color-background-subtle, rgba(44, 37, 32, 0.04));
  color: var(--color-text-secondary, #5c544a);
}

.connected-life-tab.active {
  background: var(--color-accent, #3D5A45);
  color: var(--color-text-on-accent);
  border-color: transparent;
}

.connected-life-tab-icon svg {
  width: 20px;
  height: 20px;
}

/* Content */
.connected-life-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4, 16px) var(--space-6, 24px) var(--space-6, 24px);
}

.connected-life-integrations {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.connected-life-integration {
  display: flex;
  align-items: center;
  gap: var(--space-4, 16px);
  padding: var(--space-4, 16px);
  background: var(--color-background-subtle, rgba(44, 37, 32, 0.02));
  border-radius: var(--radius-lg, 12px);
  transition: background ${DURATION.FAST}ms;
}

.connected-life-integration:hover {
  background: var(--color-background-subtle, rgba(44, 37, 32, 0.04));
}

.connected-life-integration.connected {
  border: 1px solid var(--color-accent, #3D5A45);
  background: color-mix(in srgb, var(--color-accent, #3D5A45) 5%, transparent);
}

.connected-life-integration-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background-elevated, #fffdfb);
  border-radius: var(--radius-lg, 12px);
  color: var(--color-text-secondary, #5c544a);
}

.connected-life-integration-icon svg {
  width: 22px;
  height: 22px;
}

.connected-life-integration-info {
  flex: 1;
  min-width: 0;
}

.connected-life-integration-info h4 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 var(--space-1, 4px);
}

.connected-life-integration-info p {
  font-size: 0.8rem;
  color: var(--color-text-muted, #9a8f85);
  margin: 0;
  line-height: 1.4;
}

.connected-life-integration-action {
  flex-shrink: 0;
}

.connected-life-connect-btn {
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: var(--color-accent, #3D5A45);
  border: none;
  border-radius: var(--radius-full, 9999px);
  color: var(--color-text-on-accent);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background ${DURATION.FAST}ms, transform ${DURATION.FAST}ms;
}

.connected-life-connect-btn:hover {
  background: var(--color-accent-hover, #2d4835);
  transform: translateY(-1px);
}

.connected-life-status {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
  font-size: 0.8rem;
  color: var(--color-accent-text);
  font-weight: 500;
}

.connected-life-status svg {
  width: 14px;
  height: 14px;
}

/* Mobile adjustments */
@media (max-width: 480px) {
  .connected-life-tab-label {
    display: none;
  }
}

/* Dark theme */
[data-theme="midnight"] .connected-life-backdrop {
  background: rgba(10, 10, 12, 0.7);
}

[data-theme="midnight"] .connected-life-modal {
  background: var(--color-background-elevated, #1a1a1e);
}

[data-theme="midnight"] .connected-life-header,
[data-theme="midnight"] .connected-life-tabs {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

[data-theme="midnight"] .connected-life-integration-icon {
  background: rgba(255, 255, 255, 0.05);
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

// ============================================================================
// EXPORTS
// ============================================================================

const connectedLifeUI = new ConnectedLifeUI();

export async function showConnectedLife(callbacks?: ConnectedLifeCallbacks): Promise<void> {
  await connectedLifeUI.show(callbacks);
}

export function hideConnectedLife(): void {
  connectedLifeUI.hide();
}

export { connectedLifeUI };
