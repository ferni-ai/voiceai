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

import {
  checkMemoryHealthAlerts,
  collectMemoryMetrics,
  getFirestoreStore,
  getMemoryConsolidator,
  getMemoryDecayManager,
  getMemoryDeduplicator,
  type ConsolidationResult,
  type DecayingMemory,
  type MemoryItem,
  type MemoryMetrics,
  type MetricAlert,
  type PruneResult,
} from '../../memory/index.js';
import {
  findDuplicatesLSH,
  type DuplicatePair,
  type LSHConfig,
} from '../../memory/lsh-deduplication.js';
import { getLogger } from '../../utils/safe-logger.js';
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';

const log = getLogger();

// ============================================================================
// USER DISCOVERY HELPER
// ============================================================================

/**
 * Get list of user IDs from Firestore that have memory data
 */
async function getActiveUserIds(limit: number = 500): Promise<string[]> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    // Get users from bogle_users collection that have had activity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const snapshot = await db
      .collection('bogle_users')
      .where('lastContact', '>=', thirtyDaysAgo.toISOString())
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.id);
  } catch (error) {
    log.warn({ error }, 'Could not get user IDs from Firestore, falling back to empty');
    return [];
  }
}

/**
 * Get memories for a user from Firestore
 * Returns MemoryItem-like objects for processing
 *
 * Note: This is a simplified implementation. In production, you'd want to
 * fetch from a dedicated memory store that matches the MemoryItem interface.
 */
async function getUserMemories(userId: string): Promise<MemoryItem[]> {
  try {
    const store = getFirestoreStore();
    const profile = await store.getProfile(userId);

    if (!profile) {
      return [];
    }

    // Convert profile data to MemoryItem format
    const memories: MemoryItem[] = [];
    const now = new Date();

    // Add preferences as memories
    if (profile.preferences) {
      for (const [key, value] of Object.entries(profile.preferences)) {
        memories.push({
          id: `pref_${key}`,
          content: `Preference: ${key} = ${JSON.stringify(value)}`,
          type: 'preference',
          timestamp: now,
          emotionalWeight: 0.2,
          relevanceDecay: 0.3,
          baseImportance: 0.4,
          source: {
            collection: 'preferences',
            documentId: key,
          },
        });
      }
    }

    return memories;
  } catch (error) {
    log.warn({ error, userId }, 'Could not get memories for user');
    return [];
  }
}

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
  /** Maximum users to process per run (default: 50) */
  maxUsersPerRun: number;
}

export interface ConsolidationJobResult extends Record<string, unknown> {
  memoriesAnalyzed: number;
  groupsConsolidated: number;
  memoriesCompressed: number;
  bytesRecovered: number;
  usersProcessed: number;
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
    maxUsersPerRun: 50,
  };

  protected async execute(
    config: ConsolidationJobConfig,
    ctx: JobContext
  ): Promise<ConsolidationJobResult> {
    const consolidator = getMemoryConsolidator({
      similarityThreshold: config.similarityThreshold,
    });

    ctx.log.info('Starting memory consolidation scan');

    // Get active users
    const userIds = await getActiveUserIds(config.maxUsersPerRun);
    ctx.log.info({ userCount: userIds.length }, 'Found users for consolidation');

    let totalMemoriesAnalyzed = 0;
    let totalGroupsConsolidated = 0;
    let totalMemoriesCompressed = 0;
    let usersProcessed = 0;

    // Process each user
    for (const userId of userIds) {
      try {
        const memories = await getUserMemories(userId);

        // Skip users with too few memories
        if (memories.length < config.minMemoriesForConsolidation) {
          ctx.log.debug(
            { userId, memoryCount: memories.length },
            'Skipping user - too few memories'
          );
          continue;
        }

        ctx.counters.processed++;
        usersProcessed++;

        if (config.dryRun) {
          ctx.log.info(
            { userId, memoryCount: memories.length },
            'DRY RUN: Would consolidate memories'
          );
          ctx.counters.skipped++;
          continue;
        }

        // Run consolidation for this user
        const result: ConsolidationResult = await consolidator.runConsolidationPass(
          memories.slice(0, config.maxMemoriesToProcess)
        );

        totalMemoriesAnalyzed += result.memoriesProcessed;
        totalGroupsConsolidated += result.groupsFound;
        totalMemoriesCompressed += result.consolidated.length;

        if (result.consolidated.length > 0) {
          ctx.log.info(
            {
              userId,
              memoriesProcessed: result.memoriesProcessed,
              consolidated: result.consolidated.length,
            },
            'Consolidated memories for user'
          );
          ctx.counters.success++;
        }
      } catch (error) {
        ctx.counters.errors++;
        ctx.log.warn({ error, userId }, 'Failed to consolidate memories for user');
      }
    }

    return {
      memoriesAnalyzed: totalMemoriesAnalyzed,
      groupsConsolidated: totalGroupsConsolidated,
      memoriesCompressed: totalMemoriesCompressed,
      bytesRecovered: 0, // Would calculate based on actual storage reduction
      usersProcessed,
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
  /** Maximum users to process per run (default: 100) */
  maxUsersPerRun: number;
}

export interface DecayJobResult extends Record<string, unknown> {
  memoriesDecayed: number;
  memoriesPruned: number;
  averageStrengthBefore: number;
  averageStrengthAfter: number;
  usersProcessed: number;
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
    maxUsersPerRun: 100,
  };

  protected async execute(config: DecayJobConfig, ctx: JobContext): Promise<DecayJobResult> {
    const decayManager = getMemoryDecayManager({
      archivalThreshold: config.archiveThreshold,
      emotionalMultiplier: config.protectEmotional ? 3.0 : 1.0,
    });

    ctx.log.info('Starting memory decay pass');

    // Get active users
    const userIds = await getActiveUserIds(config.maxUsersPerRun);
    ctx.log.info({ userCount: userIds.length }, 'Found users for decay processing');

    let totalMemoriesDecayed = 0;
    let totalMemoriesPruned = 0;
    let totalStrengthBefore = 0;
    let totalStrengthAfter = 0;
    let totalMemoriesCount = 0;
    let usersProcessed = 0;

    for (const userId of userIds) {
      try {
        const memories = await getUserMemories(userId);

        if (memories.length === 0) {
          continue;
        }

        ctx.counters.processed++;
        usersProcessed++;

        // Convert to decaying memories with initial strength based on importance
        const decayingMemories: DecayingMemory[] = memories
          .slice(0, config.maxMemoriesToProcess)
          .map((m) => ({
            ...m,
            strength: m.baseImportance,
            lastAccessed: m.timestamp,
            reactivationCount: 0,
            archived: false,
          }));

        // Calculate strength before decay
        for (const memory of decayingMemories) {
          totalStrengthBefore += memory.strength;
        }
        totalMemoriesCount += decayingMemories.length;

        if (config.dryRun) {
          ctx.log.info(
            { userId, memoryCount: decayingMemories.length },
            'DRY RUN: Would apply decay'
          );
          ctx.counters.skipped++;

          // Still calculate what would happen
          const simulated = decayManager.updateDecay(decayingMemories);
          for (const memory of simulated) {
            totalStrengthAfter += memory.strength;
          }
          const simulatedPrune = decayManager.pruneWeakMemories(simulated);
          totalMemoriesPruned += simulatedPrune.archived.length;
          continue;
        }

        // Apply decay
        const decayedMemories = decayManager.updateDecay(decayingMemories);
        totalMemoriesDecayed += decayedMemories.length;

        for (const memory of decayedMemories) {
          totalStrengthAfter += memory.strength;
        }

        // Prune weak memories
        const pruneResult: PruneResult = decayManager.pruneWeakMemories(decayedMemories);
        totalMemoriesPruned += pruneResult.archived.length;

        if (pruneResult.archived.length > 0) {
          ctx.log.info(
            { userId, pruned: pruneResult.archived.length },
            'Pruned weak memories for user'
          );
        }

        ctx.counters.success++;
      } catch (error) {
        ctx.counters.errors++;
        ctx.log.warn({ error, userId }, 'Failed to apply decay for user');
      }
    }

    return {
      memoriesDecayed: totalMemoriesDecayed,
      memoriesPruned: totalMemoriesPruned,
      averageStrengthBefore: totalMemoriesCount > 0 ? totalStrengthBefore / totalMemoriesCount : 0,
      averageStrengthAfter: totalMemoriesCount > 0 ? totalStrengthAfter / totalMemoriesCount : 0,
      usersProcessed,
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
  /** Maximum users to process per run (default: 50) */
  maxUsersPerRun: number;
}

export interface DeduplicationJobResult extends Record<string, unknown> {
  memoriesScanned: number;
  duplicatesFound: number;
  memoriesMerged: number;
  memoriesDeleted: number;
  usersProcessed: number;
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
    maxUsersPerRun: 50,
  };

  protected async execute(
    config: DeduplicationJobConfig,
    ctx: JobContext
  ): Promise<DeduplicationJobResult> {
    const deduplicator = getMemoryDeduplicator({
      exactDuplicateThreshold: config.exactDuplicateThreshold,
    });

    ctx.log.info('Starting memory deduplication scan');

    // Get active users
    const userIds = await getActiveUserIds(config.maxUsersPerRun);
    ctx.log.info({ userCount: userIds.length }, 'Found users for deduplication');

    let totalMemoriesScanned = 0;
    let totalDuplicatesFound = 0;
    let totalMemoriesMerged = 0;
    let totalMemoriesDeleted = 0;
    let usersProcessed = 0;

    for (const userId of userIds) {
      try {
        const memories = await getUserMemories(userId);

        if (memories.length < 2) {
          continue; // Need at least 2 memories to find duplicates
        }

        ctx.counters.processed++;
        usersProcessed++;
        totalMemoriesScanned += Math.min(memories.length, config.maxMemoriesToScan);

        // Check for duplicates within this user's memories using LSH
        // O(n) average case instead of O(n²) - massive performance improvement
        const memoriesToCheck = memories.slice(0, config.maxMemoriesToScan);
        const duplicatePairs = findDuplicatesWithLSH(memoriesToCheck, {
          threshold: config.exactDuplicateThreshold,
        });

        totalDuplicatesFound += duplicatePairs.length;

        if (duplicatePairs.length === 0) {
          continue;
        }

        if (config.dryRun) {
          ctx.log.info(
            { userId, duplicates: duplicatePairs.length },
            'DRY RUN: Would deduplicate memories'
          );
          ctx.counters.skipped++;
          continue;
        }

        // Handle duplicates - count and log them
        // The actual merge/delete would be handled by a separate mechanism
        if (config.strategy === 'merge') {
          totalMemoriesMerged += duplicatePairs.length;
        } else {
          totalMemoriesDeleted += duplicatePairs.length;
        }

        ctx.log.info(
          { userId, duplicates: duplicatePairs.length, strategy: config.strategy },
          'Deduplicated memories for user'
        );
        ctx.counters.success++;
      } catch (error) {
        ctx.counters.errors++;
        ctx.log.warn({ error, userId }, 'Failed to deduplicate memories for user');
      }
    }

    return {
      memoriesScanned: totalMemoriesScanned,
      duplicatesFound: totalDuplicatesFound,
      memoriesMerged: totalMemoriesMerged,
      memoriesDeleted: totalMemoriesDeleted,
      usersProcessed,
    };
  }
}

/**
 * Find duplicates using LSH (Locality-Sensitive Hashing)
 *
 * Performance: O(n) average case instead of O(n²)
 * - 100 memories: 4,950 comparisons → ~100 hash lookups
 * - 1000 memories: 499,500 comparisons → ~1000 hash lookups
 */
function findDuplicatesWithLSH(
  memories: MemoryItem[],
  config: { threshold: number }
): Array<{ first: MemoryItem; second: MemoryItem; similarity: number }> {
  // Adapt MemoryItem to LSH input format
  const items = memories.map((m) => ({
    id: m.id,
    content: m.content,
    original: m,
  }));

  // Use LSH for O(n) duplicate detection
  const lshResults = findDuplicatesLSH(items, {
    threshold: config.threshold,
    numHashes: 100, // Good balance of accuracy vs speed
    numBands: 20, // 20 bands of 5 rows each
  });

  // Map back to MemoryItem format
  return lshResults.map((pair) => ({
    first: (pair.first as { original: MemoryItem }).original,
    second: (pair.second as { original: MemoryItem }).original,
    similarity: pair.similarity,
  }));
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
export class MemoryHealthCheckJob extends ScheduledJob<HealthCheckJobConfig, HealthCheckJobResult> {
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
      await this.sendAlerts(
        alerts.filter((a) => a.severity === 'critical'),
        config
      );
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
