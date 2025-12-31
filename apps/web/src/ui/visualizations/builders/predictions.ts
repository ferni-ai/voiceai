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

  // Header - story-driven title, no "AI" language
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Ahead'));
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

  // Header - story-driven title, no "AI" language
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', "Where You're Headed"));
  header.appendChild(createElement('p', '', `${Math.round(data.accuracy * 100)}% track record`));
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
 * Build predictions for tablet - story-driven, dense with meaning.
 * "Where You're Headed" - not "AI Predictions"
 */
function buildTablet(
  container: HTMLElement,
  data: PredictionsData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Apply container styles with generous padding
  setStyles(container, {
    padding: '1.5rem',
    minHeight: '380px',
  });

  const primary = data.primaryPrediction;
  const primaryColor = getConfidenceColor(primary.confidence);
  const changeAmount = primary.predictedValue - primary.currentValue;
  const changePercent = Math.round((changeAmount / primary.currentValue) * 100);
  const isPositiveChange = changeAmount > 0;
  const accuracyPercent = Math.round(data.accuracy * 100);

  // Generate story-driven headline based on the data
  const getStoryHeadline = (): string => {
    if (primary.metric.toLowerCase().includes('wellbeing') || primary.metric.toLowerCase().includes('emotional')) {
      if (isPositiveChange && changePercent >= 10) return 'Your path is brightening';
      if (isPositiveChange) return 'Gentle progress ahead';
      if (changePercent <= -10) return 'A season of growth through challenge';
      return 'Steady as you go';
    }
    if (primary.metric.toLowerCase().includes('stress')) {
      if (!isPositiveChange && changePercent <= -10) return 'Calmer days ahead';
      if (!isPositiveChange) return 'Easing into balance';
      return 'Building resilience';
    }
    if (isPositiveChange && changePercent >= 15) return 'Momentum building';
    if (isPositiveChange) return 'Moving forward';
    return 'A time for reflection';
  };

  // Header with story-driven title
  const header = createElement('div');
  setStyles(header, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.3125rem',
    paddingBottom: '0.8125rem',
    borderBottom: '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))',
  });

  const headerText = createElement('div');
  const title = createElement('h3');
  setStyles(title, {
    fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
    fontSize: '1.0625rem',
    fontWeight: '600',
    lineHeight: '1.3',
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary, #2C2520)',
    margin: '0 0 0.25rem',
  });
  title.textContent = "Where You're Headed";

  const subtitle = createElement('p');
  setStyles(subtitle, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.75rem',
    fontWeight: '500',
    color: 'var(--color-text-muted, #8a8279)',
    margin: '0',
    letterSpacing: '0.01em',
  });
  subtitle.textContent = getStoryHeadline();

  headerText.appendChild(title);
  headerText.appendChild(subtitle);
  header.appendChild(headerText);

  // Accuracy badge - builds trust
  const accuracyBadge = createElement('div');
  setStyles(accuracyBadge, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.75rem',
    background: accuracyPercent >= 80 
      ? 'var(--color-semantic-success-tint, rgba(61, 122, 82, 0.08))'
      : 'var(--color-accent-subtle, rgba(61, 90, 69, 0.08))',
    borderRadius: 'var(--radius-full, 9999px)',
    fontSize: '0.6875rem',
    fontWeight: '600',
    color: accuracyPercent >= 80 
      ? 'var(--color-semantic-success, #3d7a52)'
      : 'var(--color-accent, #3D5A45)',
    letterSpacing: '0.02em',
  });
  accuracyBadge.textContent = `${accuracyPercent}% track record`;
  header.appendChild(accuracyBadge);

  container.appendChild(header);

  // Main content - 2 column layout
  const contentGrid = createElement('div');
  setStyles(contentGrid, {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: '1.5rem',
    alignItems: 'start',
  });

  // LEFT: Primary prediction with rich context
  const primarySection = createElement('div');
  setStyles(primarySection, {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  });

  // Hero metric card
  const heroCard = createElement('div');
  setStyles(heroCard, {
    padding: '1.25rem',
    background: 'var(--color-bg-elevated, #FFFDFB)',
    borderRadius: 'var(--radius-xl, 1.25rem)',
    border: '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
  });

  // Metric name as eyebrow
  const metricEyebrow = createElement('div');
  setStyles(metricEyebrow, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.625rem',
    fontWeight: '700',
    color: 'var(--color-text-muted, #8a8279)',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  });
  metricEyebrow.textContent = primary.metric.toUpperCase();
  heroCard.appendChild(metricEyebrow);

  // Value transition (current → predicted)
  const valueRow = createElement('div');
  setStyles(valueRow, {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    marginBottom: '1rem',
  });

  const currentValSpan = createElement('span');
  setStyles(currentValSpan, {
    fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
    fontSize: '1.5rem',
    fontWeight: '500',
    color: 'var(--color-text-muted, #8a8279)',
  });
  currentValSpan.textContent = formatValue(primary.currentValue);
  valueRow.appendChild(currentValSpan);

  const arrowSpan = createElement('span');
  setStyles(arrowSpan, {
    fontSize: '1.25rem',
    color: 'var(--color-text-dimmed, #a89d90)',
  });
  arrowSpan.textContent = '→';
  valueRow.appendChild(arrowSpan);

  const predictedValSpan = createElement('span');
  setStyles(predictedValSpan, {
    fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
    fontSize: '2.25rem',
    fontWeight: '700',
    color: primaryColor,
    lineHeight: '1',
  });
  predictedValSpan.textContent = formatValue(primary.predictedValue);
  valueRow.appendChild(predictedValSpan);

  // Change indicator
  if (changePercent !== 0) {
    const changeSpan = createElement('span');
    setStyles(changeSpan, {
      fontFamily: 'var(--font-body, Inter, sans-serif)',
      fontSize: '0.875rem',
      fontWeight: '600',
      color: isPositiveChange 
        ? 'var(--color-semantic-success, #3d7a52)' 
        : 'var(--color-semantic-error, #b5453a)',
      marginLeft: '0.25rem',
    });
    changeSpan.textContent = `${isPositiveChange ? '+' : ''}${changePercent}%`;
    valueRow.appendChild(changeSpan);
  }

  heroCard.appendChild(valueRow);

  // Confidence with visual bar
  const confSection = createElement('div');
  setStyles(confSection, { marginBottom: '1rem' });

  const confHeader = createElement('div');
  setStyles(confHeader, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  });

  const confLabel = createElement('span');
  setStyles(confLabel, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary, #5c544a)',
  });
  confLabel.textContent = 'Confidence';
  confHeader.appendChild(confLabel);

  const confValue = createElement('span');
  setStyles(confValue, {
    fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
    fontSize: '0.875rem',
    fontWeight: '700',
    color: primaryColor,
  });
  confValue.textContent = `${Math.round(primary.confidence * 100)}%`;
  confHeader.appendChild(confValue);

  confSection.appendChild(confHeader);

  const confBar = createElement('div');
  setStyles(confBar, {
    height: '8px',
    background: 'var(--tonal-surface1, rgba(44, 37, 32, 0.04))',
    borderRadius: 'var(--radius-full, 9999px)',
    overflow: 'hidden',
  });

  const confFill = createElement('div');
  setStyles(confFill, {
    width: `${primary.confidence * 100}%`,
    height: '100%',
    background: primaryColor,
    borderRadius: 'var(--radius-full, 9999px)',
    transition: 'width 0.6s ease-out',
  });
  confBar.appendChild(confFill);
  confSection.appendChild(confBar);
  heroCard.appendChild(confSection);

  // Timeframe context
  const timeContext = createElement('div');
  setStyles(timeContext, {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.625rem 0.875rem',
    background: 'var(--tonal-surface1, rgba(44, 37, 32, 0.02))',
    borderRadius: 'var(--radius-lg, 1rem)',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary, #5c544a)',
  });
  timeContext.innerHTML = `<span style="opacity: 0.6">📅</span> Timeframe: <strong>${primary.timeframe}</strong>`;
  heroCard.appendChild(timeContext);

  primarySection.appendChild(heroCard);

  // Scenario range card
  const scenarioCard = createElement('div');
  setStyles(scenarioCard, {
    padding: '1rem 1.125rem',
    background: 'var(--tonal-surface1, rgba(44, 37, 32, 0.015))',
    borderRadius: 'var(--radius-lg, 1rem)',
  });

  const scenarioTitle = createElement('div');
  setStyles(scenarioTitle, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.6875rem',
    fontWeight: '700',
    color: 'var(--color-text-muted, #8a8279)',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  });
  scenarioTitle.textContent = 'POSSIBLE RANGE';
  scenarioCard.appendChild(scenarioTitle);

  // Visual range bar
  const rangeVisual = createElement('div');
  setStyles(rangeVisual, {
    position: 'relative',
    height: '32px',
    marginBottom: '0.5rem',
  });

  const rangeTrack = createElement('div');
  setStyles(rangeTrack, {
    position: 'absolute',
    top: '50%',
    left: '0',
    right: '0',
    height: '4px',
    background: 'var(--color-border-subtle, rgba(44, 37, 32, 0.08))',
    borderRadius: '2px',
    transform: 'translateY(-50%)',
  });
  rangeVisual.appendChild(rangeTrack);

  const maxRange = Math.max(primary.scenarios.optimistic, primary.predictedValue * 1.2);
  const conservativePos = (primary.scenarios.conservative / maxRange) * 100;
  const expectedPos = (primary.scenarios.expected / maxRange) * 100;
  const optimisticPos = (primary.scenarios.optimistic / maxRange) * 100;

  // Range highlight
  const rangeHighlight = createElement('div');
  setStyles(rangeHighlight, {
    position: 'absolute',
    top: '50%',
    left: `${conservativePos}%`,
    width: `${optimisticPos - conservativePos}%`,
    height: '4px',
    background: `linear-gradient(90deg, var(--color-text-muted) 0%, ${primaryColor} 50%, var(--color-semantic-success, #3d7a52) 100%)`,
    borderRadius: '2px',
    transform: 'translateY(-50%)',
    opacity: '0.6',
  });
  rangeVisual.appendChild(rangeHighlight);

  // Expected marker (prominent)
  const expectedMarker = createElement('div');
  setStyles(expectedMarker, {
    position: 'absolute',
    top: '50%',
    left: `${expectedPos}%`,
    width: '12px',
    height: '12px',
    background: primaryColor,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    border: '2px solid var(--color-bg-elevated, #FFFDFB)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
  });
  rangeVisual.appendChild(expectedMarker);

  scenarioCard.appendChild(rangeVisual);

  // Labels row
  const labelsRow = createElement('div');
  setStyles(labelsRow, {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.6875rem',
  });

  const scenarios = [
    { label: 'Conservative', value: primary.scenarios.conservative, color: 'var(--color-text-muted)' },
    { label: 'Expected', value: primary.scenarios.expected, color: primaryColor },
    { label: 'Optimistic', value: primary.scenarios.optimistic, color: 'var(--color-semantic-success, #3d7a52)' },
  ];

  scenarios.forEach(s => {
    const label = createElement('div');
    setStyles(label, { textAlign: s.label === 'Expected' ? 'center' : s.label === 'Conservative' ? 'left' : 'right' });
    label.innerHTML = `<span style="color: var(--color-text-muted); display: block">${s.label}</span><span style="font-weight: 600; color: ${s.color}">${formatValue(s.value)}</span>`;
    labelsRow.appendChild(label);
  });

  scenarioCard.appendChild(labelsRow);
  primarySection.appendChild(scenarioCard);
  contentGrid.appendChild(primarySection);

  // RIGHT: Other predictions + insights
  const rightSection = createElement('div');
  setStyles(rightSection, {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.8125rem',
  });

  // Other predictions
  const otherPredictions = data.predictions.filter(p => p.metric !== primary.metric).slice(0, 3);
  
  if (otherPredictions.length > 0) {
    const othersCard = createElement('div');
    setStyles(othersCard, {
      padding: '1rem 1.125rem',
      background: 'var(--color-bg-elevated, #FFFDFB)',
      borderRadius: 'var(--radius-lg, 1rem)',
      border: '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))',
    });

    const othersTitle = createElement('div');
    setStyles(othersTitle, {
      fontFamily: 'var(--font-body, Inter, sans-serif)',
      fontSize: '0.625rem',
      fontWeight: '700',
      color: 'var(--color-text-muted, #8a8279)',
      marginBottom: '0.875rem',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    });
    othersTitle.textContent = 'ALSO TRACKING';
    othersCard.appendChild(othersTitle);

    otherPredictions.forEach((pred, index) => {
      const predRow = createElement('div');
      const predChange = pred.predictedValue - pred.currentValue;
      const predChangePercent = Math.round((predChange / pred.currentValue) * 100);
      const predPositive = predChange > 0;

      setStyles(predRow, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.625rem 0',
        borderTop: index > 0 ? '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04))' : 'none',
      });

      const predLabel = createElement('div');
      setStyles(predLabel, {
        fontSize: '0.8125rem',
        fontWeight: '500',
        color: 'var(--color-text-primary, #2C2520)',
      });
      predLabel.textContent = pred.metric;

      const predValues = createElement('div');
      setStyles(predValues, {
        display: 'flex',
        alignItems: 'baseline',
        gap: '0.375rem',
      });

      const predCurrent = createElement('span');
      setStyles(predCurrent, {
        fontSize: '0.75rem',
        color: 'var(--color-text-muted)',
      });
      predCurrent.textContent = formatValue(pred.currentValue);

      const predArrow = createElement('span');
      setStyles(predArrow, {
        fontSize: '0.625rem',
        color: 'var(--color-text-dimmed)',
      });
      predArrow.textContent = '→';

      const predFuture = createElement('span');
      setStyles(predFuture, {
        fontSize: '0.875rem',
        fontWeight: '600',
        color: getConfidenceColor(pred.confidence),
      });
      predFuture.textContent = formatValue(pred.predictedValue);

      if (predChangePercent !== 0) {
        const predChangeBadge = createElement('span');
        setStyles(predChangeBadge, {
          fontSize: '0.6875rem',
          fontWeight: '600',
          color: predPositive 
            ? 'var(--color-semantic-success, #3d7a52)' 
            : 'var(--color-semantic-error, #b5453a)',
          marginLeft: '0.25rem',
        });
        predChangeBadge.textContent = `${predPositive ? '+' : ''}${predChangePercent}%`;
        predValues.appendChild(predCurrent);
        predValues.appendChild(predArrow);
        predValues.appendChild(predFuture);
        predValues.appendChild(predChangeBadge);
      } else {
        predValues.appendChild(predCurrent);
        predValues.appendChild(predArrow);
        predValues.appendChild(predFuture);
      }

      predRow.appendChild(predLabel);
      predRow.appendChild(predValues);
      othersCard.appendChild(predRow);
    });

    rightSection.appendChild(othersCard);
  }

  // Insight card - what this means
  const insightCard = createElement('div');
  setStyles(insightCard, {
    padding: '1rem 1.125rem',
    background: 'var(--color-accent-subtle, rgba(61, 90, 69, 0.04))',
    borderRadius: 'var(--radius-lg, 1rem)',
    borderLeft: `3px solid ${primaryColor}`,
  });

  const insightTitle = createElement('div');
  setStyles(insightTitle, {
    fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: 'var(--color-text-primary, #2C2520)',
    marginBottom: '0.5rem',
  });
  insightTitle.textContent = 'What this means';
  insightCard.appendChild(insightTitle);

  const insightText = createElement('p');
  setStyles(insightText, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.8125rem',
    lineHeight: '1.5',
    color: 'var(--color-text-secondary, #5c544a)',
    margin: '0',
  });
  
  // Generate contextual insight based on data
  const getInsightText = (): string => {
    if (accuracyPercent >= 85) {
      if (isPositiveChange && changePercent >= 10) {
        return `Based on patterns I've observed, you're building real momentum. Your ${primary.metric.toLowerCase()} has been trending upward consistently.`;
      }
      if (!isPositiveChange) {
        return `This reflects what I'm seeing in our conversations. It might be a good time to focus on what's been weighing on you.`;
      }
      return `Your patterns are clear and consistent. Keep doing what's working—it shows in the numbers.`;
    }
    return `These patterns are still emerging. As we talk more, I'll understand your rhythms better.`;
  };
  
  insightText.textContent = getInsightText();
  insightCard.appendChild(insightText);
  rightSection.appendChild(insightCard);

  contentGrid.appendChild(rightSection);
  container.appendChild(contentGrid);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Where you're headed: ${primary.metric} predicted to change from ${primary.currentValue} to ${primary.predictedValue} over ${primary.timeframe}, with ${Math.round(primary.confidence * 100)}% confidence and ${accuracyPercent}% historical accuracy.`
    )
  );

  return {
    element: container,
    type: 'predictions',
    device: 'tablet',
    ariaLabel: `${data.predictions.length} predictions, primary: ${primary.metric} expected to reach ${primary.predictedValue} with ${Math.round(primary.confidence * 100)}% confidence`,
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
