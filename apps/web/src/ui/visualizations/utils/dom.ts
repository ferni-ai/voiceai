/**
 * DOM Utilities for Visualization Builders
 *
 * Safe DOM creation functions that avoid innerHTML for security.
 * All visualization builders should use these helpers.
 *
 * @module visualizations/utils/dom
 */

// ============================================================================
// ELEMENT CREATION
// ============================================================================

/**
 * Create an HTML element with optional class and text content.
 * Safe alternative to innerHTML.
 */
export function createElement(
  tag: keyof HTMLElementTagNameMap,
  className?: string,
  textContent?: string
): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  return el;
}

/**
 * Create an SVG element with proper namespace.
 */
export function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K
): SVGElementTagNameMap[K] {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

/**
 * Create a complete SVG container with viewBox.
 */
export function createSvg(
  width: number,
  height: number,
  viewBox?: string
): SVGSVGElement {
  const svg = createSvgElement('svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', viewBox || `0 0 ${width} ${height}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

// ============================================================================
// SVG HELPERS
// ============================================================================

/**
 * Create an SVG path element.
 */
export function createPath(
  d: string,
  stroke?: string,
  strokeWidth?: number,
  fill?: string
): SVGPathElement {
  const path = createSvgElement('path');
  path.setAttribute('d', d);
  if (stroke) path.setAttribute('stroke', stroke);
  if (strokeWidth) path.setAttribute('stroke-width', String(strokeWidth));
  path.setAttribute('fill', fill || 'none');
  return path;
}

/**
 * Create an SVG circle element.
 */
export function createCircle(
  cx: number,
  cy: number,
  r: number,
  fill?: string,
  stroke?: string
): SVGCircleElement {
  const circle = createSvgElement('circle');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', String(r));
  if (fill) circle.setAttribute('fill', fill);
  if (stroke) circle.setAttribute('stroke', stroke);
  return circle;
}

/**
 * Create an SVG rect element.
 */
export function createRect(
  x: number,
  y: number,
  width: number,
  height: number,
  rx?: number,
  fill?: string
): SVGRectElement {
  const rect = createSvgElement('rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
  if (rx) rect.setAttribute('rx', String(rx));
  if (fill) rect.setAttribute('fill', fill);
  return rect;
}

/**
 * Create an SVG text element.
 */
export function createText(
  x: number,
  y: number,
  content: string,
  options?: {
    fill?: string;
    fontSize?: string;
    fontWeight?: string;
    textAnchor?: 'start' | 'middle' | 'end';
    dominantBaseline?: 'auto' | 'middle' | 'hanging';
  }
): SVGTextElement {
  const text = createSvgElement('text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  text.textContent = content;
  if (options?.fill) text.setAttribute('fill', options.fill);
  if (options?.fontSize) text.setAttribute('font-size', options.fontSize);
  if (options?.fontWeight) text.setAttribute('font-weight', options.fontWeight);
  if (options?.textAnchor) text.setAttribute('text-anchor', options.textAnchor);
  if (options?.dominantBaseline) text.setAttribute('dominant-baseline', options.dominantBaseline);
  return text;
}

// ============================================================================
// RING/ARC HELPERS (for watch visualizations)
// ============================================================================

/**
 * Create a circular arc path for progress rings.
 * Used for watch-style gauges and energy rings.
 */
export function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
  ].join(' ');
}

/**
 * Convert polar coordinates to cartesian.
 */
function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

/**
 * Create a full circle path (for background rings).
 */
export function createRingPath(cx: number, cy: number, radius: number): string {
  return `M ${cx} ${cy - radius} a ${radius} ${radius} 0 0 1 0 ${radius * 2} a ${radius} ${radius} 0 0 1 0 -${radius * 2}`;
}

// ============================================================================
// STYLE HELPERS
// ============================================================================

/**
 * Get a CSS variable value from the document.
 */
export function getCssVar(name: string, fallback?: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback || '';
}

/**
 * Apply multiple styles to an element.
 */
export function setStyles(
  element: HTMLElement | SVGElement,
  styles: Partial<CSSStyleDeclaration>
): void {
  Object.assign(element.style, styles);
}

/**
 * Create a flex container with common settings.
 */
export function createFlexContainer(
  direction: 'row' | 'column' = 'row',
  gap?: string,
  justify?: string,
  align?: string
): HTMLDivElement {
  const div = createElement('div') as HTMLDivElement;
  div.style.display = 'flex';
  div.style.flexDirection = direction;
  if (gap) div.style.gap = gap;
  if (justify) div.style.justifyContent = justify;
  if (align) div.style.alignItems = align;
  return div;
}

// ============================================================================
// ACCESSIBILITY HELPERS
// ============================================================================

/**
 * Add ARIA attributes to an element.
 */
export function setAriaAttributes(
  element: HTMLElement,
  attrs: Record<string, string>
): void {
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(`aria-${key}`, value);
  }
}

/**
 * Create a visually hidden label for screen readers.
 */
export function createScreenReaderLabel(text: string): HTMLSpanElement {
  const span = createElement('span', 'sr-only', text) as HTMLSpanElement;
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

// ============================================================================
// ANIMATION HELPERS
// ============================================================================

/**
 * Animation durations from design system.
 */
export const DURATION = {
  FAST: 150,
  NORMAL: 200,
  SLOW: 300,
  MODERATE: 400,
} as const;

/**
 * Easing functions from design system.
 */
export const EASING = {
  STANDARD: 'cubic-bezier(0.4, 0, 0.2, 1)',
  OUT_EXPO: 'cubic-bezier(0.16, 1, 0.3, 1)',
  SPRING: 'cubic-bezier(0.5, 1.5, 0.5, 1)',
} as const;

/**
 * Animate an element with Web Animations API.
 * Returns a cleanup function.
 */
export function animate(
  element: HTMLElement | SVGElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): () => void {
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    // Apply final state immediately
    const finalFrame = keyframes[keyframes.length - 1];
    if (finalFrame) {
      for (const [key, value] of Object.entries(finalFrame)) {
        if (key !== 'offset' && key !== 'easing' && key !== 'composite') {
          (element.style as unknown as Record<string, unknown>)[key] = value;
        }
      }
    }
    return () => {};
  }

  const animation = element.animate(keyframes, options);

  return () => {
    animation.cancel();
  };
}
