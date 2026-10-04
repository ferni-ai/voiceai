/**
 * Predictions Routes
 *
 * GET /api/predictions - Get user predictions
 * POST /api/predictions/:id/actuals - Score a prediction against what happened
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached, sendError } from '../helpers.js';
import { validateBody, UpdatePredictionActualsSchema } from '../validators.js';
import { API_ERRORS } from '../error-messages.js';
import type { AnyRecord } from './types.js';
import {
  averageRealAccuracy,
  withHonestScore,
} from '../../services/engagement/prediction-scoring.js';

const log = createLogger({ module: 'PredictionsAPI' });

/**
 * GET /api/predictions - Get user predictions
 */
export async function handleGetPredictions(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const limitParam = parsedUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 100) : 20;

    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();
    // A resolution whose actuals matched no predicted metric was never really
    // scored (see prediction-scoring.ts): it comes back open, not as a 0% miss.
    const stored = (await store.getRecentPredictions(userId, limit)) as unknown as AnyRecord[];
    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;

    // Auto-expire old predictions
    const EXPIRY_DAYS = 7;
    const expiryThreshold = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    const predictions = stored.map((record) => {
      const p = withHonestScore(record);
      if (!p.completedAt && new Date(p.createdAt as string).getTime() < expiryThreshold) {
        return { ...p, status: 'expired', expiredAt: new Date().toISOString() };
      }
      return p;
    });

    const validPredictions = predictions.filter((p) => p.status !== 'expired');

    sendJSONCached(
      res,
      {
        predictions,
        stats: {
          totalPredictions: ((profile.stats as AnyRecord)?.totalPredictions as number) || 0,
          // Only predictions scored against matching actuals count.
          averageAccuracy: averageRealAccuracy(validPredictions) ?? 0,
          pendingCount: validPredictions.filter((p) => !p.completedAt).length,
          expiredCount: predictions.filter((p) => p.status === 'expired').length,
        },
      },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get predictions');
    sendError(res, API_ERRORS.PREDICTIONS_FETCH_FAILED, 500);
  }
}

/**
 * POST /api/predictions/:id/actuals - Score a prediction against what happened.
 *
 * Body: `{ actuals: { [metric]: number } }`, keyed by the metric names the
 * prediction stored. Responds with the score: `{ accuracy, metrics }`.
 * Acts only as the verified caller (bound from the token by
 * bindVerifiedIdentity); a body naming anyone else is refused.
 */
export async function handleUpdatePredictionActuals(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  predictionId: string
): Promise<void> {
  try {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return;

    const body = await validateBody(req, res, UpdatePredictionActualsSchema);
    if (!body) return;

    if (body.userId && body.userId !== userId) {
      sendError(res, API_ERRORS.PREDICTION_NOT_YOURS, 403);
      return;
    }

    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();
    const result = await store.updatePredictionActuals(userId, predictionId, body.actuals);

    if (result === 'no-matching-metric') {
      sendError(res, API_ERRORS.PREDICTION_METRIC_MISMATCH, 400);
      return;
    }
    if (!result) {
      sendError(res, API_ERRORS.PREDICTION_NOT_FOUND, 404);
      return;
    }

    sendJSON(res, result);
  } catch (err) {
    log.error({ error: err, predictionId }, 'Failed to update prediction');
    sendError(res, API_ERRORS.PREDICTION_UPDATE_FAILED, 500);
  }
}

/**
 * Route handler for predictions endpoints
 */
export async function handlePredictionsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/api/predictions' && req.method === 'GET') {
    await handleGetPredictions(req, res, parsedUrl);
    return true;
  }

  const actualsMatch = pathname.match(/^\/api\/predictions\/([^/]+)\/actuals$/);
  if (actualsMatch && req.method === 'POST') {
    await handleUpdatePredictionActuals(req, res, parsedUrl, actualsMatch[1]);
    return true;
  }

  return false;
}
