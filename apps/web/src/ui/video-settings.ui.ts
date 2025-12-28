/**
 * Video Settings UI
 *
 * Settings panel for video session controls.
 * Allows enabling/disabling video, screen sharing, and recording.
 *
 * DESIGN PRINCIPLES:
 *   - Centered floating modal (brand-compliant)
 *   - Clear visual indicators for active features
 *   - Privacy-focused messaging
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';
import { t } from '../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

type VideoMode = 'avatar' | 'video' | 'hybrid' | 'screen-share';

interface VideoState {
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isRecording: boolean;
  mode: VideoMode;
}

interface VideoConfig {
  enableVideo: boolean;
  enableScreenShare: boolean;
  enableRecording: boolean;
  videoQuality: 'low' | 'medium' | 'high' | 'auto';
  preferAvatarMode: boolean;
}

interface VideoSettingsCallbacks {
  onClose?: () => void;
  onVideoToggle?: (enabled: boolean) => void;
  onScreenShareToggle?: (enabled: boolean) => void;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m22 8-6 4 6 4V8Z"/>
    <rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
  </svg>`,
  videoOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1L22 8v8"/>
    <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l10 10Z"/>
    <line x1="2" y1="2" x2="22" y2="22"/>
  </svg>`,
  screen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="20" height="14" x="2" y="3" rx="2"/>
    <line x1="8" x2="16" y1="21" y2="21"/>
    <line x1="12" x2="12" y1="17" y2="21"/>
  </svg>`,
  record: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`,
  layout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2"/>
    <path d="M3 9h18"/>
    <path d="M9 21V9"/>
  </svg>`,
};

// ============================================================================
// VIDEO SETTINGS UI CLASS
// ============================================================================

class VideoSettingsUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: VideoSettingsCallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private state: VideoState | null = null;
  private config: VideoConfig | null = null;

  initialize(): void {
    if (this.panel) return;

    document.querySelectorAll('.video-settings').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: VideoSettingsCallbacks): void {
    this.callbacks = callbacks;
  }

  async show(): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.renderLoading();
    this.panel.classList.add('video-settings--visible');
    this.isVisible = true;

    await this.loadState();
  }

  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('video-settings--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'video-settings';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', t('videoSettings.title'));

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'video-settings__wrapper';
    this.panel.appendChild(this.wrapper);

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private async loadState(): Promise<void> {
    try {
      const response = await apiGet<{
        success: boolean;
        state: VideoState;
        config: VideoConfig;
      }>('/api/video/state');

      if (response.data?.success) {
        this.state = response.data.state;
        this.config = response.data.config;
        this.renderContent();
      } else {
        this.renderError('Unable to load video settings');
      }
    } catch {
      this.state = {
        isVideoEnabled: false,
        isScreenSharing: false,
        isRecording: false,
        mode: 'avatar',
      };
      this.config = {
        enableVideo: true,
        enableScreenShare: true,
        enableRecording: false,
        videoQuality: 'auto',
        preferAvatarMode: true,
      };
      this.renderContent();
    }
  }

  private renderLoading(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="video-settings__header">
        <div class="video-settings__icon">${ICONS.video}</div>
        <h2 class="video-settings__title">${t('videoSettings.title')}</h2>
        <button class="video-settings__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="video-settings__loading">
        <div class="video-settings__spinner"></div>
        <p>${t('common.loading')}</p>
      </div>
    `;

    this.bindCloseButton();
  }

  private renderContent(): void {
    if (!this.wrapper || !this.state || !this.config) return;

    const modeOptions = [
      { id: 'avatar', label: t('videoSettings.modes.avatar.label'), icon: ICONS.user, desc: t('videoSettings.modes.avatar.description') },
      { id: 'video', label: t('videoSettings.modes.video.label'), icon: ICONS.video, desc: t('videoSettings.modes.video.description') },
      { id: 'hybrid', label: t('videoSettings.modes.hybrid.label'), icon: ICONS.layout, desc: t('videoSettings.modes.hybrid.description') },
    ];

    this.wrapper.innerHTML = `
      <header class="video-settings__header">
        <div class="video-settings__icon">${ICONS.video}</div>
        <h2 class="video-settings__title">${t('videoSettings.title')}</h2>
        <button class="video-settings__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>

      <div class="video-settings__content">
        <div class="video-settings__intro">
          <p>${t('videoSettings.intro')}</p>
        </div>

        <div class="video-settings__coming-soon">
          <div class="video-settings__coming-soon-icon">${ICONS.video}</div>
          <h3>Video Calls Coming Soon</h3>
          <p>We're working on bringing video conversations to Ferni. For now, enjoy our voice-first experience with Ferni's expressive avatar.</p>
        </div>

        <!-- Video Controls (Hidden - Coming Soon)
        <div class="video-settings__controls">
          <h3>${t('videoSettings.controls.title')}</h3>

          <button aria-label="Settings" class="video-settings__control ${this.state.isVideoEnabled ? 'video-settings__control--active' : ''}" data-action="toggle-video" disabled>
            <span class="video-settings__control-icon">${this.state.isVideoEnabled ? ICONS.video : ICONS.videoOff}</span>
            <span class="video-settings__control-label">${this.state.isVideoEnabled ? t('videoSettings.camera.on') : t('videoSettings.camera.off')}</span>
          </button>

          <button aria-label="Settings" class="video-settings__control ${this.state.isScreenSharing ? 'video-settings__control--active' : ''}" data-action="toggle-screen" disabled>
            <span class="video-settings__control-icon">${ICONS.screen}</span>
            <span class="video-settings__control-label">${this.state.isScreenSharing ? t('videoSettings.screen.on') : t('videoSettings.screen.off')}</span>
          </button>
        </div>
        -->

        <div class="video-settings__modes">
          <h3>${t('videoSettings.modes.title')}</h3>
          <div class="video-settings__mode-grid">
            ${modeOptions
              .map(
                (mode) => `
              <button aria-label="Settings" class="video-settings__mode ${this.state?.mode === mode.id ? 'video-settings__mode--active' : ''}" data-mode="${mode.id}">
                <span class="video-settings__mode-icon">${mode.icon}</span>
                <span class="video-settings__mode-label">${mode.label}</span>
                <span class="video-settings__mode-desc">${mode.desc}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="video-settings__quality">
          <h3>${t('videoSettings.quality.title')}</h3>
          <select class="video-settings__quality-select" data-setting="quality">
            <option value="auto" ${this.config.videoQuality === 'auto' ? 'selected' : ''}>${t('videoSettings.quality.auto')}</option>
            <option value="high" ${this.config.videoQuality === 'high' ? 'selected' : ''}>${t('videoSettings.quality.high')}</option>
            <option value="medium" ${this.config.videoQuality === 'medium' ? 'selected' : ''}>${t('videoSettings.quality.medium')}</option>
            <option value="low" ${this.config.videoQuality === 'low' ? 'selected' : ''}>${t('videoSettings.quality.low')}</option>
          </select>
        </div>

        <div class="video-settings__note">
          <p>${t('videoSettings.note')}</p>
        </div>
      </div>
    `;

    this.bindCloseButton();
    this.bindControls();
  }

  private renderError(message: string): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="video-settings__header">
        <div class="video-settings__icon">${ICONS.video}</div>
        <h2 class="video-settings__title">${t('videoSettings.title')}</h2>
        <button class="video-settings__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="video-settings__error">
        <p>${message}</p>
        <button aria-label="Settings" class="video-settings__retry">${t('videoSettings.buttons.retry')}</button>
      </div>
    `;

    this.bindCloseButton();
    this.wrapper.querySelector('.video-settings__retry')?.addEventListener('click', () => {
      this.renderLoading();
      this.loadState();
    });
  }

  private bindCloseButton(): void {
    this.wrapper?.querySelector('.video-settings__close')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private bindControls(): void {
    // Toggle video
    this.wrapper
      ?.querySelector('[data-action="toggle-video"]')
      ?.addEventListener('click', async () => {
        if (this.state?.isVideoEnabled) {
          await apiPost('/api/video/disable', {});
          this.callbacks.onVideoToggle?.(false);
        } else {
          await apiPost('/api/video/enable', {});
          this.callbacks.onVideoToggle?.(true);
        }
        await this.loadState();
      });

    // Toggle screen share
    this.wrapper
      ?.querySelector('[data-action="toggle-screen"]')
      ?.addEventListener('click', async () => {
        if (this.state?.isScreenSharing) {
          await apiPost('/api/video/screen-share/stop', {});
          this.callbacks.onScreenShareToggle?.(false);
        } else {
          await apiPost('/api/video/screen-share/start', {});
          this.callbacks.onScreenShareToggle?.(true);
        }
        await this.loadState();
      });

    // Mode selection
    this.wrapper?.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mode = (btn as HTMLElement).dataset.mode as VideoMode;
        await apiPost('/api/video/mode', { mode });
        await this.loadState();
      });
    });

    // Quality selection
    this.wrapper
      ?.querySelector('[data-setting="quality"]')
      ?.addEventListener('change', async (e) => {
        const quality = (e.target as HTMLSelectElement).value;
        await apiPost('/api/video/config', { videoQuality: quality });
      });
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .video-settings {
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

      .video-settings--visible {
        opacity: 1;
        visibility: visible;
      }

      .video-settings__wrapper {
        width: 100%;
        max-width: clamp(294px, 90vw, 420px);
        max-height: 90vh;
        overflow-y: auto;
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        transform: ${prefersReducedMotion() ? 'none' : 'scale(0.95)'};
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .video-settings--visible .video-settings__wrapper {
        transform: scale(1);
      }

      .video-settings__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .video-settings__icon {
        width: 24px;
        height: 24px;
        color: var(--color-accent-primary, #2d5a3d);
      }

      .video-settings__icon svg { width: 100%; height: 100%; }

      .video-settings__title {
        flex: 1;
        font-family: var(--font-display);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .video-settings__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        background: var(--color-background-tertiary);
        border: none;
        border-radius: var(--radius-full);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .video-settings__close:hover {
        background: var(--color-background-secondary);
        color: var(--color-text-primary);
      }

      .video-settings__close svg { width: 16px; height: 16px; }

      .video-settings__content {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      .video-settings__intro p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--ma-rest, 21px) 0;
      }

      .video-settings__coming-soon {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
      }

      .video-settings__coming-soon-icon {
        width: 48px;
        height: 48px;
        color: var(--color-text-muted, #756a5e);
        margin-bottom: var(--space-4, 16px);
        opacity: 0.6;
      }

      .video-settings__coming-soon-icon svg {
        width: 100%;
        height: 100%;
      }

      .video-settings__coming-soon h3 {
        font-family: var(--font-display);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .video-settings__coming-soon p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
        max-width: 280px;
        line-height: 1.5;
      }

      .video-settings__controls h3,
      .video-settings__modes h3,
      .video-settings__quality h3 {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .video-settings__controls {
        margin-bottom: var(--ma-rest, 21px);
      }

      .video-settings__control {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        width: 100%;
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary);
        border: 2px solid transparent;
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        margin-bottom: var(--space-2, 8px);
      }

      .video-settings__control:hover {
        background: var(--color-background-tertiary);
      }

      .video-settings__control--active {
        background: var(--persona-tint);
        border-color: var(--color-accent-primary);
      }

      .video-settings__control-icon {
        width: 24px;
        height: 24px;
        color: var(--color-text-muted);
      }

      .video-settings__control--active .video-settings__control-icon {
        color: var(--color-accent-primary);
      }

      .video-settings__control-icon svg { width: 100%; height: 100%; }

      .video-settings__control-label {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .video-settings__modes {
        margin-bottom: var(--ma-rest, 21px);
      }

      .video-settings__mode-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-2, 8px);
      }

      .video-settings__mode {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-1, 4px);
        padding: var(--space-3, 12px) var(--space-2, 8px);
        background: var(--color-background-secondary);
        border: 2px solid transparent;
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .video-settings__mode:hover {
        background: var(--color-background-tertiary);
      }

      .video-settings__mode--active {
        background: var(--persona-tint);
        border-color: var(--color-accent-primary);
      }

      .video-settings__mode-icon {
        width: 24px;
        height: 24px;
        color: var(--color-text-muted);
      }

      .video-settings__mode--active .video-settings__mode-icon {
        color: var(--color-accent-primary);
      }

      .video-settings__mode-icon svg { width: 100%; height: 100%; }

      .video-settings__mode-label {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .video-settings__mode-desc {
        font-family: var(--font-body);
        font-size: 10px;
        color: var(--color-text-muted);
        text-align: center;
      }

      .video-settings__quality {
        margin-bottom: var(--ma-rest, 21px);
      }

      .video-settings__quality-select {
        width: 100%;
        padding: var(--space-3, 12px);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg);
        color: var(--color-text-primary);
        cursor: pointer;
      }

      .video-settings__note {
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
      }

      .video-settings__note p {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin: 0;
        line-height: 1.5;
      }

      .video-settings__loading,
      .video-settings__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
      }

      .video-settings__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle);
        border-top-color: var(--color-accent-primary);
        border-radius: 50%;
        animation: video-spin 0.8s linear infinite;
        margin-bottom: var(--ma-breath, 13px);
      }

      @keyframes video-spin {
        to { transform: rotate(360deg); }
      }

      .video-settings__loading p,
      .video-settings__error p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .video-settings__retry {
        padding: var(--space-2, 8px) var(--space-4, 16px);
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
      }

      /* Dark Theme */
      [data-theme="midnight"] .video-settings__wrapper {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .video-settings__title,
      [data-theme="midnight"] .video-settings__control-label,
      [data-theme="midnight"] .video-settings__mode-label {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .video-settings__control,
      [data-theme="midnight"] .video-settings__mode,
      [data-theme="midnight"] .video-settings__note {
        background: var(--color-background-secondary, #60504a);
      }

      @media (max-width: clamp(336px, 90vw, 480px)) {
        .video-settings__wrapper {
          max-width: 100%;
          border-radius: var(--radius-xl) var(--radius-xl) 0 0;
          margin-top: auto;
        }

        .video-settings__mode-grid {
          grid-template-columns: 1fr;
        }

        .video-settings__mode {
          flex-direction: row;
          justify-content: flex-start;
          text-align: left;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .video-settings,
        .video-settings__wrapper,
        .video-settings__control,
        .video-settings__mode {
          transition: none !important;
        }

        .video-settings__spinner {
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

let instance: VideoSettingsUI | null = null;

export function getVideoSettingsUI(): VideoSettingsUI {
  if (!instance) {
    instance = new VideoSettingsUI();
  }
  return instance;
}

export function showVideoSettings(): void {
  getVideoSettingsUI().show();
}

export function hideVideoSettings(): void {
  getVideoSettingsUI().hide();
}

export default VideoSettingsUI;
