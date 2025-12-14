/**
 * Superhuman Memory Scheduled Jobs
 *
 * Background jobs for the "Better than Human" memory intelligence:
 * - User memory re-indexing after profile updates
 * - Superhuman context pre-computation for active users
 * - Insight delivery tracking cleanup
 * - Voice pattern analysis aggregation
 *
 * These jobs ensure the superhuman memory system stays fresh and performant.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';
import {
  buildSuperhumanContext,
  cleanupDeliveryRecords,
  type SuperhumanContext,
} from '../../intelligence/superhuman-memory.js';
import { indexUserMemories, type IndexingResult } from '../../memory/user-memory-indexer.js';
import { getFirestoreStore } from '../../memory/index.js';
import type { UserProfile } from '../../types/user-profile.js';

const log = getLogger();

// ============================================================================
// USER DISCOVERY HELPER
// ============================================================================

/**
 * Get active user profiles from Firestore
 */
async function getActiveUserProfiles(limit: number = 100): Promise<UserProfile[]> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    // Get users who have been active in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const snapshot = await db
      .collection('bogle_users')
      .where('lastContact', '>=', sevenDaysAgo.toISOString())
      .limit(limit)
      .get();

    const profiles: UserProfile[] = [];
    for (const doc of snapshot.docs) {
      profiles.push({ id: doc.id, ...doc.data() } as UserProfile);
    }

    return profiles;
  } catch (error) {
    log.warn({ error }, 'Could not get active user profiles');
    return [];
  }
}

/**
 * Get users who need memory re-indexing (profile updated since last index)
 */
async function getUsersNeedingReindex(limit: number = 50): Promise<UserProfile[]> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    // Get users whose profile was updated but memory not re-indexed
    // We look for users where lastMemoryIndexAt < lastUpdated (or doesn't exist)
    const snapshot = await db.collection('bogle_users').limit(limit * 2).get();

    const needsReindex: UserProfile[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as UserProfile & {
        lastMemoryIndexAt?: string;
        updatedAt?: string;
      };

      const profile = { ...data, id: doc.id };

      // If never indexed, or indexed before last update
      if (!data.lastMemoryIndexAt) {
        needsReindex.push(profile);
      } else if (data.updatedAt && new Date(data.lastMemoryIndexAt) < new Date(data.updatedAt)) {
        needsReindex.push(profile);
      }

      if (needsReindex.length >= limit) break;
    }

    return needsReindex;
  } catch (error) {
    log.warn({ error }, 'Could not get users needing reindex');
    return [];
  }
}

// ============================================================================
// USER MEMORY RE-INDEXING JOB
// ============================================================================

export interface ReindexJobConfig extends BaseJobConfig {
  /** Maximum users to process per run */
  maxUsersPerRun: number;
  /** Whether to force full re-index (vs incremental) */
  forceFullReindex: boolean;
}

export interface ReindexJobResult extends Record<string, unknown> {
  usersProcessed: number;
  totalIndexed: number;
  totalSkipped: number;
  totalErrors: number;
  categoriesUpdated: Record<string, number>;
}

/**
 * User Memory Re-indexing Job
 *
 * Re-indexes user profile data into the vector store after updates.
 * This ensures semantic search stays current with user changes.
 */
export class UserMemoryReindexJob extends ScheduledJob<ReindexJobConfig, ReindexJobResult> {
  readonly name = 'UserMemoryReindexJob';
  readonly defaultConfig: ReindexJobConfig = {
    dryRun: false,
    maxUsersPerRun: 50,
    forceFullReindex: false,
  };

  protected async execute(config: ReindexJobConfig, ctx: JobContext): Promise<ReindexJobResult> {
    ctx.log.info('Starting user memory re-indexing');

    // Get users who need re-indexing
    const users = await getUsersNeedingReindex(config.maxUsersPerRun);
    ctx.log.info({ userCount: users.length }, 'Found users needing memory re-index');

    let totalIndexed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const categoriesUpdated: Record<string, number> = {};

    for (const profile of users) {
      try {
        ctx.counters.processed++;

        if (config.dryRun) {
          ctx.log.info({ userId: profile.id }, 'DRY RUN: Would re-index user memories');
          ctx.counters.skipped++;
          continue;
        }

        // Run indexing
        const result: IndexingResult = await indexUserMemories(profile.id, profile);

        totalIndexed += result.indexed;
        totalSkipped += result.skipped;
        totalErrors += result.errors;

        // Aggregate category counts
        for (const [category, count] of Object.entries(result.categories)) {
          categoriesUpdated[category] = (categoriesUpdated[category] || 0) + count;
        }

        // Mark as indexed
        await this.markUserIndexed(profile.id);

        if (result.indexed > 0) {
          ctx.log.info(
            {
              userId: profile.id,
              indexed: result.indexed,
              skipped: result.skipped,
            },
            'Re-indexed user memories'
          );
        }

        ctx.counters.success++;
      } catch (error) {
        ctx.counters.errors++;
        totalErrors++;
        ctx.log.warn({ error, userId: profile.id }, 'Failed to re-index user memories');
      }
    }

    return {
      usersProcessed: users.length,
      totalIndexed,
      totalSkipped,
      totalErrors,
      categoriesUpdated,
    };
  }

  private async markUserIndexed(userId: string): Promise<void> {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      await db.collection('bogle_users').doc(userId).update({
        lastMemoryIndexAt: new Date().toISOString(),
      });
    } catch (error) {
      log.warn({ error, userId }, 'Could not mark user as indexed');
    }
  }
}

// ============================================================================
// SUPERHUMAN CONTEXT PRE-COMPUTATION JOB
// ============================================================================

export interface PrecomputeJobConfig extends BaseJobConfig {
  /** Maximum users to process per run */
  maxUsersPerRun: number;
  /** Days ahead to check for important dates */
  daysAheadForDates: number;
}

export interface PrecomputeJobResult extends Record<string, unknown> {
  usersProcessed: number;
  insightsGenerated: number;
  highPriorityInsights: number;
  upcomingDates: number;
  growthCelebrations: number;
}

/**
 * Superhuman Context Pre-computation Job
 *
 * Pre-computes superhuman context for active users, identifying
 * proactive insights that should be surfaced in their next session.
 *
 * This enables features like:
 * - "Happy birthday!" on the right day
 * - Growth celebrations queued up
 * - Topic absence notifications
 */
export class SuperhumanContextPrecomputeJob extends ScheduledJob<
  PrecomputeJobConfig,
  PrecomputeJobResult
> {
  readonly name = 'SuperhumanContextPrecomputeJob';
  readonly defaultConfig: PrecomputeJobConfig = {
    dryRun: false,
    maxUsersPerRun: 100,
    daysAheadForDates: 7,
  };

  protected async execute(
    config: PrecomputeJobConfig,
    ctx: JobContext
  ): Promise<PrecomputeJobResult> {
    ctx.log.info('Starting superhuman context pre-computation');

    // Get active users
    const users = await getActiveUserProfiles(config.maxUsersPerRun);
    ctx.log.info({ userCount: users.length }, 'Found active users for context pre-computation');

    let totalInsights = 0;
    let highPriorityInsights = 0;
    let upcomingDates = 0;
    let growthCelebrations = 0;

    for (const profile of users) {
      try {
        ctx.counters.processed++;

        // Build superhuman context
        const context: SuperhumanContext = buildSuperhumanContext(profile, {
          sessionCount: profile.totalConversations || 0,
          recentTopics: profile.preferredTopics || [],
        });

        // Count insights by type
        for (const insight of context.insights) {
          totalInsights++;
          if (insight.priority === 'high') highPriorityInsights++;
          if (insight.type === 'date_reminder') upcomingDates++;
          if (insight.type === 'growth_celebration') growthCelebrations++;
        }

        // Store pre-computed context for quick access
        if (!config.dryRun && context.insights.length > 0) {
          await this.storePrecomputedContext(profile.id, context);

          ctx.log.info(
            {
              userId: profile.id,
              insights: context.insights.length,
              highPriority: context.insights.filter((i) => i.priority === 'high').length,
            },
            'Pre-computed superhuman context'
          );
        }

        ctx.counters.success++;
      } catch (error) {
        ctx.counters.errors++;
        ctx.log.warn({ error, userId: profile.id }, 'Failed to pre-compute context');
      }
    }

    return {
      usersProcessed: users.length,
      insightsGenerated: totalInsights,
      highPriorityInsights,
      upcomingDates,
      growthCelebrations,
    };
  }

  private async storePrecomputedContext(
    userId: string,
    context: SuperhumanContext
  ): Promise<void> {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      // Store in a separate collection for quick access
      await db.collection('superhuman_context').doc(userId).set({
        userId,
        insights: context.insights.map((i) => ({
          id: i.id,
          type: i.type,
          priority: i.priority,
          naturalPhrase: i.naturalPhrase,
          context: i.context,
        })),
        temporalContext: context.temporalContext,
        topicAbsenceCount: context.topicAbsences.length,
        hasComfortGuidance: context.comfortGuidance.stressLevel !== 'none',
        precomputedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      });
    } catch (error) {
      log.warn({ error, userId }, 'Could not store precomputed context');
    }
  }
}

// ============================================================================
// INSIGHT DELIVERY CLEANUP JOB
// ============================================================================

export interface CleanupJobConfig extends BaseJobConfig {
  /** Hours to keep delivered insight records */
  retentionHours: number;
}

export interface CleanupJobResult extends Record<string, unknown> {
  recordsCleaned: number;
}

/**
 * Insight Delivery Cleanup Job
 *
 * Cleans up old insight delivery tracking records to prevent memory bloat.
 */
export class InsightDeliveryCleanupJob extends ScheduledJob<CleanupJobConfig, CleanupJobResult> {
  readonly name = 'InsightDeliveryCleanupJob';
  readonly defaultConfig: CleanupJobConfig = {
    dryRun: false,
    retentionHours: 48,
  };

  protected async execute(config: CleanupJobConfig, ctx: JobContext): Promise<CleanupJobResult> {
    ctx.log.info('Starting insight delivery cleanup');

    if (config.dryRun) {
      ctx.log.info('DRY RUN: Would clean up old delivery records');
      return { recordsCleaned: 0 };
    }

    // Clean up in-memory delivery records
    cleanupDeliveryRecords();

    // Also clean up expired precomputed contexts
    const cleaned = await this.cleanupExpiredContexts();

    ctx.counters.processed = 1;
    ctx.counters.success = 1;

    return { recordsCleaned: cleaned };
  }

  private async cleanupExpiredContexts(): Promise<number> {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      const now = new Date().toISOString();
      const snapshot = await db
        .collection('superhuman_context')
        .where('expiresAt', '<', now)
        .limit(100)
        .get();

      const batch = db.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();

      return snapshot.size;
    } catch (error) {
      log.warn({ error }, 'Could not cleanup expired contexts');
      return 0;
    }
  }
}

// ============================================================================
// METRICS COLLECTION
// ============================================================================

export interface SuperhumanMetrics {
  // Insight generation
  totalInsightsGenerated: number;
  insightsByType: Record<string, number>;
  highPriorityInsightCount: number;

  // Delivery
  insightsDelivered: number;
  deliveryRate: number;

  // Feature usage
  dateRemindersTriggered: number;
  comfortPatternsApplied: number;
  growthCelebrationsSurfaced: number;
  insideJokesUsed: number;
  topicAbsencesDetected: number;

  // Effectiveness (would need user feedback to calculate)
  userEngagementAfterInsight?: number;

  // Timestamp
  collectedAt: Date;
}

// In-memory metrics store
const metricsStore: SuperhumanMetrics = {
  totalInsightsGenerated: 0,
  insightsByType: {},
  highPriorityInsightCount: 0,
  insightsDelivered: 0,
  deliveryRate: 0,
  dateRemindersTriggered: 0,
  comfortPatternsApplied: 0,
  growthCelebrationsSurfaced: 0,
  insideJokesUsed: 0,
  topicAbsencesDetected: 0,
  collectedAt: new Date(),
};

/**
 * Record that an insight was generated
 */
export function recordInsightGenerated(type: string, priority: string): void {
  metricsStore.totalInsightsGenerated++;
  metricsStore.insightsByType[type] = (metricsStore.insightsByType[type] || 0) + 1;
  if (priority === 'high') {
    metricsStore.highPriorityInsightCount++;
  }
}

/**
 * Record that an insight was delivered to the user
 */
export function recordInsightDelivered(type: string): void {
  metricsStore.insightsDelivered++;

  switch (type) {
    case 'date_reminder':
      metricsStore.dateRemindersTriggered++;
      break;
    case 'growth_celebration':
      metricsStore.growthCelebrationsSurfaced++;
      break;
    case 'inside_joke':
      metricsStore.insideJokesUsed++;
      break;
  }

  // Calculate delivery rate
  if (metricsStore.totalInsightsGenerated > 0) {
    metricsStore.deliveryRate =
      metricsStore.insightsDelivered / metricsStore.totalInsightsGenerated;
  }
}

/**
 * Record that a comfort pattern was applied
 */
export function recordComfortPatternApplied(): void {
  metricsStore.comfortPatternsApplied++;
}

/**
 * Record that a topic absence was detected
 */
export function recordTopicAbsenceDetected(): void {
  metricsStore.topicAbsencesDetected++;
}

/**
 * Get current superhuman memory metrics
 */
export function getSuperhumanMetrics(): SuperhumanMetrics {
  return {
    ...metricsStore,
    collectedAt: new Date(),
  };
}

/**
 * Reset metrics (for testing or new collection period)
 */
export function resetSuperhumanMetrics(): void {
  metricsStore.totalInsightsGenerated = 0;
  metricsStore.insightsByType = {};
  metricsStore.highPriorityInsightCount = 0;
  metricsStore.insightsDelivered = 0;
  metricsStore.deliveryRate = 0;
  metricsStore.dateRemindersTriggered = 0;
  metricsStore.comfortPatternsApplied = 0;
  metricsStore.growthCelebrationsSurfaced = 0;
  metricsStore.insideJokesUsed = 0;
  metricsStore.topicAbsencesDetected = 0;
  metricsStore.collectedAt = new Date();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  UserMemoryReindexJob,
  SuperhumanContextPrecomputeJob,
  InsightDeliveryCleanupJob,
  // Metrics
  recordInsightGenerated,
  recordInsightDelivered,
  recordComfortPatternApplied,
  recordTopicAbsenceDetected,
  getSuperhumanMetrics,
  resetSuperhumanMetrics,
};
