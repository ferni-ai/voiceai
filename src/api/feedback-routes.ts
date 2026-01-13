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

import express from 'express';
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
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'FeedbackRoutes' });
const router = express.Router();

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
      const { feedbackId, userId, reaction } = body;

      if (!feedbackId || !userId || !reaction) {
        sendError(res, 'Missing required fields: feedbackId, userId, reaction', 400);
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

    // GET /api/feedback/user/:userId - Get user's feedback history
    const userMatch = pathname.match(/^\/api\/feedback\/user\/([^/]+)$/);
    if (userMatch && req.method === 'GET') {
      const userId = userMatch[1];
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
      const userId = insightsMatch[1];
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
      const userId = statsMatch[1];
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

// ============================================================================
// EXPRESS ROUTER (for use with Express app)
// ============================================================================

// ============================================================================
// POST /api/feedback - Record a feedback reaction
// ============================================================================

/**
 * Record a user's reaction to a feedback prompt.
 *
 * Request body:
 * {
 *   feedbackId: string,
 *   userId: string,
 *   reaction: 'resonated' | 'helpful' | 'too_much' | 'off_track' | 'skipped'
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { feedbackId, userId, reaction } = req.body as {
      feedbackId?: string;
      userId?: string;
      reaction?: FeedbackReaction;
    };

    if (!feedbackId || !userId || !reaction) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: feedbackId, userId, reaction',
      });
    }

    const result = await recordFeedbackReaction({
      feedbackId,
      userId,
      reaction,
    });

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.reason,
      });
    }

    log.info({ feedbackId, userId, reaction }, 'Feedback reaction recorded via API');

    return res.json({ ok: true });
  } catch (error) {
    log.error({ error }, 'Error recording feedback reaction');
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// GET /api/feedback/user/:userId - Get user's feedback history
// ============================================================================

/**
 * Get recent feedback for a user.
 *
 * Query params:
 * - limit: number (default 50, max 200)
 * - sessionId: string (optional, filter by session)
 * - personaId: string (optional, filter by persona)
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      limit = '50',
      sessionId,
      personaId,
    } = req.query as {
      limit?: string;
      sessionId?: string;
      personaId?: string;
    };

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing userId parameter',
      });
    }

    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    let feedback;

    if (sessionId) {
      feedback = await getSessionFeedback(userId, sessionId);
    } else if (personaId) {
      feedback = await getPersonaFeedback(userId, personaId, limitNum);
    } else {
      feedback = await getRecentFeedback(userId, limitNum);
    }

    return res.json({
      ok: true,
      data: feedback,
      count: feedback.length,
    });
  } catch (error) {
    log.error({ error }, 'Error getting user feedback');
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// GET /api/feedback/insights/:userId - Get aggregated insights
// ============================================================================

/**
 * Get feedback insights for a user.
 *
 * Returns derived insights like:
 * - Per-persona resonance rates
 * - Topics that land well vs. fall flat
 * - Preferred conversation depth
 * - Time-of-day engagement patterns
 */
router.get('/insights/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing userId parameter',
      });
    }

    const insights = await generateFeedbackInsights(userId);

    if (!insights) {
      return res.json({
        ok: true,
        data: null,
        message: 'Insufficient feedback for insights (minimum 5 responses needed)',
      });
    }

    return res.json({
      ok: true,
      data: insights,
    });
  } catch (error) {
    log.error({ error }, 'Error getting feedback insights');
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// GET /api/feedback/stats/:userId - Get feedback statistics
// ============================================================================

/**
 * Get aggregated feedback statistics for a user.
 *
 * Returns raw stats like:
 * - Total prompts/responses
 * - Response rate
 * - Breakdown by reaction type
 * - Stats by persona and trigger
 */
router.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing userId parameter',
      });
    }

    const stats = await calculateUserFeedbackStats(userId);

    if (!stats) {
      return res.json({
        ok: true,
        data: null,
        message: 'No feedback data found for user',
      });
    }

    return res.json({
      ok: true,
      data: stats,
    });
  } catch (error) {
    log.error({ error }, 'Error getting feedback stats');
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// GET /api/feedback/persona/:personaId - Get persona-level metrics
// ============================================================================

/**
 * Get feedback metrics across all users for a specific persona.
 * Useful for product analytics and persona improvement.
 *
 * Note: This endpoint would typically require admin auth.
 */
router.get('/persona/:personaId', async (req, res) => {
  try {
    const { personaId } = req.params;

    if (!personaId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing personaId parameter',
      });
    }

    // For now, return a placeholder - full implementation would
    // aggregate across all users in Firestore
    return res.json({
      ok: true,
      data: {
        personaId,
        message: 'Persona-level analytics not yet implemented',
        // Future: aggregate metrics across all users
      },
    });
  } catch (error) {
    log.error({ error }, 'Error getting persona feedback');
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

export default router;
