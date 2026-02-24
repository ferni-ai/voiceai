/**
 * Memory Maintenance Job Handlers
 *
 * Handles: memory-consolidation, memory-decay, memory-deduplication,
 * memory-health-check
 *
 * Part of the "Better Than Human" memory system.
 *
 * @module api/scheduled-jobs/memory-maintenance-jobs
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'MemoryMaintenanceJobs' });

export async function handleMemoryConsolidation(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running memory consolidation job (Cloud Scheduler)');

    const { MemoryConsolidationJob } = await import('../../tasks/scheduled/memory-jobs.js');

    const job = new MemoryConsolidationJob();
    const result = await job.run({
      dryRun: false,
      minMemoriesForConsolidation: 20,
      similarityThreshold: 0.7,
      maxMemoriesToProcess: 100,
      maxUsersPerRun: 50,
    });

    const durationMs = Date.now() - startTime;
    log.info({ ...result, durationMs }, 'Memory consolidation job completed');

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

export async function handleMemoryDecay(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running memory decay job (Cloud Scheduler)');

    const { MemoryDecayJob } = await import('../../tasks/scheduled/memory-jobs.js');

    const job = new MemoryDecayJob();
    const result = await job.run({
      dryRun: false,
      archiveThreshold: 0.1,
      protectEmotional: true,
      maxMemoriesToProcess: 500,
      maxUsersPerRun: 100,
    });

    const durationMs = Date.now() - startTime;
    log.info({ ...result, durationMs }, 'Memory decay job completed');

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

export async function handleMemoryDeduplication(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running memory deduplication job (Cloud Scheduler)');

    const { MemoryDeduplicationJob } = await import('../../tasks/scheduled/memory-jobs.js');

    const job = new MemoryDeduplicationJob();
    const result = await job.run({
      dryRun: false,
      exactDuplicateThreshold: 0.95,
      strategy: 'merge',
      maxMemoriesToScan: 200,
      maxUsersPerRun: 50,
    });

    const durationMs = Date.now() - startTime;
    log.info({ ...result, durationMs }, 'Memory deduplication job completed');

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

export async function handleMemoryHealthCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running memory health check job (Cloud Scheduler)');

    const { MemoryHealthCheckJob } = await import('../../tasks/scheduled/memory-jobs.js');

    const job = new MemoryHealthCheckJob();
    const result = await job.run({
      dryRun: false,
      sendAlerts: true,
    });

    const durationMs = Date.now() - startTime;
    const status =
      result.healthScore >= 80 ? 'healthy' : result.healthScore >= 50 ? 'degraded' : 'unhealthy';

    log.info(
      { healthScore: result.healthScore, alertCount: result.alerts.length, status, durationMs },
      'Memory health check completed'
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
