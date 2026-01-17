/**
 * TTL Backfill Migration
 *
 * Adds `expiresAt` fields to existing documents that don't have them.
 * This ensures existing data follows our TTL policies.
 *
 * Run this migration once after deploying the TTL system.
 *
 * Usage:
 * ```bash
 * npx tsx src/services/data-hygiene/ttl-backfill.ts
 * npx tsx src/services/data-hygiene/ttl-backfill.ts --dry-run
 * npx tsx src/services/data-hygiene/ttl-backfill.ts --collection ceo_wins
 * ```
 *
 * @module services/data-hygiene/ttl-backfill
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ttl-backfill' });

// ============================================================================
// TTL CONFIGURATION
// ============================================================================

/**
 * TTL settings by collection name (in days)
 */
export const TTL_DAYS: Record<string, number> = {
  // Core system collections
  superhuman_cache: 7, // 7 days
  sessions: 1, // 24 hours
  tool_executions: 30, // 30 days
  intents: 30, // 30 days

  // CEO Coaching - Reflective content (2 years)
  ceo_wins: 730,
  ceo_gratitude: 730,
  ceo_journal: 730,
  ceo_decisions: 730,
  ceo_ideas: 730,
  ceo_reflections: 730,
  ceo_weekly_reviews: 730,

  // CEO Coaching - Operational content (1 year)
  ceo_energy: 365,
  ceo_priorities: 365,
  ceo_blockers: 365,
  ceo_focus_sessions: 365,

  // Memory/Intelligence
  embeddings: 365,
  communication_preferences: 730,

  // Semantic router
  semantic_router_sessions: 30,
  routing_decisions: 30,
};

/**
 * Collections to backfill with their date field for TTL calculation
 */
interface BackfillConfig {
  collection: string;
  subcollectionOf?: string;
  dateField: string; // Field to base TTL on (createdAt, timestamp, date, etc.)
  ttlDays: number;
}

export const BACKFILL_CONFIGS: BackfillConfig[] = [
  // Core system
  {
    collection: 'superhuman_cache',
    subcollectionOf: 'bogle_users',
    dateField: 'createdAt',
    ttlDays: TTL_DAYS.superhuman_cache,
  },
  {
    collection: 'sessions',
    subcollectionOf: 'bogle_users',
    dateField: 'createdAt',
    ttlDays: TTL_DAYS.sessions,
  },
  {
    collection: 'tool_executions',
    subcollectionOf: 'bogle_users',
    dateField: 'executedAt',
    ttlDays: TTL_DAYS.tool_executions,
  },
  {
    collection: 'intents',
    subcollectionOf: 'bogle_users',
    dateField: 'createdAt',
    ttlDays: TTL_DAYS.intents,
  },

  // CEO Coaching
  {
    collection: 'ceo_wins',
    subcollectionOf: 'bogle_users',
    dateField: 'date',
    ttlDays: TTL_DAYS.ceo_wins,
  },
  {
    collection: 'ceo_energy',
    subcollectionOf: 'bogle_users',
    dateField: 'timestamp',
    ttlDays: TTL_DAYS.ceo_energy,
  },
  {
    collection: 'ceo_gratitude',
    subcollectionOf: 'bogle_users',
    dateField: 'date',
    ttlDays: TTL_DAYS.ceo_gratitude,
  },
  {
    collection: 'ceo_journal',
    subcollectionOf: 'bogle_users',
    dateField: 'timestamp',
    ttlDays: TTL_DAYS.ceo_journal,
  },
  {
    collection: 'ceo_decisions',
    subcollectionOf: 'bogle_users',
    dateField: 'createdAt',
    ttlDays: TTL_DAYS.ceo_decisions,
  },
  {
    collection: 'ceo_priorities',
    subcollectionOf: 'bogle_users',
    dateField: 'createdAt',
    ttlDays: TTL_DAYS.ceo_priorities,
  },
  {
    collection: 'ceo_blockers',
    subcollectionOf: 'bogle_users',
    dateField: 'createdAt',
    ttlDays: TTL_DAYS.ceo_blockers,
  },
  {
    collection: 'ceo_ideas',
    subcollectionOf: 'bogle_users',
    dateField: 'createdAt',
    ttlDays: TTL_DAYS.ceo_ideas,
  },
  {
    collection: 'ceo_focus_sessions',
    subcollectionOf: 'bogle_users',
    dateField: 'startedAt',
    ttlDays: TTL_DAYS.ceo_focus_sessions,
  },
  {
    collection: 'ceo_reflections',
    subcollectionOf: 'bogle_users',
    dateField: 'date',
    ttlDays: TTL_DAYS.ceo_reflections,
  },
  {
    collection: 'ceo_weekly_reviews',
    subcollectionOf: 'bogle_users',
    dateField: 'weekStartDate',
    ttlDays: TTL_DAYS.ceo_weekly_reviews,
  },

  // Embeddings
  {
    collection: 'embeddings',
    subcollectionOf: 'bogle_users',
    dateField: 'createdAt',
    ttlDays: TTL_DAYS.embeddings,
  },

  // Communication preferences
  {
    collection: 'communication_preferences',
    subcollectionOf: 'bogle_users',
    dateField: 'createdAt',
    ttlDays: TTL_DAYS.communication_preferences,
  },
];

// ============================================================================
// TYPES
// ============================================================================

interface BackfillStats {
  collection: string;
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

interface BackfillResult {
  success: boolean;
  dryRun: boolean;
  stats: BackfillStats[];
  totalUpdated: number;
  totalSkipped: number;
  totalErrors: number;
  durationMs: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate expiresAt date from a source date and TTL days
 */
function calculateExpiresAt(sourceDate: Date | string | undefined, ttlDays: number): string {
  const base = sourceDate ? new Date(sourceDate as string) : new Date();

  // Validate the date
  if (isNaN(base.getTime())) {
    // Invalid date, use current time
    const now = new Date();
    now.setDate(now.getDate() + ttlDays);
    return now.toISOString();
  }

  base.setDate(base.getDate() + ttlDays);
  return base.toISOString();
}

/**
 * Get the source date from a document
 */
function getSourceDate(
  data: Record<string, unknown>,
  dateField: string
): Date | string | undefined {
  const value = data[dateField];

  if (!value) return undefined;

  // Handle Firestore Timestamp
  if (typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }

  // Handle string dates
  if (typeof value === 'string') {
    return value;
  }

  // Handle Date objects
  if (value instanceof Date) {
    return value;
  }

  return undefined;
}

// ============================================================================
// BACKFILL FUNCTIONS
// ============================================================================

/**
 * Backfill a single collection with TTL fields
 */
async function backfillCollection(
  config: BackfillConfig,
  dryRun: boolean
): Promise<BackfillStats> {
  const startTime = Date.now();
  const stats: BackfillStats = {
    collection: config.collection,
    scanned: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    durationMs: 0,
  };

  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.warn({ collection: config.collection }, 'Firestore not available');
      return stats;
    }

    const batchSize = 500;
    let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    let hasMore = true;

    while (hasMore) {
      // Query documents WITHOUT expiresAt field
      let query: FirebaseFirestore.Query;

      if (config.subcollectionOf) {
        query = db.collectionGroup(config.collection).limit(batchSize);
      } else {
        query = db.collection(config.collection).limit(batchSize);
      }

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        hasMore = false;
        continue;
      }

      stats.scanned += snapshot.size;

      // Filter to only docs without expiresAt
      const docsToUpdate = snapshot.docs.filter((doc) => {
        const data = doc.data();
        return !data.expiresAt;
      });

      if (docsToUpdate.length === 0) {
        stats.skipped += snapshot.size;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        continue;
      }

      stats.skipped += snapshot.size - docsToUpdate.length;

      if (dryRun) {
        // In dry-run mode, just count what would be updated
        stats.updated += docsToUpdate.length;
        log.info(
          {
            collection: config.collection,
            wouldUpdate: docsToUpdate.length,
            sample: docsToUpdate[0]?.id,
          },
          '[DRY RUN] Would update documents'
        );
      } else {
        // Actually update the documents
        const batch = db.batch();
        let batchCount = 0;

        for (const doc of docsToUpdate) {
          const data = doc.data();
          const sourceDate = getSourceDate(data, config.dateField);
          const expiresAt = calculateExpiresAt(sourceDate, config.ttlDays);

          batch.update(doc.ref, { expiresAt });
          batchCount++;
        }

        try {
          await batch.commit();
          stats.updated += batchCount;
          log.debug(
            { collection: config.collection, updated: batchCount },
            'Batch updated'
          );
        } catch (error) {
          stats.errors += batchCount;
          log.error(
            { error: String(error), collection: config.collection },
            'Batch update failed'
          );
        }
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      // Check if we've processed all documents
      if (snapshot.size < batchSize) {
        hasMore = false;
      }
    }
  } catch (error) {
    log.error(
      { error: String(error), collection: config.collection },
      'Collection backfill failed'
    );
  }

  stats.durationMs = Date.now() - startTime;
  return stats;
}

/**
 * Run TTL backfill for all collections
 */
export async function runTTLBackfill(options: {
  dryRun?: boolean;
  collection?: string;
}): Promise<BackfillResult> {
  const startTime = Date.now();
  const dryRun = options.dryRun ?? false;
  const stats: BackfillStats[] = [];

  log.info({ dryRun }, '🔄 Starting TTL backfill migration');

  // Filter configs if specific collection requested
  const configs = options.collection
    ? BACKFILL_CONFIGS.filter((c) => c.collection === options.collection)
    : BACKFILL_CONFIGS;

  if (configs.length === 0 && options.collection) {
    log.error({ collection: options.collection }, 'Unknown collection');
    return {
      success: false,
      dryRun,
      stats: [],
      totalUpdated: 0,
      totalSkipped: 0,
      totalErrors: 1,
      durationMs: 0,
    };
  }

  for (const config of configs) {
    log.info(
      { collection: config.collection, ttlDays: config.ttlDays },
      `Processing ${config.collection}...`
    );
    const collectionStats = await backfillCollection(config, dryRun);
    stats.push(collectionStats);

    log.info(
      {
        collection: config.collection,
        scanned: collectionStats.scanned,
        updated: collectionStats.updated,
        skipped: collectionStats.skipped,
        errors: collectionStats.errors,
        durationMs: collectionStats.durationMs,
      },
      `Completed ${config.collection}`
    );
  }

  const totalUpdated = stats.reduce((sum, s) => sum + s.updated, 0);
  const totalSkipped = stats.reduce((sum, s) => sum + s.skipped, 0);
  const totalErrors = stats.reduce((sum, s) => sum + s.errors, 0);
  const durationMs = Date.now() - startTime;

  log.info(
    {
      dryRun,
      totalUpdated,
      totalSkipped,
      totalErrors,
      durationMs,
      collections: stats.length,
    },
    `✅ TTL backfill ${dryRun ? '(dry run) ' : ''}complete`
  );

  return {
    success: totalErrors === 0,
    dryRun,
    stats,
    totalUpdated,
    totalSkipped,
    totalErrors,
    durationMs,
  };
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const collectionIndex = args.indexOf('--collection');
  const collection =
    collectionIndex !== -1 ? args[collectionIndex + 1] : undefined;

  log.info('═══════════════════════════════════════════════════════════════');
  log.info('                     TTL BACKFILL MIGRATION                    ');
  log.info('═══════════════════════════════════════════════════════════════');
  log.info({ dryRun, collection }, `Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update documents)'}`);
  log.info('═══════════════════════════════════════════════════════════════');

  try {
    const result = await runTTLBackfill({ dryRun, collection });

    log.info('═══════════════════════════════════════════════════════════════');
    log.info('                         RESULTS                              ');
    log.info('═══════════════════════════════════════════════════════════════');
    log.info({ success: result.success }, `Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    log.info({ dryRun: result.dryRun }, `Mode: ${result.dryRun ? 'DRY RUN' : 'LIVE'}`);
    log.info({ totalUpdated: result.totalUpdated }, `Total Updated: ${result.totalUpdated}`);
    log.info({ totalSkipped: result.totalSkipped }, `Total Skipped (already had TTL): ${result.totalSkipped}`);
    log.info({ totalErrors: result.totalErrors }, `Total Errors: ${result.totalErrors}`);
    log.info({ durationMs: result.durationMs }, `Duration: ${result.durationMs}ms`);
    log.info('Per-Collection Stats:');
    for (const stat of result.stats) {
      log.info(
        { collection: stat.collection, scanned: stat.scanned, updated: stat.updated, skipped: stat.skipped, errors: stat.errors },
        `  ${stat.collection}: scanned=${stat.scanned}, updated=${stat.updated}, skipped=${stat.skipped}, errors=${stat.errors}`
      );
    }
    log.info('═══════════════════════════════════════════════════════════════');

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    log.error({ error: String(error) }, 'Migration failed');
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main();
}

export default { runTTLBackfill, TTL_DAYS, BACKFILL_CONFIGS };
