/**
 * FERNI VISUALIZATION TOOLTIPS
 * ============================
 * Apple/Pixar-level tooltip system for data storytelling.
 * Transforms hover interactions into moments of insight.
 *
 * Philosophy:
 * - Tooltips reveal the story behind the data point
 * - Smooth animations that feel organic, not mechanical
 * - Accessible and touch-friendly
 * - Performance optimized (no layout thrashing)
 *
 * Usage:
 *   import { initTooltips, showTooltip, hideTooltip } from './tooltips.js';
 *   initTooltips();
 *
 *   // Or attach to specific elements:
 *   attachTooltip(element, {
 *     title: 'Sleep Quality',
 *     value: '8.2 hours',
 *     detail: 'Best night this week',
 *     trend: 'up'
 *   });
 */

// ============================================
// TOOLTIP STATE
// ============================================

let tooltipElement = null;
let activeTarget = null;
let hideTimeout = null;
let isTouch = false;

// ============================================
// TOOLTIP CONFIGURATION
// ============================================

const CONFIG = {
  offset: 12,           // Distance from target element
  showDelay: 100,       // Delay before showing (prevents flicker)
  hideDelay: 150,       // Delay before hiding (allows moving to tooltip)
  touchDuration: 3000,  // How long tooltip stays on touch
  arrowSize: 8,         // Size of tooltip arrow
  viewportPadding: 16,  // Minimum distance from viewport edge
};

// ============================================
// TOOLTIP ELEMENT CREATION
// ============================================

/**
 * Create the tooltip DOM element if it doesn't exist
 * Uses safe DOM methods instead of innerHTML
 */
function ensureTooltipElement() {
  if (tooltipElement) return tooltipElement;

  tooltipElement = document.createElement('div');
  tooltipElement.className = 'viz-tooltip';
  tooltipElement.setAttribute('role', 'tooltip');
  tooltipElement.setAttribute('aria-hidden', 'true');

  // Create header
  const header = document.createElement('div');
  header.className = 'viz-tooltip-header';

  const icon = document.createElement('span');
  icon.className = 'viz-tooltip-icon';
  header.appendChild(icon);

  const title = document.createElement('span');
  title.className = 'viz-tooltip-title';
  header.appendChild(title);

  tooltipElement.appendChild(header);

  // Create value
  const value = document.createElement('div');
  value.className = 'viz-tooltip-value';
  tooltipElement.appendChild(value);

  // Create label
  const label = document.createElement('div');
  label.className = 'viz-tooltip-label';
  tooltipElement.appendChild(label);

  // Create detail
  const detail = document.createElement('div');
  detail.className = 'viz-tooltip-detail';
  tooltipElement.appendChild(detail);

  // Create trend
  const trend = document.createElement('div');
  trend.className = 'viz-tooltip-trend';
  tooltipElement.appendChild(trend);

  // Create arrow
  const arrow = document.createElement('div');
  arrow.className = 'viz-tooltip-arrow';
  tooltipElement.appendChild(arrow);

  document.body.appendChild(tooltipElement);

  // Prevent tooltip from hiding when hovering over it
  tooltipElement.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
  });

  tooltipElement.addEventListener('mouseleave', () => {
    hideTooltip();
  });

  return tooltipElement;
}

// ============================================
// TOOLTIP POSITIONING
// ============================================

/**
 * Calculate optimal tooltip position
 * @param {DOMRect} targetRect - Bounding rect of target element
 * @param {DOMRect} tooltipRect - Bounding rect of tooltip
 * @returns {{ x: number, y: number, placement: string }}
 */
function calculatePosition(targetRect, tooltipRect) {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  // Try placements in order of preference
  const placements = ['top', 'bottom', 'right', 'left'];

  for (const placement of placements) {
    const pos = getPositionForPlacement(placement, targetRect, tooltipRect, viewport);
    if (pos.fits) {
      return { ...pos, placement };
    }
  }

  // Default to top if nothing fits perfectly
  return {
    ...getPositionForPlacement('top', targetRect, tooltipRect, viewport),
    placement: 'top'
  };
}

/**
 * Get position for a specific placement
 */
function getPositionForPlacement(placement, targetRect, tooltipRect, viewport) {
  let x, y;
  const offset = CONFIG.offset;

  switch (placement) {
    case 'top':
      x = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
      y = targetRect.top - tooltipRect.height - offset;
      break;
    case 'bottom':
      x = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
      y = targetRect.bottom + offset;
      break;
    case 'left':
      x = targetRect.left - tooltipRect.width - offset;
      y = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
      break;
    case 'right':
      x = targetRect.right + offset;
      y = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
      break;
  }

  // Clamp to viewport
  const padding = CONFIG.viewportPadding;
  x = Math.max(padding, Math.min(x, viewport.width - tooltipRect.width - padding));
  y = Math.max(padding, Math.min(y, viewport.height - tooltipRect.height - padding));

  // Check if it fits
  const fits = (
    x >= padding &&
    x + tooltipRect.width <= viewport.width - padding &&
    y >= padding &&
    y + tooltipRect.height <= viewport.height - padding
  );

  return { x: x + viewport.scrollX, y: y + viewport.scrollY, fits };
}

// ============================================
// TOOLTIP SHOW/HIDE
// ============================================

/**
 * Show tooltip for a target element
 * @param {HTMLElement} target - Element to show tooltip for
 * @param {Object} data - Tooltip content
 * @param {string} [data.icon] - Emoji or icon character
 * @param {string} [data.title] - Title text
 * @param {string} [data.value] - Main value
 * @param {string} [data.label] - Secondary label
 * @param {string} [data.detail] - Additional detail text
 * @param {string} [data.trend] - Trend direction: 'up', 'down', 'stable'
 * @param {string} [data.persona] - Persona ID for theming
 */
export function showTooltip(target, data) {
  clearTimeout(hideTimeout);

  const tooltip = ensureTooltipElement();
  activeTarget = target;

  // Update content
  updateTooltipContent(tooltip, data);

  // Apply persona theme if provided
  if (data.persona) {
    tooltip.dataset.persona = data.persona;
  } else {
    delete tooltip.dataset.persona;
  }

  // Make visible (but not positioned yet)
  tooltip.style.visibility = 'hidden';
  tooltip.classList.add('is-visible');
  tooltip.setAttribute('aria-hidden', 'false');

  // Calculate position after content is rendered
  requestAnimationFrame(() => {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const { x, y, placement } = calculatePosition(targetRect, tooltipRect);

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.dataset.placement = placement;
    tooltip.style.visibility = 'visible';
  });

  // Set up hide on touch after duration
  if (isTouch) {
    hideTimeout = setTimeout(() => hideTooltip(), CONFIG.touchDuration);
  }
}

/**
 * Update tooltip content using safe DOM methods
 */
function updateTooltipContent(tooltip, data) {
  const icon = tooltip.querySelector('.viz-tooltip-icon');
  const title = tooltip.querySelector('.viz-tooltip-title');
  const value = tooltip.querySelector('.viz-tooltip-value');
  const label = tooltip.querySelector('.viz-tooltip-label');
  const detail = tooltip.querySelector('.viz-tooltip-detail');
  const trend = tooltip.querySelector('.viz-tooltip-trend');

  // Icon (using textContent - safe)
  if (data.icon) {
    icon.textContent = data.icon;
    icon.style.display = '';
  } else {
    icon.style.display = 'none';
  }

  // Title (using textContent - safe)
  if (data.title) {
    title.textContent = data.title;
    title.style.display = '';
  } else {
    title.style.display = 'none';
  }

  // Value (using textContent - safe)
  if (data.value) {
    value.textContent = data.value;
    value.style.display = '';
  } else {
    value.style.display = 'none';
  }

  // Label (using textContent - safe)
  if (data.label) {
    label.textContent = data.label;
    label.style.display = '';
  } else {
    label.style.display = 'none';
  }

  // Detail (using textContent - safe)
  if (data.detail) {
    detail.textContent = data.detail;
    detail.style.display = '';
  } else {
    detail.style.display = 'none';
  }

  // Trend indicator (using safe DOM construction)
  if (data.trend) {
    const trendIcons = { up: '↑', down: '↓', stable: '→' };
    const trendLabels = { up: 'Trending up', down: 'Trending down', stable: 'Stable' };

    // Clear previous content safely
    while (trend.firstChild) {
      trend.removeChild(trend.firstChild);
    }

    // Create trend icon span
    const trendIconSpan = document.createElement('span');
    trendIconSpan.className = `trend-icon trend-${data.trend}`;
    trendIconSpan.textContent = trendIcons[data.trend] || '';
    trend.appendChild(trendIconSpan);

    // Add label text
    trend.appendChild(document.createTextNode(' ' + (trendLabels[data.trend] || '')));

    trend.style.display = '';
  } else {
    trend.style.display = 'none';
  }
}

/**
 * Hide the tooltip
 */
export function hideTooltip() {
  clearTimeout(hideTimeout);

  if (!tooltipElement) return;

  hideTimeout = setTimeout(() => {
    tooltipElement.classList.remove('is-visible');
    tooltipElement.setAttribute('aria-hidden', 'true');
    activeTarget = null;
  }, CONFIG.hideDelay);
}

/**
 * Immediately hide tooltip (no delay)
 */
export function hideTooltipImmediate() {
  clearTimeout(hideTimeout);

  if (!tooltipElement) return;

  tooltipElement.classList.remove('is-visible');
  tooltipElement.setAttribute('aria-hidden', 'true');
  activeTarget = null;
}

// ============================================
// TOOLTIP ATTACHMENT
// ============================================

/**
 * Attach tooltip behavior to an element
 * @param {HTMLElement} element - Element to attach tooltip to
 * @param {Object} data - Tooltip content (see showTooltip for options)
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.persistent] - Keep tooltip on click
 */
export function attachTooltip(element, data, options = {}) {
  // Store data on element
  element._tooltipData = data;

  // Mouse events
  element.addEventListener('mouseenter', handleMouseEnter);
  element.addEventListener('mouseleave', handleMouseLeave);
  element.addEventListener('focus', handleFocus);
  element.addEventListener('blur', handleBlur);

  // Touch events
  element.addEventListener('touchstart', handleTouchStart, { passive: true });

  // Make focusable if not already
  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '0');
  }

  // Mark as having tooltip
  element.classList.add('has-tooltip');
}

/**
 * Remove tooltip behavior from an element
 */
export function detachTooltip(element) {
  element.removeEventListener('mouseenter', handleMouseEnter);
  element.removeEventListener('mouseleave', handleMouseLeave);
  element.removeEventListener('focus', handleFocus);
  element.removeEventListener('blur', handleBlur);
  element.removeEventListener('touchstart', handleTouchStart);

  delete element._tooltipData;
  element.classList.remove('has-tooltip');
}

// Event handlers
function handleMouseEnter(e) {
  isTouch = false;
  const data = e.currentTarget._tooltipData;
  if (data) {
    showTooltip(e.currentTarget, data);
  }
}

function handleMouseLeave() {
  hideTooltip();
}

function handleFocus(e) {
  isTouch = false;
  const data = e.currentTarget._tooltipData;
  if (data) {
    showTooltip(e.currentTarget, data);
  }
}

function handleBlur() {
  hideTooltipImmediate();
}

function handleTouchStart(e) {
  isTouch = true;
  const data = e.currentTarget._tooltipData;
  if (data) {
    // If already showing this tooltip, hide it (toggle behavior)
    if (activeTarget === e.currentTarget) {
      hideTooltipImmediate();
    } else {
      showTooltip(e.currentTarget, data);
    }
  }
}

// ============================================
// AUTO-INITIALIZATION
// ============================================

/**
 * Initialize tooltips for all elements with data-tooltip attribute
 *
 * Usage in HTML:
 *   <div data-tooltip="Sleep Quality" data-tooltip-value="8.2 hours">
 *   <div data-tooltip='{"title": "Sleep", "value": "8.2h", "trend": "up"}'>
 */
export function initTooltips(container = document) {
  const elements = container.querySelectorAll('[data-tooltip]');

  elements.forEach(element => {
    let data;
    const rawData = element.dataset.tooltip;

    // Try parsing as JSON first
    try {
      data = JSON.parse(rawData);
    } catch {
      // Fall back to simple string (becomes title)
      data = {
        title: rawData,
        value: element.dataset.tooltipValue,
        label: element.dataset.tooltipLabel,
        detail: element.dataset.tooltipDetail,
        trend: element.dataset.tooltipTrend,
        icon: element.dataset.tooltipIcon,
        persona: element.dataset.tooltipPersona,
      };
    }

    attachTooltip(element, data);
  });

  // Hide tooltip on scroll
  window.addEventListener('scroll', () => {
    if (activeTarget && !isTouch) {
      hideTooltipImmediate();
    }
  }, { passive: true });

  // Hide tooltip on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeTarget) {
      hideTooltipImmediate();
      activeTarget.blur();
    }
  });
}

// ============================================
// SPARKLINE TOOLTIP HELPER
// ============================================

/**
 * Create tooltip data for a sparkline data point
 * @param {Object} point - Data point
 * @param {string} point.date - Date string
 * @param {number} point.value - Value
 * @param {string} point.label - What this measures
 * @param {Object} [context] - Additional context
 * @returns {Object} Tooltip data
 */
export function createSparklineTooltip(point, context = {}) {
  const formattedDate = new Date(point.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  return {
    icon: context.icon || '📊',
    title: point.label || context.label || 'Value',
    value: typeof point.value === 'number' ? point.value.toLocaleString() : point.value,
    label: formattedDate,
    detail: context.detail,
    trend: context.trend,
    persona: context.persona,
  };
}

// ============================================
// CHART TOOLTIP HELPER
// ============================================

/**
 * Create tooltip data for chart elements
 * @param {Object} options
 * @returns {Object} Tooltip data
 */
export function createChartTooltip({
  title,
  value,
  percentage,
  comparison,
  insight,
  persona,
}) {
  let detail = '';
  if (percentage !== undefined) {
    detail = `${percentage}% of total`;
  }
  if (comparison) {
    detail += detail ? ' · ' : '';
    detail += comparison;
  }

  return {
    title,
    value,
    detail: detail || undefined,
    trend: insight?.trend,
    persona,
  };
}

// ============================================
// EXPORT DEFAULT
// ============================================

export default {
  init: initTooltips,
  show: showTooltip,
  hide: hideTooltip,
  hideImmediate: hideTooltipImmediate,
  attach: attachTooltip,
  detach: detachTooltip,
  createSparklineTooltip,
  createChartTooltip,
};
