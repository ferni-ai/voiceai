/**
 * Touch Target Utilities - WCAG 2.5.5 & Apple HIG Compliance
 *
 * Ensures all interactive elements meet minimum touch target sizes:
 * - WCAG 2.5.5 AAA: 44x44px
 * - Apple Human Interface Guidelines: 44x44pt
 * - Google Material Design: 48x48dp
 *
 * This module provides:
 * - Audit utilities to find violations
 * - Auto-fix utilities to apply touch padding
 * - CSS utilities for consistent touch targets
 *
 * @module touch-targets
 */

import { createLogger } from './logger';

const log = createLogger('TouchTargets');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum touch target size in pixels (WCAG 2.5.5 AAA) */
export const MIN_TOUCH_SIZE = 44;

/** Recommended touch target size for mobile (Material Design) */
export const RECOMMENDED_TOUCH_SIZE = 48;

/** Selectors for interactive elements */
const INTERACTIVE_SELECTORS = [
  'button',
  'a[href]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// ============================================================================
// TYPES
// ============================================================================

export interface TouchTargetViolation {
  element: HTMLElement;
  width: number;
  height: number;
  selector: string;
  recommendation: string;
}

export interface TouchTargetAuditResult {
  total: number;
  passed: number;
  failed: number;
  violations: TouchTargetViolation[];
}

// ============================================================================
// AUDIT UTILITIES
// ============================================================================

/**
 * Gets a descriptive selector for an element (for logging/debugging).
 */
function getElementSelector(el: HTMLElement): string {
  const parts: string[] = [];

  // Tag name
  parts.push(el.tagName.toLowerCase());

  // ID
  if (el.id) {
    parts.push(`#${el.id}`);
  }

  // Classes (first 2)
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.split(' ').slice(0, 2).map(c => `.${c}`).join('');
    if (classes) parts.push(classes);
  }

  // Role
  const role = el.getAttribute('role');
  if (role) {
    parts.push(`[role="${role}"]`);
  }

  return parts.join('');
}

/**
 * Checks if an element meets minimum touch target size.
 */
function checkTouchTarget(el: HTMLElement): { passed: boolean; width: number; height: number } {
  const rect = el.getBoundingClientRect();
  const computedStyle = getComputedStyle(el);

  // Include padding in the effective touch area
  const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(computedStyle.paddingRight) || 0;

  // Include padding in effective size for touch target calculation
  const effectiveWidth = rect.width + paddingLeft + paddingRight;
  const effectiveHeight = rect.height + paddingTop + paddingBottom;

  return {
    passed: effectiveWidth >= MIN_TOUCH_SIZE && effectiveHeight >= MIN_TOUCH_SIZE,
    width: Math.round(effectiveWidth),
    height: Math.round(effectiveHeight),
  };
}

/**
 * Audits all interactive elements for touch target compliance.
 * @param root The root element to audit (defaults to document.body).
 * @returns Audit results including violations.
 */
export function auditTouchTargets(root: HTMLElement = document.body): TouchTargetAuditResult {
  const elements = root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTORS);
  const violations: TouchTargetViolation[] = [];
  let passed = 0;

  elements.forEach(el => {
    // Skip hidden elements
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') {
      return;
    }

    const result = checkTouchTarget(el);

    if (result.passed) {
      passed++;
    } else {
      const selector = getElementSelector(el);
      violations.push({
        element: el,
        width: result.width,
        height: result.height,
        selector,
        recommendation: `Increase to at least ${MIN_TOUCH_SIZE}x${MIN_TOUCH_SIZE}px`,
      });
    }
  });

  const total = passed + violations.length;

  return {
    total,
    passed,
    failed: violations.length,
    violations,
  };
}

/**
 * Logs touch target audit results to console.
 * @param results The audit results.
 */
export function logAuditResults(results: TouchTargetAuditResult): void {
  if (results.failed === 0) {
    log.info(`✅ Touch target audit passed: ${results.total} elements checked`);
    return;
  }

  log.warn(`⚠️ Touch target violations: ${results.failed}/${results.total}`);

  results.violations.forEach(v => {
    log.warn(`  - ${v.selector}: ${v.width}x${v.height}px (needs ${MIN_TOUCH_SIZE}x${MIN_TOUCH_SIZE}px)`);
  });
}

// ============================================================================
// CSS UTILITIES
// ============================================================================

const TOUCH_TARGET_STYLES = `
/* ============================================
   TOUCH TARGET UTILITIES
   Ensures WCAG 2.5.5 AAA compliance (44x44px)
   ============================================ */

/* Base touch target - ensures minimum size */
.touch-target {
  min-width: ${MIN_TOUCH_SIZE}px;
  min-height: ${MIN_TOUCH_SIZE}px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Touch target wrapper - invisible expansion */
.touch-target-expand {
  position: relative;
}

.touch-target-expand::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: ${MIN_TOUCH_SIZE}px;
  height: ${MIN_TOUCH_SIZE}px;
  transform: translate(-50%, -50%);
  /* transparent but still captures taps */
}

/* For icon buttons - centers small icons in touch-friendly area */
.touch-target-icon {
  min-width: ${MIN_TOUCH_SIZE}px;
  min-height: ${MIN_TOUCH_SIZE}px;
  padding: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Large touch target (Material Design recommended) */
.touch-target-lg {
  min-width: ${RECOMMENDED_TOUCH_SIZE}px;
  min-height: ${RECOMMENDED_TOUCH_SIZE}px;
}

/* Touch padding utility - adds invisible touch area */
.touch-padding {
  padding: max(0px, calc((${MIN_TOUCH_SIZE}px - 100%) / 2));
}

/* Checkbox/Radio touch target fix */
input[type="checkbox"],
input[type="radio"] {
  min-width: ${MIN_TOUCH_SIZE}px;
  min-height: ${MIN_TOUCH_SIZE}px;
  cursor: pointer;
}

/* Link touch target fix - ensure inline links have enough height */
a:not(.btn):not(.touch-target) {
  padding-block: calc((${MIN_TOUCH_SIZE}px - 1em) / 2);
  margin-block: calc((${MIN_TOUCH_SIZE}px - 1em) / -2);
}

/* Navigation items */
nav a,
[role="navigation"] a {
  min-height: ${MIN_TOUCH_SIZE}px;
  display: inline-flex;
  align-items: center;
}

/* List items that are clickable */
li[role="button"],
li[role="option"],
li[role="menuitem"] {
  min-height: ${MIN_TOUCH_SIZE}px;
  display: flex;
  align-items: center;
}

/* Close buttons - often too small */
[aria-label="Close"],
[aria-label="close"],
.close-btn,
.btn-close {
  min-width: ${MIN_TOUCH_SIZE}px;
  min-height: ${MIN_TOUCH_SIZE}px;
}

/* Tab buttons */
[role="tab"] {
  min-height: ${MIN_TOUCH_SIZE}px;
  padding: var(--space-2) var(--space-4);
}

/* Coarse pointer - likely touch device */
@media (pointer: coarse) {
  /* Increase all interactive elements on touch devices */
  button,
  a[href],
  input[type="button"],
  input[type="submit"],
  [role="button"] {
    min-height: ${MIN_TOUCH_SIZE}px;
  }

  /* Increase spacing between touch targets */
  .touch-spacing > * + * {
    margin-top: var(--space-2);
  }

  /* Icon-only buttons need more padding */
  button:has(svg:only-child),
  [role="button"]:has(svg:only-child) {
    padding: 10px;
  }
}

/* Debug mode - highlights violations */
.debug-touch-targets [data-touch-violation] {
  outline: 3px dashed var(--color-semantic-error) !important;
  outline-offset: 2px;
}

.debug-touch-targets [data-touch-violation]::after {
  content: attr(data-touch-violation);
  position: absolute;
  top: -24px;
  left: 0;
  background: var(--color-semantic-error);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  z-index: var(--z-tooltip);
}
`;

let touchStylesInjected = false;

/**
 * Injects touch target utility styles.
 */
export function injectTouchTargetStyles(): void {
  if (touchStylesInjected || document.getElementById('touch-target-styles')) return;

  const style = document.createElement('style');
  style.id = 'touch-target-styles';
  style.textContent = TOUCH_TARGET_STYLES;
  document.head.appendChild(style);
  touchStylesInjected = true;

  log.debug('Touch target styles injected');
}

// ============================================================================
// AUTO-FIX UTILITIES
// ============================================================================

/**
 * Automatically fixes touch target violations by adding wrapper classes.
 * Use with caution - may affect layout.
 * @param root The root element to fix (defaults to document.body).
 * @returns Number of elements fixed.
 */
export function autoFixTouchTargets(root: HTMLElement = document.body): number {
  injectTouchTargetStyles();

  const results = auditTouchTargets(root);
  let fixed = 0;

  results.violations.forEach(v => {
    const el = v.element;

    // Skip elements that already have fix classes
    if (el.classList.contains('touch-target') || el.classList.contains('touch-target-icon')) {
      return;
    }

    // For icon buttons (small content)
    if (el.querySelector('svg') && el.textContent?.trim() === '') {
      el.classList.add('touch-target-icon');
      fixed++;
    } else {
      // General fix
      el.classList.add('touch-target');
      fixed++;
    }
  });

  log.info(`Auto-fixed ${fixed} touch target violations`);
  return fixed;
}

/**
 * Enables debug mode to visually highlight touch target violations.
 * @param enable Whether to enable debug mode.
 */
export function debugTouchTargets(enable: boolean = true): void {
  document.body.classList.toggle('debug-touch-targets', enable);

  if (enable) {
    const results = auditTouchTargets();
    results.violations.forEach(v => {
      v.element.setAttribute('data-touch-violation', `${v.width}x${v.height}px`);
    });
    log.info(`Debug mode enabled - ${results.failed} violations highlighted`);
  } else {
    document.querySelectorAll('[data-touch-violation]').forEach(el => {
      el.removeAttribute('data-touch-violation');
    });
    log.info('Debug mode disabled');
  }
}

/**
 * Disposes touch target utilities.
 */
export function disposeTouchTargetUtils(): void {
  document.getElementById('touch-target-styles')?.remove();
  document.body.classList.remove('debug-touch-targets');
  document.querySelectorAll('[data-touch-violation]').forEach(el => {
    el.removeAttribute('data-touch-violation');
  });
  touchStylesInjected = false;
  log.debug('Touch target utilities disposed');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes touch target utilities.
 * - Injects styles
 * - Runs initial audit (in dev mode)
 */
export function initTouchTargets(): void {
  injectTouchTargetStyles();

  // In development, run audit on load
  if (import.meta.env?.DEV) {
    // Wait for layout to settle
    requestAnimationFrame(() => {
      const results = auditTouchTargets();
      if (results.failed > 0) {
        logAuditResults(results);
      }
    });
  }

  log.info('Touch target utilities initialized');
}

