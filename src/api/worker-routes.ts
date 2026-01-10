/**
 * Worker Routes
 *
 * API routes for monitoring and managing background workers.
 * Used by admin UI to view worker health and statistics.
 *
 * Endpoints:
 * - GET /api/workers/stats - Comprehensive worker statistics
 * - GET /api/workers/health - Simple health check (200 or 503)
 * - POST /api/workers/flush - Flush pending async events (admin only)
 *
 * @module api/worker-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { sendJSON, sendError, handleCorsPreflightIfNeeded } from './helpers.js';
import { requireAdmin } from './auth-middleware.js';

const log = createLogger({ module: 'WorkerRoutes' });

// ============================================================================
// TYPES
// ============================================================================

interface WorkerStats {
  messagesReceived: number;
  messagesProcessed: number;
  messagesFailed: number;
  averageProcessingMs: number;
  lastProcessedAt: number | null;
}

interface WorkerStatsResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  workers: {
    trust?: WorkerStats;
    analytics?: WorkerStats;
    predictions?: WorkerStats;
    embedding?: WorkerStats;
    summarization?: WorkerStats;
    audioAnalysis?: {
      activeJobs: number;
      queueLength: number;
      totalJobs: number;
      completedJobs: number;
      failedJobs: number;
      avgProcessingMs: number;
    };
  };
  asyncEvents: {
    queueLength: number;
    emitted: number;
    processed: number;
    errors: number;
    dropped: number;
    handlerCount: number;
  };
  uptime: number;
  timestamp: string;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle worker routes.
 *
 * @param req - Incoming HTTP request
 * @param res - Server response
 * @param pathname - URL pathname
 * @returns true if handled, false otherwise
 */
export async function handleWorkerRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // GET /api/workers/stats - Comprehensive worker statistics
  if (pathname === '/api/workers/stats' && req.method === 'GET') {
    try {
      const { getWorkerStats } = await import('../workers/index.js');
      const { AsyncEvents } = await import('../services/async-events/index.js');

      const workerStats = getWorkerStats() as WorkerStatsResponse['workers'];
      const asyncStats = AsyncEvents.getStats();

      // Get audio analysis pool stats if available
      let audioStats = undefined;
      try {
        const { getAudioAnalysisPool } = await import('../workers/audio-analysis-pool.js');
        audioStats = getAudioAnalysisPool().getStats();
      } catch {
        // Pool may not be initialized
      }

      // Determine overall status
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      // Check for degraded conditions
      const totalFailed =
        (workerStats.trust?.messagesFailed ?? 0) +
        (workerStats.analytics?.messagesFailed ?? 0) +
        (workerStats.predictions?.messagesFailed ?? 0) +
        (workerStats.embedding?.messagesFailed ?? 0) +
        (workerStats.summarization?.messagesFailed ?? 0);

      const totalProcessed =
        (workerStats.trust?.messagesProcessed ?? 0) +
        (workerStats.analytics?.messagesProcessed ?? 0) +
        (workerStats.predictions?.messagesProcessed ?? 0) +
        (workerStats.embedding?.messagesProcessed ?? 0) +
        (workerStats.summarization?.messagesProcessed ?? 0);

      // Degraded if >5% failure rate
      if (totalProcessed > 100 && totalFailed / totalProcessed > 0.05) {
        status = 'degraded';
      }

      // Degraded if async event queue is backing up
      if (asyncStats.queueLength > 500) {
        status = 'degraded';
      }

      // Unhealthy if queue is critical
      if (asyncStats.queueLength > 900) {
        status = 'unhealthy';
      }

      // Unhealthy if too many events dropped
      if (asyncStats.dropped > 100) {
        status = 'unhealthy';
      }

      const response: WorkerStatsResponse = {
        status,
        workers: {
          ...workerStats,
          audioAnalysis: audioStats,
        },
        asyncEvents: {
          queueLength: asyncStats.queueLength,
          emitted: asyncStats.emitted,
          processed: asyncStats.processed,
          errors: asyncStats.errors,
          dropped: asyncStats.dropped,
          handlerCount: asyncStats.handlerCount,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };

      sendJSON(res, response);
      return true;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get worker stats');
      sendError(res, 'Failed to retrieve worker stats', 500);
      return true;
    }
  }

  // GET /api/workers/health - Simple health check
  if (pathname === '/api/workers/health' && req.method === 'GET') {
    try {
      const { getWorkerStats } = await import('../workers/index.js');
      const { AsyncEvents } = await import('../services/async-events/index.js');

      const workerStats = getWorkerStats();
      const asyncStats = AsyncEvents.getStats();

      // Quick health determination
      const isHealthy =
        asyncStats.queueLength < 500 &&
        asyncStats.dropped < 50 &&
        Object.keys(workerStats).length > 0;

      if (isHealthy) {
        sendJSON(res, { status: 'healthy' });
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'unhealthy',
            reason:
              asyncStats.queueLength >= 500
                ? 'Queue backing up'
                : asyncStats.dropped >= 50
                  ? 'Events being dropped'
                  : 'Workers not available',
          })
        );
      }
      return true;
    } catch (error) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'unhealthy',
          error: String(error),
        })
      );
      return true;
    }
  }

  // POST /api/workers/flush - Flush pending async events (admin only)
  if (pathname === '/api/workers/flush' && req.method === 'POST') {
    // Require admin authentication
    const auth = await requireAdmin(req, res);
    if (!auth) {
      return true; // Auth middleware already sent response
    }

    try {
      const { AsyncEvents } = await import('../services/async-events/index.js');

      const beforeStats = AsyncEvents.getStats();
      await AsyncEvents.flush();
      const afterStats = AsyncEvents.getStats();

      log.info(
        { adminUserId: auth.userId, flushed: beforeStats.queueLength - afterStats.queueLength },
        'Admin flushed async events'
      );

      sendJSON(res, {
        success: true,
        flushed: beforeStats.queueLength - afterStats.queueLength,
        remaining: afterStats.queueLength,
      });
      return true;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to flush async events');
      sendError(res, 'Failed to flush events', 500);
      return true;
    }
  }

  // Not handled
  return false;
}

export default { handleWorkerRoutes };
