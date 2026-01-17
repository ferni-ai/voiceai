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
  setStyles,
  createScreenReaderLabel,
} from '../utils/dom.js';
import type {
  BurnoutGaugeData,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { CSS_COLOR_VARS, DEFAULT_COLORS } from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Status colors for SVG rendering.
 * @design-tokens-ignore - SVG stroke/fill requires literal color values
 */
const STATUS_COLORS: Record<BurnoutGaugeData['status'], string> = {
  thriving: DEFAULT_COLORS.status.thriving,
  balanced: DEFAULT_COLORS.status.balanced,
  stretched: DEFAULT_COLORS.status.stretched,
  depleted: DEFAULT_COLORS.status.depleted,
  critical: DEFAULT_COLORS.status.critical,
};

/**
 * CSS variable references for DOM element styling.
 */
const STATUS_CSS_VARS: Record<BurnoutGaugeData['status'], string> = {
  thriving: CSS_COLOR_VARS.statusThriving,
  balanced: CSS_COLOR_VARS.statusBalanced,
  stretched: CSS_COLOR_VARS.statusStretched,
  depleted: CSS_COLOR_VARS.statusDepleted,
  critical: CSS_COLOR_VARS.statusCritical,
};

/**
 * Energy type colors for factor breakdown.
 * @design-tokens-ignore - SVG requires literal color values
 */
const ENERGY_COLORS = {
  emotional: DEFAULT_COLORS.energy.emotional,
  mental: DEFAULT_COLORS.energy.mental,
  physical: DEFAULT_COLORS.energy.physical,
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

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title viz-header__title--compact', t('visualizations.capacityGuardian.titleShort', 'Capacity'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.capacityGuardian.subtitleShort', 'Energy status'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Arc gauge using viz-ring class
  const ring = createElement('div', 'viz-ring');

  const svg = createSvg(36, 36, '0 0 36 36');
  setStyles(svg as unknown as HTMLElement, {
    width: '100%',
    height: '100%',
  });

  // Background circle - @design-tokens-ignore (SVG requires literal)
  const bgPath = createPath(
    createRingPath(18, 18, 15.9155),
    'rgba(44, 37, 32, 0.1)',
    3
  );
  svg.appendChild(bgPath);

  // Progress arc - @design-tokens-ignore (SVG requires literal)
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
  const value = createElement('span', 'viz-ring__value');
  setStyles(value, { color: statusColor }); // @design-tokens-ignore (matches SVG)
  value.textContent = `${data.capacity}%`;
  ring.appendChild(value);

  container.appendChild(ring);

  // Status label with design system class
  const metric = createElement('div', 'viz-metric viz-metric--compact');
  const metricValue = createElement('span', 'viz-metric__label');
  metricValue.textContent = capitalize(data.status);
  metric.appendChild(metricValue);
  container.appendChild(metric);

  // Screen reader label
  container.appendChild(
    createScreenReaderLabel(
      `Capacity gauge at ${data.capacity}%, status: ${data.status}`
    )
  );

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

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.capacityGuardian.title', 'Capacity Guardian'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.capacityGuardian.subtitle', 'Your comprehensive energy dashboard'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Main gauge card with glass styling
  const card1 = createElement('div', 'viz-card viz-animate-slide');
  if (isAndroid) {
    card1.classList.add('viz-card--accent-primary');
  }

  // Card header
  const cardHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');

  const statusTitle = createElement('span');
  setStyles(statusTitle, {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--viz-text-base)',
    fontWeight: '600',
    color: CSS_COLOR_VARS.textPrimary,
  });
  statusTitle.textContent = t('visualizations.capacityGuardian.currentStatus', 'Current Status');
  cardHeader.appendChild(statusTitle);

  const badge = createElement('span', `viz-badge viz-badge--status-${data.status}`);
  badge.textContent = capitalize(data.status);
  cardHeader.appendChild(badge);
  card1.appendChild(cardHeader);

  // Main metric display
  const metricContainer = createElement('div', 'viz-metric');
  const metricValue = createElement('span', 'viz-metric__value viz-metric__value--accent');
  metricValue.textContent = `${data.capacity}`;
  const metricUnit = createElement('span', 'viz-metric__unit');
  metricUnit.textContent = '%';
  metricValue.appendChild(metricUnit);
  const metricLabel = createElement('span', 'viz-metric__label');
  metricLabel.textContent = capitalize(data.status);
  metricContainer.appendChild(metricValue);
  metricContainer.appendChild(metricLabel);
  card1.appendChild(metricContainer);

  container.appendChild(card1);

  // Energy breakdown card
  const factorCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');
  if (isAndroid) {
    factorCard.classList.add('viz-card--accent-emotional');
  }

  const factorHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');
  const factorTitle = createElement('span');
  setStyles(factorTitle, {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--viz-text-base)',
    fontWeight: '600',
    color: CSS_COLOR_VARS.textPrimary,
  });
  factorTitle.textContent = t('visualizations.capacityGuardian.energyBreakdown', 'Energy Breakdown');
  factorHeader.appendChild(factorTitle);
  factorCard.appendChild(factorHeader);

  const factorsGrid = createElement('div', 'viz-flex viz-flex--col');
  setStyles(factorsGrid, { gap: 'var(--viz-space-pause)', marginTop: 'var(--viz-space-pause)' });

  const factors = [
    { key: 'emotional', name: t('visualizations.energy.emotional', 'Emotional'), value: data.factors.emotional },
    { key: 'mental', name: t('visualizations.energy.mental', 'Mental'), value: data.factors.mental },
    { key: 'physical', name: t('visualizations.energy.physical', 'Physical'), value: data.factors.physical },
  ] as const;

  factors.forEach((factor) => {
    const row = createElement('div', 'viz-flex viz-flex--row viz-flex--center');

    const label = createElement('span');
    setStyles(label, {
      fontSize: 'var(--viz-text-base)',
      color: CSS_COLOR_VARS.textSecondary,
      width: '70px',
    });
    label.textContent = factor.name;
    row.appendChild(label);

    const barBg = createElement('div', 'viz-progress viz-progress--thin');
    setStyles(barBg, { flex: '1', margin: '0 var(--viz-space-breath)' });

    const barFill = createElement('div', `viz-progress__fill viz-progress__fill--${factor.key}`);
    setStyles(barFill, { width: `${factor.value}%` });
    barBg.appendChild(barFill);
    row.appendChild(barBg);

    const valueLabel = createElement('span');
    setStyles(valueLabel, {
      fontSize: 'var(--viz-text-sm)',
      fontWeight: '600',
      color: `var(--viz-energy-${factor.key})`,
      minWidth: '40px',
      textAlign: 'right',
    });
    valueLabel.textContent = `${factor.value}%`;
    row.appendChild(valueLabel);

    factorsGrid.appendChild(row);
  });

  factorCard.appendChild(factorsGrid);
  container.appendChild(factorCard);

  // Trend card
  const trendCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-3');
  if (isAndroid) {
    trendCard.classList.add('viz-card--accent-primary');
  }

  const trendHeader = createElement('div', 'viz-label');
  trendHeader.textContent = t('visualizations.capacityGuardian.trend', 'Trend');
  trendCard.appendChild(trendHeader);

  const trendText = data.trend === 'recovering'
    ? t('visualizations.trend.recovering', 'Recovering')
    : data.trend === 'stable'
    ? t('visualizations.trend.stable', 'Steady')
    : t('visualizations.trend.declining', 'Needs attention');

  const trendInsight = createElement('p', 'viz-insight');
  trendInsight.textContent = trendText;
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
  const statusCssVar = STATUS_CSS_VARS[data.status];

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.capacityGuardian.title', 'Capacity Guardian'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.capacityGuardian.subtitle', 'Your comprehensive energy dashboard'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Main content grid using design system spacing
  const contentGrid = createElement('div', 'viz-flex viz-flex--row');
  setStyles(contentGrid, {
    gap: 'var(--viz-space-rest)',
    padding: 'var(--viz-space-pause)',
  });

  // Left: Large gauge in card
  const gaugeCard = createElement('div', 'viz-card viz-animate-slide');
  setStyles(gaugeCard, { flex: '1', textAlign: 'center' });

  const svg = createSvg(200, 200, '0 0 200 200');

  // Background arc (semicircle) - using CSS variable via fallback
  const bgArc = createPath(
    describeArc(100, 100, 80, -135, 135),
    'rgba(44, 37, 32, 0.1)', // @design-tokens-ignore - SVG requires literal
    12
  );
  bgArc.setAttribute('stroke-linecap', 'round');
  svg.appendChild(bgArc);

  // Progress arc
  const progressAngle = -135 + (data.capacity / 100) * 270;
  const fgArc = createPath(
    describeArc(100, 100, 80, -135, progressAngle),
    statusColor, // @design-tokens-ignore - SVG requires literal
    12
  );
  fgArc.setAttribute('stroke-linecap', 'round');
  svg.appendChild(fgArc);

  // Center text
  const valueText = createText(100, 95, `${data.capacity}%`, {
    fill: statusColor, // @design-tokens-ignore - SVG requires literal
    fontSize: '32px',
    fontWeight: '700',
    textAnchor: 'middle',
  });
  svg.appendChild(valueText);

  const statusText = createText(100, 120, capitalize(data.status), {
    fill: '#5c544a', // @design-tokens-ignore - SVG requires literal (--color-text-secondary)
    fontSize: '14px',
    textAnchor: 'middle',
  });
  svg.appendChild(statusText);

  gaugeCard.appendChild(svg);

  // Status badge below gauge
  const statusBadge = createElement('span', `viz-badge viz-badge--status-${data.status}`);
  statusBadge.textContent = capitalize(data.status);
  setStyles(statusBadge, { marginTop: 'var(--viz-space-breath)' });
  gaugeCard.appendChild(statusBadge);

  contentGrid.appendChild(gaugeCard);

  // Right: Factor breakdown card
  const factorsCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');
  setStyles(factorsCard, { flex: '1' });

  const factorsTitle = createElement('h4', 'viz-label');
  factorsTitle.textContent = t('visualizations.capacityGuardian.energyBreakdown', 'Energy Breakdown');
  setStyles(factorsTitle, { marginBottom: 'var(--viz-space-pause)' });
  factorsCard.appendChild(factorsTitle);

  const factors = [
    { key: 'emotional', name: t('visualizations.energy.emotional', 'Emotional'), value: data.factors.emotional },
    { key: 'mental', name: t('visualizations.energy.mental', 'Mental'), value: data.factors.mental },
    { key: 'physical', name: t('visualizations.energy.physical', 'Physical'), value: data.factors.physical },
  ] as const;

  factors.forEach((factor) => {
    const factorRow = createElement('div');
    setStyles(factorRow, { marginBottom: 'var(--viz-space-pause)' });

    const labelRow = createElement('div', 'viz-flex viz-flex--row viz-flex--between');
    const nameLabel = createElement('span');
    setStyles(nameLabel, {
      fontSize: 'var(--viz-text-base)',
      color: CSS_COLOR_VARS.textSecondary,
    });
    nameLabel.textContent = factor.name;
    labelRow.appendChild(nameLabel);

    const valueSpan = createElement('span');
    setStyles(valueSpan, {
      fontWeight: '600',
      fontSize: 'var(--viz-text-base)',
      color: `var(--viz-energy-${factor.key})`,
    });
    valueSpan.textContent = `${factor.value}%`;
    labelRow.appendChild(valueSpan);
    factorRow.appendChild(labelRow);

    const barBg = createElement('div', 'viz-progress');
    setStyles(barBg, { marginTop: 'var(--viz-space-2xs)' });

    const barFill = createElement('div', `viz-progress__fill viz-progress__fill--${factor.key}`);
    setStyles(barFill, { width: `${factor.value}%` });
    barBg.appendChild(barFill);
    factorRow.appendChild(barBg);

    factorsCard.appendChild(factorRow);
  });

  // Trend indicator
  const trendBox = createElement('div', 'viz-insight');
  setStyles(trendBox, {
    marginTop: 'var(--viz-space-rest)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--viz-space-breath)',
  });

  const trendLabel = createElement('span');
  setStyles(trendLabel, { color: CSS_COLOR_VARS.textSecondary });
  trendLabel.textContent = t('visualizations.capacityGuardian.trend', 'Trend') + ': ';

  const trendValue = createElement('span');
  const trendCssVar = data.trend === 'recovering' ? CSS_COLOR_VARS.statusThriving :
                      data.trend === 'stable' ? CSS_COLOR_VARS.statusBalanced :
                      CSS_COLOR_VARS.statusDepleted;
  setStyles(trendValue, {
    fontWeight: '600',
    color: trendCssVar,
  });
  trendValue.textContent = capitalize(data.trend);

  trendBox.appendChild(trendLabel);
  trendBox.appendChild(trendValue);
  factorsCard.appendChild(trendBox);

  contentGrid.appendChild(factorsCard);
  container.appendChild(contentGrid);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Comprehensive capacity gauge at ${data.capacity}% with factor breakdown. Emotional: ${data.factors.emotional}%, Mental: ${data.factors.mental}%, Physical: ${data.factors.physical}%. Trend: ${data.trend}.`
    )
  );

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
