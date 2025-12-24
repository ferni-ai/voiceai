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

const log = createLogger('ConnectedLife');

// ============================================================================
// TYPES
// ============================================================================

type IntegrationCategory = 'health' | 'calendar' | 'vibe';
type ConnectionStatus = 'connected' | 'disconnected' | 'pending';

interface Integration {
  id: string;
  name: string;
  icon: string;
  status: ConnectionStatus;
  description: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface ConnectedLifeCallbacks {
  onClose?: () => void;
  onConnectAppleHealth?: () => void;
  onConnectOura?: () => void;
  onConnectEightSleep?: () => void;
  onConnectWearables?: () => void;
  onConnectCalendar?: () => void;
  onConnectLinkedIn?: () => void;
  onConnectSpotify?: () => void;
  onConnectEcobee?: () => void;
  onOpenVibeController?: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
  health: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  vibe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  // Individual integration icons
  appleHealth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  oura: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>',
  eightSleep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4v16"/><path d="M22 4v16"/><path d="M2 8h20"/><path d="M2 16h20"/><path d="M6 8v8"/><path d="M18 8v8"/></svg>',
  watch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  google: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>',
  spotify: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5-.5 4-.5 4 .5 4 .5"/><path d="M7 12s2-1 5-1 5 1 5 1"/><path d="M6 9s2.5-1.5 6-1.5 6 1.5 6 1.5"/></svg>',
  ecobee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 4V10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/><line x1="12" y1="14" x2="12" y2="10"/></svg>',
  controller: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
};

// ============================================================================
// CONNECTED LIFE UI CLASS
// ============================================================================

class ConnectedLifeUI {
  private container: HTMLElement | null = null;
  private callbacks: ConnectedLifeCallbacks = {};
  private activeCategory: IntegrationCategory = 'health';
  private isVisible = false;

  constructor() {
    this.cleanupOrphanedElements();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  show(callbacks?: ConnectedLifeCallbacks): void {
    if (this.isVisible) return;
    
    this.callbacks = callbacks || {};
    this.cleanupOrphanedElements();
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
          status: 'disconnected',
          description: 'Sleep, activity, and heart rate data',
        },
        {
          id: 'oura',
          name: t('menu.items.oura'),
          icon: ICONS.oura,
          status: 'disconnected',
          description: 'Sleep quality and readiness scores',
        },
        {
          id: 'eight-sleep',
          name: t('menu.items.eightSleep'),
          icon: ICONS.eightSleep,
          status: 'disconnected',
          description: 'Sleep tracking and temperature',
        },
        {
          id: 'wearables',
          name: t('menu.items.wearables'),
          icon: ICONS.watch,
          status: 'disconnected',
          description: 'Fitbit, Garmin, Whoop, and more',
        },
      ],
      calendar: [
        {
          id: 'google-calendar',
          name: t('menu.items.calendar'),
          icon: ICONS.google,
          status: 'disconnected',
          description: 'Events, meetings, and availability',
        },
        {
          id: 'linkedin',
          name: t('menu.items.linkedin'),
          icon: ICONS.linkedin,
          status: 'disconnected',
          description: 'Professional context and network',
        },
      ],
      vibe: [
        {
          id: 'spotify',
          name: 'Spotify',
          icon: ICONS.spotify,
          status: 'disconnected',
          description: 'Music, mood playlists, listening history',
        },
        {
          id: 'ecobee',
          name: t('menu.items.thermostat'),
          icon: ICONS.ecobee,
          status: 'disconnected',
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
  background: rgba(44, 37, 32, 0.4);
  backdrop-filter: blur(20px);
}

.connected-life-modal {
  position: relative;
  background: var(--color-background-elevated, #fffdfb);
  border-radius: var(--radius-2xl, 24px);
  box-shadow: var(--shadow-2xl);
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
  color: var(--color-accent, #3D5A45);
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
  color: white;
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
  color: white;
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
  color: var(--color-accent, #3D5A45);
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

export function showConnectedLife(callbacks?: ConnectedLifeCallbacks): void {
  connectedLifeUI.show(callbacks);
}

export function hideConnectedLife(): void {
  connectedLifeUI.hide();
}

export { connectedLifeUI };

