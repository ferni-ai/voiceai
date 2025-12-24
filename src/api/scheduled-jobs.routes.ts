/**
 * Scheduled Jobs API Routes
 *
 * Endpoints for Cloud Scheduler to trigger background jobs.
 * These replace in-process setInterval calls for better reliability.
 *
 * @module api/scheduled-jobs.routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ScheduledJobsAPI' });

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleScheduledJobsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // Only handle POST requests for jobs
  if (method !== 'POST') {
    return false;
  }

  switch (path) {
    case '/api/jobs/process-background-tasks':
      await handleProcessBackgroundTasks(res);
      return true;

    case '/api/jobs/check-scheduled':
      await handleCheckScheduled(res);
      return true;

    case '/api/jobs/cleanup-sessions':
      await handleCleanupSessions(res);
      return true;

    case '/api/jobs/cleanup-old-tasks':
      await handleCleanupOldTasks(res);
      return true;

    case '/api/jobs/aggregate-community-insights':
      await handleAggregateCommunityInsights(res);
      return true;

    case '/api/jobs/rollup-persona-metrics':
      await handleRollupPersonaMetrics(res);
      return true;

    case '/api/jobs/sync-trust-profiles':
      await handleSyncTrustProfiles(res);
      return true;

    default:
      return false;
  }
}

// ============================================================================
// JOB HANDLERS
// ============================================================================

async function handleProcessBackgroundTasks(res: ServerResponse): Promise<void> {
  try {
    log.info('Processing background tasks (Cloud Scheduler)');

    // TODO: Implement when BackgroundTaskService.processPendingTasks is added
    // For now, this is a stub that confirms the endpoint works
    sendJson(res, 200, {
      success: true,
      job: 'process-background-tasks',
      processed: 0,
      message: 'Stub - implement processPendingTasks in BackgroundTaskService',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Background task processing failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleCheckScheduled(res: ServerResponse): Promise<void> {
  try {
    log.info('Checking scheduled jobs (Cloud Scheduler)');

    // TODO: Implement when BackgroundTaskService.checkAndTriggerScheduledJobs is added
    // For now, this is a stub that confirms the endpoint works
    sendJson(res, 200, {
      success: true,
      job: 'check-scheduled',
      triggered: 0,
      message: 'Stub - implement checkAndTriggerScheduledJobs in BackgroundTaskService',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Scheduled job check failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleCleanupSessions(res: ServerResponse): Promise<void> {
  try {
    log.info('Cleaning up orphaned sessions (Cloud Scheduler)');

    // Import the session manager to check current state
    const { getActiveSessionCount } = await import('../services/session-manager.js');
    const sessionCount = getActiveSessionCount();

    // The existing session cleanup runs via interval, this just reports status
    sendJson(res, 200, {
      success: true,
      job: 'cleanup-sessions',
      activeSessions: sessionCount,
      message: 'Session cleanup runs automatically via session-manager',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Session cleanup failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleCleanupOldTasks(res: ServerResponse): Promise<void> {
  try {
    log.info('Cleaning up old tasks (Cloud Scheduler)');

    const { getBackgroundTaskService } = await import('../services/scheduling/background-tasks.js');
    const taskService = getBackgroundTaskService();

    // Clean up tasks older than 7 days
    const cleaned = taskService.cleanupOldTasks(7 * 24 * 60 * 60 * 1000);

    sendJson(res, 200, {
      success: true,
      job: 'cleanup-old-tasks',
      cleaned,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Old task cleanup failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleAggregateCommunityInsights(res: ServerResponse): Promise<void> {
  try {
    log.info('Aggregating community insights (Cloud Scheduler)');

    // Import and run capability learning aggregation
    const { persistPatterns, getAllPatterns } =
      await import('../intelligence/capability-learning.js');

    // Get current patterns and persist them
    const patterns = getAllPatterns();
    await persistPatterns();

    // Calculate aggregation stats
    const effectivePatterns = patterns.filter((p) => p.engagementRate > 0.3);
    const totalSamples = patterns.reduce((sum, p) => sum + p.sampleSize, 0);

    sendJson(res, 200, {
      success: true,
      job: 'aggregate-community-insights',
      stats: {
        totalDomains: patterns.length,
        effectiveDomains: effectivePatterns.length,
        totalSamples,
        topEngaging: effectivePatterns
          .sort((a, b) => b.engagementRate - a.engagementRate)
          .slice(0, 5)
          .map((p) => ({ domain: p.domain, engagementRate: p.engagementRate })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Community insights aggregation failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleRollupPersonaMetrics(res: ServerResponse): Promise<void> {
  try {
    log.info('Rolling up persona metrics (Cloud Scheduler)');

    // TODO: Implement persona-metrics.js for quality tracking
    // This job rolls up response quality metrics per persona
    sendJson(res, 200, {
      success: true,
      job: 'rollup-persona-metrics',
      message: 'Stub - implement persona-metrics.js',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Persona metrics rollup failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleSyncTrustProfiles(res: ServerResponse): Promise<void> {
  try {
    log.info('Syncing trust profiles (Cloud Scheduler)');

    // TODO: Implement trust sync when needed
    // This job syncs trust signals to trust profiles
    sendJson(res, 200, {
      success: true,
      job: 'sync-trust-profiles',
      message: 'Stub - implement trust-systems/sync.js',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Trust profile sync failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
