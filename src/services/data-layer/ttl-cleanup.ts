/**
 * TTL Cleanup Job
 *
 * Scheduled job to purge expired documents from:
 * - Firestore (documents with createdAt older than policy TTL)
 * - Cleans up old data to manage storage costs and search quality
 *
 * Run with: pnpm ops:ttl-cleanup
 *
 * @module services/data-layer/ttl-cleanup
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getIndexingPolicy } from './indexing-policy.js';

const log = createLogger({ module: 'TTLCleanup' });

// ============================================================================
// TYPES
// ============================================================================

interface CleanupResult {
  deleted: number;
  totalDocsDeleted: number; // Alias for deleted
  errors: string[];
  collections: Record<string, number>;
  results: Array<{ entityType: string; deleted: number }>; // Alias for collections as array
  durationMs: number;
}

interface CollectionConfig {
  path: string;
  ttlDays: number;
  dateField: string;
}

// ============================================================================
// DRY RUN FLAG
// ============================================================================

const isDryRun = process.env.DRY_RUN === 'true';

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

async function getDb(): Promise<unknown> {
  if (_db) return _db;

  try {
    // Dynamic import to avoid bundling Firebase in voice agent
    const firebaseAdmin = await import('firebase-admin');

    if (!firebaseAdmin.default.apps.length) {
      firebaseAdmin.default.initializeApp();
    }

    _db = firebaseAdmin.default.firestore();
    return _db;
  } catch {
    log.warn('Firebase not available - TTL cleanup skipped');
    return null;
  }
}

// ============================================================================
// COLLECTION CONFIGS
// ============================================================================

function getCollectionConfigs(): CollectionConfig[] {
  const policy = getIndexingPolicy();
  const configs: CollectionConfig[] = [];

  // Generate configs from indexing policy
  for (const entityPolicy of policy.entities) {
    if (entityPolicy.ttlDays > 0) {
      configs.push({
        path: entityPolicy.entityType,
        ttlDays: entityPolicy.ttlDays,
        dateField: 'createdAt',
      });
    }
  }

  // Add additional collections not in indexing policy
  const additionalCollections: CollectionConfig[] = [
    // Session data (keep 30 days)
    { path: 'sessions', ttlDays: 30, dateField: 'startedAt' },
    // Tool executions (keep 90 days for analytics)
    { path: 'tool_executions', ttlDays: 90, dateField: 'executedAt' },
    // Voice biomarkers (short-term)
    { path: 'voice_biomarkers', ttlDays: 30, dateField: 'recordedAt' },
    // Outreach triggers (keep 30 days)
    { path: 'outreach_triggers', ttlDays: 30, dateField: 'createdAt' },
    // Outreach history (keep 180 days)
    { path: 'outreach_history', ttlDays: 180, dateField: 'sentAt' },
  ];

  return [...configs, ...additionalCollections];
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

async function cleanupCollection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  config: CollectionConfig
): Promise<{ deleted: number; error?: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.ttlDays);

  try {
    const collectionRef = db.collection('bogle_users').doc(userId).collection(config.path);

    // Query for old documents
    const query = collectionRef.where(config.dateField, '<', cutoffDate).limit(500); // Batch size

    const snapshot = await query.get();

    if (snapshot.empty) {
      return { deleted: 0 };
    }

    let deleted = 0;

    if (isDryRun) {
      deleted = snapshot.size;
      log.info(
        { userId, collection: config.path, count: deleted },
        '[DRY RUN] Would delete documents'
      );
    } else {
      // Batch delete
      const batch = db.batch();
      snapshot.docs.forEach((doc: { ref: unknown }) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      deleted = snapshot.size;

      log.debug({ userId, collection: config.path, count: deleted }, 'Deleted expired documents');
    }

    return { deleted };
  } catch (error) {
    return { deleted: 0, error: String(error) };
  }
}

async function cleanupUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  configs: CollectionConfig[]
): Promise<{ deleted: number; errors: string[]; collections: Record<string, number> }> {
  const result = {
    deleted: 0,
    errors: [] as string[],
    collections: {} as Record<string, number>,
  };

  for (const config of configs) {
    const cleanupResult = await cleanupCollection(db, userId, config);

    if (cleanupResult.error) {
      result.errors.push(`${config.path}: ${cleanupResult.error}`);
    } else {
      result.deleted += cleanupResult.deleted;
      if (cleanupResult.deleted > 0) {
        result.collections[config.path] = cleanupResult.deleted;
      }
    }
  }

  return result;
}

// ============================================================================
// MAIN CLEANUP FUNCTION
// ============================================================================

/**
 * Run TTL cleanup across all users
 */
export async function runTTLCleanup(options?: {
  userIds?: string[];
  maxUsers?: number;
  dryRun?: boolean;
  entityTypes?: string[];
}): Promise<CleanupResult> {
  const startTime = performance.now();
  const db = await getDb();

  if (!db) {
    return {
      deleted: 0,
      totalDocsDeleted: 0,
      errors: ['Firestore not available'],
      collections: {},
      results: [],
      durationMs: 0,
    };
  }

  const configs = getCollectionConfigs();
  log.info({ configCount: configs.length, isDryRun }, '🧹 Starting TTL cleanup');

  const result: CleanupResult = {
    deleted: 0,
    totalDocsDeleted: 0,
    errors: [],
    collections: {},
    results: [],
    durationMs: 0,
  };

  try {
    let userIds: string[] = options?.userIds ?? [];

    if (userIds.length === 0) {
      // Get all users
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usersSnapshot = await (db as any)
        .collection('bogle_users')
        .limit(options?.maxUsers || 1000)
        .get();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userIds = usersSnapshot.docs.map((doc: any) => doc.id);
    }

    log.info({ userCount: userIds.length }, 'Processing users');

    for (const userId of userIds) {
      const userResult = await cleanupUser(db, userId, configs);

      result.deleted += userResult.deleted;
      result.errors.push(...userResult.errors);

      // Merge collection counts
      for (const [collection, count] of Object.entries(userResult.collections)) {
        result.collections[collection] = (result.collections[collection] || 0) + count;
      }
    }
  } catch (error) {
    result.errors.push(String(error));
    log.error({ error: String(error) }, 'TTL cleanup failed');
  }

  result.durationMs = Math.round(performance.now() - startTime);

  // Add aliases for backward compatibility
  result.totalDocsDeleted = result.deleted;
  result.results = Object.entries(result.collections).map(([entityType, deleted]) => ({
    entityType,
    deleted,
  }));

  log.info(
    {
      deleted: result.deleted,
      errors: result.errors.length,
      durationMs: result.durationMs,
      isDryRun,
    },
    '🧹 TTL cleanup completed'
  );

  return result;
}

/**
 * Scheduled entry point (called by Cloud Scheduler or cron)
 */
export async function scheduledTTLCleanup(): Promise<void> {
  log.info('Starting scheduled TTL cleanup');

  const result = await runTTLCleanup();

  if (result.errors.length > 0) {
    log.warn({ errors: result.errors }, 'TTL cleanup had errors');
  }

  // Log summary
  console.log('\n=== TTL Cleanup Summary ===');
  console.log(`Total deleted: ${result.deleted}`);
  console.log(`Duration: ${result.durationMs}ms`);
  console.log(`Errors: ${result.errors.length}`);

  if (Object.keys(result.collections).length > 0) {
    console.log('\nBy collection:');
    for (const [collection, count] of Object.entries(result.collections)) {
      console.log(`  ${collection}: ${count}`);
    }
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach((e) => console.log(`  - ${e}`));
  }
}

// ============================================================================
// TTL STATISTICS (for API endpoints)
// ============================================================================

export interface TTLStatistic {
  ttlDays: number | null;
  expirationDate: string | null;
}

/**
 * Get TTL statistics for all entity types
 * Used by health endpoints and APIs
 */
export function getTTLStatistics(): Record<string, TTLStatistic> {
  const configs = getCollectionConfigs();
  const stats: Record<string, TTLStatistic> = {};

  for (const config of configs) {
    stats[config.path] = {
      ttlDays: config.ttlDays,
      expirationDate:
        config.ttlDays > 0
          ? new Date(Date.now() - config.ttlDays * 24 * 60 * 60 * 1000).toISOString()
          : null,
    };
  }

  return stats;
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (process.argv[1]?.includes('ttl-cleanup')) {
  scheduledTTLCleanup()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('TTL cleanup failed:', error);
      process.exit(1);
    });
}

export default runTTLCleanup;
