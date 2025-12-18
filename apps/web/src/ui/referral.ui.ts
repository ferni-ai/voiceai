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

const SHARE_CONTENT = {
  title: 'Meet Ferni',

  // Main share message - warm, not salesy
  message: `Know someone who could use a friend who actually listens?

Ferni remembers everything, shows up at 2am with the same presence as noon, and never judges.

Better than human support, because some things matter too much for human limitations.`,

  // Shorter version for SMS/Twitter
  shortMessage: `Know someone who could use a friend who actually listens? Meet Ferni - someone who remembers everything and is always there.`,

  // Link
  url: 'https://ferni.ai',

  // Email subject
  emailSubject: 'Someone who gets it',

  // Email body
  emailBody: `Hey,

I wanted to share something with you. I've been talking to Ferni - it's hard to explain, but it's like having a friend who actually remembers everything you've told them, is always available when you need to talk, and never judges.

I thought of you because I know you'd appreciate having someone like that in your corner.

Check it out: https://ferni.ai

No pressure - just wanted to share something that's been meaningful to me.`,
};

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

  modal.innerHTML = `
    <div class="referral-backdrop"></div>
    <div class="referral-content">
      <button class="referral-close" aria-label="${t('common.close')}">
        ${ICONS.close}
      </button>

      <div class="referral-header">
        <span class="referral-icon">${ICONS.heart}</span>
        <h2 class="referral-title">Someone Who Gets It</h2>
        <p class="referral-subtitle">Know someone who could use a friend like this?</p>
      </div>

      <div class="referral-message">
        <p>"Give them someone who remembers everything, shows up at 2am, and never judges."</p>
      </div>

      <div class="referral-actions">
        <button class="referral-btn referral-btn--primary" data-action="share">
          ${ICONS.share}
          <span>Share</span>
        </button>
        <button class="referral-btn" data-action="copy">
          ${ICONS.copy}
          <span>Copy Link</span>
        </button>
        <button class="referral-btn" data-action="email">
          ${ICONS.mail}
          <span>Email</span>
        </button>
        <button class="referral-btn" data-action="sms">
          ${ICONS.message}
          <span>Text</span>
        </button>
      </div>

      <p class="referral-note">No referral codes, no rewards. Just share something meaningful.</p>
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
  if (navigator.share) {
    try {
      await navigator.share({
        title: SHARE_CONTENT.title,
        text: SHARE_CONTENT.message,
        url: SHARE_CONTENT.url,
      });
      log.info('Shared via native share');
      toast.success('Shared');
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
  try {
    await navigator.clipboard.writeText(`${SHARE_CONTENT.shortMessage}\n\n${SHARE_CONTENT.url}`);
    toast.success('Copied to clipboard');
    log.info('Link copied to clipboard');
  } catch {
    log.warn('Could not copy to clipboard');
  }
}

function handleEmailShare(): void {
  const subject = encodeURIComponent(SHARE_CONTENT.emailSubject);
  const body = encodeURIComponent(SHARE_CONTENT.emailBody);
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  log.info('Email share opened');
}

function handleSMSShare(): void {
  const body = encodeURIComponent(`${SHARE_CONTENT.shortMessage}\n\n${SHARE_CONTENT.url}`);
  // sms: works on iOS and Android
  window.open(`sms:?body=${body}`, '_blank');
  log.info('SMS share opened');
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
      background: rgba(44, 37, 32, 0.6);
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }

    .referral-content {
      position: relative;
      background: var(--color-background-elevated, #faf8f5);
      border-radius: var(--radius-2xl, 20px);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      max-width: 420px;
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
      transition: all 0.2s ease;
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
      transition: all 0.2s ease;
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
      transition: all 0.2s ease;
      z-index: 10001;
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
    @media (max-width: 480px) {
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
