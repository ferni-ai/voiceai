/**
 * Debug API Routes
 *
 * Development-only endpoints for debugging and monitoring.
 *
 * Endpoints:
 * - GET /api/debug/triggers - Get trigger analytics for the debug panel
 * - POST /api/debug/triggers/reset - Reset trigger analytics
 * - GET /api/debug/context - Get all active session contexts (summary)
 * - GET /api/debug/context/:sessionId - Get context history for a session
 * - GET /api/debug/context/summary - Get aggregated context statistics
 * - DELETE /api/debug/context - Clear all context history
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getTriggerAnalytics,
  resetTriggerAnalytics,
} from '../intelligence/context-builders/dynamic-trigger-utils.js';
import {
  getAllSessionContexts,
  getSessionContext,
  getContextSummary,
  clearAllContexts,
} from '../services/context-inspection.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAdmin } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendJSON, sendError } from './helpers.js';

const log = createLogger({ module: 'DebugAPI' });

/**
 * Handle debug routes
 */
export async function handleDebugRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/debug/* routes
  if (!pathname.startsWith('/api/debug')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // SECURITY: Admin auth required (replaces spoofable X-Dev-Mode header)
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  try {
    // GET /api/debug/triggers - Get trigger analytics
    if (pathname === '/api/debug/triggers' && req.method === 'GET') {
      const analytics = getTriggerAnalytics();

      // Convert timestamps to ISO strings for JSON serialization
      const serializedAnalytics = {
        ...analytics,
        recentActivations: analytics.recentActivations.map((a) => ({
          ...a,
          timestamp: a.timestamp.toISOString(),
        })),
      };

      sendJSON(res, serializedAnalytics);
      log.debug('Trigger analytics fetched');
      return true;
    }

    // POST /api/debug/triggers/reset - Reset trigger analytics
    if (pathname === '/api/debug/triggers/reset' && req.method === 'POST') {
      resetTriggerAnalytics();
      sendJSON(res, { success: true, message: 'Trigger analytics reset' });
      log.info('Trigger analytics reset');
      return true;
    }

    // =========================================================================
    // CONTEXT INSPECTION ENDPOINTS
    // =========================================================================

    // GET /api/debug/context/summary - Get aggregated statistics
    if (pathname === '/api/debug/context/summary' && req.method === 'GET') {
      const summary = getContextSummary();
      sendJSON(res, summary);
      log.debug('Context summary fetched');
      return true;
    }

    // GET /api/debug/context/:sessionId - Get context history for specific session
    const sessionMatch = pathname.match(/^\/api\/debug\/context\/([^/]+)$/);
    if (sessionMatch && req.method === 'GET') {
      const sessionId = sessionMatch[1];
      const history = getSessionContext(sessionId);
      if (history) {
        sendJSON(res, {
          sessionId,
          turnCount: history.length,
          history,
        });
      } else {
        sendJSON(res, {
          sessionId,
          turnCount: 0,
          history: [],
          message: 'No context history found for this session',
        });
      }
      log.debug({ sessionId }, 'Session context fetched');
      return true;
    }

    // GET /api/debug/context - Get all active session contexts
    if (pathname === '/api/debug/context' && req.method === 'GET') {
      const allContexts = getAllSessionContexts();
      const sessions = Array.from(allContexts.entries()).map(([sessionId, data]) => ({
        sessionId,
        userId: data.userId,
        personaId: data.personaId,
        lastTurn: data.turnNumber,
        lastTimestamp: data.timestamp,
        injectionCount: data.totalInjections,
        characterCount: data.totalCharacters,
        warningCount: data.warnings.length,
        warnings: data.warnings,
        userProfileStatus: data.userProfileStatus,
      }));

      sendJSON(res, {
        activeSessions: sessions.length,
        sessions,
        summary: getContextSummary(),
      });
      log.debug('All contexts fetched');
      return true;
    }

    // DELETE /api/debug/context - Clear all context history
    if (pathname === '/api/debug/context' && req.method === 'DELETE') {
      clearAllContexts();
      sendJSON(res, { success: true, message: 'All context history cleared' });
      log.info('All context history cleared');
      return true;
    }

    // Unknown debug route
    sendError(res, 'Debug endpoint not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err) }, 'Debug route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}
