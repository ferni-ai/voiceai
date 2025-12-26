/**
 * Button Polish System
 *
 * Makes every button feel "physical" - tactile, responsive, alive.
 * "Buttons should feel like they want to be pressed."
 *
 * @module @ferni/button-polish
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { getHapticsService } from '../services/haptics.service.js';
import { prefersReducedMotion } from '../utils/accessibility.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ButtonPolish');

// ============================================================================
// TYPES
// ============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';

export interface ButtonPolishOptions {
  /** Button variant for styling */
  variant?: ButtonVariant;
  /** Enable haptic feedback */
  haptics?: boolean;
  /** Enable sound feedback */
  sound?: boolean;
  /** Scale factor on press (0-1) */
  pressScale?: number;
  /** Lift distance on hover (px) */
  hoverLift?: number;
  /** Enable ripple effect */
  ripple?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<ButtonPolishOptions> = {
  variant: 'secondary',
  haptics: true,
  sound: false,
  pressScale: 0.97,
  hoverLift: 2,
  ripple: true,
};

const BUTTON_SELECTORS = [
  'button:not([data-polished])',
  '.btn:not([data-polished])',
  '[role="button"]:not([data-polished])',
].join(', ');

// ============================================================================
// STATE
// ============================================================================

let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;

// ============================================================================
// STYLE INJECTION
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  if (typeof document === 'undefined') return;

  styleElement = document.createElement('style');
  styleElement.id = 'ferni-button-polish';
  styleElement.textContent = `
    /* ============================================
       BUTTON POLISH - TACTILE FEEDBACK
       ============================================ */

    /* Base button polish */
    .btn-polished {
      position: relative;
      overflow: hidden;
      transform-origin: center center;
      transition: 
        transform ${DURATION.FAST}ms ${EASING.SPRING},
        box-shadow ${DURATION.FAST}ms ${EASING.STANDARD},
        background ${DURATION.FAST}ms ${EASING.STANDARD};
      -webkit-tap-highlight-color: transparent;
    }

    /* Hover lift effect */
    .btn-polished:hover:not(:disabled):not(:active) {
      transform: translateY(var(--btn-hover-lift, -2px));
      box-shadow: 
        0 4px 12px var(--shadow-color, rgba(0, 0, 0, 0.1)),
        0 2px 4px var(--shadow-color, rgba(0, 0, 0, 0.05));
    }

    /* Press scale effect */
    .btn-polished:active:not(:disabled) {
      transform: scale(var(--btn-press-scale, 0.97));
      box-shadow: 
        0 1px 4px var(--shadow-color, rgba(0, 0, 0, 0.08));
      transition-duration: 50ms;
    }

    /* Focus ring */
    .btn-polished:focus-visible {
      outline: 2px solid var(--color-accent-primary, var(--persona-primary, #4a6741));
      outline-offset: 2px;
    }

    /* Disabled state */
    .btn-polished:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    /* ============================================
       RIPPLE EFFECT
       ============================================ */

    .btn-ripple {
      position: absolute;
      border-radius: 50%;
      background: var(--btn-ripple-color, rgba(255, 255, 255, 0.3));
      transform: scale(0);
      animation: ripple-expand ${DURATION.SLOW}ms ${EASING.EXPO_OUT} forwards;
      pointer-events: none;
    }

    @keyframes ripple-expand {
      to {
        transform: scale(2.5);
        opacity: 0;
      }
    }

    /* Dark variant ripple */
    .btn-polished--dark .btn-ripple {
      background: rgba(0, 0, 0, 0.15);
    }

    /* ============================================
       VARIANT-SPECIFIC STYLES
       ============================================ */

    /* Primary buttons - more prominent effects */
    .btn-polished--primary {
      --btn-press-scale: 0.96;
      --btn-hover-lift: -3px;
    }

    .btn-polished--primary:hover:not(:disabled):not(:active) {
      box-shadow: 
        0 6px 20px var(--persona-primary-alpha, rgba(74, 103, 65, 0.25)),
        0 3px 8px var(--shadow-color, rgba(0, 0, 0, 0.1));
    }

    /* Ghost buttons - subtle effects */
    .btn-polished--ghost {
      --btn-press-scale: 0.98;
      --btn-hover-lift: 0px;
    }

    .btn-polished--ghost:hover:not(:disabled) {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
    }

    /* Icon buttons - circular ripple */
    .btn-polished--icon {
      --btn-press-scale: 0.92;
      --btn-hover-lift: 0px;
      --btn-ripple-color: var(--persona-tint, rgba(74, 103, 65, 0.2));
    }

    .btn-polished--icon:hover:not(:disabled) {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
    }

    /* Danger buttons */
    .btn-polished--danger:hover:not(:disabled):not(:active) {
      box-shadow: 
        0 4px 12px var(--color-semantic-error-alpha, rgba(200, 100, 100, 0.2));
    }

    /* ============================================
       LOADING STATE
       ============================================ */

    .btn-polished--loading {
      pointer-events: none;
      position: relative;
    }

    .btn-polished--loading::after {
      content: '';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: inherit;
      border-radius: inherit;
    }

    .btn-polished--loading .btn-content {
      visibility: hidden;
    }

    .btn-polished--loading .btn-spinner {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ============================================
       REDUCED MOTION
       ============================================ */

    @media (prefers-reduced-motion: reduce) {
      .btn-polished {
        transition: none !important;
      }

      .btn-polished:hover:not(:disabled):not(:active),
      .btn-polished:active:not(:disabled) {
        transform: none !important;
      }

      .btn-ripple {
        animation: none !important;
        display: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
  log.debug('Button polish styles injected');
}

// ============================================================================
// RIPPLE EFFECT
// ============================================================================

function createRipple(event: MouseEvent, element: HTMLElement): void {
  if (prefersReducedMotion()) return;

  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  const ripple = document.createElement('span');
  ripple.className = 'btn-ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  element.appendChild(ripple);

  // Clean up after animation
  ripple.addEventListener('animationend', () => {
    ripple.remove();
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize button polish system
 */
export function initButtonPolish(): void {
  if (isInitialized) return;
  if (typeof document === 'undefined') return;

  injectStyles();
  isInitialized = true;
  log.info('Button polish system initialized');
}

/**
 * Apply polish to a single button
 */
export function polishButton(
  button: HTMLElement,
  options: ButtonPolishOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Mark as polished
  button.dataset.polished = 'true';
  button.classList.add('btn-polished');

  // Apply variant
  if (opts.variant) {
    button.classList.add(`btn-polished--${opts.variant}`);
  }

  // Set CSS custom properties
  button.style.setProperty('--btn-press-scale', opts.pressScale.toString());
  button.style.setProperty('--btn-hover-lift', `${opts.hoverLift}px`);

  // Ripple effect
  if (opts.ripple) {
    button.addEventListener('pointerdown', (e) => {
      if (button.hasAttribute('disabled')) return;
      createRipple(e, button);
    });
  }

  // Haptic feedback
  if (opts.haptics) {
    button.addEventListener('pointerdown', () => {
      if (button.hasAttribute('disabled')) return;
      getHapticsService().play('buttonPress');
    });
  }

  log.debug('Button polished', { variant: opts.variant });
}

/**
 * Auto-polish all buttons matching selectors
 */
export function polishAllButtons(options: ButtonPolishOptions = {}): void {
  const buttons = document.querySelectorAll<HTMLElement>(BUTTON_SELECTORS);

  buttons.forEach((button) => {
    // Detect variant from classes
    let variant: ButtonVariant = options.variant ?? 'secondary';

    if (button.classList.contains('btn-primary') || button.classList.contains('primary')) {
      variant = 'primary';
    } else if (button.classList.contains('btn-ghost') || button.classList.contains('ghost')) {
      variant = 'ghost';
    } else if (button.classList.contains('btn-danger') || button.classList.contains('danger')) {
      variant = 'danger';
    } else if (button.classList.contains('btn-icon') || button.classList.contains('icon-btn')) {
      variant = 'icon';
    }

    polishButton(button, { ...options, variant });
  });

  log.info('Polished all buttons', { count: buttons.length });
}

/**
 * Set button loading state
 */
export function setButtonLoading(button: HTMLElement, loading: boolean): void {
  if (loading) {
    button.classList.add('btn-polished--loading');
    button.setAttribute('aria-busy', 'true');

    // Wrap existing content
    if (!button.querySelector('.btn-content')) {
      const content = document.createElement('span');
      content.className = 'btn-content';
      content.innerHTML = button.innerHTML;
      button.innerHTML = '';
      button.appendChild(content);

      // Add spinner
      const spinner = document.createElement('span');
      spinner.className = 'btn-spinner';
      spinner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="8" cy="8" r="6" stroke-opacity="0.25"/>
          <path d="M14 8a6 6 0 0 0-6-6" stroke-linecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1s" repeatCount="indefinite"/>
          </path>
        </svg>
      `;
      button.appendChild(spinner);
    }
  } else {
    button.classList.remove('btn-polished--loading');
    button.setAttribute('aria-busy', 'false');

    // Restore content
    const content = button.querySelector('.btn-content');
    const spinner = button.querySelector('.btn-spinner');

    if (content && spinner) {
      button.innerHTML = content.innerHTML;
      spinner.remove();
    }
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Dispose button polish system
 */
export function disposeButtonPolish(): void {
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  // Remove polished class from all buttons
  document.querySelectorAll<HTMLElement>('[data-polished]').forEach((button) => {
    button.classList.remove('btn-polished');
    // Remove all modifier classes matching btn-polished--*
    Array.from(button.classList)
      .filter((cls) => cls.startsWith('btn-polished--'))
      .forEach((cls) => button.classList.remove(cls));
    delete button.dataset.polished;
  });

  isInitialized = false;
  log.debug('Button polish disposed');
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const buttonPolish = {
  init: initButtonPolish,
  polish: polishButton,
  polishAll: polishAllButtons,
  setLoading: setButtonLoading,
  dispose: disposeButtonPolish,
};

