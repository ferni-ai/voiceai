/**
 * Data-Ink Optimizer
 *
 * Utilities for maximizing data-ink ratio in visualizations.
 * Based on Edward Tufte's principles from "The Visual Display of Quantitative Information".
 *
 * Data-ink ratio = (ink used to show data) / (total ink used)
 *
 * Core Principles:
 * 1. Above all else, show the data
 * 2. Maximize the data-ink ratio
 * 3. Erase non-data-ink (chartjunk)
 * 4. Erase redundant data-ink
 *
 * @module visualizations/builders/data-ink-optimizer
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Analysis of a visualization's data-ink ratio.
 */
export interface DataInkAnalysis {
  /** Overall score 0-1 (higher = better) */
  score: number;
  /** Issues found */
  issues: DataInkIssue[];
  /** Suggestions for improvement */
  suggestions: DataInkSuggestion[];
  /** Element counts */
  counts: {
    dataElements: number;
    decorativeElements: number;
    redundantElements: number;
  };
}

/**
 * A data-ink issue found in visualization.
 */
export interface DataInkIssue {
  type: DataInkIssueType;
  severity: 'high' | 'medium' | 'low';
  description: string;
  element?: string; // CSS selector or description
}

/**
 * Types of data-ink issues.
 */
export type DataInkIssueType =
  | 'decorative-gridlines'
  | 'redundant-axis-labels'
  | 'unnecessary-legend'
  | 'chartjunk-border'
  | 'chartjunk-shadow'
  | 'chartjunk-3d'
  | 'excessive-colors'
  | 'redundant-labels'
  | 'decorative-background'
  | 'non-essential-animation';

/**
 * Suggestion for improving data-ink ratio.
 */
export interface DataInkSuggestion {
  action: 'remove' | 'simplify' | 'merge' | 'direct-label';
  target: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

/**
 * Configuration for optimizing data-ink.
 */
export interface DataInkConfig {
  /** Allow gridlines (false = remove them) */
  allowGridlines?: boolean;
  /** Allow legends (false = use direct labeling) */
  allowLegend?: boolean;
  /** Allow axis decorations */
  allowAxisDecorations?: boolean;
  /** Maximum number of colors before warning */
  maxColors?: number;
  /** Allow drop shadows */
  allowShadows?: boolean;
  /** Allow gradients for non-data purposes */
  allowDecorativeGradients?: boolean;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

/**
 * Default Tufte-strict configuration.
 * Maximizes data-ink ratio.
 */
export const TUFTE_STRICT: DataInkConfig = {
  allowGridlines: false,
  allowLegend: false,
  allowAxisDecorations: false,
  maxColors: 4,
  allowShadows: false,
  allowDecorativeGradients: false,
};

/**
 * Relaxed configuration for more decorative visualizations.
 */
export const RELAXED_CONFIG: DataInkConfig = {
  allowGridlines: true,
  allowLegend: true,
  allowAxisDecorations: true,
  maxColors: 8,
  allowShadows: true,
  allowDecorativeGradients: true,
};

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze an SVG element for data-ink ratio.
 */
export function analyzeDataInk(
  svg: SVGElement,
  config: DataInkConfig = TUFTE_STRICT
): DataInkAnalysis {
  const issues: DataInkIssue[] = [];
  const suggestions: DataInkSuggestion[] = [];

  let dataElements = 0;
  let decorativeElements = 0;
  const redundantElements = 0;

  // Check for gridlines
  const gridlines = svg.querySelectorAll('[class*="grid"], [class*="axis-line"], line[stroke-dasharray]');
  if (gridlines.length > 0 && !config.allowGridlines) {
    decorativeElements += gridlines.length;
    issues.push({
      type: 'decorative-gridlines',
      severity: 'medium',
      description: `Found ${gridlines.length} gridline elements. Tufte recommends removing gridlines.`,
    });
    suggestions.push({
      action: 'remove',
      target: 'gridlines',
      description: 'Remove gridlines - let data speak for itself',
      impact: 'medium',
    });
  }

  // Check for legends
  const legends = svg.querySelectorAll('[class*="legend"]');
  if (legends.length > 0 && !config.allowLegend) {
    decorativeElements += legends.length;
    issues.push({
      type: 'unnecessary-legend',
      severity: 'medium',
      description: 'Legend found. Consider using direct labeling instead.',
    });
    suggestions.push({
      action: 'direct-label',
      target: 'legend',
      description: 'Replace legend with direct labeling on data elements',
      impact: 'high',
    });
  }

  // Check for drop shadows
  const shadows = svg.querySelectorAll('[filter*="shadow"], [style*="box-shadow"], [filter*="drop-shadow"]');
  if (shadows.length > 0 && !config.allowShadows) {
    decorativeElements += shadows.length;
    issues.push({
      type: 'chartjunk-shadow',
      severity: 'low',
      description: `Found ${shadows.length} elements with shadows.`,
    });
    suggestions.push({
      action: 'remove',
      target: 'shadows',
      description: 'Remove drop shadows - they add visual noise without information',
      impact: 'low',
    });
  }

  // Check for 3D effects (transforms suggesting 3D)
  const threeDElements = svg.querySelectorAll('[transform*="skew"], [transform*="rotate3d"]');
  if (threeDElements.length > 0) {
    decorativeElements += threeDElements.length;
    issues.push({
      type: 'chartjunk-3d',
      severity: 'high',
      description: '3D effects detected. 3D distorts data perception.',
    });
    suggestions.push({
      action: 'simplify',
      target: '3D elements',
      description: 'Remove 3D effects - they distort accurate data reading',
      impact: 'high',
    });
  }

  // Check for excessive borders
  const borderedRects = svg.querySelectorAll('rect[stroke]:not([fill="none"])');
  const unnecessaryBorders = Array.from(borderedRects).filter(rect => {
    const fill = rect.getAttribute('fill');
    const stroke = rect.getAttribute('stroke');
    return fill && stroke && fill !== 'none' && stroke !== 'none';
  });
  if (unnecessaryBorders.length > 0) {
    decorativeElements += unnecessaryBorders.length;
    issues.push({
      type: 'chartjunk-border',
      severity: 'low',
      description: `Found ${unnecessaryBorders.length} filled shapes with borders. Consider removing borders.`,
    });
  }

  // Count data elements (paths, circles, text)
  const dataPaths = svg.querySelectorAll('path[d]:not([class*="grid"]):not([class*="axis"])');
  const dataCircles = svg.querySelectorAll('circle:not([class*="decoration"])');
  const dataText = svg.querySelectorAll('text:not([class*="axis-label"])');
  dataElements = dataPaths.length + dataCircles.length + dataText.length;

  // Check color usage
  const uniqueColors = getUniqueColors(svg);
  if (uniqueColors.size > (config.maxColors ?? 4)) {
    issues.push({
      type: 'excessive-colors',
      severity: 'medium',
      description: `Using ${uniqueColors.size} colors. Consider reducing to ${config.maxColors ?? 4} or fewer.`,
    });
    suggestions.push({
      action: 'simplify',
      target: 'color palette',
      description: `Reduce color palette to ${config.maxColors ?? 4} colors for clarity`,
      impact: 'medium',
    });
  }

  // Calculate score
  const totalElements = dataElements + decorativeElements + redundantElements;
  const score = totalElements > 0 ? dataElements / totalElements : 1;

  return {
    score,
    issues,
    suggestions,
    counts: {
      dataElements,
      decorativeElements,
      redundantElements,
    },
  };
}

/**
 * Get unique colors used in an SVG.
 */
function getUniqueColors(svg: SVGElement): Set<string> {
  const colors = new Set<string>();

  const elements = svg.querySelectorAll('[fill], [stroke]');
  elements.forEach(el => {
    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    if (fill && fill !== 'none') colors.add(normalizeColor(fill));
    if (stroke && stroke !== 'none') colors.add(normalizeColor(stroke));
  });

  return colors;
}

/**
 * Normalize color value for comparison.
 */
function normalizeColor(color: string): string {
  // Handle CSS variables
  if (color.startsWith('var(')) {
    return color.toLowerCase();
  }
  // Simple normalization - lowercase
  return color.toLowerCase().trim();
}

// ============================================================================
// OPTIMIZATION FUNCTIONS
// ============================================================================

/**
 * Apply Tufte optimizations to an SVG.
 * Returns a cloned, optimized SVG.
 */
export function optimizeSvg(
  svg: SVGElement,
  config: DataInkConfig = TUFTE_STRICT
): SVGElement {
  const optimized = svg.cloneNode(true) as SVGElement;

  // Remove gridlines
  if (!config.allowGridlines) {
    const gridlines = optimized.querySelectorAll('[class*="grid"], [class*="axis-line"]');
    gridlines.forEach(el => el.remove());
  }

  // Remove legends
  if (!config.allowLegend) {
    const legends = optimized.querySelectorAll('[class*="legend"]');
    legends.forEach(el => el.remove());
  }

  // Remove shadows
  if (!config.allowShadows) {
    const shadowedElements = optimized.querySelectorAll('[filter*="shadow"]');
    shadowedElements.forEach(el => el.removeAttribute('filter'));

    // Remove shadow filter definitions
    const shadowFilters = optimized.querySelectorAll('filter[id*="shadow"]');
    shadowFilters.forEach(el => el.remove());
  }

  // Simplify strokes (remove redundant borders)
  const filledRects = optimized.querySelectorAll('rect[fill]:not([fill="none"])');
  filledRects.forEach(rect => {
    const fill = rect.getAttribute('fill');
    if (fill && fill !== 'none') {
      // Remove stroke if it's just a border
      rect.removeAttribute('stroke');
      rect.removeAttribute('stroke-width');
    }
  });

  return optimized;
}

/**
 * Generate CSS to hide non-data-ink elements.
 * Useful for print or export.
 */
export function generateMinimalCss(selector: string): string {
  return `
    ${selector} [class*="grid"],
    ${selector} [class*="axis-line"],
    ${selector} [class*="legend"],
    ${selector} [class*="decoration"] {
      display: none !important;
    }

    ${selector} [filter*="shadow"] {
      filter: none !important;
    }

    ${selector} rect[stroke] {
      stroke: none !important;
    }
  `;
}

// ============================================================================
// TUFTE PRINCIPLES CHECKLIST
// ============================================================================

/**
 * Tufte's principles for graphics integrity.
 * Use this checklist when designing visualizations.
 */
export const TUFTE_CHECKLIST = {
  /**
   * The representation of numbers should be directly proportional
   * to the numerical quantities represented.
   */
  proportionalRepresentation: {
    question: 'Is the visual size proportional to the data value?',
    badExample: 'Area charts where radius (not area) encodes value',
    fix: 'Ensure visual size scales with data value correctly',
  },

  /**
   * Clear, detailed, and thorough labeling should be used to defeat
   * graphical distortion and ambiguity.
   */
  clearLabeling: {
    question: 'Is every data element clearly labeled?',
    badExample: 'Legend far from data requiring eye movement',
    fix: 'Use direct labeling on or next to data points',
  },

  /**
   * Show data variation, not design variation.
   */
  showDataVariation: {
    question: 'Does visual variation come from data, not decoration?',
    badExample: 'Decorative 3D effects, rainbow gradients',
    fix: 'Remove all decoration that doesn\'t encode data',
  },

  /**
   * In time-series displays, standardize the measurement intervals.
   */
  standardizedIntervals: {
    question: 'Are time intervals consistent and clearly marked?',
    badExample: 'Mixing days, weeks, and months without indication',
    fix: 'Use consistent intervals or clearly mark changes',
  },

  /**
   * The number of information-carrying dimensions depicted should
   * not exceed the number of dimensions in the data.
   */
  matchDimensions: {
    question: 'Does visual dimensionality match data dimensionality?',
    badExample: '3D bars for single-variable data',
    fix: 'Use 2D for 2D data, avoid fake dimensions',
  },

  /**
   * Graphics must not quote data out of context.
   */
  showContext: {
    question: 'Is sufficient context provided for understanding?',
    badExample: 'Truncated Y-axis starting at 95 instead of 0',
    fix: 'Show full scale or clearly indicate truncation',
  },
} as const;

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Calculate Lie Factor (Tufte's measure of graphical integrity).
 * Lie Factor = (size of effect in graphic) / (size of effect in data)
 *
 * A Lie Factor of 1 is perfect. >1.05 or <0.95 indicates distortion.
 */
export function calculateLieFactor(
  graphicChange: number,
  dataChange: number
): number {
  if (dataChange === 0) return graphicChange === 0 ? 1 : Infinity;
  return graphicChange / dataChange;
}

/**
 * Check if a Lie Factor indicates distortion.
 */
export function isDistorted(lieFactor: number): boolean {
  return lieFactor < 0.95 || lieFactor > 1.05;
}

/**
 * Get severity of Lie Factor distortion.
 */
export function getLieFactorSeverity(
  lieFactor: number
): 'none' | 'minor' | 'moderate' | 'severe' {
  if (lieFactor >= 0.95 && lieFactor <= 1.05) return 'none';
  if (lieFactor >= 0.8 && lieFactor <= 1.25) return 'minor';
  if (lieFactor >= 0.5 && lieFactor <= 2) return 'moderate';
  return 'severe';
}

// getUniqueColors is intentionally not exported - it's internal
