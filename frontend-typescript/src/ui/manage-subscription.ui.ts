/**
 * Manage Subscription UI
 *
 * A modal for viewing and managing subscription status.
 * Handles both Stripe and Apple subscriptions with appropriate actions:
 * - Stripe: Opens billing portal
 * - Apple: Shows cancellation instructions (can't cancel in-app)
 *
 * Philosophy: Make it easy to understand and manage, never hide the exit.
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { appleIAPService, type SubscriptionStatus } from '../services/apple-iap.service.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const log = createLogger('ManageSubscription');

// ============================================================================
// ICONS (Lucide)
// ============================================================================

const ICONS = {
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  creditCard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  apple: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  externalLink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>`,
};

// ============================================================================
// TYPES
// ============================================================================

interface ManageSubscriptionCallbacks {
  onClose?: () => void;
  onUpgrade?: () => void;
}

// ============================================================================
// MANAGE SUBSCRIPTION UI CLASS
// ============================================================================

class ManageSubscriptionUI {
  private container: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private callbacks: ManageSubscriptionCallbacks = {};
  private userId: string | null = null;
  private status: SubscriptionStatus | null = null;

  /**
   * Open the manage subscription modal
   */
  async open(userId: string, callbacks: ManageSubscriptionCallbacks = {}): Promise<void> {
    this.userId = userId;
    this.callbacks = callbacks;

    // Clean up any existing modal
    this.close();

    // Inject styles
    this.injectStyles();

    // Fetch subscription status
    this.status = await this.fetchStatus(userId);

    // Create and show modal
    this.createModal();

    log.debug('Manage subscription modal opened');
  }

  /**
   * Close the modal
   */
  close(): void {
    if (this.container) {
      this.container.classList.add('manage-sub--closing');
      setTimeout(() => {
        this.container?.remove();
        this.container = null;
        this.callbacks.onClose?.();
      }, DURATION.NORMAL);
    }
  }

  /**
   * Fetch subscription status from backend/StoreKit
   */
  private async fetchStatus(userId: string): Promise<SubscriptionStatus> {
    try {
      return await appleIAPService.getSubscriptionStatus(userId);
    } catch (error) {
      log.error('Failed to fetch status:', error);
      return {
        tier: 'free',
        status: 'expired',
        provider: 'none',
      };
    }
  }

  /**
   * Create the modal DOM
   */
  private createModal(): void {
    this.container = document.createElement('div');
    this.container.className = 'manage-sub';

    const tierName = this.getTierDisplayName();
    const statusText = this.getStatusText();
    const providerIcon = this.status?.provider === 'apple' ? ICONS.apple : ICONS.creditCard;
    const providerName = this.status?.provider === 'apple' ? 'Apple' : 'Stripe';

    const expiresLabel = this.status?.status === 'canceled'
      ? t('manageSubscription.expiresLabel')
      : t('manageSubscription.renewsLabel');

    this.container.innerHTML = `
      <div class="manage-sub__backdrop"></div>
      <div class="manage-sub__card">
        <header class="manage-sub__header">
          <div class="manage-sub__title-wrap">
            <span class="manage-sub__eyebrow">${t('manageSubscription.label')}</span>
            <h2 class="manage-sub__title">${t('manageSubscription.title')}</h2>
          </div>
          <button class="manage-sub__close" aria-label="${t('common.close')}">
            ${ICONS.close}
          </button>
        </header>

        <div class="manage-sub__content">
          <!-- Current Plan -->
          <div class="manage-sub__plan">
            <div class="manage-sub__plan-badge ${this.status?.tier !== 'free' ? 'manage-sub__plan-badge--premium' : ''}">
              ${tierName}
            </div>
            <p class="manage-sub__plan-status">${statusText}</p>
            ${
              this.status?.expiresDate
                ? `
              <div class="manage-sub__plan-detail">
                <span class="manage-sub__plan-icon">${ICONS.calendar}</span>
                <span>${expiresLabel}: ${this.formatDate(this.status.expiresDate)}</span>
              </div>
            `
                : ''
            }
            ${
              this.status?.provider !== 'none'
                ? `
              <div class="manage-sub__plan-detail">
                <span class="manage-sub__plan-icon">${providerIcon}</span>
                <span>${t('manageSubscription.billedThrough')} ${providerName}</span>
              </div>
            `
                : ''
            }
          </div>

          <!-- Actions based on provider -->
          ${this.renderActions()}
        </div>
      </div>
    `;

    // Bind events
    this.container
      .querySelector('.manage-sub__backdrop')
      ?.addEventListener('click', () => this.close());
    this.container
      .querySelector('.manage-sub__close')
      ?.addEventListener('click', () => this.close());

    // Action buttons
    this.container
      .querySelector('[data-action="billing-portal"]')
      ?.addEventListener('click', () => this.openBillingPortal());
    this.container
      .querySelector('[data-action="apple-manage"]')
      ?.addEventListener('click', () => this.openAppleManagement());
    this.container
      .querySelector('[data-action="upgrade"]')
      ?.addEventListener('click', () => this.handleUpgrade());
    this.container
      .querySelector('[data-action="restore"]')
      ?.addEventListener('click', () => this.handleRestore());

    document.body.appendChild(this.container);

    // Trigger enter animation
    requestAnimationFrame(() => {
      this.container?.classList.add('manage-sub--visible');
    });
  }

  /**
   * Render action buttons based on subscription provider
   */
  private renderActions(): string {
    const { tier, provider } = this.status || { tier: 'free', provider: 'none' };

    // Free tier - show upgrade option
    if (tier === 'free') {
      return `
        <div class="manage-sub__actions">
          <button class="manage-sub__btn manage-sub__btn--primary" data-action="upgrade">
            ${t('manageSubscription.buttons.upgrade')}
          </button>
          ${
            appleIAPService.isIOS()
              ? `
            <button class="manage-sub__btn manage-sub__btn--secondary" data-action="restore">
              ${t('manageSubscription.buttons.restore')}
            </button>
          `
              : ''
          }
        </div>
        <p class="manage-sub__note">
          ${ICONS.info}
          <span>${t('manageSubscription.freeNote')}</span>
        </p>
      `;
    }

    // Apple subscription
    if (provider === 'apple') {
      return `
        <div class="manage-sub__actions">
          <button class="manage-sub__btn manage-sub__btn--primary" data-action="apple-manage">
            <span>${ICONS.externalLink}</span>
            <span>${t('manageSubscription.buttons.manageApple')}</span>
          </button>
        </div>
        <div class="manage-sub__instructions">
          <p class="manage-sub__instructions-title">${t('manageSubscription.apple.instructionsTitle')}</p>
          <ol class="manage-sub__steps">
            <li>${t('manageSubscription.apple.step1')}</li>
            <li>${t('manageSubscription.apple.step2')}</li>
            <li>${t('manageSubscription.apple.step3')}</li>
            <li>${t('manageSubscription.apple.step4')}</li>
          </ol>
        </div>
        <p class="manage-sub__note">
          ${ICONS.info}
          <span>${t('manageSubscription.apple.note')}</span>
        </p>
      `;
    }

    // Stripe subscription
    return `
      <div class="manage-sub__actions">
        <button class="manage-sub__btn manage-sub__btn--primary" data-action="billing-portal">
          <span>${ICONS.externalLink}</span>
          <span>${t('manageSubscription.buttons.manageStripe')}</span>
        </button>
      </div>
      <p class="manage-sub__note">
        ${ICONS.info}
        <span>${t('manageSubscription.stripe.note')}</span>
      </p>
    `;
  }

  /**
   * Open Stripe billing portal
   */
  private async openBillingPortal(): Promise<void> {
    if (!this.userId) return;

    try {
      const response = await fetch('/subscription/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          returnUrl: window.location.href,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      log.error('Failed to open billing portal:', error);
      // Show toast error
    }
  }

  /**
   * Open Apple subscription management
   */
  private async openAppleManagement(): Promise<void> {
    await appleIAPService.openSubscriptionManagement();
  }

  /**
   * Handle upgrade button click
   */
  private handleUpgrade(): void {
    this.close();
    this.callbacks.onUpgrade?.();
  }

  /**
   * Handle restore purchases (iOS)
   */
  private async handleRestore(): Promise<void> {
    if (!this.userId) return;

    const btn = this.container?.querySelector('[data-action="restore"]') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('manageSubscription.buttons.restoring');
    }

    try {
      const result = await appleIAPService.restorePurchases(this.userId);

      if (result.restoredTier) {
        // Refresh the modal with new status
        this.status = await this.fetchStatus(this.userId);
        this.container?.remove();
        this.createModal();
      } else if (btn) {
        btn.textContent = t('manageSubscription.restore.noFound');
        setTimeout(() => {
          btn.textContent = t('manageSubscription.buttons.restore');
          btn.disabled = false;
        }, 2000);
      }
    } catch (error) {
      log.error('Restore failed:', error);
      if (btn) {
        btn.textContent = t('manageSubscription.restore.failed');
        setTimeout(() => {
          btn.textContent = t('manageSubscription.buttons.restore');
          btn.disabled = false;
        }, 2000);
      }
    }
  }

  /**
   * Get display name for tier
   */
  private getTierDisplayName(): string {
    switch (this.status?.tier) {
      case 'partner':
        return t('subscription.partner');
      case 'friend':
        return t('subscription.friend');
      default:
        return t('subscription.free');
    }
  }

  /**
   * Get status text
   */
  private getStatusText(): string {
    const { tier, status } = this.status || { tier: 'free', status: 'active' };

    if (tier === 'free') {
      return t('manageSubscription.status.free');
    }

    switch (status) {
      case 'active':
        return t('manageSubscription.status.active');
      case 'canceled':
        return t('manageSubscription.status.canceled');
      case 'past_due':
        return t('manageSubscription.status.pastDue');
      default:
        return t('manageSubscription.status.default');
    }
  }

  /**
   * Format date for display
   */
  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  }

  /**
   * Inject styles
   */
  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* ========================================================================
         MANAGE SUBSCRIPTION MODAL
         ======================================================================== */
      .manage-sub {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4, 16px);
      }

      .manage-sub__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.4);
        backdrop-filter: blur(var(--glass-blur-strong, 24px));
        opacity: 0;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .manage-sub--visible .manage-sub__backdrop {
        opacity: 1;
      }

      .manage-sub--closing .manage-sub__backdrop {
        opacity: 0;
      }

      .manage-sub__card {
        position: relative;
        width: 100%;
        max-width: 420px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-2xl, 1.5rem);
        box-shadow: var(--shadow-2xl);
        overflow: hidden;
        transform: scale(0.95) translateY(20px);
        opacity: 0;
        transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
      }

      .manage-sub--visible .manage-sub__card {
        transform: scale(1) translateY(0);
        opacity: 1;
      }

      .manage-sub--closing .manage-sub__card {
        transform: scale(0.95) translateY(20px);
        opacity: 0;
      }

      /* Header */
      .manage-sub__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      }

      .manage-sub__eyebrow {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-accent-text, #4a6741);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      .manage-sub__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: var(--space-1, 4px) 0 0;
      }

      .manage-sub__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        background: var(--color-background-tertiary, #ebe6df);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .manage-sub__close:hover {
        background: var(--color-background-secondary, #f5f2ed);
        transform: scale(1.05);
      }

      .manage-sub__close svg {
        width: 18px;
        height: 18px;
      }

      /* Content */
      .manage-sub__content {
        padding: var(--space-6, 24px);
      }

      /* Plan display */
      .manage-sub__plan {
        text-align: center;
        margin-bottom: var(--space-6, 24px);
      }

      .manage-sub__plan-badge {
        display: inline-block;
        padding: var(--space-2, 8px) var(--space-4, 16px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-display);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-secondary, #5c544a);
        margin-bottom: var(--space-3, 12px);
      }

      .manage-sub__plan-badge--premium {
        background: linear-gradient(135deg, var(--persona-secondary, #3d5a35), var(--persona-primary, #4a6741));
        color: white;
      }

      .manage-sub__plan-status {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary, #5c544a);
        margin: 0 0 var(--space-4, 16px);
        line-height: 1.5;
      }

      .manage-sub__plan-detail {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-muted, #756a5e);
        margin-bottom: var(--space-2, 8px);
      }

      .manage-sub__plan-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .manage-sub__plan-icon svg {
        width: 100%;
        height: 100%;
      }

      /* Actions */
      .manage-sub__actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-4, 16px);
      }

      .manage-sub__btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        width: 100%;
        padding: var(--space-4, 16px);
        border: none;
        border-radius: var(--radius-lg, 0.75rem);
        font-family: var(--font-body);
        font-size: var(--text-base);
        font-weight: var(--font-weight-medium, 500);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .manage-sub__btn svg {
        width: 18px;
        height: 18px;
      }

      .manage-sub__btn--primary {
        background: linear-gradient(135deg, var(--persona-secondary, #3d5a35), var(--persona-primary, #4a6741));
        color: white;
      }

      .manage-sub__btn--primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
      }

      .manage-sub__btn--primary:active {
        transform: translateY(0);
      }

      .manage-sub__btn--secondary {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
      }

      .manage-sub__btn--secondary:hover {
        background: var(--color-background-tertiary, #ebe6df);
      }

      .manage-sub__btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none !important;
      }

      /* Instructions (Apple) */
      .manage-sub__instructions {
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 0.75rem);
        padding: var(--space-4, 16px);
        margin-bottom: var(--space-4, 16px);
      }

      .manage-sub__instructions-title {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-3, 12px);
      }

      .manage-sub__steps {
        margin: 0;
        padding-left: var(--space-5, 20px);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary, #5c544a);
        line-height: 1.8;
      }

      /* Note */
      .manage-sub__note {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2, 8px);
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      .manage-sub__note svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        margin-top: 2px;
      }

      /* Dark theme */
      [data-theme="midnight"] .manage-sub__backdrop {
        background: rgba(20, 18, 16, 0.6);
      }

      [data-theme="midnight"] .manage-sub__card {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .manage-sub__title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .manage-sub__close {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .manage-sub__plan-badge {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .manage-sub__instructions {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .manage-sub__instructions-title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .manage-sub__btn--secondary {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .manage-sub__backdrop,
        .manage-sub__card {
          transition: none !important;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.close();
    this.styleElement?.remove();
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const manageSubscriptionUI = new ManageSubscriptionUI();

export default manageSubscriptionUI;
