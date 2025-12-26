/**
 * Garden Dashboard UI
 *
 * Visual representation of your referral network - your "garden".
 * Shows friends you've referred, their activity, and passive seed income.
 *
 * "Your garden grows when your friends grow."
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { toast } from './toast.ui.js';
import { openReferral } from './referral.ui.js';
import {
  getReferralUrl,
  getGardenStats,
  getTotalReferralSeeds,
  type GardenStats,
} from '../services/referral.service.js';

const log = createLogger('GardenDashboard');

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  seedling: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V12"/>
    <path d="M12 12c0-3-2.5-5-6-5 0 3 2 6 6 6Z"/>
    <path d="M12 8c0-3 2.5-5 6-5 0 3-2 6-6 6"/>
  </svg>`,
  tree: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V13"/>
    <path d="M12 13c-5 0-8-4-8-8 0 0 3 0 8 4 5-4 8-4 8-4 0 4-3 8-8 8"/>
    <path d="M12 9C9 9 6 6 6 3c0 0 2 0 6 3 4-3 6-3 6-3 0 3-3 6-6 6"/>
  </svg>`,
  forest: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22v-4"/>
    <path d="M7 22v-2"/>
    <path d="M17 22v-2"/>
    <path d="M12 18c-4 0-7-3-7-7 0 0 2.5 0 7 3.5 4.5-3.5 7-3.5 7-3.5 0 4-3 7-7 7"/>
    <path d="M7 20c-2 0-4-2-4-4.5 0 0 1.5 0 4 2 2.5-2 4-2 4-2 0 2.5-2 4.5-4 4.5"/>
    <path d="M17 20c2 0 4-2 4-4.5 0 0-1.5 0-4 2-2.5-2-4-2-4-2 0 2.5 2 4.5 4 4.5"/>
  </svg>`,
  seed: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22c4-4 8-7.582 8-12a8 8 0 1 0-16 0c0 4.418 4 8 8 12z"/>
    <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
  </svg>`,
  flame: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  </svg>`,
  share: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>`,
  copy: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
};

/** Garden title icons */
const GARDEN_ICONS: Record<GardenStats['gardenTitle'], string> = {
  'seedling': ICONS.seedling,
  'gardener': ICONS.seedling,
  'grove-keeper': ICONS.tree,
  'forest-guardian': ICONS.forest,
};

/** Garden title labels */
const GARDEN_LABELS: Record<GardenStats['gardenTitle'], string> = {
  'seedling': 'Seedling',
  'gardener': 'Gardener',
  'grove-keeper': 'Grove Keeper',
  'forest-guardian': 'Forest Guardian',
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let isOpen = false;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the garden dashboard
 */
export function openGardenDashboard(): void {
  if (isOpen) return;

  soundUI.play('switch');
  createModal();
  isOpen = true;

  log.info('Garden dashboard opened');
}

/**
 * Close the garden dashboard
 */
export function closeGardenDashboard(): void {
  if (!isOpen || !modal) return;

  soundUI.play('click');
  void animateOut(modal).then(() => {
    modal?.remove();
    modal = null;
    isOpen = false;
  });

  log.info('Garden dashboard closed');
}

// ============================================================================
// MODAL
// ============================================================================

function createModal(): void {
  document.querySelector('.garden-dashboard-modal')?.remove();

  modal = document.createElement('div');
  modal.className = 'garden-dashboard-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Your garden');

  renderModalContent();
  injectStyles();

  // Event listeners
  modal.querySelector('.garden-backdrop')?.addEventListener('click', closeGardenDashboard);
  modal.querySelector('.garden-close')?.addEventListener('click', closeGardenDashboard);

  // Escape to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeGardenDashboard();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(modal);
  void animateIn(modal);
}

function renderModalContent(): void {
  if (!modal) return;

  const stats = getGardenStats();
  const totalSeeds = getTotalReferralSeeds();
  const referralUrl = getReferralUrl();
  const shortUrl = referralUrl.replace('https://', '');

  modal.innerHTML = `
    <div class="garden-backdrop"></div>
    <div class="garden-content">
      <button class="garden-close" aria-label="Close">
        ${ICONS.close}
      </button>

      <div class="garden-header">
        <div class="garden-title-icon">
          ${GARDEN_ICONS[stats.gardenTitle]}
        </div>
        <h2 class="garden-title">Your Garden</h2>
        <p class="garden-subtitle">${GARDEN_LABELS[stats.gardenTitle]}</p>
      </div>

      <!-- Stats Grid -->
      <div class="garden-stats">
        <div class="garden-stat">
          <span class="garden-stat-value">${stats.totalReferrals}</span>
          <span class="garden-stat-label">Friends Referred</span>
        </div>
        <div class="garden-stat">
          <span class="garden-stat-value">${stats.activeReferrals}</span>
          <span class="garden-stat-label">Active This Week</span>
        </div>
        <div class="garden-stat garden-stat--highlight">
          <span class="garden-stat-value">+${stats.weeklyPassiveSeeds}</span>
          <span class="garden-stat-label">Seeds/Week</span>
        </div>
      </div>

      <!-- Total Earned -->
      <div class="garden-earned">
        <span class="garden-earned-icon">${ICONS.seed}</span>
        <div class="garden-earned-text">
          <strong>${totalSeeds.toLocaleString()}</strong>
          <span>seeds earned from sharing</span>
        </div>
      </div>

      <!-- Growth Tiers -->
      <div class="garden-tiers">
        <div class="garden-tier ${stats.gardenTitle === 'seedling' ? 'garden-tier--active' : stats.totalReferrals >= 1 ? 'garden-tier--complete' : ''}">
          <span class="garden-tier-icon">${stats.totalReferrals >= 1 ? ICONS.check : ''}</span>
          <span class="garden-tier-name">Seedling</span>
          <span class="garden-tier-req">1-2 friends</span>
        </div>
        <div class="garden-tier ${stats.gardenTitle === 'gardener' ? 'garden-tier--active' : stats.totalReferrals >= 3 ? 'garden-tier--complete' : ''}">
          <span class="garden-tier-icon">${stats.totalReferrals >= 3 ? ICONS.check : ''}</span>
          <span class="garden-tier-name">Gardener</span>
          <span class="garden-tier-req">3-5 friends</span>
        </div>
        <div class="garden-tier ${stats.gardenTitle === 'grove-keeper' ? 'garden-tier--active' : stats.totalReferrals >= 6 ? 'garden-tier--complete' : ''}">
          <span class="garden-tier-icon">${stats.totalReferrals >= 6 ? ICONS.check : ''}</span>
          <span class="garden-tier-name">Grove Keeper</span>
          <span class="garden-tier-req">6-10 friends</span>
        </div>
        <div class="garden-tier ${stats.gardenTitle === 'forest-guardian' ? 'garden-tier--active' : stats.totalReferrals >= 11 ? 'garden-tier--complete' : ''}">
          <span class="garden-tier-icon">${stats.totalReferrals >= 11 ? ICONS.check : ''}</span>
          <span class="garden-tier-name">Forest Guardian</span>
          <span class="garden-tier-req">11+ friends</span>
        </div>
      </div>

      <!-- Referral Link -->
      <div class="garden-link">
        <span class="garden-link-label">Your link:</span>
        <span class="garden-link-url">${shortUrl}</span>
        <button aria-label="Copy" class="garden-link-copy" data-action="copy">
          ${ICONS.copy}
        </button>
      </div>

      <!-- Actions -->
      <div class="garden-actions" role="button" tabindex="0">
        <button aria-label="Share" class="garden-action garden-action--primary" data-action="invite">
          ${ICONS.share}
          <span>Invite Friends</span>
        </button>
      </div>

      <!-- Empty State -->
      ${stats.totalReferrals === 0 ? `
        <div class="garden-empty">
          <p>Your garden is waiting to grow!</p>
          <p class="garden-empty-sub">Share Ferni with friends and you'll both get 25 seeds.</p>
        </div>
      ` : ''}
    </div>
  `;

  // Bind events
  bindModalEvents();
}

function bindModalEvents(): void {
  if (!modal) return;

  // Copy link
  const copyBtn = modal.querySelector('[data-action="copy"]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const url = getReferralUrl();
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied!');
        copyBtn.innerHTML = ICONS.check;
        setTimeout(() => {
          copyBtn.innerHTML = ICONS.copy;
        }, 2000);
      } catch {
        toast.error("Couldn't copy link");
      }
    });
  }

  // Invite friends
  const inviteBtn = modal.querySelector('[data-action="invite"]');
  if (inviteBtn) {
    inviteBtn.addEventListener('click', () => {
      closeGardenDashboard();
      openReferral();
    });
  }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

async function animateIn(modalEl: HTMLElement): Promise<void> {
  const backdrop = modalEl.querySelector('.garden-backdrop') as HTMLElement;
  const content = modalEl.querySelector('.garden-content') as HTMLElement;

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
  const backdrop = modalEl.querySelector('.garden-backdrop') as HTMLElement;
  const content = modalEl.querySelector('.garden-content') as HTMLElement;

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
  if (document.getElementById('garden-dashboard-styles')) return;

  const style = document.createElement('style');
  style.id = 'garden-dashboard-styles';
  style.textContent = `
    .garden-dashboard-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 10000);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
    }

    .garden-backdrop {
      position: absolute;
      inset: 0;
      background: var(--glass-backdrop-bg, rgba(44, 37, 32, 0.4));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
    }

    @supports not (backdrop-filter: blur(1px)) {
      .garden-backdrop {
        background: rgba(44, 37, 32, 0.85);
      }
    }

    .garden-content {
      position: relative;
      background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--glass-shadow-thick, 0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.1));
      max-width: clamp(294px, 90vw, 420px);
      width: 100%;
      padding: var(--space-8, 32px);
      max-height: 90vh;
      overflow-y: auto;
    }

    @supports not (backdrop-filter: blur(1px)) {
      .garden-content {
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      }
    }

    .garden-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      background: none;
      border: none;
      padding: var(--space-2, 8px);
      cursor: pointer;
      color: var(--color-text-muted);
      border-radius: var(--radius-full, 9999px);
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .garden-close:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
      color: var(--color-text-primary);
    }

    .garden-header {
      text-align: center;
      margin-bottom: var(--space-6, 24px);
    }

    .garden-title-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, var(--persona-primary), var(--persona-secondary));
      border-radius: 50%;
      color: white;
      margin-bottom: var(--space-4, 16px);
    }

    .garden-title-icon svg {
      width: 32px;
      height: 32px;
    }

    .garden-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1, 4px);
    }

    .garden-subtitle {
      font-size: var(--text-base, 1rem);
      color: var(--persona-text);
      font-weight: 500;
      margin: 0;
    }

    .garden-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-5, 20px);
    }

    .garden-stat {
      text-align: center;
      padding: var(--space-3, 12px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.03));
      border-radius: var(--radius-lg, 12px);
    }

    .garden-stat--highlight {
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
    }

    .garden-stat-value {
      display: block;
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .garden-stat--highlight .garden-stat-value {
      color: var(--persona-text);
    }

    .garden-stat-label {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted);
    }

    .garden-earned {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.08)), transparent);
      border: 1px solid var(--persona-primary);
      border-radius: var(--radius-lg, 12px);
      margin-bottom: var(--space-5, 20px);
    }

    .garden-earned-icon {
      color: var(--persona-text);
    }

    .garden-earned-text {
      display: flex;
      flex-direction: column;
    }

    .garden-earned-text strong {
      font-size: var(--text-lg, 1.125rem);
      color: var(--color-text-primary);
    }

    .garden-earned-text span {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted);
    }

    .garden-tiers {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-5, 20px);
    }

    .garden-tier {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.03));
      border-radius: var(--radius-md, 8px);
      opacity: 0.5;
    }

    .garden-tier--active {
      opacity: 1;
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border: 1px solid var(--persona-primary);
    }

    .garden-tier--complete {
      opacity: 0.7;
    }

    .garden-tier-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--persona-text);
    }

    .garden-tier-name {
      font-weight: 500;
      color: var(--color-text-primary);
      flex: 1;
    }

    .garden-tier-req {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted);
    }

    .garden-link {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.03));
      border-radius: var(--radius-lg, 12px);
      margin-bottom: var(--space-5, 20px);
    }

    .garden-link-label {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted);
    }

    .garden-link-url {
      flex: 1;
      font-size: var(--text-sm, 0.875rem);
      font-family: var(--font-mono, monospace);
      color: var(--persona-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .garden-link-copy {
      background: none;
      border: none;
      padding: var(--space-2, 8px);
      cursor: pointer;
      color: var(--color-text-muted);
      border-radius: var(--radius-md, 8px);
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .garden-link-copy:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
      color: var(--persona-text);
    }

    .garden-actions {
      display: flex;
      gap: var(--space-3, 12px);
    }

    .garden-action {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding: var(--space-4, 16px);
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .garden-action--primary {
      background: var(--persona-primary);
      color: white;
    }

    .garden-action--primary:hover {
      background: var(--persona-secondary);
      transform: translateY(-1px);
    }

    .garden-empty {
      text-align: center;
      padding: var(--space-6, 24px) var(--space-4, 16px);
      margin-top: var(--space-4, 16px);
      border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
    }

    .garden-empty p {
      margin: 0;
      color: var(--color-text-secondary);
    }

    .garden-empty-sub {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted) !important;
      margin-top: var(--space-2, 8px) !important;
    }

    /* Dark theme */
    [data-theme="midnight"] .garden-backdrop {
      background: rgba(8, 8, 12, 0.8);
    }

    [data-theme="midnight"] .garden-content {
      background: var(--color-background-elevated);
    }

    /* Mobile */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .garden-dashboard-modal {
        padding: 0;
        align-items: flex-end;
      }

      .garden-content {
        border-radius: var(--radius-2xl, 20px) var(--radius-2xl, 20px) 0 0;
        padding: var(--space-6, 24px);
        max-width: none;
        max-height: 85vh;
      }

      .garden-stats {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .garden-action {
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const gardenDashboardUI = {
  open: openGardenDashboard,
  close: closeGardenDashboard,
  isOpen: () => isOpen,
};

export default gardenDashboardUI;

