/**
 * Concierge API Routes
 *
 * Handles API endpoints for the AI Concierge feature: status queries and
 * cancels for the signed-in user's own requests. Every route needs auth.
 *
 * There are no concierge webhooks. The unsigned call-status / sms-reply /
 * email-reply handlers were removed: no provider was pointed at them (concierge
 * calls and texts are simulated, and email replies go to the user's own inbox),
 * and anyone could forge a business reply through them.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth, rateLimit } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendJSON, sendError } from './helpers.js';
import { getTaskTracker } from '../services/concierge/index.js';

const log = createLogger({ module: 'concierge-routes' });

// ============================================================================
// MAIN ROUTER
// ============================================================================

export async function handleConciergeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle concierge routes
  if (!pathname.startsWith('/api/concierge')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  try {
    // Rate limiting
    if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
      return true;
    }

    // Authentication required for user endpoints
    const auth = await requireAuth(req, res);
    if (!auth) return true;

    // GET /api/concierge/requests - List user's requests
    if (pathname === '/api/concierge/requests' && req.method === 'GET') {
      return await handleListRequests(req, res, auth.userId);
    }

    // GET /api/concierge/requests/:id - Get specific request
    const requestMatch = pathname.match(/^\/api\/concierge\/requests\/([^/]+)$/);
    if (requestMatch && req.method === 'GET') {
      return await handleGetRequest(req, res, auth.userId, requestMatch[1]);
    }

    // POST /api/concierge/requests/:id/cancel - Cancel a request
    const cancelMatch = pathname.match(/^\/api\/concierge\/requests\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
      return await handleCancelRequest(req, res, auth.userId, cancelMatch[1]);
    }

    // Not found
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Concierge route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

// ============================================================================
// USER ENDPOINTS
// ============================================================================

async function handleListRequests(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  try {
    const tracker = getTaskTracker();
    const requests = await tracker.getUserRequests(userId);

    // Map to API response format
    const response = requests.map((req) => ({
      id: req.id,
      domain: req.domain,
      type: req.type,
      description: req.description,
      status: req.status,
      statusMessage: req.statusMessage,
      targetCount: req.targets.length,
      completedCount: req.results.length,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      hasRecommendation: !!req.recommendation,
    }));

    sendJSON(res, { requests: response });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to list requests');
    sendError(res, 'Failed to list requests', 500);
    return true;
  }
}

async function handleGetRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  requestId: string
): Promise<boolean> {
  try {
    const tracker = getTaskTracker();
    const request = await tracker.getRequest(requestId);

    if (!request) {
      sendError(res, 'Request not found', 404);
      return true;
    }

    // Verify user owns this request
    if (request.userId !== userId) {
      sendError(res, 'Not authorized', 403);
      return true;
    }

    // Return full request with details
    sendJSON(res, {
      request: {
        id: request.id,
        domain: request.domain,
        type: request.type,
        description: request.description,
        status: request.status,
        statusMessage: request.statusMessage,
        requirements: request.requirements,
        targets: request.targets.map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          attempts: t.attempts,
          lastAttemptAt: t.lastAttemptAt,
        })),
        results: request.results,
        recommendation: request.recommendation,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        completedAt: request.completedAt,
      },
    });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, requestId }, 'Failed to get request');
    sendError(res, 'Failed to get request', 500);
    return true;
  }
}

async function handleCancelRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  requestId: string
): Promise<boolean> {
  try {
    const tracker = getTaskTracker();
    const request = await tracker.getRequest(requestId);

    if (!request) {
      sendError(res, 'Request not found', 404);
      return true;
    }

    // Verify user owns this request
    if (request.userId !== userId) {
      sendError(res, 'Not authorized', 403);
      return true;
    }

    // Check if cancellable
    if (request.status === 'completed' || request.status === 'cancelled') {
      sendError(res, 'Request already finished', 400);
      return true;
    }

    // Cancel the request
    await tracker.updateStatus(requestId, 'cancelled', 'Cancelled by user');

    sendJSON(res, { success: true, message: 'Request cancelled' });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, requestId }, 'Failed to cancel request');
    sendError(res, 'Failed to cancel request', 500);
    return true;
  }
}
