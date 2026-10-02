/**
 * Scheduled Jobs Route Handler
 *
 * Thin routing layer that dispatches Cloud Scheduler POST requests
 * to focused job handler modules.
 *
 * @module api/scheduled-jobs
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { handleCleanupOrphanedUploads } from '../jobs/cleanup-orphaned-uploads.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';
import { verifySchedulerRequest } from './scheduler-auth.js';

const log = createLogger({ module: 'ScheduledJobs' });

/** Every job route below; auth is checked only for these, so unknown paths still 404. */
export const JOB_PATHS: ReadonlySet<string> = new Set([
  '/api/jobs/process-background-tasks',
  '/api/jobs/check-scheduled',
  '/api/jobs/cleanup-sessions',
  '/api/jobs/cleanup-old-tasks',
  '/api/jobs/aggregate-community-insights',
  '/api/jobs/rollup-persona-metrics',
  '/api/jobs/sync-trust-profiles',
  '/api/jobs/cleanup-transcripts',
  '/api/jobs/daily-outreach',
  '/api/jobs/evaluate-thinking-of-you',
  '/api/jobs/run-predictive-analysis',
  '/api/jobs/rollup-outreach-analytics',
  '/api/jobs/reset-weekly-counters',
  '/api/jobs/better-than-human-outreach',
  '/api/jobs/process-insight-actions',
  '/api/jobs/family-checkin-calls',
  '/api/jobs/run-deep-analysis',
  '/api/jobs/flush-ml-state',
  '/api/jobs/semantic-router-learning',
  '/api/jobs/cleanup-orphaned-uploads',
  '/api/jobs/ttl-cleanup',
  '/api/jobs/ttl-backfill',
  '/api/jobs/daily-admin-report',
  '/api/jobs/memory-consolidation',
  '/api/jobs/memory-decay',
  '/api/jobs/memory-deduplication',
  '/api/jobs/memory-health-check',
  '/api/jobs/deliver-reminders',
  '/api/jobs/deliver-date-reminders',
  '/api/jobs/deliver-scheduled-actions',
  '/api/jobs/execute-scheduled-outreach',
  '/api/jobs/calendar-triggers',
  '/api/jobs/deep-analysis',
  '/api/jobs/knowledge-graph-insights',
  '/api/jobs/knowledge-graph-consolidation',
  '/api/jobs/knowledge-graph-thread-maintenance',
  '/api/jobs/knowledge-graph-entity-decay',
  '/api/jobs/brand-award-deadline-check',
  '/api/jobs/brand-story-review-reminder',
  '/api/jobs/brand-workstream-progress',
  '/api/jobs/brand-milestone-check',
  '/api/jobs/brand-ambassador-engagement',
  '/api/jobs/brand-metrics-collection',
  '/api/jobs/brand-weekly-report',
  '/api/jobs/brand-publish-stories',
  '/api/jobs/gtm-daily-publishing',
  '/api/jobs/gtm-weekly-content',
  '/api/jobs/semantic-router-retrain',
  '/api/jobs/semantic-router-volume-check',
  '/api/jobs/semantic-router-quality-check',
  '/api/jobs/semantic-router-health',
]);

// Background task handlers
import {
  handleProcessBackgroundTasks,
  handleCheckScheduled,
  handleCleanupSessions,
  handleCleanupOldTasks,
  handleAggregateCommunityInsights,
  handleRollupPersonaMetrics,
  handleSyncTrustProfiles,
  handleCleanupTranscripts,
} from './background-task-jobs.js';

// Outreach handlers
import {
  handleDailyOutreach,
  handleEvaluateThinkingOfYou,
  handleRunPredictiveAnalysis,
  handleRollupOutreachAnalytics,
  handleResetWeeklyCounters,
  handleFamilyCheckinCalls,
} from './outreach-jobs.js';

// Superhuman handlers
import {
  handleBetterThanHumanOutreach,
  handleProcessInsightActions,
} from './superhuman-jobs.js';

// Intelligence handlers
import {
  handleRunDeepAnalysis,
  handleFlushMLState,
  handleSemanticRouterLearning,
  handleDeepAnalysis,
} from './intelligence-jobs.js';

// Maintenance handlers
import {
  handleTTLCleanup,
  handleTTLBackfill,
  handleDailyAdminReport,
} from './maintenance-jobs.js';

import { handleDeliverDateReminders, handleDeliverReminders } from './reminder-jobs.js';
import {
  handleCalendarTriggers,
  handleDeliverScheduledActions,
  handleExecuteScheduledOutreach,
} from './background-delivery-jobs.js';

// Memory maintenance handlers
import {
  handleMemoryConsolidation,
  handleMemoryDecay,
  handleMemoryDeduplication,
  handleMemoryHealthCheck,
} from './memory-maintenance-jobs.js';

// Knowledge graph handlers
import {
  handleKnowledgeGraphInsights,
  handleKnowledgeGraphConsolidation,
  handleKnowledgeGraphThreadMaintenance,
  handleKnowledgeGraphEntityDecay,
} from './knowledge-graph-jobs.js';

// Brand automation handlers
import {
  handleBrandAwardDeadlineCheck,
  handleBrandStoryReviewReminder,
  handleBrandWorkstreamProgress,
  handleBrandMilestoneCheck,
  handleBrandAmbassadorEngagement,
  handleBrandMetricsCollection,
  handleBrandWeeklyReport,
  handleBrandPublishStories,
} from './brand-jobs.js';

// Content automation handlers
import {
  handleGTMDailyPublishing,
  handleGTMWeeklyContent,
  handleSemanticRouterRetrain,
  handleSemanticRouterVolumeCheck,
  handleSemanticRouterQualityCheck,
  handleSemanticRouterHealth,
} from './content-automation-jobs.js';

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

  if (!JOB_PATHS.has(path)) {
    return false;
  }

  // Only Cloud Scheduler (its signed OIDC token) may run a job.
  const auth = await verifySchedulerRequest(req, path);
  if (!auth.ok) {
    log.warn({ path, reason: auth.reason }, 'Scheduled job request refused');
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
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

    case '/api/jobs/cleanup-transcripts':
      await handleCleanupTranscripts(res);
      return true;

    case '/api/jobs/daily-outreach':
      await handleDailyOutreach(res);
      return true;

    case '/api/jobs/evaluate-thinking-of-you':
      await handleEvaluateThinkingOfYou(res);
      return true;

    case '/api/jobs/run-predictive-analysis':
      await handleRunPredictiveAnalysis(res);
      return true;

    case '/api/jobs/rollup-outreach-analytics':
      await handleRollupOutreachAnalytics(res);
      return true;

    case '/api/jobs/reset-weekly-counters':
      await handleResetWeeklyCounters(res);
      return true;

    case '/api/jobs/better-than-human-outreach':
      await handleBetterThanHumanOutreach(res);
      return true;

    case '/api/jobs/process-insight-actions':
      await handleProcessInsightActions(res);
      return true;

    case '/api/jobs/family-checkin-calls':
      await handleFamilyCheckinCalls(res);
      return true;

    case '/api/jobs/run-deep-analysis':
      await handleRunDeepAnalysis(res);
      return true;

    case '/api/jobs/flush-ml-state':
      await handleFlushMLState(res);
      return true;

    case '/api/jobs/semantic-router-learning':
      await handleSemanticRouterLearning(res);
      return true;

    case '/api/jobs/cleanup-orphaned-uploads':
      await handleCleanupOrphanedUploads(res);
      return true;

    case '/api/jobs/ttl-cleanup':
      await handleTTLCleanup(res);
      return true;

    case '/api/jobs/ttl-backfill':
      await handleTTLBackfill(res);
      return true;

    case '/api/jobs/daily-admin-report':
      await handleDailyAdminReport(res);
      return true;

    case '/api/jobs/memory-consolidation':
      await handleMemoryConsolidation(res);
      return true;

    case '/api/jobs/memory-decay':
      await handleMemoryDecay(res);
      return true;

    case '/api/jobs/memory-deduplication':
      await handleMemoryDeduplication(res);
      return true;

    case '/api/jobs/memory-health-check':
      await handleMemoryHealthCheck(res);
      return true;

    case '/api/jobs/deliver-reminders':
      await handleDeliverReminders(req, res);
      return true;

    case '/api/jobs/deliver-date-reminders':
      await handleDeliverDateReminders(req, res);
      return true;

    case '/api/jobs/deliver-scheduled-actions':
      await handleDeliverScheduledActions(req, res);
      return true;

    case '/api/jobs/execute-scheduled-outreach':
      await handleExecuteScheduledOutreach(req, res);
      return true;

    case '/api/jobs/calendar-triggers':
      await handleCalendarTriggers(res);
      return true;

    case '/api/jobs/deep-analysis':
      await handleDeepAnalysis(res);
      return true;

    case '/api/jobs/knowledge-graph-insights':
      await handleKnowledgeGraphInsights(res);
      return true;

    case '/api/jobs/knowledge-graph-consolidation':
      await handleKnowledgeGraphConsolidation(res);
      return true;

    case '/api/jobs/knowledge-graph-thread-maintenance':
      await handleKnowledgeGraphThreadMaintenance(res);
      return true;

    case '/api/jobs/knowledge-graph-entity-decay':
      await handleKnowledgeGraphEntityDecay(res);
      return true;

    case '/api/jobs/brand-award-deadline-check':
      await handleBrandAwardDeadlineCheck(res);
      return true;

    case '/api/jobs/brand-story-review-reminder':
      await handleBrandStoryReviewReminder(res);
      return true;

    case '/api/jobs/brand-workstream-progress':
      await handleBrandWorkstreamProgress(res);
      return true;

    case '/api/jobs/brand-milestone-check':
      await handleBrandMilestoneCheck(res);
      return true;

    case '/api/jobs/brand-ambassador-engagement':
      await handleBrandAmbassadorEngagement(res);
      return true;

    case '/api/jobs/brand-metrics-collection':
      await handleBrandMetricsCollection(res);
      return true;

    case '/api/jobs/brand-weekly-report':
      await handleBrandWeeklyReport(res);
      return true;

    case '/api/jobs/brand-publish-stories':
      await handleBrandPublishStories(res);
      return true;

    case '/api/jobs/gtm-daily-publishing':
      await handleGTMDailyPublishing(res);
      return true;

    case '/api/jobs/gtm-weekly-content':
      await handleGTMWeeklyContent(res);
      return true;

    case '/api/jobs/semantic-router-retrain':
      await handleSemanticRouterRetrain(res);
      return true;

    case '/api/jobs/semantic-router-volume-check':
      await handleSemanticRouterVolumeCheck(res);
      return true;

    case '/api/jobs/semantic-router-quality-check':
      await handleSemanticRouterQualityCheck(res);
      return true;

    case '/api/jobs/semantic-router-health':
      await handleSemanticRouterHealth(res);
      return true;

    default:
      return false;
  }
}
