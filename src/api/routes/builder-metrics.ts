/**
 * Builder Metrics Routes
 *
 * Exposes context builder performance metrics for monitoring and optimization.
 *
 * Endpoints:
 * - GET /api/admin/builder-metrics - Full metrics summary
 * - GET /api/admin/builder-metrics/warnings - Performance warnings
 * - GET /api/admin/builder-metrics/session/:sessionId - Session-specific metrics
 *
 * @module api/routes/builder-metrics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { BUILDER_CATEGORIES } from '../../intelligence/context-builders/categories.js';
import { getRegisteredBuilders } from '../../intelligence/context-builders/index.js';
import {
  checkPerformanceIssues,
  getAllBuilderMetrics,
  getMetricsSummary,
  getRecentTurnMetrics,
  getSessionMetrics,
} from '../../intelligence/context-builders/metrics.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJSON, sendJSONCached } from '../helpers.js';

const log = createLogger({ module: 'BuilderMetricsAPI' });

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/admin/builder-metrics
 *
 * Returns full metrics summary including:
 * - Summary statistics (total builds, avg time, etc.)
 * - Per-builder metrics
 * - Recent turn metrics
 * - Performance warnings
 * - Registered builders with categories
 */
export async function handleGetBuilderMetrics(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const summary = getMetricsSummary();
    const allBuilderMetrics = getAllBuilderMetrics();
    const recentTurns = getRecentTurnMetrics(20);
    const warnings = checkPerformanceIssues();
    const registeredBuilders = getRegisteredBuilders();

    // Group builders by category
    const buildersByCategory: Record<string, string[]> = {};
    for (const builder of registeredBuilders) {
      const category = builder.category || 'uncategorized';
      if (!buildersByCategory[category]) {
        buildersByCategory[category] = [];
      }
      buildersByCategory[category].push(builder.name);
    }

    const response = {
      timestamp: new Date().toISOString(),
      summary: {
        totalBuilds: summary.totalBuilds,
        totalBuilders: registeredBuilders.length,
        avgBuildTimeMs: summary.avgBuildTimeMs,
      },
      slowestBuilders: summary.slowestBuilders.slice(0, 10).map((b) => ({
        name: b.name,
        avgMs: b.avgMs,
      })),
      mostActiveBuilders: summary.mostActiveBuilders.slice(0, 10).map((b) => ({
        name: b.name,
        avgInjections: b.avgInjections,
      })),
      buildersByCategory,
      categories: Object.keys(BUILDER_CATEGORIES),
      recentTurns: recentTurns.map((turn) => ({
        sessionId: turn.sessionId,
        turnNumber: turn.turnNumber,
        totalDurationMs: turn.totalDurationMs,
        buildersRan: turn.buildersRan,
        totalInjections: turn.totalInjections,
        timestamp: turn.timestamp,
      })),
      warnings,
      builderMetrics: allBuilderMetrics.map((m) => ({
        name: m.name,
        callCount: m.callCount,
        avgDurationMs: m.avgDurationMs,
        totalDurationMs: m.totalDurationMs,
        injectionsProduced: m.injectionsProduced,
        skipCount: m.skipCount,
        skipRate: m.callCount > 0 ? m.skipCount / m.callCount : 0,
        errorCount: m.errorCount,
        lastCallTimestamp: m.lastCallTimestamp,
      })),
    };

    log.info(
      {
        totalBuilders: registeredBuilders.length,
        totalBuilds: summary.totalBuilds,
        warningCount: warnings.length,
      },
      'Builder metrics requested'
    );

    sendJSONCached(res, response, 10); // Cache for 10 seconds
  } catch (error) {
    log.error({ error }, 'Failed to get builder metrics');
    sendJSON(res, { error: 'Failed to get metrics' }, 500);
  }
}

/**
 * GET /api/admin/builder-metrics/warnings
 *
 * Returns just the performance warnings for quick monitoring.
 */
export async function handleGetBuilderWarnings(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const warnings = checkPerformanceIssues();
    const summary = getMetricsSummary();

    sendJSON(res, {
      timestamp: new Date().toISOString(),
      warningCount: warnings.length,
      warnings,
      healthStatus:
        warnings.length === 0 ? 'healthy' : warnings.length < 3 ? 'warning' : 'critical',
      quickStats: {
        avgBuildTimeMs: summary.avgBuildTimeMs,
        totalBuilds: summary.totalBuilds,
        errorProneBuilderCount: summary.errorProneBuilders.length,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get builder warnings');
    sendJSON(res, { error: 'Failed to get warnings' }, 500);
  }
}

/**
 * GET /api/admin/builder-metrics/session/:sessionId
 *
 * Returns metrics for a specific session.
 */
export async function handleGetSessionBuilderMetrics(
  _req: IncomingMessage,
  res: ServerResponse,
  sessionId: string
): Promise<void> {
  try {
    const sessionMetrics = getSessionMetrics(sessionId);

    if (sessionMetrics.turns.length === 0) {
      sendJSON(res, { error: 'No metrics found for session', sessionId }, 404);
      return;
    }

    sendJSON(res, {
      sessionId,
      timestamp: new Date().toISOString(),
      turnCount: sessionMetrics.turns.length,
      avgDurationMs: sessionMetrics.avgDurationMs,
      totalInjections: sessionMetrics.totalInjections,
      turns: sessionMetrics.turns.map((turn) => ({
        turnNumber: turn.turnNumber,
        totalDurationMs: turn.totalDurationMs,
        buildersRan: turn.buildersRan,
        totalInjections: turn.totalInjections,
        buildersProducedInjections: turn.buildersProducedInjections,
        timestamp: turn.timestamp,
      })),
    });
  } catch (error) {
    log.error({ error, sessionId }, 'Failed to get session builder metrics');
    sendJSON(res, { error: 'Failed to get session metrics' }, 500);
  }
}

// ============================================================================
// ALERTS HANDLER
// ============================================================================

// Lazy import to avoid circular dependencies
let alertsModule: typeof import('../../intelligence/context-builders/alerts.js') | null = null;

async function getAlertsModule() {
  if (!alertsModule) {
    alertsModule = await import('../../intelligence/context-builders/alerts.js');
  }
  return alertsModule;
}

/**
 * GET /api/admin/builder-metrics/alerts
 *
 * Returns active alerts and alert history.
 */
export async function handleGetBuilderAlerts(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const alerts = await getAlertsModule();

    // Run checks to ensure alerts are fresh
    alerts.runAlertChecks();

    const summary = alerts.getAlertSummary();
    const history = alerts.getAlertHistory(50);
    const thresholds = alerts.getThresholds();

    sendJSON(res, {
      timestamp: new Date().toISOString(),
      summary: {
        activeCount: summary.active,
        criticalCount: summary.critical,
        warningCount: summary.warnings,
      },
      activeAlerts: summary.alerts,
      recentHistory: history,
      thresholds,
    });
  } catch (error) {
    log.error({ error }, 'Failed to get builder alerts');
    sendJSON(res, { error: 'Failed to get alerts' }, 500);
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Route handler for builder metrics endpoints
 */
export async function handleBuilderMetricsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return false;
  }

  // Main metrics endpoint
  if (pathname === '/api/admin/builder-metrics') {
    await handleGetBuilderMetrics(req, res);
    return true;
  }

  // Warnings endpoint
  if (pathname === '/api/admin/builder-metrics/warnings') {
    await handleGetBuilderWarnings(req, res);
    return true;
  }

  // Alerts endpoint
  if (pathname === '/api/admin/builder-metrics/alerts') {
    await handleGetBuilderAlerts(req, res);
    return true;
  }

  // Session-specific metrics
  const sessionMatch = pathname.match(/^\/api\/admin\/builder-metrics\/session\/(.+)$/);
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    await handleGetSessionBuilderMetrics(req, res, sessionId);
    return true;
  }

  return false;
}

export default handleBuilderMetricsRoutes;
