/**
 * Support Ferni - Founders Fund Experience
 *
 * Philosophy: "We're not selling a product. We're inviting you to build something with us."
 *
 * Design Philosophy:
 * - "Chip in" not "subscribe"
 * - Features are thank-you perks, not unlocks
 * - Free is celebrated, not a limitation
 * - No pressure, no guilt, no urgency
 *
 * WCAG AA Compliant:
 * - Full keyboard navigation
 * - ARIA labels and roles
 * - 4.5:1 contrast ratio minimum
 * - Respects prefers-reduced-motion
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { appState } from '../state/app.state.js';
import { openBillingPortal } from '../utils/billing.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { openFoundersJourney } from './founders-journey.ui.js';
import { getStatus, loadStatus, type SubscriptionStatus } from './subscription.ui.js';
import { toast } from './toast.ui.js';

const log = createLogger('SupportFerniUI');
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// ICONS (Lucide-style, brand compliant)
// ============================================================================

const ICONS = {
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  seed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V12"/><path d="M12 12c0-3-2.5-5-6-5 0 3 2 6 6 6Z"/><path d="M12 8c0-3 2.5-5 6-5 0 3-2 6-6 6"/>
  </svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/>
  </svg>`,
  infinity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/>
  </svg>`,
  creditCard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>
  </svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  loader: `<svg class="support-ferni-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>`,
  externalLink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>
  </svg>`,
  compass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
  </svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>`,
};

// ============================================================================
// STATE
// ============================================================================

let overlay: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let _isLoading = false;
let selectedTipAmount = 0;
let previouslyFocusedElement: HTMLElement | null = null;

// ============================================================================
// TIER DATA
// ============================================================================

interface TierInfo {
  id: 'free' | 'friend' | 'partner';
  name: string;
  tagline: string;
  price: string;
  features: string[];
}

const TIERS: TierInfo[] = [
  {
    id: 'free',
    name: 'Community',
    tagline: 'Ferni is free. Really free.',
    price: 'Free forever',
    features: [
      'Unlimited conversations with Ferni',
      '7-minute heart-to-hearts',
      'Full memory — I remember everything',
    ],
  },
  {
    id: 'friend',
    name: 'Founding Member',
    tagline: 'Chip in. Help us build this.',
    price: '$10/mo',
    features: ['Unlimited time (our thank you)', 'Meet the whole team', 'Your name on Founders Wall'],
  },
  {
    id: 'partner',
    name: 'Founding Patron',
    tagline: "You're shaping what we become",
    price: '$20/mo',
    features: ['Everything above, plus:', 'Early access to features', 'Family sharing'],
  },
];

const TIP_AMOUNTS = [
  { amount: 5, label: '$5', impact: 'Plant a seed' },
  { amount: 10, label: '$10', impact: 'Sponsor a conversation' },
  { amount: 25, label: '$25', impact: 'Help someone get started' },
  { amount: 50, label: '$50', impact: 'Support the mission' },
];

// ============================================================================
// ACCESSIBILITY
// ============================================================================

function saveFocus(): void {
  previouslyFocusedElement = document.activeElement as HTMLElement;
}

function restoreFocus(): void {
  previouslyFocusedElement?.focus();
  previouslyFocusedElement = null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ============================================================================
// MAIN API
// ============================================================================

export async function openSupportFerni(): Promise<void> {
  log.info('Opening Support Ferni modal');
  saveFocus();
  log.info('Focus saved');
  
  injectStyles();
  log.info('Styles injected');
  
  cleanupOrphanedElements();
  log.info('Orphaned elements cleaned up');

  // Load subscription status
  log.info('Loading subscription status...');
  await loadStatus();
  const status = getStatus();
  log.info('Subscription status loaded', { tier: status?.tier });

  log.info('Creating overlay...');
  overlay = createOverlay(status);
  log.info('Overlay created', { hasOverlay: !!overlay });
  
  document.body.appendChild(overlay);
  log.info('Overlay appended to body');

  // Animate in
  requestAnimationFrame(() => {
    log.info('requestAnimationFrame callback executing');
    overlay?.classList.add('support-ferni-overlay--open');
    log.info('Open class added to overlay');

    const closeBtn = overlay?.querySelector('.support-ferni-close') as HTMLElement;
    closeBtn?.focus();
    log.info('Support Ferni modal fully opened');
  });
}

function closeSupportFerni(): void {
  if (!overlay) return;

  overlay.classList.remove('support-ferni-overlay--open');

  trackedTimeout(
    () => {
      overlay?.remove();
      overlay = null;
      restoreFocus();
    },
    prefersReducedMotion() ? 0 : DURATION.SLOW
  );
}

export { closeSupportFerni };

// ============================================================================
// CREATE OVERLAY
// ============================================================================

function createOverlay(status: SubscriptionStatus | null): HTMLElement {
  const container = document.createElement('div');
  container.className = 'support-ferni-overlay';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'support-ferni-title');

  const currentTier = status?.tier || 'free';
  const tierInfo = TIERS.find((t) => t.id === currentTier) || TIERS[0];

  container.innerHTML = `
    <div class="support-ferni-backdrop" aria-hidden="true"></div>
    <div class="support-ferni-card">
      <button class="support-ferni-close" aria-label="${t('common.close')}">${ICONS.close}</button>
      
      <header class="support-ferni-header">
        <div class="support-ferni-icon">${ICONS.heart}</div>
        <span class="support-ferni-eyebrow">${t('support.eyebrow')}</span>
        <h2 id="support-ferni-title" class="support-ferni-title">${t('support.title')}</h2>
        <p class="support-ferni-subtitle">${t('support.subtitle')}</p>
      </header>

      <div class="support-ferni-content">
        <!-- Vision Journey Link -->
        <button class="support-ferni-journey-btn" data-action="see-vision">
          ${ICONS.compass}
          <span>${t('support.seeVision')}</span>
          ${ICONS.arrowRight}
        </button>

        <!-- Cost Transparency Section -->
        ${renderCostTransparency()}

        <!-- Current Relationship Status -->
        <section class="support-ferni-section support-ferni-current">
          <div class="support-ferni-current-tier">
            <div class="support-ferni-tier-badge ${currentTier !== 'free' ? 'support-ferni-tier-badge--active' : ''}">
              ${currentTier === 'free' ? ICONS.heart : ICONS.sparkles}
              <span>${tierInfo.name}</span>
            </div>
            <p class="support-ferni-tier-tagline">${tierInfo.tagline}</p>
          </div>
        </section>

        <!-- Ways to Grow Together -->
        ${currentTier === 'free' ? renderUpgradeOptions(currentTier) : ''}

        <!-- Manage Your Support -->
        ${currentTier !== 'free' ? renderManageSection() : ''}

        <!-- Plant a Seed (Tipping) -->
        ${renderPlantASeed()}

        <!-- Billing Link -->
        ${currentTier !== 'free' ? renderBillingLink() : ''}
      </div>

      <footer class="support-ferni-footer">
        <p>${t('support.footer')}</p>
      </footer>
    </div>
  `;

  // Bind events
  container.querySelector('.support-ferni-backdrop')?.addEventListener('click', closeSupportFerni);
  container.querySelector('.support-ferni-close')?.addEventListener('click', closeSupportFerni);

  // Escape key closes
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSupportFerni();
  });

  // Upgrade buttons
  container.querySelectorAll('[data-upgrade-tier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = (btn as HTMLElement).dataset.upgradeTier;
      if (tier) void handleUpgrade(tier);
    });
  });

  // Tip amount buttons
  container.querySelectorAll('[data-tip-amount]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const amount = parseInt((btn as HTMLElement).dataset.tipAmount || '0', 10);
      selectTipAmount(container, amount);
    });
  });

  // Custom tip input
  const customInput = container.querySelector('.support-ferni-tip-custom') as HTMLInputElement;
  customInput?.addEventListener('input', () => {
    const amount = parseInt(customInput.value, 10) || 0;
    selectTipAmount(container, amount, true);
  });

  // Plant seed button
  const plantBtn = container.querySelector('[data-action="plant-seed"]');
  plantBtn?.addEventListener('click', () => void handlePlantSeed());

  // Billing portal link
  const billingLink = container.querySelector('[data-action="billing"]');
  billingLink?.addEventListener('click', () => void handleOpenBillingPortal());

  // Vision journey button
  const visionBtn = container.querySelector('[data-action="see-vision"]');
  visionBtn?.addEventListener('click', () => {
    closeSupportFerni();
    void openFoundersJourney();
  });

  return container;
}

// ============================================================================
// RENDER HELPERS
// ============================================================================

/**
 * Render the cost transparency section.
 * Shows users the real cost of running Ferni so they understand the value of contributions.
 */
function renderCostTransparency(): string {
  return `
    <section class="support-ferni-section support-ferni-cost-transparency">
      <h3 class="support-ferni-section-title">
        ${ICONS.infinity}
        <span>${t('support.costTransparency.title')}</span>
      </h3>
      <div class="support-ferni-cost-breakdown">
        <p class="support-ferni-cost-intro">
          ${t('support.costTransparency.intro')}
        </p>
        <div class="support-ferni-cost-items">
          <div class="support-ferni-cost-item" style="animation-delay: 0ms">
            <span class="support-ferni-cost-label">${t('support.costTransparency.thinking')}</span>
            <span class="support-ferni-cost-value">~$0.03</span>
          </div>
          <div class="support-ferni-cost-item" style="animation-delay: 80ms">
            <span class="support-ferni-cost-label">${t('support.costTransparency.voice')}</span>
            <span class="support-ferni-cost-value">~$0.02</span>
          </div>
          <div class="support-ferni-cost-item" style="animation-delay: 160ms">
            <span class="support-ferni-cost-label">${t('support.costTransparency.infrastructure')}</span>
            <span class="support-ferni-cost-value">~$0.01</span>
          </div>
          <div class="support-ferni-cost-item support-ferni-cost-total" style="animation-delay: 280ms">
            <span class="support-ferni-cost-label">${t('support.costTransparency.total')}</span>
            <span class="support-ferni-cost-value">~$0.06</span>
          </div>
        </div>
        <p class="support-ferni-cost-note">
          ${t('support.costTransparency.note')}
        </p>
      </div>
    </section>
  `;
}

function renderUpgradeOptions(currentTier: string): string {
  const upgradeTiers = TIERS.filter((t) => t.id !== 'free' && t.id !== currentTier);

  return `
    <section class="support-ferni-section support-ferni-upgrade">
      <h3 class="support-ferni-section-title">${t('support.growTogether')}</h3>
      <div class="support-ferni-tiers">
        ${upgradeTiers
          .map(
            (tier, index) => `
          <button aria-label="Choose ${tier.name}" class="support-ferni-tier-card ${tier.id === 'friend' ? 'support-ferni-tier-card--highlighted' : ''}" data-upgrade-tier="${tier.id}" style="animation-delay: ${index * 100}ms">
            <div class="support-ferni-tier-header">
              <span class="support-ferni-tier-name">${tier.name}</span>
              <span class="support-ferni-tier-price">${tier.price}</span>
            </div>
            <ul class="support-ferni-tier-features">
              ${tier.features.map((f) => `<li>${ICONS.check} ${f}</li>`).join('')}
            </ul>
          </button>
        `
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderManageSection(): string {
  return `
    <section class="support-ferni-section support-ferni-manage">
      <div class="support-ferni-manage-status">
        <div class="support-ferni-manage-icon">${ICONS.sparkles}</div>
        <div class="support-ferni-manage-text">
          <span class="support-ferni-manage-title">${t('support.thankYouSupporter')}</span>
          <span class="support-ferni-manage-subtitle">${t('support.yourSupport')}</span>
        </div>
      </div>
    </section>
  `;
}

function renderPlantASeed(): string {
  return `
    <section class="support-ferni-section support-ferni-tip">
      <h3 class="support-ferni-section-title">
        <span class="support-ferni-tip-icon">${ICONS.seed}</span>
        ${t('support.plantASeed')}
      </h3>
      <p class="support-ferni-tip-desc">${t('support.plantDesc')}</p>
      
      <div class="support-ferni-tip-amounts">
        ${TIP_AMOUNTS.map(
          (tip) => `
          <button class="support-ferni-tip-btn" data-tip-amount="${tip.amount}">
            <span class="support-ferni-tip-label">${tip.label}</span>
            <span class="support-ferni-tip-impact">${tip.impact}</span>
          </button>
        `
        ).join('')}
      </div>
      
      <div class="support-ferni-tip-custom-wrap">
        <span class="support-ferni-tip-custom-prefix">$</span>
        <input 
          type="number" 
          class="support-ferni-tip-custom" 
          placeholder="${t('placeholders.customAmount')}"
          min="1"
          max="999"
          aria-label="${t('placeholders.customAmount')}"
        />
      </div>
      
      <button class="support-ferni-plant-btn" data-action="plant-seed" disabled>
        ${ICONS.seed}
        <span>${t('support.plantButton')}</span>
      </button>
    </section>
  `;
}

function renderBillingLink(): string {
  return `
    <section class="support-ferni-section support-ferni-billing">
      <button aria-label="${t('accessibility.edit')}" class="support-ferni-billing-btn" data-action="billing">
        ${ICONS.creditCard}
        <span>${t('support.manageBilling')}</span>
        ${ICONS.externalLink}
      </button>
    </section>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function selectTipAmount(container: HTMLElement, amount: number, isCustom = false): void {
  selectedTipAmount = amount;

  // Update button states
  container.querySelectorAll('.support-ferni-tip-btn').forEach((btn) => {
    const btnAmount = parseInt((btn as HTMLElement).dataset.tipAmount || '0', 10);
    btn.classList.toggle('support-ferni-tip-btn--selected', btnAmount === amount && !isCustom);
  });

  // Clear custom input if preset selected
  if (!isCustom) {
    const customInput = container.querySelector('.support-ferni-tip-custom') as HTMLInputElement;
    if (customInput) customInput.value = '';
  }

  // Enable/disable plant button
  const plantBtn = container.querySelector('[data-action="plant-seed"]') as HTMLButtonElement;
  if (plantBtn) {
    plantBtn.disabled = amount <= 0;
  }
}

async function handleUpgrade(tier: string): Promise<void> {
  const deviceId = appState.getState().deviceId;
  if (!deviceId) {
    toast.error("Hmm, that didn't work. Try again?");
    return;
  }

  _isLoading = true;
  updateLoadingState(true);

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
      window.location.href = result.url;
    } else {
      toast.error("That didn't go through. Try again?");
    }
  } catch (error) {
    log.error('Upgrade failed:', error);
    toast.error("Hmm, that didn't work. Try again?");
  } finally {
    _isLoading = false;
    updateLoadingState(false);
  }
}

async function handlePlantSeed(): Promise<void> {
  if (selectedTipAmount <= 0) return;

  const deviceId = appState.getState().deviceId;
  if (!deviceId) {
    toast.error("Hmm, that didn't work. Try again?");
    return;
  }

  _isLoading = true;
  updateLoadingState(true);

  try {
    const response = await fetch('/api/garden/plant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: deviceId,
        amountInCents: selectedTipAmount * 100,
        successUrl: window.location.origin + '?tip=success',
        cancelUrl: window.location.origin + '?tip=cancel',
      }),
    });

    const result = await response.json();

    if (response.ok && result.url) {
      window.location.href = result.url;
    } else {
      toast.error("Hmm, that didn't work. Try again?");
    }
  } catch (error) {
    log.error('Plant seed failed:', error);
    toast.error("Hmm, that didn't work. Try again?");
  } finally {
    _isLoading = false;
    updateLoadingState(false);
  }
}

async function handleOpenBillingPortal(): Promise<void> {
  const deviceId = appState.getState().deviceId;
  if (!deviceId) return;

  // Use the consolidated billing utility (opens in new tab by default)
  await openBillingPortal(deviceId, { openInNewTab: true });
}

function updateLoadingState(loading: boolean): void {
  const plantBtn = overlay?.querySelector('[data-action="plant-seed"]');
  const upgradeButtons = overlay?.querySelectorAll('[data-upgrade-tier]');

  if (loading) {
    plantBtn?.setAttribute('disabled', 'true');
    upgradeButtons?.forEach((btn) => btn.setAttribute('disabled', 'true'));
  } else {
    if (selectedTipAmount > 0) {
      plantBtn?.removeAttribute('disabled');
    }
    upgradeButtons?.forEach((btn) => btn.removeAttribute('disabled'));
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.support-ferni-overlay').forEach((el) => el.remove());
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('support-ferni-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'support-ferni-styles';
  styleElement.textContent = `
    /* Keyframes - Pixar-inspired animations */
    @keyframes support-ferni-card-enter {
      0% {
        opacity: 0;
        transform: scale(0.94) translateY(12px);
      }
      40% {
        opacity: 1;
        transform: scale(1.02) translateY(-4px);
      }
      100% {
        transform: scale(1) translateY(0);
      }
    }

    @keyframes support-ferni-item-reveal {
      0% {
        opacity: 0;
        transform: translateY(8px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes support-ferni-icon-breathe {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.03);
      }
    }

    /* Overlay */
    .support-ferni-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 9999);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.MODERATE}ms ${EASING.GENTLE};
    }

    .support-ferni-overlay--open {
      opacity: 1;
      pointer-events: auto;
    }

    .support-ferni-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    /* Card with Pixar-inspired entry */
    .support-ferni-card {
      position: relative;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      max-width: clamp(364px, 90vw, 520px);
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      padding: var(--space-8, 32px);
      transform: scale(0.94) translateY(12px);
      opacity: 0;
    }

    .support-ferni-overlay--open .support-ferni-card {
      opacity: 1; /* Fallback in case animation fails */
      transform: scale(1) translateY(0); /* Fallback in case animation fails */
      animation: support-ferni-card-enter 500ms ${EASING.SPRING} forwards;
    }

    /* Subtle paper texture overlay */
    .support-ferni-card::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      opacity: 0.018;
      mix-blend-mode: overlay;
      pointer-events: none;
    }

    .support-ferni-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 44px;
      height: 44px;
      border: none;
      background: var(--color-background-secondary, #f5f3f0);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5a5048);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .support-ferni-close:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .support-ferni-close:focus {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .support-ferni-close svg {
      width: 20px;
      height: 20px;
    }

    /* Header */
    .support-ferni-header {
      text-align: center;
      margin-bottom: var(--space-6, 24px);
    }

    .support-ferni-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-tint), transparent);
      border-radius: var(--radius-full);
      color: var(--persona-primary, #4a6741);
      animation: support-ferni-icon-breathe 4s ease-in-out infinite;
    }

    .support-ferni-icon svg {
      width: 100%;
      height: 100%;
    }

    .support-ferni-eyebrow {
      display: block;
      font-size: 0.8125rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-2, 8px);
      opacity: 0.85;
    }

    .support-ferni-title {
      font-family: var(--font-display);
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
      letter-spacing: -0.01em;
    }

    .support-ferni-subtitle {
      font-size: 1rem;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.65;
    }

    /* Sections */
    .support-ferni-section {
      margin-bottom: var(--space-6, 24px);
    }

    .support-ferni-section-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-3, 12px);
    }

    .support-ferni-tip-icon {
      width: 20px;
      height: 20px;
      color: var(--persona-text);
    }

    .support-ferni-tip-icon svg {
      width: 100%;
      height: 100%;
    }

    /* Current Tier Badge */
    .support-ferni-current {
      text-align: center;
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-xl, 16px);
    }

    .support-ferni-tier-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-4, 16px);
      background: var(--color-background-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-full);
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .support-ferni-tier-badge--active {
      background: linear-gradient(135deg, var(--persona-primary), var(--persona-secondary));
      color: white;
      border-color: transparent;
    }

    .support-ferni-tier-badge svg {
      width: 18px;
      height: 18px;
    }

    .support-ferni-tier-tagline {
      font-size: 0.875rem;
      color: var(--color-text-muted);
      margin: var(--space-2, 8px) 0 0;
    }

    /* Upgrade Tier Cards */
    .support-ferni-tiers {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .support-ferni-tier-card {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-xl, 16px);
      cursor: pointer;
      text-align: left;
      opacity: 0;
      animation: support-ferni-item-reveal 400ms ${EASING.GENTLE} forwards;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .support-ferni-tier-card:hover {
      border-color: var(--persona-primary);
      background: var(--color-background-elevated);
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(74, 103, 65, 0.1);
    }

    .support-ferni-tier-card:active {
      transform: scale(0.98) translateY(0);
    }

    .support-ferni-tier-card:focus {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    /* Highlighted tier - subtle emphasis without badge */
    .support-ferni-tier-card--highlighted {
      background: linear-gradient(135deg, var(--persona-tint), rgba(74, 103, 65, 0.03));
      border-color: rgba(74, 103, 65, 0.15);
    }

    .support-ferni-tier-card--highlighted:hover {
      border-color: var(--persona-primary);
      background: linear-gradient(135deg, var(--persona-tint), rgba(74, 103, 65, 0.08));
    }

    .support-ferni-tier-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-3, 12px);
    }

    .support-ferni-tier-name {
      font-family: var(--font-display);
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .support-ferni-tier-price {
      font-size: 1rem;
      font-weight: 600;
      color: var(--persona-text);
    }

    .support-ferni-tier-features {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .support-ferni-tier-features li {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }

    .support-ferni-tier-features svg {
      width: 16px;
      height: 16px;
      color: var(--persona-text);
      flex-shrink: 0;
    }

    /* Manage Section (for subscribers) */
    .support-ferni-manage-status {
      display: flex;
      align-items: center;
      gap: var(--space-4, 16px);
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-tint), transparent);
      border-radius: var(--radius-xl, 16px);
    }

    .support-ferni-manage-icon {
      width: 48px;
      height: 48px;
      padding: var(--space-3, 12px);
      background: var(--persona-primary);
      border-radius: var(--radius-full);
      color: white;
    }

    .support-ferni-manage-icon svg {
      width: 100%;
      height: 100%;
    }

    .support-ferni-manage-text {
      display: flex;
      flex-direction: column;
    }

    .support-ferni-manage-title {
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .support-ferni-manage-subtitle {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }

    /* Cost Transparency Section */
    .support-ferni-cost-transparency {
      background: var(--color-background-secondary);
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-4, 16px);
    }

    .support-ferni-cost-transparency .support-ferni-section-title {
      margin-bottom: var(--space-3, 12px);
    }

    .support-ferni-cost-transparency .support-ferni-section-title svg {
      width: 20px;
      height: 20px;
      color: var(--persona-text);
    }

    .support-ferni-cost-intro {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      line-height: 1.5;
      margin: 0 0 var(--space-3, 12px);
    }

    .support-ferni-cost-items {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .support-ferni-cost-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--color-background-elevated);
      border-radius: var(--radius-md, 8px);
      opacity: 0;
      animation: support-ferni-item-reveal 350ms ${EASING.GENTLE} forwards;
    }

    .support-ferni-cost-label {
      font-size: 0.9rem;
      color: var(--color-text-secondary);
    }

    .support-ferni-cost-value {
      font-family: var(--font-mono, monospace);
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .support-ferni-cost-total {
      background: linear-gradient(135deg, var(--persona-tint), rgba(74, 103, 65, 0.05));
      margin-top: var(--space-2, 8px);
    }

    .support-ferni-cost-total .support-ferni-cost-label {
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .support-ferni-cost-total .support-ferni-cost-value {
      color: var(--persona-primary);
      font-size: 1rem;
      font-weight: 700;
    }

    .support-ferni-cost-note {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      line-height: 1.6;
      margin: var(--space-3, 12px) 0 0;
    }

    /* Tip Section */
    .support-ferni-tip-desc {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-4, 16px);
      line-height: 1.5;
    }

    .support-ferni-tip-amounts {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .support-ferni-tip-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-3, 12px);
      background: var(--color-background-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.SPRING};
    }

    .support-ferni-tip-btn:hover {
      background: var(--color-background-elevated);
      border-color: var(--persona-primary);
      transform: translateY(-2px);
    }

    .support-ferni-tip-btn:active {
      transform: scale(0.96) translateY(0);
    }

    .support-ferni-tip-btn:focus {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .support-ferni-tip-btn--selected {
      background: var(--persona-tint);
      border-color: var(--persona-primary);
    }

    .support-ferni-tip-label {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .support-ferni-tip-impact {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-top: var(--space-1, 4px);
    }

    .support-ferni-tip-custom-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg, 12px);
      margin-bottom: var(--space-4, 16px);
    }

    .support-ferni-tip-custom-prefix {
      font-size: 1rem;
      font-weight: 500;
      color: var(--color-text-muted);
    }

    .support-ferni-tip-custom {
      flex: 1;
      border: none;
      background: transparent;
      font-size: 1rem;
      color: var(--color-text-primary);
      outline: none;
    }

    .support-ferni-tip-custom::placeholder {
      color: var(--color-text-muted);
    }

    .support-ferni-plant-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      width: 100%;
      padding: var(--space-4, 16px);
      background: var(--persona-primary);
      color: white;
      border: none;
      border-radius: var(--radius-full, 100px);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.SPRING};
    }

    .support-ferni-plant-btn:hover:not(:disabled) {
      background: var(--persona-secondary);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(74, 103, 65, 0.25);
    }

    .support-ferni-plant-btn:active:not(:disabled) {
      transform: scale(0.97) translateY(0);
      box-shadow: 0 2px 8px rgba(74, 103, 65, 0.2);
    }

    .support-ferni-plant-btn:focus {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .support-ferni-plant-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .support-ferni-plant-btn svg {
      width: 20px;
      height: 20px;
      transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
    }

    .support-ferni-plant-btn:hover:not(:disabled) svg {
      transform: rotate(-10deg) scale(1.1);
    }

    /* Billing Link */
    .support-ferni-billing-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      width: 100%;
      padding: var(--space-3, 12px);
      background: transparent;
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .support-ferni-billing-btn:hover {
      background: var(--color-background-secondary);
      color: var(--color-text-primary);
      border-color: var(--color-border-strong);
    }

    .support-ferni-billing-btn:focus {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .support-ferni-billing-btn svg {
      width: 16px;
      height: 16px;
    }

    .support-ferni-billing-btn svg:last-child {
      width: 14px;
      height: 14px;
      opacity: 0.6;
    }

    /* Vision Journey Button */
    .support-ferni-journey-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      width: 100%;
      padding: var(--space-4, 16px);
      margin-bottom: var(--space-6, 24px);
      background: linear-gradient(135deg, rgba(74, 103, 65, 0.06), transparent);
      border: 1.5px solid rgba(74, 103, 65, 0.2);
      border-radius: var(--radius-xl, 16px);
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--persona-primary);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.SPRING};
    }

    .support-ferni-journey-btn:hover {
      background: var(--persona-tint);
      border-color: var(--persona-primary);
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(74, 103, 65, 0.12);
    }

    .support-ferni-journey-btn:active {
      transform: scale(0.98) translateY(0);
    }

    .support-ferni-journey-btn:focus {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .support-ferni-journey-btn svg {
      width: 20px;
      height: 20px;
      transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
    }

    .support-ferni-journey-btn:hover svg:last-child {
      transform: translateX(3px);
    }

    .support-ferni-journey-btn svg:last-child {
      width: 16px;
      height: 16px;
      opacity: 0.7;
    }

    /* Footer */
    .support-ferni-footer {
      text-align: center;
      padding-top: var(--space-4, 16px);
      border-top: 1px solid var(--color-border-subtle);
    }

    .support-ferni-footer p {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin: 0;
    }

    /* Spinner */
    .support-ferni-spinner {
      width: 20px;
      height: 20px;
      animation: support-ferni-spin 1s linear infinite;
    }

    @keyframes support-ferni-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Reduced motion - disable all animations for accessibility */
    @media (prefers-reduced-motion: reduce) {
      .support-ferni-overlay,
      .support-ferni-card,
      .support-ferni-tier-card,
      .support-ferni-cost-item,
      .support-ferni-tip-btn,
      .support-ferni-plant-btn,
      .support-ferni-journey-btn {
        animation: none !important;
        transition: opacity 0ms, background 0ms, border-color 0ms !important;
        transform: none !important;
        opacity: 1 !important;
      }
      .support-ferni-spinner,
      .support-ferni-icon {
        animation: none !important;
      }
    }

    /* Dark theme */
    [data-theme="midnight"] .support-ferni-card {
      background: var(--color-background-elevated);
    }

    [data-theme="midnight"] .support-ferni-close {
      background: var(--color-background-secondary);
      color: var(--color-text-secondary);
    }

    [data-theme="midnight"] .support-ferni-tier-card,
    [data-theme="midnight"] .support-ferni-tip-btn {
      background: var(--color-background-secondary);
    }

    /* Responsive */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .support-ferni-card {
        padding: var(--space-5, 20px);
        max-height: 85vh;
      }

      .support-ferni-title {
        font-size: 1.5rem;
      }

      .support-ferni-tip-amounts {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `;
  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Support Ferni UI event listeners
 */
export function initSupportFerniUI(): void {
  // Listen for events to open support modal (from founders journey CTA)
  document.addEventListener('ferni:open-support', () => {
    void openSupportFerni();
  });

  log.debug('Support Ferni UI initialized');
}

export const supportFerniUI = {
  open: openSupportFerni,
  close: closeSupportFerni,
  init: initSupportFerniUI,
};

export default supportFerniUI;
