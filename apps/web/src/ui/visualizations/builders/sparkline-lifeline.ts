/**
 * Sparkline Lifeline Visualization Builder
 *
 * Tufte-inspired compact sparkline for showing trends.
 * Maximizes data-ink ratio with minimal chartjunk.
 *
 * Design Principles (Edward Tufte):
 * - Every pixel must earn its place
 * - No decorative elements (chartjunk)
 * - Direct labeling over legends
 * - Show data, not chrome
 *
 * Use Cases:
 * - Avatar glow edge (real-time mood lifeline)
 * - Conversation summary cards
 * - Weekly reflection widgets
 * - Compact metric displays
 *
 * @module visualizations/builders/sparkline-lifeline
 */

import {
  createElement,
  createSvg,
  createPath,
  createCircle,
  createText,
  setStyles,
  createScreenReaderLabel,
} from '../utils/dom.js';
import type {
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Data point for sparkline.
 */
export interface SparklinePoint {
  /** Timestamp or index */
  x: number | string;
  /** Value (will be normalized to 0-1) */
  value: number;
  /** Optional label for this point */
  label?: string;
}

/**
 * Sparkline data configuration.
 */
export interface SparklineData {
  /** Data points to display */
  points: SparklinePoint[];
  /** Optional title for accessibility */
  title?: string;
  /** Unit label (e.g., "%", "hrs") */
  unit?: string;
  /** Trend direction */
  trend?: 'up' | 'down' | 'stable';
}

/**
 * Sparkline rendering options.
 */
export interface SparklineOptions {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Show dot for current (last) value - Tufte: meaningful annotation */
  showCurrentDot?: boolean;
  /** Show min/max values - Tufte: only if meaningful */
  showMinMax?: boolean;
  /** Color the line by trend direction */
  colorByTrend?: boolean;
  /** Stroke width (default: 1.5 for crisp rendering) */
  strokeWidth?: number;
  /** Fill area under line with gradient */
  fillArea?: boolean;
  /** Persona color override */
  personaColor?: string;
}

// ============================================================================
// CONSTANTS (Tufte: minimal, purposeful)
// ============================================================================

/**
 * CSS variable references for sparkline colors.
 * Uses semantic color tokens for consistency.
 */
const SPARKLINE_COLORS = {
  line: 'var(--viz-sparkline-line, var(--color-accent))',
  lineUp: 'var(--viz-sparkline-up, var(--color-success))',
  lineDown: 'var(--viz-sparkline-down, var(--color-warning))',
  dot: 'var(--viz-sparkline-dot, var(--color-accent))',
  minMax: 'var(--viz-sparkline-minmax, var(--color-text-muted))',
  fill: 'var(--viz-sparkline-fill, var(--color-accent-tint))',
} as const;

/**
 * Default options for sparkline rendering.
 * Tufte: start minimal, add only what's needed.
 */
const DEFAULT_OPTIONS: SparklineOptions = {
  width: 100,
  height: 24,
  showCurrentDot: true,
  showMinMax: false,
  colorByTrend: false,
  strokeWidth: 1.5,
  fillArea: false,
};

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build sparkline lifeline visualization.
 * Adapts to device context for optimal rendering.
 */
export function buildSparklineLifeline(
  container: HTMLElement,
  data: SparklineData,
  context: DeviceContext,
  options: Partial<SparklineOptions> = {}
): VisualizationResult {
  // Merge options with defaults
  const opts: SparklineOptions = { ...DEFAULT_OPTIONS, ...options };

  // Device-specific adjustments
  switch (context.type) {
    case 'watch':
      return buildWatch(container, data, context, opts);
    case 'mobile':
      return buildMobile(container, data, context, opts);
    case 'tablet':
    case 'desktop':
    case 'tv':
      return buildDesktop(container, data, context, opts);
    default:
      return buildMobile(container, data, context, opts);
  }
}

// ============================================================================
// DEVICE-SPECIFIC BUILDERS
// ============================================================================

/**
 * Ultra-compact sparkline for watch.
 * Tufte: maximum data density in minimal space.
 */
function buildWatch(
  container: HTMLElement,
  data: SparklineData,
  _context: DeviceContext,
  options: SparklineOptions
): VisualizationResult {
  container.replaceChildren();

  // Watch: smaller dimensions, no labels
  const watchOptions: SparklineOptions = {
    ...options,
    width: Math.min(options.width, 60),
    height: Math.min(options.height, 16),
    showMinMax: false, // Too small for labels
    strokeWidth: 1, // Thinner for small screen
  };

  const svg = renderSparklineSVG(data, watchOptions);
  container.appendChild(svg);

  // Screen reader description
  const srLabel = createScreenReaderLabel(
    getAccessibleDescription(data, options)
  );
  container.appendChild(srLabel);

  return {
    element: container,
    type: 'sparkline',
    device: 'watch',
    ariaLabel: getAccessibleDescription(data, options),
    cleanup: () => container.replaceChildren(),
  };
}

/**
 * Mobile-optimized sparkline.
 * Slightly larger, touch-friendly current dot.
 */
function buildMobile(
  container: HTMLElement,
  data: SparklineData,
  _context: DeviceContext,
  options: SparklineOptions
): VisualizationResult {
  container.replaceChildren();

  // Mobile: larger touch targets
  const mobileOptions: SparklineOptions = {
    ...options,
    strokeWidth: options.strokeWidth ?? 2,
  };

  // Container with proper styling
  const wrapper = createElement('div', 'viz-sparkline');
  setStyles(wrapper, {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--viz-space-xs)',
  });

  // Sparkline SVG
  const svg = renderSparklineSVG(data, mobileOptions);
  wrapper.appendChild(svg);

  // Optional: Current value label (Tufte: direct labeling)
  const lastMobilePoint = data.points[data.points.length - 1];
  if (data.points.length > 0 && mobileOptions.showMinMax && lastMobilePoint) {
    const currentValue = lastMobilePoint.value;
    const valueLabel = createElement(
      'span',
      'viz-sparkline__value',
      formatValue(currentValue, data.unit)
    );
    setStyles(valueLabel, {
      fontSize: 'var(--viz-font-size-xs)',
      fontWeight: 'var(--viz-font-weight-medium)',
      color: 'var(--viz-text-primary)',
      fontVariantNumeric: 'tabular-nums',
    });
    wrapper.appendChild(valueLabel);
  }

  container.appendChild(wrapper);

  // Screen reader description
  const srLabel = createScreenReaderLabel(
    getAccessibleDescription(data, options)
  );
  container.appendChild(srLabel);

  return {
    element: container,
    type: 'sparkline',
    device: 'mobile',
    ariaLabel: getAccessibleDescription(data, options),
    cleanup: () => container.replaceChildren(),
  };
}

/**
 * Desktop sparkline with full features.
 * Can show min/max labels, trend indicators.
 */
function buildDesktop(
  container: HTMLElement,
  data: SparklineData,
  _context: DeviceContext,
  options: SparklineOptions
): VisualizationResult {
  container.replaceChildren();

  // Desktop: full features
  const desktopOptions: SparklineOptions = {
    ...options,
    showMinMax: options.showMinMax ?? true,
  };

  // Container with proper styling
  const wrapper = createElement('div', 'viz-sparkline viz-sparkline--desktop');
  setStyles(wrapper, {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--viz-space-sm)',
  });

  // Optional: Title (Tufte: only if needed)
  if (data.title) {
    const title = createElement(
      'span',
      'viz-sparkline__title',
      data.title
    );
    setStyles(title, {
      fontSize: 'var(--viz-font-size-sm)',
      color: 'var(--viz-text-secondary)',
      whiteSpace: 'nowrap',
    });
    wrapper.appendChild(title);
  }

  // Sparkline SVG
  const svg = renderSparklineSVG(data, desktopOptions);
  wrapper.appendChild(svg);

  // Current value with trend indicator
  const lastDesktopPoint = data.points[data.points.length - 1];
  if (data.points.length > 0 && lastDesktopPoint) {
    const currentValue = lastDesktopPoint.value;
    const valueContainer = createElement('div', 'viz-sparkline__current');
    setStyles(valueContainer, {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--viz-space-2xs)',
    });

    // Trend arrow (Tufte: only if meaningful)
    if (data.trend) {
      const trendArrow = createElement(
        'span',
        'viz-sparkline__trend',
        getTrendArrow(data.trend)
      );
      setStyles(trendArrow, {
        fontSize: 'var(--viz-font-size-xs)',
        color: getTrendColor(data.trend),
      });
      valueContainer.appendChild(trendArrow);
    }

    // Value label
    const valueLabel = createElement(
      'span',
      'viz-sparkline__value',
      formatValue(currentValue, data.unit)
    );
    setStyles(valueLabel, {
      fontSize: 'var(--viz-font-size-sm)',
      fontWeight: 'var(--viz-font-weight-semibold)',
      color: 'var(--viz-text-primary)',
      fontVariantNumeric: 'tabular-nums',
    });
    valueContainer.appendChild(valueLabel);

    wrapper.appendChild(valueContainer);
  }

  container.appendChild(wrapper);

  // Screen reader description
  const srLabel = createScreenReaderLabel(
    getAccessibleDescription(data, options)
  );
  container.appendChild(srLabel);

  return {
    element: container,
    type: 'sparkline',
    device: 'desktop',
    ariaLabel: getAccessibleDescription(data, options),
    cleanup: () => container.replaceChildren(),
  };
}

// ============================================================================
// SVG RENDERING (Tufte: Pure Data, No Chrome)
// ============================================================================

/**
 * Render the sparkline as SVG.
 * Tufte: maximize data-ink ratio.
 */
function renderSparklineSVG(
  data: SparklineData,
  options: SparklineOptions
): SVGSVGElement {
  const { width, height, strokeWidth = 1.5 } = options;

  // Padding for stroke and dots
  const padding = {
    x: (strokeWidth ?? 1.5) + 2,
    y: (strokeWidth ?? 1.5) + 2,
  };

  const plotWidth = width - padding.x * 2;
  const plotHeight = height - padding.y * 2;

  // Create SVG container
  const svg = createSvg(width, height);
  svg.setAttribute('class', 'viz-sparkline__svg');
  svg.style.overflow = 'visible';

  // Handle empty data gracefully
  if (data.points.length === 0) {
    return svg;
  }

  // Normalize data to 0-1 range
  const values = data.points.map(p => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1; // Prevent division by zero

  // Calculate point coordinates
  const points = data.points.map((point, i) => ({
    x: padding.x + (i / Math.max(data.points.length - 1, 1)) * plotWidth,
    y: padding.y + (1 - (point.value - minVal) / range) * plotHeight,
    value: point.value,
    label: point.label,
  }));

  // Determine line color
  let lineColor = options.personaColor || SPARKLINE_COLORS.line;
  if (options.colorByTrend && data.trend) {
    lineColor = data.trend === 'up'
      ? SPARKLINE_COLORS.lineUp
      : data.trend === 'down'
        ? SPARKLINE_COLORS.lineDown
        : lineColor;
  }

  // Optional: Fill area under line
  if (options.fillArea && points.length > 1) {
    const fillPath = createAreaPath(points, height - padding.y);
    const fill = createPath(fillPath, 'none', 0, SPARKLINE_COLORS.fill);
    fill.style.opacity = '0.2';
    svg.appendChild(fill);
  }

  // Draw line (the data itself - Tufte's "data-ink")
  if (points.length > 1) {
    const linePath = createLinePath(points);
    const line = createPath(linePath, lineColor, strokeWidth);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);
  }

  // Show min/max points (Tufte: only meaningful annotations)
  if (options.showMinMax && points.length > 2) {
    const firstPoint = points[0];
    if (firstPoint) {
      const minPoint = points.reduce((min, p) => p.y > min.y ? p : min, firstPoint);
      const maxPoint = points.reduce((max, p) => p.y < max.y ? p : max, firstPoint);

      // Min dot (subtle)
      const minDot = createCircle(minPoint.x, minPoint.y, 2, SPARKLINE_COLORS.minMax);
      svg.appendChild(minDot);

      // Max dot (subtle)
      const maxDot = createCircle(maxPoint.x, maxPoint.y, 2, SPARKLINE_COLORS.minMax);
      svg.appendChild(maxDot);
    }
  }

  // Current (last) point dot - the "now" indicator
  if (options.showCurrentDot && points.length > 0) {
    const lastPoint = points[points.length - 1];

    if (lastPoint) {
      // Outer glow (subtle emphasis)
      const glow = createCircle(lastPoint.x, lastPoint.y, 4, 'none', lineColor);
      glow.style.opacity = '0.3';
      svg.appendChild(glow);

      // Inner dot (solid)
      const dot = createCircle(lastPoint.x, lastPoint.y, 2.5, lineColor);
      svg.appendChild(dot);
    }
  }

  return svg;
}

// ============================================================================
// PATH HELPERS
// ============================================================================

/**
 * Create SVG path string for line.
 * Uses smooth curves for organic feel.
 */
function createLinePath(
  points: Array<{ x: number; y: number }>
): string {
  if (points.length === 0) return '';
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  // Use simple line segments (Tufte: no embellishment)
  let path = `M ${first.x} ${first.y}`;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p) {
      path += ` L ${p.x} ${p.y}`;
    }
  }

  return path;
}

/**
 * Create filled area path under line.
 */
function createAreaPath(
  points: Array<{ x: number; y: number }>,
  baseline: number
): string {
  if (points.length < 2) return '';
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';

  let path = `M ${first.x} ${baseline}`;
  path += ` L ${first.x} ${first.y}`;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p) {
      path += ` L ${p.x} ${p.y}`;
    }
  }

  path += ` L ${last.x} ${baseline}`;
  path += ' Z';

  return path;
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format value with optional unit.
 */
function formatValue(value: number, unit?: string): string {
  // Round to reasonable precision
  const formatted = value >= 100
    ? Math.round(value).toString()
    : value >= 10
      ? value.toFixed(1)
      : value.toFixed(2);

  return unit ? `${formatted}${unit}` : formatted;
}

/**
 * Get trend arrow character.
 */
function getTrendArrow(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up': return '↑';
    case 'down': return '↓';
    case 'stable': return '→';
  }
}

/**
 * Get trend color CSS variable.
 */
function getTrendColor(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up': return SPARKLINE_COLORS.lineUp;
    case 'down': return SPARKLINE_COLORS.lineDown;
    case 'stable': return 'var(--viz-text-muted)';
  }
}

/**
 * Generate accessible description of sparkline.
 */
function getAccessibleDescription(
  data: SparklineData,
  _options: SparklineOptions
): string {
  if (data.points.length === 0) {
    return t('visualizations.sparkline.noData', 'No data available');
  }

  const values = data.points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const current = values[values.length - 1] ?? min;
  const trendText = data.trend
    ? t(`visualizations.sparkline.trend.${data.trend}`, data.trend)
    : '';

  return t(
    'visualizations.sparkline.description',
    `${data.title || 'Trend'}: current ${formatValue(current, data.unit)}, range ${formatValue(min, data.unit)} to ${formatValue(max, data.unit)}${trendText ? `, trending ${trendText}` : ''}`
  );
}

// Types are already exported at their interface definitions
