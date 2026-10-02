/**
 * Health routes - Semantic Data Store
 *
 * GET  /api/semantic-store/health          - Health status
 * POST /api/semantic-store/cleanup         - Trigger TTL cleanup
 * GET  /api/semantic-store/metrics         - Prometheus metrics
 * GET  /api/semantic-store/dashboard       - Dashboard metrics (JSON)
 * GET  /api/semantic-store/diagnostics     - Diagnostics with recommendations
 * GET  /api/semantic-store/ttl-statistics  - TTL statistics
 * GET  /api/semantic-store/queue           - Queue metrics (backpressure)
 *
 * Routed from health.ts.
 *
 * @module servers/api/routes/semantic-store-health
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'HealthRoutes' });

/** Handle a semantic store route; false when the path isn't one of them. */
export async function handleSemanticStoreRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Semantic Data Store health
  if (pathname === '/api/semantic-store/health') {
    try {
      const { getMonitoringMetrics, checkFreshness, getHealth } =
        await import('../../../services/data-layer/monitoring.js');
      const { getTTLStatistics } = await import('../../../services/data-layer/ttl-cleanup.js');
      const { getFirestoreVectorStore } =
        await import('../../../memory/firestore-vector-store/index.js');

      const vectorStore = getFirestoreVectorStore();
      const vectorHealth = vectorStore.getHealth();
      const metrics = getMonitoringMetrics();
      const healthInfo = getHealth();
      const freshness = await checkFreshness();
      const ttlStats = getTTLStatistics();

      const semanticHealth = {
        status: healthInfo.status,
        timestamp: new Date().toISOString(),
        vectorStore: {
          healthy: vectorHealth.healthy,
          usingFallback: vectorHealth.usingFallback,
          fallbackReason: vectorHealth.fallbackReason,
          cacheSize: vectorHealth.cacheSize,
          risk: vectorHealth.risk,
          recoveryAttempts: vectorHealth.recoveryAttempts,
        },
        indexing: {
          totalIndexed: metrics.totalIndexed,
          totalErrors: metrics.totalErrors,
          successRate: metrics.successRate,
          byEntityType: metrics.byEntityType,
          recentErrors: metrics.recentErrors.slice(0, 5),
          latencyMs: metrics.avgLatencyMs,
        },
        freshness,
        ttlPolicies: Object.entries(ttlStats).filter(([, v]) => v.ttlDays !== null).length,
        alerts: [] as Array<{ level: 'warn' | 'error'; message: string }>,
      };

      // Add alerts
      if (!vectorHealth.healthy) {
        semanticHealth.alerts.push({
          level: 'error',
          message: `Vector store unhealthy: ${vectorHealth.fallbackReason || 'unknown reason'}`,
        });
      }
      if (vectorHealth.usingFallback) {
        semanticHealth.alerts.push({
          level: 'warn',
          message: 'Vector store using fallback mode - data may be lost on restart',
        });
      }
      if (metrics.successRate < 95 && metrics.totalIndexed > 10) {
        semanticHealth.alerts.push({
          level: 'warn',
          message: `Low indexing success rate: ${metrics.successRate.toFixed(1)}%`,
        });
      }
      if (metrics.recentErrors.length > 0) {
        semanticHealth.alerts.push({
          level: 'warn',
          message: `${metrics.recentErrors.length} recent indexing errors`,
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(semanticHealth, null, 2));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Semantic store health check error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: (err as Error).message,
          alerts: [{ level: 'error', message: `Semantic store error: ${(err as Error).message}` }],
        })
      );
    }
    return true;
  }

  // TTL cleanup trigger
  if (pathname === '/api/semantic-store/cleanup') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed', allowed: ['POST'] }));
      return true;
    }

    try {
      const { runTTLCleanup } = await import('../../../services/data-layer/ttl-cleanup.js');

      // Parse request body for options
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      await new Promise((resolve) => {
        req.on('end', resolve);
      });

      let options: { dryRun?: boolean; collections?: string[] } = {};
      if (body) {
        try {
          options = JSON.parse(body);
        } catch {
          // Ignore parse errors, use defaults
        }
      }

      log.info({ dryRun: options.dryRun }, 'Starting TTL cleanup via API');
      const result = await runTTLCleanup({
        dryRun: options.dryRun,
        collections: options.collections,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'TTL cleanup error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: (err as Error).message,
          timestamp: new Date().toISOString(),
        })
      );
    }
    return true;
  }

  // Prometheus metrics export
  if (pathname === '/api/semantic-store/metrics') {
    try {
      const { exportPrometheusMetrics } =
        await import('../../../services/data-layer/monitoring.js');
      const prometheusMetrics = exportPrometheusMetrics();

      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(prometheusMetrics);
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Prometheus metrics export error');
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`# Error exporting metrics: ${(err as Error).message}`);
    }
    return true;
  }

  // Dashboard metrics (JSON format)
  if (pathname === '/api/semantic-store/dashboard') {
    try {
      const { getDashboardData } = await import('../../../services/data-layer/observability.js');
      const dashboard = await getDashboardData();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboard, null, 2));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Semantic store dashboard error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return true;
  }

  // Diagnostics with recommendations
  if (pathname === '/api/semantic-store/diagnostics') {
    try {
      const { getSemanticStoreDiagnostics } =
        await import('../../../services/data-layer/observability.js');
      const diagnostics = await getSemanticStoreDiagnostics();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(diagnostics, null, 2));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Semantic store diagnostics error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return true;
  }

  // TTL statistics
  if (pathname === '/api/semantic-store/ttl-statistics') {
    try {
      const { getTTLStatistics } = await import('../../../services/data-layer/ttl-cleanup.js');
      const stats = getTTLStatistics();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats, null, 2));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'TTL statistics error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return true;
  }

  // Queue metrics (backpressure monitoring)
  if (pathname === '/api/semantic-store/queue') {
    try {
      const { getQueueMetrics } = await import('../../../services/data-layer/store-hooks.js');
      const queueMetrics = getQueueMetrics();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(queueMetrics, null, 2));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Queue metrics error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return true;
  }

  return false;
}
