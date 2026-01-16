/**
 * Accessibility Utilities
 * 
 * Helpers for building WCAG AAA compliant interfaces.
 * 
 * Standards:
 * - WCAG 2.1 AAA compliance
 * - Screen reader optimized
 * - Keyboard navigation
 * - Reduced motion support
 * - High contrast support
 */

// =============================================================================
// Types
// =============================================================================

export interface ContrastResult {
  ratio: number;
  level: 'AAA' | 'AA' | 'A' | 'fail';
  passes: {
    normalText: boolean;    // 7:1 for AAA, 4.5:1 for AA
    largeText: boolean;     // 4.5:1 for AAA, 3:1 for AA
    uiComponents: boolean;  // 3:1 minimum
  };
}

export interface FocusableElement {
  element: HTMLElement;
  tabIndex: number;
  role?: string;
  label?: string;
}

export interface A11yAuditResult {
  score: number; // 0-100
  issues: A11yIssue[];
  passed: string[];
}

export interface A11yIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  element?: HTMLElement;
  fix?: string;
}

// =============================================================================
// Color Contrast
// =============================================================================

/**
 * Calculate relative luminance of a color
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast meets WCAG standards
 */
export function checkContrast(foreground: string, background: string): ContrastResult {
  const ratio = getContrastRatio(foreground, background);
  
  let level: ContrastResult['level'] = 'fail';
  if (ratio >= 7) level = 'AAA';
  else if (ratio >= 4.5) level = 'AA';
  else if (ratio >= 3) level = 'A';

  return {
    ratio: Math.round(ratio * 100) / 100,
    level,
    passes: {
      normalText: ratio >= 4.5,   // AA for normal text
      largeText: ratio >= 3,      // AA for large text (18pt+)
      uiComponents: ratio >= 3,   // WCAG 2.1 for UI components
    },
  };
}

/**
 * Suggest accessible color alternatives
 */
export function suggestAccessibleColor(
  foreground: string,
  background: string,
  targetRatio: number = 4.5
): string {
  const currentRatio = getContrastRatio(foreground, background);
  if (currentRatio >= targetRatio) return foreground;

  const fgRgb = hexToRgb(foreground);
  const bgLuminance = getLuminance(background);
  
  if (!fgRgb) return foreground;

  // Determine if we need to lighten or darken
  const shouldDarken = bgLuminance > 0.5;
  
  // Iteratively adjust until we meet target
  let adjustedRgb = { ...fgRgb };
  for (let i = 0; i < 100; i++) {
    const factor = shouldDarken ? 0.95 : 1.05;
    adjustedRgb = {
      r: Math.max(0, Math.min(255, Math.round(adjustedRgb.r * factor))),
      g: Math.max(0, Math.min(255, Math.round(adjustedRgb.g * factor))),
      b: Math.max(0, Math.min(255, Math.round(adjustedRgb.b * factor))),
    };
    
    const adjustedHex = rgbToHex(adjustedRgb.r, adjustedRgb.g, adjustedRgb.b);
    if (getContrastRatio(adjustedHex, background) >= targetRatio) {
      return adjustedHex;
    }
  }

  return shouldDarken ? '#000000' : '#FFFFFF';
}

// =============================================================================
// Focus Management
// =============================================================================

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
  'audio[controls]',
  'video[controls]',
  'details > summary',
].join(', ');

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(container: HTMLElement = document.body): FocusableElement[] {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
  
  return elements
    .filter((el) => {
      // Check if visible
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map((element) => ({
      element,
      tabIndex: element.tabIndex,
      role: element.getAttribute('role') || undefined,
      label: getAccessibleName(element),
    }));
}

/**
 * Trap focus within a container (for modals)
 */
export function trapFocus(container: HTMLElement): () => void {
  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) return () => {};

  const firstElement = focusableElements[0].element;
  const lastElement = focusableElements[focusableElements.length - 1].element;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  container.addEventListener('keydown', handleKeyDown);
  firstElement.focus();

  // Return cleanup function
  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Create a focus ring style
 */
export function createFocusRing(color: string = '#4a6741'): string {
  return `
    outline: 2px solid ${color};
    outline-offset: 2px;
    border-radius: 4px;
  `;
}

// =============================================================================
// Screen Reader Utilities
// =============================================================================

/**
 * Get the accessible name of an element
 */
export function getAccessibleName(element: HTMLElement): string {
  // aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) return labelElement.textContent || '';
  }

  // Associated label element
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${element.id}"]`);
    if (label) return label.textContent || '';
  }

  // Text content
  return element.textContent?.trim() || '';
}

/**
 * Announce text to screen readers
 */
export function announce(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.style.cssText = `
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `;
  
  document.body.appendChild(announcement);
  
  // Delay to ensure screen reader picks up change
  setTimeout(() => {
    announcement.textContent = message;
  }, 100);
  
  // Remove after announcement
  setTimeout(() => {
    announcement.remove();
  }, 1000);
}

/**
 * Create visually hidden text (for screen readers only)
 */
export function createScreenReaderText(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'sr-only';
  span.textContent = text;
  span.style.cssText = `
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `;
  return span;
}

// =============================================================================
// Reduced Motion
// =============================================================================

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Subscribe to reduced motion preference changes
 */
export function onReducedMotionChange(callback: (reduced: boolean) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  
  mediaQuery.addEventListener('change', handler);
  
  // Initial call
  callback(mediaQuery.matches);
  
  return () => mediaQuery.removeEventListener('change', handler);
}

/**
 * Get animation duration respecting reduced motion
 */
export function getAccessibleDuration(duration: number): number {
  return prefersReducedMotion() ? 0 : duration;
}

// =============================================================================
// High Contrast
// =============================================================================

/**
 * Check if user prefers high contrast
 */
export function prefersHighContrast(): boolean {
  return window.matchMedia('(prefers-contrast: more)').matches ||
         window.matchMedia('(-ms-high-contrast: active)').matches;
}

// =============================================================================
// Keyboard Navigation
// =============================================================================

/**
 * Handle arrow key navigation in a list
 */
export function handleArrowNavigation(
  container: HTMLElement,
  options: {
    selector?: string;
    loop?: boolean;
    orientation?: 'horizontal' | 'vertical' | 'both';
  } = {}
): () => void {
  const { selector = '[role="option"], button, a', loop = true, orientation = 'vertical' } = options;

  const handleKeyDown = (e: KeyboardEvent) => {
    const items = Array.from(container.querySelectorAll<HTMLElement>(selector));
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    
    switch (e.key) {
      case 'ArrowDown':
        if (orientation === 'vertical' || orientation === 'both') {
          nextIndex = currentIndex + 1;
          e.preventDefault();
        }
        break;
      case 'ArrowUp':
        if (orientation === 'vertical' || orientation === 'both') {
          nextIndex = currentIndex - 1;
          e.preventDefault();
        }
        break;
      case 'ArrowRight':
        if (orientation === 'horizontal' || orientation === 'both') {
          nextIndex = currentIndex + 1;
          e.preventDefault();
        }
        break;
      case 'ArrowLeft':
        if (orientation === 'horizontal' || orientation === 'both') {
          nextIndex = currentIndex - 1;
          e.preventDefault();
        }
        break;
      case 'Home':
        nextIndex = 0;
        e.preventDefault();
        break;
      case 'End':
        nextIndex = items.length - 1;
        e.preventDefault();
        break;
    }

    // Handle looping
    if (loop) {
      if (nextIndex >= items.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = items.length - 1;
    } else {
      nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
    }

    items[nextIndex]?.focus();
  };

  container.addEventListener('keydown', handleKeyDown);
  return () => container.removeEventListener('keydown', handleKeyDown);
}

// =============================================================================
// Audit Functions
// =============================================================================

/**
 * Run accessibility audit on a container
 */
export function runA11yAudit(container: HTMLElement = document.body): A11yAuditResult {
  const issues: A11yIssue[] = [];
  const passed: string[] = [];

  // Check images for alt text
  const images = container.querySelectorAll<HTMLImageElement>('img');
  images.forEach((img) => {
    if (!img.alt && !img.getAttribute('role')) {
      issues.push({
        type: 'error',
        code: 'img-alt',
        message: 'Image missing alt text',
        element: img,
        fix: 'Add alt attribute or role="presentation" for decorative images',
      });
    }
  });
  if (images.length > 0 && issues.filter(i => i.code === 'img-alt').length === 0) {
    passed.push('All images have alt text');
  }

  // Check buttons and links for accessible names
  const buttons = container.querySelectorAll<HTMLButtonElement>('button');
  buttons.forEach((btn) => {
    if (!getAccessibleName(btn)) {
      issues.push({
        type: 'error',
        code: 'button-name',
        message: 'Button missing accessible name',
        element: btn,
        fix: 'Add text content, aria-label, or aria-labelledby',
      });
    }
  });

  // Check form inputs for labels
  const inputs = container.querySelectorAll<HTMLInputElement>('input, select, textarea');
  inputs.forEach((input) => {
    if (!getAccessibleName(input) && input.type !== 'hidden') {
      issues.push({
        type: 'error',
        code: 'input-label',
        message: 'Form input missing label',
        element: input,
        fix: 'Add associated label element or aria-label',
      });
    }
  });

  // Check heading hierarchy
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let lastLevel = 0;
  headings.forEach((heading) => {
    const level = parseInt(heading.tagName[1]);
    if (level > lastLevel + 1 && lastLevel !== 0) {
      issues.push({
        type: 'warning',
        code: 'heading-order',
        message: `Skipped heading level: h${lastLevel} to h${level}`,
        element: heading as HTMLElement,
        fix: 'Use sequential heading levels (h1 → h2 → h3)',
      });
    }
    lastLevel = level;
  });

  // Check color contrast (sample check)
  const textElements = container.querySelectorAll<HTMLElement>('p, span, a, button, label');
  textElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const color = style.color;
    const bgColor = style.backgroundColor;
    
    if (color && bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
      const fgHex = rgbStringToHex(color);
      const bgHex = rgbStringToHex(bgColor);
      
      if (fgHex && bgHex) {
        const result = checkContrast(fgHex, bgHex);
        if (!result.passes.normalText) {
          issues.push({
            type: 'warning',
            code: 'color-contrast',
            message: `Insufficient contrast ratio: ${result.ratio}:1 (need 4.5:1)`,
            element: el,
            fix: `Adjust colors to achieve at least 4.5:1 contrast`,
          });
        }
      }
    }
  });

  // Calculate score
  const totalChecks = images.length + buttons.length + inputs.length + headings.length + textElements.length;
  const errorCount = issues.filter(i => i.type === 'error').length;
  const warningCount = issues.filter(i => i.type === 'warning').length;
  const score = totalChecks > 0 
    ? Math.max(0, 100 - (errorCount * 10) - (warningCount * 3))
    : 100;

  return { score, issues, passed };
}

// =============================================================================
// Helper Functions
// =============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function rgbStringToHex(rgb: string): string | null {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return rgbToHex(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
}
