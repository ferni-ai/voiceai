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
    const getUserProfiles = async () => {
      const db = getFirestoreDb();
      if (!db) return [];
      const snapshot = await db.collection('bogle_users').limit(1000).get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as any);
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

    const insights: Array<{
      id: string;
      userId: string;
      capability: string;
      timestamp: string;
      data: Record<string, unknown>;
    }> = [];

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const executions = await processInsights(insights as any[]);

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
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
