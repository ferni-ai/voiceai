/**
 * Accessibility Utilities
 *
 * WCAG 2.1 AA compliant utilities for Ferni UI.
 * Ensures all interactive elements are accessible.
 */

// ============================================================================
// FOCUS MANAGEMENT
// ============================================================================

/**
 * Trap focus within a container (for modals)
 */
export function trapFocus(container: HTMLElement): () => void {
  const focusableSelectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  const focusableElements = container.querySelectorAll<HTMLElement>(focusableSelectors);
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable?.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable?.focus();
      }
    }
  };

  container.addEventListener('keydown', handleKeydown);
  firstFocusable?.focus();

  return () => {
    container.removeEventListener('keydown', handleKeydown);
  };
}

/**
 * Announce message to screen readers
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const announcer = getOrCreateAnnouncer(priority);
  announcer.textContent = '';
  // Use setTimeout to ensure the change is announced
  setTimeout(() => {
    announcer.textContent = message;
  }, 100);
}

function getOrCreateAnnouncer(priority: 'polite' | 'assertive'): HTMLElement {
  const id = `aria-live-${priority}`;
  let announcer = document.getElementById(id);
  
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = id;
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    document.body.appendChild(announcer);
  }
  
  return announcer;
}

// ============================================================================
// KEYBOARD NAVIGATION
// ============================================================================

/**
 * Handle arrow key navigation in a list
 */
export function handleArrowNavigation(
  container: HTMLElement,
  selector: string,
  options: { wrap?: boolean; orientation?: 'horizontal' | 'vertical' | 'both' } = {}
): () => void {
  const { wrap = true, orientation = 'vertical' } = options;

  const handleKeydown = (e: KeyboardEvent) => {
    const items = Array.from(container.querySelectorAll<HTMLElement>(selector));
    if (items.length === 0) return;

    const currentIndex = items.findIndex(item => item === document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    const isVertical = orientation === 'vertical' || orientation === 'both';
    const isHorizontal = orientation === 'horizontal' || orientation === 'both';

    if ((e.key === 'ArrowDown' && isVertical) || (e.key === 'ArrowRight' && isHorizontal)) {
      e.preventDefault();
      nextIndex = wrap ? (currentIndex + 1) % items.length : Math.min(currentIndex + 1, items.length - 1);
    } else if ((e.key === 'ArrowUp' && isVertical) || (e.key === 'ArrowLeft' && isHorizontal)) {
      e.preventDefault();
      nextIndex = wrap ? (currentIndex - 1 + items.length) % items.length : Math.max(currentIndex - 1, 0);
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = items.length - 1;
    }

    if (nextIndex !== currentIndex) {
      items[nextIndex]?.focus();
    }
  };

  container.addEventListener('keydown', handleKeydown);
  return () => container.removeEventListener('keydown', handleKeydown);
}

// ============================================================================
// COLOR CONTRAST
// ============================================================================

/**
 * Calculate relative luminance of a color
 */
function getLuminance(r: number, g: number, b: number): number {
  const mapped = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const rs = mapped[0] ?? 0;
  const gs = mapped[1] ?? 0;
  const bs = mapped[2] ?? 0;
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1: string, color2: string): number {
  const parseColor = (color: string): [number, number, number] => {
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b];
    }
    // Handle rgb/rgba
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match && match[1] && match[2] && match[3]) {
      return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
    }
    return [0, 0, 0];
  };

  const [r1, g1, b1] = parseColor(color1);
  const [r2, g2, b2] = parseColor(color2);

  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast meets WCAG AA standards
 */
export function meetsContrastAA(
  foreground: string,
  background: string,
  size: 'normal' | 'large' = 'normal'
): boolean {
  const ratio = getContrastRatio(foreground, background);
  const minRatio = size === 'large' ? 3 : 4.5;
  return ratio >= minRatio;
}

// ============================================================================
// REDUCED MOTION
// ============================================================================

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Listen for reduced motion preference changes
 */
export function onReducedMotionChange(callback: (prefersReduced: boolean) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  mediaQuery.addEventListener('change', handler);
  return () => mediaQuery.removeEventListener('change', handler);
}

// ============================================================================
// SKIP LINKS
// ============================================================================

/**
 * Create skip link for keyboard navigation
 */
export function createSkipLink(targetId: string, text: string = 'Skip to main content'): HTMLElement {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.className = 'skip-link';
  skipLink.textContent = text;
  skipLink.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus();
      target.removeAttribute('tabindex');
    }
  });
  return skipLink;
}

// ============================================================================
// ARIA UTILITIES
// ============================================================================

/**
 * Set up ARIA attributes for a disclosure pattern
 */
export function setupDisclosure(
  trigger: HTMLElement,
  content: HTMLElement,
  initiallyExpanded: boolean = false
): { expand: () => void; collapse: () => void; toggle: () => void } {
  const contentId = content.id || `disclosure-${Math.random().toString(36).slice(2)}`;
  content.id = contentId;

  trigger.setAttribute('aria-expanded', String(initiallyExpanded));
  trigger.setAttribute('aria-controls', contentId);
  content.setAttribute('aria-hidden', String(!initiallyExpanded));

  const expand = () => {
    trigger.setAttribute('aria-expanded', 'true');
    content.setAttribute('aria-hidden', 'false');
  };

  const collapse = () => {
    trigger.setAttribute('aria-expanded', 'false');
    content.setAttribute('aria-hidden', 'true');
  };

  const toggle = () => {
    const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
    isExpanded ? collapse() : expand();
  };

  trigger.addEventListener('click', toggle);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  return { expand, collapse, toggle };
}

/**
 * Set up ARIA attributes for a modal dialog
 */
export function setupDialog(
  dialog: HTMLElement,
  title: string,
  options: { labelledBy?: string; describedBy?: string } = {}
): { open: () => void; close: () => void } {
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  
  if (options.labelledBy) {
    dialog.setAttribute('aria-labelledby', options.labelledBy);
  } else {
    dialog.setAttribute('aria-label', title);
  }
  
  if (options.describedBy) {
    dialog.setAttribute('aria-describedby', options.describedBy);
  }

  let cleanup: (() => void) | null = null;
  let previousActiveElement: Element | null = null;

  const open = () => {
    previousActiveElement = document.activeElement;
    dialog.setAttribute('aria-hidden', 'false');
    cleanup = trapFocus(dialog);
    announce(`${title} dialog opened`, 'assertive');
  };

  const close = () => {
    dialog.setAttribute('aria-hidden', 'true');
    cleanup?.();
    if (previousActiveElement instanceof HTMLElement) {
      previousActiveElement.focus();
    }
    announce(`${title} dialog closed`, 'polite');
  };

  return { open, close };
}

// ============================================================================
// SCREEN READER ONLY STYLES (inject once)
// ============================================================================

let srStylesInjected = false;

export function injectScreenReaderStyles(): void {
  if (srStylesInjected) return;

  const style = document.createElement('style');
  style.textContent = `
    .sr-only {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    .skip-link {
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--color-accent-primary, #2d5a3d);
      color: white;
      padding: 8px 16px;
      z-index: 10000;
      text-decoration: none;
      font-weight: 500;
      border-radius: 0 0 4px 0;
    }

    .skip-link:focus {
      top: 0;
    }

    /* High contrast mode support */
    @media (forced-colors: active) {
      .skip-link {
        background: Canvas;
        color: CanvasText;
        border: 2px solid CanvasText;
      }
    }
  `;
  document.head.appendChild(style);
  srStylesInjected = true;
}

// Initialize on import
injectScreenReaderStyles();

