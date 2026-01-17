/**
 * Ferni Tooltip Component
 * 
 * Hover hint with brand-compliant styling.
 */

// =============================================================================
// Types
// =============================================================================

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipOptions {
  /** Tooltip content */
  content: string;
  /** Position relative to trigger */
  position?: TooltipPosition;
  /** Delay before showing (ms) */
  delay?: number;
  /** Maximum width */
  maxWidth?: number;
}

// =============================================================================
// Global tooltip container
// =============================================================================

let tooltipContainer: HTMLElement | null = null;
let currentTooltip: HTMLElement | null = null;
let showTimeout: ReturnType<typeof setTimeout> | null = null;

function getTooltipContainer(): HTMLElement {
  if (!tooltipContainer) {
    tooltipContainer = document.createElement('div');
    tooltipContainer.id = 'ferni-tooltip-container';
    tooltipContainer.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 10000;
    `;
    document.body.appendChild(tooltipContainer);
  }
  return tooltipContainer;
}

// =============================================================================
// Tooltip Functions
// =============================================================================

/**
 * Attach a tooltip to an element
 */
export function attachTooltip(element: HTMLElement, options: TooltipOptions): () => void {
  const { content, position = 'top', delay = 300, maxWidth = 250 } = options;

  const showTooltip = () => {
    showTimeout = setTimeout(() => {
      const rect = element.getBoundingClientRect();
      const container = getTooltipContainer();

      // Create tooltip
      currentTooltip = document.createElement('div');
      currentTooltip.className = 'ferni-tooltip';
      currentTooltip.textContent = content;
      currentTooltip.style.cssText = `
        position: fixed;
        padding: 8px 12px;
        font-family: var(--font-body, Inter, system-ui, sans-serif);
        font-size: 13px;
        color: var(--color-background, #FFFCF8);
        background: var(--color-text-primary, #2C2520);
        border-radius: var(--radius-md, 8px);
        box-shadow: var(--shadow-lg, 0 10px 15px rgba(44, 37, 32, 0.15));
        max-width: ${maxWidth}px;
        white-space: normal;
        word-wrap: break-word;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.15s ease, transform 0.15s ease;
        pointer-events: none;
      `;

      container.appendChild(currentTooltip);

      // Position tooltip
      const tooltipRect = currentTooltip.getBoundingClientRect();
      const gap = 8;

      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = rect.top - tooltipRect.height - gap;
          left = rect.left + (rect.width - tooltipRect.width) / 2;
          break;
        case 'bottom':
          top = rect.bottom + gap;
          left = rect.left + (rect.width - tooltipRect.width) / 2;
          break;
        case 'left':
          top = rect.top + (rect.height - tooltipRect.height) / 2;
          left = rect.left - tooltipRect.width - gap;
          break;
        case 'right':
          top = rect.top + (rect.height - tooltipRect.height) / 2;
          left = rect.right + gap;
          break;
      }

      // Keep within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      if (left < 8) left = 8;
      if (left + tooltipRect.width > viewportWidth - 8) {
        left = viewportWidth - tooltipRect.width - 8;
      }
      if (top < 8) top = 8;
      if (top + tooltipRect.height > viewportHeight - 8) {
        top = viewportHeight - tooltipRect.height - 8;
      }

      currentTooltip.style.top = `${top}px`;
      currentTooltip.style.left = `${left}px`;

      // Animate in
      requestAnimationFrame(() => {
        if (currentTooltip) {
          currentTooltip.style.opacity = '1';
          currentTooltip.style.transform = 'scale(1)';
        }
      });
    }, delay);
  };

  const hideTooltip = () => {
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    if (currentTooltip) {
      currentTooltip.style.opacity = '0';
      currentTooltip.style.transform = 'scale(0.95)';
      const tooltip = currentTooltip;
      setTimeout(() => tooltip.remove(), 150);
      currentTooltip = null;
    }
  };

  // Event listeners
  element.addEventListener('mouseenter', showTooltip);
  element.addEventListener('mouseleave', hideTooltip);
  element.addEventListener('focus', showTooltip);
  element.addEventListener('blur', hideTooltip);

  // Return cleanup function
  return () => {
    element.removeEventListener('mouseenter', showTooltip);
    element.removeEventListener('mouseleave', hideTooltip);
    element.removeEventListener('focus', showTooltip);
    element.removeEventListener('blur', hideTooltip);
    hideTooltip();
  };
}

/**
 * Show a tooltip programmatically at a position
 */
export function showTooltipAt(
  x: number,
  y: number,
  content: string,
  options: { maxWidth?: number; duration?: number } = {}
): () => void {
  const { maxWidth = 250, duration = 2000 } = options;
  const container = getTooltipContainer();

  const tooltip = document.createElement('div');
  tooltip.className = 'ferni-tooltip';
  tooltip.textContent = content;
  tooltip.style.cssText = `
    position: fixed;
    top: ${y}px;
    left: ${x}px;
    padding: 8px 12px;
    font-family: var(--font-body, Inter, system-ui, sans-serif);
    font-size: 13px;
    color: var(--color-background, #FFFCF8);
    background: var(--color-text-primary, #2C2520);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-lg, 0 10px 15px rgba(44, 37, 32, 0.15));
    max-width: ${maxWidth}px;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  `;

  container.appendChild(tooltip);

  // Animate in
  requestAnimationFrame(() => {
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';
  });

  // Auto-hide after duration
  const hideTimeout = setTimeout(() => {
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translateY(-4px)';
    setTimeout(() => tooltip.remove(), 200);
  }, duration);

  // Return cleanup
  return () => {
    clearTimeout(hideTimeout);
    tooltip.remove();
  };
}

// =============================================================================
// Tooltip Class (for consistency with other components)
// =============================================================================

export class Tooltip {
  private cleanup: () => void;

  constructor(element: HTMLElement, options: TooltipOptions) {
    this.cleanup = attachTooltip(element, options);
  }

  destroy(): void {
    this.cleanup();
  }
}
