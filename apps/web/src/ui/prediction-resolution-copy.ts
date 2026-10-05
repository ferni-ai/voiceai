/**
 * Words for resolving a weekly prediction: what to ask for each metric, and
 * how the guess compares with what happened.
 *
 * Every comparison is built from the server's own score for that metric
 * (POST /api/predictions/:id/actuals), so "pretty close" is only said when the
 * numbers were close.
 *
 * @module ui/prediction-resolution-copy
 */

import { formatNumber, t } from '../i18n/index.js';
import {
  knownMetricId,
  toneBand,
  type ResolutionScore,
  type ScoredMetric,
  type ToneBand,
} from '../services/prediction-data.js';

/** Short name for a metric ("Deep work"); unknown names are shown as stored. */
export function metricLabel(key: string): string {
  const id = knownMetricId(key);
  return id ? t(`predictionResolution.metrics.${id}.label`) : key;
}

/** The question asking for a metric's actual value. */
export function metricQuestion(key: string): string {
  const id = knownMetricId(key);
  return id
    ? t(`predictionResolution.metrics.${id}.question`)
    : t('predictionResolution.metrics.generic.question', { label: key });
}

/** The unit a metric is counted in ("hours"), or '' when unknown. */
export function metricUnit(key: string): string {
  const id = knownMetricId(key);
  return id ? t(`predictionResolution.metrics.${id}.unit`) : '';
}

/** One metric's guess next to what happened, in the tone the score earned. */
export function comparisonLine(metric: ScoredMetric): { text: string; tone: ToneBand } {
  const tone = toneBand(metric.accuracy);
  const text = t('predictionResolution.result.line', {
    predicted: formatNumber(metric.predicted),
    actual: formatNumber(metric.actual),
    verdict: t(`predictionResolution.tone.${tone}`),
  });
  return { text, tone };
}

/** The overall score line, only when more than one metric was scored. */
export function overallLine(score: ResolutionScore): string | null {
  if (score.metrics.length < 2) return null;
  return t('predictionResolution.result.overall', { accuracy: score.accuracy });
}
