/**
 * iOS Touch Compatibility Utilities
 *
 * iOS Safari has several quirks with touch events on dynamically created elements:
 * 1. Click events sometimes don't fire
 * 2. Touch events need special handling
 * 3. Safe area insets need to be respected
 *
 * This module provides utilities to handle these issues consistently.
 */

import { createLogger } from './logger.js';

const log = createLogger('iOSTouch');

// ============================================================================
// TYPES
// ============================================================================

export interface TapListenerOptions {
  /** Stop event propagation */
  stopPropagation?: boolean;
  /** Prevent default behavior */
  preventDefault?: boolean;
  /** Only trigger on single-finger taps */
  singleFingerOnly?: boolean;
}

type TapHandler = (e: Event) => void | Promise<void>;

// Track cleanup functions for each element
const cleanupMap = new WeakMap<Element, (() => void)[]>();

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Detect if we're running on iOS Safari
 */
export function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || 
    (ua.includes('Mac') && 'ontouchend' in document);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  
  return isIOS && isSafari;
}

/**
 * Detect if we're on any mobile device
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    window.navigator.userAgent
  ) || window.matchMedia('(max-width: 768px)').matches;
}

/**
 * Detect if touch is the primary input
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  return 'ontouchstart' in window || 
    navigator.maxTouchPoints > 0;
}

// ============================================================================
// TAP LISTENER
// ============================================================================

/**
 * Add iOS-compatible tap listener that handles both click and touch events.
 * 
 * iOS Safari sometimes doesn't fire click events on dynamically created elements,
 * so we listen for both click and touchend, with deduplication.
 * 
 * @param element - The element to add the listener to
 * @param handler - The tap handler function
 * @param options - Configuration options
 * @returns Cleanup function to remove all listeners
 * 
 * @example
 * ```typescript
 * const cleanup = addTapListener(button, (e) => {
 *   console.log('Tapped!');
 * });
 * 
 * // Later, to remove:
 * cleanup();
 * ```
 */
export function addTapListener(
  element: Element | null,
  handler: TapHandler,
  options: TapListenerOptions = {}
): () => void {
  if (!element) {
    return () => {};
  }

  const {
    stopPropagation = false,
    preventDefault = false,
    singleFingerOnly = true,
  } = options;

  // Track if touch just happened to prevent double-firing
  let touchJustHappened = false;
  let touchTimeout: ReturnType<typeof setTimeout> | null = null;

  const clickHandler = (e: Event) => {
    // If touch just happened, skip click to prevent double-fire
    if (touchJustHappened) {
      log.debug('Skipping click after touch');
      return;
    }

    if (stopPropagation) e.stopPropagation();
    if (preventDefault) e.preventDefault();

    void handler(e);
  };

  const touchEndHandler = (e: Event) => {
    const touch = e as TouchEvent;

    // Only handle single-finger taps if configured
    if (singleFingerOnly && touch.touches && touch.touches.length > 0) {
      return;
    }

    // Mark that touch happened
    touchJustHappened = true;
    
    // Clear any existing timeout
    if (touchTimeout) {
      clearTimeout(touchTimeout);
    }
    
    // Reset after a short delay
    touchTimeout = setTimeout(() => {
      touchJustHappened = false;
    }, 300);

    if (stopPropagation) e.stopPropagation();
    
    // Always prevent default on touchend to avoid ghost clicks
    e.preventDefault();

    void handler(e);
  };

  // Add listeners
  element.addEventListener('click', clickHandler);
  element.addEventListener('touchend', touchEndHandler, { passive: false });

  // Create cleanup function
  const cleanup = () => {
    element.removeEventListener('click', clickHandler);
    element.removeEventListener('touchend', touchEndHandler);
    if (touchTimeout) {
      clearTimeout(touchTimeout);
    }
  };

  // Track cleanup for this element
  const existing = cleanupMap.get(element) || [];
  existing.push(cleanup);
  cleanupMap.set(element, existing);

  return cleanup;
}

/**
 * Add tap listeners to multiple elements matching a selector within a container.
 * 
 * @param container - The container element to search within
 * @param selector - CSS selector for target elements
 * @param handler - Handler that receives the clicked element
 * @param options - Configuration options
 * @returns Cleanup function to remove all listeners
 * 
 * @example
 * ```typescript
 * const cleanup = addTapListeners(modal, '.btn', (e, el) => {
 *   const action = el.dataset.action;
 *   handleAction(action);
 * });
 * ```
 */
export function addTapListeners(
  container: Element | null,
  selector: string,
  handler: (e: Event, element: HTMLElement) => void | Promise<void>,
  options: TapListenerOptions = {}
): () => void {
  if (!container) {
    return () => {};
  }

  const cleanups: (() => void)[] = [];

  container.querySelectorAll(selector).forEach((el) => {
    const cleanup = addTapListener(
      el,
      (e) => handler(e, el as HTMLElement),
      options
    );
    cleanups.push(cleanup);
  });

  return () => {
    cleanups.forEach((fn) => fn());
  };
}

/**
 * Clean up all tap listeners on an element and its descendants.
 * Call this when removing elements from the DOM.
 */
export function cleanupTapListeners(element: Element): void {
  // Clean up this element
  const cleanups = cleanupMap.get(element);
  if (cleanups) {
    cleanups.forEach((fn) => fn());
    cleanupMap.delete(element);
  }

  // Clean up descendants
  element.querySelectorAll('*').forEach((child) => {
    const childCleanups = cleanupMap.get(child);
    if (childCleanups) {
      childCleanups.forEach((fn) => fn());
      cleanupMap.delete(child);
    }
  });
}

// ============================================================================
// SAFE AREA UTILITIES
// ============================================================================

/**
 * Get the current safe area insets.
 * Returns zeros if safe areas aren't supported.
 */
export function getSafeAreaInsets(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (typeof window === 'undefined' || typeof getComputedStyle === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const style = getComputedStyle(document.documentElement);
  
  const parseInset = (prop: string): number => {
    const value = style.getPropertyValue(prop);
    return value ? parseInt(value, 10) || 0 : 0;
  };

  return {
    top: parseInset('--safe-area-inset-top') || parseInset('padding-top'),
    right: parseInset('--safe-area-inset-right') || parseInset('padding-right'),
    bottom: parseInset('--safe-area-inset-bottom') || parseInset('padding-bottom'),
    left: parseInset('--safe-area-inset-left') || parseInset('padding-left'),
  };
}

/**
 * Apply safe area padding to an element.
 * Use CSS env() instead when possible, but this is useful for JS-driven layouts.
 */
export function applySafeAreaPadding(
  element: HTMLElement,
  options: {
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
    additionalPadding?: number;
  } = {}
): void {
  const { top = false, right = false, bottom = false, left = false, additionalPadding = 0 } = options;
  const add = additionalPadding;

  if (top) {
    element.style.paddingTop = `calc(${add}px + env(safe-area-inset-top, 0px))`;
  }
  if (right) {
    element.style.paddingRight = `calc(${add}px + env(safe-area-inset-right, 0px))`;
  }
  if (bottom) {
    element.style.paddingBottom = `calc(${add}px + env(safe-area-inset-bottom, 0px))`;
  }
  if (left) {
    element.style.paddingLeft = `calc(${add}px + env(safe-area-inset-left, 0px))`;
  }
}

// ============================================================================
// SCROLL FIXES
// ============================================================================

/**
 * Enable smooth iOS scrolling in a container.
 * Fixes common iOS Safari scroll issues.
 */
export function enableIOSScrolling(container: HTMLElement): void {
  // Enable momentum scrolling
  container.style.setProperty('-webkit-overflow-scrolling', 'touch');
  
  // Prevent overscroll bounce from affecting layout
  container.style.overscrollBehavior = 'contain';
  
  // Ensure it's scrollable
  container.style.overflowY = 'auto';
}

/**
 * Prevent body scroll when a modal is open (iOS Safari fix).
 * Returns cleanup function.
 */
export function preventBodyScroll(): () => void {
  const scrollY = window.scrollY;
  
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflowY = 'scroll'; // Prevent layout shift
  
  return () => {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflowY = '';
    window.scrollTo(0, scrollY);
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const iosTouchUtils = {
  isIOSSafari,
  isMobile,
  isTouchDevice,
  addTapListener,
  addTapListeners,
  cleanupTapListeners,
  getSafeAreaInsets,
  applySafeAreaPadding,
  enableIOSScrolling,
  preventBodyScroll,
};

export default iosTouchUtils;

