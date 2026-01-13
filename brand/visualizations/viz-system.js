/**
 * FERNI VISUALIZATION SYSTEM
 * ==========================
 * Unified entry point for world-class data storytelling.
 *
 * This is the single import for all visualization capabilities.
 * Import this file and call `FerniViz.init()` to activate everything.
 *
 * Philosophy:
 * - One import, all capabilities
 * - Progressive enhancement (works without JS, better with it)
 * - Respects user preferences (reduced motion, dark mode)
 * - Accessible by default
 *
 * Usage:
 *   <script type="module">
 *     import FerniViz from './viz-system.js';
 *     FerniViz.init();
 *   </script>
 */

// ============================================
// IMPORTS
// ============================================

import tooltips from './tooltips.js';
import animations from './animations.js';
import disclosure from './progressive-disclosure.js';
import comparison from './comparison-mode.js';
import icons from './icons.js';
import exportShare from './export-share.js';

// ============================================
// VERSION & METADATA
// ============================================

export const VERSION = '1.0.0';
export const BUILD_DATE = '2026-01-10';

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize all visualization systems
 * @param {Object} options - Configuration options
 */
export function init(options = {}) {
  const {
    container = document,
    enableTooltips = true,
    enableAnimations = true,
    enableDisclosure = true,
    enableComparison = true,
    enableIcons = true,
    enableSharing = true,
    respectReducedMotion = true,
    debug = false,
  } = options;

  if (debug) {
    console.log(`[FerniViz] Initializing v${VERSION}`);
  }

  // Check for reduced motion preference
  const prefersReducedMotion = respectReducedMotion &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Initialize tooltips
  if (enableTooltips) {
    tooltips.init(container);
    if (debug) console.log('[FerniViz] Tooltips initialized');
  }

  // Initialize animations (unless reduced motion)
  if (enableAnimations && !prefersReducedMotion) {
    animations.initScrollReveal(container);
    if (debug) console.log('[FerniViz] Animations initialized');
  }

  // Initialize progressive disclosure
  if (enableDisclosure) {
    disclosure.init(container);
    if (debug) console.log('[FerniViz] Progressive disclosure initialized');
  }

  // Initialize comparison mode
  if (enableComparison) {
    comparison.init(container);
    if (debug) console.log('[FerniViz] Comparison mode initialized');
  }

  // Initialize icons
  if (enableIcons) {
    icons.injectSprite();
    icons.injectIconStyles();
    icons.hydrateIcons(container);
    if (debug) console.log('[FerniViz] Icons initialized');
  }

  // Initialize sharing
  if (enableSharing) {
    exportShare.injectShareStyles();
    if (debug) console.log('[FerniViz] Export/share initialized');
  }

  // Add system class to document
  document.documentElement.classList.add('ferni-viz-ready');

  if (debug) {
    console.log('[FerniViz] All systems initialized');
  }

  return {
    version: VERSION,
    modules: {
      tooltips,
      animations,
      disclosure,
      comparison,
      icons,
      exportShare,
    },
  };
}

// ============================================
// CONVENIENCE EXPORTS
// ============================================

// Re-export all modules for direct access
export { tooltips };
export { animations };
export { disclosure };
export { comparison };
export { icons };
export { exportShare };

// Re-export key functions
export const { showTooltip, hideTooltip, attachTooltip } = tooltips;
export const { initScrollReveal, animateBarChart, animatePieChart, playMicroInteraction } = animations;
export const { DisclosureLevel, setGlobalLevel, expandSection, collapseSection } = disclosure;
export const { ComparisonMode, setComparisonMode } = comparison;
export const { createIcon, hydrateIcons } = icons;
export const { exportVisualization, shareVisualization, createShareMenu, ExportFormat, SharePlatform } = exportShare;

// ============================================
// VALIDATION & DIAGNOSTICS
// ============================================

/**
 * Run system validation
 * @returns {Object} Validation results
 */
export function validate() {
  const results = {
    passed: true,
    checks: [],
    warnings: [],
    errors: [],
  };

  // Check CSS variables
  const cssVars = [
    '--color-ferni',
    '--kintsugi-gold',
    '--color-bg-elevated',
    '--duration-fast',
    '--radius-lg',
  ];

  cssVars.forEach(varName => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
    if (value) {
      results.checks.push(`✓ CSS variable ${varName} is defined`);
    } else {
      results.warnings.push(`⚠ CSS variable ${varName} is not defined`);
    }
  });

  // Check required elements
  const requiredSelectors = [
    '[data-tooltip]',
    '.viz-reveal',
    '[data-disclosure]',
    '[data-comparison]',
  ];

  requiredSelectors.forEach(selector => {
    const count = document.querySelectorAll(selector).length;
    if (count > 0) {
      results.checks.push(`✓ Found ${count} elements matching ${selector}`);
    }
  });

  // Check browser support
  if ('IntersectionObserver' in window) {
    results.checks.push('✓ IntersectionObserver supported');
  } else {
    results.warnings.push('⚠ IntersectionObserver not supported (animations degraded)');
  }

  if (navigator.share) {
    results.checks.push('✓ Web Share API supported');
  } else {
    results.warnings.push('⚠ Web Share API not supported (fallback to clipboard)');
  }

  // Check accessibility
  const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
  if (imagesWithoutAlt.length > 0) {
    results.warnings.push(`⚠ ${imagesWithoutAlt.length} images without alt attributes`);
  }

  const buttonsWithoutLabel = document.querySelectorAll('button:not([aria-label]):empty');
  if (buttonsWithoutLabel.length > 0) {
    results.warnings.push(`⚠ ${buttonsWithoutLabel.length} buttons without accessible labels`);
  }

  // Set overall pass/fail
  results.passed = results.errors.length === 0;

  return results;
}

/**
 * Print validation results to console
 */
export function printValidation() {
  const results = validate();

  console.group('FerniViz Validation Results');

  console.log('\n%c✓ Passed Checks', 'color: green; font-weight: bold');
  results.checks.forEach(check => console.log(check));

  if (results.warnings.length > 0) {
    console.log('\n%c⚠ Warnings', 'color: orange; font-weight: bold');
    results.warnings.forEach(warn => console.log(warn));
  }

  if (results.errors.length > 0) {
    console.log('\n%c✗ Errors', 'color: red; font-weight: bold');
    results.errors.forEach(err => console.log(err));
  }

  console.log('\n%cOverall: ' + (results.passed ? 'PASSED ✓' : 'FAILED ✗'),
    `color: ${results.passed ? 'green' : 'red'}; font-weight: bold`);

  console.groupEnd();

  return results;
}

// ============================================
// QUICK ACTIONS
// ============================================

/**
 * Quick action: Make a visualization shareable
 * @param {HTMLElement} element - Visualization element
 */
export function makeShareable(element) {
  // Find or create share button
  let shareBtn = element.querySelector('.viz-share-btn');

  if (!shareBtn) {
    shareBtn = document.createElement('button');
    shareBtn.className = 'viz-share-btn action-btn action-btn-secondary';
    shareBtn.setAttribute('aria-label', 'Share this visualization');

    const shareIcon = icons.createIcon('share', { size: 16 });
    shareBtn.appendChild(shareIcon);

    const text = document.createElement('span');
    text.textContent = 'Share';
    shareBtn.appendChild(text);

    element.appendChild(shareBtn);
  }

  // Add share menu
  shareBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    // Remove any existing menu
    const existing = document.querySelector('.share-menu-popup');
    if (existing) existing.remove();

    // Create and position menu
    const menu = exportShare.createShareMenu(element);
    menu.classList.add('share-menu-popup');
    menu.style.cssText = `
      position: absolute;
      z-index: 100;
      right: 0;
      top: calc(100% + 8px);
    `;

    shareBtn.parentElement.style.position = 'relative';
    shareBtn.parentElement.appendChild(menu);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeMenu() {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }, { once: true });
    }, 0);
  });

  return element;
}

/**
 * Quick action: Add reveal animation to elements
 * @param {string} selector - CSS selector
 */
export function addRevealAnimations(selector) {
  const elements = document.querySelectorAll(selector);
  elements.forEach(el => {
    el.classList.add('viz-reveal');
  });
  animations.initScrollReveal();
}

/**
 * Quick action: Add tooltips to data points
 * @param {string} selector - CSS selector for data points
 * @param {Function} dataFn - Function to extract tooltip data from element
 */
export function addDataTooltips(selector, dataFn) {
  const elements = document.querySelectorAll(selector);
  elements.forEach(el => {
    const data = dataFn(el);
    tooltips.attach(el, data);
  });
}

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  // Core
  init,
  validate,
  printValidation,
  VERSION,

  // Modules
  tooltips,
  animations,
  disclosure,
  comparison,
  icons,
  exportShare,

  // Quick actions
  makeShareable,
  addRevealAnimations,
  addDataTooltips,

  // Key enums
  DisclosureLevel: disclosure.DisclosureLevel,
  ComparisonMode: comparison.ComparisonMode,
  ExportFormat: exportShare.ExportFormat,
  SharePlatform: exportShare.SharePlatform,
};
