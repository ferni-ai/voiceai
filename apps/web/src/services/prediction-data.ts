/**
 * Weekly predictions as the web app holds them, and the numbers it shows.
 *
 * A prediction stores the user's guesses by metric name, e.g.
 * `{ 'Deep work hours': 7, 'Mood average (1-10)': 6 }`
 * (src/tools/domains/engagement/analytics-games.ts). Resolving one posts the
 * actual values under those same names; the server scores only names that
 * match (src/services/engagement/prediction-scoring.ts). So the metric names
 * travel with every prediction here, and every accuracy shown comes from a
 * score the server computed, never from the client guessing one.
 *
 * Kept free of runtime imports so the backend contract test can use it.
 *
 * @module services/prediction-data
 */

import type { PredictionRecord } from './prediction-tracker-data.js';

/** One predicted metric: the stored name, the guess, and the actual once recorded. */
export interface PredictionMetric {
  key: string;
  predicted: number;
  actual?: number;
}

export interface PredictionData {
  id: string;
  category: string;
  question: string;
  /** The first metric's guess (shown when only one number fits). */
  userPrediction: number;
  /** The first metric's actual value, once recorded. */
  actualOutcome?: number;
  /** Every predicted metric, by the name the server stored it under. */
  metrics?: PredictionMetric[];
  /** The server's score (0-100), present only for a scored resolution. */
  accuracy?: number;
  status: 'pending' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
}

/** One metric as the server scored it. */
export interface ScoredMetric {
  key: string;
  predicted: number;
  actual: number;
  accuracy: number;
}

/** Body of a successful POST /api/predictions/:id/actuals. */
export interface ResolutionScore {
  accuracy: number;
  metrics: ScoredMetric[];
}

/** Metrics the weekly prediction game asks about, by the name it stores. */
export type KnownMetricId = 'deepWork' | 'exercise' | 'social' | 'screen' | 'mood';

const KNOWN_METRICS: Record<string, KnownMetricId> = {
  'deep work hours': 'deepWork',
  'exercise sessions': 'exercise',
  'social time (hours)': 'social',
  'screen time (hours)': 'screen',
  'mood average (1-10)': 'mood',
};

/** The known metric a stored name refers to (whole-name match), or null. */
export function knownMetricId(key: string): KnownMetricId | null {
  return KNOWN_METRICS[key.trim().toLowerCase()] ?? null;
}

const CATEGORY_BY_METRIC: Partial<Record<KnownMetricId, string>> = {
  mood: 'mood',
  deepWork: 'productivity',
  exercise: 'health',
  social: 'social',
};

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Map one GET /api/predictions record to what the predictions panel shows. */
export function toPredictionData(record: PredictionRecord): PredictionData {
  const actuals = record.actuals ?? {};
  const metrics: PredictionMetric[] = Object.entries(record.predictions ?? {})
    .filter(([, predicted]) => isNumber(predicted))
    .map(([key, predicted]) =>
      isNumber(actuals[key]) ? { key, predicted, actual: actuals[key] } : { key, predicted }
    );
  const firstKnown = metrics.map((m) => knownMetricId(m.key)).find((id) => id !== null);
  const resolved = Boolean(record.completedAt);
  return {
    id: record.id,
    category: (firstKnown && CATEGORY_BY_METRIC[firstKnown]) || 'overall',
    question: `Week of ${record.weekOf ?? ''}`.trim(),
    userPrediction: metrics[0]?.predicted ?? 0,
    actualOutcome: metrics[0]?.actual,
    metrics,
    accuracy: resolved && isNumber(record.accuracy) ? record.accuracy : undefined,
    status: resolved ? 'resolved' : 'pending',
    createdAt: record.createdAt,
    resolvedAt: record.completedAt,
  };
}

/** The request body for recording actual values (keyed by stored metric name). */
export function buildActualsBody(actuals: Record<string, number>): {
  actuals: Record<string, number>;
} {
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(actuals)) {
    if (isNumber(value)) clean[key] = value;
  }
  return { actuals: clean };
}

/** Read the server's score from a POST response, or null if it isn't one. */
export function parseResolutionScore(data: unknown): ResolutionScore | null {
  if (!data || typeof data !== 'object') return null;
  const { accuracy, metrics } = data as { accuracy?: unknown; metrics?: unknown };
  if (!isNumber(accuracy) || !Array.isArray(metrics)) return null;
  const scored = metrics.filter(
    (m): m is ScoredMetric =>
      !!m &&
      typeof (m as ScoredMetric).key === 'string' &&
      isNumber((m as ScoredMetric).predicted) &&
      isNumber((m as ScoredMetric).actual) &&
      isNumber((m as ScoredMetric).accuracy)
  );
  return scored.length > 0 ? { accuracy, metrics: scored } : null;
}

/** Average of the server's scores over resolved predictions, or null if none. */
export function runningAccuracy(predictions: readonly PredictionData[]): number | null {
  const scores = predictions
    .filter((p) => p.status === 'resolved' && isNumber(p.accuracy))
    .map((p) => p.accuracy as number);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

/** A scored prediction at or above this accuracy keeps a streak going. */
export const STREAK_ACCURACY = 70;

/** Consecutive scored predictions, newest first, at or above STREAK_ACCURACY. */
export function scoredStreak(predictions: readonly PredictionData[]): number {
  const scored = predictions
    .filter((p) => p.status === 'resolved' && isNumber(p.accuracy))
    .sort(
      (a, b) =>
        new Date(b.resolvedAt ?? b.createdAt).getTime() -
        new Date(a.resolvedAt ?? a.createdAt).getTime()
    );
  let streak = 0;
  for (const p of scored) {
    if ((p.accuracy as number) < STREAK_ACCURACY) break;
    streak++;
  }
  return streak;
}

export type ToneBand = 'spotOn' | 'close' | 'off' | 'wayOff';

/** How a guess landed, from the server's accuracy for it. */
export function toneBand(accuracy: number): ToneBand {
  if (accuracy >= 95) return 'spotOn';
  if (accuracy >= 80) return 'close';
  if (accuracy >= 50) return 'off';
  return 'wayOff';
}
