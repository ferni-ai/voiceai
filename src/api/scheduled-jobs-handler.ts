/**
 * Scheduled Jobs HTTP Handler
 *
 * Exposes HTTP endpoints for Cloud Scheduler to trigger scheduled jobs.
 * These endpoints are protected by checking for the X-CloudScheduler header.
 *
 * @module ScheduledJobsHandler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'scheduled-jobs-handler' });

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function isCloudScheduler(req: IncomingMessage): boolean {
  // Cloud Scheduler sets this header
  const schedulerHeader = req.headers['x-cloudscheduler'];
  // Also check for App Engine cron (alternative)
  const cronHeader = req.headers['x-appengine-cron'];
  // Allow manual triggers in development
  const devHeader = req.headers['x-dev-trigger'];

  return schedulerHeader === 'true' || cronHeader === 'true' || devHeader === 'true';
}

// ============================================================================
// JOB HANDLERS
// ============================================================================

async function runWeeklyANTReport(res: ServerResponse): Promise<void> {
  try {
    const { wellbeingJobs } = await import('../tasks/scheduled/wellbeing-jobs.js');
    const result = await wellbeingJobs.runWeeklyANTReports();
    log.info({ result }, 'Weekly ANT report completed');
    sendJson(res, 200, { success: true, job: 'weeklyANTReport', result });
  } catch (error) {
    log.error({ error }, 'Weekly ANT report failed');
    sendJson(res, 500, { success: false, job: 'weeklyANTReport', error: String(error) });
  }
}

async function runDailyWarningCheck(res: ServerResponse): Promise<void> {
  try {
    const { wellbeingJobs } = await import('../tasks/scheduled/wellbeing-jobs.js');
    const result = await wellbeingJobs.runDailyWarningChecks();
    log.info({ result }, 'Daily warning check completed');
    sendJson(res, 200, { success: true, job: 'dailyWarningCheck', result });
  } catch (error) {
    log.error({ error }, 'Daily warning check failed');
    sendJson(res, 500, { success: false, job: 'dailyWarningCheck', error: String(error) });
  }
}

async function runWisdomAggregation(res: ServerResponse): Promise<void> {
  try {
    const { wellbeingJobs } = await import('../tasks/scheduled/wellbeing-jobs.js');
    const result = await wellbeingJobs.runWisdomAggregation();
    log.info({ result }, 'Wisdom aggregation completed');
    sendJson(res, 200, { success: true, job: 'wisdomAggregation', result });
  } catch (error) {
    log.error({ error }, 'Wisdom aggregation failed');
    sendJson(res, 500, { success: false, job: 'wisdomAggregation', error: String(error) });
  }
}

async function runCheckInNudge(res: ServerResponse): Promise<void> {
  try {
    const { wellbeingJobs } = await import('../tasks/scheduled/wellbeing-jobs.js');
    const result = await wellbeingJobs.runCheckInNudges();
    log.info({ result }, 'Check-in nudge completed');
    sendJson(res, 200, { success: true, job: 'checkInNudge', result });
  } catch (error) {
    log.error({ error }, 'Check-in nudge failed');
    sendJson(res, 500, { success: false, job: 'checkInNudge', error: String(error) });
  }
}

async function runProactiveOutreach(res: ServerResponse): Promise<void> {
  try {
    const { proactiveOutreachJob } = await import('../tasks/scheduled/proactive-outreach-job.js');
    const result = await proactiveOutreachJob.run();
    log.info(
      { result: { sent: result.outreachSent, skipped: result.outreachSkipped } },
      'Proactive outreach completed'
    );
    sendJson(res, 200, { success: true, job: 'proactiveOutreach', result });
  } catch (error) {
    log.error({ error }, 'Proactive outreach failed');
    sendJson(res, 500, { success: false, job: 'proactiveOutreach', error: String(error) });
  }
}

async function runPredictiveInsights(res: ServerResponse): Promise<void> {
  try {
    const { runDailyPredictiveOutreach } =
      await import('../services/predictive-insights/outreach-integration.js');

    // Get active users from engagement store
    const { getEngagementStore } = await import('../services/engagement-store.js');
    const store = await getEngagementStore();

    const result = await runDailyPredictiveOutreach(async () => {
      // Get all users who've been active in last 30 days
      return store.getActiveUserIds(30);
    });

    log.info({ result }, 'Predictive insights job completed');
    sendJson(res, 200, { success: true, job: 'predictiveInsights', result });
  } catch (error) {
    log.error({ error }, 'Predictive insights job failed');
    sendJson(res, 500, { success: false, job: 'predictiveInsights', error: String(error) });
  }
}

// ============================================================================
// MEMORY SYSTEM JOBS
// ============================================================================

async function runMemoryConsolidation(res: ServerResponse): Promise<void> {
  try {
    const { MemoryConsolidationJob } = await import('../tasks/scheduled/memory-jobs.js');
    const job = new MemoryConsolidationJob();
    const result = await job.run({});
    log.info({ result }, 'Memory consolidation completed');
    sendJson(res, 200, { success: true, job: 'memoryConsolidation', result });
  } catch (error) {
    log.error({ error }, 'Memory consolidation failed');
    sendJson(res, 500, { success: false, job: 'memoryConsolidation', error: String(error) });
  }
}

async function runMemoryDecay(res: ServerResponse): Promise<void> {
  try {
    const { MemoryDecayJob } = await import('../tasks/scheduled/memory-jobs.js');
    const job = new MemoryDecayJob();
    const result = await job.run({});
    log.info({ result }, 'Memory decay completed');
    sendJson(res, 200, { success: true, job: 'memoryDecay', result });
  } catch (error) {
    log.error({ error }, 'Memory decay failed');
    sendJson(res, 500, { success: false, job: 'memoryDecay', error: String(error) });
  }
}

async function runMemoryDeduplication(res: ServerResponse): Promise<void> {
  try {
    const { MemoryDeduplicationJob } = await import('../tasks/scheduled/memory-jobs.js');
    const job = new MemoryDeduplicationJob();
    const result = await job.run({});
    log.info({ result }, 'Memory deduplication completed');
    sendJson(res, 200, { success: true, job: 'memoryDeduplication', result });
  } catch (error) {
    log.error({ error }, 'Memory deduplication failed');
    sendJson(res, 500, { success: false, job: 'memoryDeduplication', error: String(error) });
  }
}

async function runMemoryHealthCheck(res: ServerResponse): Promise<void> {
  try {
    const { MemoryHealthCheckJob } = await import('../tasks/scheduled/memory-jobs.js');
    const job = new MemoryHealthCheckJob();
    const result = await job.run({});
    log.info({ result }, 'Memory health check completed');
    sendJson(res, 200, { success: true, job: 'memoryHealthCheck', result });
  } catch (error) {
    log.error({ error }, 'Memory health check failed');
    sendJson(res, 500, { success: false, job: 'memoryHealthCheck', error: String(error) });
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleScheduledJobsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/jobs/* routes
  if (!pathname.startsWith('/api/jobs/')) {
    return false;
  }

  // Verify request is from Cloud Scheduler
  if (!isCloudScheduler(req)) {
    log.warn({ pathname }, 'Unauthorized scheduled job request');
    sendJson(res, 403, { error: 'Unauthorized - Cloud Scheduler header required' });
    return true;
  }

  // POST /api/jobs/weekly-ant-report
  if (pathname === '/api/jobs/weekly-ant-report' && req.method === 'POST') {
    await runWeeklyANTReport(res);
    return true;
  }

  // POST /api/jobs/daily-warning-check
  if (pathname === '/api/jobs/daily-warning-check' && req.method === 'POST') {
    await runDailyWarningCheck(res);
    return true;
  }

  // POST /api/jobs/wisdom-aggregation
  if (pathname === '/api/jobs/wisdom-aggregation' && req.method === 'POST') {
    await runWisdomAggregation(res);
    return true;
  }

  // POST /api/jobs/check-in-nudge
  if (pathname === '/api/jobs/check-in-nudge' && req.method === 'POST') {
    await runCheckInNudge(res);
    return true;
  }

  // POST /api/jobs/proactive-outreach
  if (pathname === '/api/jobs/proactive-outreach' && req.method === 'POST') {
    await runProactiveOutreach(res);
    return true;
  }

  // POST /api/jobs/predictive-insights
  if (pathname === '/api/jobs/predictive-insights' && req.method === 'POST') {
    await runPredictiveInsights(res);
    return true;
  }

  // POST /api/jobs/memory-consolidation
  if (pathname === '/api/jobs/memory-consolidation' && req.method === 'POST') {
    await runMemoryConsolidation(res);
    return true;
  }

  // POST /api/jobs/memory-decay
  if (pathname === '/api/jobs/memory-decay' && req.method === 'POST') {
    await runMemoryDecay(res);
    return true;
  }

  // POST /api/jobs/memory-deduplication
  if (pathname === '/api/jobs/memory-deduplication' && req.method === 'POST') {
    await runMemoryDeduplication(res);
    return true;
  }

  // POST /api/jobs/memory-health-check
  if (pathname === '/api/jobs/memory-health-check' && req.method === 'POST') {
    await runMemoryHealthCheck(res);
    return true;
  }

  // GET /api/jobs/status - List job configurations
  if (pathname === '/api/jobs/status' && req.method === 'GET') {
    try {
      const { wellbeingJobs } = await import('../tasks/scheduled/wellbeing-jobs.js');
      const configs = wellbeingJobs.getJobConfigs();
      sendJson(res, 200, { jobs: configs });
    } catch (error) {
      sendJson(res, 500, { error: String(error) });
    }
    return true;
  }

  return false;
}

export default { handleScheduledJobsRoutes };
