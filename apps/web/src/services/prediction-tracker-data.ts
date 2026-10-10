/**
 * Turns the GET /api/predictions response into what the prediction tracker
 * panel shows.
 *
 * The server (src/api/routes/predictions.ts) sends the user's most recent
 * stored predictions, newest first, plus totals from their engagement
 * profile. Nothing here is invented: a prediction counts as "correct" when
 * its scored accuracy is at least 70%, the trend and streaks come from the
 * scored ones, and no category breakdown is shown because the server has none.
 *
 * Kept free of runtime imports so the backend contract test can feed the
 * real handler's output straight into it.
 *
 * @module services/prediction-tracker-data
 */

import type { PredictionTrackerData } from '../types/predictions.js';

/** One prediction as the server returns it (a StoredPrediction, maybe marked expired). */
export interface PredictionRecord {
  id: string;
  weekOf?: string;
  predictions?: Record<string, number>;
  actuals?: Record<string, number>;
  accuracy?: number;
  createdAt: string;
  completedAt?: string;
  status?: string;
}

/** Body of GET /api/predictions. */
export interface PredictionsResponse {
  predictions?: PredictionRecord[];
  stats?: {
    totalPredictions?: number;
    averageAccuracy?: number;
    pendingCount?: number;
    expiredCount?: number;
  };
}

/** A scored prediction at or above this accuracy counts as correct. */
export const CORRECT_ACCURACY = 70;

function percent(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function longestRun(hits: boolean[]): number {
  let best = 0;
  let run = 0;
  for (const hit of hits) {
    run = hit ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Map the server response to tracker data, or null when the user has no
 * predictions at all (the caller shows an empty state, not a zero dashboard).
 */
export function toPredictionTrackerData(body: PredictionsResponse): PredictionTrackerData | null {
  const predictions = Array.isArray(body.predictions) ? body.predictions : [];
  const total = Math.max(body.stats?.totalPredictions ?? 0, predictions.length);
  if (total === 0) return null;

  // Newest first, as the server orders them.
  const scored = predictions
    .filter((p) => typeof p.accuracy === 'number')
    .map((p) => percent(p.accuracy));
  const hits = scored.map((accuracy) => accuracy >= CORRECT_ACCURACY);
  const leadingHits = hits.findIndex((hit) => !hit);

  return {
    overallAccuracy: percent(body.stats?.averageAccuracy),
    totalPredictions: total,
    correctPredictions: hits.filter(Boolean).length,
    byCategory: [],
    // Oldest to newest, so the chart reads left to right.
    recentTrend: scored.slice(0, 7).reverse(),
    currentStreak: leadingHits === -1 ? hits.length : leadingHits,
    bestStreak: longestRun(hits),
  };
}
