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
import { persistenceMetrics } from '../../../services/persistence-metrics.js';

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
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Firestore health check timeout')), FIRESTORE_HEALTH_TIMEOUT_MS)
        );
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
