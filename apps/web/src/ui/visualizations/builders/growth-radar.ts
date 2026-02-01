/**
 * Growth Fingerprint Visualization Builder
 *
 * A beautiful, story-driven visualization of multi-dimensional growth.
 * Shows your unique growth pattern as an organic, breathing shape.
 *
 * Design Philosophy:
 * - The fingerprint IS the hero - large, centered, alive
 * - Warm, earthy colors from Ferni's palette
 * - Narrative headlines that tell YOUR story
 * - Gentle animations that feel organic
 *
 * @module visualizations/builders/growth-radar
 */

import {
  createElement,
  createSvgElement,
  setStyles,
  createScreenReaderLabel,
} from '../utils/dom.js';
import type {
  GrowthRadarData,
  GrowthDimension,
  DeviceContext,
  VisualizationResult,
} from '../types.js';

// ============================================================================
// DESIGN CONSTANTS - Warm, earthy Ferni palette
// ============================================================================

const DIMENSION_COLORS: Record<string, string> = {
  relational: '#4a6741',   // Ferni sage green
  emotional: '#a67a6a',    // Maya terracotta
  creative: '#b8956a',     // Nayan golden
  career: '#3a6b73',       // Peter teal
  physical: '#5a7b5a',     // Fresh sage
  spiritual: '#8a7a9a',    // Lavender wisdom
  intellectual: '#5a6b8a', // Alex slate blue
  financial: '#7a8a5a',    // Olive growth
};

// Dimension icons (Lucide-style paths)
const DIMENSION_ICONS: Record<string, string> = {
  relational: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  emotional: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  creative: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  career: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  physical: 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z',
  spiritual: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  intellectual: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  financial: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
};

// Narrative phrases for different growth patterns
const GROWTH_NARRATIVES = {
  balanced: [
    "You're growing in beautiful balance",
    "Your growth is wonderfully rounded",
    "A harmonious path of development",
  ],
  focused: [
    "Deep roots in what matters most",
    "Focused growth, powerful results",
    "You know where to invest your energy",
  ],
  exploring: [
    "Exploring new dimensions of yourself",
    "Growth edges becoming growth strengths",
    "Every direction holds possibility",
  ],
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
// TABLET BUILDER - Hero-sized, story-driven visualization
// ============================================================================

/**
 * Build a beautiful, narrative-focused growth fingerprint.
 * The fingerprint IS the story - large, centered, alive.
 */
function buildTablet(
  container: HTMLElement,
  data: GrowthRadarData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  container.className = 'growth-fingerprint';

  // Inject styles
  injectFingerPrintStyles();

  // Generate narrative based on data pattern
  const narrative = generateNarrative(data);
  const topDim = getTopDimension(data.dimensions);
  const growthEdge = getGrowthEdge(data.dimensions);

  // ========== HEADER - Narrative headline ==========
  const header = createElement('div', 'gfp-header');
  
  const eyebrow = createElement('span', 'gfp-eyebrow', 'YOUR GROWTH');
  header.appendChild(eyebrow);
  
  const headline = createElement('h3', 'gfp-headline', narrative);
  header.appendChild(headline);
  
  container.appendChild(header);

  // ========== HERO - The Fingerprint ==========
  const heroSection = createElement('div', 'gfp-hero');
  
  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 280 280');
  svg.setAttribute('class', 'gfp-svg');
  setStyles(svg as unknown as HTMLElement, {
    width: '100%',
    maxWidth: '280px',
    height: 'auto',
  });

  const center = 140;
  const maxRadius = 100;
  const n = data.dimensions.length;

  // Create gradient definitions
  const defs = createSvgElement('defs');
  
  // Radial gradient for the fingerprint fill
  const radialGrad = createSvgElement('radialGradient');
  radialGrad.setAttribute('id', 'fingerprint-fill');
  radialGrad.setAttribute('cx', '50%');
  radialGrad.setAttribute('cy', '50%');
  radialGrad.setAttribute('r', '50%');
  
  const stop1 = createSvgElement('stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', getDimensionColor(topDim.name));
  stop1.setAttribute('stop-opacity', '0.4');
  radialGrad.appendChild(stop1);
  
  const stop2 = createSvgElement('stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', getDimensionColor(topDim.name));
  stop2.setAttribute('stop-opacity', '0.15');
  radialGrad.appendChild(stop2);
  
  defs.appendChild(radialGrad);
  
  // Glow filter for data points
  const filter = createSvgElement('filter');
  filter.setAttribute('id', 'glow');
  filter.setAttribute('x', '-50%');
  filter.setAttribute('y', '-50%');
  filter.setAttribute('width', '200%');
  filter.setAttribute('height', '200%');
  
  const feGaussian = createSvgElement('feGaussianBlur');
  feGaussian.setAttribute('stdDeviation', '2');
  feGaussian.setAttribute('result', 'coloredBlur');
  filter.appendChild(feGaussian);
  
  const feMerge = createSvgElement('feMerge');
  const feMergeNode1 = createSvgElement('feMergeNode');
  feMergeNode1.setAttribute('in', 'coloredBlur');
  const feMergeNode2 = createSvgElement('feMergeNode');
  feMergeNode2.setAttribute('in', 'SourceGraphic');
  feMerge.appendChild(feMergeNode1);
  feMerge.appendChild(feMergeNode2);
  filter.appendChild(feMerge);
  
  defs.appendChild(filter);
  svg.appendChild(defs);

  // Draw subtle background rings (organic, not perfect circles)
  [0.3, 0.6, 0.9].forEach((scale, i) => {
    const ring = createSvgElement('circle');
    ring.setAttribute('cx', String(center));
    ring.setAttribute('cy', String(center));
    ring.setAttribute('r', String(maxRadius * scale));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'var(--color-border-subtle, rgba(44, 37, 32, 0.08))');
    ring.setAttribute('stroke-width', '1');
    ring.setAttribute('stroke-dasharray', i === 2 ? 'none' : '4 4');
    ring.setAttribute('opacity', String(0.4 + i * 0.2));
    svg.appendChild(ring);
  });

  // Draw subtle axis lines with dimension colors at the tips
  data.dimensions.forEach((dim, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = center + maxRadius * Math.cos(angle);
    const y = center + maxRadius * Math.sin(angle);

    // Axis line - subtle gradient effect
    const line = createSvgElement('line');
    line.setAttribute('x1', String(center));
    line.setAttribute('y1', String(center));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'var(--color-border-subtle, rgba(44, 37, 32, 0.06))');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  });

  // Draw the fingerprint polygon - the hero element
  const points = createRadarPoints(data.dimensions, center, center, maxRadius);
  const dataPolygon = createSvgElement('polygon');
  dataPolygon.setAttribute('points', points);
  dataPolygon.setAttribute('fill', 'url(#fingerprint-fill)');
  dataPolygon.setAttribute('stroke', getDimensionColor(topDim.name));
  dataPolygon.setAttribute('stroke-width', '2.5');
  dataPolygon.setAttribute('stroke-linejoin', 'round');
  dataPolygon.setAttribute('class', 'gfp-polygon');
  svg.appendChild(dataPolygon);

  // Draw data points with labels
  data.dimensions.forEach((dim, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = maxRadius * dim.value;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    const color = getDimensionColor(dim.name);
    
    // Outer glow circle
    const glowCircle = createSvgElement('circle');
    glowCircle.setAttribute('cx', String(x));
    glowCircle.setAttribute('cy', String(y));
    glowCircle.setAttribute('r', '8');
    glowCircle.setAttribute('fill', color);
    glowCircle.setAttribute('opacity', '0.2');
    svg.appendChild(glowCircle);

    // Data point
    const circle = createSvgElement('circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', color);
    circle.setAttribute('filter', 'url(#glow)');
    circle.setAttribute('class', 'gfp-point');
    svg.appendChild(circle);

    // Label positioned outside the chart
    const labelR = maxRadius + 24;
    const labelX = center + labelR * Math.cos(angle);
    const labelY = center + labelR * Math.sin(angle);
    
    // Determine text anchor based on position
    let anchor = 'middle';
    if (Math.cos(angle) < -0.3) anchor = 'end';
    else if (Math.cos(angle) > 0.3) anchor = 'start';
    
    const text = createSvgElement('text');
    text.setAttribute('x', String(labelX));
    text.setAttribute('y', String(labelY));
    text.setAttribute('text-anchor', anchor);
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-weight', '500');
    text.setAttribute('fill', dim.name === topDim.name ? color : 'var(--color-text-secondary, #5c544a)');
    text.setAttribute('class', 'gfp-label');
    text.textContent = dim.name;
    svg.appendChild(text);
    
    // Value next to label for top dimension
    if (dim.name === topDim.name) {
      const valueText = createSvgElement('text');
      valueText.setAttribute('x', String(labelX));
      valueText.setAttribute('y', String(labelY + 13));
      valueText.setAttribute('text-anchor', anchor);
      valueText.setAttribute('font-size', '10');
      valueText.setAttribute('font-weight', '600');
      valueText.setAttribute('fill', color);
      valueText.textContent = `${Math.round(dim.value * 100)}%`;
      svg.appendChild(valueText);
    }
  });

  // Center overall score
  const overallGroup = createSvgElement('g');
  overallGroup.setAttribute('class', 'gfp-center');
  
  const centerBg = createSvgElement('circle');
  centerBg.setAttribute('cx', String(center));
  centerBg.setAttribute('cy', String(center));
  centerBg.setAttribute('r', '28');
  centerBg.setAttribute('fill', 'var(--color-bg-elevated, #FFFDFB)');
  centerBg.setAttribute('stroke', 'var(--color-border-subtle, rgba(44, 37, 32, 0.1))');
  overallGroup.appendChild(centerBg);
  
  const scoreText = createSvgElement('text');
  scoreText.setAttribute('x', String(center));
  scoreText.setAttribute('y', String(center - 4));
  scoreText.setAttribute('text-anchor', 'middle');
  scoreText.setAttribute('font-size', '18');
  scoreText.setAttribute('font-weight', '700');
  scoreText.setAttribute('fill', 'var(--color-text-primary, #2C2520)');
  scoreText.textContent = `${Math.round(data.overallGrowth * 100)}`;
  overallGroup.appendChild(scoreText);
  
  const percentText = createSvgElement('text');
  percentText.setAttribute('x', String(center));
  percentText.setAttribute('y', String(center + 10));
  percentText.setAttribute('text-anchor', 'middle');
  percentText.setAttribute('font-size', '9');
  percentText.setAttribute('font-weight', '500');
  percentText.setAttribute('fill', 'var(--color-text-muted, #8a8279)');
  percentText.textContent = 'overall';
  overallGroup.appendChild(percentText);
  
  svg.appendChild(overallGroup);
  heroSection.appendChild(svg);
  container.appendChild(heroSection);

  // ========== INSIGHTS ROW ==========
  const insightsRow = createElement('div', 'gfp-insights');
  
  // Strength card
  const strengthCard = createElement('div', 'gfp-insight-card gfp-strength');
  const strengthIcon = createElement('div', 'gfp-insight-icon');
  strengthIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${DIMENSION_ICONS[topDim.name.toLowerCase()] || 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'}"/></svg>`;
  setStyles(strengthIcon, { color: getDimensionColor(topDim.name) });
  strengthCard.appendChild(strengthIcon);
  
  const strengthContent = createElement('div', 'gfp-insight-content');
  const strengthLabel = createElement('span', 'gfp-insight-label', 'Strongest');
  const strengthValue = createElement('span', 'gfp-insight-value', topDim.name);
  setStyles(strengthValue, { color: getDimensionColor(topDim.name) });
  strengthContent.appendChild(strengthLabel);
  strengthContent.appendChild(strengthValue);
  strengthCard.appendChild(strengthContent);
  insightsRow.appendChild(strengthCard);
  
  // Growth edge card
  const edgeCard = createElement('div', 'gfp-insight-card gfp-edge');
  const edgeIcon = createElement('div', 'gfp-insight-icon');
  edgeIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3M12 8l4-4M12 8L8 4"/></svg>`;
  setStyles(edgeIcon, { color: getDimensionColor(growthEdge.name) });
  edgeCard.appendChild(edgeIcon);
  
  const edgeContent = createElement('div', 'gfp-insight-content');
  const edgeLabel = createElement('span', 'gfp-insight-label', 'Growth Edge');
  const edgeValue = createElement('span', 'gfp-insight-value', growthEdge.name);
  setStyles(edgeValue, { color: getDimensionColor(growthEdge.name) });
  edgeContent.appendChild(edgeLabel);
  edgeContent.appendChild(edgeValue);
  edgeCard.appendChild(edgeContent);
  insightsRow.appendChild(edgeCard);
  
  container.appendChild(insightsRow);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Growth fingerprint showing ${data.dimensions.length} dimensions. Overall growth: ${Math.round(data.overallGrowth * 100)}%. Strongest: ${topDim.name} at ${Math.round(topDim.value * 100)}%. Growth edge: ${growthEdge.name} at ${Math.round(growthEdge.value * 100)}%.`
    )
  );

  return {
    element: container,
    type: 'growth-radar',
    device: 'tablet',
    ariaLabel: `Growth fingerprint showing ${narrative}`,
  };
}

/**
 * Generate a narrative headline based on growth pattern.
 */
function generateNarrative(data: GrowthRadarData): string {
  const values = data.dimensions.map(d => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  
  // Balanced growth (low variance)
  if (range < 0.25 && avg > 0.5) {
    return GROWTH_NARRATIVES.balanced[Math.floor(Math.random() * GROWTH_NARRATIVES.balanced.length)] ?? GROWTH_NARRATIVES.balanced[0] ?? '';
  }
  
  // Focused growth (high variance, clear strengths)
  if (range > 0.4) {
    return GROWTH_NARRATIVES.focused[Math.floor(Math.random() * GROWTH_NARRATIVES.focused.length)] ?? GROWTH_NARRATIVES.focused[0] ?? '';
  }
  
  // Exploring (moderate variance)
  return GROWTH_NARRATIVES.exploring[Math.floor(Math.random() * GROWTH_NARRATIVES.exploring.length)] ?? GROWTH_NARRATIVES.exploring[0] ?? '';
}

/**
 * Get the growth edge (lowest dimension).
 */
function getGrowthEdge(dimensions: GrowthDimension[]): GrowthDimension {
  const sorted = [...dimensions].sort((a, b) => a.value - b.value);
  return sorted[0] ?? { name: 'Unknown', value: 0, trend: 'stable' as const };
}

/**
 * Inject fingerprint-specific styles.
 */
function injectFingerPrintStyles(): void {
  if (document.getElementById('gfp-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'gfp-styles';
  style.textContent = `
    .growth-fingerprint {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      height: 100%;
    }
    
    .gfp-header {
      text-align: center;
    }
    
    .gfp-eyebrow {
      display: block;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.625rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, #8a8279);
      margin-bottom: 4px;
    }
    
    .gfp-headline {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.125rem;
      font-weight: 600;
      line-height: 1.3;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }
    
    .gfp-hero {
      display: flex;
      justify-content: center;
      align-items: center;
      flex: 1;
      min-height: 0;
    }
    
    .gfp-svg {
      overflow: visible;
    }
    
    .gfp-polygon {
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .gfp-point {
      transition: r 0.2s ease;
    }
    
    .gfp-svg:hover .gfp-point {
      r: 6;
    }
    
    .gfp-label {
      font-family: var(--font-body, 'Inter', sans-serif);
    }
    
    .gfp-insights {
      display: flex;
      gap: 12px;
    }
    
    .gfp-insight-card {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: 10px;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .gfp-insight-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    }
    
    .gfp-insight-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: currentColor;
      opacity: 0.12;
    }
    
    .gfp-insight-icon svg {
      position: relative;
      z-index: 1;
    }
    
    .gfp-insight-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .gfp-insight-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.625rem;
      font-weight: 500;
      color: var(--color-text-muted, #8a8279);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .gfp-insight-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }
    
    @media (prefers-reduced-motion: reduce) {
      .gfp-polygon,
      .gfp-point,
      .gfp-insight-card {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
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

const DEFAULT_COLOR = '#3D5A45'; // Ferni sage green as fallback

/**
 * Get color for a dimension by name.
 */
function getDimensionColor(name: string): string {
  const key = name.toLowerCase();
  return DIMENSION_COLORS[key] || DEFAULT_COLOR;
}

/**
 * Get the top-performing dimension.
 */
function getTopDimension(dimensions: GrowthDimension[]): GrowthDimension {
  const sorted = [...dimensions].sort((a, b) => b.value - a.value);
  return sorted[0] ?? { name: 'Unknown', value: 0, trend: 'stable' as const };
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
    const dim = dimensions[i];
    const r = maxRadius * (dim?.value ?? 0.5);
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
