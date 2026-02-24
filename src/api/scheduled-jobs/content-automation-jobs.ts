/**
 * Content Automation & Semantic Router Job Handlers
 *
 * Handles: gtm-daily-publishing, gtm-weekly-content,
 * semantic-router-retrain, semantic-router-volume-check,
 * semantic-router-quality-check, semantic-router-health
 *
 * @module api/scheduled-jobs/content-automation-jobs
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson, sendSlackMessage } from './helpers.js';

const log = createLogger({ module: 'ContentAutomationJobs' });

// ============================================================================
// GTM (GO-TO-MARKET) CONTENT AUTOMATION
// ============================================================================

export async function handleGTMDailyPublishing(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running GTM daily publishing (Cloud Scheduler)');

    const { runDailyPublishing, getGTMStatus } = await import('../../services/gtm/gtm-service.js');

    const result = await runDailyPublishing();
    const postStatus = await getGTMStatus();

    if (result.published > 0 || result.generated > 0) {
      await sendSlackMessage(
        `GTM Publishing Complete:\n• Generated: ${result.generated} content pieces\n• Published: ${result.published} posts\n• Platforms: Twitter, LinkedIn, Discord`,
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

export async function handleGTMWeeklyContent(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running GTM weekly content generation (Cloud Scheduler)');

    const { generateWeeklyContent, getCalendarStats } =
      await import('../../services/gtm/gtm-service.js');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await generateWeeklyContent(tomorrow);
    const stats = getCalendarStats();

    if (result.content.length > 0) {
      const contentList = result.content
        .map((c) => `• ${c.brief.category}: "${c.title.substring(0, 50)}..."`)
        .join('\n');

      await sendSlackMessage(
        `Weekly Content Generated:\n${contentList}\n\nTotal pending: ${stats.byStatus['in-progress'] + stats.byStatus.ready}`,
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
// SEMANTIC ROUTER RETRAINING
// ============================================================================

export async function handleSemanticRouterRetrain(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  try {
    log.info('Starting semantic router daily retraining (Cloud Scheduler)');

    const { handleScheduledRetraining } =
      await import('../../tools/semantic-router/learning/retraining-pipeline.js');
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

export async function handleSemanticRouterVolumeCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  try {
    log.info('Checking semantic router volume-based trigger (Cloud Scheduler)');

    const { handleVolumeBasedRetraining } =
      await import('../../tools/semantic-router/learning/retraining-pipeline.js');
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

export async function handleSemanticRouterQualityCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  try {
    log.info('Checking semantic router quality-based trigger (Cloud Scheduler)');

    const { handleQualityBasedRetraining } =
      await import('../../tools/semantic-router/learning/retraining-pipeline.js');
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

export async function handleSemanticRouterHealth(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  try {
    log.info('Checking semantic router retraining health (Cloud Scheduler)');

    const { getRetrainingPipeline } =
      await import('../../tools/semantic-router/learning/retraining-pipeline.js');
    const pipeline = getRetrainingPipeline();
    const status = await pipeline.getStatus();

    const durationMs = Date.now() - startTime;

    const isHealthy =
      !status.isRunning &&
      (status.lastResult === null || status.lastResult.success);

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
