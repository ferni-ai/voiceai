/**
 * Wearable Settings UI
 *
 * Settings panel for managing wearable device integrations.
 * Supports Apple Watch, Fitbit, Garmin, Oura, and Whoop.
 *
 * DESIGN PRINCIPLES:
 *   - Centered floating modal (brand-compliant)
 *   - Clear connection status per provider
 *   - Privacy-focused messaging
 *   - Warmth-focused animations
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';
import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WearableSettings');

// ============================================================================
// TYPES
// ============================================================================

type WearableProvider = 'apple_health' | 'fitbit' | 'garmin' | 'oura' | 'whoop';

interface WearableStatus {
  status: Record<string, 'connected' | 'disconnected' | 'pending'>;
  enabledProviders: WearableProvider[];
  config: {
    syncIntervalMinutes: number;
    enableStressDetection: boolean;
    enableSleepAnalysis: boolean;
    enableActivityTracking: boolean;
    privacyMode: 'raw' | 'aggregated' | 'insights_only';
  };
}

interface WearableSettingsCallbacks {
  onClose?: () => void;
  onConnectionChange?: (provider: WearableProvider, connected: boolean) => void;
}

// ============================================================================
// PROVIDER INFO
// ============================================================================

// ============================================================================
// ICONS (Lucide SVG - 2px stroke, rounded corners)
// ============================================================================

const ICONS = {
  // Provider icons
  heartPulse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>
  </svg>`,
  watch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="6"/>
    <polyline points="12 10 12 12 13 13"/>
    <path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05"/>
    <path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"/>
  </svg>`,
  run: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="17" cy="5" r="2"/>
    <path d="M9 20h6"/>
    <path d="m4 17 3-5 2.5 2 4-5 3.5 6"/>
  </svg>`,
  ring: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="8"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`,
  chartLine: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 3v18h18"/>
    <path d="m19 9-5 5-4-4-3 3"/>
  </svg>`,
  // UI icons
  activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>`,
};

// ============================================================================
// PROVIDER INFO
// ============================================================================

// Providers with backend API support (can actually connect)
const _IMPLEMENTED_PROVIDERS: WearableProvider[] = ['apple_health', 'oura'];

const PROVIDERS: Array<{
  id: WearableProvider;
  icon: string;
  comingSoon?: boolean;
}> = [
  {
    id: 'apple_health',
    icon: ICONS.heartPulse,
  },
  {
    id: 'fitbit',
    icon: ICONS.watch,
    comingSoon: true, // No backend API yet
  },
  {
    id: 'garmin',
    icon: ICONS.run,
    comingSoon: true, // No backend API yet
  },
  {
    id: 'oura',
    icon: ICONS.ring,
  },
  {
    id: 'whoop',
    icon: ICONS.chartLine,
    comingSoon: true, // No backend API yet
  },
];

// ============================================================================
// WEARABLE SETTINGS UI CLASS
// ============================================================================

class WearableSettingsUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: WearableSettingsCallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private status: WearableStatus | null = null;

  initialize(): void {
    if (this.panel) return;

    // HMR protection
    document.querySelectorAll('.wearable-settings').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: WearableSettingsCallbacks): void {
    this.callbacks = callbacks;
  }

  async show(): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.renderLoading();
    this.panel.classList.add('wearable-settings--visible');
    this.isVisible = true;

    await this.loadStatus().catch((error) => {
      log.error('Failed to load wearable status:', error);
      this.renderError(t('wearableSettings.errors.loadFailed'));
    });
  }

  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('wearable-settings--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      void this.show();
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'wearable-settings';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', t('wearableSettings.title'));

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'wearable-settings__wrapper';
    this.panel.appendChild(this.wrapper);

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private async loadStatus(): Promise<void> {
    try {
      const response = await apiGet<{ success: boolean } & WearableStatus>('/api/wearable/status');

      if (response.data?.success) {
        this.status = response.data;
        this.renderContent();
      } else {
        this.renderError(t('wearableSettings.errors.loadFailed'));
      }
    } catch {
      this.status = {
        status: {},
        enabledProviders: [],
        config: {
          syncIntervalMinutes: 15,
          enableStressDetection: true,
          enableSleepAnalysis: true,
          enableActivityTracking: true,
          privacyMode: 'aggregated',
        },
      };
      this.renderContent();
    }
  }

  private renderLoading(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="wearable-settings__header">
        <div class="wearable-settings__icon">${ICONS.activity}</div>
        <h2 class="wearable-settings__title">${t('wearableSettings.title')}</h2>
        <button class="wearable-settings__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="wearable-settings__loading">
        <div class="wearable-settings__spinner"></div>
        <p>${t('wearableSettings.loading')}</p>
      </div>
    `;

    this.bindCloseButton();
  }

  private renderContent(): void {
    if (!this.wrapper || !this.status) return;

    const providersList = PROVIDERS.map((provider) => {
      const connectionStatus = this.status?.status[provider.id] ?? 'disconnected';
      const isConnected = connectionStatus === 'connected';
      const isComingSoon = provider.comingSoon ?? false;

      return `
        <div class="wearable-settings__provider ${isConnected ? 'wearable-settings__provider--connected' : ''} ${isComingSoon ? 'wearable-settings__provider--coming-soon' : ''}">
          <div class="wearable-settings__provider-icon">${provider.icon}</div>
          <div class="wearable-settings__provider-info">
            <span class="wearable-settings__provider-name">
              ${t(`wearableSettings.providers.${provider.id}.name`)}
              ${isComingSoon ? '<span class="wearable-settings__coming-soon-badge">Coming Soon</span>' : ''}
            </span>
            <span class="wearable-settings__provider-desc">${t(`wearableSettings.providers.${provider.id}.description`)}</span>
          </div>
          ${isComingSoon ? `
            <span class="wearable-settings__provider-btn wearable-settings__provider-btn--disabled" aria-disabled="true">
              Coming Soon
            </span>
          ` : `
            <button aria-label="${t('accessibility.settings')}"
              class="wearable-settings__provider-btn ${isConnected ? 'wearable-settings__provider-btn--disconnect' : ''}"
              data-provider="${provider.id}"
              data-connected="${isConnected}"
            >
              ${isConnected ? t('wearableSettings.buttons.disconnect') : t('wearableSettings.buttons.connect')}
            </button>
          `}
        </div>
      `;
    }).join('');

    this.wrapper.innerHTML = `
      <header class="wearable-settings__header">
        <div class="wearable-settings__icon">${ICONS.activity}</div>
        <h2 class="wearable-settings__title">${t('wearableSettings.title')}</h2>
        <button class="wearable-settings__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>

      <div class="wearable-settings__content">
        <div class="wearable-settings__intro">
          <p>${t('wearableSettings.intro')}</p>
        </div>

        <div class="wearable-settings__providers">
          <h3>${t('wearableSettings.sections.devices')}</h3>
          ${providersList}
        </div>

        <div class="wearable-settings__features">
          <h3>${t('wearableSettings.sections.features')}</h3>
          <label class="wearable-settings__toggle">
            <input type="checkbox" data-feature="stress" ${this.status.config.enableStressDetection ? 'checked' : ''}>
            <span>${t('wearableSettings.features.stress')}</span>
          </label>
          <label class="wearable-settings__toggle">
            <input type="checkbox" data-feature="sleep" ${this.status.config.enableSleepAnalysis ? 'checked' : ''}>
            <span>${t('wearableSettings.features.sleep')}</span>
          </label>
          <label class="wearable-settings__toggle">
            <input type="checkbox" data-feature="activity" ${this.status.config.enableActivityTracking ? 'checked' : ''}>
            <span>${t('wearableSettings.features.activity')}</span>
          </label>
        </div>

        <div class="wearable-settings__privacy">
          <div class="wearable-settings__privacy-icon">${ICONS.shield}</div>
          <p>${t('wearableSettings.privacy.note')}</p>
        </div>
      </div>
    `;

    this.bindCloseButton();
    this.bindProviderButtons();
    this.bindFeatureToggles();
  }

  private renderError(message: string): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="wearable-settings__header">
        <div class="wearable-settings__icon">${ICONS.activity}</div>
        <h2 class="wearable-settings__title">${t('wearableSettings.title')}</h2>
        <button class="wearable-settings__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="wearable-settings__error">
        <p>${message}</p>
        <button aria-label="${t('accessibility.settings')}" class="wearable-settings__retry">${t('wearableSettings.buttons.tryAgain')}</button>
      </div>
    `;

    this.bindCloseButton();
    this.wrapper.querySelector('.wearable-settings__retry')?.addEventListener('click', () => {
      this.renderLoading();
      void this.loadStatus();
    });
  }

  private bindCloseButton(): void {
    this.wrapper?.querySelector('.wearable-settings__close')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private bindProviderButtons(): void {
    this.wrapper?.querySelectorAll('.wearable-settings__provider-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const htmlBtn = btn as HTMLButtonElement;
        const provider = htmlBtn.dataset.provider as WearableProvider;
        const isConnected = htmlBtn.dataset.connected === 'true';

        void (async () => {
          if (isConnected) {
            await this.disconnectProvider(provider);
          } else {
            await this.connectProvider(provider);
          }
        })();
      });
    });
  }

  private bindFeatureToggles(): void {
    this.wrapper?.querySelectorAll('.wearable-settings__toggle input').forEach((input) => {
      input.addEventListener('change', () => {
        const htmlInput = input as HTMLInputElement;
        const feature = htmlInput.dataset.feature;

        const config: Record<string, boolean> = {};
        if (feature === 'stress') config.enableStressDetection = htmlInput.checked;
        if (feature === 'sleep') config.enableSleepAnalysis = htmlInput.checked;
        if (feature === 'activity') config.enableActivityTracking = htmlInput.checked;

        void apiPost('/api/wearable/config', config);
      });
    });
  }

  private async connectProvider(provider: WearableProvider): Promise<void> {
    try {
      const response = await apiPost<{ success: boolean; authUrl?: string }>(
        '/api/wearable/connect',
        { provider }
      );

      if (response.data?.success && response.data.authUrl) {
        window.location.href = response.data.authUrl;
      }
    } catch (error) {
      log.error('Failed to connect provider:', error);
    }
  }

  private async disconnectProvider(provider: WearableProvider): Promise<void> {
    try {
      await apiPost('/api/wearable/disconnect', { provider });
      await this.loadStatus();
      this.callbacks.onConnectionChange?.(provider, false);
    } catch (error) {
      log.error('Failed to disconnect provider:', error);
    }
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .wearable-settings {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest, 21px);
        background: rgba(44, 37, 32, 0.75);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .wearable-settings--visible {
        opacity: 1;
        visibility: visible;
      }

      .wearable-settings__wrapper {
        width: 100%;
        max-width: clamp(336px, 90vw, 480px);
        max-height: 90vh;
        overflow-y: auto;
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        transform: ${prefersReducedMotion() ? 'none' : 'scale(0.95)'};
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .wearable-settings--visible .wearable-settings__wrapper {
        transform: scale(1);
      }

      .wearable-settings__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .wearable-settings__icon {
        width: 24px;
        height: 24px;
        color: var(--color-accent-primary, #2d5a3d);
      }

      .wearable-settings__icon svg {
        width: 100%;
        height: 100%;
      }

      .wearable-settings__title {
        flex: 1;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .wearable-settings__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        background: var(--color-background-tertiary, #ebe6df);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .wearable-settings__close:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
      }

      .wearable-settings__close svg {
        width: 16px;
        height: 16px;
      }

      .wearable-settings__content {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      .wearable-settings__intro {
        margin-bottom: var(--ma-rest, 21px);
      }

      .wearable-settings__intro p {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
        line-height: 1.5;
      }

      .wearable-settings__providers h3,
      .wearable-settings__features h3 {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted, #756a5e);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .wearable-settings__provider {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 0.75rem);
        margin-bottom: var(--space-2, 8px);
      }

      .wearable-settings__provider--connected {
        background: var(--persona-tint, rgba(45, 90, 61, 0.1));
      }

      .wearable-settings__provider-icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-md, 0.5rem);
        color: var(--color-text-secondary, #6b5b4f);
      }

      .wearable-settings__provider-icon svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      .wearable-settings__provider--connected .wearable-settings__provider-icon {
        color: var(--persona-primary, #4a6741);
      }

      .wearable-settings__provider-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .wearable-settings__provider-name {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
      }

      .wearable-settings__provider-desc {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .wearable-settings__provider-btn {
        padding: var(--space-2, 8px) var(--space-3, 12px);
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
        border: none;
        border-radius: var(--radius-md, 0.5rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .wearable-settings__provider-btn:hover {
        background: var(--color-accent-secondary, #3d7a52);
      }

      .wearable-settings__provider-btn--disconnect {
        background: transparent;
        color: var(--color-text-muted, #756a5e);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.2));
      }

      .wearable-settings__provider-btn--disconnect:hover {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-semantic-error, #b5453a);
        border-color: var(--color-semantic-error, #b5453a);
      }

      .wearable-settings__provider-btn--disabled {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-muted, #756a5e);
        cursor: not-allowed;
        opacity: 0.7;
      }

      .wearable-settings__provider--coming-soon {
        opacity: 0.75;
      }

      .wearable-settings__coming-soon-badge {
        display: inline-flex;
        align-items: center;
        margin-left: var(--space-2, 8px);
        padding: 2px 6px;
        font-size: 10px;
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-muted, #756a5e);
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: var(--radius-sm, 4px);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .wearable-settings__features {
        margin-top: var(--ma-rest, 21px);
      }

      .wearable-settings__toggle {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-2, 8px) 0;
        cursor: pointer;
      }

      .wearable-settings__toggle input {
        width: 18px;
        height: 18px;
        accent-color: var(--color-accent-primary, #2d5a3d);
      }

      .wearable-settings__toggle span {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2c2520);
      }

      .wearable-settings__privacy {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        margin-top: var(--ma-rest, 21px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 0.75rem);
      }

      .wearable-settings__privacy-icon {
        width: 20px;
        height: 20px;
        color: var(--color-accent-primary, #2d5a3d);
        flex-shrink: 0;
      }

      .wearable-settings__privacy-icon svg {
        width: 100%;
        height: 100%;
      }

      .wearable-settings__privacy p {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
        line-height: 1.5;
      }

      .wearable-settings__loading,
      .wearable-settings__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
      }

      .wearable-settings__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-top-color: var(--color-accent-primary, #2d5a3d);
        border-radius: 50%;
        animation: wearable-spin 0.8s linear infinite;
        margin-bottom: var(--ma-breath, 13px);
      }

      @keyframes wearable-spin {
        to { transform: rotate(360deg); }
      }

      .wearable-settings__loading p,
      .wearable-settings__error p {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .wearable-settings__retry {
        padding: var(--space-2, 8px) var(--space-4, 16px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-primary, #2c2520);
        border: none;
        border-radius: var(--radius-md, 0.5rem);
        cursor: pointer;
      }

      /* Dark Theme */
      [data-theme="midnight"] .wearable-settings__wrapper {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .wearable-settings__title,
      [data-theme="midnight"] .wearable-settings__provider-name,
      [data-theme="midnight"] .wearable-settings__toggle span {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .wearable-settings__provider,
      [data-theme="midnight"] .wearable-settings__privacy {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .wearable-settings__provider-icon {
        background: var(--color-background-elevated, #70605a);
        color: var(--color-text-secondary, #e8e2da);
      }

      [data-theme="midnight"] .wearable-settings__provider--connected .wearable-settings__provider-icon {
        color: var(--persona-primary, #6b9b5a);
      }

      @media (max-width: clamp(336px, 90vw, 480px)) {
        .wearable-settings__wrapper {
          max-width: 100%;
          border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
          margin-top: auto;
        }

        .wearable-settings__header,
        .wearable-settings__content {
          padding: var(--space-4, 16px);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .wearable-settings,
        .wearable-settings__wrapper {
          transition: none !important;
        }

        .wearable-settings__spinner {
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

let instance: WearableSettingsUI | null = null;

export function getWearableSettingsUI(): WearableSettingsUI {
  if (!instance) {
    instance = new WearableSettingsUI();
  }
  return instance;
}

export function showWearableSettings(): void {
  void getWearableSettingsUI().show();
}

export function hideWearableSettings(): void {
  getWearableSettingsUI().hide();
}

export default WearableSettingsUI;
