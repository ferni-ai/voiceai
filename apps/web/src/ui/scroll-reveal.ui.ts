/**
 * Scroll Reveal Animation System
 *
 * Content fades in beautifully as it enters viewport.
 * Uses IntersectionObserver with CSS animation-timeline fallback.
 *
 * @module @ferni/scroll-reveal
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { prefersReducedMotion } from '../utils/accessibility.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ScrollReveal');

// ============================================================================
// TYPES
// ============================================================================

export type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'scale' | 'fade';

export interface ScrollRevealOptions {
  /** Direction of reveal animation */
  direction?: RevealDirection;
  /** Delay in ms before animation starts */
  delay?: number;
  /** Duration in ms */
  duration?: number;
  /** Threshold (0-1) of element visibility to trigger */
  threshold?: number;
  /** Distance to travel during reveal (px) */
  distance?: number;
  /** Whether to only animate once */
  once?: boolean;
  /** Easing function */
  easing?: string;
  /** Stagger delay for sibling elements (ms) */
  stagger?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<ScrollRevealOptions> = {
  direction: 'up',
  delay: 0,
  duration: DURATION.SLOW,
  threshold: 0.15,
  distance: 20,
  once: true,
  easing: EASING.EXPO_OUT,
  stagger: 50,
};

const REVEAL_CLASS = 'scroll-reveal';
const REVEALED_CLASS = 'scroll-reveal--revealed';
const OBSERVING_CLASS = 'scroll-reveal--observing';

// ============================================================================
// STATE
// ============================================================================

let observer: IntersectionObserver | null = null;
let styleElement: HTMLStyleElement | null = null;
const observedElements = new WeakMap<Element, ScrollRevealOptions>();

// ============================================================================
// STYLE INJECTION
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  if (typeof document === 'undefined') return;

  styleElement = document.createElement('style');
  styleElement.id = 'ferni-scroll-reveal';
  styleElement.textContent = `
    /* ============================================
       SCROLL REVEAL ANIMATIONS
       ============================================ */

    .scroll-reveal {
      /* Initial hidden state */
      opacity: 0;
      will-change: opacity, transform;
    }

    .scroll-reveal--observing {
      /* Ready to be revealed */
    }

    .scroll-reveal--revealed {
      opacity: 1;
      transform: none !important;
      will-change: auto;
    }

    /* Direction-specific initial transforms */
    .scroll-reveal[data-reveal-direction="up"] {
      transform: translateY(var(--reveal-distance, 20px));
    }

    .scroll-reveal[data-reveal-direction="down"] {
      transform: translateY(calc(var(--reveal-distance, 20px) * -1));
    }

    .scroll-reveal[data-reveal-direction="left"] {
      transform: translateX(var(--reveal-distance, 20px));
    }

    .scroll-reveal[data-reveal-direction="right"] {
      transform: translateX(calc(var(--reveal-distance, 20px) * -1));
    }

    .scroll-reveal[data-reveal-direction="scale"] {
      transform: scale(0.95);
    }

    .scroll-reveal[data-reveal-direction="fade"] {
      transform: none;
    }

    /* Stagger support */
    .scroll-reveal[data-stagger-index] {
      transition-delay: calc(var(--stagger-delay, 50ms) * var(--stagger-index, 0));
    }

    /* Reduced motion - instant reveal */
    @media (prefers-reduced-motion: reduce) {
      .scroll-reveal,
      .scroll-reveal--revealed {
        opacity: 1 !important;
        transform: none !important;
        transition: none !important;
        animation: none !important;
      }
    }

    /* ============================================
       CSS SCROLL-TIMELINE (Progressive Enhancement)
       For browsers that support it (Chrome 115+)
       ============================================ */
    @supports (animation-timeline: view()) {
      .scroll-reveal--timeline {
        animation: scrollRevealTimeline linear both;
        animation-timeline: view();
        animation-range: entry 0% entry 40%;
      }

      @keyframes scrollRevealTimeline {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    }
  `;

  document.head.appendChild(styleElement);
  log.debug('Scroll reveal styles injected');
}

// ============================================================================
// INTERSECTION OBSERVER
// ============================================================================

function getObserver(): IntersectionObserver {
  if (observer) return observer;

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const element = entry.target as HTMLElement;
        const options = observedElements.get(element) || DEFAULT_OPTIONS;

        if (entry.isIntersecting) {
          // Reveal the element
          revealElement(element, options);

          // Stop observing if once is true
          if (options.once) {
            observer?.unobserve(element);
            observedElements.delete(element);
          }
        } else if (!options.once) {
          // Hide again if not once
          hideElement(element, options);
        }
      });
    },
    {
      threshold: [0, 0.15, 0.3, 0.5],
      rootMargin: '0px 0px -50px 0px',
    }
  );

  return observer;
}

// ============================================================================
// REVEAL/HIDE FUNCTIONS
// ============================================================================

function revealElement(element: HTMLElement, options: ScrollRevealOptions): void {
  const delay = options.delay || 0;
  const duration = options.duration || DEFAULT_OPTIONS.duration;
  const easing = options.easing || DEFAULT_OPTIONS.easing;

  // Set transition
  element.style.transition = `
    opacity ${duration}ms ${easing} ${delay}ms,
    transform ${duration}ms ${easing} ${delay}ms
  `;

  // Trigger reveal
  requestAnimationFrame(() => {
    element.classList.add(REVEALED_CLASS);
    element.classList.remove(OBSERVING_CLASS);
  });

  log.debug('Revealed element', { direction: options.direction });
}

function hideElement(element: HTMLElement, _options: ScrollRevealOptions): void {
  element.classList.remove(REVEALED_CLASS);
  element.classList.add(OBSERVING_CLASS);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize scroll reveal system
 */
export function initScrollReveal(): void {
  if (typeof document === 'undefined') return;

  injectStyles();
  log.info('Scroll reveal system initialized');
}

/**
 * Observe an element for scroll reveal
 *
 * @example
 * ```typescript
 * observe(element, { direction: 'up', delay: 100 });
 * ```
 */
export function observe(
  element: HTMLElement,
  options: ScrollRevealOptions = {}
): void {
  if (prefersReducedMotion()) {
    // Skip animation, just show element
    element.style.opacity = '1';
    element.style.transform = 'none';
    return;
  }

  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Set up element
  element.classList.add(REVEAL_CLASS, OBSERVING_CLASS);
  element.dataset.revealDirection = mergedOptions.direction;
  element.style.setProperty('--reveal-distance', `${mergedOptions.distance}px`);

  // Store options
  observedElements.set(element, mergedOptions);

  // Start observing
  getObserver().observe(element);
}

/**
 * Observe multiple elements with staggered delays
 *
 * @example
 * ```typescript
 * observeStaggered(
 *   document.querySelectorAll('.card'),
 *   { direction: 'up', stagger: 50 }
 * );
 * ```
 */
export function observeStaggered(
  elements: NodeListOf<HTMLElement> | HTMLElement[],
  options: ScrollRevealOptions = {}
): void {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const stagger = mergedOptions.stagger;

  Array.from(elements).forEach((element, index) => {
    element.style.setProperty('--stagger-index', index.toString());
    element.style.setProperty('--stagger-delay', `${stagger}ms`);
    element.dataset.staggerIndex = index.toString();

    observe(element, {
      ...mergedOptions,
      delay: (mergedOptions.delay || 0) + index * stagger,
    });
  });
}

/**
 * Stop observing an element
 */
export function unobserve(element: HTMLElement): void {
  getObserver().unobserve(element);
  observedElements.delete(element);
  element.classList.remove(REVEAL_CLASS, REVEALED_CLASS, OBSERVING_CLASS);
}

/**
 * Stop observing all elements
 */
export function unobserveAll(): void {
  observer?.disconnect();
  observer = null;
}

/**
 * Manually reveal an element (skip scroll trigger)
 */
export function forceReveal(element: HTMLElement): void {
  const options = observedElements.get(element) || DEFAULT_OPTIONS;
  revealElement(element, options);
}

/**
 * Apply scroll reveal to elements matching selector
 *
 * @example
 * ```typescript
 * autoReveal('.card', { direction: 'up', stagger: 50 });
 * ```
 */
export function autoReveal(
  selector: string,
  options: ScrollRevealOptions = {}
): void {
  const elements = document.querySelectorAll<HTMLElement>(selector);

  if (elements.length === 0) {
    log.debug('No elements found for selector', { selector });
    return;
  }

  if (elements.length > 1 && options.stagger) {
    observeStaggered(elements, options);
  } else {
    elements.forEach((el) => observe(el, options));
  }

  log.debug('Auto-reveal applied', { selector, count: elements.length });
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Dispose scroll reveal system
 */
export function disposeScrollReveal(): void {
  unobserveAll();

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  log.debug('Scroll reveal disposed');
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const scrollReveal = {
  init: initScrollReveal,
  observe,
  observeStaggered,
  unobserve,
  unobserveAll,
  forceReveal,
  autoReveal,
  dispose: disposeScrollReveal,
};

