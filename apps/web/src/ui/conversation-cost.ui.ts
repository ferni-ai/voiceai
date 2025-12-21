/**
 * Conversation Cost UI - Transparent "Tip Jar"
 *
 * Shows users the actual cost of their conversation and offers
 * an optional way to contribute/tip.
 *
 * PHILOSOPHY:
 * - Radical transparency about AI costs
 * - No pressure to pay, just awareness
 * - Warm, appreciative tone
 * - Quick, non-blocking display
 *
 * @module ui/conversation-cost
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet, getApiHeaders } from '../utils/api.js';

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
      max-width: 320px;
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
      margin-bottom: var(--space-md, 16px);
      line-height: 1.4;
    }

    .ferni-cost-tips {
      display: flex;
      gap: var(--space-sm, 8px);
      justify-content: center;
      margin-bottom: var(--space-sm, 8px);
    }

    .ferni-tip-btn {
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

  card.innerHTML = `
    <div class="ferni-cost-eyebrow">This conversation cost</div>
    <div class="ferni-cost-amount">${costDisplay}</div>
    <div class="ferni-cost-message">${data.message}</div>
    <div class="ferni-cost-tips">
      <button class="ferni-tip-btn" data-amount="${data.suggestedTips.small.toFixed(2)}">
        $${data.suggestedTips.small.toFixed(2)}
      </button>
      <button class="ferni-tip-btn primary" data-amount="${data.suggestedTips.medium.toFixed(2)}">
        $${data.suggestedTips.medium.toFixed(2)}
      </button>
      <button class="ferni-tip-btn" data-amount="${data.suggestedTips.large.toFixed(2)}">
        $${data.suggestedTips.large.toFixed(2)}
      </button>
    </div>
    <div class="ferni-cost-dismiss">Thanks, maybe next time</div>
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
 * Handle tip button click - redirect to Stripe checkout
 */
function handleTipClick(amount: string): void {
  log.info('Tip clicked', { amount });

  // For now, show appreciation and redirect to subscription page
  // In future, this could be a direct Stripe checkout session
  hide();

  // Show warm thank you toast
  import('./toast.ui.js').then(({ toast }) => {
    toast.success(`Thanks! Your $${amount} helps keep Ferni running 💚`);
  });

  // TODO: Implement actual Stripe tip checkout
  // Could redirect to: /api/checkout/tip?amount=${amount}
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

    // Auto-dismiss after 10 seconds
    dismissTimeout = setTimeout(() => {
      hide();
    }, 10000);
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

