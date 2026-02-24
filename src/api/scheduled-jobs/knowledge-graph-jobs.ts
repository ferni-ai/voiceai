/**
 * Knowledge Graph Job Handlers
 *
 * Handles: knowledge-graph-insights, knowledge-graph-consolidation,
 * knowledge-graph-thread-maintenance, knowledge-graph-entity-decay
 *
 * @module api/scheduled-jobs/knowledge-graph-jobs
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'KnowledgeGraphJobs' });

export async function handleKnowledgeGraphInsights(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running knowledge graph insight generation job (Cloud Scheduler)');

    const { InsightGenerationJob } = await import('../../tasks/scheduled/knowledge-graph-jobs.js');

    const job = new InsightGenerationJob();
    const result = await job.run({
      dryRun: false,
      maxUsers: 50,
      minObservations: 5,
      minStrength: 0.5,
    });

    const durationMs = Date.now() - startTime;
    log.info({ ...result, durationMs }, 'Knowledge graph insight generation completed');

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

export async function handleKnowledgeGraphConsolidation(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running knowledge graph consolidation job (Cloud Scheduler)');

    const { ConsolidationJob } = await import('../../tasks/scheduled/knowledge-graph-jobs.js');

    const job = new ConsolidationJob();
    const result = await job.run({
      dryRun: false,
      maxUsers: 100,
      decayRate: 0.02,
      archiveThreshold: 0.05,
    });

    const durationMs = Date.now() - startTime;
    log.info({ ...result, durationMs }, 'Knowledge graph consolidation completed');

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

export async function handleKnowledgeGraphThreadMaintenance(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running knowledge graph thread maintenance job (Cloud Scheduler)');

    const { ThreadMaintenanceJob } = await import('../../tasks/scheduled/knowledge-graph-jobs.js');

    const job = new ThreadMaintenanceJob();
    const result = await job.run({
      dryRun: false,
      maxUsers: 100,
      dormantAfterDays: 30,
    });

    const durationMs = Date.now() - startTime;
    log.info({ ...result, durationMs }, 'Knowledge graph thread maintenance completed');

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

export async function handleKnowledgeGraphEntityDecay(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running knowledge graph entity decay job (Cloud Scheduler)');

    const { EntityDecayJob } = await import('../../tasks/scheduled/knowledge-graph-jobs.js');

    const job = new EntityDecayJob();
    const result = await job.run({
      dryRun: false,
      maxUsers: 100,
      baseDecayRate: 0.05,
      recentMentionProtectionDays: 7,
      emotionalProtection: 0.5,
    });

    const durationMs = Date.now() - startTime;
    log.info({ ...result, durationMs }, 'Knowledge graph entity decay completed');

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
