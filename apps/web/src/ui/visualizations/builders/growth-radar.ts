/**
 * Growth Radar Visualization Builder
 *
 * Displays multi-dimensional growth as a radar/fingerprint chart.
 * Adapts to different device sizes:
 * - Watch: Hexagon shape with top dimension
 * - Mobile: Card-based with dimension bars
 * - Tablet: Full radar chart with labels
 *
 * @module visualizations/builders/growth-radar
 */

import {
  createElement,
  createSvgElement,
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
} from '../utils/dom.js';
import type {
  GrowthRadarData,
  GrowthDimension,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { DEFAULT_COLORS } from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DIMENSION_COLORS: Record<string, string> = {
  relational: DEFAULT_COLORS.accent,
  emotional: '#a67a6a',
  creative: '#f5a623',
  career: '#3a6b73',
  physical: '#4a6741',
  spiritual: '#8a7a9a',
};

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build compact growth radar for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: GrowthRadarData
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Growth'));
  header.appendChild(createElement('p', '', 'Your fingerprint'));
  container.appendChild(header);

  // Mini hexagon radar
  const radarContainer = createElement('div');
  setStyles(radarContainer, {
    display: 'flex',
    justifyContent: 'center',
    margin: '8px 0',
  });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  setStyles(svg as unknown as HTMLElement, {
    width: '60px',
    height: '60px',
  });

  // Create hexagon points based on dimension values
  const points = createPolygonPoints(data.dimensions, 30, 30, 25);
  const polygon = createSvgElement('polygon');
  polygon.setAttribute('points', points);
  polygon.setAttribute('fill', 'var(--color-accent)');
  polygon.setAttribute('fill-opacity', '0.3');
  polygon.setAttribute('stroke', 'var(--color-accent)');
  polygon.setAttribute('stroke-width', '1.5');
  svg.appendChild(polygon);

  radarContainer.appendChild(svg);
  container.appendChild(radarContainer);

  // Top dimension metric
  const topDimension = getTopDimension(data.dimensions);
  const metric = createElement('div', 'watch-metric', `${topDimension.name}: ${Math.round(topDimension.value * 100)}%`);
  container.appendChild(metric);

  return {
    element: container,
    type: 'growth-radar',
    device: 'watch',
    ariaLabel: `Growth radar showing ${topDimension.name} as strongest at ${Math.round(topDimension.value * 100)}%`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build growth radar for mobile (iOS/Android).
 */
function buildMobile(
  container: HTMLElement,
  data: GrowthRadarData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Growth Radar'));
  header.appendChild(createElement('p', '', 'Your multi-dimensional growth'));
  container.appendChild(header);

  // Top 4 dimensions as cards
  const topDimensions = [...data.dimensions]
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  topDimensions.forEach((dim) => {
    const color = getDimensionColor(dim.name);
    const card = createElement('div', 'mobile-card');
    if (isAndroid) {
      setStyles(card, { borderLeft: `3px solid ${color}` });
    }

    const cardHeader = createElement('div', 'mobile-card-header');
    cardHeader.appendChild(createElement('span', 'mobile-card-title', dim.name));

    const badge = createElement('span', 'mobile-card-badge', `${Math.round(dim.value * 100)}%`);
    setStyles(badge, { background: color });
    cardHeader.appendChild(badge);
    card.appendChild(cardHeader);

    // Progress bar
    const bar = createElement('div', 'mobile-bar');
    if (isAndroid) setStyles(bar, { borderRadius: '0' });
    setStyles(bar, {
      height: '8px',
      background: 'rgba(44, 37, 32, 0.1)',
      borderRadius: isAndroid ? '0' : '4px',
      overflow: 'hidden',
      marginTop: '8px',
    });

    const fill = createElement('div', 'mobile-bar-fill');
    setStyles(fill, {
      width: `${dim.value * 100}%`,
      height: '100%',
      background: color,
      borderRadius: isAndroid ? '0' : '4px',
    });
    bar.appendChild(fill);
    card.appendChild(bar);

    container.appendChild(card);
  });

  // Growth edge card
  const lowestDim = [...data.dimensions].sort((a, b) => a.value - b.value)[0];
  if (lowestDim) {
    const edgeCard = createElement('div', 'mobile-card');
    if (isAndroid) {
      setStyles(edgeCard, { borderLeft: '3px solid var(--persona-nayan)' });
    }

    const edgeHeader = createElement('div', 'mobile-card-header');
    edgeHeader.appendChild(createElement('span', 'mobile-card-title', 'Growth Edge'));
    edgeCard.appendChild(edgeHeader);

    const edgeInsight = createElement('p', 'mobile-insight');
    edgeInsight.textContent = `${lowestDim.name} (${Math.round(lowestDim.value * 100)}%) presents the greatest opportunity.`;
    edgeCard.appendChild(edgeInsight);
    container.appendChild(edgeCard);
  }

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Growth radar with ${data.dimensions.length} dimensions. Overall growth: ${Math.round(data.overallGrowth * 100)}%.`
    )
  );

  return {
    element: container,
    type: 'growth-radar',
    device: 'mobile',
    ariaLabel: `Growth radar showing ${data.dimensions.length} dimensions`,
  };
}

// ============================================================================
// TABLET BUILDER
// ============================================================================

/**
 * Build growth radar for tablet with full radar chart.
 */
function buildTablet(
  container: HTMLElement,
  data: GrowthRadarData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Growth Fingerprint'));
  header.appendChild(createElement('p', '', 'Your multi-dimensional growth profile'));
  container.appendChild(header);

  // Main content grid
  const contentGrid = createFlexContainer('row', '24px');
  setStyles(contentGrid, { padding: '16px' });

  // Left: Radar chart
  const chartSection = createElement('div');
  setStyles(chartSection, { flex: '2', display: 'flex', justifyContent: 'center' });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  setStyles(svg as unknown as HTMLElement, {
    width: '100%',
    maxWidth: '300px',
  });

  const center = 100;
  const maxRadius = 80;
  const n = data.dimensions.length;

  // Draw grid circles
  [0.25, 0.5, 0.75, 1].forEach((scale) => {
    const circle = createSvgElement('circle');
    circle.setAttribute('cx', String(center));
    circle.setAttribute('cy', String(center));
    circle.setAttribute('r', String(maxRadius * scale));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'var(--color-border-subtle)');
    circle.setAttribute('stroke-width', '1');
    svg.appendChild(circle);
  });

  // Draw axes and labels
  data.dimensions.forEach((dim, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = center + maxRadius * Math.cos(angle);
    const y = center + maxRadius * Math.sin(angle);

    // Axis line
    const line = createSvgElement('line');
    line.setAttribute('x1', String(center));
    line.setAttribute('y1', String(center));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'var(--color-border-subtle)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    // Label
    const labelX = center + (maxRadius + 15) * Math.cos(angle);
    const labelY = center + (maxRadius + 15) * Math.sin(angle);
    const text = createSvgElement('text');
    text.setAttribute('x', String(labelX));
    text.setAttribute('y', String(labelY));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '10');
    text.setAttribute('fill', 'var(--color-text-secondary)');
    text.textContent = dim.name;
    svg.appendChild(text);
  });

  // Draw data polygon
  const points = createRadarPoints(data.dimensions, center, center, maxRadius);
  const dataPolygon = createSvgElement('polygon');
  dataPolygon.setAttribute('points', points);
  dataPolygon.setAttribute('fill', 'var(--color-accent)');
  dataPolygon.setAttribute('fill-opacity', '0.3');
  dataPolygon.setAttribute('stroke', 'var(--color-accent)');
  dataPolygon.setAttribute('stroke-width', '2');
  svg.appendChild(dataPolygon);

  // Draw data points
  data.dimensions.forEach((dim, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = maxRadius * dim.value;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);

    const circle = createSvgElement('circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', getDimensionColor(dim.name));
    svg.appendChild(circle);
  });

  chartSection.appendChild(svg);
  contentGrid.appendChild(chartSection);

  // Right: Dimension details
  const detailsSection = createElement('div');
  setStyles(detailsSection, { flex: '1' });

  const detailsTitle = createElement('h4', '', 'Dimensions');
  setStyles(detailsTitle, {
    fontSize: '0.9rem',
    fontWeight: '600',
    marginBottom: '12px',
    color: 'var(--color-text-primary)',
  });
  detailsSection.appendChild(detailsTitle);

  // Sorted dimensions
  const sortedDims = [...data.dimensions].sort((a, b) => b.value - a.value);
  sortedDims.forEach((dim) => {
    const dimRow = createElement('div');
    setStyles(dimRow, { marginBottom: '12px' });

    const labelRow = createFlexContainer('row', '0', 'space-between');
    const nameLabel = createElement('span', '', dim.name);
    setStyles(nameLabel, { fontSize: '0.85rem' });
    labelRow.appendChild(nameLabel);

    const valueLabel = createElement('span', '', `${Math.round(dim.value * 100)}%`);
    setStyles(valueLabel, {
      fontSize: '0.85rem',
      fontWeight: '600',
      color: getDimensionColor(dim.name),
    });
    labelRow.appendChild(valueLabel);
    dimRow.appendChild(labelRow);

    const bar = createElement('div');
    setStyles(bar, {
      height: '6px',
      background: 'rgba(44, 37, 32, 0.1)',
      borderRadius: '3px',
      overflow: 'hidden',
      marginTop: '4px',
    });

    const fill = createElement('div');
    setStyles(fill, {
      width: `${dim.value * 100}%`,
      height: '100%',
      background: getDimensionColor(dim.name),
      borderRadius: '3px',
    });
    bar.appendChild(fill);
    dimRow.appendChild(bar);

    detailsSection.appendChild(dimRow);
  });

  // Focus area
  if (data.focusArea) {
    const focusBox = createElement('div');
    setStyles(focusBox, {
      marginTop: '16px',
      padding: '12px',
      background: 'var(--color-background)',
      borderRadius: '8px',
    });

    const focusLabel = createElement('span', '', 'Focus Area: ');
    setStyles(focusLabel, { fontSize: '0.85rem', color: 'var(--color-text-secondary)' });
    focusBox.appendChild(focusLabel);

    const focusValue = createElement('span', '', data.focusArea);
    setStyles(focusValue, { fontSize: '0.85rem', fontWeight: '600', color: 'var(--color-accent)' });
    focusBox.appendChild(focusValue);

    detailsSection.appendChild(focusBox);
  }

  contentGrid.appendChild(detailsSection);
  container.appendChild(contentGrid);

  return {
    element: container,
    type: 'growth-radar',
    device: 'tablet',
    ariaLabel: `Growth radar with ${data.dimensions.length} dimensions, overall growth ${Math.round(data.overallGrowth * 100)}%`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build growth radar visualization for the given device context.
 */
export function buildGrowthRadar(
  container: HTMLElement,
  data: GrowthRadarData,
  context: DeviceContext
): VisualizationResult {
  switch (context.type) {
    case 'watch':
      return buildWatch(container, data);
    case 'mobile':
      return buildMobile(container, data, context);
    case 'tablet':
    case 'desktop':
      return buildTablet(container, data, context);
    default:
      return buildMobile(container, data, context);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get color for a dimension by name.
 */
function getDimensionColor(name: string): string {
  const key = name.toLowerCase();
  return DIMENSION_COLORS[key] || DEFAULT_COLORS.accent;
}

/**
 * Get the top-performing dimension.
 */
function getTopDimension(dimensions: GrowthDimension[]): GrowthDimension {
  return [...dimensions].sort((a, b) => b.value - a.value)[0];
}

/**
 * Create polygon points string for simple hexagon.
 */
function createPolygonPoints(
  dimensions: GrowthDimension[],
  cx: number,
  cy: number,
  maxRadius: number
): string {
  const n = Math.min(dimensions.length, 6);
  const points: string[] = [];

  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const value = dimensions[i]?.value ?? 0.5;
    const r = maxRadius * value;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x},${y}`);
  }

  return points.join(' ');
}

/**
 * Create radar chart points for full visualization.
 */
function createRadarPoints(
  dimensions: GrowthDimension[],
  cx: number,
  cy: number,
  maxRadius: number
): string {
  const n = dimensions.length;
  const points: string[] = [];

  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = maxRadius * dimensions[i].value;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x},${y}`);
  }

  return points.join(' ');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildGrowthRadar;
