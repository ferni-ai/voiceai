/**
 * Manage Subscription UI - Your Journey Together
 *
 * A warm, relationship-focused modal for viewing support status.
 * 
 * Philosophy: This isn't about "managing a subscription" - it's about
 * celebrating the partnership and making it easy to adjust if needed.
 * We lead with gratitude, not transaction details.
 *
 * Brand principles applied:
 * - Relationship over transaction
 * - Warm, human language
 * - Hide technical details behind warm copy
 * - Never "manage billing" - instead "make changes"
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { appleIAPService, type SubscriptionStatus } from '../services/apple-iap.service.js';
import { openBillingPortal } from '../utils/billing.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { t } from '../i18n/index.js';

const log = createLogger('ManageSubscription');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// ICONS (Lucide)
// ============================================================================

const ICONS = {
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>`,
  apple: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  externalLink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
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
      trackedTimeout(() => {
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
   * 
   * Design philosophy: Lead with gratitude, show impact, make changes easy.
   * Technical details are hidden behind warm, human language.
   */
  private createModal(): void {
    this.container = document.createElement('div');
    this.container.className = 'manage-sub';

    const tierName = this.getTierDisplayName();
    const statusText = this.getStatusText();
    const isPremium = this.status?.tier !== 'free';

    this.container.innerHTML = `
      <div class="manage-sub__backdrop"></div>
      <div class="manage-sub__card">
        <button class="manage-sub__close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>

        <div class="manage-sub__content">
          <!-- Warm Header with Icon -->
          <div class="manage-sub__hero">
            <div class="manage-sub__icon ${isPremium ? 'manage-sub__icon--premium' : ''}">
              ${isPremium ? ICONS.sparkles : ICONS.heart}
            </div>
            <span class="manage-sub__eyebrow">${t('manageSubscription.label')}</span>
            <h2 class="manage-sub__title">${t('manageSubscription.title')}</h2>
          </div>

          <!-- Current Status - Relationship focused -->
          <div class="manage-sub__status">
            <div class="manage-sub__plan-badge ${isPremium ? 'manage-sub__plan-badge--premium' : ''}">
              ${tierName}
            </div>
            <p class="manage-sub__gratitude">${statusText}</p>
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
      ?.addEventListener('click', () => { void this.handleOpenBillingPortal(); });
    this.container
      .querySelector('[data-action="apple-manage"]')
      ?.addEventListener('click', () => { void this.openAppleManagement(); });
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
   * 
   * Design: Primary action is always warm and inviting.
   * Secondary/management actions are subtle, not prominent.
   */
  private renderActions(): string {
    const { tier, provider } = this.status || { tier: 'free', provider: 'none' };

    // Free tier - warm invitation to join
    if (tier === 'free') {
      return `
        <div class="manage-sub__actions">
          <button class="manage-sub__btn manage-sub__btn--primary" data-action="upgrade">
            ${ICONS.heart}
            <span>${t('manageSubscription.buttons.upgrade')}</span>
          </button>
          ${
            appleIAPService.isIOS()
              ? `
            <button class="manage-sub__btn manage-sub__btn--ghost" data-action="restore">
              ${t('manageSubscription.buttons.restore')}
            </button>
          `
              : ''
          }
        </div>
        <p class="manage-sub__footer-note">${t('manageSubscription.freeNote')}</p>
      `;
    }

    // Apple subscription - guide to settings with warmth
    if (provider === 'apple') {
      return `
        <div class="manage-sub__actions">
          <button class="manage-sub__btn manage-sub__btn--subtle" data-action="apple-manage">
            ${ICONS.settings}
            <span>${t('manageSubscription.buttons.manageApple')}</span>
            ${ICONS.externalLink}
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
        <p class="manage-sub__footer-note">${t('manageSubscription.apple.note')}</p>
      `;
    }

    // Stripe subscription - subtle management link
    return `
      <div class="manage-sub__actions">
        <button class="manage-sub__btn manage-sub__btn--subtle" data-action="billing-portal">
          ${ICONS.settings}
          <span>${t('manageSubscription.buttons.manageStripe')}</span>
          ${ICONS.externalLink}
        </button>
      </div>
      <p class="manage-sub__footer-note">${t('manageSubscription.stripe.note')}</p>
    `;
  }

  /**
   * Open Stripe billing portal
   */
  private async handleOpenBillingPortal(): Promise<void> {
    if (!this.userId) return;

    // Use the consolidated billing utility (opens in same tab for redirect flow)
    await openBillingPortal(this.userId, { openInNewTab: false });
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
        trackedTimeout(() => {
          btn.textContent = t('manageSubscription.buttons.restore');
          btn.disabled = false;
        }, 2000);
      }
    } catch (error) {
      log.error('Restore failed:', error);
      if (btn) {
        btn.textContent = t('manageSubscription.restore.failed');
        trackedTimeout(() => {
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
   * 
   * Design philosophy: Warm, centered modal with focus on gratitude.
   * Technical elements are subtle, relationship elements are prominent.
   */
  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* ========================================================================
         MANAGE SUBSCRIPTION MODAL - Relationship-Focused Design
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
        background: rgba(44, 37, 32, 0.6);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
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
        max-width: clamp(320px, 90vw, 400px);
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06));
        border-radius: var(--radius-2xl, 24px);
        box-shadow: 
          0 24px 48px rgba(44, 37, 32, 0.15),
          0 8px 16px rgba(44, 37, 32, 0.08);
        overflow: hidden;
        transform: scale(0.94) translateY(16px);
        opacity: 0;
        transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
      }

      .manage-sub--visible .manage-sub__card {
        transform: scale(1) translateY(0);
        opacity: 1;
      }

      .manage-sub--closing .manage-sub__card {
        transform: scale(0.94) translateY(16px);
        opacity: 0;
      }

      /* Close button - top right, subtle */
      .manage-sub__close {
        position: absolute;
        top: var(--space-4, 16px);
        right: var(--space-4, 16px);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        padding: 0;
        background: var(--color-background-secondary, #f5f2ed);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        z-index: 1;
      }

      .manage-sub__close:hover {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-primary, #2c2520);
      }

      .manage-sub__close:focus {
        outline: none;
        box-shadow: 0 0 0 3px var(--persona-tint, rgba(74, 103, 65, 0.2));
      }

      .manage-sub__close svg {
        width: 18px;
        height: 18px;
      }

      /* Content container */
      .manage-sub__content {
        padding: var(--space-8, 32px) var(--space-6, 24px) var(--space-6, 24px);
      }

      /* Hero section - icon, eyebrow, title */
      .manage-sub__hero {
        text-align: center;
        margin-bottom: var(--space-6, 24px);
      }

      .manage-sub__icon {
        width: 64px;
        height: 64px;
        margin: 0 auto var(--space-4, 16px);
        padding: var(--space-4, 16px);
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.12)), transparent);
        border-radius: var(--radius-full, 9999px);
        color: var(--persona-primary, #4a6741);
      }

      .manage-sub__icon--premium {
        background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
        color: white;
      }

      .manage-sub__icon svg {
        width: 100%;
        height: 100%;
      }

      .manage-sub__eyebrow {
        display: block;
        font-family: var(--font-body);
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--persona-primary, #4a6741);
        letter-spacing: 0.08em;
        margin-bottom: var(--space-2, 8px);
        opacity: 0.9;
      }

      .manage-sub__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: 0;
        letter-spacing: -0.01em;
      }

      /* Status section */
      .manage-sub__status {
        text-align: center;
        margin-bottom: var(--space-6, 24px);
      }

      .manage-sub__plan-badge {
        display: inline-block;
        padding: var(--space-2, 8px) var(--space-5, 20px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-display);
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-secondary, #5c544a);
        margin-bottom: var(--space-3, 12px);
      }

      .manage-sub__plan-badge--premium {
        background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
        color: white;
      }

      .manage-sub__gratitude {
        font-family: var(--font-body);
        font-size: 0.9375rem;
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
        line-height: 1.6;
        max-width: 280px;
        margin-inline: auto;
      }

      /* Actions - warm, inviting buttons */
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
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-body);
        font-size: 0.9375rem;
        font-weight: 600;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.SPRING};
      }

      .manage-sub__btn svg {
        width: 18px;
        height: 18px;
      }

      .manage-sub__btn svg:last-child {
        width: 14px;
        height: 14px;
        opacity: 0.7;
      }

      /* Primary button - for upgrade CTA */
      .manage-sub__btn--primary {
        background: var(--persona-primary, #4a6741);
        color: white;
      }

      .manage-sub__btn--primary:hover {
        background: var(--persona-secondary, #3d5a35);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(74, 103, 65, 0.25);
      }

      .manage-sub__btn--primary:active {
        transform: translateY(0) scale(0.98);
      }

      /* Subtle button - for management actions (not prominent) */
      .manage-sub__btn--subtle {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-secondary, #5c544a);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
      }

      .manage-sub__btn--subtle:hover {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-primary, #2c2520);
      }

      /* Ghost button - minimal, text-like */
      .manage-sub__btn--ghost {
        background: transparent;
        color: var(--color-text-muted, #756a5e);
        padding: var(--space-2, 8px);
      }

      .manage-sub__btn--ghost:hover {
        color: var(--color-text-primary, #2c2520);
      }

      .manage-sub__btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none !important;
      }

      .manage-sub__btn:focus {
        outline: none;
        box-shadow: 0 0 0 3px var(--persona-tint, rgba(74, 103, 65, 0.2));
      }

      /* Instructions (Apple) - warm guidance */
      .manage-sub__instructions {
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-4, 16px);
        margin-bottom: var(--space-4, 16px);
      }

      .manage-sub__instructions-title {
        font-family: var(--font-body);
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-3, 12px);
      }

      .manage-sub__steps {
        margin: 0;
        padding-left: var(--space-5, 20px);
        font-family: var(--font-body);
        font-size: 0.8125rem;
        color: var(--color-text-secondary, #5c544a);
        line-height: 1.9;
      }

      /* Footer note - warm, not clinical */
      .manage-sub__footer-note {
        font-family: var(--font-body);
        font-size: 0.8125rem;
        color: var(--color-text-muted, #756a5e);
        text-align: center;
        margin: 0;
        line-height: 1.5;
      }

      /* Dark theme - maintain warmth */
      [data-theme="midnight"] .manage-sub__backdrop {
        background: rgba(20, 18, 16, 0.7);
      }

      [data-theme="midnight"] .manage-sub__card {
        background: var(--color-background-elevated, #70605a);
        border-color: rgba(255, 255, 255, 0.06);
      }

      [data-theme="midnight"] .manage-sub__title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .manage-sub__close {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .manage-sub__icon {
        background: linear-gradient(135deg, rgba(106, 138, 97, 0.2), transparent);
        color: var(--persona-primary, #6a8a61);
      }

      [data-theme="midnight"] .manage-sub__icon--premium {
        background: linear-gradient(135deg, var(--persona-primary, #6a8a61), var(--persona-secondary, #5a7a51));
        color: white;
      }

      [data-theme="midnight"] .manage-sub__plan-badge {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .manage-sub__gratitude {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .manage-sub__instructions {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .manage-sub__instructions-title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .manage-sub__btn--subtle {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .manage-sub__btn--subtle:hover {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-primary, #faf6f0);
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .manage-sub__backdrop,
        .manage-sub__card,
        .manage-sub__btn {
          transition: none !important;
        }
      }

      /* Mobile adjustments */
      @media (max-width: 400px) {
        .manage-sub__content {
          padding: var(--space-6, 24px) var(--space-4, 16px) var(--space-4, 16px);
        }
        
        .manage-sub__title {
          font-size: 1.375rem;
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
