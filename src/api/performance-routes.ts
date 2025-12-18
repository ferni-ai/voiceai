/**
 * Performance Monitoring API Routes
 *
 * Exposes performance metrics, memory usage, and alerts.
 *
 * Routes:
 * - GET  /api/performance              - Full performance report
 * - GET  /api/performance/summary      - Quick summary
 * - GET  /api/performance/memory       - Current memory usage
 * - GET  /api/performance/alerts       - Active memory alerts
 * - POST /api/performance/alerts/:id/acknowledge - Acknowledge an alert
 * - POST /api/performance/config       - Update alert thresholds
 * - GET  /api/performance/tools        - Tool loading metrics
 *
 * @module PerformanceRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';
import { perfInstrumentation } from '../services/performance-instrumentation.js';
import { getLoadedDomains, isDomainLoaded } from '../tools/index.js';

const log = createLogger({ module: 'PerformanceRoutes' });

// Base path for these routes
const BASE_PATH = '/api/performance';

// ============================================================================
// UTILITIES
// ============================================================================

// parseBody imported from './helpers.js'

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle all performance monitoring routes
 * @returns true if the request was handled
 */
export async function handlePerformanceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Only handle /api/performance routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // All performance routes require auth (allow dev mode)
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  // Get the path after the base path
  const subPath = pathname.slice(BASE_PATH.length) || '/';

  try {
    // ========================================================================
    // FULL PERFORMANCE REPORT
    // ========================================================================
    if ((subPath === '/' || subPath === '/report') && method === 'GET') {
      const report = perfInstrumentation.getReport();
      sendJSON(res, {
        ...report,
        toolDomains: {
          loaded: getLoadedDomains(),
          count: getLoadedDomains().length,
        },
      });
      return true;
    }

    // ========================================================================
    // QUICK SUMMARY
    // ========================================================================
    if (subPath === '/summary' && method === 'GET') {
      const summary = perfInstrumentation.getSummary();
      sendJSON(res, {
        ...summary,
        loadedDomains: getLoadedDomains(),
      });
      return true;
    }

    // ========================================================================
    // CURRENT MEMORY
    // ========================================================================
    if (subPath === '/memory' && method === 'GET') {
      const memory = perfInstrumentation.getCurrentMemory();
      const config = perfInstrumentation.getAlertConfig();
      sendJSON(res, {
        current: memory,
        thresholds: {
          warningMB: config.warningThresholdMB,
          criticalMB: config.criticalThresholdMB,
        },
        status:
          memory.heapUsedMB >= config.criticalThresholdMB
            ? 'critical'
            : memory.heapUsedMB >= config.warningThresholdMB
              ? 'warning'
              : 'healthy',
      });
      return true;
    }

    // ========================================================================
    // MEMORY ALERTS
    // ========================================================================
    if (subPath === '/alerts' && method === 'GET') {
      const alerts = perfInstrumentation.getAlerts();
      const activeAlerts = perfInstrumentation.getActiveAlerts();
      sendJSON(res, {
        alerts,
        activeCount: activeAlerts.length,
        totalCount: alerts.length,
      });
      return true;
    }

    // ========================================================================
    // ACKNOWLEDGE ALERT
    // ========================================================================
    if (subPath.startsWith('/alerts/') && subPath.endsWith('/acknowledge') && method === 'POST') {
      const alertId = subPath.replace('/alerts/', '').replace('/acknowledge', '');
      const success = perfInstrumentation.acknowledgeAlert(alertId);

      if (success) {
        sendJSON(res, { acknowledged: true, alertId });
      } else {
        sendError(res, 'Alert not found', 404);
      }
      return true;
    }

    // ========================================================================
    // UPDATE ALERT CONFIG
    // ========================================================================
    if (subPath === '/config' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);

      const config: Record<string, unknown> = {};
      if (typeof body.warningThresholdMB === 'number') {
        config.warningThresholdMB = body.warningThresholdMB;
      }
      if (typeof body.criticalThresholdMB === 'number') {
        config.criticalThresholdMB = body.criticalThresholdMB;
      }
      if (typeof body.checkIntervalMs === 'number') {
        config.checkIntervalMs = body.checkIntervalMs;
      }
      if (typeof body.enableAutoCheck === 'boolean') {
        config.enableAutoCheck = body.enableAutoCheck;

        // Start/stop auto monitoring based on setting
        if (body.enableAutoCheck) {
          perfInstrumentation.startAutoMonitoring();
        } else {
          perfInstrumentation.stopAutoMonitoring();
        }
      }

      perfInstrumentation.configureAlerts(config);

      sendJSON(res, {
        updated: true,
        config: perfInstrumentation.getAlertConfig(),
      });
      return true;
    }

    // ========================================================================
    // TOOL LOADING METRICS
    // ========================================================================
    if (subPath === '/tools' && method === 'GET') {
      const report = perfInstrumentation.getReport();
      sendJSON(res, {
        ...report.toolLoading,
        loadedDomains: getLoadedDomains(),
      });
      return true;
    }

    // ========================================================================
    // CHECK DOMAIN STATUS
    // ========================================================================
    if (subPath.startsWith('/tools/domain/') && method === 'GET') {
      const domain = subPath.replace('/tools/domain/', '');
      sendJSON(res, {
        domain,
        loaded: isDomainLoaded(domain as never),
      });
      return true;
    }

    // ========================================================================
    // PHASES (timing data)
    // ========================================================================
    if (subPath === '/phases' && method === 'GET') {
      const report = perfInstrumentation.getReport();
      sendJSON(res, {
        phases: report.phases,
        criticalPath: report.summary.criticalPath,
        slowestPhases: report.summary.slowestPhases,
      });
      return true;
    }

    // ========================================================================
    // SNAPSHOT MEMORY (trigger a new snapshot)
    // ========================================================================
    if (subPath === '/snapshot' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const label = (body.label as string) || `api-snapshot-${Date.now()}`;
      const snapshot = perfInstrumentation.snapshotMemory(label);
      sendJSON(res, { snapshot });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Performance API error');
    sendError(res, 'Internal server error');
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { handlePerformanceRoutes };
