/**
 * Scoring a weekly prediction against what actually happened.
 *
 * A prediction stores the user's guesses by metric name
 * (`{ 'Deep work hours': 7 }`); resolving it supplies actual values under the
 * same names. Only names present on both sides can be scored. Before this
 * module, the web sent `{ result: 7.5 }`, nothing matched, and the store
 * saved accuracy 0 as if it had been scored, so every web resolution read 0%
 * and dragged the running average down. Those records are recognisable (their
 * actuals share no name with their predictions) and are treated as never
 * scored rather than as misses.
 *
 * @module services/engagement/prediction-scoring
 */

/** One metric's guess next to what happened, with how close it was (0-100). */
export interface ScoredMetric {
  key: string;
  predicted: number;
  actual: number;
  accuracy: number;
}

/** A resolved prediction: the overall score and each metric that went into it. */
export interface PredictionScore {
  accuracy: number;
  metrics: ScoredMetric[];
}

/** The parts of a stored prediction that scoring reads. */
export interface ScorablePrediction {
  predictions?: Record<string, number>;
  actuals?: Record<string, number>;
  accuracy?: number;
  completedAt?: string;
}

/** Relative miss: 0 when exact, 1 when off by the whole of the larger value. */
function relativeMiss(predicted: number, actual: number): number {
  const scale = Math.max(Math.abs(predicted), Math.abs(actual), 1);
  return Math.min(1, Math.abs(predicted - actual) / scale);
}

function toPercent(miss: number): number {
  return Math.round((1 - miss) * 100);
}

/**
 * Score actuals against predictions. Returns null when no actual names a
 * predicted metric: there is nothing to compare, so there is no score.
 */
export function scorePrediction(
  predictions: Record<string, number>,
  actuals: Record<string, number>
): PredictionScore | null {
  const metrics: ScoredMetric[] = [];
  let totalMiss = 0;
  for (const [key, actual] of Object.entries(actuals)) {
    const predicted = predictions[key];
    if (typeof predicted !== 'number' || !Number.isFinite(predicted)) continue;
    if (!Number.isFinite(actual)) continue;
    const miss = relativeMiss(predicted, actual);
    totalMiss += miss;
    metrics.push({ key, predicted, actual, accuracy: toPercent(miss) });
  }
  if (metrics.length === 0) return null;
  return { accuracy: toPercent(totalMiss / metrics.length), metrics };
}

/** True when the stored accuracy came from actuals that match a predicted metric. */
export function hasRealScore(p: ScorablePrediction): boolean {
  if (typeof p.accuracy !== 'number' || !p.predictions || !p.actuals) return false;
  const predicted = p.predictions;
  return Object.keys(p.actuals).some((key) => typeof predicted[key] === 'number');
}

/**
 * A prediction as the user should see it: one "resolved" with actuals that
 * matched nothing (the old web bug) was never scored, so it is reopened
 * rather than shown as a 0% miss.
 */
export function withHonestScore<T extends ScorablePrediction>(p: T): T {
  if (!p.completedAt || hasRealScore(p)) return p;
  const reopened = { ...p };
  delete reopened.accuracy;
  delete reopened.actuals;
  delete reopened.completedAt;
  return reopened;
}

/** Mean accuracy over really-scored predictions, or null when none are. */
export function averageRealAccuracy(predictions: ScorablePrediction[]): number | null {
  const scored = predictions.filter(hasRealScore);
  if (scored.length === 0) return null;
  const sum = scored.reduce((total, p) => total + (p.accuracy ?? 0), 0);
  return Math.round(sum / scored.length);
}
