/**
 * TTL Cleanup Service
 *
 * Automatically removes expired documents from Firestore collections.
 * Runs as a scheduled job to prevent unbounded data growth.
 *
 * Collections with TTL:
 * - superhuman_cache: 7 days
 * - sessions: 24 hours
 * - tool_executions: 30 days
 * - intents: 30 days
 *
 * @module services/data-hygiene/ttl-cleanup
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ttl-cleanup' });

// ============================================================================
// TYPES
// ============================================================================

interface CleanupConfig {
  collection: string;
  subcollectionOf?: string; // If it's a subcollection under bogle_users
  ttlField: string;
  batchSize: number;
  maxBatches: number;
}

interface CleanupStats {
  collection: string;
  scanned: number;
  deleted: number;
  errors: number;
  durationMs: number;
}

interface CleanupResult {
  success: boolean;
  stats: CleanupStats[];
  totalDeleted: number;
  totalErrors: number;
  durationMs: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLEANUP_CONFIGS: CleanupConfig[] = [
  // Core system collections
  {
    collection: 'superhuman_cache',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 10,
  },
  {
    collection: 'sessions',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 10,
  },
  {
    collection: 'tool_executions',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'intents',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  // CEO Coaching collections (2-year TTL for reflective, 1-year for operational)
  {
    collection: 'ceo_wins',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_energy',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_gratitude',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_journal',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_decisions',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_priorities',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_blockers',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_ideas',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_focus_sessions',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_reflections',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  {
    collection: 'ceo_weekly_reviews',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
  // Embedding storage
  {
    collection: 'embeddings',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 10,
  },
  // Communication preferences
  {
    collection: 'communication_preferences',
    subcollectionOf: 'bogle_users',
    ttlField: 'expiresAt',
    batchSize: 500,
    maxBatches: 5,
  },
];

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Clean up expired documents from a single collection.
 */
async function cleanupCollection(config: CleanupConfig): Promise<CleanupStats> {
  const startTime = Date.now();
  const stats: CleanupStats = {
    collection: config.collection,
    scanned: 0,
    deleted: 0,
    errors: 0,
    durationMs: 0,
  };

  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.warn({ collection: config.collection }, 'Firestore not available, skipping cleanup');
      return stats;
    }

    const now = new Date();

    for (let batch = 0; batch < config.maxBatches; batch++) {
      // Use collection group query for subcollections
      let query;
      if (config.subcollectionOf) {
        query = db
          .collectionGroup(config.collection)
          .where(config.ttlField, '<', now)
          .limit(config.batchSize);
      } else {
        query = db
          .collection(config.collection)
          .where(config.ttlField, '<', now)
          .limit(config.batchSize);
      }

      const snapshot = await query.get();
      stats.scanned += snapshot.size;

      if (snapshot.empty) {
        log.debug({ collection: config.collection, batch }, 'No more expired documents');
        break;
      }

      // Batch delete
      const deleteBatch = db.batch();
      let deleteCount = 0;

      for (const doc of snapshot.docs) {
        deleteBatch.delete(doc.ref);
        deleteCount++;
      }

      try {
        await deleteBatch.commit();
        stats.deleted += deleteCount;
        log.debug({ collection: config.collection, batch, deleted: deleteCount }, 'Batch deleted');
      } catch (deleteError) {
        stats.errors += deleteCount;
        log.error(
          { error: String(deleteError), collection: config.collection, batch },
          'Batch delete failed'
        );
      }

      // Small delay between batches to avoid overwhelming Firestore
      if (batch < config.maxBatches - 1 && !snapshot.empty) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    log.error({ error: String(error), collection: config.collection }, 'Cleanup failed');
    stats.errors++;
  }

  stats.durationMs = Date.now() - startTime;
  return stats;
}

/**
 * Run TTL cleanup for all configured collections.
 * Intended to be called by a Cloud Scheduler job.
 */
export async function runTTLCleanup(): Promise<CleanupResult> {
  const startTime = Date.now();
  log.info('Starting TTL cleanup job');

  const stats: CleanupStats[] = [];
  let totalDeleted = 0;
  let totalErrors = 0;

  for (const config of CLEANUP_CONFIGS) {
    const collectionStats = await cleanupCollection(config);
    stats.push(collectionStats);
    totalDeleted += collectionStats.deleted;
    totalErrors += collectionStats.errors;
  }

  const result: CleanupResult = {
    success: totalErrors === 0,
    stats,
    totalDeleted,
    totalErrors,
    durationMs: Date.now() - startTime,
  };

  log.info(
    {
      totalDeleted,
      totalErrors,
      durationMs: result.durationMs,
      collections: stats.map((s) => ({ name: s.collection, deleted: s.deleted })),
    },
    'TTL cleanup job completed'
  );

  return result;
}

// ============================================================================
// TTL HELPERS (for adding TTL to new documents)
// ============================================================================

/**
 * Calculate expiration date based on TTL days.
 */
export function calculateExpiresAt(ttlDays: number): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);
  return expiresAt;
}

/**
 * TTL configurations for different document types.
 * High-value reflective data: 2 years (730 days)
 * Operational/transient data: 1 year (365 days)
 * System cache: 1-30 days
 */
export const TTL_DAYS = {
  // System collections
  SUPERHUMAN_CACHE: 7,
  SESSION: 1, // 24 hours
  TOOL_EXECUTION: 30,
  INTENT: 30,
  SUMMARY: 730, // 2 years
  EMBEDDING: 730, // 2 years
  // CEO Coaching - High value (2 years)
  CEO_WIN: 730,
  CEO_DECISION: 730,
  CEO_GRATITUDE: 730,
  CEO_JOURNAL: 730,
  CEO_IDEA: 730,
  CEO_REFLECTION: 730,
  CEO_WEEKLY_REVIEW: 730,
  // CEO Coaching - Operational (1 year)
  CEO_ENERGY: 365,
  CEO_PRIORITY: 365,
  CEO_BLOCKER: 365,
  CEO_FOCUS_SESSION: 365,
  // Communication preferences
  COMMUNICATION_PREFERENCE: 730, // 2 years - learned patterns
} as const;

/**
 * Add TTL fields to a document before saving.
 */
export function addTTLFields<T extends Record<string, unknown>>(
  doc: T,
  ttlDays: number
): T & { expiresAt: Date; createdAt: Date } {
  return {
    ...doc,
    createdAt: new Date(),
    expiresAt: calculateExpiresAt(ttlDays),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  runTTLCleanup,
  calculateExpiresAt,
  addTTLFields,
  TTL_DAYS,
};
