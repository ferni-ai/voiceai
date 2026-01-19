/**
 * Data Hygiene API Routes
 *
 * Endpoints for data maintenance:
 * - Scheduled job handlers (Cloud Scheduler)
 * - Manual cleanup triggers (admin)
 * - Health metrics (observability)
 *
 * @module data-hygiene-routes
 */

import type { Request, Response, Router } from 'express';
import { getLogger } from '../utils/safe-logger.js';
import { runDataHealthJob } from '../services/data-hygiene/scheduled-jobs.js';
import { runTTLCleanup } from '../services/data-hygiene/ttl-cleanup.js';
import {
  runDocumentSizeMonitor,
  getDocumentSizeMetrics,
} from '../services/data-hygiene/document-size-monitor.js';

const log = getLogger().child({ module: 'data-hygiene-routes' });

// ============================================================================
// ROUTE SETUP
// ============================================================================

/**
 * Register data hygiene routes
 */
export function registerDataHygieneRoutes(router: Router): void {
  // Scheduled job handler (called by Cloud Scheduler)
  router.post('/api/data-hygiene/jobs/health', handleDataHealthJob);

  // Manual triggers (admin)
  router.post('/api/data-hygiene/cleanup/ttl', handleTTLCleanup);
  router.post('/api/data-hygiene/monitor/size', handleSizeMonitor);

  // Health metrics (observability)
  router.get('/api/data-hygiene/metrics', getMetrics);
  router.get('/api/data-hygiene/health', healthCheck);

  log.info('🧹 Data hygiene routes registered');
}

// ============================================================================
// SCHEDULED JOB HANDLER
// ============================================================================

/**
 * Handle data health job (Cloud Scheduler)
 */
async function handleDataHealthJob(req: Request, res: Response): Promise<void> {
  // Verify Cloud Scheduler header (optional security)
  const schedulerHeader = req.get('X-CloudScheduler');
  if (process.env.NODE_ENV === 'production' && !schedulerHeader) {
    log.warn('Data health job called without Cloud Scheduler header');
  }

  log.info('Running data health job (scheduled)');

  try {
    const result = await runDataHealthJob();
    res.status(200).json(result);
  } catch (error) {
    log.error({ error: String(error) }, 'Data health job failed');
    res.status(500).json({
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// MANUAL TRIGGERS
// ============================================================================

/**
 * Manually trigger TTL cleanup (admin)
 */
async function handleTTLCleanup(req: Request, res: Response): Promise<void> {
  log.info('Running manual TTL cleanup');

  try {
    const result = await runTTLCleanup();
    res.json({
      message: 'TTL cleanup completed',
      ...result,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Manual TTL cleanup failed');
    res.status(500).json({
      success: false,
      error: String(error),
    });
  }
}

/**
 * Manually trigger size monitor (admin)
 */
async function handleSizeMonitor(req: Request, res: Response): Promise<void> {
  log.info('Running manual size monitor');

  try {
    const result = await runDocumentSizeMonitor();
    res.json({
      message: 'Size monitor completed',
      success: result.success,
      alertCount: result.alerts.length,
      criticalCount: result.alerts.filter((a) => a.threshold === 'critical').length,
      warningCount: result.alerts.filter((a) => a.threshold === 'warning').length,
      alerts: result.alerts.slice(0, 20), // Limit response size
      collectionStats: result.collectionStats,
      durationMs: result.durationMs,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Manual size monitor failed');
    res.status(500).json({
      success: false,
      error: String(error),
    });
  }
}

// ============================================================================
// METRICS & HEALTH
// ============================================================================

/**
 * Get data hygiene metrics for observability
 */
async function getMetrics(req: Request, res: Response): Promise<void> {
  try {
    const metrics = await getDocumentSizeMetrics();
    res.json({
      dataHygiene: {
        documentSizes: metrics,
        // Add more metrics here as needed
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get data hygiene metrics');
    res.status(500).json({
      error: 'Failed to get metrics',
      details: String(error),
    });
  }
}

/**
 * Health check for data hygiene system
 */
async function healthCheck(_req: Request, res: Response): Promise<void> {
  res.json({
    status: 'healthy',
    service: 'data-hygiene',
    features: {
      ttlCleanup: true,
      sizeMonitor: true,
      scheduledJobs: true,
    },
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { registerDataHygieneRoutes };
