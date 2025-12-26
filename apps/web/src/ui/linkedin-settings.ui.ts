/**
 * LinkedIn Settings UI
 *
 * Settings panel for managing LinkedIn integration.
 * Shows connection status, profile info, and upcoming career milestones.
 *
 * "Better than Human" - remember work anniversaries and career transitions.
 *
 * DESIGN PRINCIPLES:
 *   - Centered floating modal (brand-compliant)
 *   - Clear connection status
 *   - Career milestone display
 *   - Privacy-focused messaging
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import {
  getLinkedInStatus,
  connectLinkedIn,
  disconnectLinkedIn,
  syncLinkedIn,
  handleLinkedInCallback,
  type LinkedInStatus,
} from '../services/linkedin.service.js';

// ============================================================================
// TYPES
// ============================================================================

interface LinkedInSettingsCallbacks {
  onClose?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

// ============================================================================
// ICONS (Lucide SVG - 2px stroke, rounded corners)
// ============================================================================

const ICONS = {
  linkedin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
    <rect width="4" height="12" x="2" y="9"/>
    <circle cx="4" cy="4" r="2"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <line x1="16" x2="16" y1="2" y2="6"/>
    <line x1="8" x2="8" y1="2" y2="6"/>
    <line x1="3" x2="21" y1="10" y2="10"/>
  </svg>`,
  briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="20" height="14" x="2" y="7" rx="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>
  </svg>`,
  unlink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/>
    <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/>
    <line x1="8" x2="8" y1="2" y2="5"/>
    <line x1="2" x2="5" y1="8" y2="8"/>
    <line x1="16" x2="16" y1="19" y2="22"/>
    <line x1="19" x2="22" y1="16" y2="16"/>
  </svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/>
  </svg>`,
};

// ============================================================================
// LINKEDIN SETTINGS UI CLASS
// ============================================================================

class LinkedInSettingsUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: LinkedInSettingsCallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private status: LinkedInStatus | null = null;
  private isLoading = false;

  initialize(): void {
    if (this.panel) return;

    // HMR protection
    document.querySelectorAll('.linkedin-settings').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();

    // Handle OAuth callback from URL params
    handleLinkedInCallback();
  }

  setCallbacks(callbacks: LinkedInSettingsCallbacks): void {
    this.callbacks = callbacks;
  }

  async show(): Promise<void> {
    if (!this.panel || !this.wrapper) {
      this.initialize();
    }

    // Fetch current status
    this.isLoading = true;
    this.render();

    this.status = await getLinkedInStatus();
    this.isLoading = false;
    this.render();

    this.wrapper!.style.display = 'flex';
    this.isVisible = true;

    // Animate in
    requestAnimationFrame(() => {
      if (!this.wrapper || !this.panel) return;

      if (prefersReducedMotion()) {
        this.wrapper.style.opacity = '1';
        this.panel.style.opacity = '1';
        this.panel.style.transform = 'scale(1)';
      } else {
        this.wrapper.animate([{ opacity: '0' }, { opacity: '1' }], {
          duration: DURATION.NORMAL,
          easing: EASING.STANDARD,
          fill: 'forwards',
        });

        this.panel.animate(
          [
            { opacity: '0', transform: 'scale(0.95)' },
            { opacity: '1', transform: 'scale(1)' },
          ],
          {
            duration: DURATION.SLOW,
            easing: EASING.SPRING,
            fill: 'forwards',
          }
        );
      }
    });
  }

  hide(): void {
    if (!this.wrapper || !this.panel || !this.isVisible) return;

    this.isVisible = false;

    if (prefersReducedMotion()) {
      this.wrapper.style.display = 'none';
    } else {
      const animation = this.wrapper.animate([{ opacity: '1' }, { opacity: '0' }], {
        duration: DURATION.FAST,
        easing: EASING.STANDARD,
        fill: 'forwards',
      });

      animation.onfinish = () => {
        if (this.wrapper) {
          this.wrapper.style.display = 'none';
        }
      };
    }

    this.callbacks.onClose?.();
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .linkedin-settings {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal);
        display: none;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
      }

      .linkedin-settings__backdrop {
        position: absolute;
        inset: 0;
        background: var(--backdrop-heavy);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .linkedin-settings__panel {
        position: relative;
        width: 100%;
        max-width: 480px;
        max-height: 90vh;
        background: var(--color-background-elevated);
        border-radius: var(--radius-2xl);
        box-shadow: var(--shadow-2xl);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .linkedin-settings__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5);
        border-bottom: 1px solid var(--color-border);
      }

      .linkedin-settings__header-content {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .linkedin-settings__header-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0077B5;
        color: white;
        border-radius: var(--radius-lg);
      }

      .linkedin-settings__header-icon svg {
        width: 20px;
        height: 20px;
      }

      .linkedin-settings__title {
        font-family: var(--font-display);
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0;
      }

      .linkedin-settings__close {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: var(--radius-full);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .linkedin-settings__close:hover {
        background: var(--color-background-hover);
        color: var(--color-text-primary);
      }

      .linkedin-settings__close svg {
        width: 20px;
        height: 20px;
      }

      .linkedin-settings__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-5);
      }

      /* Loading state */
      .linkedin-settings__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8);
        gap: var(--space-4);
        color: var(--color-text-secondary);
      }

      .linkedin-settings__spinner {
        width: 32px;
        height: 32px;
        border: 2px solid var(--color-border);
        border-top-color: var(--color-accent);
        border-radius: 50%;
        animation: linkedin-spin 0.8s linear infinite;
      }

      @keyframes linkedin-spin {
        to { transform: rotate(360deg); }
      }

      /* Connection status card */
      .linkedin-settings__status-card {
        background: var(--color-background);
        border-radius: var(--radius-xl);
        padding: var(--space-5);
        margin-bottom: var(--space-5);
        border: 1px solid var(--color-border);
      }

      .linkedin-settings__status-card--connected {
        border-color: var(--color-success);
        background: var(--color-success-subtle);
      }

      .linkedin-settings__profile {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }

      .linkedin-settings__avatar {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-full);
        background: var(--color-background-hover);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .linkedin-settings__avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .linkedin-settings__avatar svg {
        width: 24px;
        height: 24px;
        color: var(--color-text-muted);
      }

      .linkedin-settings__profile-info {
        flex: 1;
      }

      .linkedin-settings__name {
        font-family: var(--font-display);
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-1) 0;
      }

      .linkedin-settings__headline {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        margin: 0;
      }

      .linkedin-settings__status-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-full);
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .linkedin-settings__status-badge--connected {
        background: var(--color-success);
        color: white;
      }

      .linkedin-settings__status-badge--disconnected {
        background: var(--color-text-muted);
        color: white;
      }

      .linkedin-settings__status-badge svg {
        width: 12px;
        height: 12px;
      }

      /* Not connected state */
      .linkedin-settings__connect-cta {
        text-align: center;
        padding: var(--space-6);
      }

      .linkedin-settings__connect-cta h3 {
        font-family: var(--font-display);
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2) 0;
      }

      .linkedin-settings__connect-cta p {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-5) 0;
        line-height: 1.5;
      }

      /* Milestones section */
      .linkedin-settings__milestones {
        margin-top: var(--space-5);
      }

      .linkedin-settings__milestones-header {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
      }

      .linkedin-settings__milestones-header svg {
        width: 18px;
        height: 18px;
        color: var(--color-accent);
      }

      .linkedin-settings__milestones-header h3 {
        font-family: var(--font-display);
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .linkedin-settings__milestone {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        padding: var(--space-3);
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg);
        margin-bottom: var(--space-2);
        border: 1px solid var(--color-border);
      }

      .linkedin-settings__milestone-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-accent-subtle);
        color: var(--color-accent);
        border-radius: var(--radius-lg);
        flex-shrink: 0;
      }

      .linkedin-settings__milestone-icon svg {
        width: 16px;
        height: 16px;
      }

      .linkedin-settings__milestone-content {
        flex: 1;
        min-width: 0;
      }

      .linkedin-settings__milestone-title {
        font-weight: 500;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-1) 0;
        font-size: 0.9rem;
      }

      .linkedin-settings__milestone-desc {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-1) 0;
      }

      .linkedin-settings__milestone-date {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        margin: 0;
      }

      .linkedin-settings__no-milestones {
        text-align: center;
        padding: var(--space-4);
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }

      /* Actions */
      .linkedin-settings__actions {
        display: flex;
        gap: var(--space-3);
        margin-top: var(--space-4);
      }

      .linkedin-settings__btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-lg);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
      }

      .linkedin-settings__btn svg {
        width: 16px;
        height: 16px;
      }

      .linkedin-settings__btn--primary {
        background: #0077B5;
        color: white;
      }

      .linkedin-settings__btn--primary:hover {
        background: #005885;
      }

      .linkedin-settings__btn--secondary {
        background: var(--color-background-hover);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border);
      }

      .linkedin-settings__btn--secondary:hover {
        background: var(--color-border);
      }

      .linkedin-settings__btn--danger {
        background: transparent;
        color: var(--color-error);
        border: 1px solid var(--color-error);
      }

      .linkedin-settings__btn--danger:hover {
        background: var(--color-error);
        color: white;
      }

      .linkedin-settings__btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Benefits list */
      .linkedin-settings__benefits {
        margin-top: var(--space-5);
        padding-top: var(--space-5);
        border-top: 1px solid var(--color-border);
      }

      .linkedin-settings__benefits h4 {
        font-family: var(--font-display);
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin: 0 0 var(--space-3) 0;
      }

      .linkedin-settings__benefit {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        margin-bottom: var(--space-3);
      }

      .linkedin-settings__benefit-icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-accent-subtle);
        color: var(--color-accent);
        border-radius: var(--radius-md);
        flex-shrink: 0;
      }

      .linkedin-settings__benefit-icon svg {
        width: 14px;
        height: 14px;
      }

      .linkedin-settings__benefit-text {
        flex: 1;
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        line-height: 1.4;
      }
    `;

    document.head.appendChild(this.styleElement);
  }

  private createPanel(): void {
    // Create wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'linkedin-settings';
    this.wrapper.innerHTML = `
      <div class="linkedin-settings__backdrop"></div>
      <div class="linkedin-settings__panel" role="dialog" aria-labelledby="linkedin-settings-title">
        <header class="linkedin-settings__header">
          <div class="linkedin-settings__header-content">
            <div class="linkedin-settings__header-icon">${ICONS.linkedin}</div>
            <h2 id="linkedin-settings-title" class="linkedin-settings__title">LinkedIn</h2>
          </div>
          <button class="linkedin-settings__close" aria-label="${t('common.close')}">
            ${ICONS.close}
          </button>
        </header>
        <div class="linkedin-settings__content"></div>
      </div>
    `;

    document.body.appendChild(this.wrapper);
    this.panel = this.wrapper.querySelector('.linkedin-settings__panel');

    // Event listeners
    this.wrapper.querySelector('.linkedin-settings__backdrop')?.addEventListener('click', () => this.hide());
    this.wrapper.querySelector('.linkedin-settings__close')?.addEventListener('click', () => this.hide());

    // Keyboard handling
    this.wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  private render(): void {
    const content = this.wrapper?.querySelector('.linkedin-settings__content');
    if (!content) return;

    if (this.isLoading) {
      content.innerHTML = `
        <div class="linkedin-settings__loading">
          <div class="linkedin-settings__spinner"></div>
          <span>Loading...</span>
        </div>
      `;
      return;
    }

    if (this.status?.connected) {
      this.renderConnectedState(content);
    } else {
      this.renderDisconnectedState(content);
    }
  }

  private renderConnectedState(content: Element): void {
    const profile = this.status?.profile;
    const milestones = this.status?.upcomingMilestones || [];

    content.innerHTML = `
      <div class="linkedin-settings__status-card linkedin-settings__status-card--connected">
        <div class="linkedin-settings__profile">
          <div class="linkedin-settings__avatar">
            ${
              profile?.profilePicture
                ? `<img src="${profile.profilePicture}" alt="${profile.firstName} ${profile.lastName}">`
                : ICONS.briefcase
            }
          </div>
          <div class="linkedin-settings__profile-info">
            <h3 class="linkedin-settings__name">
              ${profile?.firstName || ''} ${profile?.lastName || ''}
            </h3>
            ${
              profile?.headline
                ? `<p class="linkedin-settings__headline">${profile.headline}</p>`
                : ''
            }
          </div>
        </div>
        <div class="linkedin-settings__status-badge linkedin-settings__status-badge--connected">
          ${ICONS.check}
          <span>Connected</span>
        </div>
        
        <div class="linkedin-settings__actions">
          <button class="linkedin-settings__btn linkedin-settings__btn--secondary" data-action="sync">
            ${ICONS.refresh}
            <span>Sync Now</span>
          </button>
          <button class="linkedin-settings__btn linkedin-settings__btn--danger" data-action="disconnect">
            ${ICONS.unlink}
            <span>Disconnect</span>
          </button>
        </div>
      </div>

      <div class="linkedin-settings__milestones">
        <div class="linkedin-settings__milestones-header">
          ${ICONS.calendar}
          <h3>Upcoming Milestones</h3>
        </div>
        ${
          milestones.length > 0
            ? milestones
                .map(
                  (m) => `
              <div class="linkedin-settings__milestone">
                <div class="linkedin-settings__milestone-icon">
                  ${ICONS.sparkles}
                </div>
                <div class="linkedin-settings__milestone-content">
                  <p class="linkedin-settings__milestone-title">${m.title}</p>
                  <p class="linkedin-settings__milestone-desc">${m.description}</p>
                  <p class="linkedin-settings__milestone-date">${new Date(m.date).toLocaleDateString()}</p>
                </div>
              </div>
            `
                )
                .join('')
            : `
              <div class="linkedin-settings__no-milestones">
                No upcoming milestones in the next 30 days.
              </div>
            `
        }
      </div>

      <div class="linkedin-settings__benefits">
        <h4>What I track</h4>
        <div class="linkedin-settings__benefit">
          <div class="linkedin-settings__benefit-icon">${ICONS.calendar}</div>
          <span class="linkedin-settings__benefit-text">
            Work anniversaries - I'll remind you of important career milestones
          </span>
        </div>
        <div class="linkedin-settings__benefit">
          <div class="linkedin-settings__benefit-icon">${ICONS.briefcase}</div>
          <span class="linkedin-settings__benefit-text">
            Role tenure - I know how long you've been in your current position
          </span>
        </div>
      </div>
    `;

    // Add event listeners
    content.querySelector('[data-action="sync"]')?.addEventListener('click', () => this.handleSync());
    content.querySelector('[data-action="disconnect"]')?.addEventListener('click', () => this.handleDisconnect());
  }

  private renderDisconnectedState(content: Element): void {
    content.innerHTML = `
      <div class="linkedin-settings__status-card">
        <div class="linkedin-settings__connect-cta">
          <h3>Connect LinkedIn</h3>
          <p>
            Let me remember your career milestones. I'll notice work anniversaries
            and help you reflect on your professional journey.
          </p>
          <button class="linkedin-settings__btn linkedin-settings__btn--primary" data-action="connect">
            ${ICONS.linkedin}
            <span>Connect LinkedIn</span>
          </button>
        </div>
      </div>

      <div class="linkedin-settings__benefits">
        <h4>Better than Human</h4>
        <div class="linkedin-settings__benefit">
          <div class="linkedin-settings__benefit-icon">${ICONS.sparkles}</div>
          <span class="linkedin-settings__benefit-text">
            "Your 5-year work anniversary at Acme is next Tuesday!"
          </span>
        </div>
        <div class="linkedin-settings__benefit">
          <div class="linkedin-settings__benefit-icon">${ICONS.calendar}</div>
          <span class="linkedin-settings__benefit-text">
            "I see you've been in your role for 3 years - how are you feeling about it?"
          </span>
        </div>
        <div class="linkedin-settings__benefit">
          <div class="linkedin-settings__benefit-icon">${ICONS.briefcase}</div>
          <span class="linkedin-settings__benefit-text">
            I'll weave career context naturally into our conversations
          </span>
        </div>
      </div>
    `;

    // Add event listener
    content.querySelector('[data-action="connect"]')?.addEventListener('click', () => this.handleConnect());
  }

  private async handleConnect(): Promise<void> {
    await connectLinkedIn();
    // OAuth will redirect - no need to update UI
  }

  private async handleDisconnect(): Promise<void> {
    const success = await disconnectLinkedIn();
    if (success) {
      this.status = null;
      this.render();
      this.callbacks.onConnectionChange?.(false);
    }
  }

  private async handleSync(): Promise<void> {
    const success = await syncLinkedIn();
    if (success) {
      // Refetch status after sync completes
      setTimeout(async () => {
        this.status = await getLinkedInStatus();
        this.render();
      }, 2000);
    }
  }

  dispose(): void {
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
      this.panel = null;
    }
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const linkedInSettingsUI = new LinkedInSettingsUI();

export function initLinkedInSettings(): void {
  linkedInSettingsUI.initialize();
}

export function showLinkedInSettings(): void {
  void linkedInSettingsUI.show();
}

export function hideLinkedInSettings(): void {
  linkedInSettingsUI.hide();
}

export function setLinkedInSettingsCallbacks(callbacks: LinkedInSettingsCallbacks): void {
  linkedInSettingsUI.setCallbacks(callbacks);
}

export default linkedInSettingsUI;

