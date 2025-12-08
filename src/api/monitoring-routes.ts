/**
 * Monitoring API Routes
 *
 * API for monitoring dashboard and health checks.
 *
 * @module MonitoringRoutes
 */

import { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';

import {
  getHealthStatus,
  getDashboardData,
  getActiveAlerts,
  acknowledgeAlert,
  getAllSystemMetrics,
  getRecentMetrics,
  checkAlerts,
} from '../services/trust-systems/monitoring.js';

const log = createLogger({ module: 'MonitoringRoutes' });

// ============================================================================
// UTILITIES
// ============================================================================

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
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
  const method = req.method || 'GET';
  const query = parsedUrl.searchParams;

  try {
    // ========================================================================
    // HEALTH CHECK
    // ========================================================================

    if (pathname === '/api/monitoring/health' && method === 'GET') {
      const health = getHealthStatus();
      const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      sendJson(res, status, health);
      return true;
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
      const body = await parseBody(req);
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

