/**
 * User Analytics API Routes
 *
 * Endpoints for business metrics and user activity tracking.
 * Uses raw http.IncomingMessage pattern for compatibility with ui-server.js
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getAnalyticsSummary,
  getCurrentConcurrent,
  initializeAnalytics,
} from '../services/user-analytics.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'user-analytics-routes' });

// Initialize analytics on module load
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    try {
      await initializeAnalytics();
      initialized = true;
    } catch (error) {
      log.warn({ error }, 'Failed to initialize analytics');
    }
  }
}

/**
 * Check if a pathname is an analytics route
 */
export function isAnalyticsRoute(pathname: string): boolean {
  return pathname.startsWith('/api/analytics');
}

/**
 * Handle analytics API requests
 * Returns true if handled, false if not an analytics route
 */
export async function handleAnalyticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!isAnalyticsRoute(pathname)) {
    return false;
  }

  // Ensure analytics is initialized
  await ensureInitialized();

  // GET /api/analytics/summary - Full analytics summary for dashboard
  if (pathname === '/api/analytics/summary' && req.method === 'GET') {
    try {
      const summary = await getAnalyticsSummary();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: summary,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error) {
      log.error({ error }, 'Failed to get analytics summary');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: 'Failed to get analytics',
        })
      );
    }
    return true;
  }

  // GET /api/analytics/concurrent - Lightweight endpoint for polling
  if (pathname === '/api/analytics/concurrent' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        concurrent: getCurrentConcurrent(),
        timestamp: new Date().toISOString(),
      })
    );
    return true;
  }

  // GET /api/analytics/health - Health check for analytics service
  if (pathname === '/api/analytics/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'user-analytics',
        initialized,
        timestamp: new Date().toISOString(),
      })
    );
    return true;
  }

  // Unknown analytics route
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Analytics endpoint not found' }));
  return true;
}
