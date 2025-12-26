/**
 * Conversation Cost UI - "Plant a Seed" 🌱
 *
 * Shows users the actual cost of their conversation and offers
 * a warm, on-brand way to contribute - planting seeds to help
 * Ferni grow.
 *
 * PHILOSOPHY:
 * - Radical transparency about AI costs
 * - No pressure, just awareness and appreciation
 * - Warm, human tone (not transactional)
 * - Ties into our seed economy metaphor
 * - Quick, non-blocking display
 *
 * @module ui/conversation-cost
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';

const log = createLogger('ConversationCostUI');

// ============================================================================
// TYPES
// ============================================================================

interface ConversationCostResponse {
  sessionId: string | null;
  totalCost: number;
  formattedCost: string;
  durationMinutes: number;
  breakdown: {
    llm: number;
    tts: number;
    stt: number;
    livekit: number;
    infrastructure: number;
  };
  suggestedTips: {
    small: number;
    medium: number;
    large: number;
  };
  message: string;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isVisible = false;
let dismissTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('ferni-cost-styles')) return;

  const style = document.createElement('style');
  style.id = 'ferni-cost-styles';
  style.textContent = `
    .ferni-cost-card {
      position: fixed;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%) translateY(20px) scale(0.95);
      opacity: 0;
      background: var(--color-bg-elevated, rgba(42, 42, 62, 0.95));
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      box-shadow: var(--shadow-xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
      border: 1px solid var(--color-border-subtle, rgba(255,255,255,0.1));
      z-index: var(--z-notification, 3000);
      max-width: min(320px, 100%);
      text-align: center;
      pointer-events: auto;
      transition: all ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .ferni-cost-card.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }

    .ferni-cost-card.hiding {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px) scale(0.95);
    }

    .ferni-cost-eyebrow {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, #ccc);
      margin-bottom: var(--space-xs, 4px);
    }

    .ferni-cost-amount {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-xs, 4px);
    }

    .ferni-cost-message {
      font-size: 0.85rem;
      color: var(--color-text-secondary, #e8e2da);
      margin-bottom: var(--space-sm, 8px);
      line-height: 1.4;
    }

    .ferni-cost-cta {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-text-primary, #faf6f0);
      margin-bottom: var(--space-sm, 8px);
    }

    .ferni-cost-tips {
      display: flex;
      gap: var(--space-sm, 8px);
      justify-content: center;
      margin-bottom: var(--space-sm, 8px);
    }

    .ferni-tip-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      border-radius: var(--radius-full, 999px);
      border: 1px solid var(--persona-primary, #4a6741);
      background: transparent;
      color: var(--persona-primary, #4a6741);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .ferni-tip-btn svg {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
    }

    .ferni-tip-btn:hover {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .ferni-tip-btn:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .ferni-tip-btn.primary {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .ferni-cost-dismiss {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 0.7rem;
      color: var(--color-text-muted, #999);
      cursor: pointer;
      transition: color ${DURATION.FAST}ms;
    }

    .ferni-cost-dismiss:hover {
      color: var(--color-text-primary);
    }

    @media (prefers-reduced-motion: reduce) {
      .ferni-cost-card {
        transition: opacity ${DURATION.FAST}ms;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// COMPONENT
// ============================================================================

// ============================================================================
// LUCIDE ICONS (2px stroke, rounded corners, currentColor)
// ============================================================================

/** Sprout icon - small seed tier */
const ICON_SPROUT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>`;

/** Flower icon - medium seed tier */
const ICON_FLOWER = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 7.5V9"/><path d="M7.5 12H9"/><path d="M16.5 12H15"/><path d="M12 16.5V15"/><path d="m8 8 1.88 1.88"/><path d="M14.12 9.88 16 8"/><path d="m8 16 1.88-1.88"/><path d="M14.12 14.12 16 16"/></svg>`;

/** Tree icon - large seed tier */
const ICON_TREE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10v.2A3 3 0 0 1 8.9 16v0H5v0h0a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/></svg>`;

/** Heart icon - for dismiss text */
const ICON_HEART = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="var(--color-ferni, #4a6741)" stroke="var(--color-ferni, #4a6741)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

/**
 * Get a friendly label for tip tier (plant a seed metaphor) with Lucide icons
 */
function _getTipLabel(tier: 'small' | 'medium' | 'large'): string {
  if (tier === 'small') return `${ICON_SPROUT} Seedling`;
  if (tier === 'medium') return `${ICON_FLOWER} Sapling`;
  return `${ICON_TREE} Tree`;
}

/**
 * Create the cost card element
 */
function createCostCard(data: ConversationCostResponse): HTMLElement {
  const card = document.createElement('div');
  card.className = 'ferni-cost-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Conversation cost');

  // Format cost beautifully
  const costDisplay =
    data.totalCost < 0.01
      ? `${(data.totalCost * 100).toFixed(2)}¢`
      : `$${data.totalCost.toFixed(2)}`;

  // Warm, on-brand copy
  const eyebrowText = data.totalCost < 0.05 ? 'That chat cost me about' : 'Our conversation cost';
  const ctaText = 'Want to help keep Ferni free?';

  card.innerHTML = `
    <div class="ferni-cost-eyebrow">${eyebrowText}</div>
    <div class="ferni-cost-amount">${costDisplay}</div>
    <div class="ferni-cost-message">${data.message}</div>
    <div class="ferni-cost-cta">${ctaText}</div>
    <div class="ferni-cost-tips">
      <button class="ferni-tip-btn primary" data-amount="support" title="Support Ferni">
        ${ICON_HEART} Support Ferni
      </button>
    </div>
    <div class="ferni-cost-dismiss">Just happy to chat ${ICON_HEART}</div>
  `;

  // Event handlers
  const tipButtons = card.querySelectorAll('.ferni-tip-btn');
  tipButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const amount = (e.target as HTMLElement).dataset.amount;
      handleTipClick(amount || '1.00');
    });
  });

  const dismiss = card.querySelector('.ferni-cost-dismiss');
  dismiss?.addEventListener('click', () => {
    hide();
  });

  return card;
}

/**
 * Handle seed/tip button click - open Support Ferni modal
 * The Support Ferni modal has proper Stripe integration for contributions.
 */
function handleTipClick(_amount: string): void {
  log.info('Tip clicked, opening Support Ferni modal');

  // Hide the cost card first
  hide();

  // Open the Support Ferni modal which has proper payment integration
  import('./support-ferni.ui.js').then(({ supportFerniUI }) => {
    void supportFerniUI.open();
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Fetch and show the conversation cost card
 */
export async function showConversationCost(): Promise<void> {
  injectStyles();
  cleanupExisting();

  try {
    // Fetch cost data from API
    const response = await apiGet<ConversationCostResponse>('/api/conversation/cost');

    if (!response.ok || !response.data) {
      log.debug('No cost data available');
      return;
    }

    const data = response.data;

    // Don't show if cost is essentially zero or no session
    if (!data.sessionId || data.totalCost < 0.0001) {
      log.debug('Skipping cost display - no meaningful cost', { cost: data.totalCost });
      return;
    }

    // Create and show the card
    container = createCostCard(data);
    document.body.appendChild(container);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container?.classList.add('visible');
      });
    });

    isVisible = true;
    log.info('Showing conversation cost', { cost: data.totalCost, duration: data.durationMinutes });

    // Auto-dismiss after 30 seconds (enough time to read and consider)
    dismissTimeout = setTimeout(() => {
      hide();
    }, 30000);
  } catch (error) {
    log.error('Failed to fetch conversation cost', error);
  }
}

/**
 * Hide the cost card
 */
export function hide(): void {
  if (!container || !isVisible) return;

  if (dismissTimeout) {
    clearTimeout(dismissTimeout);
    dismissTimeout = null;
  }

  container.classList.remove('visible');
  container.classList.add('hiding');

  setTimeout(() => {
    container?.remove();
    container = null;
    isVisible = false;
  }, DURATION.SLOW);
}

/**
 * Cleanup any existing cost cards (HMR protection)
 */
function cleanupExisting(): void {
  document.querySelectorAll('.ferni-cost-card').forEach((el) => el.remove());
  if (dismissTimeout) {
    clearTimeout(dismissTimeout);
    dismissTimeout = null;
  }
  container = null;
  isVisible = false;
}

/**
 * Check if cost card is currently visible
 */
export function isShowing(): boolean {
  return isVisible;
}

// Export for testing
export const conversationCostUI = {
  show: showConversationCost,
  hide,
  isShowing,
};

export default conversationCostUI;

