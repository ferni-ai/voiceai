/**
 * Debug API Routes
 *
 * Development-only endpoints for debugging and monitoring.
 *
 * Endpoints:
 * - GET /api/debug/triggers - Get trigger analytics for the debug panel
 * - POST /api/debug/triggers/reset - Reset trigger analytics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getTriggerAnalytics, resetTriggerAnalytics } from '../intelligence/context-builders/dynamic-trigger-utils.js';
import { createLogger } from '../utils/safe-logger.js';
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

  // NOTE: In production, these endpoints should be protected with requireAdmin
  // For now, they're open in dev mode only
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) {
    // In production, require dev mode header or admin auth
    const devHeader = req.headers['x-dev-mode'];
    if (devHeader !== 'true') {
      sendError(res, 'Debug endpoints only available in dev mode', 403);
      return true;
    }
  }

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

    // Unknown debug route
    sendError(res, 'Debug endpoint not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err) }, 'Debug route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}
