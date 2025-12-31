/**
 * Predictions Visualization Builder
 *
 * Displays AI-powered predictions with confidence intervals.
 * Adapts to different device sizes:
 * - Watch: Primary prediction with confidence ring
 * - Mobile: Card-based predictions with scenario bars
 * - Tablet: Full chart with multiple predictions
 *
 * @module visualizations/builders/predictions
 */

import {
  createElement,
  createSvgElement,
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
  describeArc,
  getCssVar,
} from '../utils/dom.js';
import type {
  PredictionsData,
  Prediction,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { DEFAULT_COLORS, CSS_COLOR_VARS } from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// CONSTANTS - Using CSS Variables for brand consistency
// ============================================================================

const CONFIDENCE_COLORS = {
  high: getCssVar('--color-semantic-success', '#27ae60'),
  medium: getCssVar('--color-semantic-warning', '#f5a623'),
  low: getCssVar('--color-semantic-error-light', '#e67e22'),
};

const CONFIDENCE_CSS_VARS = {
  high: CSS_COLOR_VARS.statusThriving,
  medium: CSS_COLOR_VARS.statusStretched,
  low: CSS_COLOR_VARS.statusDepleted,
};

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build compact predictions for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: PredictionsData
): VisualizationResult {
  container.replaceChildren();

  const primary = data.primaryPrediction;

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Predict'));
  header.appendChild(createElement('p', '', primary.timeframe));
  container.appendChild(header);

  // Confidence ring
  const ringContainer = createElement('div');
  setStyles(ringContainer, {
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

  // Background ring
  const bgRing = createSvgElement('circle');
  bgRing.setAttribute('cx', '30');
  bgRing.setAttribute('cy', '30');
  bgRing.setAttribute('r', '24');
  bgRing.setAttribute('fill', 'none');
  bgRing.setAttribute('stroke', 'var(--color-border-subtle)');
  bgRing.setAttribute('stroke-width', '4');
  svg.appendChild(bgRing);

  // Confidence arc
  const confidenceColor = getConfidenceColor(primary.confidence);
  const arcPath = createSvgElement('path');
  arcPath.setAttribute('d', describeArc(30, 30, 24, -90, -90 + primary.confidence * 360));
  arcPath.setAttribute('fill', 'none');
  arcPath.setAttribute('stroke', confidenceColor);
  arcPath.setAttribute('stroke-width', '4');
  arcPath.setAttribute('stroke-linecap', 'round');
  svg.appendChild(arcPath);

  // Center value
  const centerText = createSvgElement('text');
  centerText.setAttribute('x', '30');
  centerText.setAttribute('y', '33');
  centerText.setAttribute('text-anchor', 'middle');
  centerText.setAttribute('font-size', '12');
  centerText.setAttribute('font-weight', '600');
  centerText.setAttribute('fill', 'var(--color-text-primary)');
  centerText.textContent = formatValue(primary.predictedValue);
  svg.appendChild(centerText);

  ringContainer.appendChild(svg);
  container.appendChild(ringContainer);

  // Metric name and confidence
  const metricLabel = createElement('div', 'watch-metric', primary.metric);
  container.appendChild(metricLabel);

  const confidenceLabel = createElement('div');
  setStyles(confidenceLabel, {
    textAlign: 'center',
    fontSize: '0.7rem',
    color: confidenceColor,
  });
  confidenceLabel.textContent = `${Math.round(primary.confidence * 100)}% confident`;
  container.appendChild(confidenceLabel);

  return {
    element: container,
    type: 'predictions',
    device: 'watch',
    ariaLabel: `Prediction: ${primary.metric} will be ${primary.predictedValue} with ${Math.round(primary.confidence * 100)}% confidence`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build predictions for mobile (iOS/Android).
 */
function buildMobile(
  container: HTMLElement,
  data: PredictionsData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Predictions'));
  header.appendChild(createElement('p', '', `${Math.round(data.accuracy * 100)}% historical accuracy`));
  container.appendChild(header);

  // Primary prediction card
  const primaryCard = buildMobilePredictionCard(data.primaryPrediction, isAndroid, true);
  container.appendChild(primaryCard);

  // Secondary predictions (up to 2 more)
  const otherPredictions = data.predictions
    .filter((p) => p.metric !== data.primaryPrediction.metric)
    .slice(0, 2);

  otherPredictions.forEach((prediction) => {
    const card = buildMobilePredictionCard(prediction, isAndroid, false);
    container.appendChild(card);
  });

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `${data.predictions.length} predictions with ${Math.round(data.accuracy * 100)}% historical accuracy. Primary: ${data.primaryPrediction.metric} predicted to be ${data.primaryPrediction.predictedValue} in ${data.primaryPrediction.timeframe}.`
    )
  );

  return {
    element: container,
    type: 'predictions',
    device: 'mobile',
    ariaLabel: `${data.predictions.length} predictions, primary: ${data.primaryPrediction.metric}`,
  };
}

/**
 * Build a mobile prediction card.
 */
function buildMobilePredictionCard(
  prediction: Prediction,
  isAndroid: boolean,
  isPrimary: boolean
): HTMLElement {
  const card = createElement('div', 'mobile-card');
  const confidenceColor = getConfidenceColor(prediction.confidence);

  if (isAndroid) {
    setStyles(card, { borderLeft: `3px solid ${confidenceColor}` });
  }

  // Header
  const cardHeader = createElement('div', 'mobile-card-header');
  cardHeader.appendChild(createElement('span', 'mobile-card-title', prediction.metric));

  const confidenceBadge = createElement(
    'span',
    'mobile-card-badge',
    `${Math.round(prediction.confidence * 100)}%`
  );
  setStyles(confidenceBadge, { background: confidenceColor });
  cardHeader.appendChild(confidenceBadge);
  card.appendChild(cardHeader);

  // Value display
  if (isPrimary) {
    const valueRow = createFlexContainer('row', '12px', 'flex-start', 'baseline');
    setStyles(valueRow, { margin: '8px 0' });

    const currentValue = createElement('span', '', formatValue(prediction.currentValue));
    setStyles(currentValue, {
      fontSize: '1.1rem',
      color: 'var(--color-text-secondary)',
    });
    valueRow.appendChild(currentValue);

    const arrow = createElement('span', '', '→');
    setStyles(arrow, { color: 'var(--color-text-muted)' });
    valueRow.appendChild(arrow);

    const predictedValue = createElement('span', '', formatValue(prediction.predictedValue));
    setStyles(predictedValue, {
      fontSize: '1.4rem',
      fontWeight: '600',
      color: 'var(--color-accent)',
    });
    valueRow.appendChild(predictedValue);

    card.appendChild(valueRow);
  }

  // Timeframe
  const timeframe = createElement('div');
  setStyles(timeframe, {
    fontSize: '0.85rem',
    color: 'var(--color-text-secondary)',
    marginBottom: '8px',
  });
  timeframe.textContent = prediction.timeframe;
  card.appendChild(timeframe);

  // Scenario bars
  const scenarioContainer = createElement('div');
  setStyles(scenarioContainer, { marginTop: '8px' });

  // Find the max value for scaling
  const maxScenario = Math.max(
    prediction.scenarios.conservative,
    prediction.scenarios.expected,
    prediction.scenarios.optimistic
  );

  const scenarios = [
    { label: 'Conservative', value: prediction.scenarios.conservative, color: getCssVar('--color-text-muted', '#9a8f85') },
    { label: 'Expected', value: prediction.scenarios.expected, color: getCssVar('--color-accent', '#3D5A45') },
    { label: 'Optimistic', value: prediction.scenarios.optimistic, color: getCssVar('--color-semantic-success', '#27ae60') },
  ];

  scenarios.forEach((scenario) => {
    const row = createFlexContainer('row', '8px', 'flex-start', 'center');
    setStyles(row, { marginBottom: '4px' });

    const label = createElement('span', '', scenario.label);
    setStyles(label, {
      fontSize: '0.75rem',
      color: 'var(--color-text-muted)',
      width: '70px',
      flexShrink: '0',
    });
    row.appendChild(label);

    const bar = createElement('div');
    setStyles(bar, {
      flex: '1',
      height: '6px',
      background: 'rgba(44, 37, 32, 0.1)',
      borderRadius: isAndroid ? '0' : '3px',
      overflow: 'hidden',
    });

    const fill = createElement('div');
    setStyles(fill, {
      width: `${(scenario.value / maxScenario) * 100}%`,
      height: '100%',
      background: scenario.color,
      borderRadius: isAndroid ? '0' : '3px',
    });
    bar.appendChild(fill);
    row.appendChild(bar);

    const value = createElement('span', '', formatValue(scenario.value));
    setStyles(value, {
      fontSize: '0.75rem',
      color: 'var(--color-text-secondary)',
      width: '40px',
      textAlign: 'right',
    });
    row.appendChild(value);

    scenarioContainer.appendChild(row);
  });

  card.appendChild(scenarioContainer);

  return card;
}

// ============================================================================
// TABLET BUILDER
// ============================================================================

/**
 * Build predictions for tablet with full chart.
 */
function buildTablet(
  container: HTMLElement,
  data: PredictionsData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'AI Predictions'));
  header.appendChild(
    createElement('p', '', `${Math.round(data.accuracy * 100)}% historical accuracy`)
  );
  container.appendChild(header);

  // Main content
  const contentGrid = createFlexContainer('row', '24px');
  setStyles(contentGrid, { padding: '16px' });

  // Left: Chart area
  const chartSection = createElement('div');
  setStyles(chartSection, { flex: '2' });

  // Build prediction chart
  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 300 180');
  setStyles(svg as unknown as HTMLElement, { width: '100%', maxWidth: '350px' });

  // Draw chart background
  const chartBg = createSvgElement('rect');
  chartBg.setAttribute('x', '40');
  chartBg.setAttribute('y', '20');
  chartBg.setAttribute('width', '240');
  chartBg.setAttribute('height', '130');
  chartBg.setAttribute('fill', 'var(--color-background)');
  chartBg.setAttribute('rx', '4');
  svg.appendChild(chartBg);

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = 20 + i * 32.5;
    const line = createSvgElement('line');
    line.setAttribute('x1', '40');
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', '280');
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'var(--color-border-subtle)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }

  // Draw predictions
  const predictions = data.predictions.slice(0, 3);
  const barWidth = 50;
  const gap = 25;
  const startX = 60;

  predictions.forEach((pred, i) => {
    const x = startX + i * (barWidth + gap);

    // Current value bar
    const currentHeight = (pred.currentValue / 100) * 100; // Assuming 0-100 scale
    const currentBar = createSvgElement('rect');
    currentBar.setAttribute('x', String(x));
    currentBar.setAttribute('y', String(150 - currentHeight));
    currentBar.setAttribute('width', String(barWidth / 2 - 2));
    currentBar.setAttribute('height', String(currentHeight));
    currentBar.setAttribute('fill', 'var(--color-text-muted)');
    currentBar.setAttribute('rx', '2');
    svg.appendChild(currentBar);

    // Predicted value bar
    const predHeight = (pred.predictedValue / 100) * 100;
    const confidenceColor = getConfidenceColor(pred.confidence);
    const predBar = createSvgElement('rect');
    predBar.setAttribute('x', String(x + barWidth / 2));
    predBar.setAttribute('y', String(150 - predHeight));
    predBar.setAttribute('width', String(barWidth / 2 - 2));
    predBar.setAttribute('height', String(predHeight));
    predBar.setAttribute('fill', confidenceColor);
    predBar.setAttribute('rx', '2');
    svg.appendChild(predBar);

    // Confidence interval
    const conservativeY = 150 - (pred.scenarios.conservative / 100) * 100;
    const optimisticY = 150 - (pred.scenarios.optimistic / 100) * 100;

    const intervalLine = createSvgElement('line');
    intervalLine.setAttribute('x1', String(x + barWidth * 0.75));
    intervalLine.setAttribute('y1', String(conservativeY));
    intervalLine.setAttribute('x2', String(x + barWidth * 0.75));
    intervalLine.setAttribute('y2', String(optimisticY));
    intervalLine.setAttribute('stroke', confidenceColor);
    intervalLine.setAttribute('stroke-width', '2');
    intervalLine.setAttribute('opacity', '0.5');
    svg.appendChild(intervalLine);

    // Metric label
    const label = createSvgElement('text');
    label.setAttribute('x', String(x + barWidth / 2));
    label.setAttribute('y', '168');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '9');
    label.setAttribute('fill', 'var(--color-text-secondary)');
    label.textContent = truncate(pred.metric, 10);
    svg.appendChild(label);
  });

  // Legend
  const legendY = 10;
  const legend1 = createSvgElement('text');
  legend1.setAttribute('x', '50');
  legend1.setAttribute('y', String(legendY));
  legend1.setAttribute('font-size', '8');
  legend1.setAttribute('fill', 'var(--color-text-muted)');
  legend1.textContent = '■ Current';
  svg.appendChild(legend1);

  const legend2 = createSvgElement('text');
  legend2.setAttribute('x', '100');
  legend2.setAttribute('y', String(legendY));
  legend2.setAttribute('font-size', '8');
  legend2.setAttribute('fill', 'var(--color-accent)');
  legend2.textContent = '■ Predicted';
  svg.appendChild(legend2);

  chartSection.appendChild(svg);
  contentGrid.appendChild(chartSection);

  // Right: Details
  const detailsSection = createElement('div');
  setStyles(detailsSection, { flex: '1' });

  // Primary prediction panel
  const primaryPanel = createElement('div');
  setStyles(primaryPanel, {
    padding: '16px',
    background: 'var(--color-bg-elevated)',
    borderRadius: '12px',
    border: '1px solid var(--color-border-subtle)',
    marginBottom: '12px',
  });

  const primary = data.primaryPrediction;
  const primaryColor = getConfidenceColor(primary.confidence);

  const primaryLabel = createElement('div');
  setStyles(primaryLabel, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  primaryLabel.textContent = t('visualizations.primaryPrediction');
  primaryPanel.appendChild(primaryLabel);

  const metricTitle = createElement('div');
  setStyles(metricTitle, {
    fontSize: '1rem',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  });
  metricTitle.textContent = primary.metric;
  primaryPanel.appendChild(metricTitle);

  const valueDisplay = createFlexContainer('row', '8px', 'flex-start', 'baseline');
  setStyles(valueDisplay, { margin: '8px 0' });

  const currentVal = createElement('span', '', formatValue(primary.currentValue));
  setStyles(currentVal, { color: 'var(--color-text-muted)' });
  valueDisplay.appendChild(currentVal);

  valueDisplay.appendChild(createElement('span', '', '→'));

  const predictedVal = createElement('span', '', formatValue(primary.predictedValue));
  setStyles(predictedVal, {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: primaryColor,
  });
  valueDisplay.appendChild(predictedVal);

  primaryPanel.appendChild(valueDisplay);

  // Confidence bar
  const confRow = createFlexContainer('row', '8px', 'space-between');
  confRow.appendChild(createElement('span', '', 'Confidence'));
  const confValue = createElement('span', '', `${Math.round(primary.confidence * 100)}%`);
  setStyles(confValue, { fontWeight: '600', color: primaryColor });
  confRow.appendChild(confValue);
  primaryPanel.appendChild(confRow);

  const confBar = createElement('div');
  setStyles(confBar, {
    height: '6px',
    background: 'var(--color-border-subtle)',
    borderRadius: '3px',
    overflow: 'hidden',
    marginTop: '4px',
  });

  const confFill = createElement('div');
  setStyles(confFill, {
    width: `${primary.confidence * 100}%`,
    height: '100%',
    background: primaryColor,
    borderRadius: '3px',
  });
  confBar.appendChild(confFill);
  primaryPanel.appendChild(confBar);

  const timeLabel = createElement('div');
  setStyles(timeLabel, {
    fontSize: '0.85rem',
    color: 'var(--color-text-secondary)',
    marginTop: '8px',
  });
  timeLabel.textContent = `Timeframe: ${primary.timeframe}`;
  primaryPanel.appendChild(timeLabel);

  detailsSection.appendChild(primaryPanel);

  // Accuracy panel
  const accuracyPanel = createElement('div');
  setStyles(accuracyPanel, {
    padding: '12px',
    background: 'var(--color-background)',
    borderRadius: '8px',
  });

  const accLabel = createElement('div');
  setStyles(accLabel, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  accLabel.textContent = t('visualizations.historicalAccuracy');
  accuracyPanel.appendChild(accLabel);

  const accValue = createElement('div');
  setStyles(accValue, {
    fontSize: '1.2rem',
    fontWeight: '600',
    color: data.accuracy >= 0.8 ? DEFAULT_COLORS.status.thriving : DEFAULT_COLORS.accent,
  });
  accValue.textContent = `${Math.round(data.accuracy * 100)}%`;
  accuracyPanel.appendChild(accValue);

  detailsSection.appendChild(accuracyPanel);
  contentGrid.appendChild(detailsSection);
  container.appendChild(contentGrid);

  return {
    element: container,
    type: 'predictions',
    device: 'tablet',
    ariaLabel: `${data.predictions.length} predictions with ${Math.round(data.accuracy * 100)}% accuracy, primary: ${data.primaryPrediction.metric}`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build predictions visualization for the given device context.
 */
export function buildPredictions(
  container: HTMLElement,
  data: PredictionsData,
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
 * Get color based on confidence level.
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return CONFIDENCE_COLORS.high;
  if (confidence >= 0.5) return CONFIDENCE_COLORS.medium;
  return CONFIDENCE_COLORS.low;
}

/**
 * Format a numeric value for display.
 */
function formatValue(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

/**
 * Truncate text to max length.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildPredictions;
