/**
 * Semantic Router API Routes
 *
 * Exposes semantic router telemetry and analytics for the dashboard.
 *
 * Endpoints:
 * - GET /api/semantic-router/dashboard - Full dashboard data with alerts
 * - GET /api/semantic-router/stats - Routing statistics
 * - GET /api/semantic-router/tools - Per-tool performance metrics
 * - GET /api/semantic-router/events - Recent routing events
 * - GET /api/semantic-router/health - Quick health check
 *
 * @module api/semantic-router-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON, sendJSONCached } from './helpers.js';
// Use the CORRECT metrics source - integration/metrics.ts which is actually populated
import {
  getDashboardData,
  getAggregateMetrics,
  getRecentMetrics,
  getUserMetrics,
  getToolMetrics,
  type AggregateMetrics,
  type RoutingMetric,
} from '../tools/semantic-router/integration/metrics.js';

const log = createLogger({ module: 'SemanticRouterAPI' });

/**
 * Build tool performance from aggregate metrics
 */
function buildToolPerformance(metrics: RoutingMetric[]): Array<{
  toolId: string;
  totalRoutes: number;
  avgConfidence: number;
  bypassRate: number;
  avgLatencyMs: number;
}> {
  const toolStats = new Map<
    string,
    { routes: number; confidences: number[]; bypasses: number; latencies: number[] }
  >();

  for (const m of metrics) {
    if (!m.toolId) continue;
    let stats = toolStats.get(m.toolId);
    if (!stats) {
      stats = { routes: 0, confidences: [], bypasses: 0, latencies: [] };
      toolStats.set(m.toolId, stats);
    }
    stats.routes++;
    stats.confidences.push(m.confidence);
    stats.latencies.push(m.latencyMs);
    if (m.action === 'execute') stats.bypasses++;
  }

  const result: Array<{
    toolId: string;
    totalRoutes: number;
    avgConfidence: number;
    bypassRate: number;
    avgLatencyMs: number;
  }> = [];

  toolStats.forEach((stats, toolId) => {
    result.push({
      toolId,
      totalRoutes: stats.routes,
      avgConfidence:
        stats.confidences.length > 0
          ? stats.confidences.reduce((a, b) => a + b, 0) / stats.confidences.length
          : 0,
      bypassRate: stats.routes > 0 ? stats.bypasses / stats.routes : 0,
      avgLatencyMs:
        stats.latencies.length > 0
          ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
          : 0,
    });
  });

  return result.sort((a, b) => b.totalRoutes - a.totalRoutes);
}

/**
 * Generate alerts from aggregate metrics
 */
function generateAlerts(
  aggregate: AggregateMetrics
): Array<{ type: 'warning' | 'error' | 'info'; message: string }> {
  const alerts: Array<{ type: 'warning' | 'error' | 'info'; message: string }> = [];

  // High latency alert
  if (aggregate.p95LatencyMs > 100) {
    alerts.push({
      type: 'warning',
      message: `P95 latency is ${aggregate.p95LatencyMs}ms (target: <100ms)`,
    });
  }

  // Low bypass rate
  if (aggregate.totalRoutes > 100 && aggregate.bypassedLLM / aggregate.totalRoutes < 0.3) {
    alerts.push({
      type: 'info',
      message: 'Auto-execute rate below 30% - consider tuning thresholds',
    });
  }

  // High error rate
  if (aggregate.totalRoutes > 50 && aggregate.errors / aggregate.totalRoutes > 0.1) {
    alerts.push({
      type: 'error',
      message: `Error rate is ${((aggregate.errors / aggregate.totalRoutes) * 100).toFixed(1)}%`,
    });
  }

  return alerts;
}

/**
 * Handle semantic router API routes
 */
export async function handleSemanticRouterRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/semantic-router/* routes
  if (!pathname.startsWith('/api/semantic-router')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting (generous for dashboard refreshes)
  if (rateLimit(req, res, { maxRequests: 120, windowMs: 60000 })) {
    return true;
  }

  // Require authentication (with dev mode for local testing)
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  const method = req.method || 'GET';

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/semantic-router/dashboard - Full dashboard data
    // ─────────────────────────────────────────────────────────────────────────
    if (pathname === '/api/semantic-router/dashboard' && method === 'GET') {
      const dashboard = getDashboardData();
      const alerts = generateAlerts(dashboard.aggregate);

      // Add router health summary
      const health = {
        status: alerts.some((a) => a.type === 'error')
          ? 'degraded'
          : alerts.some((a) => a.type === 'warning')
            ? 'warning'
            : 'healthy',
        alertCount: alerts.length,
        lastUpdated: new Date().toISOString(),
      };

      // Build tool performance from recent metrics
      const allMetrics = getRecentMetrics(10000);
      const toolPerformance = buildToolPerformance(allMetrics);

      sendJSON(res, {
        overview: dashboard.aggregate,
        toolPerformance: toolPerformance.slice(0, 20),
        recentEvents: dashboard.recent,
        hourly: dashboard.hourly,
        alerts,
        health,
      });
      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/semantic-router/stats - Routing statistics
    // ─────────────────────────────────────────────────────────────────────────
    if (pathname === '/api/semantic-router/stats' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const sinceParam = url.searchParams.get('since');
      const since = sinceParam ? new Date(sinceParam) : undefined;

      const stats = getAggregateMetrics(since);

      // Cache for 30 seconds since this is aggregate data
      sendJSONCached(res, stats, 30);
      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/semantic-router/tools - Per-tool performance
    // ─────────────────────────────────────────────────────────────────────────
    if (pathname === '/api/semantic-router/tools' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const toolId = url.searchParams.get('toolId');

      if (toolId) {
        // Get metrics for specific tool
        const metrics = getToolMetrics(toolId, 500);
        sendJSON(res, { toolId, metrics, count: metrics.length });
      } else {
        // Get all tool performance
        const allMetrics = getRecentMetrics(10000);
        const performance = buildToolPerformance(allMetrics);
        sendJSON(res, { tools: performance });
      }
      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/semantic-router/events - Recent routing events
    // ─────────────────────────────────────────────────────────────────────────
    if (pathname === '/api/semantic-router/events' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      const userId = url.searchParams.get('userId');

      let events: RoutingMetric[];
      if (userId) {
        events = getUserMetrics(userId, Math.min(limit, 500));
      } else {
        events = getRecentMetrics(Math.min(limit, 500));
      }

      sendJSON(res, {
        events,
        count: events.length,
        hasMore: events.length === limit,
      });
      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/semantic-router/health - Quick health check
    // ─────────────────────────────────────────────────────────────────────────
    if (pathname === '/api/semantic-router/health' && method === 'GET') {
      const stats = getAggregateMetrics();

      const health = {
        healthy: true,
        totalRoutes: stats.totalRoutes,
        bypassRate: stats.totalRoutes > 0 ? stats.bypassedLLM / stats.totalRoutes : 0,
        avgLatencyMs: stats.avgLatencyMs,
        p95LatencyMs: stats.p95LatencyMs,
        errorRate: stats.totalRoutes > 0 ? stats.errors / stats.totalRoutes : 0,
        warnings: [] as string[],
      };

      // Check for issues
      if (stats.p95LatencyMs > 100) {
        health.warnings.push('High P95 latency (>100ms)');
      }
      if (stats.totalRoutes > 100 && health.bypassRate < 0.3) {
        health.warnings.push('Low auto-execute rate (<30%)');
      }
      if (health.errorRate > 0.1) {
        health.warnings.push('Error rate above 10%');
      }

      health.healthy = health.warnings.length === 0;

      sendJSONCached(res, health, 10); // Cache for 10 seconds
      return true;
    }

    // Unknown semantic router endpoint
    sendError(res, 'Unknown semantic router endpoint', 404);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ error: err }, 'Semantic router API error');
    sendError(res, message, 500);
    return true;
  }
}
