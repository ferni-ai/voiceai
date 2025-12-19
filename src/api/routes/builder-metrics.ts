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
import { requireAuth } from '../auth-middleware.js';

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

// Use speech-metrics-integration for quality alerts (builder-specific alerts use performance warnings)
import {
  checkQualityAlerts,
  getAlertHistory as getSpeechAlertHistory,
  getQualityThresholds,
} from '../../agents/integrations/speech-metrics-integration.js';

/**
 * GET /api/admin/builder-metrics/alerts
 *
 * Returns active alerts and alert history.
 * Uses the speech metrics alerting system for quality alerts.
 */
export async function handleGetBuilderAlerts(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    // Run checks to ensure alerts are fresh
    const activeAlerts = checkQualityAlerts();
    const history = getSpeechAlertHistory(50);
    const thresholds = getQualityThresholds();

    // Also include builder-specific performance warnings
    const builderWarnings = checkPerformanceIssues();

    const criticalCount = activeAlerts.filter((a) => a.severity === 'critical').length;
    const warningCount = activeAlerts.filter((a) => a.severity === 'warning').length;

    sendJSON(res, {
      timestamp: new Date().toISOString(),
      summary: {
        activeCount: activeAlerts.length,
        criticalCount,
        warningCount,
      },
      activeAlerts,
      builderWarnings,
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

  // Check if this is a builder-metrics route
  if (!pathname.startsWith('/api/admin/builder-metrics')) {
    return false;
  }

  // Require admin authentication for all builder-metrics endpoints
  const auth = await requireAuth(req, res, { requireAdmin: true, allowDevMode: true });
  if (!auth) {
    return true; // Auth failed, response already sent
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
