/**
 * User Analytics API Routes
 *
 * Endpoints for business metrics and user activity tracking.
 */

import type { Express, Request, Response } from 'express';
import { getLogger } from '../utils/safe-logger.js';
import {
  getAnalyticsSummary,
  getCurrentConcurrent,
  initializeAnalytics,
} from '../services/user-analytics.js';

const log = getLogger().child({ module: 'user-analytics-routes' });

export function registerUserAnalyticsRoutes(app: Express): void {
  // Initialize analytics on startup
  initializeAnalytics().catch((error) => {
    log.warn({ error }, 'Failed to initialize analytics');
  });

  /**
   * GET /api/analytics/summary
   * Get full analytics summary for dashboard
   */
  app.get('/api/analytics/summary', (_req: Request, res: Response): void => {
    void (async () => {
      try {
        const summary = await getAnalyticsSummary();
        res.json({
          success: true,
          data: summary,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        log.error({ error }, 'Failed to get analytics summary');
        res.status(500).json({
          success: false,
          error: 'Failed to get analytics',
        });
      }
    })();
  });

  /**
   * GET /api/analytics/concurrent
   * Get current concurrent users (lightweight endpoint for polling)
   */
  app.get('/api/analytics/concurrent', (_req: Request, res: Response) => {
    res.json({
      concurrent: getCurrentConcurrent(),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /api/analytics/health
   * Health check for analytics service
   */
  app.get('/api/analytics/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'user-analytics',
      timestamp: new Date().toISOString(),
    });
  });

  log.info('✅ User analytics routes registered');
}
