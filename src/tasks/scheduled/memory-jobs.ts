/**
 * Memory System Scheduled Jobs
 *
 * Background jobs for memory system health and optimization:
 * - Memory consolidation: Compress related memories for long-term users
 * - Memory decay: Apply graceful forgetting with configurable decay curves
 * - Memory deduplication: Clean up redundant memories
 * - Memory metrics collection: Track system health
 *
 * These jobs maintain the "better than human" memory promise
 * while keeping the system performant and storage efficient.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getMemoryConsolidator,
  getMemoryDecayManager,
  getMemoryDeduplicator,
  collectMemoryMetrics,
  checkMemoryHealthAlerts,
  type ConsolidationResult,
  type PruneResult,
  type MemoryMetrics,
  type MetricAlert,
  type DecayingMemory,
} from '../../memory/index.js';
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';

const log = getLogger();

// ============================================================================
// MEMORY CONSOLIDATION JOB
// ============================================================================

export interface ConsolidationJobConfig extends BaseJobConfig {
  /** Minimum memories needed before consolidation (default: 20) */
  minMemoriesForConsolidation: number;
  /** Minimum similarity threshold (default: 0.7) */
  similarityThreshold: number;
  /** Maximum memories to process per run (default: 100) */
  maxMemoriesToProcess: number;
}

export interface ConsolidationJobResult extends Record<string, unknown> {
  memoriesAnalyzed: number;
  groupsConsolidated: number;
  memoriesCompressed: number;
  bytesRecovered: number;
}

/**
 * Memory Consolidation Job
 *
 * Runs periodically to consolidate related memories, reducing storage
 * and improving retrieval quality by creating denser memory representations.
 *
 * Best run nightly or weekly for users with many memories.
 */
export class MemoryConsolidationJob extends ScheduledJob<
  ConsolidationJobConfig,
  ConsolidationJobResult
> {
  readonly name = 'MemoryConsolidationJob';
  readonly defaultConfig: ConsolidationJobConfig = {
    dryRun: false,
    minMemoriesForConsolidation: 20,
    similarityThreshold: 0.7,
    maxMemoriesToProcess: 100,
  };

  protected async execute(
    config: ConsolidationJobConfig,
    ctx: JobContext
  ): Promise<ConsolidationJobResult> {
    const consolidator = getMemoryConsolidator({
      similarityThreshold: config.similarityThreshold,
    });

    ctx.log.info('Starting memory consolidation scan');

    // For now, we consolidate memories without user scoping
    // In production, you'd iterate through users
    const result: ConsolidationResult = await consolidator.runConsolidationPass(
      [] // Would pass actual memories from store
    );

    ctx.counters.processed = result.memoriesProcessed;
    ctx.counters.success = result.consolidated.length;

    return {
      memoriesAnalyzed: result.memoriesProcessed,
      groupsConsolidated: result.groupsFound,
      memoriesCompressed: result.consolidated.length,
      bytesRecovered: 0, // Would calculate based on actual storage reduction
    };
  }
}

// ============================================================================
// MEMORY DECAY JOB
// ============================================================================

export interface DecayJobConfig extends BaseJobConfig {
  /** Strength threshold below which to prune (default: 0.1) */
  archiveThreshold: number;
  /** Whether to protect emotional memories (default: true) */
  protectEmotional: boolean;
  /** Maximum memories to process per run (default: 500) */
  maxMemoriesToProcess: number;
}

export interface DecayJobResult extends Record<string, unknown> {
  memoriesDecayed: number;
  memoriesPruned: number;
  averageStrengthBefore: number;
  averageStrengthAfter: number;
}

/**
 * Memory Decay Job
 *
 * Applies natural forgetting to memories, allowing less important
 * memories to fade while preserving emotionally significant ones.
 *
 * This is key to the "better than human" promise - humans naturally
 * forget unimportant details while remembering what matters.
 */
export class MemoryDecayJob extends ScheduledJob<DecayJobConfig, DecayJobResult> {
  readonly name = 'MemoryDecayJob';
  readonly defaultConfig: DecayJobConfig = {
    dryRun: false,
    archiveThreshold: 0.1,
    protectEmotional: true,
    maxMemoriesToProcess: 500,
  };

  protected async execute(config: DecayJobConfig, ctx: JobContext): Promise<DecayJobResult> {
    const decayManager = getMemoryDecayManager({
      archivalThreshold: config.archiveThreshold,
      emotionalMultiplier: config.protectEmotional ? 3.0 : 1.0,
    });

    ctx.log.info('Starting memory decay pass');

    // Apply decay to memories (would get from store in production)
    const memories: DecayingMemory[] = []; // Would load from store and initialize with decay

    let totalStrengthBefore = 0;
    let totalStrengthAfter = 0;

    // Update decay for all memories
    const decayedMemories = decayManager.updateDecay(memories);

    for (let i = 0; i < memories.length; i++) {
      ctx.counters.processed++;
      totalStrengthBefore += memories[i].strength || 1.0;
      totalStrengthAfter += decayedMemories[i].strength;
    }

    // Prune weak memories
    const pruneResult: PruneResult = decayManager.pruneWeakMemories(decayedMemories);

    if (!config.dryRun) {
      ctx.counters.success = pruneResult.archived.length;
    } else {
      ctx.counters.skipped = pruneResult.archived.length;
    }

    return {
      memoriesDecayed: ctx.counters.processed,
      memoriesPruned: pruneResult.archived.length,
      averageStrengthBefore:
        memories.length > 0 ? totalStrengthBefore / memories.length : 0,
      averageStrengthAfter:
        memories.length > 0 ? totalStrengthAfter / memories.length : 0,
    };
  }
}

// ============================================================================
// MEMORY DEDUPLICATION JOB
// ============================================================================

export interface DeduplicationJobConfig extends BaseJobConfig {
  /** Similarity threshold for duplicates (default: 0.95) */
  exactDuplicateThreshold: number;
  /** Strategy for handling duplicates (default: 'merge') */
  strategy: 'skip' | 'merge';
  /** Maximum memories to scan per run (default: 200) */
  maxMemoriesToScan: number;
}

export interface DeduplicationJobResult extends Record<string, unknown> {
  memoriesScanned: number;
  duplicatesFound: number;
  memoriesMerged: number;
  memoriesDeleted: number;
}

/**
 * Memory Deduplication Job
 *
 * Finds and handles duplicate or near-duplicate memories,
 * preventing storage bloat and retrieval confusion.
 */
export class MemoryDeduplicationJob extends ScheduledJob<
  DeduplicationJobConfig,
  DeduplicationJobResult
> {
  readonly name = 'MemoryDeduplicationJob';
  readonly defaultConfig: DeduplicationJobConfig = {
    dryRun: false,
    exactDuplicateThreshold: 0.95,
    strategy: 'merge',
    maxMemoriesToScan: 200,
  };

  protected async execute(
    config: DeduplicationJobConfig,
    ctx: JobContext
  ): Promise<DeduplicationJobResult> {
    const deduplicator = getMemoryDeduplicator({
      exactDuplicateThreshold: config.exactDuplicateThreshold,
    });

    ctx.log.info('Starting memory deduplication scan');

    // Would iterate through memories and check for duplicates
    // For now, return placeholder result
    ctx.counters.processed = 0;
    
    return {
      memoriesScanned: 0,
      duplicatesFound: 0,
      memoriesMerged: 0,
      memoriesDeleted: 0,
    };
  }
}

// ============================================================================
// MEMORY HEALTH CHECK JOB
// ============================================================================

export interface HealthCheckJobConfig extends BaseJobConfig {
  /** Whether to send alerts (default: true) */
  sendAlerts: boolean;
  /** Alert webhook URL (optional) */
  alertWebhookUrl?: string;
}

export interface HealthCheckJobResult extends Record<string, unknown> {
  metrics: MemoryMetrics;
  alerts: MetricAlert[];
  healthScore: number;
}

/**
 * Memory Health Check Job
 *
 * Collects metrics and checks for health issues in the memory system.
 * Can send alerts for critical issues.
 */
export class MemoryHealthCheckJob extends ScheduledJob<
  HealthCheckJobConfig,
  HealthCheckJobResult
> {
  readonly name = 'MemoryHealthCheckJob';
  readonly defaultConfig: HealthCheckJobConfig = {
    dryRun: false,
    sendAlerts: true,
  };

  protected async execute(
    config: HealthCheckJobConfig,
    ctx: JobContext
  ): Promise<HealthCheckJobResult> {
    ctx.log.info('Running memory health check');

    // Collect metrics
    const metrics = await collectMemoryMetrics();

    // Check for alerts
    const alerts = await checkMemoryHealthAlerts();

    // Calculate overall health score (0-100)
    const healthScore = this.calculateHealthScore(metrics, alerts);

    // Send alerts if configured and there are critical issues
    if (config.sendAlerts && alerts.some((a) => a.severity === 'critical')) {
      await this.sendAlerts(alerts.filter((a) => a.severity === 'critical'), config);
    }

    ctx.counters.processed = 1;
    ctx.counters.success = alerts.length === 0 ? 1 : 0;
    ctx.counters.errors = alerts.filter((a) => a.severity === 'critical').length;

    return {
      metrics,
      alerts,
      healthScore,
    };
  }

  private calculateHealthScore(metrics: MemoryMetrics, alerts: MetricAlert[]): number {
    let score = 100;

    // Deduct for alerts
    for (const alert of alerts) {
      if (alert.severity === 'critical') {
        score -= 30;
      } else if (alert.severity === 'warning') {
        score -= 10;
      }
    }

    // Deduct for low cache hit rate
    if (metrics.embedding.cacheHitRate < 0.5) {
      score -= 10;
    }

    // Deduct for slow retrieval
    if (metrics.retrieval.averageRetrievalTimeMs > 500) {
      score -= 15;
    }

    return Math.max(0, score);
  }

  private async sendAlerts(alerts: MetricAlert[], config: HealthCheckJobConfig): Promise<void> {
    if (!config.alertWebhookUrl) {
      log.warn({ alertCount: alerts.length }, 'Critical alerts detected but no webhook configured');
      return;
    }

    try {
      await fetch(config.alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'MemoryHealthCheckJob',
          timestamp: new Date().toISOString(),
          alerts: alerts.map((a) => ({
            metric: a.metric,
            severity: a.severity,
            message: a.message,
            value: a.currentValue,
            threshold: a.threshold,
          })),
        }),
      });
      log.info({ alertCount: alerts.length }, 'Sent memory health alerts');
    } catch (error) {
      log.error({ error }, 'Failed to send memory health alerts');
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  MemoryConsolidationJob,
  MemoryDecayJob,
  MemoryDeduplicationJob,
  MemoryHealthCheckJob,
};
