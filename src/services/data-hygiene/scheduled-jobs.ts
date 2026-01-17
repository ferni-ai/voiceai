/**
 * Data Hygiene Scheduled Jobs
 *
 * Cloud Scheduler job handlers for data maintenance:
 * - Daily TTL cleanup (3 AM)
 * - Daily document size monitoring (4 AM)
 *
 * @module services/data-hygiene/scheduled-jobs
 */

import { createLogger } from '../../utils/safe-logger.js';
import { runTTLCleanup } from './ttl-cleanup.js';
import { runDocumentSizeMonitor } from './document-size-monitor.js';

const log = createLogger({ module: 'data-hygiene-jobs' });

// ============================================================================
// TYPES
// ============================================================================

interface DataHealthResult {
  success: boolean;
  ttlCleanup: {
    success: boolean;
    totalDeleted: number;
    totalErrors: number;
    durationMs: number;
  };
  sizeMonitor: {
    success: boolean;
    criticalAlerts: number;
    warningAlerts: number;
    durationMs: number;
  };
  timestamp: string;
}

// ============================================================================
// COMBINED HEALTH JOB
// ============================================================================

/**
 * Run all data health checks.
 * Called by Cloud Scheduler daily at 3 AM.
 */
export async function runDataHealthJob(): Promise<DataHealthResult> {
  log.info('Starting data health job');

  const timestamp = new Date().toISOString();

  // Run TTL cleanup first
  const ttlResult = await runTTLCleanup();

  // Then run size monitoring
  const sizeResult = await runDocumentSizeMonitor();

  const result: DataHealthResult = {
    success: ttlResult.success && sizeResult.success,
    ttlCleanup: {
      success: ttlResult.success,
      totalDeleted: ttlResult.totalDeleted,
      totalErrors: ttlResult.totalErrors,
      durationMs: ttlResult.durationMs,
    },
    sizeMonitor: {
      success: sizeResult.success,
      criticalAlerts: sizeResult.alerts.filter((a) => a.threshold === 'critical').length,
      warningAlerts: sizeResult.alerts.filter((a) => a.threshold === 'warning').length,
      durationMs: sizeResult.durationMs,
    },
    timestamp,
  };

  log.info(
    {
      success: result.success,
      deleted: result.ttlCleanup.totalDeleted,
      criticalAlerts: result.sizeMonitor.criticalAlerts,
    },
    'Data health job completed'
  );

  return result;
}

// ============================================================================
// API HANDLER
// ============================================================================

/**
 * Handle data health HTTP request from Cloud Scheduler.
 */
export async function handleDataHealthRequest(
  _req: unknown,
  res: { status: (code: number) => { json: (data: unknown) => void } }
): Promise<void> {
  try {
    const result = await runDataHealthJob();

    if (result.success) {
      res.status(200).json({
        message: 'Data health job completed successfully',
        ...result,
      });
    } else {
      // Return 200 even on partial failure to prevent Cloud Scheduler retries
      // Errors are logged and can trigger alerts separately
      res.status(200).json({
        message: 'Data health job completed with errors',
        ...result,
      });
    }
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
// EXPORTS
// ============================================================================

export default {
  runDataHealthJob,
  handleDataHealthRequest,
};
