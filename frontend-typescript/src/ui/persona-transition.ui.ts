/**
 * Persona Transition UI
 *
 * Animated transitions when switching between personas.
 * Shows banter/handoff messages between personas.
 *
 * DESIGN PRINCIPLES:
 *   - Fluid, morphing color transitions
 *   - Character-specific banter displayed briefly
 *   - Non-intrusive but delightful
 *   - Respects reduced motion preferences
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// ============================================================================
// TYPES
// ============================================================================

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

export interface PersonaTransitionData {
  fromPersonaId: string;
  fromPersonaName: string;
  toPersonaId: string;
  toPersonaName: string;
  banter?: string;
}

export interface PersonaTransitionUICallbacks {
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
}

// ============================================================================
// PERSONA COLORS - Uses CSS variables from data-persona attribute
// ============================================================================

/**
 * Get persona colors from CSS variables (set via data-persona attribute on body).
 * Fallback to default sage green if no persona is set.
 */
function getPersonaColors(): { primary: string; secondary: string } {
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);
  return {
    primary: computedStyle.getPropertyValue('--persona-primary').trim() || '#3d5a35',
    secondary: computedStyle.getPropertyValue('--persona-secondary').trim() || '#4a6741',
  };
}

// ============================================================================
// PERSONA TRANSITION UI CLASS
// ============================================================================

class PersonaTransitionUI {
  private overlay: HTMLElement | null = null;
  private banterEl: HTMLElement | null = null;
  private callbacks: PersonaTransitionUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isTransitioning = false;

  initialize(): void {
    if (this.overlay) return;
    this.injectStyles();
    this.createOverlay();
  }

  setCallbacks(callbacks: PersonaTransitionUICallbacks): void {
    this.callbacks = callbacks;
  }

  async transition(data: PersonaTransitionData): Promise<void> {
    if (this.isTransitioning) return;

    this.initialize();
    if (!this.overlay || !this.banterEl) return;

    this.isTransitioning = true;
    this.callbacks.onTransitionStart?.();

    // Get persona colors from CSS variables (uses current persona or defaults)
    const colors = getPersonaColors();

    // For transition animation, use the current persona colors for both from/to
    // The visual effect is a pulse/morph in the persona's color palette
    // Set CSS custom properties for animation
    this.overlay.style.setProperty('--from-primary', colors.primary);
    this.overlay.style.setProperty('--from-secondary', colors.secondary);
    this.overlay.style.setProperty('--to-primary', colors.primary);
    this.overlay.style.setProperty('--to-secondary', colors.secondary);

    // Show banter if provided
    if (data.banter) {
      this.banterEl.innerHTML = `
        <span class="persona-transition__from">${data.fromPersonaName}:</span>
        <span class="persona-transition__text">"${this.escapeHtml(data.banter)}"</span>
      `;
    } else {
      this.banterEl.innerHTML = `
        <span class="persona-transition__handoff">Switching to ${data.toPersonaName}</span>
      `;
    }

    // Start transition
    this.overlay.classList.add('persona-transition--visible');

    if (prefersReducedMotion()) {
      // Quick fade for reduced motion
      await this.sleep(DURATION.NORMAL);
    } else {
      // Full animation
      await this.sleep(DURATION.CELEBRATION);
    }

    // End transition
    this.overlay.classList.remove('persona-transition--visible');

    await this.sleep(DURATION.SLOW);

    this.isTransitioning = false;
    this.callbacks.onTransitionEnd?.();
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'persona-transition';
    this.overlay.setAttribute('aria-hidden', 'true');

    this.banterEl = document.createElement('div');
    this.banterEl.className = 'persona-transition__banter';
    this.overlay.appendChild(this.banterEl);

    document.body.appendChild(this.overlay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => trackedTimeout(resolve, ms));
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .persona-transition {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        opacity: 0;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .persona-transition::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          135deg,
          var(--from-primary, #3d5a35) 0%,
          var(--from-secondary, #4a6741) 30%,
          var(--to-secondary, #5a7b9a) 70%,
          var(--to-primary, #4a6b8a) 100%
        );
        opacity: 0;
        transition: opacity ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
      }

      .persona-transition--visible {
        opacity: 1;
      }

      .persona-transition--visible::before {
        opacity: 0.85;
        animation: persona-morph ${DURATION.CELEBRATION}ms ${EASING.GENTLE} forwards;
      }

      @keyframes persona-morph {
        0% {
          background-position: 0% 0%;
          transform: scale(1);
        }
        50% {
          background-position: 100% 100%;
          transform: scale(1.02);
        }
        100% {
          background-position: 100% 100%;
          transform: scale(1);
        }
      }

      .persona-transition__banter {
        position: relative;
        z-index: 1;
        max-width: 400px;
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        background: var(--color-background-elevated, rgba(255, 253, 251, 0.95));
        border-radius: var(--radius-xl, 1.5rem);
        box-shadow: var(--shadow-xl, 0 16px 32px rgba(44, 37, 32, 0.15));
        text-align: center;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
        transition-delay: ${DURATION.FAST}ms;
      }

      .persona-transition--visible .persona-transition__banter {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .persona-transition__from {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted, #756a5e);
        margin-bottom: var(--space-2, 8px);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .persona-transition__text {
        display: block;
        font-family: var(--font-primary, 'Inter', sans-serif);
        font-size: var(--text-base, 1rem);
        font-style: italic;
        line-height: 1.6;
        color: var(--color-text-primary, #2c2520);
      }

      .persona-transition__handoff {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary, #5c544a);
      }

      [data-theme="midnight"] .persona-transition__banter {
        background: var(--color-background-elevated, rgba(112, 96, 90, 0.95));
      }

      [data-theme="midnight"] .persona-transition__text {
        color: var(--color-text-primary, #faf6f0);
      }

      @media (prefers-reduced-motion: reduce) {
        .persona-transition::before { animation: none; }
        .persona-transition__banter { transform: none; }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    this.overlay?.remove();
    this.styleElement?.remove();
    this.overlay = null;
    this.banterEl = null;
    this.styleElement = null;
  }
}

let instance: PersonaTransitionUI | null = null;

export function getPersonaTransitionUI(): PersonaTransitionUI {
  if (!instance) instance = new PersonaTransitionUI();
  return instance;
}

export function initPersonaTransitionUI(): void {
  getPersonaTransitionUI().initialize();
}

export async function transitionPersona(data: PersonaTransitionData): Promise<void> {
  return getPersonaTransitionUI().transition(data);
}

export default PersonaTransitionUI;

