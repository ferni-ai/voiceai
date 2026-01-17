/**
 * Proactive Tool Suggestions API Routes
 *
 * Endpoints for proactive tool suggestions - anticipating user needs.
 *
 * Endpoints:
 * - GET /api/proactive/suggestions - Get proactive suggestions for user
 * - POST /api/proactive/feedback - Record acceptance/rejection of suggestion
 * - GET /api/proactive/stats - Get proactive suggestion statistics
 *
 * @module api/proactive-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth, rateLimit } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError } from './helpers.js';
import {
  getProactiveSuggestions,
  recordProactiveFeedback,
  getProactiveStats,
  type UserContext,
} from '../tools/semantic-router/advanced/proactive-suggestions.js';

const log = createLogger({ module: 'ProactiveAPI' });

/**
 * Handle proactive routes
 */
export async function handleProactiveRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/proactive routes
  if (!pathname.startsWith('/api/proactive')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // Authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  try {
    // GET /api/proactive/suggestions - Get suggestions for user
    if (pathname === '/api/proactive/suggestions' && req.method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const personaId = url.searchParams.get('personaId') || undefined;

      // Build context
      const context: UserContext = {
        userId: auth.userId,
        personaId,
        currentTime: new Date(),
        dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        isWeekend: [0, 6].includes(new Date().getDay()),
      };

      // Get topics from query param if provided
      const topics = url.searchParams.get('topics');
      if (topics) {
        context.conversationTopics = topics.split(',').map((t) => t.trim());
      }

      // Get recent tools from query param if provided
      const recent = url.searchParams.get('recentTools');
      if (recent) {
        context.recentTools = recent.split(',').map((t) => t.trim());
      }

      const suggestions = await getProactiveSuggestions(context);

      sendJSON(res, {
        suggestions,
        generatedAt: new Date().toISOString(),
        context: {
          hour: context.currentTime.getHours(),
          dayOfWeek: context.dayOfWeek,
          isWeekend: context.isWeekend,
        },
      });
      return true;
    }

    // POST /api/proactive/feedback - Record suggestion feedback
    if (pathname === '/api/proactive/feedback' && req.method === 'POST') {
      const body = await parseBody<{
        toolId: string;
        accepted: boolean;
        suggestionId?: string;
      }>(req);

      if (!body.toolId || typeof body.accepted !== 'boolean') {
        sendError(res, 'Missing toolId or accepted field', 400);
        return true;
      }

      recordProactiveFeedback(auth.userId, body.toolId, body.accepted);

      log.debug(
        { userId: auth.userId, toolId: body.toolId, accepted: body.accepted },
        'Recorded proactive feedback'
      );

      sendJSON(res, { success: true });
      return true;
    }

    // GET /api/proactive/stats - Get proactive statistics (admin)
    if (pathname === '/api/proactive/stats' && req.method === 'GET') {
      const stats = getProactiveStats();
      sendJSON(res, stats);
      return true;
    }

    // Unknown route
    sendError(res, 'Unknown proactive endpoint', 404);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ error: err, userId: auth.userId }, 'Proactive API error');
    sendError(res, message, 500);
    return true;
  }
}
