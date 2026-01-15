/**
 * TTL Cleanup Service
 *
 * Implements automatic purging of old data based on TTL policies.
 * This ensures data hygiene and prevents unbounded storage growth.
 *
 * Collection TTL policies:
 * - semantic_intelligence/correlations: 90 days
 * - semantic_intelligence/threads: 180 days
 * - outreach/history: 365 days
 * - user_corrections: 365 days
 * - persona_interactions: 180 days
 * - emotional_trajectories: 90 days
 * - crisis_episodes: never (sensitive, manual only)
 *
 * @module services/data-layer/ttl-cleanup
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TTLCleanup' });

// ============================================================================
// TYPES
// ============================================================================

export interface TTLConfig {
  path: string;
  ttlDays: number;
  batchSize?: number;
  description?: string;
}

export interface CleanupResult {
  collection: string;
  deleted: number;
  errors: number;
  durationMs: number;
}

export interface CleanupReport {
  timestamp: Date;
  results: CleanupResult[];
  totalDeleted: number;
  totalErrors: number;
  durationMs: number;
}

// ============================================================================
// TTL CONFIGURATIONS
// ============================================================================

/**
 * TTL configurations for all collections.
 * Ordered by shortest TTL first for efficiency.
 */
export const TTL_CONFIGS: TTLConfig[] = [
  // Ephemeral data - short TTL
  {
    path: 'emotional_state_cache',
    ttlDays: 1,
    description: 'Cached emotional states from sessions',
  },
  {
    path: 'voice_biomarkers',
    ttlDays: 7,
    description: 'Voice prosody biomarkers',
  },

  // Semantic intelligence - medium TTL
  {
    path: 'semantic_intelligence/correlations',
    ttlDays: 90,
    description: 'Cross-domain correlation patterns',
  },
  {
    path: 'semantic_intelligence/emotional_trajectories',
    ttlDays: 90,
    description: 'Emotional arc tracking',
  },
  {
    path: 'semantic_intelligence/temporal_patterns',
    ttlDays: 90,
    description: 'Time-based behavior patterns',
  },

  // Session and interaction data - medium TTL
  {
    path: 'persona_interactions',
    ttlDays: 180,
    description: 'Persona interaction history',
  },
  {
    path: 'semantic_intelligence/threads',
    ttlDays: 180,
    description: 'Conversation threads',
  },
  {
    path: 'handoff_history',
    ttlDays: 180,
    description: 'Handoff records between personas',
  },

  // Learning and history - long TTL
  {
    path: 'user_corrections',
    ttlDays: 365,
    description: 'User corrections for learning',
  },
  {
    path: 'outreach/history',
    ttlDays: 365,
    description: 'Outreach attempt history',
  },
  {
    path: 'implicit_preferences',
    ttlDays: 365,
    description: 'Learned user preferences',
  },

  // Note: crisis_episodes and dreams are NOT included
  // These are sensitive/important and should never be auto-deleted
];

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Delete documents older than TTL cutoff from a collection
 */
async function deleteExpiredDocuments(
  db: FirebaseFirestore.Firestore,
  config: TTLConfig
): Promise<CleanupResult> {
  const startTime = Date.now();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.ttlDays);

  let deleted = 0;
  let errors = 0;
  const batchSize = config.batchSize || 100;

  try {
    // Query for old documents
    const collectionRef = db.collection(config.path);
    const query = collectionRef
      .where('createdAt', '<', cutoffDate)
      .orderBy('createdAt', 'asc')
      .limit(batchSize);

    // Delete in batches
    let hasMore = true;
    while (hasMore) {
      const snapshot = await query.get();

      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      // Delete batch
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      deleted += snapshot.size;

      log.debug({ collection: config.path, deletedBatch: snapshot.size }, 'Deleted batch');

      // Check if there are more documents
      if (snapshot.size < batchSize) {
        hasMore = false;
      }

      // Small delay to avoid overwhelming Firestore
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    log.info({ collection: config.path, deleted, ttlDays: config.ttlDays }, '✅ TTL cleanup complete');
  } catch (error) {
    log.error({ error: String(error), collection: config.path }, 'TTL cleanup failed');
    errors = 1;
  }

  return {
    collection: config.path,
    deleted,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Run TTL cleanup for all configured collections
 */
export async function runTTLCleanup(options?: {
  collections?: string[];
  dryRun?: boolean;
}): Promise<CleanupReport> {
  const startTime = Date.now();
  const results: CleanupResult[] = [];
  let totalDeleted = 0;
  let totalErrors = 0;

  log.info(
    { dryRun: options?.dryRun, collections: options?.collections?.length || 'all' },
    '🧹 Starting TTL cleanup'
  );

  try {
    // Get Firestore instance
    const admin = await import('firebase-admin');
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    const db = admin.firestore();

    // Filter collections if specified
    const configs = options?.collections
      ? TTL_CONFIGS.filter((c) => options.collections!.includes(c.path))
      : TTL_CONFIGS;

    if (options?.dryRun) {
      // Dry run - just count what would be deleted
      for (const config of configs) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.ttlDays);

        try {
          const snapshot = await db
            .collection(config.path)
            .where('createdAt', '<', cutoffDate)
            .count()
            .get();

          const count = snapshot.data().count;
          results.push({
            collection: config.path,
            deleted: count, // Would be deleted
            errors: 0,
            durationMs: 0,
          });
          totalDeleted += count;

          log.info(
            { collection: config.path, wouldDelete: count, ttlDays: config.ttlDays },
            '🔍 Dry run count'
          );
        } catch (error) {
          log.warn(
            { error: String(error), collection: config.path },
            'Dry run count failed (collection may not exist)'
          );
          results.push({
            collection: config.path,
            deleted: 0,
            errors: 1,
            durationMs: 0,
          });
          totalErrors++;
        }
      }
    } else {
      // Actual cleanup
      for (const config of configs) {
        const result = await deleteExpiredDocuments(db, config);
        results.push(result);
        totalDeleted += result.deleted;
        totalErrors += result.errors;
      }
    }
  } catch (error) {
    log.error({ error: String(error) }, 'TTL cleanup initialization failed');
    totalErrors++;
  }

  const report: CleanupReport = {
    timestamp: new Date(),
    results,
    totalDeleted,
    totalErrors,
    durationMs: Date.now() - startTime,
  };

  log.info(
    {
      totalDeleted,
      totalErrors,
      durationMs: report.durationMs,
      collections: results.length,
    },
    '🧹 TTL cleanup complete'
  );

  return report;
}

/**
 * Run TTL cleanup for a single user's data
 * Useful for GDPR deletion requests
 */
export async function runUserDataCleanup(userId: string): Promise<CleanupReport> {
  const startTime = Date.now();
  const results: CleanupResult[] = [];
  let totalDeleted = 0;
  let totalErrors = 0;

  log.info({ userId }, '🧹 Starting user data cleanup');

  try {
    const admin = await import('firebase-admin');
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    const db = admin.firestore();

    // Collections that store user data
    const userCollections = [
      'users',
      'memories',
      'semantic_intelligence',
      'outreach',
      'persona_affinities',
      'user_corrections',
      'dreams',
      'commitments',
      'contacts',
    ];

    for (const collection of userCollections) {
      try {
        // Query for user's documents
        const snapshot = await db
          .collection(collection)
          .where('userId', '==', userId)
          .limit(500)
          .get();

        if (!snapshot.empty) {
          const batch = db.batch();
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();

          results.push({
            collection,
            deleted: snapshot.size,
            errors: 0,
            durationMs: 0,
          });
          totalDeleted += snapshot.size;

          log.info({ collection, deleted: snapshot.size, userId }, 'User data deleted');
        }
      } catch (error) {
        log.warn({ error: String(error), collection, userId }, 'User data deletion failed');
        results.push({
          collection,
          deleted: 0,
          errors: 1,
          durationMs: 0,
        });
        totalErrors++;
      }
    }
  } catch (error) {
    log.error({ error: String(error), userId }, 'User data cleanup initialization failed');
    totalErrors++;
  }

  return {
    timestamp: new Date(),
    results,
    totalDeleted,
    totalErrors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Schedule daily TTL cleanup (for Cloud Scheduler or cron)
 * Alias: scheduledTTLCleanup for backwards compatibility
 */
export function scheduleTTLCleanup(): void {
  // This is called at startup if running as a standalone service
  // In production, use Cloud Scheduler to call runTTLCleanup() daily
  log.info('TTL cleanup service ready. Schedule via Cloud Scheduler for daily execution.');
}

// Alias for backwards compatibility with data-layer/index.ts
export const scheduledTTLCleanup = scheduleTTLCleanup;

/**
 * Get statistics about TTL cleanup status
 */
export async function getTTLStatistics(): Promise<{
  collections: number;
  configured: Array<{ path: string; ttlDays: number }>;
  lastRun?: Date;
}> {
  return {
    collections: TTL_CONFIGS.length,
    configured: TTL_CONFIGS.map((c) => ({ path: c.path, ttlDays: c.ttlDays })),
    lastRun: undefined, // Would need to track in Firestore for persistence
  };
}

export default {
  runTTLCleanup,
  runUserDataCleanup,
  scheduleTTLCleanup,
  scheduledTTLCleanup,
  getTTLStatistics,
  TTL_CONFIGS,
};
