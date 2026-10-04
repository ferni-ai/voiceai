/**
 * Your Story sections: the API's real section data, mapped to exactly what
 * each visualization component reads.
 *
 * Every mapper returns undefined when the server had nothing real for that
 * section; the dashboard then leaves the section out. Nothing here invents a
 * value the server didn't send.
 *
 * @module services/your-story-sections
 */

import type { Prediction, PredictionsData } from '../ui/visualizations/index.js';

// ============================================================================
// API SHAPES (mirror src/api/your-story-*.ts)
// ============================================================================

/** GET /api/your-story/full `prediction` (src/api/your-story-prediction.ts) */
export interface ApiPrediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  confidence: number; // 0-1
  timeframe: string;
  range: { conservative: number; expected: number; optimistic: number };
  basis: string;
  readings: number;
  days: number;
}

// ============================================================================
// MAPPERS
// ============================================================================

/** Forecast card: one real prediction, no track record (none is kept). */
export function toPredictions(api: ApiPrediction | null | undefined): PredictionsData | undefined {
  if (!api) return undefined;
  const prediction: Prediction = {
    metric: api.metric,
    currentValue: api.currentValue,
    predictedValue: api.predictedValue,
    confidence: api.confidence,
    timeframe: api.timeframe,
    scenarios: api.range,
    basis: api.basis,
  };
  return { predictions: [prediction], primaryPrediction: prediction };
}
