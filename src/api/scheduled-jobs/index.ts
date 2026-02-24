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
