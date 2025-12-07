/**
 * Predictions Routes
 *
 * GET /api/predictions - Get user predictions
 * POST /api/predictions/:id/actuals - Update prediction with actual values
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached, sendError } from '../helpers.js';
import { validateBody, UpdatePredictionActualsSchema } from '../validators.js';
import { API_ERRORS } from '../error-messages.js';
import type { AnyRecord } from './types.js';

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

    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();
    let predictions = (await store.getRecentPredictions(userId, limit)) as unknown as AnyRecord[];
    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;

    // Auto-expire old predictions
    const EXPIRY_DAYS = 7;
    const expiryThreshold = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    predictions = predictions.map((p) => {
      if (!p.completedAt && new Date(p.createdAt as string).getTime() < expiryThreshold) {
        return { ...p, status: 'expired', expiredAt: new Date().toISOString() };
      }
      return p;
    });

    const validPredictions = predictions.filter((p) => p.status !== 'expired');
    const completedPredictions = validPredictions.filter((p) => p.accuracy !== undefined);
    const avgAccuracy =
      completedPredictions.length > 0
        ? Math.round(
            completedPredictions.reduce((sum, p) => sum + ((p.accuracy as number) || 0), 0) /
              completedPredictions.length
          )
        : ((profile.stats as AnyRecord)?.predictionAccuracy as number) || 0;

    sendJSONCached(res, {
      predictions,
      stats: {
        totalPredictions: ((profile.stats as AnyRecord)?.totalPredictions as number) || 0,
        averageAccuracy: avgAccuracy,
        pendingCount: validPredictions.filter((p) => !p.completedAt).length,
        expiredCount: predictions.filter((p) => p.status === 'expired').length,
      },
    }, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get predictions');
    sendError(res, API_ERRORS.PREDICTIONS_FETCH_FAILED, 500);
  }
}

/**
 * POST /api/predictions/:id/actuals - Update prediction with actual values
 */
export async function handleUpdatePredictionActuals(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  predictionId: string
): Promise<void> {
  try {
    const body = await validateBody(req, res, UpdatePredictionActualsSchema);
    if (!body) return;

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();
    const result = await store.updatePredictionActuals(userId, predictionId, body.actuals);

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
