/**
 * Records what actually happened for a weekly prediction and returns the
 * server's score for it.
 *
 * The body is keyed by the metric names the prediction was stored under, so
 * the server can compare like with like. It used to send `{ result: n }`,
 * which matched nothing and scored 0% every time.
 *
 * @module services/prediction-actuals
 */

import { apiPost } from '../utils/api.js';
import { buildActualsBody, parseResolutionScore, type ResolutionScore } from './prediction-data.js';

/** POST the actual values; resolves to the server's score or throws. */
export async function submitPredictionActuals(
  predictionId: string,
  actuals: Record<string, number>
): Promise<ResolutionScore> {
  const response = await apiPost<unknown>(
    `/api/predictions/${encodeURIComponent(predictionId)}/actuals`,
    buildActualsBody(actuals)
  );
  const score = response.ok ? parseResolutionScore(response.data) : null;
  if (!score) {
    throw new Error(response.error || 'Prediction result was not scored');
  }
  return score;
}
