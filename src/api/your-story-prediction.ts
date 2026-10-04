/**
 * "Where you're headed" for Your Story: a forecast from real energy readings.
 *
 * Method (stated to the user in `basis`):
 * - Data: the user's persisted energy readings (capacity-guardian
 *   `energy_readings`, energyScore 0-100) from the last 28 days.
 * - Enough data: at least 6 readings on at least 4 different days. Otherwise
 *   there is no forecast (null), and the web hides the section.
 * - Trend: ordinary least-squares line of score against time in days.
 * - Now / in 2 weeks: the line's value at the latest reading, and 14 days
 *   after it (clamped to 0-100).
 * - Range: an 80% prediction interval around the 2-week value
 *   (± 1.2816 · s · sqrt(1 + 1/n + (x0 - x̄)² / Sxx), s = residual std error).
 * - Confidence: how sure we are of the trend's direction, Φ(|slope / SE|),
 *   which grows with more readings and shrinks with more scatter.
 *
 * No track record is claimed: past forecasts are not stored or scored.
 *
 * @module api/your-story-prediction
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'YourStoryPrediction' });

const WINDOW_DAYS = 28;
const HORIZON_DAYS = 14;
const MIN_READINGS = 6;
const MIN_DAYS = 4;
const Z_80 = 1.2816;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PredictionData {
  metric: 'Energy';
  currentValue: number; // 0-100, trend line at the latest reading
  predictedValue: number; // 0-100, trend line 2 weeks later
  confidence: number; // 0-1, confidence in the trend's direction
  timeframe: '2 weeks';
  range: { conservative: number; expected: number; optimistic: number };
  /** How this was worked out, in plain words */
  basis: string;
  readings: number;
  days: number;
}

interface Reading {
  timestamp: number;
  energyScore: number;
}

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 erf approximation). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** The forecast for these readings, or null when there are too few. */
export function forecastEnergy(readings: Reading[], now = Date.now()): PredictionData | null {
  const recent = readings.filter(
    (r) => Number.isFinite(r.energyScore) && r.timestamp > now - WINDOW_DAYS * DAY_MS
  );
  const days = new Set(recent.map((r) => new Date(r.timestamp).toISOString().slice(0, 10))).size;
  if (recent.length < MIN_READINGS || days < MIN_DAYS) return null;

  const n = recent.length;
  const xs = recent.map((r) => (r.timestamp - now) / DAY_MS);
  const ys = recent.map((r) => r.energyScore);
  const xBar = xs.reduce((a, b) => a + b, 0) / n;
  const yBar = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((sum, x) => sum + (x - xBar) ** 2, 0);
  if (sxx === 0) return null;
  const slope = xs.reduce((sum, x, i) => sum + (x - xBar) * (ys[i]! - yBar), 0) / sxx;
  const intercept = yBar - slope * xBar;
  const sse = xs.reduce((sum, x, i) => sum + (ys[i]! - (intercept + slope * x)) ** 2, 0);
  const s = Math.sqrt(sse / (n - 2));

  const xNow = Math.max(...xs);
  const x0 = xNow + HORIZON_DAYS;
  const current = intercept + slope * xNow;
  const predicted = intercept + slope * x0;
  const halfWidth = Z_80 * s * Math.sqrt(1 + 1 / n + (x0 - xBar) ** 2 / sxx);
  const slopeSe = s / Math.sqrt(sxx);
  const confidence = slopeSe === 0 ? 1 : normalCdf(Math.abs(slope / slopeSe));
  const perWeek = Math.round(slope * 7 * 10) / 10;
  const direction = perWeek > 0 ? 'rising' : perWeek < 0 ? 'falling' : 'flat';

  return {
    metric: 'Energy',
    currentValue: clamp(current),
    predictedValue: clamp(predicted),
    confidence: Math.round(confidence * 100) / 100,
    timeframe: '2 weeks',
    range: {
      conservative: clamp(predicted - halfWidth),
      expected: clamp(predicted),
      optimistic: clamp(predicted + halfWidth),
    },
    basis:
      `From ${n} energy readings over ${days} days: ${direction}` +
      (direction === 'flat' ? '.' : ` about ${Math.abs(perWeek)} points a week.`) +
      ' The range is where 8 in 10 readings would land if that trend holds.',
    readings: n,
    days,
  };
}

/** Your Story's forecast for this user, or null without enough real data. */
export async function fetchPrediction(userId: string): Promise<PredictionData | null> {
  try {
    const { loadEnergyHistory } = await import('../services/superhuman/capacity-guardian.js');
    return forecastEnergy(await loadEnergyHistory(userId, WINDOW_DAYS));
  } catch (error) {
    log.warn({ error, userId }, 'Failed to build prediction');
    return null;
  }
}
