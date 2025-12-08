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
 */

import { DURATION, EASING, STAGGER } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { appState } from '../state/app.state.js';
import { toast } from './toast.ui.js';

const log = createLogger('SubscriptionUI');

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
  enabled: boolean;
  tier: 'free' | 'friend' | 'partner';
  status: string;
  usage: {
    period: string;
    conversationCount: number;
    minutesTalked: number;
  };
  limits: {
    conversationsPerMonth: number | null;
    minutesPerMonth: number | null;
  };
  canStartConversation: boolean;
  conversationsRemaining: number | null;
  approaching: boolean;
  upgradePrompt: string | null;
}

export interface SubscriptionConfig {
  enabled: boolean;
  stripePublishableKey: string | null;
  tiers: SubscriptionTier[];
}

// ============================================================================
// ICONS (Lucide-style, brand compliant)
// ============================================================================

const ICONS = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  infinity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/></svg>',
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let config: SubscriptionConfig | null = null;
let status: SubscriptionStatus | null = null;
let onUpgradeCallback: ((tier: string) => void) | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSubscriptionUI(): void {
  cleanupOrphanedElements();
  injectStyles();
  void loadConfig();
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.subscription-modal').forEach((el) => el.remove());
  document.querySelectorAll('#subscription-styles').forEach((el) => el.remove());
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

export async function loadStatus(): Promise<SubscriptionStatus | null> {
  const deviceId = appState.getState().deviceId;
  if (!deviceId) return null;

  try {
    const response = await fetch(`/subscription/status?device_id=${encodeURIComponent(deviceId)}`);
    if (response.ok) {
      status = await response.json();
      log.debug('Subscription status loaded:', status);
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
  if (modal) {
    modal.remove();
  }

  modal = createModal(prompt);
  document.body.appendChild(modal);

  // Animate in
  requestAnimationFrame(() => {
    modal?.classList.add('subscription-modal--visible');
    animateModalIn();
  });
}

export function hideModal(): void {
  if (!modal) return;

  modal.classList.remove('subscription-modal--visible');

  setTimeout(() => {
    modal?.remove();
    modal = null;
  }, DURATION.SLOW);
}

export function showLimitReachedModal(upgradePrompt: string, resetDate?: string): void {
  if (modal) {
    modal.remove();
  }

  modal = createLimitModal(upgradePrompt, resetDate);
  document.body.appendChild(modal);

  requestAnimationFrame(() => {
    modal?.classList.add('subscription-modal--visible');
    animateModalIn();
  });
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

  const tiers = config?.tiers || getDefaultTiers();

  container.innerHTML = `
    <div class="subscription-backdrop"></div>
    <div class="subscription-card">
      <button class="subscription-close" aria-label="Close">
        ${ICONS.close}
      </button>
      
      <div class="subscription-header">
        <span class="subscription-eyebrow">YOUR JOURNEY</span>
        <h2 id="subscription-title" class="subscription-title">
          ${prompt ? 'Keep Growing Together' : "Let's Go Deeper"}
        </h2>
        <p class="subscription-subtitle">
          ${prompt || 'Choose how you want our friendship to grow.'}
        </p>
      </div>
      
      <div class="subscription-tiers">
        ${tiers.map((tier, index) => createTierCard(tier, index)).join('')}
      </div>
      
      <p class="subscription-footer">
        You can change or cancel anytime. No hard feelings.
      </p>
    </div>
  `;

  // Event listeners
  const backdrop = container.querySelector('.subscription-backdrop');
  backdrop?.addEventListener('click', hideModal);

  const closeBtn = container.querySelector('.subscription-close');
  closeBtn?.addEventListener('click', hideModal);

  // Tier buttons
  container.querySelectorAll('.tier-button').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const tier = (e.currentTarget as HTMLElement).dataset.tier;
      if (tier && tier !== 'free') {
        handleUpgrade(tier);
      }
    });
  });

  return container;
}

function createLimitModal(prompt: string, resetDate?: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'subscription-modal';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');

  container.innerHTML = `
    <div class="subscription-backdrop"></div>
    <div class="subscription-card subscription-card--limit">
      <button class="subscription-close" aria-label="Close">
        ${ICONS.close}
      </button>
      
      <div class="subscription-header">
        <div class="limit-icon">${ICONS.heart}</div>
        <span class="subscription-eyebrow">UNTIL NEXT TIME</span>
        <h2 class="subscription-title">I'll Miss You</h2>
        <p class="subscription-subtitle">${prompt}</p>
        ${resetDate ? `<p class="reset-date">Conversations reset on <strong>${new Date(resetDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</strong></p>` : ''}
      </div>
      
      <div class="limit-actions">
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

  return `
    <div class="tier-card ${isPopular ? 'tier-card--popular' : ''} ${isCurrentTier ? 'tier-card--current' : ''}"
         style="animation-delay: ${index * STAGGER.NORMAL}ms">
      ${isPopular ? `<div class="tier-badge">${ICONS.star} Most Popular</div>` : ''}
      ${isCurrentTier ? '<div class="tier-badge tier-badge--current">Current Plan</div>' : ''}
      
      <h3 class="tier-name">${tier.name}</h3>
      <p class="tier-description">${tier.description}</p>
      
      <div class="tier-price">
        <span class="tier-amount">${isFree ? 'Free' : `$${(tier.priceInCents / 100).toFixed(2)}`}</span>
        ${!isFree ? '<span class="tier-period">/month</span>' : ''}
      </div>
      
      <ul class="tier-features">
        ${tier.features.map((f) => `<li>${ICONS.check} ${f}</li>`).join('')}
      </ul>
      
      <button class="tier-button ${isCurrentTier ? 'tier-button--current' : ''}" 
              data-tier="${tier.id}"
              ${isCurrentTier || isFree ? 'disabled' : ''}>
        ${isCurrentTier ? 'Current Plan' : isFree ? 'Your Plan' : 'Choose This'}
      </button>
    </div>
  `;
}

function getDefaultTiers(): SubscriptionTier[] {
  return [
    {
      id: 'free',
      name: 'Getting Started',
      description: "We're just beginning",
      priceInCents: 0,
      priceDisplay: 'Free',
      conversationsPerMonth: 5,
      features: ['5 conversations/month', 'Full Ferni experience', 'Basic memory'],
    },
    {
      id: 'friend',
      name: 'Your Life Coach',
      description: "I'm here whenever you need me",
      priceInCents: 999,
      priceDisplay: '$9.99/month',
      conversationsPerMonth: null,
      features: ['Unlimited conversations', 'Full memory', 'Cross-device sync', 'Priority support'],
      popular: true,
    },
    {
      id: 'partner',
      name: 'Partner in Growth',
      description: 'Together for the long haul',
      priceInCents: 1999,
      priceDisplay: '$19.99/month',
      conversationsPerMonth: null,
      features: ['Everything in Friend', 'Priority responses', 'Family sharing', 'Early access'],
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

  log.info('Initiating upgrade to:', tier);

  try {
    const response = await fetch('/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        tier,
        success_url: window.location.origin + '?upgrade=success',
        cancel_url: window.location.origin + '?upgrade=cancel',
      }),
    });

    const result = await response.json();

    if (response.ok && result.url) {
      // Redirect to Stripe checkout
      window.location.href = result.url;
    } else if (result.message) {
      // Show message (Stripe not configured)
      showToast(result.message);
    } else {
      showToast('Unable to start checkout. Please try again.');
    }
  } catch (error) {
    log.error('Upgrade failed:', error);
    showToast('Something went wrong. Please try again.');
  }

  onUpgradeCallback?.(tier);
}

function showToast(message: string): void {
  toast.info(message);
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function animateModalIn(): void {
  if (!modal) return;

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
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('subscription-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'subscription-styles';
  styleElement.textContent = `
    /* Subscription Modal */
    .subscription-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    .subscription-modal--visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    .subscription-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.6);
      backdrop-filter: blur(var(--glass-blur-modal));
      -webkit-backdrop-filter: blur(var(--glass-blur-modal));
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
    
    .subscription-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 40px;
      height: 40px;
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
    
    .subscription-close:hover {
      background: var(--color-background-tertiary, #ebe8e3);
      color: var(--color-text-primary, #2C2520);
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
      color: var(--color-accent-text);
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
    }
    
    .limit-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-4, 16px);
      padding: var(--space-4, 16px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-full, 9999px);
      color: var(--color-accent-text);
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
    
    .tier-card:hover {
      border-color: var(--color-border-hover, #d4d0c8);
      transform: translateY(-2px);
    }
    
    .tier-card--popular {
      border-color: var(--color-accent-text);
      background: linear-gradient(135deg, 
        var(--persona-tint, rgba(74, 103, 65, 0.05)) 0%,
        var(--color-background-secondary, #faf8f5) 100%
      );
    }
    
    .tier-card--current {
      border-color: var(--color-border-active, #4a6741);
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
      color: var(--color-accent-text);
      flex-shrink: 0;
    }
    
    .tier-button {
      width: 100%;
      padding: var(--space-3, 12px) var(--space-4, 16px);
      border: 2px solid var(--persona-primary, #4a6741);
      background: transparent;
      color: var(--color-accent-text);
      font-size: 1rem;
      font-weight: 600;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .tier-button:hover:not(:disabled) {
      background: var(--persona-primary, #4a6741);
      color: white;
    }
    
    .tier-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .tier-card--popular .tier-button {
      background: var(--persona-primary, #4a6741);
      color: white;
    }
    
    .tier-card--popular .tier-button:hover:not(:disabled) {
      background: var(--persona-secondary, #3d5a35);
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
    
    .limit-button--secondary {
      background: transparent;
      color: var(--color-text-secondary, #5a5048);
      border: 2px solid var(--color-border, #d4d0c8);
    }
    
    .limit-button--secondary:hover {
      background: var(--color-background-secondary, #faf8f5);
    }
    
    .subscription-footer {
      text-align: center;
      font-size: 0.875rem;
      color: var(--color-text-muted, #7a6f63);
      margin: 0;
    }
    
    /* Dark Theme */
    @media (prefers-color-scheme: dark) {
      .subscription-backdrop {
        background: rgba(28, 24, 20, 0.8);
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
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .subscription-card {
        padding: var(--space-5, 20px);
      }
      
      .subscription-tiers {
        grid-template-columns: 1fr;
      }
      
      .subscription-title {
        font-size: 1.5rem;
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

  const remaining = status.conversationsRemaining ?? 5;
  const total = status.limits.conversationsPerMonth ?? 5;
  const percentage = (remaining / total) * 100;

  const indicator = document.createElement('div');
  indicator.className = 'usage-indicator';
  indicator.innerHTML = `
    <div class="usage-indicator__content">
      <span class="usage-indicator__text">${remaining} conversation${remaining !== 1 ? 's' : ''} left</span>
      <div class="usage-indicator__bar">
        <div class="usage-indicator__fill" style="width: ${percentage}%"></div>
      </div>
    </div>
  `;

  indicator.addEventListener('click', () => showUpgradeModal());

  document.body.appendChild(indicator);

  // Auto-hide after 5 seconds
  setTimeout(() => {
    indicator.classList.add('usage-indicator--hidden');
    setTimeout(() => indicator.remove(), DURATION.SLOW);
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

