/**
 * Knowledge Graph Scheduled Jobs
 *
 * Background jobs for maintaining the unified knowledge graph:
 * - Insight generation: Detect patterns and correlations
 * - Memory consolidation: Merge duplicates, decay unused entities
 * - Thread maintenance: Mark dormant threads, cleanup expired
 * - Correlation refresh: Update correlation statistics
 *
 * These jobs run on a schedule (typically daily) to keep the
 * "Better than Human" memory system healthy and performant.
 *
 * @module tasks/scheduled/knowledge-graph-jobs
 */

import { getLogger } from '../../utils/safe-logger.js';
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';

const log = getLogger();

// ============================================================================
// USER DISCOVERY
// ============================================================================

/**
 * Get users who have knowledge graph data
 */
async function getKnowledgeGraphUsers(limit = 100): Promise<string[]> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    // Get users who have been active recently
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const snapshot = await db
      .collection('bogle_users')
      .where('lastContact', '>=', sevenDaysAgo.toISOString())
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.id);
  } catch (error) {
    log.warn({ error }, 'Could not get knowledge graph users');
    return [];
  }
}

// ============================================================================
// INSIGHT GENERATION JOB
// ============================================================================

interface InsightGenerationConfig extends BaseJobConfig {
  /** Maximum users to process per run */
  maxUsers: number;
  /** Minimum observations for correlation detection */
  minObservations: number;
  /** Minimum correlation strength to store */
  minStrength: number;
}

interface InsightGenerationResult {
  processedUsers: number;
  totalInsights: number;
  [key: string]: unknown;
}

/**
 * Generate insights for users from their knowledge graphs
 */
export class InsightGenerationJob extends ScheduledJob<
  InsightGenerationConfig,
  InsightGenerationResult
> {
  readonly name = 'knowledge-graph-insight-generation';
  readonly description = 'Generate patterns, correlations, and insights from knowledge graph';

  readonly defaultConfig: InsightGenerationConfig = {
    dryRun: false,
    maxUsers: 50,
    minObservations: 5,
    minStrength: 0.5,
  };

  protected async execute(
    config: InsightGenerationConfig,
    ctx: JobContext
  ): Promise<InsightGenerationResult> {
    let processedUsers = 0;
    let totalInsights = 0;

    try {
      const { getConsolidationEngine } = await import('../../memory/knowledge-graph/index.js');
      const { createInsightsBatch } = await import('../../memory/knowledge-graph/storage/index.js');

      const users = await getKnowledgeGraphUsers(config.maxUsers);
      ctx.log.info({ userCount: users.length }, 'Starting insight generation job');

      for (const userId of users) {
        ctx.counters.processed++;

        try {
          // Run consolidation which includes correlation detection
          const engine = getConsolidationEngine();
          const result = await engine.runConsolidation(userId);

          // Store detected correlations as insights
          if (result.newCorrelations.length > 0) {
            const insights = result.newCorrelations
              .filter((c) => c.strength >= config.minStrength)
              .map((correlation) => ({
                type: this.mapCorrelationToInsightType(correlation.type),
                insightType: this.mapCorrelationToInsightType(correlation.type),
                title: correlation.description.slice(0, 50),
                description: correlation.description,
                evidence: [`Observed ${correlation.observationCount} times`],
                entityIds: correlation.entityIds,
                mentionIds: [],
                confidence: correlation.confidence,
                salience: correlation.strength,
                actionable: true,
                userId,
              }));

            if (insights.length > 0) {
              await createInsightsBatch(
                userId,
                insights as Parameters<typeof createInsightsBatch>[1]
              );
              totalInsights += insights.length;
              ctx.counters.success++;
            }
          }

          processedUsers++;
        } catch (error) {
          ctx.counters.errors++;
          ctx.log.warn({ error: String(error), userId }, 'Failed to generate insights for user');
        }
      }

      const duration = Date.now() - ctx.startedAt.getTime();
      ctx.log.info(
        { processedUsers, totalInsights, durationMs: duration },
        'Insight generation job completed'
      );
    } catch (error) {
      ctx.log.error({ error: String(error) }, 'Insight generation job failed');
      throw error;
    }

    return { processedUsers, totalInsights };
  }

  private mapCorrelationToInsightType(
    correlationType: string
  ): 'behavioral_pattern' | 'temporal_pattern' | 'emotional_pattern' | 'correlation' {
    switch (correlationType) {
      case 'temporal':
        return 'temporal_pattern';
      case 'emotional':
        return 'emotional_pattern';
      case 'behavioral':
        return 'behavioral_pattern';
      default:
        return 'correlation';
    }
  }
}

// ============================================================================
// CONSOLIDATION JOB
// ============================================================================

interface ConsolidationConfig extends BaseJobConfig {
  /** Maximum users to process per run */
  maxUsers: number;
  /** Decay rate per day (0-1) */
  decayRate: number;
  /** Minimum entity strength before archiving */
  archiveThreshold: number;
}

interface ConsolidationResult {
  processedUsers: number;
  entitiesMerged: number;
  entitiesDecayed: number;
  [key: string]: unknown;
}

/**
 * Consolidate and maintain knowledge graph health
 */
export class ConsolidationJob extends ScheduledJob<ConsolidationConfig, ConsolidationResult> {
  readonly name = 'knowledge-graph-consolidation';
  readonly description = 'Consolidate entities, apply decay, archive old data';

  readonly defaultConfig: ConsolidationConfig = {
    dryRun: false,
    maxUsers: 100,
    decayRate: 0.02,
    archiveThreshold: 0.05,
  };

  protected async execute(
    config: ConsolidationConfig,
    ctx: JobContext
  ): Promise<ConsolidationResult> {
    let processedUsers = 0;
    let entitiesMerged = 0;
    let entitiesDecayed = 0;

    try {
      const { getConsolidationEngine } = await import('../../memory/knowledge-graph/index.js');

      const users = await getKnowledgeGraphUsers(config.maxUsers);
      ctx.log.info({ userCount: users.length }, 'Starting consolidation job');

      const engine = getConsolidationEngine({
        baseDecayRate: config.decayRate,
        minimumStrength: config.archiveThreshold,
      });

      for (const userId of users) {
        ctx.counters.processed++;

        try {
          const result = await engine.runConsolidation(userId);
          entitiesMerged += result.entitiesMerged;
          entitiesDecayed += result.memoriesDecayed;
          processedUsers++;
          ctx.counters.success++;
        } catch (error) {
          ctx.counters.errors++;
          ctx.log.warn(
            { error: String(error), userId },
            'Failed to consolidate user knowledge graph'
          );
        }
      }

      const duration = Date.now() - ctx.startedAt.getTime();
      ctx.log.info(
        { processedUsers, entitiesMerged, entitiesDecayed, durationMs: duration },
        'Consolidation job completed'
      );
    } catch (error) {
      ctx.log.error({ error: String(error) }, 'Consolidation job failed');
      throw error;
    }

    return { processedUsers, entitiesMerged, entitiesDecayed };
  }
}

// ============================================================================
// THREAD MAINTENANCE JOB
// ============================================================================

interface ThreadMaintenanceConfig extends BaseJobConfig {
  /** Maximum users to process per run */
  maxUsers: number;
  /** Days without activity before marking dormant */
  dormantAfterDays: number;
}

interface ThreadMaintenanceResult {
  processedUsers: number;
  threadsDormant: number;
  insightsExpired: number;
  [key: string]: unknown;
}

/**
 * Maintain conversation threads - mark dormant, cleanup
 */
export class ThreadMaintenanceJob extends ScheduledJob<
  ThreadMaintenanceConfig,
  ThreadMaintenanceResult
> {
  readonly name = 'knowledge-graph-thread-maintenance';
  readonly description = 'Mark dormant threads, cleanup expired data';

  readonly defaultConfig: ThreadMaintenanceConfig = {
    dryRun: false,
    maxUsers: 100,
    dormantAfterDays: 14,
  };

  protected async execute(
    config: ThreadMaintenanceConfig,
    ctx: JobContext
  ): Promise<ThreadMaintenanceResult> {
    let processedUsers = 0;
    let threadsDormant = 0;
    let insightsExpired = 0;

    try {
      const { markDormantThreads, deleteExpiredInsights, deleteNegativeInsights } =
        await import('../../memory/knowledge-graph/storage/index.js');

      const users = await getKnowledgeGraphUsers(config.maxUsers);
      ctx.log.info({ userCount: users.length }, 'Starting thread maintenance job');

      for (const userId of users) {
        ctx.counters.processed++;

        try {
          // Mark dormant threads
          const dormant = await markDormantThreads(userId);
          threadsDormant += dormant;

          // Delete expired insights
          const expired = await deleteExpiredInsights(userId);
          insightsExpired += expired;

          // Delete insights with negative feedback
          await deleteNegativeInsights(userId);

          processedUsers++;
          ctx.counters.success++;
        } catch (error) {
          ctx.counters.errors++;
          ctx.log.warn({ error: String(error), userId }, 'Failed to maintain threads for user');
        }
      }

      const duration = Date.now() - ctx.startedAt.getTime();
      ctx.log.info(
        { processedUsers, threadsDormant, insightsExpired, durationMs: duration },
        'Thread maintenance job completed'
      );
    } catch (error) {
      ctx.log.error({ error: String(error) }, 'Thread maintenance job failed');
      throw error;
    }

    return { processedUsers, threadsDormant, insightsExpired };
  }
}

// ============================================================================
// ENTITY DECAY JOB
// ============================================================================

interface EntityDecayConfig extends BaseJobConfig {
  /** Maximum users to process per run */
  maxUsers: number;
  /** Base decay rate per day (0-1) */
  baseDecayRate: number;
  /** Protection factor for emotionally significant entities */
  emotionalProtection: number;
  /** Days of protection for recently mentioned entities */
  recentMentionProtectionDays: number;
}

interface EntityDecayResult {
  processedUsers: number;
  entitiesDecayed: number;
  [key: string]: unknown;
}

/**
 * Apply decay to entity salience scores
 */
export class EntityDecayJob extends ScheduledJob<EntityDecayConfig, EntityDecayResult> {
  readonly name = 'knowledge-graph-entity-decay';
  readonly description = 'Apply graceful forgetting to entity salience scores';

  readonly defaultConfig: EntityDecayConfig = {
    dryRun: false,
    maxUsers: 100,
    baseDecayRate: 0.02,
    emotionalProtection: 0.5,
    recentMentionProtectionDays: 7,
  };

  protected async execute(config: EntityDecayConfig, ctx: JobContext): Promise<EntityDecayResult> {
    let processedUsers = 0;
    let entitiesDecayed = 0;

    try {
      const users = await getKnowledgeGraphUsers(config.maxUsers);
      ctx.log.info({ userCount: users.length }, 'Starting entity decay job');

      for (const userId of users) {
        ctx.counters.processed++;

        try {
          const decayed = await this.applyDecayForUser(userId, config);
          entitiesDecayed += decayed;
          processedUsers++;
          ctx.counters.success++;
        } catch (error) {
          ctx.counters.errors++;
          ctx.log.warn({ error: String(error), userId }, 'Failed to apply decay for user');
        }
      }

      const duration = Date.now() - ctx.startedAt.getTime();
      ctx.log.info(
        { processedUsers, entitiesDecayed, durationMs: duration },
        'Entity decay job completed'
      );
    } catch (error) {
      ctx.log.error({ error: String(error) }, 'Entity decay job failed');
      throw error;
    }

    return { processedUsers, entitiesDecayed };
  }

  private async applyDecayForUser(userId: string, config: EntityDecayConfig): Promise<number> {
    const { getAllEntities, updateEntity } = await import('../../memory/entity-store/storage.js');

    const entities = await getAllEntities(userId, { limit: 500 });
    const now = Date.now();
    const protectionCutoff = now - config.recentMentionProtectionDays * 24 * 60 * 60 * 1000;
    let decayed = 0;

    for (const entity of entities) {
      // Skip recently mentioned entities
      if (entity.lastMentionedAt && new Date(entity.lastMentionedAt).getTime() > protectionCutoff) {
        continue;
      }

      // Calculate decay with emotional protection
      let decayRate = config.baseDecayRate;
      if (entity.emotionalWeight && entity.emotionalWeight > 0.5) {
        decayRate *= 1 - config.emotionalProtection * (entity.emotionalWeight - 0.5) * 2;
      }

      // Apply decay
      const currentSalience = entity.salience ?? 0.5;
      const newSalience = Math.max(0.01, currentSalience * (1 - decayRate));

      if (newSalience !== currentSalience) {
        await updateEntity(userId, entity.id, { salience: newSalience });
        decayed++;
      }
    }

    return decayed;
  }
}

// ============================================================================
// JOB REGISTRY
// ============================================================================

/**
 * Get all knowledge graph jobs
 */
export function getKnowledgeGraphJobs(): ScheduledJob<BaseJobConfig, Record<string, unknown>>[] {
  return [
    new InsightGenerationJob(),
    new ConsolidationJob(),
    new ThreadMaintenanceJob(),
    new EntityDecayJob(),
  ];
}

// ============================================================================
// EXPORTS
// ============================================================================

// Types are re-exported here since classes are already exported inline
export {
  type InsightGenerationConfig,
  type InsightGenerationResult,
  type ConsolidationConfig,
  type ConsolidationResult,
  type ThreadMaintenanceConfig,
  type ThreadMaintenanceResult,
  type EntityDecayConfig,
  type EntityDecayResult,
};
