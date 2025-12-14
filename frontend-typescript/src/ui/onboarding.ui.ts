/**
 * First-Time User Onboarding UI
 *
 * A brand-aligned guided tour for new users.
 * Introduces key features with minimal, zen-like progression.
 *
 * DESIGN PRINCIPLES:
 *   - Gentle, non-overwhelming introduction
 *   - One concept at a time
 *   - Skip-friendly (no forced progression)
 *   - Warm, inviting tone
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  highlight?: string;
}

export interface OnboardingUICallbacks {
  onComplete?: () => void;
  onSkip?: () => void;
  onStepChange?: (step: number) => void;
}

// ============================================================================
// DEFAULT STEPS
// ============================================================================

const DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Ferni',
    description: 'Your personal team of AI life coaches. Each brings unique wisdom to support your journey.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  },
  {
    id: 'voice',
    title: 'Just Speak',
    description: 'Tap the center to start a conversation. Speak naturally - Ferni listens and responds in real time.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    highlight: '.waveform',
  },
  {
    id: 'personas',
    title: 'Meet Your Team',
    description: 'Six unique coaches with different perspectives. Each understands your history with the team.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    highlight: '.persona-switcher',
  },
  {
    id: 'rituals',
    title: 'Daily Practices',
    description: 'Build consistency with short daily rituals. Track streaks and celebrate progress.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    highlight: '.engagement-trigger',
  },
  {
    id: 'ready',
    title: "You're Ready",
    description: "That's all you need to know. Discover more as you go.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>',
  },
];

// ============================================================================
// ONBOARDING UI CLASS
// ============================================================================

class OnboardingUI {
  private overlay: HTMLElement | null = null;
  private callbacks: OnboardingUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private currentStep = 0;
  private steps: OnboardingStep[] = DEFAULT_STEPS;
  private isVisible = false;

  initialize(): void {
    if (this.overlay) return;
    this.injectStyles();
    this.createOverlay();
  }

  setCallbacks(callbacks: OnboardingUICallbacks): void {
    this.callbacks = callbacks;
  }

  setSteps(steps: OnboardingStep[]): void {
    this.steps = steps;
  }

  start(): void {
    this.initialize();
    if (!this.overlay) return;

    this.currentStep = 0;
    this.renderStep();
    this.overlay.classList.add('onboarding--visible');
    this.isVisible = true;
  }

  next(): void {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.renderStep();
      this.callbacks.onStepChange?.(this.currentStep);
    } else {
      this.complete();
    }
  }

  prev(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.renderStep();
      this.callbacks.onStepChange?.(this.currentStep);
    }
  }

  skip(): void {
    this.hide();
    this.callbacks.onSkip?.();
    this.markComplete();
  }

  complete(): void {
    this.hide();
    this.callbacks.onComplete?.();
    this.markComplete();
  }

  hide(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove('onboarding--visible');
    this.isVisible = false;
    this.clearHighlights();
  }

  /** Check if the overlay is currently visible */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  hasCompleted(): boolean {
    return localStorage.getItem('ferni:onboarding:complete') === 'true';
  }

  startIfNeeded(): void {
    if (!this.hasCompleted()) {
      this.start();
    }
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'onboarding';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Welcome tour');
    document.body.appendChild(this.overlay);
  }

  private renderStep(): void {
    if (!this.overlay) return;
    const step = this.steps[this.currentStep];
    if (!step) return;

    const isFirst = this.currentStep === 0;
    const isLast = this.currentStep === this.steps.length - 1;

    this.overlay.innerHTML = `
      <div class="onboarding__card">
        <div class="onboarding__icon">${step.icon}</div>
        <h2 class="onboarding__title">${step.title}</h2>
        <p class="onboarding__description">${step.description}</p>
        
        <div class="onboarding__dots">
          ${this.steps.map((_, i) => `<span class="onboarding__dot ${i === this.currentStep ? 'onboarding__dot--active' : ''}"></span>`).join('')}
        </div>
        
        <div class="onboarding__actions">
          ${!isFirst ? '<button class="onboarding__btn onboarding__btn--secondary" data-action="prev">Back</button>' : '<button class="onboarding__btn onboarding__btn--secondary" data-action="skip">Skip tour</button>'}
          <button class="onboarding__btn onboarding__btn--primary" data-action="next">${isLast ? "Let's begin" : 'Next'}</button>
        </div>
      </div>
    `;

    this.overlay.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (action === 'next') this.next();
        else if (action === 'prev') this.prev();
        else if (action === 'skip') this.skip();
      });
    });

    this.clearHighlights();
    if (step.highlight) {
      const el = document.querySelector(step.highlight);
      if (el) el.classList.add('onboarding-highlight');
    }

    if (!prefersReducedMotion()) {
      const card = this.overlay.querySelector('.onboarding__card') as HTMLElement;
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95) translateY(10px)';
        requestAnimationFrame(() => {
          card.style.transition = `opacity ${DURATION.SLOW}ms ${EASING.EXPO_OUT}, transform ${DURATION.MODERATE}ms ${EASING.SPRING}`;
          card.style.opacity = '1';
          card.style.transform = 'scale(1) translateY(0)';
        });
      }
    }
  }

  private clearHighlights(): void {
    document.querySelectorAll('.onboarding-highlight').forEach(el => el.classList.remove('onboarding-highlight'));
  }

  private markComplete(): void {
    localStorage.setItem('ferni:onboarding:complete', 'true');
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .onboarding {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-silence, 34px);
        background: var(--backdrop-page);
        backdrop-filter: blur(var(--glass-blur-strong, 24px));
        -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .onboarding--visible { opacity: 1; visibility: visible; }

      .onboarding__card {
        width: 100%;
        max-width: 420px;
        padding: var(--ma-vastness, 55px) var(--ma-silence, 34px);
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-2xl, 2rem);
        box-shadow: var(--shadow-2xl, 0 24px 48px rgba(44, 37, 32, 0.15));
        text-align: center;
      }

      .onboarding__icon {
        width: 64px;
        height: 64px;
        margin: 0 auto var(--ma-rest, 21px);
        color: var(--color-accent-primary, #2d5a3d);
      }
      .onboarding__icon svg { width: 100%; height: 100%; }

      .onboarding__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .onboarding__description {
        font-family: var(--font-body);
        font-size: var(--text-base, 1rem);
        line-height: 1.6;
        color: var(--color-text-secondary, #5c544a);
        margin: 0 0 var(--ma-rest, 21px) 0;
      }

      .onboarding__dots {
        display: flex;
        justify-content: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--ma-rest, 21px);
      }

      .onboarding__dot {
        width: 8px;
        height: 8px;
        border-radius: var(--radius-full, 9999px);
        background: var(--color-border-medium, rgba(44, 37, 32, 0.15));
        transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }
      .onboarding__dot--active { width: 24px; background: var(--color-accent-primary, #2d5a3d); }

      .onboarding__actions {
        display: flex;
        justify-content: center;
        gap: var(--ma-breath, 13px);
      }

      .onboarding__btn {
        padding: var(--space-3, 12px) var(--space-6, 24px);
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        border: none;
        border-radius: var(--radius-lg, 0.75rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }
      .onboarding__btn--primary { background: var(--color-accent-primary, #2d5a3d); color: white; }
      .onboarding__btn--primary:hover { background: var(--color-accent-hover, #3a7050); transform: translateY(-1px); }
      .onboarding__btn--secondary { background: transparent; color: var(--color-text-muted, #756a5e); }
      .onboarding__btn--secondary:hover { color: var(--color-text-primary, #2c2520); background: var(--color-background-secondary, #f5f2ed); }

      .onboarding-highlight {
        position: relative;
        z-index: var(--z-dropdown);
        box-shadow: 0 0 0 4px var(--color-accent-primary, #2d5a3d), 0 0 0 8px rgba(45, 90, 61, 0.2), 0 0 20px rgba(45, 90, 61, 0.3);
        border-radius: var(--radius-lg, 0.75rem);
        animation: onboarding-pulse 2s infinite;
      }

      @keyframes onboarding-pulse {
        0%, 100% { box-shadow: 0 0 0 4px var(--color-accent-primary, #2d5a3d), 0 0 0 8px rgba(45, 90, 61, 0.2), 0 0 20px rgba(45, 90, 61, 0.3); }
        50% { box-shadow: 0 0 0 4px var(--color-accent-primary, #2d5a3d), 0 0 0 12px rgba(45, 90, 61, 0.1), 0 0 30px rgba(45, 90, 61, 0.2); }
      }

      [data-theme="midnight"] .onboarding { background: var(--backdrop-page); }
      [data-theme="midnight"] .onboarding__card { background: var(--color-background-elevated, #70605a); }
      [data-theme="midnight"] .onboarding__title { color: var(--color-text-primary, #faf6f0); }
      [data-theme="midnight"] .onboarding__description { color: var(--color-text-secondary, #f0ebe4); }
      [data-theme="midnight"] .onboarding__btn--secondary:hover { background: var(--color-background-secondary, #60504a); color: var(--color-text-primary, #faf6f0); }

      @media (prefers-reduced-motion: reduce) {
        .onboarding { transition: opacity ${DURATION.FAST}ms linear; }
        .onboarding__card { transition: none !important; transform: none !important; }
        .onboarding-highlight { animation: none; }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    this.hide();
    this.overlay?.remove();
    this.styleElement?.remove();
    this.overlay = null;
    this.styleElement = null;
  }
}

let instance: OnboardingUI | null = null;

export function getOnboardingUI(): OnboardingUI {
  if (!instance) instance = new OnboardingUI();
  return instance;
}

export function initOnboardingUI(): void {
  getOnboardingUI().initialize();
}

export function startOnboarding(): void {
  getOnboardingUI().start();
}

export function startOnboardingIfNeeded(): void {
  getOnboardingUI().startIfNeeded();
}

export default OnboardingUI;

