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

    // ========================================================================
    // DEEP INTELLIGENCE JOBS (LLM-powered batch analysis)
    // ========================================================================
    case '/api/jobs/run-deep-analysis':
      await handleRunDeepAnalysis(res);
      return true;

    case '/api/jobs/flush-ml-state':
      await handleFlushMLState(res);
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

    const result = await runDailyOutreachJob({
      dryRun: false,
      maxUsers: 1000,
    });

    sendJson(res, 200, {
      success: true,
      job: 'daily-outreach',
      stats: {
        usersEvaluated: result.usersEvaluated,
        outreachTriggered: result.outreachTriggered,
        skipped: result.skipped,
        errors: result.errors,
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

    const { evaluateLifeRhythmOutreach, triggerLifeRhythmOutreach } = await import(
      '../services/outreach/life-rhythm-outreach.js'
    );

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

    const { rollupDailyAnalytics } = await import('../services/outreach/analytics.js');

    await rollupDailyAnalytics();

    sendJson(res, 200, {
      success: true,
      job: 'rollup-outreach-analytics',
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
// DEEP INTELLIGENCE JOB HANDLERS
// ============================================================================

async function handleFlushMLState(res: ServerResponse): Promise<void> {
  try {
    log.info('Flushing ML model state to Firestore (Cloud Scheduler)');

    // Import persistence and data getters dynamically to avoid circular imports
    const { flushDirtyUsers } = await import('../intelligence/predictive/persistence.js');
    const { getMarkovDataForPersistence } = await import(
      '../intelligence/predictive/markov-sequence-predictor.js'
    );
    const { getTimeSeriesDataForPersistence } = await import(
      '../intelligence/predictive/time-series-forecaster.js'
    );
    const { getReinforcementDataForPersistence } = await import(
      '../intelligence/predictive/reinforcement-learner.js'
    );

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

    const { runDeepAnalysis, getLatestDeepAnalysis } = await import(
      '../intelligence/predictive/llm-deep-analysis.js'
    );

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
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
