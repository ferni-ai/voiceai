/**
 * Background Task & General Maintenance Job Handlers
 *
 * Handles: cleanup-old-tasks, aggregate-community-insights, rollup-persona-metrics,
 * sync-trust-profiles, cleanup-transcripts
 *
 * @module api/scheduled-jobs/background-task-jobs
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'BackgroundTaskJobs' });

export async function handleCleanupOldTasks(res: ServerResponse): Promise<void> {
  try {
    log.info('Cleaning up old tasks (Cloud Scheduler)');

    const { getBackgroundTaskService } = await import('../../services/scheduling/background-tasks.js');
    const taskService = getBackgroundTaskService();

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

export async function handleAggregateCommunityInsights(res: ServerResponse): Promise<void> {
  try {
    log.info('Aggregating community insights (Cloud Scheduler)');

    const { persistPatterns, getAllPatterns } =
      await import('../../intelligence/capability-learning.js');

    const patterns = getAllPatterns();
    await persistPatterns();

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

export async function handleRollupPersonaMetrics(res: ServerResponse): Promise<void> {
  try {
    log.info('Rolling up persona metrics (Cloud Scheduler)');

    const { getHumanizationAnalytics } =
      await import('../../services/analytics/humanization-analytics.js');
    const analytics = getHumanizationAnalytics();

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
          const totalFeatureUsage = Object.values(metrics.featureUsage || {}).reduce(
            (sum, count) => sum + count,
            0
          );
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

export async function handleSyncTrustProfiles(res: ServerResponse): Promise<void> {
  try {
    log.info('Syncing trust profiles (Cloud Scheduler)');

    const { flushPendingChanges, initializeUnifiedPersistence } =
      await import('../../services/trust-systems/unified-persistence.js');

    initializeUnifiedPersistence();
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

export async function handleCleanupTranscripts(res: ServerResponse): Promise<void> {
  try {
    log.info('Cleaning up old transcripts (Cloud Scheduler)');

    const { TranscriptCleanupJob } = await import('../../tasks/scheduled/memory-jobs.js');

    const job = new TranscriptCleanupJob();
    const result = await job.run({
      dryRun: false,
    });

    sendJson(res, 200, {
      success: true,
      job: 'cleanup-transcripts',
      stats: {
        enabled: result.enabled,
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
