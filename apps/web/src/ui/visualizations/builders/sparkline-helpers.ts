/**
 * Sparkline lifeline - colors, SVG path builders and value/trend formatting. Extracted from sparkline-lifeline.ts.
 */

/**
 * CSS variable references for sparkline colors.
 * Uses semantic color tokens for consistency.
 */
export const SPARKLINE_COLORS = {
  line: 'var(--viz-sparkline-line, var(--color-accent))',
  lineUp: 'var(--viz-sparkline-up, var(--color-success))',
  lineDown: 'var(--viz-sparkline-down, var(--color-warning))',
  dot: 'var(--viz-sparkline-dot, var(--color-accent))',
  minMax: 'var(--viz-sparkline-minmax, var(--color-text-muted))',
  fill: 'var(--viz-sparkline-fill, var(--color-accent-tint))',
} as const;

/**
 * Create SVG path string for line.
 * Uses smooth curves for organic feel.
 */
export function createLinePath(points: Array<{ x: number; y: number }>): string {
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
export function createAreaPath(points: Array<{ x: number; y: number }>, baseline: number): string {
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

/**
 * Format value with optional unit.
 */
export function formatValue(value: number, unit?: string): string {
  // Round to reasonable precision
  const formatted =
    value >= 100 ? Math.round(value).toString() : value >= 10 ? value.toFixed(1) : value.toFixed(2);

  return unit ? `${formatted}${unit}` : formatted;
}

/**
 * Get trend arrow character.
 */
export function getTrendArrow(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'stable':
      return '→';
  }
}

/**
 * Get trend color CSS variable.
 */
export function getTrendColor(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up':
      return SPARKLINE_COLORS.lineUp;
    case 'down':
      return SPARKLINE_COLORS.lineDown;
    case 'stable':
      return 'var(--viz-text-muted)';
  }
}
