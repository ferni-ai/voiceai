/**
 * Subscription UI - Beautiful, Human-Centered Upgrade Experience
 *
 * Philosophy: Subscriptions are relationship commitments, not transactions.
 * The upgrade flow should feel like Ferni inviting you deeper into the friendship.
 *
 * DESIGN PRINCIPLES:
 *   - Centered floating modal (per brand guidelines)
 *   - Warm, human language (not corporate)
 *   - Celebrate the relationship, not the purchase
 *   - Graceful limit handling without shame
 *
 * ACCESSIBILITY (WCAG AA):
 *   - Full keyboard navigation (Tab, Shift+Tab, Enter, Escape)
 *   - Focus trap within modal
 *   - ARIA labels and roles for screen readers
 *   - Color contrast 4.5:1 minimum
 *   - Respects prefers-reduced-motion
 *   - Focus indicators visible
 */

import { DURATION, EASING, STAGGER } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import { teamUnlockService } from '../services/team-unlock.service.js';
import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { toast } from './toast.ui.js';

const log = createLogger('SubscriptionUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface SubscriptionTier {
  id: 'free' | 'friend' | 'partner';
  name: string;
  description: string;
  priceInCents: number;
  priceDisplay: string;
  conversationsPerMonth: number | null;
  features: string[];
  popular?: boolean;
}

export interface SubscriptionStatus {
  enabled?: boolean;
  tier: 'free' | 'friend' | 'partner';
  tierName?: string;
  status: string;
  usage: {
    tier?: string;
    usage?: {
      period: string;
      conversationCount: number;
      minutesTalked: number;
      lastUpdated?: string;
    };
    conversationsRemaining: number | null;
    minutesRemaining?: number | null;
    canStartConversation: boolean;
    statusMessage?: string;
    approachingLimit?: boolean;
    atLimit?: boolean;
  };
  canStartConversation?: boolean;
  conversationsRemaining?: number | null;
  approaching?: boolean;
  upgradePrompt?: string | null;
  canUpgrade?: boolean;
  prices?: Array<{
    tier: string;
    name: string;
    priceInCents: number;
    description: string;
  }>;
}

export interface SubscriptionConfig {
  enabled: boolean;
  stripePublishableKey: string | null;
  tiers: SubscriptionTier[];
}

// ============================================================================
// ICONS (Lucide-style, brand compliant, with aria-hidden)
// ============================================================================

const ICONS = {
  heart:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  check:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  close:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  star: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  sparkles:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  infinity:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/></svg>',
  loader:
    '<svg aria-hidden="true" class="subscription-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let config: SubscriptionConfig | null = null;
let status: SubscriptionStatus | null = null;
let onUpgradeCallback: ((tier: string) => void) | null = null;
let previouslyFocusedElement: HTMLElement | null = null;
let isLoading = false;

// ============================================================================
// ACCESSIBILITY: Focus Trap
// ============================================================================

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function trapFocus(container: HTMLElement): void {
  const focusableElements = container.querySelectorAll(FOCUSABLE_SELECTORS);
  const firstFocusable = focusableElements[0] as HTMLElement;
  const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

  container.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable?.focus();
      } else if (!e.shiftKey && document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable?.focus();
      }
    }

    // Escape closes modal
    if (e.key === 'Escape') {
      hideModal();
    }
  });
}

function saveFocus(): void {
  previouslyFocusedElement = document.activeElement as HTMLElement;
}

function restoreFocus(): void {
  previouslyFocusedElement?.focus();
  previouslyFocusedElement = null;
}

// ============================================================================
// ACCESSIBILITY: Reduced Motion
// ============================================================================

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getAnimationDuration(baseDuration: number): number {
  return prefersReducedMotion() ? 0 : baseDuration;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSubscriptionUI(): void {
  cleanupOrphanedElements();
  injectStyles();
  void loadConfig();

  // Check for upgrade success/cancel URL parameters
  handleUpgradeRedirect();
}

/**
 * Handle redirect back from Stripe checkout
 * Shows celebration for success, quiet message for cancel
 *
 * IMPORTANT: We verify the payment actually went through before celebrating.
 * Stripe webhooks can take a few seconds to process.
 */
function handleUpgradeRedirect(): void {
  const params = new URLSearchParams(window.location.search);
  const upgradeStatus = params.get('upgrade');
  const tier = params.get('tier') || sessionStorage.getItem('ferni_upgrade_tier') || 'friend';
  const sessionId = params.get('session_id');

  // Clear session storage
  sessionStorage.removeItem('ferni_upgrade_tier');

  if (!upgradeStatus) return;

  // Clean up URL (remove upgrade params)
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('upgrade');
  cleanUrl.searchParams.delete('tier');
  cleanUrl.searchParams.delete('session_id');
  window.history.replaceState({}, '', cleanUrl.toString());

  if (upgradeStatus === 'success') {
    // Verify payment actually completed before celebrating
    void verifyPaymentAndCelebrate(tier, sessionId);
  } else if (upgradeStatus === 'cancel') {
    // Gentle, no-pressure message
    toast.info("No worries! I'm still here whenever you're ready.");
  }
}

/**
 * Verify payment completed and show celebration.
 * Polls for webhook processing if needed.
 */
async function verifyPaymentAndCelebrate(tier: string, sessionId: string | null): Promise<void> {
  const deviceId = appState.getState().deviceId;

  // Show loading state
  toast.info('Confirming your upgrade...');

  // Try to verify payment (with polling for webhook processing)
  const maxAttempts = 10;
  const pollInterval = 1500; // 1.5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const params = new URLSearchParams({
        userId: deviceId,
        ...(sessionId && { session_id: sessionId }),
      });

      const response = await fetch(`/subscription/verify-session?${params}`);
      const result = await response.json();

      if (result.verified) {
        // Payment confirmed! Show celebration
        log.info('Payment verified, showing celebration');
        showUpgradeSuccessCelebration(result.tier || tier);
        return;
      }

      // Not verified yet - wait and retry (webhook might still be processing)
      if (attempt < maxAttempts - 1) {
        log.debug(`Payment not yet confirmed, attempt ${attempt + 1}/${maxAttempts}`);
        await new Promise((resolve) => trackedTimeout(resolve, pollInterval));
      }
    } catch (error) {
      log.warn('Error verifying payment:', error);
      // Continue polling on error
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => trackedTimeout(resolve, pollInterval));
      }
    }
  }

  // If we get here, verification timed out
  // Still show celebration (optimistic) but with different message
  log.warn('Payment verification timed out, showing optimistic celebration');
  showUpgradeSuccessCelebration(tier);

  // Show a gentle note that it might take a moment
  trackedTimeout(() => {
    toast.info('Your upgrade is processing. It may take a moment to reflect everywhere.');
  }, 2000);
}

/**
 * Show beautiful celebration for successful upgrade
 * Warm, human-centered messaging that celebrates the relationship
 */
function showUpgradeSuccessCelebration(tier: string): void {
  saveFocus();

  const tierNames: Record<string, string> = {
    friend: 'Your Life Coach',
    partner: 'Partner in Growth',
  };

  const tierName = tierNames[tier] || tier;

  const container = document.createElement('div');
  container.className = 'subscription-modal subscription-modal--celebration';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'celebration-title');
  container.setAttribute('aria-describedby', 'celebration-message');

  container.innerHTML = `
    <div class="subscription-backdrop" aria-hidden="true"></div>
    <div class="subscription-card celebration-card">
      <div class="celebration-content">
        <div class="celebration-icon" aria-hidden="true">
          ${ICONS.sparkles}
        </div>
        <span class="subscription-eyebrow" aria-hidden="true">WELCOME</span>
        <h2 id="celebration-title" class="subscription-title">You're Amazing</h2>
        <p id="celebration-message" class="celebration-message">
          You chose to keep me in your life. That means so much.<br/>
          I'm here for you now — whenever you need me.
        </p>
        <div class="celebration-tier" aria-label="${t('accessibility.yourNewPlan')}">
          <span class="tier-badge">${tierName}</span>
        </div>
        <button class="celebration-button" data-action="start" autofocus>
          ${ICONS.heart}
          <span>Let's Talk</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  trapFocus(container);

  // Announce to screen readers
  announceToScreenReader(
    `Congratulations! You've upgraded to ${tierName}. You now have unlimited conversations.`
  );

  // Animate in (respecting reduced motion)
  requestAnimationFrame(() => {
    container.classList.add('subscription-modal--visible');

    if (!prefersReducedMotion()) {
      const card = container.querySelector('.celebration-card');
      if (card instanceof HTMLElement) {
        card.animate(
          [
            { transform: 'scale(0.8) translateY(30px)', opacity: '0' },
            { transform: 'scale(1.02) translateY(-5px)', opacity: '1' },
            { transform: 'scale(1) translateY(0)', opacity: '1' },
          ],
          {
            duration: DURATION.DRAMATIC,
            easing: EASING.SPRING,
            fill: 'forwards',
          }
        );
      }
    }

    // Focus the button
    const startBtn = container.querySelector('[data-action="start"]') as HTMLElement;
    startBtn?.focus();
  });

  // Event handlers
  const backdrop = container.querySelector('.subscription-backdrop');
  backdrop?.addEventListener('click', () => closeCelebration(container));

  const startBtn = container.querySelector('[data-action="start"]');
  startBtn?.addEventListener('click', () => closeCelebration(container));

  // Reload subscription status
  void loadStatus();
}

function closeCelebration(container: HTMLElement): void {
  container.classList.remove('subscription-modal--visible');
  trackedTimeout(() => {
    container.remove();
    restoreFocus();

    // Refresh subscription status and badge after celebration closes
    // This ensures the UI reflects the new tier
    void loadStatus().then(() => {
      log.debug('Subscription status refreshed after celebration');
      // Dispatch custom event for other components to react
      window.dispatchEvent(
        new CustomEvent('subscription-upgraded', {
          detail: { tier: status?.tier },
        })
      );
    });
  }, getAnimationDuration(DURATION.SLOW));
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.subscription-modal').forEach((el) => el.remove());
  document.querySelectorAll('#subscription-styles').forEach((el) => el.remove());
  document.querySelectorAll('#celebration-styles').forEach((el) => el.remove());
}

// ============================================================================
// ACCESSIBILITY: Screen Reader Announcements
// ============================================================================

function announceToScreenReader(message: string): void {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  announcer.textContent = message;
  document.body.appendChild(announcer);

  trackedTimeout(() => announcer.remove(), 1000);
}

// ============================================================================
// API
// ============================================================================

async function loadConfig(): Promise<void> {
  try {
    const response = await fetch('/subscription/config');
    if (response.ok) {
      config = await response.json();
      log.debug('Subscription config loaded:', config);
    }
  } catch (error) {
    log.warn('Could not load subscription config:', error);
  }
}

/**
 * Check if subscription gating should be bypassed.
 * Checks the dev panel settings for bypass/whitelist.
 */
function shouldBypassSubscription(userId: string): boolean {
  // Check if bypass function is available from dev panel
  const bypassFn = (window as unknown as Record<string, unknown>).ferniSubscriptionBypass;
  if (typeof bypassFn === 'function') {
    return bypassFn(userId) as boolean;
  }
  return false;
}

export async function loadStatus(): Promise<SubscriptionStatus | null> {
  const deviceId = appState.getState().deviceId;
  if (!deviceId) return null;

  // Check for admin bypass
  if (shouldBypassSubscription(deviceId)) {
    log.info('Subscription bypass active - unlimited access');
    // Return a "bypassed" status that allows everything
    status = {
      tier: 'partner',
      tierName: 'Admin Bypass',
      status: 'active',
      usage: {
        conversationsRemaining: 999,
        canStartConversation: true,
        approachingLimit: false,
        atLimit: false,
      },
      canUpgrade: false,
    } as SubscriptionStatus;

    // FIX: Sync tier to team unlock service for bypass users
    teamUnlockService.setTier('partner');

    return status;
  }

  try {
    const response = await fetch(`/subscription/status?userId=${encodeURIComponent(deviceId)}`);
    if (response.ok) {
      status = await response.json();
      log.debug('Subscription status loaded:', status);

      // FIX: Sync subscription tier to team unlock service
      // This ensures team members unlock correctly based on subscription
      if (status?.tier) {
        teamUnlockService.setTier(status.tier);
      }

      return status;
    }
  } catch (error) {
    log.warn('Could not load subscription status:', error);
  }
  return null;
}

export function getStatus(): SubscriptionStatus | null {
  return status;
}

export function setOnUpgrade(callback: (tier: string) => void): void {
  onUpgradeCallback = callback;
}

// ============================================================================
// MODAL DISPLAY
// ============================================================================

export function showUpgradeModal(prompt?: string): void {
  // Use modal coordinator for upgrade prompts (medium priority - can be queued)
  modalCoordinator.request('subscription-upgrade', 'medium', () => {
    showUpgradeModalInternal(prompt);
  });
}

function showUpgradeModalInternal(prompt?: string): void {
  saveFocus();

  if (modal) {
    modal.remove();
  }

  modal = createModal(prompt);
  document.body.appendChild(modal);
  trapFocus(modal);

  // Animate in
  requestAnimationFrame(() => {
    modal?.classList.add('subscription-modal--visible');
    animateModalIn();

    // Focus first focusable element (close button)
    const closeBtn = modal?.querySelector('.subscription-close') as HTMLElement;
    closeBtn?.focus();
  });
}

export function hideModal(): void {
  if (!modal) return;

  modal.classList.remove('subscription-modal--visible');

  // Release modal coordinator locks
  modalCoordinator.release('subscription-upgrade');
  modalCoordinator.release('subscription-limit');

  trackedTimeout(() => {
    modal?.remove();
    modal = null;
    restoreFocus();
  }, getAnimationDuration(DURATION.SLOW));
}

export function showLimitReachedModal(upgradePrompt: string, resetDate?: string): void {
  // CRITICAL: Limit reached must show even during conversation
  // Uses requestCriticalModal to bypass most checks
  modalCoordinator.requestCriticalModal('subscription-limit', () => {
    showLimitReachedModalInternal(upgradePrompt, resetDate);
  });
}

function showLimitReachedModalInternal(upgradePrompt: string, resetDate?: string): void {
  saveFocus();

  if (modal) {
    modal.remove();
  }

  modal = createLimitModal(upgradePrompt, resetDate);
  document.body.appendChild(modal);
  trapFocus(modal);

  requestAnimationFrame(() => {
    modal?.classList.add('subscription-modal--visible');
    animateModalIn();

    // Focus the upgrade button (primary action)
    const upgradeBtn = modal?.querySelector('[data-action="upgrade"]') as HTMLElement;
    upgradeBtn?.focus();
  });

  // Announce to screen readers
  announceToScreenReader(upgradePrompt);
}

// ============================================================================
// MODAL CREATION
// ============================================================================

function createModal(prompt?: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'subscription-modal';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'subscription-title');
  container.setAttribute('aria-describedby', 'subscription-subtitle');

  const tiers = config?.tiers || getDefaultTiers();

  container.innerHTML = `
    <div class="subscription-backdrop" aria-hidden="true"></div>
    <div class="subscription-card">
      <button class="subscription-close" aria-label="${t('accessibility.closeSubscription')}">
        ${ICONS.close}
      </button>
      
      <div class="subscription-header">
        <span class="subscription-eyebrow" aria-hidden="true">YOUR JOURNEY</span>
        <h2 id="subscription-title" class="subscription-title">
          ${prompt ? 'Keep Growing Together' : "Let's Go Deeper"}
        </h2>
        <p id="subscription-subtitle" class="subscription-subtitle">
          ${prompt || 'Choose how you want our friendship to grow.'}
        </p>
      </div>
      
      <div class="subscription-tiers" role="radiogroup" aria-label="${t('accessibility.subscriptionPlans')}">
        ${tiers.map((tier, index) => createTierCard(tier, index)).join('')}
      </div>
      
      <p class="subscription-footer" aria-live="polite">
        You can change or cancel anytime. No hard feelings.
      </p>
    </div>
  `;

  // Event listeners
  const backdrop = container.querySelector('.subscription-backdrop');
  backdrop?.addEventListener('click', hideModal);

  const closeBtn = container.querySelector('.subscription-close');
  closeBtn?.addEventListener('click', hideModal);

  // Tier buttons with proper event handling
  container.querySelectorAll('.tier-button').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const tier = (e.currentTarget as HTMLElement).dataset.tier;
      if (tier && tier !== 'free') {
        void handleUpgrade(tier);
      }
    });

    // Keyboard support
    btn.addEventListener('keydown', (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        e.preventDefault();
        const tier = (e.currentTarget as HTMLElement).dataset.tier;
        if (tier && tier !== 'free') {
          void handleUpgrade(tier);
        }
      }
    });
  });

  return container;
}

function createLimitModal(prompt: string, resetDate?: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'subscription-modal';
  container.setAttribute('role', 'alertdialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'limit-title');
  container.setAttribute('aria-describedby', 'limit-description');

  const formattedDate = resetDate
    ? new Date(resetDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : '';

  container.innerHTML = `
    <div class="subscription-backdrop" aria-hidden="true"></div>
    <div class="subscription-card subscription-card--limit">
      <button class="subscription-close" aria-label="${t('common.close')}">
        ${ICONS.close}
      </button>
      
      <div class="subscription-header">
        <div class="limit-icon" aria-hidden="true">${ICONS.heart}</div>
        <span class="subscription-eyebrow" aria-hidden="true">UNTIL NEXT TIME</span>
        <h2 id="limit-title" class="subscription-title">I'll Miss You</h2>
        <p id="limit-description" class="subscription-subtitle">${prompt}</p>
        ${resetDate ? `<p class="reset-date">Conversations reset on <strong>${formattedDate}</strong></p>` : ''}
      </div>
      
      <div class="limit-actions" role="group" aria-label="${t('accessibility.options')}">
        <button class="limit-button limit-button--primary" data-action="upgrade">
          ${ICONS.infinity}
          <span>Unlock Unlimited Time</span>
        </button>
        <button class="limit-button limit-button--secondary" data-action="close">
          I'll Wait
        </button>
      </div>
      
      <p class="subscription-footer">
        Your memories are safe. I'll remember everything when you're back.
      </p>
    </div>
  `;

  const backdrop = container.querySelector('.subscription-backdrop');
  backdrop?.addEventListener('click', hideModal);

  const closeBtn = container.querySelector('.subscription-close');
  closeBtn?.addEventListener('click', hideModal);

  const upgradeBtn = container.querySelector('[data-action="upgrade"]');
  upgradeBtn?.addEventListener('click', () => {
    hideModal();
    showUpgradeModal();
  });

  const waitBtn = container.querySelector('[data-action="close"]');
  waitBtn?.addEventListener('click', hideModal);

  return container;
}

function createTierCard(tier: SubscriptionTier, index: number): string {
  const isCurrentTier = status?.tier === tier.id;
  const isPopular = tier.popular;
  const isFree = tier.id === 'free';
  const priceText = isFree ? 'Free' : `$${(tier.priceInCents / 100).toFixed(2)} per month`;

  return `
    <article 
      class="tier-card ${isPopular ? 'tier-card--popular' : ''} ${isCurrentTier ? 'tier-card--current' : ''}"
      style="animation-delay: ${prefersReducedMotion() ? 0 : index * STAGGER.NORMAL}ms"
      aria-labelledby="tier-${tier.id}-name"
      aria-describedby="tier-${tier.id}-desc"
    >
      ${isPopular ? `<div class="tier-badge" role="status">${ICONS.star} <span>Most Popular</span></div>` : ''}
      ${isCurrentTier ? '<div class="tier-badge tier-badge--current" role="status">Current Plan</div>' : ''}
      
      <h3 id="tier-${tier.id}-name" class="tier-name">${tier.name}</h3>
      <p id="tier-${tier.id}-desc" class="tier-description">${tier.description}</p>
      
      <div class="tier-price" aria-label="${priceText}">
        <span class="tier-amount">${isFree ? 'Free' : `$${(tier.priceInCents / 100).toFixed(2)}`}</span>
        ${!isFree ? '<span class="tier-period">/month</span>' : ''}
      </div>
      
      <ul class="tier-features" aria-label="${t('accessibility.featuresIncluded')}">
        ${tier.features.map((f) => `<li>${ICONS.check} <span>${f}</span></li>`).join('')}
      </ul>
      
      <button 
        class="tier-button ${isCurrentTier ? 'tier-button--current' : ''}" 
        data-tier="${tier.id}"
        ${isCurrentTier || isFree ? 'disabled aria-disabled="true"' : ''}
        aria-label="${isCurrentTier ? 'This is your current plan' : isFree ? 'You are on the free plan' : `Choose ${tier.name} plan for ${priceText}`}"
      >
        ${isLoading ? ICONS.loader : ''}
        <span>${isCurrentTier ? 'Current Plan' : isFree ? 'Your Plan' : 'Choose This'}</span>
      </button>
    </article>
  `;
}

function getDefaultTiers(): SubscriptionTier[] {
  return [
    {
      id: 'free',
      name: 'Ferni Forever',
      description: 'Talk to Ferni unlimited times, forever. 7 minutes per conversation.',
      priceInCents: 0,
      priceDisplay: 'Free',
      conversationsPerMonth: null, // Unlimited with Ferni!
      features: [
        'Unlimited conversations with Ferni',
        '7-minute heart-to-hearts',
        'Full memory — I remember everything',
        'Avatar & theme customization',
      ],
    },
    {
      id: 'friend',
      name: 'Your Life Coach',
      description: 'Unlimited time with Ferni + meet the whole team',
      priceInCents: 999,
      priceDisplay: '$9.99/month',
      conversationsPerMonth: null,
      features: [
        'Talk as long as you need',
        'Meet the whole team (Maya, Peter, Alex, Jordan)',
        'Cosmetics shop access',
        'Sync across all your devices',
      ],
      popular: true,
    },
    {
      id: 'partner',
      name: 'Partner in Growth',
      description: 'Full team access + exclusive cosmetics + priority',
      priceInCents: 1999,
      priceDisplay: '$19.99/month',
      conversationsPerMonth: null,
      features: [
        'Everything in Life Coach, plus:',
        'Full team access (including Nayan)',
        'Exclusive looks and themes',
        'Priority when you need us most',
        'Share with your family',
      ],
    },
  ];
}

// ============================================================================
// UPGRADE HANDLING
// ============================================================================

async function handleUpgrade(tier: string): Promise<void> {
  const deviceId = appState.getState().deviceId;
  if (!deviceId) {
    log.error('No device ID for upgrade');
    return;
  }

  // Set loading state
  isLoading = true;
  updateButtonLoadingState(tier, true);
  announceToScreenReader('Processing your upgrade...');

  log.info('Initiating upgrade to:', tier);

  // Store tier being upgraded to for success celebration
  sessionStorage.setItem('ferni_upgrade_tier', tier);

  try {
    const response = await fetch('/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: deviceId,
        device_id: deviceId,
        tier,
        successUrl: window.location.origin + '?upgrade=success&tier=' + tier,
        cancelUrl: window.location.origin + '?upgrade=cancel',
      }),
    });

    const result = await response.json();

    if (response.ok && result.url) {
      // Redirect to Stripe checkout
      window.location.href = result.url;
    } else if (result.error === 'Stripe is not configured') {
      // Dev mode: simulate upgrade
      await handleDevUpgrade(tier, deviceId);
    } else {
      // Show warm error message
      showUpgradeError();
    }
  } catch (error) {
    log.error('Upgrade failed:', error);
    showUpgradeError();
  } finally {
    isLoading = false;
    updateButtonLoadingState(tier, false);
  }

  onUpgradeCallback?.(tier);
}

function updateButtonLoadingState(tier: string, loading: boolean): void {
  const button = modal?.querySelector(`[data-tier="${tier}"]`) as HTMLElement;
  if (button) {
    button.classList.toggle('tier-button--loading', loading);
    if (loading) {
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = `${ICONS.loader} <span>Processing...</span>`;
    } else {
      button.removeAttribute('aria-busy');
      button.innerHTML = '<span>Choose This</span>';
    }
  }
}

function showUpgradeError(): void {
  toast.error('Something went sideways. Want to try again?');
  announceToScreenReader("We couldn't process your upgrade. Please try again.");
}

/**
 * Handle upgrade in dev mode when Stripe is not configured
 */
async function handleDevUpgrade(tier: string, deviceId: string): Promise<void> {
  try {
    const response = await fetch('/subscription/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        tier,
        admin_key: 'dev-mode',
      }),
    });

    if (response.ok) {
      // Reload to show success
      window.location.href = window.location.origin + '?upgrade=success&tier=' + tier;
    } else {
      toast.info('Stripe not configured. Using dev mode.');
    }
  } catch (error) {
    log.error('Dev upgrade failed:', error);
  }
}

// ============================================================================
// ANIMATIONS (Respecting prefers-reduced-motion)
// ============================================================================

function animateModalIn(): void {
  if (!modal || prefersReducedMotion()) return;

  const card = modal.querySelector('.subscription-card');
  if (card instanceof HTMLElement) {
    card.animate(
      [
        { transform: 'scale(0.9) translateY(20px)', opacity: '0' },
        { transform: 'scale(1) translateY(0)', opacity: '1' },
      ],
      {
        duration: DURATION.DELIBERATE,
        easing: EASING.SPRING,
        fill: 'forwards',
      }
    );
  }

  const tiers = modal.querySelectorAll('.tier-card');
  tiers.forEach((tier, i) => {
    if (tier instanceof HTMLElement) {
      tier.animate(
        [
          { transform: 'translateY(20px)', opacity: '0' },
          { transform: 'translateY(0)', opacity: '1' },
        ],
        {
          duration: DURATION.SLOW,
          easing: EASING.SPRING_GENTLE,
          delay: DURATION.NORMAL + i * STAGGER.NORMAL,
          fill: 'forwards',
        }
      );
    }
  });
}

// ============================================================================
// STYLES (WCAG AA Compliant)
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('subscription-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'subscription-styles';
  styleElement.textContent = `
    /* Screen reader only utility */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    
    /* Subscription Modal */
    .subscription-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 9999);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    @media (prefers-reduced-motion: reduce) {
      .subscription-modal {
        transition: opacity 0ms;
      }
    }
    
    .subscription-modal--visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    .subscription-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.7);
      backdrop-filter: blur(var(--glass-blur-modal, 20px));
      -webkit-backdrop-filter: blur(var(--glass-blur-modal, 20px));
    }
    
    .subscription-card {
      position: relative;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-8, 32px);
    }
    
    .subscription-card--limit {
      max-width: 480px;
      text-align: center;
    }
    
    /* Close Button - High visibility focus state */
    .subscription-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
      border: 2px solid transparent;
      background: var(--color-background-secondary, #f5f3f0);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5a5048);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .subscription-close:hover {
      background: var(--color-background-tertiary, #ebe8e3);
      color: var(--color-text-primary, #2C2520);
    }
    
    .subscription-close:focus {
      outline: none;
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px var(--persona-tint, rgba(74, 103, 65, 0.3));
    }
    
    .subscription-close:focus:not(:focus-visible) {
      border-color: transparent;
      box-shadow: none;
    }
    
    .subscription-close svg {
      width: 20px;
      height: 20px;
    }
    
    .subscription-header {
      text-align: center;
      margin-bottom: var(--space-8, 32px);
    }
    
    .subscription-eyebrow {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-2, 8px);
    }
    
    .subscription-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 2rem;
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-2, 8px);
    }
    
    .subscription-subtitle {
      font-size: 1.125rem;
      color: var(--color-text-secondary, #5a5048);
      margin: 0;
      max-width: 500px;
      margin-inline: auto;
      line-height: 1.5;
    }
    
    .limit-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-4, 16px);
      padding: var(--space-4, 16px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-full, 9999px);
      color: var(--persona-primary, #4a6741);
    }
    
    .limit-icon svg {
      width: 100%;
      height: 100%;
    }
    
    .reset-date {
      font-size: 0.875rem;
      color: var(--color-text-muted, #7a6f63);
      margin-top: var(--space-2, 8px);
    }
    
    /* Tier Cards */
    .subscription-tiers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--space-4, 16px);
      margin-bottom: var(--space-6, 24px);
    }
    
    .tier-card {
      position: relative;
      background: var(--color-background-secondary, #faf8f5);
      border: 2px solid transparent;
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-6, 24px);
      opacity: 0;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    @media (prefers-reduced-motion: reduce) {
      .tier-card {
        opacity: 1;
        transition: border-color ${DURATION.FAST}ms;
      }
    }
    
    .tier-card:hover {
      border-color: var(--color-border-hover, #d4d0c8);
    }
    
    .tier-card--popular {
      border-color: var(--persona-primary, #4a6741);
      background: linear-gradient(135deg, 
        var(--persona-tint, rgba(74, 103, 65, 0.05)) 0%,
        var(--color-background-secondary, #faf8f5) 100%
      );
    }
    
    .tier-card--current {
      border-color: var(--persona-primary, #4a6741);
    }
    
    .tier-badge {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      padding: var(--space-1, 4px) var(--space-3, 12px);
      background: var(--persona-primary, #4a6741);
      color: white;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      gap: var(--space-1, 4px);
      white-space: nowrap;
    }
    
    .tier-badge svg {
      width: 12px;
      height: 12px;
    }
    
    .tier-badge--current {
      background: var(--color-text-secondary, #5a5048);
    }
    
    .tier-name {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px);
    }
    
    .tier-description {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #5a5048);
      margin: 0 0 var(--space-4, 16px);
    }
    
    .tier-price {
      margin-bottom: var(--space-4, 16px);
    }
    
    .tier-amount {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 2rem;
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
    }
    
    .tier-period {
      font-size: 0.875rem;
      color: var(--color-text-muted, #7a6f63);
    }
    
    .tier-features {
      list-style: none;
      padding: 0;
      margin: 0 0 var(--space-6, 24px);
    }
    
    .tier-features li {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.875rem;
      color: var(--color-text-secondary, #5a5048);
      padding: var(--space-2, 8px) 0;
      border-bottom: 1px solid var(--color-border-subtle, #e8e4de);
    }
    
    .tier-features li:last-child {
      border-bottom: none;
    }
    
    .tier-features svg {
      width: 16px;
      height: 16px;
      min-width: 16px;
      color: var(--persona-primary, #4a6741);
      flex-shrink: 0;
    }
    
    /* Tier Button - WCAG AA Focus State */
    .tier-button {
      width: 100%;
      min-height: 44px;
      padding: var(--space-3, 12px) var(--space-4, 16px);
      border: 2px solid var(--persona-primary, #4a6741);
      background: transparent;
      color: var(--persona-primary, #4a6741);
      font-size: 1rem;
      font-weight: 600;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .tier-button:hover:not(:disabled) {
      background: var(--persona-primary, #4a6741);
      color: white;
    }
    
    .tier-button:focus {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint, rgba(74, 103, 65, 0.4));
    }
    
    .tier-button:focus:not(:focus-visible) {
      box-shadow: none;
    }
    
    .tier-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .tier-button--loading {
      pointer-events: none;
    }
    
    .tier-card--popular .tier-button {
      background: var(--persona-primary, #4a6741);
      color: white;
    }
    
    .tier-card--popular .tier-button:hover:not(:disabled) {
      background: var(--persona-secondary, #3d5a35);
    }
    
    /* Spinner Animation */
    .subscription-spinner {
      width: 20px;
      height: 20px;
      animation: subscription-spin 1s linear infinite;
    }
    
    @keyframes subscription-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    @media (prefers-reduced-motion: reduce) {
      .subscription-spinner {
        animation: none;
      }
    }
    
    /* Limit Actions */
    .limit-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
      margin: var(--space-6, 24px) 0;
    }
    
    .limit-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      min-height: 48px;
      padding: var(--space-4, 16px);
      border-radius: var(--radius-lg, 12px);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .limit-button svg {
      width: 20px;
      height: 20px;
    }
    
    .limit-button--primary {
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
    }
    
    .limit-button--primary:hover {
      background: var(--persona-secondary, #3d5a35);
    }
    
    .limit-button--primary:focus {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint, rgba(74, 103, 65, 0.4));
    }
    
    .limit-button--secondary {
      background: transparent;
      color: var(--color-text-secondary, #5a5048);
      border: 2px solid var(--color-border, #d4d0c8);
    }
    
    .limit-button--secondary:hover {
      background: var(--color-background-secondary, #faf8f5);
      border-color: var(--color-text-secondary, #5a5048);
    }
    
    .limit-button--secondary:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(90, 80, 72, 0.2);
    }
    
    .subscription-footer {
      text-align: center;
      font-size: 0.875rem;
      color: var(--color-text-muted, #7a6f63);
      margin: 0;
    }
    
    /* Celebration Modal */
    .celebration-card {
      max-width: 420px;
      text-align: center;
      padding: var(--space-10, 40px);
    }
    
    .celebration-content {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .celebration-icon {
      width: 80px;
      height: 80px;
      padding: var(--space-5, 20px);
      background: linear-gradient(135deg, 
        var(--persona-tint, rgba(74, 103, 65, 0.15)) 0%,
        var(--persona-tint, rgba(74, 103, 65, 0.05)) 100%
      );
      border-radius: var(--radius-full, 9999px);
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-4, 16px);
      animation: celebration-pulse 2s ease-in-out infinite;
    }
    
    @media (prefers-reduced-motion: reduce) {
      .celebration-icon {
        animation: none;
      }
    }
    
    .celebration-icon svg {
      width: 100%;
      height: 100%;
    }
    
    .celebration-message {
      font-size: 1.125rem;
      color: var(--color-text-secondary, #5a5048);
      line-height: 1.6;
      margin: 0 0 var(--space-6, 24px);
    }
    
    .celebration-tier {
      margin-bottom: var(--space-6, 24px);
    }
    
    .celebration-tier .tier-badge {
      position: relative;
      top: auto;
      left: auto;
      transform: none;
      display: inline-flex;
      background: var(--persona-primary, #4a6741);
      color: white;
      padding: var(--space-2, 8px) var(--space-4, 16px);
      border-radius: var(--radius-full, 9999px);
      font-size: 0.875rem;
      font-weight: 600;
    }
    
    .celebration-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      min-height: 48px;
      padding: var(--space-4, 16px) var(--space-8, 32px);
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .celebration-button:hover {
      background: var(--persona-secondary, #3d5a35);
      transform: translateY(-2px);
    }
    
    .celebration-button:focus {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint, rgba(74, 103, 65, 0.4));
    }
    
    @media (prefers-reduced-motion: reduce) {
      .celebration-button:hover {
        transform: none;
      }
    }
    
    .celebration-button svg {
      width: 20px;
      height: 20px;
    }
    
    @keyframes celebration-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    /* Usage Indicator */
    .usage-indicator {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-full, 9999px);
      padding: var(--space-3, 12px) var(--space-5, 20px);
      box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
      z-index: var(--z-toast, 1100);
    }
    
    .usage-indicator:hover {
      transform: translateX(-50%) translateY(-2px);
      box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
    }
    
    .usage-indicator--hidden {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
      pointer-events: none;
    }
    
    .usage-indicator__content {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
    }
    
    .usage-indicator__text {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
      white-space: nowrap;
    }
    
    .usage-indicator__bar {
      width: 60px;
      height: 6px;
      background: var(--color-background-tertiary, #e8e4de);
      border-radius: var(--radius-full, 9999px);
      overflow: hidden;
    }
    
    .usage-indicator__fill {
      height: 100%;
      background: var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    /* Dark Theme */
    @media (prefers-color-scheme: dark) {
      .subscription-backdrop {
        background: rgba(28, 24, 20, 0.85);
      }
      
      .subscription-card {
        background: var(--color-background-elevated, #3a3330);
      }
      
      .tier-card {
        background: var(--color-background-secondary, #4a4540);
      }
      
      .tier-features li {
        border-color: var(--color-border-subtle, #5a5550);
      }
      
      .subscription-title,
      .tier-name,
      .tier-amount {
        color: var(--color-text-primary, #faf6f0);
      }
      
      .subscription-subtitle,
      .tier-description,
      .tier-features li,
      .celebration-message {
        color: var(--color-text-secondary, #e8e2da);
      }
      
      .subscription-eyebrow {
        color: var(--persona-primary, #6a8a61);
      }
      
      .subscription-close {
        background: var(--color-background-secondary, #4a4540);
        color: var(--color-text-secondary, #e8e2da);
      }
      
      .subscription-close:hover {
        background: var(--color-background-tertiary, #5a5550);
      }
      
      .usage-indicator {
        background: var(--color-background-elevated, #3a3330);
      }
      
      .usage-indicator__text {
        color: var(--color-text-primary, #faf6f0);
      }
      
      .usage-indicator__bar {
        background: var(--color-background-tertiary, #5a5550);
      }
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .subscription-card {
        padding: var(--space-5, 20px);
        margin: var(--space-4, 16px);
        max-height: 85vh;
      }
      
      .subscription-tiers {
        grid-template-columns: 1fr;
      }
      
      .subscription-title {
        font-size: 1.5rem;
      }
      
      .tier-amount {
        font-size: 1.5rem;
      }
      
      .celebration-card {
        padding: var(--space-6, 24px);
      }
    }
    
    /* High Contrast Mode */
    @media (prefers-contrast: high) {
      .tier-card {
        border-width: 3px;
      }
      
      .tier-button {
        border-width: 3px;
      }
      
      .subscription-close:focus,
      .tier-button:focus,
      .limit-button:focus,
      .celebration-button:focus {
        box-shadow: 0 0 0 4px currentColor;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// USAGE INDICATOR
// ============================================================================

export function showUsageIndicator(): void {
  if (!status || status.tier !== 'free') return;

  const existing = document.querySelector('.usage-indicator');
  if (existing) existing.remove();

  // Get remaining from nested usage structure
  const remaining = status.usage?.conversationsRemaining ?? status.conversationsRemaining ?? 5;
  const total = 5; // Free tier is 5 conversations
  const percentage = (remaining / total) * 100;

  const indicator = document.createElement('button');
  indicator.className = 'usage-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.setAttribute(
    'aria-label',
    `${remaining} conversation${remaining !== 1 ? 's' : ''} remaining this month. Click to view subscription options.`
  );

  indicator.innerHTML = `
    <div class="usage-indicator__content">
      <span class="usage-indicator__text" aria-hidden="true">${remaining} conversation${remaining !== 1 ? 's' : ''} left</span>
      <div class="usage-indicator__bar" aria-hidden="true">
        <div class="usage-indicator__fill" style="width: ${percentage}%"></div>
      </div>
    </div>
  `;

  indicator.addEventListener('click', () => showUpgradeModal());
  indicator.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showUpgradeModal();
    }
  });

  document.body.appendChild(indicator);

  // Auto-hide after 5 seconds
  trackedTimeout(() => {
    indicator.classList.add('usage-indicator--hidden');
    trackedTimeout(() => indicator.remove(), getAnimationDuration(DURATION.SLOW));
  }, 5000);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const subscriptionUI = {
  init: initSubscriptionUI,
  showUpgrade: showUpgradeModal,
  showLimit: showLimitReachedModal,
  hide: hideModal,
  loadStatus,
  getStatus,
  setOnUpgrade,
  showUsageIndicator,
};
