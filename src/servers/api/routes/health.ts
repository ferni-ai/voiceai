/**
 * Health Routes
 *
 * Health check and monitoring endpoints.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as spotifyService from '../services/spotify.js';
import * as plaidService from '../services/plaid.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { getAllStats as getPersistenceStats } from '../../../services/persistence/index.js';
import { persistenceMetrics } from '../../../services/analytics/persistence-metrics.js';

const log = createLogger({ module: 'HealthRoutes' });

// Configuration
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PORT = process.env.PORT || 3002;

/**
 * Handle health routes
 */
export async function handleHealthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Basic health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ status: 'ok', service: 'ferni-ui', timestamp: new Date().toISOString() })
    );
    return true;
  }

  // Comprehensive health dashboard
  if (pathname === '/health/dashboard') {
    const spotifyConfig = spotifyService.getConfig();

    const dashboard = {
      status: 'ok',
      service: 'ferni-ui',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node: process.version,
      checks: {
        livekit: {
          configured: !!(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
          url: LIVEKIT_URL ? LIVEKIT_URL.replace(/\/\/.*@/, '//***@') : null, // Mask creds
        },
        plaid: {
          configured: plaidService.isConfigured(),
          environment: PLAID_ENV,
        },
        spotify: {
          configured: spotifyService.isConfigured(),
          hasRefreshToken: spotifyConfig.hasRefreshToken,
          hasWebDevice: spotifyConfig.hasWebDevice,
        },
        firebase: {
          projectId: process.env.GCP_PROJECT_ID || null,
        },
        persistence: getPersistenceStats(),
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: PORT,
        version: process.env.npm_package_version || 'unknown',
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dashboard, null, 2));
    return true;
  }

  // Firestore/Persistence health
  if (pathname === '/health/firestore' || pathname === '/api/diagnostics/persistence') {
    try {
      const stats = getPersistenceStats();
      const storeCount = Object.keys(stats).length;
      const totalCached = Object.values(stats).reduce((sum, s) => sum + s.cached, 0);
      const totalDirty = Object.values(stats).reduce((sum, s) => sum + s.dirty, 0);

      // Attempt a quick Firestore connectivity check with 5s timeout
      // Without timeout, a hung Firestore connection blocks health checks indefinitely
      let firestoreConnected = false;
      const FIRESTORE_HEALTH_TIMEOUT_MS = 5000;
      try {
        const { Firestore } = await import('@google-cloud/firestore');
        const db = new Firestore({
          projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
          databaseId: process.env.FIRESTORE_DATABASE || '(default)',
        });
        // Quick check with timeout - list collections limit 1
        const firestoreCheck = db.listCollections().then((cols) => cols.slice(0, 1));
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Firestore health check timeout')),
            FIRESTORE_HEALTH_TIMEOUT_MS
          );
        });
        await Promise.race([firestoreCheck, timeoutPromise]);
        firestoreConnected = true;
      } catch (err) {
        log.warn({ error: (err as Error).message }, 'Firestore connectivity check failed');
      }

      const persistenceHealth = {
        status: firestoreConnected ? (storeCount > 0 ? 'ok' : 'idle') : 'degraded',
        timestamp: new Date().toISOString(),
        firestore: {
          connected: firestoreConnected,
          projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || null,
          databaseId: process.env.FIRESTORE_DATABASE || '(default)',
        },
        persistence: {
          activeStores: storeCount,
          totalCachedEntries: totalCached,
          totalPendingWrites: totalDirty,
          stores: stats,
          metrics: persistenceMetrics.getSummaryReport(),
        },
        alerts: [] as Array<{ level: 'warn' | 'error'; message: string }>,
      };

      if (!firestoreConnected) {
        persistenceHealth.alerts.push({
          level: 'error',
          message: 'Firestore not connected - data will not persist',
        });
      }

      if (totalDirty > 50) {
        persistenceHealth.alerts.push({
          level: 'warn',
          message: `${totalDirty} pending writes - possible write backlog`,
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(persistenceHealth, null, 2));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Persistence health check error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: (err as Error).message,
        })
      );
    }
    return true;
  }

  // Circuit breaker health
  if (pathname === '/health/circuits' || pathname === '/api/diagnostics/circuits') {
    try {
      const { getAllClientStats, getAllCircuitStats, getUnhealthyClients } =
        await import('../../../services/self-healing/index.js');

      const httpClients = getAllClientStats();
      const circuits = getAllCircuitStats();
      const unhealthyClients = getUnhealthyClients();

      const circuitHealth = {
        status: unhealthyClients.length === 0 ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        summary: {
          totalClients: httpClients.length,
          healthyClients: httpClients.filter((c) => c.state === 'closed').length,
          openCircuits: httpClients.filter((c) => c.state === 'open').length,
          halfOpenCircuits: httpClients.filter((c) => c.state === 'half_open').length,
        },
        unhealthyServices: unhealthyClients,
        httpClients: httpClients.map((client) => ({
          name: client.name,
          state: client.state,
          failures: client.failures,
          successes: client.successes,
          totalRequests: client.totalRequests,
          totalFailures: client.totalFailures,
          totalSuccesses: client.totalSuccesses,
          successRate:
            client.totalRequests > 0
              ? ((client.totalSuccesses / client.totalRequests) * 100).toFixed(1) + '%'
              : 'N/A',
          lastStateChange: new Date(client.lastStateChange).toISOString(),
        })),
        allCircuits: circuits.map((circuit) => ({
          name: circuit.name,
          state: circuit.state,
          failures: circuit.failures,
          successes: circuit.successes,
          totalRequests: circuit.totalRequests,
          successRate:
            circuit.totalRequests > 0
              ? ((circuit.totalSuccesses / circuit.totalRequests) * 100).toFixed(1) + '%'
              : 'N/A',
        })),
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(circuitHealth, null, 2));
    } catch {
      // Self-healing module not available yet
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'unavailable',
          message: 'Self-healing module not loaded yet',
          timestamp: new Date().toISOString(),
        })
      );
    }
    return true;
  }

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
      await new Promise((resolve) => req.on('end', resolve));

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

  // Superhuman services health (Better than Human capabilities)
  if (pathname === '/health/superhuman') {
    try {
      const { getSuperhmanHealth, SUPERHUMAN_SERVICES, getFirestoreDb } =
        await import('../../../services/superhuman/firestore-utils.js');

      const healthStatus = getSuperhmanHealth();
      const dbCheck = getFirestoreDb(); // Trigger initialization if not already done

      interface HealthAlert {
        level: 'warn' | 'error';
        message: string;
      }

      const superhumanHealth: {
        status: 'ok' | 'degraded' | 'unavailable';
        timestamp: string;
        database: {
          available: boolean;
          initialized: boolean;
          error: string | null;
        };
        services: {
          total: number;
          operational: number;
          degraded: number;
          list: readonly string[];
        };
        degradation: {
          totalCount: number;
          recentEvents: Array<{ service: string; timestamp: string; reason: string }>;
          lastOccurredAt: string | null;
        };
        alerts: HealthAlert[];
        userImpact: string;
      } = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: {
          available: dbCheck !== null,
          initialized: healthStatus.initialized,
          error: healthStatus.initializationError,
        },
        services: {
          total: SUPERHUMAN_SERVICES.length,
          operational: dbCheck !== null ? SUPERHUMAN_SERVICES.length : 0,
          degraded: dbCheck !== null ? 0 : SUPERHUMAN_SERVICES.length,
          list: SUPERHUMAN_SERVICES,
        },
        degradation: {
          totalCount: healthStatus.degradationCount,
          recentEvents: healthStatus.recentDegradations.slice(0, 10),
          lastOccurredAt: healthStatus.lastDegradationAt,
        },
        alerts: [],
        userImpact: 'none',
      };

      // Determine status and alerts
      if (!healthStatus.dbAvailable) {
        superhumanHealth.status = 'unavailable';
        superhumanHealth.userImpact =
          'Ferni cannot remember commitments, track patterns, or provide personalized insights. Memory features are offline.';
        superhumanHealth.alerts.push({
          level: 'error',
          message: `Superhuman Firestore unavailable - all ${SUPERHUMAN_SERVICES.length} services degraded`,
        });
        if (healthStatus.initializationError) {
          superhumanHealth.alerts.push({
            level: 'error',
            message: `Initialization error: ${healthStatus.initializationError}`,
          });
        }
      } else if (healthStatus.degradationCount > 0) {
        superhumanHealth.status = 'degraded';
        superhumanHealth.userImpact =
          'Some memory features experienced temporary issues but should now be operational.';
        superhumanHealth.alerts.push({
          level: 'warn',
          message: `${healthStatus.degradationCount} degradation events recorded`,
        });
      }

      // Add warning if many recent degradations
      if (healthStatus.recentDegradations.length >= 5) {
        const recentServices = [...new Set(healthStatus.recentDegradations.map((d) => d.service))];
        superhumanHealth.alerts.push({
          level: 'warn',
          message: `Frequent degradations in: ${recentServices.join(', ')}`,
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(superhumanHealth, null, 2));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Superhuman health check error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: (err as Error).message,
          alerts: [
            {
              level: 'error',
              message: `Superhuman health check failed: ${(err as Error).message}`,
            },
          ],
        })
      );
    }
    return true;
  }

  // Memory system health
  if (pathname === '/api/memory/health') {
    try {
      const {
        getMemoryMetricsCollector,
        getMemoryDecayManager,
        getMemoryConsolidator,
        getMemoryDeduplicator,
      } = await import('../../../memory/index.js');

      const metrics = getMemoryMetricsCollector();
      const decayManager = getMemoryDecayManager();
      const consolidator = getMemoryConsolidator();
      const deduplicator = getMemoryDeduplicator();

      interface HealthAlert {
        level: 'warn' | 'error';
        message: string;
      }

      const health: {
        status: 'ok' | 'degraded' | 'error';
        timestamp: string;
        subsystems: Record<string, { status: string; description?: string; stats?: unknown }>;
        features: Record<string, boolean>;
        alerts: HealthAlert[];
      } = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        subsystems: {
          metrics: {
            status: metrics ? 'active' : 'inactive',
            stats: metrics ? { description: 'Memory metrics collector' } : null,
          },
          decay: {
            status: decayManager ? 'active' : 'inactive',
            description: 'Applies graceful forgetting to old memories',
          },
          consolidation: {
            status: consolidator ? 'active' : 'inactive',
            description: 'Compresses related memories for long-term users',
          },
          deduplication: {
            status: deduplicator ? 'active' : 'inactive',
            description: 'Removes redundant memories to optimize storage',
          },
        },
        features: {
          sessionPriming: true,
          humanSignalExtraction: true,
          memoryIndexWarming: true,
          crossPersonaHandoff: true,
          advancedRetrieval: true,
        },
        alerts: [],
      };

      // Add alerts for inactive subsystems
      if (!metrics)
        health.alerts.push({ level: 'warn', message: 'Memory metrics not initialized' });
      if (!decayManager)
        health.alerts.push({ level: 'warn', message: 'Memory decay manager not initialized' });
      if (!consolidator)
        health.alerts.push({ level: 'warn', message: 'Memory consolidator not initialized' });
      if (!deduplicator)
        health.alerts.push({ level: 'warn', message: 'Memory deduplicator not initialized' });

      // Set overall status based on alerts
      if (health.alerts.some((a) => a.level === 'error')) {
        health.status = 'error';
      } else if (health.alerts.length > 0) {
        health.status = 'degraded';
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Memory health check error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: (err as Error).message,
          alerts: [{ level: 'error', message: `Memory system error: ${(err as Error).message}` }],
        })
      );
    }
    return true;
  }

  return false;
}
