/**
 * Burnout Gauge Visualization Builder
 *
 * Displays capacity/energy reserves as a gauge.
 * Adapts to different device sizes:
 * - Watch: Arc gauge with percentage
 * - Mobile: Linear bar with status cards
 * - Tablet: Full gauge with factor breakdown
 *
 * @module visualizations/builders/burnout-gauge
 */

import {
  createElement,
  createSvg,
  createPath,
  createText,
  createRingPath,
  describeArc,
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
} from '../utils/dom.js';
import type {
  BurnoutGaugeData,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { DEFAULT_COLORS } from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_COLORS: Record<BurnoutGaugeData['status'], string> = {
  thriving: DEFAULT_COLORS.status.thriving,
  balanced: DEFAULT_COLORS.status.balanced,
  stretched: DEFAULT_COLORS.status.stretched,
  depleted: DEFAULT_COLORS.status.depleted,
  critical: DEFAULT_COLORS.status.critical,
};

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build compact burnout gauge for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: BurnoutGaugeData
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Capacity'));
  header.appendChild(createElement('p', '', 'Energy status'));
  container.appendChild(header);

  // Arc gauge
  const ring = createElement('div', 'watch-ring');
  setStyles(ring, {
    position: 'relative',
    width: '80px',
    height: '80px',
    margin: '8px auto',
  });

  const svg = createSvg(36, 36, '0 0 36 36');
  setStyles(svg as unknown as HTMLElement, {
    width: '100%',
    height: '100%',
  });

  // Background circle
  const bgPath = createPath(
    createRingPath(18, 18, 15.9155),
    'rgba(44, 37, 32, 0.1)',
    3
  );
  svg.appendChild(bgPath);

  // Progress arc
  const statusColor = STATUS_COLORS[data.status];
  const fgPath = createPath(
    createRingPath(18, 18, 15.9155),
    statusColor,
    3
  );
  fgPath.setAttribute('stroke-dasharray', `${data.capacity}, 100`);
  fgPath.setAttribute('stroke-linecap', 'round');
  svg.appendChild(fgPath);

  ring.appendChild(svg);

  // Center value
  const value = createElement('span', 'watch-ring-value', `${data.capacity}%`);
  setStyles(value, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '0.9rem',
    fontWeight: '700',
    color: statusColor,
  });
  ring.appendChild(value);

  container.appendChild(ring);

  // Status label
  const metric = createElement('div', 'watch-metric', capitalize(data.status));
  container.appendChild(metric);

  return {
    element: container,
    type: 'burnout-gauge',
    device: 'watch',
    ariaLabel: `Capacity gauge at ${data.capacity}%, status: ${data.status}`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build burnout gauge for mobile (iOS/Android).
 */
function buildMobile(
  container: HTMLElement,
  data: BurnoutGaugeData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';
  const statusColor = STATUS_COLORS[data.status];

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Capacity Guardian'));
  header.appendChild(createElement('p', '', 'Monitor your energy reserves'));
  container.appendChild(header);

  // Gauge card
  const card1 = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(card1, { borderLeft: `3px solid ${statusColor}` });
  }

  const cardHeader = createElement('div', 'mobile-card-header');
  cardHeader.appendChild(createElement('span', 'mobile-card-title', 'Current Status'));

  const badge = createElement('span', 'mobile-card-badge', capitalize(data.status));
  setStyles(badge, { background: statusColor });
  cardHeader.appendChild(badge);
  card1.appendChild(cardHeader);

  // Progress bar
  const barContainer = createElement('div', 'mobile-bar');
  setStyles(barContainer, {
    position: 'relative',
    height: '12px',
    background: 'linear-gradient(90deg, var(--color-accent) 0%, #f5a623 50%, #e74c3c 100%)',
    borderRadius: isAndroid ? '0' : '6px',
    margin: '12px 0',
  });

  const indicator = createElement('div');
  setStyles(indicator, {
    position: 'absolute',
    left: `${data.capacity}%`,
    top: '-2px',
    width: '4px',
    height: '16px',
    background: 'white',
    borderRadius: '2px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    transform: 'translateX(-50%)',
  });
  barContainer.appendChild(indicator);
  card1.appendChild(barContainer);

  const insight = createElement('p', 'mobile-insight', `${data.capacity}% capacity used`);
  card1.appendChild(insight);
  container.appendChild(card1);

  // Energy factors breakdown
  const factorCard = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(factorCard, { borderLeft: '3px solid var(--persona-maya)' });
  }

  const factorHeader = createElement('div', 'mobile-card-header');
  factorHeader.appendChild(createElement('span', 'mobile-card-title', 'Energy Breakdown'));
  factorCard.appendChild(factorHeader);

  const factorsGrid = createFlexContainer('column', '8px');
  setStyles(factorsGrid, { marginTop: '8px' });

  const factors = [
    { name: 'Emotional', value: data.factors.emotional, color: DEFAULT_COLORS.energy.emotional },
    { name: 'Mental', value: data.factors.mental, color: DEFAULT_COLORS.energy.mental },
    { name: 'Physical', value: data.factors.physical, color: DEFAULT_COLORS.energy.physical },
  ];

  factors.forEach((factor) => {
    const row = createFlexContainer('row', '8px', 'space-between', 'center');

    const label = createElement('span', '', factor.name);
    setStyles(label, { fontSize: '0.85rem', color: 'var(--color-text-secondary)' });
    row.appendChild(label);

    const barBg = createElement('div');
    setStyles(barBg, {
      flex: '1',
      height: '6px',
      background: 'rgba(44, 37, 32, 0.1)',
      borderRadius: '3px',
      overflow: 'hidden',
      margin: '0 8px',
    });

    const barFill = createElement('div');
    setStyles(barFill, {
      width: `${factor.value}%`,
      height: '100%',
      background: factor.color,
      borderRadius: '3px',
    });
    barBg.appendChild(barFill);
    row.appendChild(barBg);

    const valueLabel = createElement('span', '', `${factor.value}%`);
    setStyles(valueLabel, {
      fontSize: '0.8rem',
      fontWeight: '600',
      color: factor.color,
      minWidth: '36px',
      textAlign: 'right',
    });
    row.appendChild(valueLabel);

    factorsGrid.appendChild(row);
  });

  factorCard.appendChild(factorsGrid);
  container.appendChild(factorCard);

  // Trend card
  const trendCard = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(trendCard, { borderLeft: '3px solid var(--color-accent)' });
  }

  const trendHeader = createElement('div', 'mobile-card-header');
  trendHeader.appendChild(createElement('span', 'mobile-card-title', 'Trend'));
  trendCard.appendChild(trendHeader);

  const trendEmoji = data.trend === 'recovering' ? 'Improving' : data.trend === 'stable' ? 'Steady' : 'Needs attention';
  const trendInsight = createElement('p', 'mobile-insight', trendEmoji);
  trendCard.appendChild(trendInsight);
  container.appendChild(trendCard);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Capacity gauge at ${data.capacity}%. Status: ${data.status}. Trend: ${data.trend}. Emotional: ${data.factors.emotional}%, Mental: ${data.factors.mental}%, Physical: ${data.factors.physical}%.`
    )
  );

  return {
    element: container,
    type: 'burnout-gauge',
    device: 'mobile',
    ariaLabel: `Burnout gauge at ${data.capacity}% capacity, status ${data.status}`,
  };
}

// ============================================================================
// TABLET BUILDER
// ============================================================================

/**
 * Build burnout gauge for tablet with detailed breakdown.
 */
function buildTablet(
  container: HTMLElement,
  data: BurnoutGaugeData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const statusColor = STATUS_COLORS[data.status];

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Capacity Guardian'));
  header.appendChild(createElement('p', '', 'Your comprehensive energy dashboard'));
  container.appendChild(header);

  // Main content grid
  const contentGrid = createFlexContainer('row', '24px');
  setStyles(contentGrid, { padding: '16px' });

  // Left: Large gauge
  const gaugeSection = createElement('div');
  setStyles(gaugeSection, { flex: '1', textAlign: 'center' });

  const svg = createSvg(200, 200, '0 0 200 200');

  // Background arc (semicircle)
  const bgArc = createPath(
    describeArc(100, 100, 80, -135, 135),
    'rgba(44, 37, 32, 0.1)',
    12
  );
  bgArc.setAttribute('stroke-linecap', 'round');
  svg.appendChild(bgArc);

  // Progress arc
  const progressAngle = -135 + (data.capacity / 100) * 270;
  const fgArc = createPath(
    describeArc(100, 100, 80, -135, progressAngle),
    statusColor,
    12
  );
  fgArc.setAttribute('stroke-linecap', 'round');
  svg.appendChild(fgArc);

  // Center text
  const valueText = createText(100, 95, `${data.capacity}%`, {
    fill: statusColor,
    fontSize: '32px',
    fontWeight: '700',
    textAnchor: 'middle',
  });
  svg.appendChild(valueText);

  const statusText = createText(100, 120, capitalize(data.status), {
    fill: 'var(--color-text-secondary)',
    fontSize: '14px',
    textAnchor: 'middle',
  });
  svg.appendChild(statusText);

  gaugeSection.appendChild(svg);
  contentGrid.appendChild(gaugeSection);

  // Right: Factor breakdown
  const factorsSection = createElement('div');
  setStyles(factorsSection, { flex: '1' });

  const factorsTitle = createElement('h4', '', 'Energy Breakdown');
  setStyles(factorsTitle, {
    fontSize: '1rem',
    fontWeight: '600',
    marginBottom: '16px',
    color: 'var(--color-text-primary)',
  });
  factorsSection.appendChild(factorsTitle);

  const factors = [
    { name: 'Emotional', value: data.factors.emotional, color: DEFAULT_COLORS.energy.emotional },
    { name: 'Mental', value: data.factors.mental, color: DEFAULT_COLORS.energy.mental },
    { name: 'Physical', value: data.factors.physical, color: DEFAULT_COLORS.energy.physical },
  ];

  factors.forEach((factor) => {
    const factorRow = createElement('div');
    setStyles(factorRow, { marginBottom: '16px' });

    const labelRow = createFlexContainer('row', '0', 'space-between');
    labelRow.appendChild(createElement('span', '', factor.name));
    const valueSpan = createElement('span', '', `${factor.value}%`);
    setStyles(valueSpan, { fontWeight: '600', color: factor.color });
    labelRow.appendChild(valueSpan);
    factorRow.appendChild(labelRow);

    const barBg = createElement('div');
    setStyles(barBg, {
      height: '8px',
      background: 'rgba(44, 37, 32, 0.1)',
      borderRadius: '4px',
      overflow: 'hidden',
      marginTop: '6px',
    });

    const barFill = createElement('div');
    setStyles(barFill, {
      width: `${factor.value}%`,
      height: '100%',
      background: factor.color,
      borderRadius: '4px',
      transition: 'width 300ms ease',
    });
    barBg.appendChild(barFill);
    factorRow.appendChild(barBg);

    factorsSection.appendChild(factorRow);
  });

  // Trend indicator
  const trendBox = createElement('div');
  setStyles(trendBox, {
    marginTop: '24px',
    padding: '12px',
    background: 'var(--color-background)',
    borderRadius: '8px',
  });

  const trendLabel = createElement('span', '', 'Trend: ');
  const trendValue = createElement('span', '', capitalize(data.trend));
  setStyles(trendValue, {
    fontWeight: '600',
    color: data.trend === 'recovering' ? DEFAULT_COLORS.status.thriving :
           data.trend === 'stable' ? DEFAULT_COLORS.status.balanced :
           DEFAULT_COLORS.status.depleted,
  });
  trendBox.appendChild(trendLabel);
  trendBox.appendChild(trendValue);
  factorsSection.appendChild(trendBox);

  contentGrid.appendChild(factorsSection);
  container.appendChild(contentGrid);

  return {
    element: container,
    type: 'burnout-gauge',
    device: 'tablet',
    ariaLabel: `Comprehensive capacity gauge at ${data.capacity}% with factor breakdown`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build burnout gauge visualization for the given device context.
 */
export function buildBurnoutGauge(
  container: HTMLElement,
  data: BurnoutGaugeData,
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
 * Capitalize first letter.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildBurnoutGauge;
