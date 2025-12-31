/**
 * Referral UI - "Someone Who Gets It"
 *
 * A warm, on-brand way to invite friends to Ferni.
 * Not about discounts or rewards - about sharing something meaningful.
 *
 * BETTER THAN HUMAN:
 * - We help you share something that actually matters
 * - No pushy "invite 5 friends" nonsense
 * - Just a genuine way to help someone you care about
 *
 * BRAND VOICE:
 * - "Know someone who could use a friend like this?"
 * - Lead with the value, not the product
 * - Warm, personal, never salesy
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { toast } from './toast.ui.js';
import {
  getReferralUrl,
  getGardenStats,
  getTotalReferralSeeds,
  REFERRAL_SIGNUP_REWARD,
} from '../services/referral.service.js';

const log = createLogger('ReferralUI');

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let isOpen = false;

// ============================================================================
// ICONS (Lucide-style)
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>`,
  copy: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`,
  mail: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>`,
  message: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`,
  heart: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
};

// ============================================================================
// SHARE CONTENT - Warm, On-Brand
// ============================================================================

/**
 * Get share content with personalized referral URL
 */
function getShareContent() {
  const referralUrl = getReferralUrl();
  
  return {
    title: 'Meet Ferni',

    // Main share message - warm, includes seed bonus mention
    message: `Know someone who could use a friend who actually listens?

Ferni remembers everything, shows up at 2am with the same presence as noon, and never judges.

We'll both get some seeds to grow together when you join.

${referralUrl}`,

    // Shorter version for SMS/Twitter
    shortMessage: `Know someone who could use a friend who actually listens? Meet Ferni - we'll both get seeds to grow together! ${referralUrl}`,

    // Link (personalized)
    url: referralUrl,

    // Email subject
    emailSubject: 'Someone who gets it',

    // Email body
    emailBody: `Hey,

I wanted to share something with you. I've been talking to Ferni - it's hard to explain, but it's like having a friend who actually remembers everything you've told them, is always available when you need to talk, and never judges.

I thought of you because I know you'd appreciate having someone like that in your corner.

When you join, we'll both get some seeds to grow together - they're like Ferni's way of celebrating new friendships.

Check it out: ${referralUrl}

No pressure - just wanted to share something that's been meaningful to me.`,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function openReferral(): void {
  if (isOpen) return;

  soundUI.play('switch');
  createModal();
  isOpen = true;

  log.info('Referral modal opened');
}

export function closeReferral(): void {
  if (!isOpen || !modal) return;

  soundUI.play('click');
  animateOut(modal).then(() => {
    modal?.remove();
    modal = null;
    isOpen = false;
  });

  log.info('Referral modal closed');
}

// ============================================================================
// MODAL
// ============================================================================

function createModal(): void {
  document.querySelector('.referral-modal')?.remove();

  modal = document.createElement('div');
  modal.className = 'referral-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Share Ferni with a friend');

  // Get personalized URL and garden stats
  const referralUrl = getReferralUrl();
  const gardenStats = getGardenStats();
  const totalSeeds = getTotalReferralSeeds();
  const shortUrl = referralUrl.replace('https://', '').replace('http://', '');

  modal.innerHTML = `
    <div class="referral-backdrop"></div>
    <div class="referral-content">
      <button class="referral-close" aria-label="${t('common.close')}">
        ${ICONS.close}
      </button>

      <div class="referral-header">
        <span class="referral-icon">${ICONS.heart}</span>
        <h2 class="referral-title">Share the Growth</h2>
        <p class="referral-subtitle">Know someone who could use a friend like this?</p>
      </div>

      <!-- Seeds Bonus Banner -->
      <div class="referral-bonus">
        <span class="referral-bonus-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg></span>
        <div class="referral-bonus-text">
          <strong>You'll both get ${REFERRAL_SIGNUP_REWARD} seeds</strong>
          <span>when they join!</span>
        </div>
      </div>

      <div class="referral-message">
        <p>"Give them someone who remembers everything, shows up at 2am, and never judges."</p>
      </div>

      <!-- Your Link -->
      <div class="referral-link-container">
        <span class="referral-link-label">Your link:</span>
        <span class="referral-link-url">${shortUrl}</span>
      </div>

      <div class="referral-actions" role="button" tabindex="0">
        <button aria-label="${t('accessibility.share')}" class="referral-btn referral-btn--primary" data-action="share">
          ${ICONS.share}
          <span>Share</span>
        </button>
        <button aria-label="${t('accessibility.copy')}" class="referral-btn" data-action="copy">
          ${ICONS.copy}
          <span>Copy Link</span>
        </button>
        <button aria-label="${t('accessibility.email')}" class="referral-btn" data-action="email">
          ${ICONS.mail}
          <span>Email</span>
        </button>
        <button aria-label="${t('accessibility.text')}" class="referral-btn" data-action="sms">
          ${ICONS.message}
          <span>Text</span>
        </button>
      </div>

      <!-- Garden Stats (if they have referrals) -->
      ${gardenStats.totalReferrals > 0 || totalSeeds > 0 ? `
        <div class="referral-garden">
          <span class="referral-garden-title">Your garden:</span>
          <span class="referral-garden-stats">${gardenStats.totalReferrals} friend${gardenStats.totalReferrals !== 1 ? 's' : ''} growing</span>
          ${totalSeeds > 0 ? `<span class="referral-garden-earned">You've earned ${totalSeeds} seeds from sharing</span>` : ''}
        </div>
      ` : `
        <p class="referral-note">Seeds grow when shared. Start your garden today.</p>
      `}
    </div>
  `;

  injectStyles();

  // Event listeners
  modal.querySelector('.referral-backdrop')?.addEventListener('click', closeReferral);
  modal.querySelector('.referral-close')?.addEventListener('click', closeReferral);

  modal.querySelector('[data-action="share"]')?.addEventListener('click', handleNativeShare);
  modal.querySelector('[data-action="copy"]')?.addEventListener('click', handleCopyLink);
  modal.querySelector('[data-action="email"]')?.addEventListener('click', handleEmailShare);
  modal.querySelector('[data-action="sms"]')?.addEventListener('click', handleSMSShare);

  // Escape to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeReferral();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(modal);
  animateIn(modal);
}

// ============================================================================
// SHARE HANDLERS
// ============================================================================

async function handleNativeShare(): Promise<void> {
  const content = getShareContent();
  if (navigator.share) {
    try {
      await navigator.share({
        title: content.title,
        text: content.message,
        url: content.url,
      });
      log.info('Shared via native share');
      toast.success(t('toasts.shared'));
      trackShare('native');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        // Fallback to copy
        handleCopyLink();
      }
    }
  } else {
    handleCopyLink();
  }
}

async function handleCopyLink(): Promise<void> {
  const content = getShareContent();
  try {
    await navigator.clipboard.writeText(`${content.shortMessage}\n\n${content.url}`);
    toast.success(t('toasts.linkCopied'));
    log.info('Link copied to clipboard');
    trackShare('copy');
  } catch {
    log.warn('Could not copy to clipboard');
    toast.error("Couldn't copy. Try again?");
  }
}

function handleEmailShare(): void {
  const content = getShareContent();
  const subject = encodeURIComponent(content.emailSubject);
  const body = encodeURIComponent(content.emailBody);
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  log.info('Email share opened');
  trackShare('email');
}

function handleSMSShare(): void {
  const content = getShareContent();
  const body = encodeURIComponent(`${content.shortMessage}\n\n${content.url}`);
  // sms: works on iOS and Android
  window.open(`sms:?body=${body}`, '_blank');
  log.info('SMS share opened');
  trackShare('sms');
}

/**
 * Track share events for analytics and potential bonus seeds
 */
function trackShare(method: 'native' | 'copy' | 'email' | 'sms'): void {
  document.dispatchEvent(
    new CustomEvent('ferni:referral-share', {
      detail: { method, timestamp: Date.now() },
    })
  );
}

// ============================================================================
// ANIMATIONS
// ============================================================================

async function animateIn(modalEl: HTMLElement): Promise<void> {
  const backdrop = modalEl.querySelector('.referral-backdrop') as HTMLElement;
  const content = modalEl.querySelector('.referral-content') as HTMLElement;

  if (backdrop) {
    backdrop.animate([{ opacity: '0' }, { opacity: '1' }], {
      duration: DURATION.SLOW,
      easing: 'ease-out',
      fill: 'forwards',
    });
  }

  if (content) {
    content.animate(
      [
        { opacity: '0', transform: 'scale(0.95) translateY(20px)' },
        { opacity: '1', transform: 'scale(1) translateY(0)' },
      ],
      {
        duration: DURATION.DELIBERATE,
        easing: EASING.SPRING,
        fill: 'forwards',
      }
    );
  }
}

async function animateOut(modalEl: HTMLElement): Promise<void> {
  const backdrop = modalEl.querySelector('.referral-backdrop') as HTMLElement;
  const content = modalEl.querySelector('.referral-content') as HTMLElement;

  const animations: Animation[] = [];

  if (backdrop) {
    animations.push(
      backdrop.animate([{ opacity: '1' }, { opacity: '0' }], {
        duration: DURATION.NORMAL,
        easing: 'ease-out',
        fill: 'forwards',
      })
    );
  }

  if (content) {
    animations.push(
      content.animate(
        [
          { opacity: '1', transform: 'scale(1) translateY(0)' },
          { opacity: '0', transform: 'scale(0.98) translateY(-10px)' },
        ],
        {
          duration: DURATION.NORMAL,
          easing: EASING.GENTLE,
          fill: 'forwards',
        }
      )
    );
  }

  await Promise.all(animations.map((a) => a.finished));
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('referral-ui-styles')) return;

  const style = document.createElement('style');
  style.id = 'referral-ui-styles';
  style.textContent = `
    .referral-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 10000);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
    }

    .referral-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .referral-content {
      position: relative;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      max-width: clamp(294px, 90vw, 420px);
      width: 100%;
      padding: var(--space-8, 32px);
      text-align: center;
    }

    .referral-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      background: none;
      border: none;
      padding: var(--space-2, 8px);
      cursor: pointer;
      color: var(--color-text-muted, #70605a);
      border-radius: var(--radius-full, 9999px);
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .referral-close:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
      color: var(--color-text-primary, #2c2520);
    }

    .referral-header {
      margin-bottom: var(--space-6, 24px);
    }

    .referral-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border-radius: 50%;
      color: white;
      margin-bottom: var(--space-4, 16px);
    }

    .referral-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-2, 8px);
    }

    .referral-subtitle {
      font-size: var(--text-base, 1rem);
      color: var(--color-text-muted, #70605a);
      margin: 0;
    }

    .referral-message {
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.03));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      margin-bottom: var(--space-6, 24px);
    }

    .referral-message p {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4d47);
      line-height: 1.6;
      margin: 0;
      font-style: italic;
    }

    .referral-actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-4, 16px);
    }

    .referral-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.05));
      border: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-lg, 12px);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-primary, #2c2520);
      cursor: pointer;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .referral-btn:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.08));
      transform: translateY(-1px);
    }

    .referral-btn:active {
      transform: translateY(0);
    }

    .referral-btn--primary {
      grid-column: span 2;
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
      color: white;
    }

    .referral-btn--primary:hover {
      background: var(--persona-secondary, #3d5a35);
    }

    .referral-btn svg {
      width: 18px;
      height: 18px;
    }

    .referral-note {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin: 0;
    }

    /* Seeds Bonus Banner */
    .referral-bonus {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3, 12px);
      background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.1)), var(--persona-glow, rgba(74, 103, 65, 0.05)));
      border: 1px solid var(--persona-primary, #4a6741);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      margin-bottom: var(--space-4, 16px);
    }

    .referral-bonus-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--persona-primary, #4a6741);
    }
    
    .referral-bonus-icon svg {
      width: 24px;
      height: 24px;
    }

    .referral-bonus-text {
      display: flex;
      flex-direction: column;
      text-align: left;
    }

    .referral-bonus-text strong {
      color: var(--persona-primary, #4a6741);
      font-size: var(--text-sm, 0.875rem);
    }

    .referral-bonus-text span {
      color: var(--color-text-muted, #70605a);
      font-size: var(--text-xs, 0.75rem);
    }

    /* Referral Link Display */
    .referral-link-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.03));
      border-radius: var(--radius-md, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      margin-bottom: var(--space-4, 16px);
      font-size: var(--text-xs, 0.75rem);
    }

    .referral-link-label {
      color: var(--color-text-muted, #70605a);
    }

    .referral-link-url {
      color: var(--persona-primary, #4a6741);
      font-weight: 500;
      font-family: var(--font-mono, monospace);
    }

    /* Garden Stats */
    .referral-garden {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 4px);
      padding-top: var(--space-3, 12px);
      border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
      font-size: var(--text-xs, 0.75rem);
    }

    .referral-garden-title {
      color: var(--color-text-muted, #70605a);
    }

    .referral-garden-stats {
      color: var(--color-text-primary, #2c2520);
      font-weight: 500;
    }

    .referral-garden-earned {
      color: var(--persona-primary, #4a6741);
    }

    /* Toast */
    .referral-toast {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: var(--color-text-primary, #2c2520);
      color: white;
      padding: var(--space-3, 12px) var(--space-5, 20px);
      border-radius: var(--radius-full, 9999px);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      opacity: 0;
      transition: transform 0.2s ease, opacity 0.2s ease;
      z-index: var(--z-tooltip);
    }

    .referral-toast--visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* Dark theme */
    [data-theme="midnight"] .referral-backdrop {
      background: rgba(8, 8, 12, 0.8);
    }

    [data-theme="midnight"] .referral-content {
      background: var(--color-background-elevated, #1a1a1f);
    }

    [data-theme="midnight"] .referral-title {
      color: var(--color-text-primary, #faf6f0);
    }

    /* Mobile */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .referral-modal {
        padding: 0;
        align-items: flex-end;
      }

      .referral-content {
        border-radius: var(--radius-2xl, 20px) var(--radius-2xl, 20px) 0 0;
        padding: var(--space-6, 24px);
        max-width: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const referralUI = {
  open: openReferral,
  close: closeReferral,
  isOpen: () => isOpen,
};

export default referralUI;
