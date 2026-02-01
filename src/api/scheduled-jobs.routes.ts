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
import { handleCleanupOrphanedUploads } from './jobs/cleanup-orphaned-uploads.js';
import type { SuperhumanInsight } from '../services/automation/insight-action-bridge.js';
import type { UserProfile } from '../types/user-profile.js';

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

    case '/api/jobs/cleanup-transcripts':
      await handleCleanupTranscripts(res);
      return true;

    // ========================================================================
    // OUTREACH JOBS (referenced by deploy-cloud-scheduler.ts)
    // ========================================================================
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

    // ========================================================================
    // FAMILY CHECK-IN JOBS (Proactive family wellbeing calls)
    // ========================================================================
    case '/api/jobs/family-checkin-calls':
      await handleFamilyCheckinCalls(res);
      return true;

    // ========================================================================
    // DEEP INTELLIGENCE JOBS (LLM-powered batch analysis)
    // ========================================================================
    case '/api/jobs/run-deep-analysis':
      await handleRunDeepAnalysis(res);
      return true;

    case '/api/jobs/flush-ml-state':
      await handleFlushMLState(res);
      return true;

    // P2 UTO Fix (January 2026): Semantic router learning calibration
    case '/api/jobs/semantic-router-learning':
      await handleSemanticRouterLearning(res);
      return true;

    // ========================================================================
    // GCS CLEANUP JOBS
    // ========================================================================
    case '/api/jobs/cleanup-orphaned-uploads':
      await handleCleanupOrphanedUploads(res);
      return true;

    // ========================================================================
    // SEMANTIC DATA LAYER JOBS
    // ========================================================================
    case '/api/jobs/ttl-cleanup':
      await handleTTLCleanup(res);
      return true;

    case '/api/jobs/ttl-backfill':
      await handleTTLBackfill(res);
      return true;

    // ========================================================================
    // ADMIN REPORTING JOBS
    // ========================================================================
    case '/api/jobs/daily-admin-report':
      await handleDailyAdminReport(res);
      return true;

    // ========================================================================
    // MEMORY MAINTENANCE JOBS (Better Than Human memory system)
    // ========================================================================
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

    // ========================================================================
    // PREDICTIVE INTELLIGENCE JOBS (Gemini-powered deep analysis)
    // ========================================================================
    case '/api/jobs/deep-analysis':
      await handleDeepAnalysis(res);
      return true;

    // ========================================================================
    // KNOWLEDGE GRAPH JOBS (Unified entity knowledge maintenance)
    // ========================================================================
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

    // ========================================================================
    // BRAND AUTOMATION JOBS
    // ========================================================================
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

    // ========================================================================
    // GTM (GO-TO-MARKET) CONTENT AUTOMATION
    // ========================================================================
    case '/api/jobs/gtm-daily-publishing':
      await handleGTMDailyPublishing(res);
      return true;

    case '/api/jobs/gtm-weekly-content':
      await handleGTMWeeklyContent(res);
      return true;

    // ========================================================================
    // SEMANTIC ROUTER RETRAINING (State-of-the-Art Tool Routing)
    // ========================================================================
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

// ============================================================================
// JOB HANDLERS
// ============================================================================

async function handleProcessBackgroundTasks(res: ServerResponse): Promise<void> {
  try {
    log.info('Processing background tasks (Cloud Scheduler)');

    const { getBackgroundTaskService } = await import('../services/scheduling/background-tasks.js');
    const taskService = getBackgroundTaskService();

    // Get pending tasks for all users and process them
    const pendingTasks = await taskService.getUserTasks('*', 'pending');
    let processed = 0;
    let failed = 0;

    // Process up to 50 tasks per run
    for (const task of pendingTasks.slice(0, 50)) {
      try {
        await taskService.updateTaskStatus(task.id, 'running');
        // Task execution happens via the internal processor
        processed++;
      } catch {
        failed++;
        await taskService.updateTaskStatus(task.id, 'failed', undefined, 'Processing failed');
      }
    }

    sendJson(res, 200, {
      success: true,
      job: 'process-background-tasks',
      processed,
      failed,
      pending: pendingTasks.length - processed,
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

    const { getBackgroundTaskService } = await import('../services/scheduling/background-tasks.js');
    const taskService = getBackgroundTaskService();

    // Get all scheduled tasks that are due
    const now = new Date();
    const allPending = await taskService.getUserTasks('*', 'pending');
    const dueJobs = allPending.filter(
      (task) => task.scheduledFor && new Date(task.scheduledFor) <= now
    );

    let triggered = 0;
    for (const job of dueJobs.slice(0, 20)) {
      try {
        await taskService.updateTaskStatus(job.id, 'running');
        triggered++;
      } catch {
        log.warn({ jobId: job.id }, 'Failed to trigger scheduled job');
      }
    }

    sendJson(res, 200, {
      success: true,
      job: 'check-scheduled',
      triggered,
      pendingScheduled: dueJobs.length,
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

    // Import humanization analytics for persona-level metrics
    const { getHumanizationAnalytics } =
      await import('../services/analytics/humanization-analytics.js');
    const analytics = getHumanizationAnalytics();

    // Aggregate persona-level metrics
    const personas = [
      'ferni',
      'peter-john',
      'maya-santos',
      'alex-chen',
      'jordan-taylor',
      'nayan-patel',
    ];
    const metricsRollup: Record<string, unknown> = {};

    for (const personaId of personas) {
      try {
        const metrics = analytics.getPersonaMetrics(personaId);
        if (metrics) {
          // Calculate total feature usage count
          const totalFeatureUsage = Object.values(metrics.featureUsage || {}).reduce(
            (sum, count) => sum + count,
            0
          );
          // Calculate average correlation score
          const correlations = metrics.engagementCorrelations || [];
          const avgCorrelation =
            correlations.length > 0
              ? correlations.reduce((sum, c) => sum + c.correlationScore, 0) / correlations.length
              : 0;

          metricsRollup[personaId] = {
            totalSessions: metrics.totalSessions ?? 0,
            totalTurns: metrics.totalTurns ?? 0,
            featureUsageCount: totalFeatureUsage,
            avgEngagementCorrelation: avgCorrelation.toFixed(2),
          };
        } else {
          metricsRollup[personaId] = { status: 'No data' };
        }
      } catch {
        metricsRollup[personaId] = { error: 'Metrics unavailable' };
      }
    }

    sendJson(res, 200, {
      success: true,
      job: 'rollup-persona-metrics',
      metrics: metricsRollup,
      personaCount: personas.length,
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

    // Import unified trust persistence - use flushPendingChanges which exists
    const { flushPendingChanges, initializeUnifiedPersistence } =
      await import('../services/trust-systems/unified-persistence.js');

    // Ensure the persistence system is initialized
    initializeUnifiedPersistence();

    // Flush all pending changes to Firestore
    await flushPendingChanges();

    sendJson(res, 200, {
      success: true,
      job: 'sync-trust-profiles',
      message: 'Trust profile sync completed',
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

async function handleCleanupTranscripts(res: ServerResponse): Promise<void> {
  try {
    log.info('Cleaning up old transcripts (Cloud Scheduler)');

    const { TranscriptCleanupJob } = await import('../tasks/scheduled/memory-jobs.js');

    const job = new TranscriptCleanupJob();
    const result = await job.run({
      dryRun: false, // Set to true for testing
    });

    sendJson(res, 200, {
      success: true,
      job: 'cleanup-transcripts',
      stats: {
        transcriptsDeleted: result.transcriptsDeleted,
        summariesDeleted: result.summariesDeleted,
        groupTranscriptsDeleted: result.groupTranscriptsDeleted,
        usersProcessed: result.usersProcessed,
        durationMs: result.durationMs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Transcript cleanup failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// OUTREACH JOB HANDLERS
// ============================================================================

async function handleDailyOutreach(res: ServerResponse): Promise<void> {
  try {
    log.info('Running daily outreach job (Cloud Scheduler)');

    const { runDailyOutreachJob } = await import('../services/outreach/daily-outreach-job.js');
    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');

    // Get all user profiles from Firestore
    const getUserProfiles = async (): Promise<UserProfile[]> => {
      const db = getFirestoreDb();
      if (!db) return [];
      const snapshot = await db.collection('bogle_users').limit(1000).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as UserProfile);
    };

    const result = await runDailyOutreachJob({
      getUserProfiles,
      dryRun: false,
      maxUsersPerRun: 1000,
      delayBetweenUsersMs: 100,
    });

    sendJson(res, 200, {
      success: true,
      job: 'daily-outreach',
      stats: {
        usersEvaluated: result.usersEvaluated,
        outreachSent: result.outreachSent,
        byType: result.byType,
        durationMs: result.durationMs,
        errorCount: result.errors.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Daily outreach job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleEvaluateThinkingOfYou(res: ServerResponse): Promise<void> {
  try {
    log.info('Evaluating thinking-of-you outreach (Cloud Scheduler)');

    // Get active users to evaluate
    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    // Find users with proactive outreach enabled
    const usersSnap = await db
      .collection('bogle_users')
      .where('preferences.proactiveOutreach', '==', true)
      .limit(500)
      .get();

    let evaluated = 0;
    let triggered = 0;

    const { evaluateLifeRhythmOutreach, triggerLifeRhythmOutreach } =
      await import('../services/outreach/life-rhythm-outreach.js');

    for (const doc of usersSnap.docs) {
      try {
        evaluated++;
        const result = evaluateLifeRhythmOutreach(doc.id, { enabled: true });

        if (result.triggered && result.prediction) {
          await triggerLifeRhythmOutreach(doc.id, result.prediction);
          triggered++;
        }
      } catch (err) {
        log.warn({ userId: doc.id, error: String(err) }, 'Failed to evaluate user');
      }
    }

    sendJson(res, 200, {
      success: true,
      job: 'evaluate-thinking-of-you',
      stats: {
        evaluated,
        triggered,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Thinking-of-you evaluation failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleRunPredictiveAnalysis(res: ServerResponse): Promise<void> {
  try {
    log.info('Running predictive analysis (Cloud Scheduler)');

    const { runPredictiveAnalysis } = await import('../services/predictive-insights/index.js');

    // Get recently active users
    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const usersSnap = await db
      .collection('bogle_users')
      .where('lastActiveAt', '>=', sevenDaysAgo)
      .limit(200)
      .get();

    let analyzed = 0;
    let insightsGenerated = 0;

    for (const doc of usersSnap.docs) {
      try {
        const insights = await runPredictiveAnalysis(doc.id);
        analyzed++;
        insightsGenerated += insights.length;
      } catch (err) {
        log.warn({ userId: doc.id, error: String(err) }, 'Failed to analyze user');
      }
    }

    sendJson(res, 200, {
      success: true,
      job: 'run-predictive-analysis',
      stats: {
        usersAnalyzed: analyzed,
        insightsGenerated,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Predictive analysis failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleRollupOutreachAnalytics(res: ServerResponse): Promise<void> {
  try {
    log.info('Rolling up outreach analytics (Cloud Scheduler)');

    // Note: rollupDailyAnalytics not yet implemented in analytics module
    // Using pruneOldAnalyticsData as a maintenance task instead
    const { pruneOldAnalyticsData } = await import('../services/outreach/analytics.js');

    const prunedCount = pruneOldAnalyticsData(90); // Keep 90 days of data

    sendJson(res, 200, {
      success: true,
      job: 'rollup-outreach-analytics',
      prunedRecords: prunedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Outreach analytics rollup failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleResetWeeklyCounters(res: ServerResponse): Promise<void> {
  try {
    log.info('Resetting weekly outreach counters (Cloud Scheduler)');

    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    // Get all user outreach state documents
    const statesSnap = await db.collectionGroup('outreach_state').get();

    const batch = db.batch();
    let resetCount = 0;

    for (const doc of statesSnap.docs) {
      batch.update(doc.ref, {
        weeklyOutreachCount: 0,
        weekStartedAt: new Date().toISOString(),
      });
      resetCount++;

      // Firestore batches limited to 500
      if (resetCount % 450 === 0) {
        await batch.commit();
      }
    }

    // Commit remaining
    if (resetCount % 450 !== 0) {
      await batch.commit();
    }

    sendJson(res, 200, {
      success: true,
      job: 'reset-weekly-counters',
      stats: {
        usersReset: resetCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Weekly counter reset failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// BETTER THAN HUMAN OUTREACH (CONSOLIDATED)
// ============================================================================

/**
 * Consolidated Better Than Human outreach job.
 * Runs all proactive outreach systems in one go:
 * - Thinking of you moments
 * - Commitment follow-ups
 * - Growth reflections
 * - Life rhythm predictions
 * - Celebration deliveries
 *
 * This is THE superhuman capability - proactive care, not reactive response.
 */
async function handleBetterThanHumanOutreach(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  const stats = {
    usersProcessed: 0,
    thinkingOfYouSent: 0,
    commitmentFollowUpsSent: 0,
    growthReflectionsSent: 0,
    celebrationsSent: 0,
    errors: 0,
  };

  try {
    log.info('🚀 Starting BETTER THAN HUMAN outreach job');

    // 1. Run the thinking-of-you job from wellbeing-jobs
    const { runThinkingOfYouOutreach } = await import('../tasks/scheduled/wellbeing-jobs.js');
    const toyResult = await runThinkingOfYouOutreach();
    stats.usersProcessed += toyResult.usersProcessed;
    stats.thinkingOfYouSent += toyResult.outreachSent;
    stats.errors += toyResult.errors;

    // 2. Run commitment follow-ups
    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (db) {
      // Get commitments due for follow-up (due within next 24 hours or overdue)
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const commitmentsSnap = await db
        .collectionGroup('commitments')
        .where('status', '==', 'active')
        .where('dueDate', '<=', tomorrow.toISOString())
        .limit(100)
        .get();

      for (const doc of commitmentsSnap.docs) {
        try {
          const commitment = doc.data();
          const userId = doc.ref.parent.parent?.id;

          if (!userId) continue;

          // Send a gentle reminder via the outreach orchestrator
          const { getOutreachOrchestrator } =
            await import('../services/outreach/outreach-orchestrator.js');
          const orchestrator = getOutreachOrchestrator();

          // Use push notification for commitment follow-ups
          const sent = await orchestrator.sendPushNotification(
            userId,
            `Hey! Just thinking about your commitment: "${commitment.description}". How's it going?`,
            {
              trigger: 'commitment_followup',
              personaId: 'ferni',
              metadata: { commitmentId: doc.id },
            }
          );

          if (sent) {
            stats.commitmentFollowUpsSent++;
          }
        } catch (err) {
          stats.errors++;
          log.warn({ error: String(err), docId: doc.id }, 'Failed to process commitment follow-up');
        }
      }

      // 3. Growth reflections (for users who haven't had one in 7+ days)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const usersForGrowth = await db
        .collection('bogle_users')
        .where('lastGrowthReflection', '<', sevenDaysAgo.toISOString())
        .limit(50)
        .get();

      for (const userDoc of usersForGrowth.docs) {
        try {
          const userId = userDoc.id;

          // Trigger growth reflection outreach
          const { getOutreachOrchestrator } =
            await import('../services/outreach/outreach-orchestrator.js');
          const orchestrator = getOutreachOrchestrator();
          const sent = await orchestrator.triggerGrowthReflection(userId, 'ferni');

          if (sent) {
            stats.growthReflectionsSent++;

            // Update last growth reflection time
            await userDoc.ref.update({
              lastGrowthReflection: now.toISOString(),
            });
          }
        } catch (err) {
          stats.errors++;
          log.warn(
            { error: String(err), userId: userDoc.id },
            'Failed to trigger growth reflection'
          );
        }
      }

      // 4. Celebrations (recent milestones/achievements not yet celebrated)
      const { getMilestonesToCelebrate, acknowledgeMilestone } =
        await import('../services/superhuman/proactive-milestone-detector.js');

      // Get all users with recent activity
      const recentUsers = await db
        .collection('bogle_users')
        .where('lastActiveAt', '>=', sevenDaysAgo.toISOString())
        .limit(200)
        .get();

      for (const userDoc of recentUsers.docs) {
        try {
          const milestones = await getMilestonesToCelebrate(userDoc.id);

          for (const milestone of milestones.slice(0, 1)) {
            // Max 1 celebration per user per run
            const { getOutreachOrchestrator } =
              await import('../services/outreach/outreach-orchestrator.js');
            const orchestrator = getOutreachOrchestrator();

            // Send celebration via push notification
            const sent = await orchestrator.sendPushNotification(
              userDoc.id,
              `🎉 ${milestone.label}! ${milestone.celebrationSuggestion}`,
              {
                trigger: 'celebration',
                personaId: 'ferni',
                metadata: { milestoneType: milestone.type, significance: milestone.significance },
              }
            );

            if (sent) {
              stats.celebrationsSent++;
              await acknowledgeMilestone(userDoc.id, milestone.label, now.toISOString());
            }
          }
        } catch (err) {
          // Don't count as error - milestone detection is best-effort
          log.debug({ userId: userDoc.id }, 'No milestones to celebrate');
        }
      }
    }

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...stats,
        durationMs,
      },
      '✅ Better Than Human outreach job completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'better-than-human-outreach',
      stats,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Better Than Human outreach job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      partialStats: stats,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// INSIGHT ACTION PROCESSOR
// ============================================================================

/**
 * Process superhuman insights and trigger automated actions.
 * This bridges the insight-action system for AGI-like autonomous behavior.
 *
 * Flow:
 * 1. Gather recent insights from all superhuman services
 * 2. Evaluate against insight-action rules
 * 3. Execute matching actions (outreach, notifications, tasks)
 * 4. Record execution history for cooldown tracking
 */
async function handleProcessInsightActions(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  const stats = {
    insightsGathered: 0,
    rulesEvaluated: 0,
    actionsExecuted: 0,
    actionsSkipped: 0,
    errors: 0,
  };

  try {
    log.info('🧠 Starting insight action processor (Cloud Scheduler)');

    const { evaluateInsight, processInsights, INSIGHT_ACTION_RULES } =
      await import('../services/automation/insight-action-bridge.js');
    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      throw new Error('Firestore not available');
    }

    // Get recently active users
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const usersSnap = await db
      .collection('bogle_users')
      .where('lastActiveAt', '>=', sevenDaysAgo.toISOString())
      .limit(500)
      .get();

    const insights: SuperhumanInsight[] = [];

    // Gather insights from superhuman services for each user
    for (const userDoc of usersSnap.docs) {
      try {
        const userId = userDoc.id;

        // Check capacity guardian for burnout risk
        const capacitySnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('capacity')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        if (!capacitySnap.empty) {
          const capacity = capacitySnap.docs[0].data();
          if (capacity.level && capacity.level <= 4) {
            insights.push({
              id: `capacity_${userId}_${Date.now()}`,
              userId,
              capability: 'capacity_guardian',
              timestamp: new Date().toISOString(),
              data: { burnoutRisk: 1 - capacity.level / 10 },
            });
          }
        }

        // Check commitments for overdue items
        const commitmentsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('commitments')
          .where('status', '==', 'active')
          .where('dueDate', '<', new Date().toISOString())
          .limit(5)
          .get();

        if (!commitmentsSnap.empty) {
          insights.push({
            id: `commitment_${userId}_${Date.now()}`,
            userId,
            capability: 'commitment_keeper',
            timestamp: new Date().toISOString(),
            data: {
              commitmentOverdue: true,
              overdueCommitments: commitmentsSnap.docs.map((d) => d.data().description),
            },
          });
        }

        // Check relationship network for drift
        const relationshipsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('relationships')
          .orderBy('lastMentioned', 'asc')
          .limit(5)
          .get();

        for (const relDoc of relationshipsSnap.docs) {
          const rel = relDoc.data();
          const lastMentioned = new Date(rel.lastMentioned);
          const daysSince = (Date.now() - lastMentioned.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSince > 30 && (rel.importance === 'high' || rel.relationship === 'family')) {
            insights.push({
              id: `relationship_${userId}_${relDoc.id}_${Date.now()}`,
              userId,
              capability: 'relationship_network',
              timestamp: new Date().toISOString(),
              data: {
                driftScore: Math.min(daysSince / 60, 1),
                relationshipImportance: rel.importance === 'high' ? 0.9 : 0.7,
                relationshipName: rel.name,
              },
            });
          }
        }

        // Check dreams for dormant items
        const dreamsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('dreams')
          .where('dormant', '==', false)
          .limit(5)
          .get();

        for (const dreamDoc of dreamsSnap.docs) {
          const dream = dreamDoc.data();
          const lastMentioned = new Date(dream.lastMentioned || dream.createdAt);
          const daysSince = (Date.now() - lastMentioned.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSince > 30) {
            insights.push({
              id: `dream_${userId}_${dreamDoc.id}_${Date.now()}`,
              userId,
              capability: 'dream_keeper',
              timestamp: new Date().toISOString(),
              data: {
                dormantDays: daysSince,
                dreamImportance: dream.importance || 0.5,
                dreamDescription: dream.dream,
              },
            });
          }
        }

        stats.insightsGathered += insights.length;
      } catch (err) {
        stats.errors++;
        log.warn({ userId: userDoc.id, error: String(err) }, 'Failed to gather insights for user');
      }
    }

    // Process all gathered insights through the insight-action bridge
    const executions = await processInsights(insights);

    stats.rulesEvaluated = insights.length * INSIGHT_ACTION_RULES.length;
    stats.actionsExecuted = executions.filter((e) => e.status === 'completed').length;
    stats.actionsSkipped = executions.filter((e) => e.status !== 'completed').length;

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...stats,
        durationMs,
      },
      '✅ Insight action processor completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'process-insight-actions',
      stats,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Insight action processor failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      partialStats: stats,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// FAMILY CHECK-IN JOB HANDLER
// ============================================================================

/**
 * Family Check-in Calls Job
 *
 * Proactive outbound calling for family members' wellbeing.
 * This is triggered by Cloud Scheduler on a regular basis (e.g., hourly)
 * to check for due family check-in schedules and initiate calls.
 *
 * Flow:
 * 1. Get all due check-in schedules
 * 2. Initiate calls via LiveKit SIP or Twilio fallback
 * 3. Agent conducts natural check-in conversation
 * 4. Post-call analysis flags any concerns
 * 5. Urgent concerns notify sponsors immediately
 */
async function handleFamilyCheckinCalls(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🏠 Starting family check-in calls job (Cloud Scheduler)');

    const { runFamilyCheckinJob } = await import('../services/family/family-checkin-caller.js');

    const result = await runFamilyCheckinJob();

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...result,
        durationMs,
      },
      '✅ Family check-in calls job completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'family-checkin-calls',
      stats: {
        totalDue: result.totalDue,
        callsInitiated: result.callsInitiated,
        callsSucceeded: result.callsSucceeded,
        callsFailed: result.callsFailed,
        callsSkipped: result.callsSkipped,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Family check-in calls job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// DEEP INTELLIGENCE JOB HANDLERS
// ============================================================================

async function handleFlushMLState(res: ServerResponse): Promise<void> {
  try {
    log.info('Flushing ML model state to Firestore (Cloud Scheduler)');

    // Import persistence and data getters dynamically to avoid circular imports
    const { flushDirtyUsers } = await import('../intelligence/predictive/persistence.js');
    const { getMarkovDataForPersistence } =
      await import('../intelligence/predictive/markov-sequence-predictor.js');
    const { getTimeSeriesDataForPersistence } =
      await import('../intelligence/predictive/time-series-forecaster.js');
    const { getReinforcementDataForPersistence } =
      await import('../intelligence/predictive/reinforcement-learner.js');

    const result = await flushDirtyUsers(
      getMarkovDataForPersistence,
      getTimeSeriesDataForPersistence,
      getReinforcementDataForPersistence
    );

    sendJson(res, 200, {
      success: true,
      job: 'flush-ml-state',
      stats: {
        usersFlushed: result.flushed,
        errors: result.errors,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'ML state flush failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleRunDeepAnalysis(res: ServerResponse): Promise<void> {
  try {
    log.info('Running LLM deep analysis (Cloud Scheduler)');

    const { runDeepAnalysis, getLatestDeepAnalysis } =
      await import('../intelligence/predictive/llm-deep-analysis.js');

    // Get active users who need deep analysis
    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    // Find users who:
    // 1. Have been active recently
    // 2. Have enough conversation history
    // 3. Haven't had deep analysis in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const usersSnap = await db
      .collection('bogle_users')
      .where('lastActiveAt', '>=', sevenDaysAgo)
      .limit(50) // Process 50 users per run to control cost
      .get();

    let processed = 0;
    let skipped = 0;
    let totalTokens = 0;

    for (const doc of usersSnap.docs) {
      try {
        const userId = doc.id;

        // Check if user already has recent deep analysis
        const existingAnalysis = await getLatestDeepAnalysis(userId);
        if (existingAnalysis) {
          const analysisAge = Date.now() - existingAnalysis.timestamp.getTime();
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

          if (analysisAge < sevenDaysMs) {
            skipped++;
            continue; // Skip - analysis is fresh enough
          }
        }

        // Get conversation summaries from conversation_summaries collection
        const summariesSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('conversation_summaries')
          .orderBy('timestamp', 'desc')
          .limit(10)
          .get();

        if (summariesSnap.docs.length < 3) {
          skipped++; // Not enough history
          continue;
        }

        // Build input for deep analysis
        const conversationSummaries = summariesSnap.docs.map((d) => {
          const data = d.data();
          return {
            sessionId: d.id,
            date: data.timestamp?.toDate?.() || new Date(),
            topics: data.topics || [],
            emotionalArc: data.emotionalArc || 'neutral',
            keyMoments: data.keyMoments || [],
            unresolvedThreads: data.unresolvedThreads || [],
          };
        });

        // Run deep analysis
        const result = await runDeepAnalysis({
          userId,
          conversationSummaries,
          statisticalPatterns: [], // Could load from Markov/time-series
          userProfile: {
            name: doc.data().displayName,
            relationshipStage: doc.data().relationshipStage || 'acquaintance',
            knownConcerns: doc.data().knownConcerns || [],
            knownGoals: doc.data().knownGoals || [],
            communicationStyle: doc.data().communicationStyle || 'balanced',
          },
          analysisGoals: [
            'identify_unspoken_concerns',
            'predict_upcoming_challenge',
            'find_breakthrough_opportunity',
          ],
        });

        processed++;
        totalTokens += result.tokenUsage.input + result.tokenUsage.output;
      } catch (err) {
        log.warn({ userId: doc.id, error: String(err) }, 'Deep analysis failed for user');
        skipped++;
      }
    }

    sendJson(res, 200, {
      success: true,
      job: 'run-deep-analysis',
      stats: {
        processed,
        skipped,
        totalTokens,
        estimatedCost: `$${((totalTokens / 1000000) * 0.15).toFixed(4)}`, // ~$0.15/1M tokens
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Deep analysis job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// TTL CLEANUP JOB
// ============================================================================

/**
 * Run TTL cleanup for the semantic data store
 * Should be triggered daily via Cloud Scheduler
 */
async function handleTTLCleanup(res: ServerResponse): Promise<void> {
  try {
    log.info('Running TTL cleanup job (Cloud Scheduler)');

    const { runTTLCleanup } = await import('../services/data-hygiene/ttl-cleanup.js');

    // Run the cleanup
    const result = await runTTLCleanup();

    log.info(
      {
        totalDeleted: result.totalDeleted,
        totalErrors: result.totalErrors,
        collectionsProcessed: result.stats.length,
      },
      'TTL cleanup completed'
    );

    sendJson(res, 200, {
      success: result.success,
      job: 'ttl-cleanup',
      stats: {
        totalDeleted: result.totalDeleted,
        totalErrors: result.totalErrors,
        collectionsProcessed: result.stats.length,
        durationMs: result.durationMs,
        details: result.stats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'TTL cleanup job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Run TTL backfill migration to add expiresAt to existing documents
 * This is a one-time migration, run manually or via admin endpoint
 */
async function handleTTLBackfill(res: ServerResponse): Promise<void> {
  try {
    log.info('Running TTL backfill migration (Cloud Scheduler)');

    const { runTTLBackfill } = await import('../services/data-hygiene/ttl-backfill.js');

    // Run in non-dry-run mode
    const result = await runTTLBackfill({ dryRun: false });

    log.info(
      {
        totalUpdated: result.totalUpdated,
        totalSkipped: result.totalSkipped,
        totalErrors: result.totalErrors,
        collectionsProcessed: result.stats.length,
      },
      'TTL backfill completed'
    );

    sendJson(res, 200, {
      success: result.success,
      job: 'ttl-backfill',
      stats: {
        totalUpdated: result.totalUpdated,
        totalSkipped: result.totalSkipped,
        totalErrors: result.totalErrors,
        durationMs: result.durationMs,
        details: result.stats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'TTL backfill job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// ADMIN REPORTING HANDLERS
// ============================================================================

const ADMIN_REPORT_EMAIL = 'seth.ford@gmail.com';

async function handleDailyAdminReport(res: ServerResponse): Promise<void> {
  try {
    log.info('Running daily admin report job (Cloud Scheduler)');

    const { generateDailyReport } = await import('../services/admin/daily-report.js');
    const { generateDailyReportHTML, generateDailyReportPlainText } =
      await import('../services/admin/daily-report-template.js');
    const { sendEmail, isEmailDeliveryAvailable, initializeEmailDelivery } =
      await import('../services/outreach/delivery/email-delivery.js');

    // Initialize email if not already done
    if (!isEmailDeliveryAvailable()) {
      const apiKey = process.env.SENDGRID_API_KEY;
      if (!apiKey) {
        throw new Error('SENDGRID_API_KEY not configured');
      }
      initializeEmailDelivery({
        provider: 'sendgrid',
        apiKey,
        fromEmail: process.env.SENDGRID_FROM_EMAIL || 'hello@ferni.ai',
        fromName: process.env.SENDGRID_FROM_NAME || 'Ferni',
        trackOpens: true,
        trackClicks: true,
      });
    }

    // Generate the report (yesterday's data)
    const reportData = await generateDailyReport();

    // Generate HTML and plain text versions
    const html = generateDailyReportHTML(reportData);
    const plainText = generateDailyReportPlainText(reportData);

    // Send the email
    const emailResult = await sendEmail({
      to: ADMIN_REPORT_EMAIL,
      toName: 'Seth Ford',
      subject: `Ferni Daily Report - ${reportData.date}`,
      body: plainText,
      html,
      personaId: 'ferni',
      userId: 'admin-reports',
      outreachId: `daily-report-${reportData.date}`,
      preheader: `${reportData.visitors.unique} visitors, ${reportData.callers.total} calls`,
    });

    if (!emailResult.success) {
      throw new Error(emailResult.error || 'Failed to send email');
    }

    log.info(
      {
        date: reportData.date,
        visitors: reportData.visitors.unique,
        sessions: reportData.visitors.totalSessions,
        calls: reportData.callers.total,
        messageId: emailResult.messageId,
      },
      'Daily admin report sent successfully'
    );

    sendJson(res, 200, {
      success: true,
      job: 'daily-admin-report',
      stats: {
        date: reportData.date,
        uniqueVisitors: reportData.visitors.unique,
        totalSessions: reportData.visitors.totalSessions,
        phoneCalls: reportData.callers.total,
        emailSentTo: ADMIN_REPORT_EMAIL,
        messageId: emailResult.messageId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Daily admin report job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// MEMORY MAINTENANCE JOB HANDLERS
// ============================================================================

/**
 * Memory Consolidation Job Handler
 *
 * Consolidates related memories to reduce storage and improve retrieval.
 * Runs weekly to compress similar memories into richer representations.
 */
async function handleMemoryConsolidation(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🧠 Running memory consolidation job (Cloud Scheduler)');

    const { MemoryConsolidationJob } = await import('../tasks/scheduled/memory-jobs.js');

    const job = new MemoryConsolidationJob();
    const result = await job.run({
      dryRun: false,
      minMemoriesForConsolidation: 20,
      similarityThreshold: 0.7,
      maxMemoriesToProcess: 100,
      maxUsersPerRun: 50,
    });

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...result,
        durationMs,
      },
      '✅ Memory consolidation job completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'memory-consolidation',
      stats: {
        memoriesAnalyzed: result.memoriesAnalyzed,
        groupsConsolidated: result.groupsConsolidated,
        memoriesCompressed: result.memoriesCompressed,
        bytesRecovered: result.bytesRecovered,
        usersProcessed: result.usersProcessed,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Memory consolidation job failed');
    sendJson(res, 500, {
      success: false,
      job: 'memory-consolidation',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Memory Decay Job Handler
 *
 * Applies graceful forgetting to old memories, allowing less important
 * memories to fade while preserving emotionally significant ones.
 * Runs daily to maintain healthy memory state.
 */
async function handleMemoryDecay(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🧠 Running memory decay job (Cloud Scheduler)');

    const { MemoryDecayJob } = await import('../tasks/scheduled/memory-jobs.js');

    const job = new MemoryDecayJob();
    const result = await job.run({
      dryRun: false,
      archiveThreshold: 0.1,
      protectEmotional: true,
      maxMemoriesToProcess: 500,
      maxUsersPerRun: 100,
    });

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...result,
        durationMs,
      },
      '✅ Memory decay job completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'memory-decay',
      stats: {
        memoriesDecayed: result.memoriesDecayed,
        memoriesPruned: result.memoriesPruned,
        averageStrengthBefore: result.averageStrengthBefore,
        averageStrengthAfter: result.averageStrengthAfter,
        usersProcessed: result.usersProcessed,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Memory decay job failed');
    sendJson(res, 500, {
      success: false,
      job: 'memory-decay',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Memory Deduplication Job Handler
 *
 * Finds and handles duplicate or near-duplicate memories using LSH
 * (Locality-Sensitive Hashing) for O(n) performance.
 * Runs weekly to prevent storage bloat and retrieval confusion.
 */
async function handleMemoryDeduplication(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🧠 Running memory deduplication job (Cloud Scheduler)');

    const { MemoryDeduplicationJob } = await import('../tasks/scheduled/memory-jobs.js');

    const job = new MemoryDeduplicationJob();
    const result = await job.run({
      dryRun: false,
      exactDuplicateThreshold: 0.95,
      strategy: 'merge',
      maxMemoriesToScan: 200,
      maxUsersPerRun: 50,
    });

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...result,
        durationMs,
      },
      '✅ Memory deduplication job completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'memory-deduplication',
      stats: {
        memoriesScanned: result.memoriesScanned,
        duplicatesFound: result.duplicatesFound,
        memoriesMerged: result.memoriesMerged,
        memoriesDeleted: result.memoriesDeleted,
        usersProcessed: result.usersProcessed,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Memory deduplication job failed');
    sendJson(res, 500, {
      success: false,
      job: 'memory-deduplication',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Memory Health Check Job Handler
 *
 * Collects metrics and checks for health issues in the memory system.
 * Runs every 4 hours to monitor system health and send alerts.
 */
async function handleMemoryHealthCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🧠 Running memory health check job (Cloud Scheduler)');

    const { MemoryHealthCheckJob } = await import('../tasks/scheduled/memory-jobs.js');

    const job = new MemoryHealthCheckJob();
    const result = await job.run({
      dryRun: false,
      sendAlerts: true,
    });

    const durationMs = Date.now() - startTime;

    // Determine overall status based on health score
    const status =
      result.healthScore >= 80 ? 'healthy' : result.healthScore >= 50 ? 'degraded' : 'unhealthy';

    log.info(
      {
        healthScore: result.healthScore,
        alertCount: result.alerts.length,
        status,
        durationMs,
      },
      '✅ Memory health check completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'memory-health-check',
      status,
      healthScore: result.healthScore,
      alerts: result.alerts.map((a) => ({
        severity: a.severity,
        message: a.message,
      })),
      metrics: {
        storage: result.metrics.storage,
        embedding: result.metrics.embedding,
        retrieval: result.metrics.retrieval,
        deduplication: result.metrics.deduplication,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Memory health check job failed');
    sendJson(res, 500, {
      success: false,
      job: 'memory-health-check',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// PREDICTIVE INTELLIGENCE JOB HANDLERS
// ============================================================================

/**
 * LLM Deep Analysis Job Handler
 *
 * Runs Gemini-powered deep analysis on user conversation history.
 * This is TIER 3 intelligence - designed to run in batch mode during off-peak hours.
 *
 * "Better Than Human" - We see patterns humans can't see because we
 * remember EVERYTHING and can connect dots across months.
 */
async function handleDeepAnalysis(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🧠 Running LLM deep analysis job (Cloud Scheduler)');

    const { runDeepAnalysisJob } = await import('../tasks/scheduled/deep-analysis-job.js');

    const result = await runDeepAnalysisJob({
      dryRun: false,
    });

    const durationMs = Date.now() - startTime;

    log.info(
      {
        usersProcessed: result.usersProcessed,
        insightsGenerated: result.insightsGenerated,
        hypothesesGenerated: result.hypothesesGenerated,
        errors: result.errors,
        durationMs,
      },
      '✅ LLM deep analysis completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'deep-analysis',
      stats: {
        usersProcessed: result.usersProcessed,
        usersSkipped: result.usersSkipped,
        insightsGenerated: result.insightsGenerated,
        hypothesesGenerated: result.hypothesesGenerated,
        errors: result.errors,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'LLM deep analysis job failed');
    sendJson(res, 500, {
      success: false,
      job: 'deep-analysis',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// KNOWLEDGE GRAPH JOB HANDLERS
// ============================================================================

/**
 * Knowledge Graph Insight Generation Job Handler
 *
 * Detects patterns, correlations, and generates insights from the knowledge graph.
 * Runs daily to surface meaningful connections in user data.
 */
async function handleKnowledgeGraphInsights(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🧠 Running knowledge graph insight generation job (Cloud Scheduler)');

    const { InsightGenerationJob } = await import('../tasks/scheduled/knowledge-graph-jobs.js');

    const job = new InsightGenerationJob();
    const result = await job.run({
      dryRun: false,
      maxUsers: 50,
      minObservations: 5,
      minStrength: 0.5,
    });

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...result,
        durationMs,
      },
      '✅ Knowledge graph insight generation completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'knowledge-graph-insights',
      stats: {
        processedUsers: result.processedUsers,
        totalInsights: result.totalInsights,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Knowledge graph insight generation failed');
    sendJson(res, 500, {
      success: false,
      job: 'knowledge-graph-insights',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Knowledge Graph Consolidation Job Handler
 *
 * Merges duplicate entities and cleans up orphaned references.
 * Runs weekly to maintain knowledge graph quality.
 */
async function handleKnowledgeGraphConsolidation(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🧠 Running knowledge graph consolidation job (Cloud Scheduler)');

    const { ConsolidationJob } = await import('../tasks/scheduled/knowledge-graph-jobs.js');

    const job = new ConsolidationJob();
    const result = await job.run({
      dryRun: false,
      maxUsers: 100,
      decayRate: 0.02,
      archiveThreshold: 0.05,
    });

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...result,
        durationMs,
      },
      '✅ Knowledge graph consolidation completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'knowledge-graph-consolidation',
      stats: {
        processedUsers: result.processedUsers,
        entitiesMerged: result.entitiesMerged,
        entitiesDecayed: result.entitiesDecayed,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Knowledge graph consolidation failed');
    sendJson(res, 500, {
      success: false,
      job: 'knowledge-graph-consolidation',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Knowledge Graph Thread Maintenance Job Handler
 *
 * Marks dormant conversation threads and cleans up expired ones.
 * Runs daily to maintain thread quality.
 */
async function handleKnowledgeGraphThreadMaintenance(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🧠 Running knowledge graph thread maintenance job (Cloud Scheduler)');

    const { ThreadMaintenanceJob } = await import('../tasks/scheduled/knowledge-graph-jobs.js');

    const job = new ThreadMaintenanceJob();
    const result = await job.run({
      dryRun: false,
      maxUsers: 100,
      dormantAfterDays: 30,
    });

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...result,
        durationMs,
      },
      '✅ Knowledge graph thread maintenance completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'knowledge-graph-thread-maintenance',
      stats: {
        processedUsers: result.processedUsers,
        threadsDormant: result.threadsDormant,
        insightsExpired: result.insightsExpired,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Knowledge graph thread maintenance failed');
    sendJson(res, 500, {
      success: false,
      job: 'knowledge-graph-thread-maintenance',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Knowledge Graph Entity Decay Job Handler
 *
 * Applies memory decay to entities based on recency and importance.
 * Runs daily to implement graceful forgetting at the entity level.
 */
async function handleKnowledgeGraphEntityDecay(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🧠 Running knowledge graph entity decay job (Cloud Scheduler)');

    const { EntityDecayJob } = await import('../tasks/scheduled/knowledge-graph-jobs.js');

    const job = new EntityDecayJob();
    const result = await job.run({
      dryRun: false,
      maxUsers: 100,
      baseDecayRate: 0.05,
      recentMentionProtectionDays: 7,
      emotionalProtection: 0.5,
    });

    const durationMs = Date.now() - startTime;

    log.info(
      {
        ...result,
        durationMs,
      },
      '✅ Knowledge graph entity decay completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'knowledge-graph-entity-decay',
      stats: {
        processedUsers: result.processedUsers,
        entitiesDecayed: result.entitiesDecayed,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Knowledge graph entity decay failed');
    sendJson(res, 500, {
      success: false,
      job: 'knowledge-graph-entity-decay',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// P2 UTO FIX (January 2026): SEMANTIC ROUTER LEARNING
// ============================================================================

/**
 * Semantic Router Learning Job Handler
 *
 * Runs batch learning for the semantic router to improve tool routing accuracy:
 * 1. Updates confidence calibration from accumulated feedback
 * 2. Consolidates learned user patterns
 * 3. Prunes low-confidence vocabulary entries
 *
 * This is the missing "wire" that connects recorded outcomes to actual
 * calibration improvements.
 */
async function handleSemanticRouterLearning(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🎯 Running semantic router learning job (Cloud Scheduler)');

    const { runBatchLearning, getFeedbackStats } =
      await import('../tools/semantic-router/advanced/learning-loop.js');

    // Run batch learning (updates calibration, consolidates patterns, prunes vocab)
    const result = await runBatchLearning();

    // Get stats for reporting
    const stats = getFeedbackStats();

    const durationMs = Date.now() - startTime;

    log.info(
      {
        calibrationUpdated: result.calibrationUpdated,
        patternsConsolidated: result.patternsConsolidated,
        vocabularyPruned: result.vocabularyPruned,
        feedbackStats: stats,
        durationMs,
      },
      '✅ Semantic router learning completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'semantic-router-learning',
      stats: {
        calibrationUpdated: result.calibrationUpdated,
        patternsConsolidated: result.patternsConsolidated,
        vocabularyPruned: result.vocabularyPruned,
        totalFeedback: stats.totalFeedback,
        correctionRate: `${(stats.correctionRate * 100).toFixed(1)}%`,
        successRate: `${(stats.successRate * 100).toFixed(1)}%`,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Semantic router learning failed');
    sendJson(res, 500, {
      success: false,
      job: 'semantic-router-learning',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// BRAND AUTOMATION JOB HANDLERS
// ============================================================================

/**
 * Brand automation job handlers use Firestore for data storage on the server.
 * The CLI commands (ferni brand *) use local JSON files (~/.ferni/*.json).
 *
 * These handlers are designed to:
 * 1. Read brand data from Firestore (brand_awards, brand_workstreams, etc.)
 * 2. Send Slack notifications for reminders and alerts
 * 3. Persist metrics back to Firestore
 */

interface BrandAward {
  id: string;
  name: string;
  deadline: string;
  status: string;
  fee?: number;
}

interface BrandWorkstream {
  id: string;
  name: string;
  status: string;
  updatedAt?: string;
  tasks: Array<{ id: string; completed: boolean }>;
}

interface BrandMilestone {
  id: string;
  name: string;
  date: string;
  celebrated?: boolean;
  description?: string;
}

interface BrandAmbassador {
  id: string;
  name: string;
  email?: string;
  lastActivityAt?: string;
}

interface UserStory {
  id: string;
  approved?: boolean;
}

/**
 * Helper to send Slack messages
 */
async function sendSlackMessage(message: string, emoji = ':seedling:'): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    log.debug('SLACK_WEBHOOK_URL not configured, skipping notification');
    return false;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        username: 'Ferni Brand Bot',
        icon_emoji: emoji,
      }),
    });
    return true;
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to send Slack message');
    return false;
  }
}

/**
 * Award Deadline Check Job Handler
 *
 * Checks for upcoming award deadlines and sends Slack alerts.
 * Runs daily at 9 AM to catch deadlines within 14 days.
 */
async function handleBrandAwardDeadlineCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🏆 Running brand award deadline check (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    let awards: BrandAward[] = [];
    if (db) {
      const snapshot = await db.collection('brand_awards').get();
      awards = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandAward);
    }

    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Filter awards with upcoming deadlines
    const upcomingAwards = awards.filter((award) => {
      if (!award.deadline || award.status === 'submitted' || award.status === 'won') {
        return false;
      }
      const deadline = new Date(award.deadline);
      return deadline <= fourteenDaysFromNow && deadline >= now;
    });

    let alertsSent = 0;
    for (const award of upcomingAwards) {
      const deadline = new Date(award.deadline);
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const emoji = daysUntil <= 3 ? '🚨' : daysUntil <= 7 ? '⚠️' : '⏰';
      const message = `${emoji} *${award.name}* deadline in *${daysUntil} days* (${award.deadline})\nStatus: ${award.status || 'researching'}\nFee: ${award.fee || 'TBD'}`;

      if (await sendSlackMessage(message, ':trophy:')) {
        alertsSent++;
      }
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-award-deadline-check',
      stats: {
        totalAwards: awards.length,
        upcomingDeadlines: upcomingAwards.length,
        alertsSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand award deadline check failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Story Review Reminder Job Handler
 *
 * Reminds team to review pending user stories.
 * Runs Monday/Thursday at 10 AM.
 */
async function handleBrandStoryReviewReminder(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('📖 Running brand story review reminder (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    let stories: UserStory[] = [];
    if (db) {
      const snapshot = await db.collection('brand_user_stories').get();
      stories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as UserStory);
    }

    const pendingStories = stories.filter((story) => !story.approved);

    let alertSent = false;
    if (pendingStories.length > 0) {
      const message = `📖 *${pendingStories.length} stories* pending review\n\nRun \`ferni community stories\` to review.`;
      alertSent = await sendSlackMessage(message, ':book:');
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-story-review-reminder',
      stats: {
        totalStories: stories.length,
        pendingReview: pendingStories.length,
        alertSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand story review reminder failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Workstream Progress Report Job Handler
 *
 * Generates and sends weekly workstream progress report.
 * Runs Monday at 9 AM.
 */
async function handleBrandWorkstreamProgress(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('📊 Running brand workstream progress report (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    let workstreams: BrandWorkstream[] = [];
    if (db) {
      const snapshot = await db.collection('brand_workstreams').get();
      workstreams = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandWorkstream);
    }

    // Calculate stats
    const stats = {
      total: workstreams.length,
      notStarted: workstreams.filter((w) => w.status === 'not_started').length,
      inProgress: workstreams.filter((w) => w.status === 'in_progress').length,
      completed: workstreams.filter((w) => w.status === 'completed').length,
    };

    // Find stale workstreams (no update in 14+ days)
    const now = new Date();
    const staleWorkstreams = workstreams.filter((w) => {
      if (w.status !== 'in_progress' || !w.updatedAt) return false;
      const lastUpdate = new Date(w.updatedAt);
      const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 14;
    });

    let message = `📊 *Weekly Workstream Progress*\n\n`;
    message += `• Total: ${stats.total}\n`;
    message += `• Not Started: ${stats.notStarted}\n`;
    message += `• In Progress: ${stats.inProgress}\n`;
    message += `• Completed: ${stats.completed}\n`;

    if (staleWorkstreams.length > 0) {
      message += `\n⚠️ *${staleWorkstreams.length} workstreams stale* (no update in 14+ days):\n`;
      for (const ws of staleWorkstreams.slice(0, 5)) {
        message += `  • ${ws.name}\n`;
      }
    }

    const alertSent = await sendSlackMessage(message, ':bar_chart:');

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-workstream-progress',
      stats: {
        ...stats,
        staleCount: staleWorkstreams.length,
        alertSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand workstream progress report failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Milestone Check Job Handler
 *
 * Checks for milestones to celebrate and posts to Slack.
 * Runs daily at 10 AM.
 */
async function handleBrandMilestoneCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🎉 Running brand milestone check (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    let milestones: BrandMilestone[] = [];
    if (db) {
      const snapshot = await db.collection('brand_milestones').get();
      milestones = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandMilestone);
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Find milestones happening today
    const todayMilestones = milestones.filter((m) => {
      const milestoneDate = new Date(m.date).toISOString().split('T')[0];
      return milestoneDate === todayStr && !m.celebrated;
    });

    let celebrationsSent = 0;
    let socialPostsSent = 0;
    for (const milestone of todayMilestones) {
      const message = `🎉 *Today's Milestone: ${milestone.name}*\n\n${milestone.description || 'Time to celebrate!'}`;
      if (await sendSlackMessage(message, ':tada:')) {
        celebrationsSent++;
      }

      // Post to social media
      try {
        const { postMilestoneCelebration } = await import('../services/social/social-service.js');
        const socialResult = await postMilestoneCelebration({
          name: milestone.name,
          description: milestone.description,
          date: milestone.date,
        });
        socialPostsSent += socialResult.successCount;
        log.info('Milestone posted to social', {
          milestone: milestone.name,
          platforms: socialResult.results.map((r) => r.platform),
          success: socialResult.successCount,
        });
      } catch (socialError) {
        log.warn('Social posting failed for milestone', { error: String(socialError) });
      }

      // Mark milestone as celebrated
      if (db) {
        await db.collection('brand_milestones').doc(milestone.id).update({ celebrated: true });
      }
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-milestone-check',
      stats: {
        totalMilestones: milestones.length,
        todayMilestones: todayMilestones.length,
        celebrationsSent,
        socialPostsSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand milestone check failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Ambassador Engagement Check Job Handler
 *
 * Checks for inactive ambassadors and sends re-engagement reminders.
 * Runs on the 1st of each month at 9 AM.
 */
async function handleBrandAmbassadorEngagement(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🌟 Running brand ambassador engagement check (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    let ambassadors: BrandAmbassador[] = [];
    if (db) {
      const snapshot = await db.collection('brand_ambassadors').get();
      ambassadors = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandAmbassador);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Find inactive ambassadors
    const inactiveAmbassadors = ambassadors.filter((a) => {
      if (!a.lastActivityAt) return true;
      const lastActive = new Date(a.lastActivityAt);
      return lastActive < thirtyDaysAgo;
    });

    const activeAmbassadors = ambassadors.filter((a) => {
      if (!a.lastActivityAt) return false;
      const lastActive = new Date(a.lastActivityAt);
      return lastActive >= thirtyDaysAgo;
    });

    let message = `🌟 *Ambassador Engagement Report*\n\n`;
    message += `• Total Ambassadors: ${ambassadors.length}\n`;
    message += `• Active (last 30d): ${activeAmbassadors.length}\n`;
    message += `• Inactive: ${inactiveAmbassadors.length}\n`;

    if (inactiveAmbassadors.length > 0) {
      message += `\n📧 *Consider re-engagement outreach for:*\n`;
      for (const amb of inactiveAmbassadors.slice(0, 5)) {
        message += `  • ${amb.name}${amb.email ? ` (${amb.email})` : ''}\n`;
      }
    }

    const alertSent = await sendSlackMessage(message, ':star:');

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-ambassador-engagement',
      stats: {
        totalAmbassadors: ambassadors.length,
        activeCount: activeAmbassadors.length,
        inactiveCount: inactiveAmbassadors.length,
        alertSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand ambassador engagement check failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Metrics Collection Job Handler
 *
 * Collects and persists daily brand metrics.
 * Runs daily at midnight.
 */
async function handleBrandMetricsCollection(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('📈 Running brand metrics collection (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      sendJson(res, 200, {
        success: true,
        job: 'brand-metrics-collection',
        message: 'Firestore not available - metrics collection skipped',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Collect metrics from Firestore collections
    const [awardsSnap, workstreamsSnap, storiesSnap, ambassadorsSnap] = await Promise.all([
      db.collection('brand_awards').get(),
      db.collection('brand_workstreams').get(),
      db.collection('brand_user_stories').get(),
      db.collection('brand_ambassadors').get(),
    ]);

    const awards = awardsSnap.docs.map((doc) => doc.data() as BrandAward);
    const workstreams = workstreamsSnap.docs.map((doc) => doc.data() as BrandWorkstream);
    const stories = storiesSnap.docs.map((doc) => doc.data() as UserStory);

    const metrics = {
      timestamp: new Date().toISOString(),
      awards: {
        tracked: awards.length,
        submitted: awards.filter((a) => a.status === 'submitted').length,
        shortlisted: awards.filter((a) => a.status === 'shortlisted').length,
        won: awards.filter((a) => a.status === 'won').length,
      },
      community: {
        storiesCollected: stories.length,
        storiesApproved: stories.filter((s) => s.approved).length,
        ambassadorsTotal: ambassadorsSnap.size,
      },
      workstreams: {
        total: workstreams.length,
        notStarted: workstreams.filter((w) => w.status === 'not_started').length,
        inProgress: workstreams.filter((w) => w.status === 'in_progress').length,
        completed: workstreams.filter((w) => w.status === 'completed').length,
      },
    };

    // Persist metrics to Firestore
    await db.collection('brand_metrics').add(metrics);
    log.info('Brand metrics persisted to Firestore');

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-metrics-collection',
      metrics,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand metrics collection failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Weekly Report Job Handler
 *
 * Generates and sends the comprehensive weekly brand report.
 * Runs Monday at 9 AM.
 */
async function handleBrandWeeklyReport(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('📋 Running brand weekly report (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    // Collect data from Firestore or use empty arrays
    let awards: BrandAward[] = [];
    let workstreams: BrandWorkstream[] = [];
    let stories: UserStory[] = [];
    let ambassadorsCount = 0;

    if (db) {
      const [awardsSnap, workstreamsSnap, storiesSnap, ambassadorsSnap] = await Promise.all([
        db.collection('brand_awards').get(),
        db.collection('brand_workstreams').get(),
        db.collection('brand_user_stories').get(),
        db.collection('brand_ambassadors').get(),
      ]);

      awards = awardsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandAward);
      workstreams = workstreamsSnap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as BrandWorkstream
      );
      stories = storiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as UserStory);
      ambassadorsCount = ambassadorsSnap.size;
    }

    const now = new Date();

    // Build report
    let report = `🌿 *Brand Evolution Weekly Report*\n`;
    report += `Week of ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n\n`;

    // Awards section
    report += `*🏆 Awards*\n`;
    report += `• Tracked: ${awards.length}\n`;
    report += `• Submitted: ${awards.filter((a) => a.status === 'submitted').length}\n`;
    report += `• Won: ${awards.filter((a) => a.status === 'won').length}\n`;

    const upcomingAwards = awards.filter((a) => {
      if (!a.deadline) return false;
      const deadline = new Date(a.deadline);
      return deadline >= now && deadline <= new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    });
    if (upcomingAwards.length > 0) {
      report += `• ⏰ Upcoming: ${upcomingAwards.map((a) => a.name).join(', ')}\n`;
    }

    // Community section
    report += `\n*🏘️ Community*\n`;
    report += `• Stories: ${stories.filter((s) => s.approved).length} approved\n`;
    report += `• Ambassadors: ${ambassadorsCount} total\n`;

    // Workstreams section
    report += `\n*📋 Workstreams*\n`;
    report += `• Total: ${workstreams.length}\n`;
    report += `• In Progress: ${workstreams.filter((w) => w.status === 'in_progress').length}\n`;
    report += `• Completed: ${workstreams.filter((w) => w.status === 'completed').length}\n`;

    // Find stale workstreams
    const staleWorkstreams = workstreams.filter((w) => {
      if (w.status !== 'in_progress' || !w.updatedAt) return false;
      const lastUpdate = new Date(w.updatedAt);
      const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 14;
    });
    if (staleWorkstreams.length > 0) {
      report += `• ⚠️ Stale: ${staleWorkstreams.length} (no update in 14+ days)\n`;
    }

    const reportSent = await sendSlackMessage(report, ':seedling:');

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-weekly-report',
      stats: {
        awardsTracked: awards.length,
        storiesCount: stories.length,
        workstreamsCount: workstreams.length,
        ambassadorsCount,
        reportSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand weekly report failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Publish Approved Stories Job Handler
 *
 * Publishes approved stories to social media (Twitter, LinkedIn, Discord).
 * Only publishes stories that have been approved but not yet published.
 * Runs daily at 11 AM.
 */
async function handleBrandPublishStories(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('📢 Running brand story publishing (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    interface UserStoryDoc {
      id: string;
      userName: string;
      story: string;
      quote?: string;
      approved?: boolean;
      publishedToSocial?: boolean;
      source?: string;
      createdAt?: string;
    }

    let stories: UserStoryDoc[] = [];
    if (db) {
      const snapshot = await db.collection('brand_user_stories').get();
      stories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as UserStoryDoc);
    }

    // Find approved stories not yet published to social
    const unpublishedStories = stories.filter((s) => s.approved && !s.publishedToSocial);

    let storiesPublished = 0;
    let socialPostsSent = 0;

    // Publish max 3 stories per run to avoid flooding
    const storiesToPublish = unpublishedStories.slice(0, 3);

    for (const story of storiesToPublish) {
      try {
        const { postUserStory } = await import('../services/social/social-service.js');

        // Use quote if available, otherwise use first 200 chars of story
        const quote =
          story.quote || story.story.substring(0, 200) + (story.story.length > 200 ? '...' : '');

        const socialResult = await postUserStory({
          userName: story.userName,
          quote,
        });

        if (socialResult.successCount > 0) {
          storiesPublished++;
          socialPostsSent += socialResult.successCount;

          // Mark as published
          if (db) {
            await db
              .collection('brand_user_stories')
              .doc(story.id)
              .update({
                publishedToSocial: true,
                publishedAt: new Date().toISOString(),
                socialPlatforms: socialResult.results
                  .filter((r) => r.success)
                  .map((r) => r.platform),
              });
          }

          log.info('Story published to social', {
            storyId: story.id,
            userName: story.userName,
            platforms: socialResult.results.map((r) => r.platform),
            success: socialResult.successCount,
          });
        }
      } catch (storyError) {
        log.warn('Failed to publish story to social', {
          storyId: story.id,
          error: String(storyError),
        });
      }
    }

    // Notify Slack about publications
    if (storiesPublished > 0) {
      await sendSlackMessage(
        `📢 Published ${storiesPublished} user stories to social media (${socialPostsSent} total posts)`,
        ':mega:'
      );
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-publish-stories',
      stats: {
        totalStories: stories.length,
        approvedUnpublished: unpublishedStories.length,
        storiesPublished,
        socialPostsSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand story publishing failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// GTM (GO-TO-MARKET) CONTENT AUTOMATION JOB HANDLERS
// ============================================================================

/**
 * GTM Daily Publishing Job Handler
 *
 * Autonomous content generation and publishing to all social platforms.
 * Uses AI to generate brand-aligned content and posts to Twitter, LinkedIn, Discord.
 * Runs daily at 9 AM.
 */
async function handleGTMDailyPublishing(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('🚀 Running GTM daily publishing (Cloud Scheduler)');

    const { runDailyPublishing, getGTMStatus } = await import('../services/gtm/gtm-service.js');

    // Get pre-run status
    const preStatus = await getGTMStatus();

    // Run the daily publishing job
    const result = await runDailyPublishing();

    // Get post-run status
    const postStatus = await getGTMStatus();

    // Notify Slack about the publishing run
    if (result.published > 0 || result.generated > 0) {
      await sendSlackMessage(
        `📣 GTM Publishing Complete:\n• Generated: ${result.generated} content pieces\n• Published: ${result.published} posts\n• Platforms: Twitter, LinkedIn, Discord`,
        ':mega:'
      );
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: result.success,
      job: 'gtm-daily-publishing',
      stats: {
        generated: result.generated,
        published: result.published,
        errors: result.errors.length,
        pendingContent: postStatus.pendingEntries,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
      suggestion: postStatus.suggestion,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'GTM daily publishing failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * GTM Weekly Content Generation Job Handler
 *
 * Generates content calendar entries for the upcoming week.
 * Uses AI to create brand-aligned content for each day based on the weekly schedule.
 * Runs Sunday at 8 AM.
 */
async function handleGTMWeeklyContent(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('📅 Running GTM weekly content generation (Cloud Scheduler)');

    const { generateWeeklyContent, getCalendarStats } =
      await import('../services/gtm/gtm-service.js');

    // Get next week's start date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Generate content for the week
    const result = await generateWeeklyContent(tomorrow);

    // Get calendar stats
    const stats = getCalendarStats();

    // Notify Slack
    if (result.content.length > 0) {
      const contentList = result.content
        .map((c) => `• ${c.brief.category}: "${c.title.substring(0, 50)}..."`)
        .join('\n');

      await sendSlackMessage(
        `📅 Weekly Content Generated:\n${contentList}\n\nTotal pending: ${stats.byStatus['in-progress'] + stats.byStatus.ready}`,
        ':calendar:'
      );
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: result.success,
      job: 'gtm-weekly-content',
      stats: {
        entriesCreated: result.entries,
        contentGenerated: result.content.length,
        calendarStats: {
          planned: stats.byStatus.planned,
          inProgress: stats.byStatus['in-progress'],
          ready: stats.byStatus.ready,
          published: stats.byStatus.published,
        },
      },
      contentTitles: result.content.map((c) => c.title),
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'GTM weekly content generation failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// SEMANTIC ROUTER RETRAINING HANDLERS
// ============================================================================

async function handleSemanticRouterRetrain(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  try {
    log.info('Starting semantic router daily retraining (Cloud Scheduler)');

    const { handleScheduledRetraining } =
      await import('../tools/semantic-router/learning/retraining-pipeline.js');
    const result = await handleScheduledRetraining();

    const durationMs = Date.now() - startTime;
    log.info(
      { success: result.success, durationMs, stats: result.result?.stats },
      'Semantic router retraining complete'
    );

    sendJson(res, result.success ? 200 : 500, {
      success: result.success,
      job: 'semantic-router-retrain',
      trigger: 'scheduled',
      result: result.result,
      error: result.error,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Semantic router retraining failed');
    sendJson(res, 500, {
      success: false,
      job: 'semantic-router-retrain',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }
}

async function handleSemanticRouterVolumeCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  try {
    log.info('Checking semantic router volume-based trigger (Cloud Scheduler)');

    const { handleVolumeBasedRetraining } =
      await import('../tools/semantic-router/learning/retraining-pipeline.js');
    const result = await handleVolumeBasedRetraining();

    const durationMs = Date.now() - startTime;
    log.info(
      { triggered: result.triggered, success: result.success, durationMs },
      'Semantic router volume check complete'
    );

    sendJson(res, result.success ? 200 : 500, {
      success: result.success,
      job: 'semantic-router-volume-check',
      triggered: result.triggered,
      result: result.result,
      error: result.error,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Semantic router volume check failed');
    sendJson(res, 500, {
      success: false,
      job: 'semantic-router-volume-check',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }
}

async function handleSemanticRouterQualityCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  try {
    log.info('Checking semantic router quality-based trigger (Cloud Scheduler)');

    const { handleQualityBasedRetraining } =
      await import('../tools/semantic-router/learning/retraining-pipeline.js');
    const result = await handleQualityBasedRetraining();

    const durationMs = Date.now() - startTime;
    log.info(
      { triggered: result.triggered, success: result.success, durationMs },
      'Semantic router quality check complete'
    );

    sendJson(res, result.success ? 200 : 500, {
      success: result.success,
      job: 'semantic-router-quality-check',
      triggered: result.triggered,
      result: result.result,
      error: result.error,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Semantic router quality check failed');
    sendJson(res, 500, {
      success: false,
      job: 'semantic-router-quality-check',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }
}

async function handleSemanticRouterHealth(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  try {
    log.info('Checking semantic router retraining health (Cloud Scheduler)');

    const { getRetrainingPipeline } =
      await import('../tools/semantic-router/learning/retraining-pipeline.js');
    const pipeline = getRetrainingPipeline();
    const status = await pipeline.getStatus();

    const durationMs = Date.now() - startTime;

    // Determine health status
    const isHealthy =
      !status.isRunning && // Not stuck in running state
      (status.lastResult === null || status.lastResult.success); // No failed results

    log.info({ isHealthy, status, durationMs }, 'Semantic router health check complete');

    sendJson(res, 200, {
      success: true,
      job: 'semantic-router-health',
      healthy: isHealthy,
      status,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Semantic router health check failed');
    sendJson(res, 500, {
      success: false,
      job: 'semantic-router-health',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs,
      timestamp: new Date().toISOString(),
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
