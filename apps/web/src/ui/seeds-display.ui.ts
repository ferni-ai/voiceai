/**
 * Seeds Display UI
 *
 * Shows the user's seed balance and streak in the UI.
 * Can be embedded in settings menu or as a floating indicator.
 *
 * Design: Warm, organic feel - seeds are gifts from your relationship with Ferni
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { getSeedBalance } from '../services/cosmetics.service.js';
import {
  claimDailyBonus,
  getCurrentStreak,
  getNextStreakMilestone,
  isDailyBonusAvailable,
} from '../services/seeds-economy.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { toast } from './toast.ui.js';
import { openGardenDashboard } from './garden-dashboard.ui.js';
import { openGiftSeeds } from './gift-seeds.ui.js';
import { openReferral } from './referral.ui.js';

const log = createLogger('SeedsDisplay');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  seed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22c4-4 8-7.582 8-12a8 8 0 1 0-16 0c0 4.418 4 8 8 12z"/>
    <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
  </svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  </svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="8" width="18" height="4" rx="1"/>
    <path d="M12 8v13"/>
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>
  </svg>`,
  seedling: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V12"/>
    <path d="M12 12c0-3-2.5-5-6-5 0 3 2 6 6 6Z"/>
    <path d="M12 8c0-3 2.5-5 6-5 0 3-2 6-6 6"/>
  </svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('seeds-display-styles')) return;

  const style = document.createElement('style');
  style.id = 'seeds-display-styles';
  style.textContent = `
    .seeds-display {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--color-background-elevated, rgba(255, 253, 251, 0.95));
      border-radius: var(--radius-xl, 16px);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .seeds-balance {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
    }

    .seeds-balance-icon {
      width: 24px;
      height: 24px;
      color: var(--persona-primary, #4a6741);
    }

    .seeds-balance-amount {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      font-variant-numeric: tabular-nums;
    }

    .seeds-balance-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(44, 37, 32, 0.6));
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .seeds-streak {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding-left: var(--space-3, 12px);
      border-left: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .seeds-streak-icon {
      width: 20px;
      height: 20px;
      color: var(--color-semantic-warning, #c4856a);
    }

    .seeds-streak-count {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .seeds-streak-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(44, 37, 32, 0.6));
    }

    .seeds-daily-bonus {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: background ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .seeds-daily-bonus:hover {
      background: var(--persona-glow, rgba(74, 103, 65, 0.15));
    }

    .seeds-daily-bonus-icon {
      width: 18px;
      height: 18px;
      color: var(--persona-primary, #4a6741);
    }

    .seeds-daily-bonus-text {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--persona-primary, #4a6741);
    }

    /* Compact variant for header */
    .seeds-display.compact {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      gap: var(--space-2, 8px);
    }

    .seeds-display.compact .seeds-balance-amount {
      font-size: 1rem;
    }

    .seeds-display.compact .seeds-streak {
      padding-left: var(--space-2, 8px);
    }

    /* Animation for balance changes */
    @keyframes seeds-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.15); }
    }

    .seeds-balance-amount.animating {
      animation: seeds-pulse 400ms ${EASING.SPRING};
      color: var(--persona-primary, #4a6741);
    }

    /* Settings menu embed variant */
    .seeds-settings-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary, #f8f6f3);
      border-radius: var(--radius-xl, 16px);
      margin: var(--space-4, 16px);
    }

    .seeds-settings-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .seeds-settings-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-muted, rgba(44, 37, 32, 0.6));
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .seeds-settings-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .seeds-settings-value {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
    }

    .seeds-settings-value svg {
      width: 20px;
      height: 20px;
    }

    .seeds-settings-value-text {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .seeds-settings-info {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(44, 37, 32, 0.7));
    }

    .seeds-progress {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .seeds-progress-bar {
      height: 6px;
      background: var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: 3px;
      overflow: hidden;
    }

    .seeds-progress-fill {
      height: 100%;
      background: var(--persona-primary, #4a6741);
      border-radius: 3px;
      transition: width ${DURATION.SLOW}ms ${EASING.GENTLE};
    }

    .seeds-progress-text {
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(44, 37, 32, 0.6));
    }

    /* Action buttons */
    .seeds-actions {
      display: flex;
      gap: var(--space-2, 8px);
      margin-top: var(--space-2, 8px);
      padding-top: var(--space-3, 12px);
      border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .seeds-action-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.03));
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--color-text-secondary, rgba(44, 37, 32, 0.7));
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .seeds-action-btn:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    .seeds-action-btn svg {
      width: 16px;
      height: 16px;
    }

    .seeds-action-btn--primary {
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      color: var(--persona-primary, #4a6741);
    }

    .seeds-action-btn--primary:hover {
      background: var(--persona-glow, rgba(74, 103, 65, 0.15));
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

/**
 * Render compact seeds display (for header/nav)
 */
export function renderCompactSeedsDisplay(): string {
  const balance = getSeedBalance();
  const streak = getCurrentStreak();

  return `
    <div class="seeds-display compact" data-seeds-display>
      <div class="seeds-balance">
        <span class="seeds-balance-icon">${ICONS.seed}</span>
        <span class="seeds-balance-amount" data-seeds-amount>${balance}</span>
      </div>
      ${
        streak > 0
          ? `
        <div class="seeds-streak">
          <span class="seeds-streak-icon">${ICONS.flame}</span>
          <span class="seeds-streak-count">${streak}</span>
        </div>
      `
          : ''
      }
    </div>
  `;
}

/**
 * Render full seeds card (for settings menu)
 */
export function renderSeedsSettingsCard(): string {
  const balance = getSeedBalance();
  const streak = getCurrentStreak();
  const dailyAvailable = isDailyBonusAvailable();
  const nextMilestone = getNextStreakMilestone();

  let progressPercent = 0;
  let progressText = '';

  if (nextMilestone && streak > 0) {
    const previousMilestone = [0, 7, 14, 30, 60, 100].filter((m) => m < nextMilestone).pop() ?? 0;
    const range = nextMilestone - previousMilestone;
    const progress = streak - previousMilestone;
    progressPercent = Math.min(100, (progress / range) * 100);
    progressText = `${nextMilestone - streak} days until ${nextMilestone}-day streak bonus`;
  }

  return `
    <div class="seeds-settings-card" data-seeds-card>
      <div class="seeds-settings-header">
        <span class="seeds-settings-title">Your Seeds</span>
        ${
          dailyAvailable
            ? `
          <div class="seeds-daily-bonus" data-daily-bonus>
            <span class="seeds-daily-bonus-icon">${ICONS.gift}</span>
            <span class="seeds-daily-bonus-text">Daily bonus available!</span>
          </div>
        `
            : ''
        }
      </div>

      <div class="seeds-settings-row">
        <div class="seeds-settings-value">
          <span style="color: var(--persona-primary)">${ICONS.seed}</span>
          <span class="seeds-settings-value-text" data-seeds-amount>${balance.toLocaleString()}</span>
        </div>
        <span class="seeds-settings-info">seeds to spend</span>
      </div>

      ${
        streak > 0
          ? `
        <div class="seeds-settings-row">
          <div class="seeds-settings-value">
            <span style="color: var(--color-semantic-warning)">${ICONS.flame}</span>
            <span class="seeds-settings-value-text">${streak}</span>
          </div>
          <span class="seeds-settings-info">day streak</span>
        </div>
      `
          : ''
      }

      ${
        nextMilestone && streak > 0
          ? `
        <div class="seeds-progress">
          <div class="seeds-progress-bar">
            <div class="seeds-progress-fill" style="width: ${progressPercent}%"></div>
          </div>
          <span class="seeds-progress-text">${progressText}</span>
        </div>
      `
          : ''
      }

      <div class="seeds-actions">
        <button class="seeds-action-btn seeds-action-btn--primary" data-action="garden">
          ${ICONS.seedling}
          <span>My Garden</span>
        </button>
        <button class="seeds-action-btn" data-action="gift">
          ${ICONS.gift}
          <span>Gift Seeds</span>
        </button>
        <button class="seeds-action-btn" data-action="invite">
          ${ICONS.share}
          <span>Invite</span>
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

/**
 * Update all seeds displays with current values
 */
export function updateSeedsDisplay(): void {
  const balance = getSeedBalance();
  const amountElements = document.querySelectorAll('[data-seeds-amount]');

  amountElements.forEach((el) => {
    const current = parseInt(el.textContent || '0', 10);
    if (current !== balance) {
      el.textContent = balance.toLocaleString();
      el.classList.add('animating');
      trackedTimeout(() => el.classList.remove('animating'), 400);
    }
  });
}

/**
 * Animate seeds being added
 */
export function animateSeedsAdded(amount: number): void {
  updateSeedsDisplay();

  // Could add floating number animation here
  log.debug({ amount }, 'Seeds display updated');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Handle daily bonus click - claim seeds immediately
 */
function handleDailyBonusClick(e: Event): void {
  e.preventDefault();
  e.stopPropagation();

  const result = claimDailyBonus();
  if (result.claimed) {
    toast.success(`+${result.amount} seeds!`);
    updateSeedsDisplay();

    // Re-render the card to remove the bonus button
    const card = document.querySelector('[data-seeds-card]');
    if (card) {
      card.outerHTML = renderSeedsSettingsCard();
      // Re-attach click handler if daily bonus still available (shouldn't be)
      bindDailyBonusHandler();
    }
  } else {
    toast.info(result.reason || 'Already claimed today');
  }
}

/**
 * Bind click handler to daily bonus button
 */
function bindDailyBonusHandler(): void {
  const dailyBonusBtn = document.querySelector('[data-daily-bonus]');
  if (dailyBonusBtn) {
    dailyBonusBtn.addEventListener('click', handleDailyBonusClick);
  }
}

/**
 * Bind click handlers to action buttons
 */
function bindActionHandlers(): void {
  // Garden button
  const gardenBtn = document.querySelector('[data-action="garden"]');
  if (gardenBtn && !gardenBtn.hasAttribute('data-bound')) {
    gardenBtn.setAttribute('data-bound', 'true');
    gardenBtn.addEventListener('click', () => {
      openGardenDashboard();
    });
  }

  // Gift button
  const giftBtn = document.querySelector('[data-action="gift"]');
  if (giftBtn && !giftBtn.hasAttribute('data-bound')) {
    giftBtn.setAttribute('data-bound', 'true');
    giftBtn.addEventListener('click', () => {
      openGiftSeeds();
    });
  }

  // Invite button
  const inviteBtn = document.querySelector('[data-action="invite"]');
  if (inviteBtn && !inviteBtn.hasAttribute('data-bound')) {
    inviteBtn.setAttribute('data-bound', 'true');
    inviteBtn.addEventListener('click', () => {
      openReferral();
    });
  }
}

/**
 * Initialize seeds display listeners
 */
export function initSeedsDisplay(): void {
  if (isInitialized) return;

  injectStyles();

  // Listen for seeds earned events
  document.addEventListener('ferni:seeds-earned', ((e: CustomEvent) => {
    const { amount } = e.detail as { amount: number };
    animateSeedsAdded(amount);
  }) as EventListener);

  // Listen for cosmetics changes (seed balance changes)
  document.addEventListener('ferni:cosmetics-change', () => {
    updateSeedsDisplay();
  });

  // Bind click handlers when DOM is ready
  // Use MutationObserver to catch dynamically rendered content
  const observer = new MutationObserver(() => {
    bindDailyBonusHandler();
    bindActionHandlers();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also try immediately in case already rendered
  bindDailyBonusHandler();
  bindActionHandlers();

  isInitialized = true;
  log.info('Seeds display initialized');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const seedsDisplay = {
  init: initSeedsDisplay,
  renderCompact: renderCompactSeedsDisplay,
  renderCard: renderSeedsSettingsCard,
  update: updateSeedsDisplay,
  animateAdd: animateSeedsAdded,
};

export default seedsDisplay;
