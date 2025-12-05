/**
 * Engagement Trigger Button UI
 *
 * Adds a subtle engagement trigger button near the controls.
 * Shows notification badges when rituals are due or predictions ready.
 *
 * Brand-aligned: minimalist, unobtrusive, zen aesthetic.
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementTriggerCallbacks {
  onEngagementClick?: () => void;
  onPredictionsClick?: () => void;
}

export interface EngagementBadgeState {
  ritualsdue: number;
  predictionsReady: number;
  streakAtRisk: boolean;
}

// ============================================================================
// ENGAGEMENT TRIGGER UI
// ============================================================================

class EngagementTriggerUI {
  private container: HTMLElement | null = null;
  private callbacks: EngagementTriggerCallbacks = {};
  private badgeState: EngagementBadgeState = {
    ritualsdue: 0,
    predictionsReady: 0,
    streakAtRisk: false,
  };
  private isInitialized = false;

  /**
   * Initialize the trigger button
   */
  initialize(callbacks: EngagementTriggerCallbacks): void {
    if (this.isInitialized) return;

    this.callbacks = callbacks;
    this.createStyles();
    this.createTriggerButton();
    this.isInitialized = true;
  }

  /**
   * Create the trigger button container
   */
  private createTriggerButton(): void {
    // Find the controls row to insert next to it
    const controlsRow = document.querySelector('.controls-row');
    if (!controlsRow) {
      console.warn('[EngagementTrigger] Controls row not found');
      return;
    }

    // Create container for engagement buttons
    this.container = document.createElement('div');
    this.container.className = 'engagement-triggers';
    this.container.innerHTML = `
      <button class="engagement-trigger-btn" id="engagementTriggerBtn" aria-label="Open daily practice" title="Daily Practice">
        <svg class="engagement-trigger-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <span class="engagement-trigger-btn__badge" id="engagementBadge"></span>
      </button>
      <button class="engagement-trigger-btn" id="predictionsTriggerBtn" aria-label="Open predictions" title="Predictions">
        <svg class="engagement-trigger-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span class="engagement-trigger-btn__badge" id="predictionsBadge"></span>
      </button>
    `;

    // Insert after controls row (before spotify button if exists)
    controlsRow.parentNode?.insertBefore(this.container, controlsRow.nextSibling);

    // Bind click handlers
    const engagementBtn = document.getElementById('engagementTriggerBtn');
    const predictionsBtn = document.getElementById('predictionsTriggerBtn');

    engagementBtn?.addEventListener('click', () => {
      this.callbacks.onEngagementClick?.();
      this.animateButtonPress(engagementBtn);
    });

    predictionsBtn?.addEventListener('click', () => {
      this.callbacks.onPredictionsClick?.();
      this.animateButtonPress(predictionsBtn);
    });
  }

  /**
   * Animate button press
   */
  private animateButtonPress(button: HTMLElement): void {
    if (prefersReducedMotion()) return;

    button.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(0.92)' },
        { transform: 'scale(1)' },
      ],
      {
        duration: DURATION.FAST,
        easing: EASING.SPRING_GENTLE,
      }
    );
  }

  /**
   * Update badge state
   */
  updateBadges(state: Partial<EngagementBadgeState>): void {
    this.badgeState = { ...this.badgeState, ...state };
    this.renderBadges();
  }

  /**
   * Render badge indicators
   */
  private renderBadges(): void {
    const engagementBadge = document.getElementById('engagementBadge');
    const predictionsBadge = document.getElementById('predictionsBadge');

    if (engagementBadge) {
      const count = this.badgeState.ritualsdue;
      if (count > 0) {
        engagementBadge.textContent = count.toString();
        engagementBadge.classList.add('engagement-trigger-btn__badge--visible');
        if (this.badgeState.streakAtRisk) {
          engagementBadge.classList.add('engagement-trigger-btn__badge--urgent');
        }
      } else {
        engagementBadge.classList.remove('engagement-trigger-btn__badge--visible', 'engagement-trigger-btn__badge--urgent');
      }
    }

    if (predictionsBadge) {
      const count = this.badgeState.predictionsReady;
      if (count > 0) {
        predictionsBadge.textContent = count.toString();
        predictionsBadge.classList.add('engagement-trigger-btn__badge--visible');
      } else {
        predictionsBadge.classList.remove('engagement-trigger-btn__badge--visible');
      }
    }
  }

  /**
   * Show the triggers (for connected state)
   */
  show(): void {
    if (!this.container) return;
    this.container.classList.remove('engagement-triggers--hidden');
  }

  /**
   * Hide the triggers
   */
  hide(): void {
    if (!this.container) return;
    this.container.classList.add('engagement-triggers--hidden');
  }

  /**
   * Pulse the engagement button (for attention)
   */
  pulseEngagement(): void {
    const btn = document.getElementById('engagementTriggerBtn');
    if (!btn || prefersReducedMotion()) return;

    btn.classList.add('engagement-trigger-btn--pulse');
    setTimeout(() => btn.classList.remove('engagement-trigger-btn--pulse'), 2000);
  }

  /**
   * Create styles
   */
  private createStyles(): void {
    const styleId = 'engagement-trigger-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* ========================================
         ENGAGEMENT TRIGGER BUTTONS
         Minimal, zen-inspired design
         ======================================== */

      .engagement-triggers {
        display: flex;
        align-items: center;
        gap: var(--ma-breath, 8px);
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
        transition: opacity 300ms ease, transform 300ms ease;
        margin-top: var(--ma-breath, 8px);
        justify-content: center;
      }

      .engagement-triggers--hidden {
        opacity: 0;
        transform: translateY(8px);
        pointer-events: none;
      }

      .engagement-trigger-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        padding: 0;
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-medium, rgba(44, 37, 32, 0.10));
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: var(--transition-all-fast, all 150ms ease);
        box-shadow: 0 2px 8px rgba(44, 37, 32, 0.08);
      }

      .engagement-trigger-btn:hover {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-primary, #2c2520);
        border-color: var(--color-border-strong, rgba(44, 37, 32, 0.18));
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(44, 37, 32, 0.12);
      }

      .engagement-trigger-btn:active {
        transform: scale(0.95);
      }

      .engagement-trigger-btn__icon {
        width: 20px;
        height: 20px;
        stroke-width: 2;
      }

      /* Badge */
      .engagement-trigger-btn__badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        font-size: 10px;
        font-weight: var(--font-weight-bold, 700);
        line-height: 16px;
        text-align: center;
        color: white;
        background: var(--color-accent-primary, #2d5a3d);
        border-radius: var(--radius-full, 9999px);
        opacity: 0;
        transform: scale(0);
        transition: opacity 200ms ease, transform 200ms var(--ease-ease-out-back, cubic-bezier(0.34, 1.56, 0.64, 1));
      }

      .engagement-trigger-btn__badge--visible {
        opacity: 1;
        transform: scale(1);
      }

      .engagement-trigger-btn__badge--urgent {
        background: var(--color-semantic-warning, #b8860b);
        animation: badgePulse 1.5s ease-in-out infinite;
      }

      @keyframes badgePulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }

      /* Pulse animation for attention */
      .engagement-trigger-btn--pulse {
        animation: triggerPulse 2s ease-out;
      }

      @keyframes triggerPulse {
        0% { box-shadow: 0 0 0 0 var(--color-accent-glow, rgba(45, 90, 61, 0.3)); }
        70% { box-shadow: 0 0 0 12px transparent; }
        100% { box-shadow: 0 0 0 0 transparent; }
      }

      /* Connected state styling */
      .engagement-triggers--visible .engagement-trigger-btn {
        animation: triggerFadeIn 400ms var(--ease-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
      }

      .engagement-triggers--visible .engagement-trigger-btn:nth-child(2) {
        animation-delay: 80ms;
      }

      @keyframes triggerFadeIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Dark theme (Cedar Night) */
      [data-theme="midnight"] .engagement-trigger-btn {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-medium, rgba(215, 185, 145, 0.20));
        color: var(--color-text-secondary, #e0d5c8);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }

      [data-theme="midnight"] .engagement-trigger-btn:hover {
        background: var(--color-background-elevated, #70605a);
        color: var(--color-text-primary, #faf6f0);
        border-color: var(--color-border-strong, rgba(215, 185, 145, 0.30));
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .engagement-triggers {
          transition: opacity 100ms ease;
          transform: none;
        }
        .engagement-trigger-btn--pulse,
        .engagement-trigger-btn__badge--urgent {
          animation: none;
        }
        .engagement-triggers--visible .engagement-trigger-btn {
          animation: none;
          opacity: 1;
        }
      }

      /* Mobile adjustments */
      @media (max-width: 480px) {
        .engagement-trigger-btn {
          width: 48px;
          height: 48px;
        }
        .engagement-trigger-btn__icon {
          width: 22px;
          height: 22px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    const style = document.getElementById('engagement-trigger-styles');
    if (style) {
      style.remove();
    }

    this.isInitialized = false;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const engagementTriggerUI = new EngagementTriggerUI();

export function initEngagementTriggerUI(callbacks: EngagementTriggerCallbacks): void {
  engagementTriggerUI.initialize(callbacks);
}

