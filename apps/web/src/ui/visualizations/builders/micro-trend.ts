/**
 * Micro-Trend Visualization Builder
 *
 * Ultra-compact trend indicators for space-constrained contexts.
 * The smallest possible visualization of a trend.
 *
 * Design Principles (Edward Tufte + Information Density):
 * - Single visual element captures trend essence
 * - No labels, no axes, no chrome
 * - Color and shape encode all meaning
 * - Fits inline with text or in tiny UI elements
 *
 * Use Cases:
 * - Avatar glow intensity indicator
 * - Inline text metrics (e.g., "Sleep 7.2h ↑")
 * - Watch complications
 * - Notification badges
 * - Dashboard tiles
 *
 * @module visualizations/builders/micro-trend
 */

import {
  createElement,
  createSvg,
  createPath,
  setStyles,
} from '../utils/dom.js';
import type {
  DeviceContext,
  VisualizationResult,
} from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Trend direction.
 */
export type TrendDirection = 'up' | 'down' | 'stable' | 'volatile';

/**
 * Trend magnitude (how strong the trend is).
 */
export type TrendMagnitude = 'strong' | 'moderate' | 'slight';

/**
 * Micro-trend data.
 */
export interface MicroTrendData {
  /** Direction of the trend */
  direction: TrendDirection;
  /** Strength of the trend */
  magnitude: TrendMagnitude;
  /** Current value (optional, for tooltip) */
  value?: number;
  /** Previous value (optional, for comparison) */
  previousValue?: number;
  /** Percentage change (optional) */
  percentChange?: number;
}

/**
 * Micro-trend display style.
 */
export type MicroTrendStyle =
  | 'arrow'      // Simple arrow (↑ ↓ → ~)
  | 'chevron'    // Filled chevron
  | 'mini-spark' // Tiny 5-point sparkline
  | 'dot-trail'  // Dots showing direction
  | 'pulse';     // Animated pulse for real-time

/**
 * Micro-trend rendering options.
 */
export interface MicroTrendOptions {
  /** Size in pixels (square) */
  size: number;
  /** Display style */
  style: MicroTrendStyle;
  /** Use semantic colors (green/red) vs neutral */
  useSemanticColors?: boolean;
  /** Animate the indicator */
  animate?: boolean;
  /** Persona color override */
  personaColor?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * CSS variable references for trend colors.
 */
const TREND_COLORS = {
  up: 'var(--viz-trend-up, var(--color-success))',
  down: 'var(--viz-trend-down, var(--color-warning))',
  stable: 'var(--viz-trend-stable, var(--color-text-muted))',
  volatile: 'var(--viz-trend-volatile, var(--color-accent))',
  neutral: 'var(--viz-trend-neutral, var(--color-text-secondary))',
} as const;

/**
 * Unicode arrows for text-based indicators.
 */
const TREND_ARROWS: Record<TrendDirection, Record<TrendMagnitude, string>> = {
  up: { strong: '⬆', moderate: '↑', slight: '↗' },
  down: { strong: '⬇', moderate: '↓', slight: '↘' },
  stable: { strong: '→', moderate: '→', slight: '→' },
  volatile: { strong: '↕', moderate: '↕', slight: '~' },
};

/**
 * Default options.
 */
const DEFAULT_OPTIONS: MicroTrendOptions = {
  size: 16,
  style: 'arrow',
  useSemanticColors: true,
  animate: false,
};

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build micro-trend indicator.
 */
export function buildMicroTrend(
  container: HTMLElement,
  data: MicroTrendData,
  context: DeviceContext,
  options: Partial<MicroTrendOptions> = {}
): VisualizationResult {
  const opts: MicroTrendOptions = { ...DEFAULT_OPTIONS, ...options };

  // Adjust size for watch
  if (context.type === 'watch') {
    opts.size = Math.min(opts.size, 12);
  }

  // Clear container
  container.replaceChildren();

  // Render based on style
  switch (opts.style) {
    case 'arrow':
      renderArrow(container, data, opts);
      break;
    case 'chevron':
      renderChevron(container, data, opts);
      break;
    case 'mini-spark':
      renderMiniSpark(container, data, opts);
      break;
    case 'dot-trail':
      renderDotTrail(container, data, opts);
      break;
    case 'pulse':
      renderPulse(container, data, opts);
      break;
    default:
      renderArrow(container, data, opts);
  }

  const ariaLabel = `Trend: ${data.direction}${data.magnitude ? ` (${data.magnitude})` : ''}, value: ${data.value}${data.previousValue !== undefined ? ` from ${data.previousValue}` : ''}`;

  return {
    element: container,
    type: 'micro-trend',
    device: context.type,
    ariaLabel,
    cleanup: () => container.replaceChildren(),
  };
}

// ============================================================================
// STYLE RENDERERS
// ============================================================================

/**
 * Render text arrow indicator.
 * Simplest form - just a Unicode character.
 */
function renderArrow(
  container: HTMLElement,
  data: MicroTrendData,
  options: MicroTrendOptions
): void {
  const arrow = createElement(
    'span',
    'viz-micro-trend viz-micro-trend--arrow',
    TREND_ARROWS[data.direction][data.magnitude]
  );

  setStyles(arrow, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${options.size}px`,
    height: `${options.size}px`,
    fontSize: `${options.size * 0.75}px`,
    lineHeight: '1',
    color: getColor(data.direction, options),
    fontWeight: data.magnitude === 'strong' ? '700' : '400',
  });

  // Add animation class if enabled
  if (options.animate) {
    arrow.classList.add('viz-micro-trend--animated');
    if (data.direction === 'up') {
      arrow.style.animation = 'micro-trend-bounce-up 1s ease infinite';
    } else if (data.direction === 'down') {
      arrow.style.animation = 'micro-trend-bounce-down 1s ease infinite';
    }
  }

  container.appendChild(arrow);
}

/**
 * Render SVG chevron indicator.
 * More graphical, better for larger sizes.
 */
function renderChevron(
  container: HTMLElement,
  data: MicroTrendData,
  options: MicroTrendOptions
): void {
  const { size } = options;
  const svg = createSvg(size, size);
  svg.setAttribute('class', 'viz-micro-trend viz-micro-trend--chevron');

  const color = getColor(data.direction, options);
  const strokeWidth = data.magnitude === 'strong' ? 2.5 : data.magnitude === 'moderate' ? 2 : 1.5;

  // Calculate chevron path based on direction
  const padding = size * 0.2;
  const chevronPath = getChevronPath(data.direction, size, padding);

  const path = createPath(chevronPath, color, strokeWidth);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  svg.appendChild(path);

  if (options.animate && data.direction !== 'stable') {
    svg.style.animation = `micro-trend-pulse 1.5s ease infinite`;
  }

  container.appendChild(svg);
}

/**
 * Render mini 5-point sparkline.
 * Shows recent trajectory in smallest possible form.
 */
function renderMiniSpark(
  container: HTMLElement,
  data: MicroTrendData,
  options: MicroTrendOptions
): void {
  const { size } = options;
  const svg = createSvg(size, size);
  svg.setAttribute('class', 'viz-micro-trend viz-micro-trend--mini-spark');

  const color = getColor(data.direction, options);

  // Generate 5 points based on trend
  const points = generateTrendPoints(data.direction, data.magnitude, 5);

  // Scale points to fit
  const padding = size * 0.15;
  const plotWidth = size - padding * 2;
  const plotHeight = size - padding * 2;

  const scaledPoints = points.map((y, i) => ({
    x: padding + (i / 4) * plotWidth,
    y: padding + (1 - y) * plotHeight,
  }));

  // Create path
  const first = scaledPoints[0];
  if (!first) return;
  let pathD = `M ${first.x} ${first.y}`;
  for (let i = 1; i < scaledPoints.length; i++) {
    const p = scaledPoints[i];
    if (p) pathD += ` L ${p.x} ${p.y}`;
  }

  const path = createPath(pathD, color, 1.5);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  svg.appendChild(path);
  container.appendChild(svg);
}

/**
 * Render dot trail indicator.
 * Shows direction with gradient of dots.
 */
function renderDotTrail(
  container: HTMLElement,
  data: MicroTrendData,
  options: MicroTrendOptions
): void {
  const { size } = options;
  const wrapper = createElement('div', 'viz-micro-trend viz-micro-trend--dot-trail');

  setStyles(wrapper, {
    display: 'flex',
    alignItems: data.direction === 'up' ? 'flex-end' : data.direction === 'down' ? 'flex-start' : 'center',
    justifyContent: 'center',
    gap: '1px',
    width: `${size}px`,
    height: `${size}px`,
    flexDirection: data.direction === 'volatile' ? 'row' : 'row',
  });

  const color = getColor(data.direction, options);
  const dotCount = 3;
  const dotSizes = getDotSizes(data.direction, data.magnitude, dotCount);

  dotSizes.forEach((dotSize, i) => {
    const dot = createElement('span', 'viz-micro-trend__dot');
    const actualSize = (size / 4) * dotSize;

    setStyles(dot, {
      width: `${actualSize}px`,
      height: `${actualSize}px`,
      borderRadius: '50%',
      backgroundColor: color,
      opacity: String(0.4 + (i / dotCount) * 0.6), // Fade in
    });

    wrapper.appendChild(dot);
  });

  container.appendChild(wrapper);
}

/**
 * Render animated pulse indicator.
 * For real-time/live data.
 */
function renderPulse(
  container: HTMLElement,
  data: MicroTrendData,
  options: MicroTrendOptions
): void {
  const { size } = options;
  const wrapper = createElement('div', 'viz-micro-trend viz-micro-trend--pulse');

  setStyles(wrapper, {
    position: 'relative',
    width: `${size}px`,
    height: `${size}px`,
  });

  const color = getColor(data.direction, options);

  // Outer pulse ring
  const ring = createElement('span', 'viz-micro-trend__ring');
  setStyles(ring, {
    position: 'absolute',
    inset: '0',
    borderRadius: '50%',
    border: `1px solid ${color}`,
    opacity: '0.5',
    animation: 'micro-trend-ring-pulse 1.5s ease-out infinite',
  });

  // Inner dot
  const dot = createElement('span', 'viz-micro-trend__core');
  const coreSize = size * 0.4;
  setStyles(dot, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: `${coreSize}px`,
    height: `${coreSize}px`,
    borderRadius: '50%',
    backgroundColor: color,
  });

  wrapper.appendChild(ring);
  wrapper.appendChild(dot);
  container.appendChild(wrapper);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get color for trend direction.
 */
function getColor(direction: TrendDirection, options: MicroTrendOptions): string {
  if (options.personaColor) {
    return options.personaColor;
  }

  if (!options.useSemanticColors) {
    return TREND_COLORS.neutral;
  }

  return TREND_COLORS[direction];
}

/**
 * Generate chevron path based on direction.
 */
function getChevronPath(
  direction: TrendDirection,
  size: number,
  padding: number
): string {
  const inner = size - padding * 2;
  const mid = size / 2;

  switch (direction) {
    case 'up':
      return `M ${padding} ${mid + inner * 0.25} L ${mid} ${padding} L ${size - padding} ${mid + inner * 0.25}`;
    case 'down':
      return `M ${padding} ${mid - inner * 0.25} L ${mid} ${size - padding} L ${size - padding} ${mid - inner * 0.25}`;
    case 'stable':
      return `M ${padding} ${mid} L ${size - padding} ${mid}`;
    case 'volatile':
      return `M ${padding} ${mid - inner * 0.2} L ${mid * 0.75} ${mid + inner * 0.2} L ${mid * 1.25} ${mid - inner * 0.2} L ${size - padding} ${mid + inner * 0.2}`;
    default:
      return '';
  }
}

/**
 * Generate trend points for mini-spark.
 */
function generateTrendPoints(
  direction: TrendDirection,
  magnitude: TrendMagnitude,
  count: number
): number[] {
  const slope = magnitude === 'strong' ? 0.15 : magnitude === 'moderate' ? 0.08 : 0.04;
  const noise = 0.05;

  const points: number[] = [];
  const base = direction === 'up' ? 0.3 : direction === 'down' ? 0.7 : 0.5;

  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    const trend = direction === 'up' ? slope * progress * count
      : direction === 'down' ? -slope * progress * count
        : 0;
    const jitter = direction === 'volatile'
      ? (Math.sin(i * 2) * 0.2)
      : (Math.random() - 0.5) * noise;

    points.push(Math.max(0, Math.min(1, base + trend + jitter)));
  }

  return points;
}

/**
 * Get dot sizes for dot-trail based on trend.
 */
function getDotSizes(
  direction: TrendDirection,
  magnitude: TrendMagnitude,
  count: number
): number[] {
  const sizes: number[] = [];
  const maxSize = magnitude === 'strong' ? 1 : magnitude === 'moderate' ? 0.8 : 0.6;

  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    if (direction === 'up') {
      sizes.push(0.3 + progress * maxSize * 0.7);
    } else if (direction === 'down') {
      sizes.push(maxSize - progress * maxSize * 0.5);
    } else {
      sizes.push(0.5 + Math.sin(progress * Math.PI) * 0.3);
    }
  }

  return sizes;
}

// ============================================================================
// CSS ANIMATIONS (injected on first use)
// ============================================================================

let stylesInjected = false;

/**
 * Inject CSS animations for micro-trends.
 * Only runs once.
 */
export function injectMicroTrendStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes micro-trend-bounce-up {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2px); }
    }

    @keyframes micro-trend-bounce-down {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(2px); }
    }

    @keyframes micro-trend-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    @keyframes micro-trend-ring-pulse {
      0% { transform: scale(0.8); opacity: 0.8; }
      100% { transform: scale(1.5); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// Types are already exported at their type/interface definitions
