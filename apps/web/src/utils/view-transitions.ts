/**
 * View Transitions API Utilities
 *
 * Modern page transitions without layout thrash.
 * Gracefully degrades for browsers without support.
 *
 * @see https://developer.chrome.com/docs/web-platform/view-transitions/
 * @module @ferni/view-transitions
 */

import { prefersReducedMotion } from './accessibility.js';
import { createLogger } from './logger.js';

const log = createLogger('ViewTransitions');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Options for view transitions
 */
export interface ViewTransitionOptions {
  /** Named transition for CSS targeting */
  name?: string;
  /** Whether to use fallback for unsupported browsers */
  fallback?: boolean;
  /** Classes to add during transition */
  transitionClass?: string;
  /** Duration override in ms (CSS controls actual duration) */
  duration?: number;
}

/**
 * Extend Document interface for View Transitions API
 */
declare global {
  interface Document {
    startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
  }

  interface ViewTransition {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
    skipTransition(): void;
  }

  interface CSSStyleDeclaration {
    viewTransitionName: string;
  }
}

// ============================================================================
// FEATURE DETECTION
// ============================================================================

/**
 * Check if View Transitions API is supported
 */
export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document;
}

// ============================================================================
// CORE TRANSITION FUNCTION
// ============================================================================

/**
 * Execute a DOM update with a view transition effect.
 * Gracefully falls back to immediate update if unsupported.
 *
 * @example
 * ```typescript
 * await withViewTransition(() => {
 *   setActivePersona('maya');
 *   updateAvatarUI();
 * }, { name: 'persona-switch' });
 * ```
 */
export async function withViewTransition(
  callback: () => void | Promise<void>,
  options: ViewTransitionOptions = {}
): Promise<void> {
  const { name, fallback = true, transitionClass } = options;

  // Skip animation for reduced motion preference
  if (prefersReducedMotion()) {
    log.debug('Skipping view transition (reduced motion)');
    await callback();
    return;
  }

  // Fallback for unsupported browsers
  if (!supportsViewTransitions()) {
    if (fallback) {
      log.debug('View Transitions API not supported, using fallback');
      await callback();
    }
    return;
  }

  try {
    // Add transition class if specified
    if (transitionClass) {
      document.documentElement.classList.add(transitionClass);
    }

    // Start the view transition
    const transition = document.startViewTransition!(async () => {
      await callback();
    });

    // Wait for transition to complete
    await transition.finished;

    log.debug('View transition completed', { name });
  } catch (error) {
    log.warn('View transition failed, executing callback directly', { error });
    await callback();
  } finally {
    // Clean up transition class
    if (transitionClass) {
      document.documentElement.classList.remove(transitionClass);
    }
  }
}

// ============================================================================
// NAMED TRANSITION HELPERS
// ============================================================================

/**
 * Set a view-transition-name on an element for targeted CSS animations
 */
export function setTransitionName(element: HTMLElement, name: string): void {
  element.style.viewTransitionName = name;
}

/**
 * Clear view-transition-name from an element
 */
export function clearTransitionName(element: HTMLElement): void {
  element.style.viewTransitionName = '';
}

/**
 * Temporarily set transition name, execute callback, then clear
 */
export async function withTransitionName(
  element: HTMLElement,
  name: string,
  callback: () => void | Promise<void>
): Promise<void> {
  setTransitionName(element, name);
  await callback();
  clearTransitionName(element);
}

// ============================================================================
// PRESET TRANSITIONS
// ============================================================================

/**
 * Persona switch transition with avatar morph
 */
export async function transitionPersonaSwitch(
  callback: () => void | Promise<void>
): Promise<void> {
  const avatar = document.querySelector('#coachAvatar, .avatar-container') as HTMLElement;
  
  if (avatar) {
    setTransitionName(avatar, 'ferni-avatar');
  }
  
  await withViewTransition(callback, {
    name: 'persona-switch',
    transitionClass: 'persona-transitioning',
  });
  
  if (avatar) {
    clearTransitionName(avatar);
  }
}

/**
 * Modal open transition with scale-up effect
 */
export async function transitionModalOpen(
  callback: () => void | Promise<void>
): Promise<void> {
  await withViewTransition(callback, {
    name: 'modal-open',
    transitionClass: 'modal-opening',
  });
}

/**
 * Modal close transition with fade-out effect
 */
export async function transitionModalClose(
  callback: () => void | Promise<void>
): Promise<void> {
  await withViewTransition(callback, {
    name: 'modal-close',
    transitionClass: 'modal-closing',
  });
}

/**
 * Navigation transition (page change)
 */
export async function transitionNavigate(
  callback: () => void | Promise<void>
): Promise<void> {
  await withViewTransition(callback, {
    name: 'navigate',
    transitionClass: 'navigating',
  });
}

// ============================================================================
// CSS INJECTION
// ============================================================================

let stylesInjected = false;

/**
 * Inject view transition CSS styles
 */
export function injectViewTransitionStyles(): void {
  if (stylesInjected) return;
  if (typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.id = 'ferni-view-transitions';
  style.textContent = `
    /* ============================================
       VIEW TRANSITIONS - FERNI POLISH
       ============================================ */

    /* Default cross-fade for all view transitions */
    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation-duration: 300ms;
      animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Avatar morphs smoothly */
    ::view-transition-old(ferni-avatar),
    ::view-transition-new(ferni-avatar) {
      animation-duration: 400ms;
      animation-timing-function: cubic-bezier(0.5, 1.5, 0.5, 1);
    }

    /* Outgoing avatar shrinks and fades */
    ::view-transition-old(ferni-avatar) {
      animation: avatar-exit 400ms cubic-bezier(0.4, 0, 1, 1) forwards;
    }

    /* Incoming avatar grows and brightens */
    ::view-transition-new(ferni-avatar) {
      animation: avatar-enter 400ms cubic-bezier(0.5, 1.5, 0.5, 1) forwards;
    }

    @keyframes avatar-exit {
      from {
        opacity: 1;
        transform: scale(1) rotate(0deg);
      }
      to {
        opacity: 0;
        transform: scale(0.9) rotate(-5deg);
      }
    }

    @keyframes avatar-enter {
      from {
        opacity: 0;
        transform: scale(0.9) rotate(5deg);
      }
      to {
        opacity: 1;
        transform: scale(1) rotate(0deg);
      }
    }

    /* Modal transitions */
    .modal-opening ::view-transition-new(root) {
      animation: modal-scale-in 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .modal-closing ::view-transition-old(root) {
      animation: modal-scale-out 200ms ease-in forwards;
    }

    @keyframes modal-scale-in {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes modal-scale-out {
      from {
        opacity: 1;
        transform: scale(1);
      }
      to {
        opacity: 0;
        transform: scale(0.98);
      }
    }

    /* Persona transition state */
    .persona-transitioning {
      /* Prevent interaction during transition */
      pointer-events: none;
    }

    /* Reduced motion - instant transitions */
    @media (prefers-reduced-motion: reduce) {
      ::view-transition-old(*),
      ::view-transition-new(*) {
        animation: none !important;
      }
    }
  `;

  document.head.appendChild(style);
  stylesInjected = true;
  log.debug('View transition styles injected');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize view transitions system
 */
export function initViewTransitions(): void {
  if (supportsViewTransitions()) {
    injectViewTransitionStyles();
    log.info('View Transitions API initialized');
  } else {
    log.info('View Transitions API not supported - using fallbacks');
  }
}

