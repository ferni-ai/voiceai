/**
 * Predictions Visualization Builder ("Where You're Headed")
 *
 * Shows the forecast the server worked out from the user's real readings:
 * the value now, the value at the end of the timeframe, the 80% range around
 * it, how sure we are of the direction, and the plain-words basis. A track
 * record is shown only when one exists (past forecasts actually scored).
 *
 * One layout, sized per device; watch shows just the headline numbers.
 *
 * @module visualizations/builders/predictions
 */

import { createElement, setStyles, createScreenReaderLabel } from '../utils/dom.js';
import type { PredictionsData, Prediction, DeviceContext, VisualizationResult } from '../types.js';
import { CSS_COLOR_VARS } from '../types.js';
import { t } from '../../../i18n/index.js';

/** Confidence (0-1) to a status color token. */
function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return CSS_COLOR_VARS.statusThriving;
  if (confidence >= 0.5) return CSS_COLOR_VARS.statusStretched;
  return CSS_COLOR_VARS.statusDepleted;
}

function headline(p: Prediction): HTMLElement {
  const row = createElement('div', 'viz-flex viz-flex--row viz-flex--center');
  setStyles(row, { gap: 'var(--viz-space-pause)', justifyContent: 'center' });

  const now = createElement('div', 'viz-stat');
  now.appendChild(createElement('div', 'viz-stat__value', String(p.currentValue)));
  now.appendChild(
    createElement('div', 'viz-stat__label', t('visualizations.predictions.now', 'Now'))
  );
  row.appendChild(now);

  const arrow = createElement(
    'span',
    'viz-predictions__arrow',
    p.predictedValue > p.currentValue ? '↗' : p.predictedValue < p.currentValue ? '↘' : '→'
  );
  arrow.setAttribute('aria-hidden', 'true');
  setStyles(arrow, { color: CSS_COLOR_VARS.textMuted });
  row.appendChild(arrow);

  const next = createElement('div', 'viz-stat');
  next.appendChild(createElement('div', 'viz-stat__value', String(p.predictedValue)));
  next.appendChild(createElement('div', 'viz-stat__label', p.timeframe));
  row.appendChild(next);
  return row;
}

/** The 80% range as a bar: conservative to optimistic, with the expected mark. */
function rangeBar(p: Prediction): HTMLElement {
  const wrap = createElement('div', 'viz-predictions__range');
  setStyles(wrap, { marginTop: 'var(--viz-space-pause)' });

  const track = createElement('div', 'viz-progress');
  setStyles(track, { position: 'relative' });
  const { conservative, expected, optimistic } = p.scenarios;
  const band = createElement('div', 'viz-progress__fill');
  setStyles(band, {
    position: 'absolute',
    left: `${conservative}%`,
    width: `${Math.max(1, optimistic - conservative)}%`,
    opacity: '0.4',
  });
  track.appendChild(band);
  const mark = createElement('div', 'viz-predictions__expected');
  setStyles(mark, {
    position: 'absolute',
    left: `${expected}%`,
    top: '0',
    bottom: '0',
    width: '2px',
    background: CSS_COLOR_VARS.textPrimary,
  });
  track.appendChild(mark);
  wrap.appendChild(track);

  const label = createElement('p', 'viz-insight');
  label.textContent = `Likely between ${conservative} and ${optimistic}`;
  wrap.appendChild(label);
  return wrap;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build the predictions visualization for the given device context.
 */
export function buildPredictions(
  container: HTMLElement,
  data: PredictionsData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const p = data.primaryPrediction;
  const confidencePct = Math.round(p.confidence * 100);
  const summary =
    `${p.metric}: ${p.currentValue} now, ${p.predictedValue} in ${p.timeframe} ` +
    `(likely ${p.scenarios.conservative} to ${p.scenarios.optimistic}). ` +
    `${confidencePct}% sure of the direction.`;

  const header = createElement('div', 'viz-header');
  header.appendChild(
    createElement(
      'h3',
      'viz-header__title',
      t('visualizations.predictions.title', "Where You're Headed")
    )
  );
  header.appendChild(createElement('p', 'viz-header__subtitle', `${p.metric}, ${p.timeframe}`));
  if (data.accuracy !== undefined) {
    header.appendChild(
      createElement('span', 'viz-badge', `${Math.round(data.accuracy * 100)}% track record`)
    );
  }
  container.appendChild(header);

  const card = createElement('div', 'viz-card viz-animate-slide');
  card.appendChild(headline(p));

  if (context.type !== 'watch') {
    card.appendChild(rangeBar(p));

    const confidence = createElement('p', 'viz-insight');
    setStyles(confidence, { color: confidenceColor(p.confidence) });
    confidence.textContent = `${confidencePct}% sure of the direction`;
    card.appendChild(confidence);

    if (p.basis) {
      const basis = createElement('p', 'viz-insight');
      setStyles(basis, { color: CSS_COLOR_VARS.textSecondary });
      basis.textContent = p.basis;
      card.appendChild(basis);
    }
  }
  container.appendChild(card);
  container.appendChild(createScreenReaderLabel(summary));

  return { element: container, type: 'predictions', device: context.type, ariaLabel: summary };
}

export default buildPredictions;
