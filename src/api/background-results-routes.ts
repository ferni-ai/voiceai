/**
 * Background Results API Routes
 *
 * Endpoints for managing background agent task results ("While You Were Away").
 *
 * Routes:
 * - GET /api/background-results/pending - Get pending results for a user
 * - POST /api/background-results/mark-delivered - Mark results as delivered
 * - GET /api/background-results/history - Get result history
 *
 * SECURITY: requireAuth; userId bound to auth.userId.
 *
 * @module BackgroundResultsRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { parseRequestBody, sendJsonResponse } from './helpers.js';

const log = createLogger({ module: 'BackgroundResultsRoutes' });

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle background results API routes
 */
export async function handleBackgroundResultsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/background-results/* routes
  if (!pathname.startsWith('/api/background-results')) {
    return false;
  }

  const auth = await requireAuth(req, res);
  if (!auth) return true;

  const method = req.method?.toUpperCase();

  try {
    // GET /api/background-results/pending
    if (pathname === '/api/background-results/pending' && method === 'GET') {
      const requestedUserId = parsedUrl.searchParams.get('userId');
      if (requestedUserId && requestedUserId !== auth.userId && !auth.isAdmin) {
        sendJsonResponse(res, 403, { error: 'Forbidden' });
        return true;
      }

      const userId =
        auth.isAdmin && requestedUserId ? requestedUserId : auth.userId;
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);

      log.info({ userId, limit }, 'Fetching pending background results');

      const { getPendingResults, buildPendingResultsContext } =
        await import('../services/background-agents/unified-result-capture.js');

      const results = await getPendingResults(userId, { limit });
      const contextMessage = await buildPendingResultsContext(userId);

      sendJsonResponse(res, 200, {
        success: true,
        results,
        count: results.length,
        contextMessage, // Pre-built "While You Were Away" message for UI
      });
      return true;
    }

    // POST /api/background-results/mark-delivered
    if (pathname === '/api/background-results/mark-delivered' && method === 'POST') {
      const body = await parseRequestBody<{
        userId?: string;
        resultIds: string[];
        deliveryMethod?: 'voice' | 'push' | 'email' | 'sms';
      }>(req);

      if (!body.resultIds || body.resultIds.length === 0) {
        sendJsonResponse(res, 400, { error: 'resultIds are required' });
        return true;
      }

      if (body.userId && body.userId !== auth.userId && !auth.isAdmin) {
        sendJsonResponse(res, 403, { error: 'Forbidden' });
        return true;
      }

      const userId = auth.isAdmin && body.userId ? body.userId : auth.userId;

      log.info({ userId, resultIds: body.resultIds }, 'Marking results as delivered');

      const { markResultsDelivered } =
        await import('../services/background-agents/unified-result-capture.js');

      await markResultsDelivered(userId, body.resultIds, body.deliveryMethod);

      sendJsonResponse(res, 200, {
        success: true,
        markedCount: body.resultIds.length,
      });
      return true;
    }

    // GET /api/background-results/history
    if (pathname === '/api/background-results/history' && method === 'GET') {
      const requestedUserId = parsedUrl.searchParams.get('userId');
      if (requestedUserId && requestedUserId !== auth.userId && !auth.isAdmin) {
        sendJsonResponse(res, 403, { error: 'Forbidden' });
        return true;
      }

      const userId =
        auth.isAdmin && requestedUserId ? requestedUserId : auth.userId;
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
      const type = parsedUrl.searchParams.get('type') || undefined;

      log.info({ userId, limit, type }, 'Fetching background results history');

      const { getResultHistory } =
        await import('../services/background-agents/unified-result-capture.js');

      const results = await getResultHistory(userId, limit, type);

      sendJsonResponse(res, 200, {
        success: true,
        results,
        count: results.length,
      });
      return true;
    }

    // Not a background results route we handle
    return false;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Error handling background results route');
    sendJsonResponse(res, 500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return true;
  }
}

export default handleBackgroundResultsRoutes;
