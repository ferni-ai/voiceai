/**
 * Earn Seeds Modal UI
 *
 * Explains to new users how to earn seeds through their relationship with Ferni.
 * "Seeds grow naturally from your time together."
 *
 * Shows after first conversation or when user clicks "How to earn" link.
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { openReferral } from './referral.ui.js';
import { t } from '../i18n/index.js';

const log = createLogger('EarnSeedsModal');

// ============================================================================
// CONSTANTS
// ============================================================================

const EARN_METHODS = [
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>`,
    title: 'Daily Conversations',
    description: "Chat with Ferni each day to earn 5 seeds. Just show up, we're happy to see you.",
    reward: '+5 seeds/day',
  },
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>`,
    title: 'Keep Your Streak',
    description: "Talk for 7 days straight? That's 25 bonus seeds. 30 days? 100 seeds. Consistency matters.",
    reward: 'Up to +500 seeds',
  },
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>`,
    title: 'Invite Friends',
    description: "Share Ferni with someone who could use a friend. You both get 25 seeds when they join.",
    reward: '+25 seeds each',
  },
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1"/>
      <path d="M12 8v13"/>
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>
    </svg>`,
    title: 'Share Seeds',
    description: "Send seeds to a friend and love multiplies. They get up to 40% extra!",
    reward: '+40% bonus',
  },
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22V12"/>
      <path d="M12 12c0-3-2.5-5-6-5 0 3 2 6 6 6Z"/>
      <path d="M12 8c0-3 2.5-5 6-5 0 3-2 6-6 6"/>
    </svg>`,
    title: 'Grow Your Garden',
    description: "As your referrals grow, you earn passive seeds each week. Plant once, harvest forever.",
    reward: 'Up to +7/week/friend',
  },
];

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  seed: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22c4-4 8-7.582 8-12a8 8 0 1 0-16 0c0 4.418 4 8 8 12z"/>
    <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
  </svg>`,
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let isOpen = false;

// LocalStorage key to track if user has seen the modal
const SEEN_KEY = 'ferni_earn_seeds_seen';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the earn seeds explainer modal
 */
export function openEarnSeedsModal(): void {
  if (isOpen) return;

  soundUI.play('switch');
  createModal();
  isOpen = true;
  localStorage.setItem(SEEN_KEY, 'true');

  log.info('Earn seeds modal opened');
}

/**
 * Close the earn seeds modal
 */
export function closeEarnSeedsModal(): void {
  if (!isOpen || !modal) return;

  soundUI.play('click');
  void animateOut(modal).then(() => {
    modal?.remove();
    modal = null;
    isOpen = false;
  });

  log.info('Earn seeds modal closed');
}

/**
 * Check if user has seen the explainer
 */
export function hasSeenEarnSeedsModal(): boolean {
  return localStorage.getItem(SEEN_KEY) === 'true';
}

/**
 * Show the modal if user hasn't seen it (for first conversation)
 */
export function maybeShowEarnSeedsModal(): void {
  if (!hasSeenEarnSeedsModal()) {
    // Delay slightly so it doesn't interrupt
    setTimeout(() => openEarnSeedsModal(), 2000);
  }
}

// ============================================================================
// MODAL
// ============================================================================

function createModal(): void {
  document.querySelector('.earn-seeds-modal')?.remove();

  modal = document.createElement('div');
  modal.className = 'earn-seeds-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'How to earn seeds');

  modal.innerHTML = `
    <div class="earn-seeds-backdrop"></div>
    <div class="earn-seeds-content">
      <button class="earn-seeds-close" aria-label="${t('accessibility.close')}">
        ${ICONS.close}
      </button>

      <div class="earn-seeds-header">
        <div class="earn-seeds-icon">${ICONS.seed}</div>
        <h2 class="earn-seeds-title">Grow Your Seeds</h2>
        <p class="earn-seeds-subtitle">Seeds grow naturally from your time with Ferni.</p>
      </div>

      <div class="earn-seeds-methods">
        ${EARN_METHODS.map(method => `
          <div class="earn-method">
            <div class="earn-method-icon">${method.icon}</div>
            <div class="earn-method-content">
              <h3 class="earn-method-title">${method.title}</h3>
              <p class="earn-method-description">${method.description}</p>
            </div>
            <span class="earn-method-reward">${method.reward}</span>
          </div>
        `).join('')}
      </div>

      <div class="earn-seeds-footer">
        <button aria-label="${t('accessibility.startGrowingTogether')}" class="earn-seeds-btn earn-seeds-btn--primary" data-action="invite">
          Start Growing Together
        </button>
        <p class="earn-seeds-note">No grinding required. Just be yourself.</p>
      </div>
    </div>
  `;

  injectStyles();

  // Event listeners
  modal.querySelector('.earn-seeds-backdrop')?.addEventListener('click', closeEarnSeedsModal);
  modal.querySelector('.earn-seeds-close')?.addEventListener('click', closeEarnSeedsModal);
  modal.querySelector('[data-action="invite"]')?.addEventListener('click', () => {
    closeEarnSeedsModal();
    openReferral();
  });

  // Escape to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeEarnSeedsModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(modal);
  void animateIn(modal);
}

// ============================================================================
// ANIMATIONS
// ============================================================================

async function animateIn(modalEl: HTMLElement): Promise<void> {
  const backdrop = modalEl.querySelector('.earn-seeds-backdrop') as HTMLElement;
  const content = modalEl.querySelector('.earn-seeds-content') as HTMLElement;
  const methods = modalEl.querySelectorAll('.earn-method');

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

  // Stagger the method cards
  methods.forEach((method, i) => {
    (method as HTMLElement).animate(
      [
        { opacity: '0', transform: 'translateY(10px)' },
        { opacity: '1', transform: 'translateY(0)' },
      ],
      {
        duration: DURATION.SLOW,
        easing: EASING.GENTLE,
        fill: 'forwards',
        delay: 100 + (i * 60),
      }
    );
  });
}

async function animateOut(modalEl: HTMLElement): Promise<void> {
  const backdrop = modalEl.querySelector('.earn-seeds-backdrop') as HTMLElement;
  const content = modalEl.querySelector('.earn-seeds-content') as HTMLElement;

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
  if (document.getElementById('earn-seeds-modal-styles')) return;

  const style = document.createElement('style');
  style.id = 'earn-seeds-modal-styles';
  style.textContent = `
    .earn-seeds-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 10000);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
    }

    .earn-seeds-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
    }

    .earn-seeds-content {
      position: relative;
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--shadow-lg);
      max-width: clamp(322px, 90vw, 460px);
      width: 100%;
      padding: var(--space-8, 32px);
      max-height: 90vh;
      overflow-y: auto;
    }

    .earn-seeds-close {
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

    .earn-seeds-close:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
      color: var(--color-text-primary, #2c2520);
    }

    .earn-seeds-header {
      text-align: center;
      margin-bottom: var(--space-6, 24px);
    }

    .earn-seeds-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border-radius: 50%;
      color: white;
      margin-bottom: var(--space-4, 16px);
    }

    .earn-seeds-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-2, 8px);
    }

    .earn-seeds-subtitle {
      font-size: var(--text-base, 1rem);
      color: var(--color-text-muted, #70605a);
      margin: 0;
    }

    .earn-seeds-methods {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .earn-method {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.03));
      border-radius: var(--radius-lg, 12px);
      opacity: 0;
    }

    .earn-method-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-elevated, white);
      border-radius: var(--radius-md, 8px);
      color: var(--persona-primary, #4a6741);
    }

    .earn-method-content {
      flex: 1;
      min-width: 0;
    }

    .earn-method-title {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-1, 4px);
    }

    .earn-method-description {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin: 0;
      line-height: 1.4;
    }

    .earn-method-reward {
      flex-shrink: 0;
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-full, 9999px);
      white-space: nowrap;
    }

    .earn-seeds-footer {
      margin-top: var(--space-6, 24px);
      text-align: center;
    }

    .earn-seeds-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px) var(--space-8, 32px);
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .earn-seeds-btn--primary {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .earn-seeds-btn--primary:hover {
      background: var(--persona-secondary, #3d5a35);
      transform: translateY(-1px);
    }

    .earn-seeds-note {
      margin: var(--space-3, 12px) 0 0;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
    }

    /* Dark theme */
    [data-theme="midnight"] .earn-seeds-backdrop {
      background: rgba(8, 8, 12, 0.8);
    }

    [data-theme="midnight"] .earn-seeds-content {
      background: var(--color-background-elevated, #1a1a1f);
    }

    /* Mobile */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .earn-seeds-modal {
        padding: 0;
        align-items: flex-end;
      }

      .earn-seeds-content {
        border-radius: var(--radius-2xl, 20px) var(--radius-2xl, 20px) 0 0;
        padding: var(--space-6, 24px);
        max-width: none;
        max-height: 85vh;
      }

      .earn-method {
        flex-wrap: wrap;
      }

      .earn-method-reward {
        width: 100%;
        text-align: center;
        margin-top: var(--space-2, 8px);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .earn-seeds-btn {
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const earnSeedsModalUI = {
  open: openEarnSeedsModal,
  close: closeEarnSeedsModal,
  hasSeen: hasSeenEarnSeedsModal,
  maybeShow: maybeShowEarnSeedsModal,
};

export default earnSeedsModalUI;

