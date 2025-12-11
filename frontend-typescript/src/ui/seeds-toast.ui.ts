/**
 * Seeds Toast UI
 *
 * Shows beautiful notifications when seeds are earned.
 * Centered pill design following Ferni brand guidelines.
 *
 * Features:
 * - Celebratory animation for earning seeds
 * - Streak celebration for milestone achievements
 * - Auto-dismissing with smooth exit
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SeedsToast');

// ============================================================================
// STATE
// ============================================================================

let toastContainer: HTMLElement | null = null;
let currentToast: HTMLElement | null = null;
let dismissTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  seed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <path d="M12 22c4-4 8-7.582 8-12a8 8 0 1 0-16 0c0 4.418 4 8 8 12z"/>
    <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
  </svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  </svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('seeds-toast-styles')) return;

  const style = document.createElement('style');
  style.id = 'seeds-toast-styles';
  style.textContent = `
    .seeds-toast-container {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10001;
      pointer-events: none;
    }

    .seeds-toast {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px) var(--space-5, 20px);
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-full, 9999px);
      box-shadow: var(--shadow-lg, 0 10px 40px rgba(44, 37, 32, 0.15));
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      pointer-events: auto;
      
      /* Entry animation */
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }

    .seeds-toast.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      transition: 
        opacity ${DURATION.NORMAL}ms ${EASING.SPRING},
        transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .seeds-toast.exiting {
      opacity: 0;
      transform: translateY(-10px) scale(0.95);
      transition: 
        opacity ${DURATION.FAST}ms ${EASING.STANDARD},
        transform ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .seeds-toast-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--persona-primary, #4a6741);
    }

    .seeds-toast-icon.streak {
      color: var(--color-semantic-warning, #c4856a);
    }

    .seeds-toast-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .seeds-toast-amount {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .seeds-toast-amount .plus {
      color: var(--persona-primary, #4a6741);
    }

    .seeds-toast-reason {
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(44, 37, 32, 0.6));
    }

    /* Celebration variant for streaks */
    .seeds-toast.celebration {
      background: linear-gradient(
        135deg,
        var(--persona-primary, #4a6741) 0%,
        var(--persona-secondary, #3d5a35) 100%
      );
      border: none;
    }

    .seeds-toast.celebration .seeds-toast-amount,
    .seeds-toast.celebration .seeds-toast-reason {
      color: white;
    }

    .seeds-toast.celebration .seeds-toast-amount .plus {
      color: rgba(255, 255, 255, 0.8);
    }

    .seeds-toast.celebration .seeds-toast-icon {
      color: white;
    }

    /* Sparkle particles */
    @keyframes sparkle-float {
      0% {
        opacity: 1;
        transform: translate(0, 0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(var(--x), var(--y)) scale(0);
      }
    }

    .seeds-toast-sparkle {
      position: absolute;
      width: 6px;
      height: 6px;
      background: var(--persona-primary, #4a6741);
      border-radius: 50%;
      animation: sparkle-float 800ms ${EASING.EXPO_OUT} forwards;
    }

    .seeds-toast.celebration .seeds-toast-sparkle {
      background: white;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// TOAST FUNCTIONS
// ============================================================================

/**
 * Create the toast container if it doesn't exist
 */
function ensureContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'seeds-toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Create sparkle particles for celebration effect
 */
function createSparkles(toast: HTMLElement, count = 8): void {
  for (let i = 0; i < count; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = 'seeds-toast-sparkle';

    // Random direction
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 30 + Math.random() * 20;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    sparkle.style.setProperty('--x', `${x}px`);
    sparkle.style.setProperty('--y', `${y}px`);
    sparkle.style.left = '50%';
    sparkle.style.top = '50%';

    toast.appendChild(sparkle);

    // Remove after animation
    setTimeout(() => sparkle.remove(), 800);
  }
}

/**
 * Show seeds earned toast
 */
export function showSeedsToast(amount: number, reason: string, isCelebration = false): void {
  const container = ensureContainer();

  // Dismiss existing toast
  if (currentToast) {
    dismissToast();
  }

  // Clear any pending dismiss
  if (dismissTimeout) {
    clearTimeout(dismissTimeout);
  }

  // Create toast
  const toast = document.createElement('div');
  toast.className = `seeds-toast${isCelebration ? ' celebration' : ''}`;
  toast.innerHTML = `
    <span class="seeds-toast-icon${isCelebration ? ' streak' : ''}">
      ${isCelebration ? ICONS.flame : ICONS.seed}
    </span>
    <div class="seeds-toast-content">
      <span class="seeds-toast-amount"><span class="plus">+${amount}</span> seeds</span>
      <span class="seeds-toast-reason">${reason}</span>
    </div>
  `;

  container.appendChild(toast);
  currentToast = toast;

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('visible');

    // Add sparkles for celebrations
    if (isCelebration) {
      createSparkles(toast, 12);
    }
  });

  // Auto-dismiss
  const duration = isCelebration ? 4000 : 3000;
  dismissTimeout = setTimeout(() => {
    dismissToast();
  }, duration);

  log.debug({ amount, reason, isCelebration }, 'Seeds toast shown');
}

/**
 * Dismiss current toast
 */
function dismissToast(): void {
  if (!currentToast) return;

  const toast = currentToast;
  toast.classList.remove('visible');
  toast.classList.add('exiting');

  setTimeout(() => {
    toast.remove();
    if (currentToast === toast) {
      currentToast = null;
    }
  }, DURATION.NORMAL);
}

/**
 * Show streak milestone toast
 */
export function showStreakToast(days: number, reward: number): void {
  showSeedsToast(
    reward,
    `${days}-day streak! Keep it up!`,
    true // celebration mode
  );
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize seeds toast listeners
 */
export function initSeedsToast(): void {
  injectStyles();

  // Listen for seeds earned events
  document.addEventListener('ferni:seeds-earned', ((e: CustomEvent) => {
    const { amount, reason, type } = e.detail as {
      amount: number;
      reason: string;
      type: string;
    };

    // Determine if this is a celebration-worthy event
    const isCelebration = type === 'streak' || type === 'milestone' || amount >= 50;

    showSeedsToast(amount, reason, isCelebration);
  }) as EventListener);

  // Listen for streak milestone events
  document.addEventListener('ferni:streak-milestone', ((e: CustomEvent) => {
    const { days, reward } = e.detail as { days: number; reward: number };
    showStreakToast(days, reward);
  }) as EventListener);

  log.info('Seeds toast initialized');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const seedsToast = {
  init: initSeedsToast,
  show: showSeedsToast,
  showStreak: showStreakToast,
};

export default seedsToast;
