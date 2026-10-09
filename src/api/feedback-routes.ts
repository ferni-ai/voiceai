/**
 * Feedback API Routes
 *
 * REST API endpoints for the contextual feedback system:
 * - POST /api/feedback - Record a feedback reaction
 * - GET /api/feedback/user/:userId - Get user's feedback history
 * - GET /api/feedback/insights/:userId - Get aggregated insights
 * - GET /api/feedback/stats/:userId - Get feedback statistics
 *
 * @module api/feedback-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  calculateUserFeedbackStats,
  getPersonaFeedback,
  getRecentFeedback,
  getSessionFeedback,
  recordFeedbackReaction,
} from '../services/feedback/conversation-feedback-store.js';
import { generateFeedbackInsights } from '../services/feedback/feedback-insights.js';
import type { FeedbackReaction } from '../services/feedback/types.js';
import { createLogger } from '../utils/safe-logger.js';
import { resolveActingUser } from './acting-user.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'FeedbackRoutes' });

// ============================================================================
// HTTP HANDLER (for use with raw Node.js HTTP server)
// ============================================================================

/**
 * Check if a pathname is a feedback route
 */
export function isFeedbackRoute(pathname: string): boolean {
  return pathname.startsWith('/api/feedback');
}

/**
 * Handle feedback routes (for raw HTTP server integration)
 */
export async function handleFeedbackRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const { pathname } = url;

  // Early bailout if not a feedback route
  if (!isFeedbackRoute(pathname)) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  try {
    // POST /api/feedback - Record a reaction
    if (pathname === '/api/feedback' && req.method === 'POST') {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const { feedbackId, reaction } = body;
      // Only the verified caller (or an admin) may react for a user: the body's userId is a claim.
      const userId = await resolveActingUser(req, res, body.userId);
      if (!userId) return true;

      if (!feedbackId || !reaction) {
        sendError(res, 'Missing required fields: feedbackId, reaction', 400);
        return true;
      }

      const result = await recordFeedbackReaction({
        feedbackId: feedbackId as string,
        userId: userId as string,
        reaction: reaction as FeedbackReaction,
      });

      if (!result.ok) {
        sendError(res, result.reason, 400);
        return true;
      }

      log.info({ feedbackId, userId, reaction }, 'Feedback reaction recorded via API');
      sendJSON(res, { ok: true });
      return true;
    }

    // GET routes below name the user in the path, which central identity binding
    // (request-identity.ts) cannot see: each checks the verified caller itself.
    // GET /api/feedback/user/:userId - Get user's feedback history
    const userMatch = pathname.match(/^\/api\/feedback\/user\/([^/]+)$/);
    if (userMatch && req.method === 'GET') {
      const userId = await resolveActingUser(req, res, userMatch[1]);
      if (!userId) return true;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const sessionId = url.searchParams.get('sessionId') || undefined;
      const personaId = url.searchParams.get('personaId') || undefined;

      let feedback;
      if (sessionId) {
        feedback = await getSessionFeedback(userId, sessionId);
      } else if (personaId) {
        feedback = await getPersonaFeedback(userId, personaId, Math.min(limit, 200));
      } else {
        feedback = await getRecentFeedback(userId, Math.min(limit, 200));
      }

      sendJSON(res, { ok: true, data: feedback, count: feedback.length });
      return true;
    }

    // GET /api/feedback/insights/:userId - Get aggregated insights
    const insightsMatch = pathname.match(/^\/api\/feedback\/insights\/([^/]+)$/);
    if (insightsMatch && req.method === 'GET') {
      const userId = await resolveActingUser(req, res, insightsMatch[1]);
      if (!userId) return true;
      const insights = await generateFeedbackInsights(userId);

      sendJSON(res, {
        ok: true,
        data: insights,
        message: insights ? undefined : 'Insufficient feedback for insights',
      });
      return true;
    }

    // GET /api/feedback/stats/:userId - Get feedback statistics
    const statsMatch = pathname.match(/^\/api\/feedback\/stats\/([^/]+)$/);
    if (statsMatch && req.method === 'GET') {
      const userId = await resolveActingUser(req, res, statsMatch[1]);
      if (!userId) return true;
      const stats = await calculateUserFeedbackStats(userId);

      sendJSON(res, {
        ok: true,
        data: stats,
        message: stats ? undefined : 'No feedback data found',
      });
      return true;
    }

    // Not handled
    return false;
  } catch (error) {
    log.error({ error }, 'Error handling feedback route');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}
