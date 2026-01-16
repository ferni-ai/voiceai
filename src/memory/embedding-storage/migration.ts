/**
 * Embedding Migration Utilities
 *
 * Tools for migrating embeddings from embedded fields to separate storage.
 * Supports blue-green migration with rollback capability.
 *
 * Migration flow:
 * 1. Read source document with embedding
 * 2. Store embedding in separate collection
 * 3. Update source document with reference (hasEmbedding: true)
 * 4. Keep original embedding for rollback window (7 days)
 * 5. Cleanup original embedding after rollback window
 *
 * @module memory/embedding-storage/migration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getEmbeddingStorage } from './firestore-embedding-storage.js';
import type {
  EmbeddingSourceType,
  MigrationResult,
  MigrationStatus,
  StoredEmbedding,
} from './types.js';

const log = createLogger({ module: 'embedding-migration' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const MIGRATION_CONFIG = {
  BATCH_SIZE: 50,
  ROLLBACK_WINDOW_DAYS: 7,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
};

// ============================================================================
// SUMMARY EMBEDDING MIGRATION
// ============================================================================

/**
 * Migrate embeddings from conversation summaries to separate storage.
 */
export async function migrateSummaryEmbeddings(
  userId: string,
  options: {
    dryRun?: boolean;
    limit?: number;
    skipMigrated?: boolean;
  } = {}
): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    success: true,
    processed: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  log.info({ userId, dryRun: options.dryRun }, 'Starting summary embedding migration');

  try {
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      throw new Error('Firestore not available');
    }

    // Query summaries with embeddings
    const summariesRef = db.collection(`bogle_users/${userId}/summaries`);
    let query = summariesRef.limit(options.limit ?? 1000);

    if (options.skipMigrated) {
      // Skip already migrated (have hasEmbedding: true but no embedding field)
      query = summariesRef.where('embedding', '!=', null).limit(options.limit ?? 1000);
    }

    const snapshot = await query.get();

    log.debug({ count: snapshot.size }, 'Found summaries to process');

    const storage = getEmbeddingStorage();

    for (const doc of snapshot.docs) {
      result.processed++;
      const data = doc.data();

      // Check if already migrated
      if (data.hasEmbedding === true && !data.embedding) {
        result.skipped++;
        continue;
      }

      // Check if has embedding to migrate
      if (!data.embedding || !Array.isArray(data.embedding)) {
        result.skipped++;
        continue;
      }

      if (options.dryRun) {
        log.debug({ summaryId: doc.id, embeddingSize: data.embedding.length }, 'Would migrate');
        result.migrated++;
        continue;
      }

      // Migrate embedding
      try {
        // Store in separate collection
        const embeddingDoc: Omit<StoredEmbedding, 'id' | 'createdAt'> = {
          userId,
          sourceType: 'summary',
          sourceId: doc.id,
          vector: data.embedding,
          dimension: data.embedding.length,
          model: 'text-embedding-004', // Assume default
          expiresAt: data.timestamp
            ? new Date(new Date(data.timestamp).getTime() + 730 * 24 * 60 * 60 * 1000) // 2 years TTL
            : undefined,
          metadata: {
            sessionId: data.sessionId,
            mainTopics: data.mainTopics,
          },
        };

        await storage.store(embeddingDoc);

        // Update source document with reference
        // Keep embedding for rollback window
        const rollbackDate = new Date();
        rollbackDate.setDate(rollbackDate.getDate() + MIGRATION_CONFIG.ROLLBACK_WINDOW_DAYS);

        await doc.ref.update({
          hasEmbedding: true,
          embeddingMigratedAt: new Date().toISOString(),
          embeddingRollbackUntil: rollbackDate.toISOString(),
          // Note: We don't remove embedding yet - that's done in cleanup phase
        });

        result.migrated++;
        log.debug({ summaryId: doc.id }, 'Migrated summary embedding');
      } catch (error) {
        result.failed++;
        result.errors.push({ sourceId: doc.id, error: String(error) });
        log.error({ error: String(error), summaryId: doc.id }, 'Failed to migrate summary');
      }
    }
  } catch (error) {
    result.success = false;
    log.error({ error: String(error), userId }, 'Summary migration failed');
  }

  result.durationMs = Date.now() - startTime;

  log.info(
    {
      userId,
      processed: result.processed,
      migrated: result.migrated,
      skipped: result.skipped,
      failed: result.failed,
      durationMs: result.durationMs,
    },
    'Summary embedding migration completed'
  );

  return result;
}

/**
 * Cleanup old embeddings from source documents after rollback window.
 */
export async function cleanupMigratedEmbeddings(
  userId: string,
  options: { dryRun?: boolean } = {}
): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    success: true,
    processed: 0,
    migrated: 0, // Using this as "cleaned" count
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  log.info({ userId, dryRun: options.dryRun }, 'Starting embedding cleanup');

  try {
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const { FieldValue } = await import('firebase-admin/firestore');
    const db = getFirestoreDb();

    if (!db) {
      throw new Error('Firestore not available');
    }

    const now = new Date();

    // Find documents past rollback window
    const summariesRef = db.collection(`bogle_users/${userId}/summaries`);
    const query = summariesRef
      .where('hasEmbedding', '==', true)
      .where('embeddingRollbackUntil', '<', now.toISOString())
      .limit(500);

    const snapshot = await query.get();

    for (const doc of snapshot.docs) {
      result.processed++;
      const data = doc.data();

      // Skip if embedding already removed
      if (!data.embedding) {
        result.skipped++;
        continue;
      }

      if (options.dryRun) {
        log.debug({ summaryId: doc.id }, 'Would cleanup embedding');
        result.migrated++;
        continue;
      }

      try {
        // Remove embedding field
        await doc.ref.update({
          embedding: FieldValue.delete(),
          embeddingRollbackUntil: FieldValue.delete(),
          embeddingCleanedAt: new Date().toISOString(),
        });

        result.migrated++;
        log.debug({ summaryId: doc.id }, 'Cleaned up embedding');
      } catch (error) {
        result.failed++;
        result.errors.push({ sourceId: doc.id, error: String(error) });
      }
    }
  } catch (error) {
    result.success = false;
    log.error({ error: String(error), userId }, 'Cleanup failed');
  }

  result.durationMs = Date.now() - startTime;

  log.info(
    {
      userId,
      processed: result.processed,
      cleaned: result.migrated,
      durationMs: result.durationMs,
    },
    'Embedding cleanup completed'
  );

  return result;
}

/**
 * Rollback migration for a user (restore embeddings to source documents).
 */
export async function rollbackMigration(
  userId: string,
  options: { dryRun?: boolean } = {}
): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    success: true,
    processed: 0,
    migrated: 0, // Using as "rolled back" count
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  log.info({ userId, dryRun: options.dryRun }, 'Starting migration rollback');

  try {
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      throw new Error('Firestore not available');
    }

    const storage = getEmbeddingStorage();

    // Find migrated documents
    const summariesRef = db.collection(`bogle_users/${userId}/summaries`);
    const query = summariesRef.where('hasEmbedding', '==', true).limit(500);

    const snapshot = await query.get();

    for (const doc of snapshot.docs) {
      result.processed++;
      const data = doc.data();

      // Skip if already has embedding (wasn't cleaned yet)
      if (data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
        result.skipped++;
        continue;
      }

      if (options.dryRun) {
        log.debug({ summaryId: doc.id }, 'Would rollback');
        result.migrated++;
        continue;
      }

      try {
        // Get embedding from separate storage
        const embedding = await storage.getBySource(userId, 'summary', doc.id);

        if (!embedding) {
          log.warn({ summaryId: doc.id }, 'No embedding found in storage - cannot rollback');
          result.skipped++;
          continue;
        }

        // Restore to source document
        await doc.ref.update({
          embedding: embedding.vector,
          hasEmbedding: false,
          embeddingRolledBackAt: new Date().toISOString(),
        });

        result.migrated++;
        log.debug({ summaryId: doc.id }, 'Rolled back embedding');
      } catch (error) {
        result.failed++;
        result.errors.push({ sourceId: doc.id, error: String(error) });
      }
    }
  } catch (error) {
    result.success = false;
    log.error({ error: String(error), userId }, 'Rollback failed');
  }

  result.durationMs = Date.now() - startTime;

  log.info(
    {
      userId,
      processed: result.processed,
      rolledBack: result.migrated,
      durationMs: result.durationMs,
    },
    'Migration rollback completed'
  );

  return result;
}

// ============================================================================
// BATCH MIGRATION (for all users)
// ============================================================================

/**
 * Run migration for multiple users.
 */
export async function runBatchMigration(
  getUserIds: () => Promise<string[]>,
  options: {
    dryRun?: boolean;
    maxUsers?: number;
    sourceTypes?: EmbeddingSourceType[];
  } = {}
): Promise<{
  totalProcessed: number;
  totalMigrated: number;
  totalFailed: number;
  userResults: Array<{ userId: string; result: MigrationResult }>;
  durationMs: number;
}> {
  const startTime = Date.now();
  const userResults: Array<{ userId: string; result: MigrationResult }> = [];
  let totalProcessed = 0;
  let totalMigrated = 0;
  let totalFailed = 0;

  try {
    const userIds = await getUserIds();
    const usersToProcess = options.maxUsers
      ? userIds.slice(0, options.maxUsers)
      : userIds;

    log.info({ userCount: usersToProcess.length, dryRun: options.dryRun }, 'Starting batch migration');

    for (const userId of usersToProcess) {
      // Migrate summaries
      const result = await migrateSummaryEmbeddings(userId, {
        dryRun: options.dryRun,
        skipMigrated: true,
      });

      userResults.push({ userId, result });
      totalProcessed += result.processed;
      totalMigrated += result.migrated;
      totalFailed += result.failed;

      // Small delay between users
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Batch migration failed');
  }

  const durationMs = Date.now() - startTime;

  log.info(
    {
      totalProcessed,
      totalMigrated,
      totalFailed,
      userCount: userResults.length,
      durationMs,
    },
    'Batch migration completed'
  );

  return {
    totalProcessed,
    totalMigrated,
    totalFailed,
    userResults,
    durationMs,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  migrateSummaryEmbeddings,
  cleanupMigratedEmbeddings,
  rollbackMigration,
  runBatchMigration,
};
