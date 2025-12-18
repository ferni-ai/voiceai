/**
 * Monitoring API Routes
 *
 * API for monitoring dashboard and health checks.
 *
 * @module MonitoringRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON } from './helpers.js';

import {
  acknowledgeAlert,
  checkAlerts,
  getActiveAlerts,
  getAllSystemMetrics,
  getDashboardData,
  getHealthStatus,
  getRecentMetrics,
} from '../services/trust-systems/monitoring.js';

const log = createLogger({ module: 'MonitoringRoutes' });

// ============================================================================
// UTILITIES
// ============================================================================

// parseBody and sendJSON imported from './helpers.js'

/**
 * Legacy wrapper for sendJSON with (res, status, data) signature.
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleMonitoringRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method || 'GET';
  const query = parsedUrl.searchParams;

  try {
    // ========================================================================
    // HEALTH CHECK (public - for load balancers)
    // ========================================================================

    if (pathname === '/api/monitoring/health' && method === 'GET') {
      const health = getHealthStatus();
      const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      sendJson(res, status, health);
      return true;
    }

    // ========================================================================
    // AUTH REQUIRED FOR ALL OTHER ROUTES
    // ========================================================================

    // Apply rate limiting
    if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
      return true;
    }

    // Require authentication for monitoring data
    const auth = await requireAuth(req, res, { allowDevMode: true });
    if (!auth) {
      return true; // 401 already sent
    }

    // ========================================================================
    // DASHBOARD DATA
    // ========================================================================

    if (pathname === '/api/monitoring/dashboard' && method === 'GET') {
      const data = getDashboardData();
      sendJson(res, 200, data);
      return true;
    }

    // ========================================================================
    // METRICS
    // ========================================================================

    if (pathname === '/api/monitoring/metrics' && method === 'GET') {
      const metrics = getAllSystemMetrics();
      sendJson(res, 200, { metrics });
      return true;
    }

    if (pathname === '/api/monitoring/metrics/recent' && method === 'GET') {
      const windowMs = parseInt(query.get('window') || '60000');
      const metric = query.get('metric') || undefined;
      const system = query.get('system') || undefined;

      const recent = getRecentMetrics(windowMs, { metric, system });
      sendJson(res, 200, { metrics: recent, windowMs });
      return true;
    }

    // ========================================================================
    // ALERTS
    // ========================================================================

    if (pathname === '/api/monitoring/alerts' && method === 'GET') {
      const alerts = getActiveAlerts();
      sendJson(res, 200, { alerts, count: alerts.length });
      return true;
    }

    if (pathname === '/api/monitoring/alerts/check' && method === 'POST') {
      const newAlerts = checkAlerts();
      sendJson(res, 200, { newAlerts, count: newAlerts.length });
      return true;
    }

    if (pathname === '/api/monitoring/alerts/acknowledge' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const alertId = body.alertId as string;

      if (!alertId) {
        sendJson(res, 400, { error: 'alertId required' });
        return true;
      }

      const success = acknowledgeAlert(alertId);

      if (success) {
        sendJson(res, 200, { acknowledged: true, alertId });
      } else {
        sendJson(res, 404, { error: 'Alert not found' });
      }
      return true;
    }

    // Not handled
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Monitoring route error');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  handleMonitoringRoutes,
};
