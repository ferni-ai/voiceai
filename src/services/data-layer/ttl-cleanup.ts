/**
 * TTL Cleanup Service
 *
 * Removes expired documents from the semantic vector store based on
 * the TTL policies defined in indexing-policy.ts.
 *
 * Run via:
 * - Cloud Scheduler (production)
 * - CLI: pnpm ttl:cleanup
 * - Direct: node dist/services/data-layer/ttl-cleanup.js
 *
 * @module services/data-layer/ttl-cleanup
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { getEntityPolicy, getAllPolicies, DEFAULT_INDEXING_POLICY } from './indexing-policy.js';
import type { EntityType, EntityIndexingPolicy } from './types.js';

const log = createLogger({ module: 'ttl-cleanup' });

// ============================================================================
// TYPES
// ============================================================================

interface CleanupResult {
  entityType: EntityType;
  docsChecked: number;
  docsDeleted: number;
  errors: number;
}

interface CleanupSummary {
  startTime: Date;
  endTime: Date;
  durationMs: number;
  totalDocsChecked: number;
  totalDocsDeleted: number;
  totalErrors: number;
  results: CleanupResult[];
}

// ============================================================================
// TTL CLEANUP
// ============================================================================

/**
 * Get all indexed documents for a user
 */
async function getIndexedDocuments(
  userId: string,
  entityType: EntityType
): Promise<Array<{ id: string; indexedAt: Date }>> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('semantic_index')
      .where('entityType', '==', entityType)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      indexedAt: doc.data().indexedAt?.toDate?.() || new Date(doc.data().indexedAt),
    }));
  } catch {
    return [];
  }
}

/**
 * Delete expired document from semantic index
 */
async function deleteExpiredDocument(userId: string, docId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    await db.collection('bogle_users').doc(userId).collection('semantic_index').doc(docId).delete();

    return true;
  } catch (error) {
    log.warn({ error: String(error), docId }, 'Failed to delete expired document');
    return false;
  }
}

/**
 * Cleanup expired documents for a specific entity type and user
 */
async function cleanupEntityType(
  userId: string,
  entityType: EntityType,
  ttlDays: number
): Promise<CleanupResult> {
  const result: CleanupResult = {
    entityType,
    docsChecked: 0,
    docsDeleted: 0,
    errors: 0,
  };

  if (ttlDays === 0) {
    // No TTL - documents never expire
    return result;
  }

  const docs = await getIndexedDocuments(userId, entityType);
  result.docsChecked = docs.length;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ttlDays);

  for (const doc of docs) {
    if (doc.indexedAt < cutoffDate) {
      const deleted = await deleteExpiredDocument(userId, doc.id);
      if (deleted) {
        result.docsDeleted++;
      } else {
        result.errors++;
      }
    }
  }

  return result;
}

/**
 * Get all users with semantic index data
 */
async function getAllUsersWithIndex(): Promise<string[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db.collection('bogle_users').get();
    return snapshot.docs.map((doc) => doc.id);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get users');
    return [];
  }
}

/**
 * Run TTL cleanup for all users and entity types
 */
export async function runTTLCleanup(options?: {
  userIds?: string[];
  entityTypes?: EntityType[];
  dryRun?: boolean;
}): Promise<CleanupSummary> {
  const startTime = new Date();
  const results: CleanupResult[] = [];
  let totalDocsChecked = 0;
  let totalDocsDeleted = 0;
  let totalErrors = 0;

  log.info({ dryRun: options?.dryRun }, 'Starting TTL cleanup');

  // Get policies with TTL from the entities array
  const policies = DEFAULT_INDEXING_POLICY.entities;
  const entityTypesWithTTL =
    options?.entityTypes ||
    policies
      .filter((policy) => policy.ttlDays && policy.ttlDays > 0)
      .map((policy) => policy.entityType as EntityType);

  // Get users
  const userIds = options?.userIds || (await getAllUsersWithIndex());

  log.info(
    { userCount: userIds.length, entityTypeCount: entityTypesWithTTL.length },
    'Processing users and entity types'
  );

  for (const userId of userIds) {
    for (const entityType of entityTypesWithTTL) {
      const policy = getEntityPolicy(entityType) as EntityIndexingPolicy | undefined;
      if (!policy || !policy.ttlDays || policy.ttlDays === 0) continue;

      if (options?.dryRun) {
        const docs = await getIndexedDocuments(userId, entityType);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.ttlDays);
        const expiredCount = docs.filter((d) => d.indexedAt < cutoffDate).length;

        results.push({
          entityType,
          docsChecked: docs.length,
          docsDeleted: expiredCount,
          errors: 0,
        });

        totalDocsChecked += docs.length;
        totalDocsDeleted += expiredCount;
      } else {
        const result = await cleanupEntityType(userId, entityType, policy.ttlDays);
        results.push(result);

        totalDocsChecked += result.docsChecked;
        totalDocsDeleted += result.docsDeleted;
        totalErrors += result.errors;
      }
    }
  }

  const endTime = new Date();
  const summary: CleanupSummary = {
    startTime,
    endTime,
    durationMs: endTime.getTime() - startTime.getTime(),
    totalDocsChecked,
    totalDocsDeleted,
    totalErrors,
    results,
  };

  log.info(
    {
      durationMs: summary.durationMs,
      docsChecked: totalDocsChecked,
      docsDeleted: totalDocsDeleted,
      errors: totalErrors,
      dryRun: options?.dryRun,
    },
    'TTL cleanup completed'
  );

  return summary;
}

/**
 * Enforce maxPerUser limits for a specific entity type
 */
export async function enforceMaxPerUserLimits(
  userId: string,
  entityType: EntityType
): Promise<{ deleted: number; kept: number }> {
  const policy = getEntityPolicy(entityType);
  if (!policy?.conditions?.maxPerUser) {
    return { deleted: 0, kept: 0 };
  }

  const maxDocs = policy.conditions.maxPerUser;
  const docs = await getIndexedDocuments(userId, entityType);

  if (docs.length <= maxDocs) {
    return { deleted: 0, kept: docs.length };
  }

  // Sort by indexedAt, oldest first
  const sorted = docs.sort((a, b) => a.indexedAt.getTime() - b.indexedAt.getTime());
  const toDelete = sorted.slice(0, docs.length - maxDocs);

  let deleted = 0;
  for (const doc of toDelete) {
    const success = await deleteExpiredDocument(userId, doc.id);
    if (success) deleted++;
  }

  return { deleted, kept: docs.length - deleted };
}

// ============================================================================
// TTL STATISTICS
// ============================================================================

/**
 * Get TTL statistics for all entity types
 */
export function getTTLStatistics(): Record<
  string,
  { ttlDays: number | null; expirationDate: string | null }
> {
  const stats: Record<string, { ttlDays: number | null; expirationDate: string | null }> = {};
  const policies = DEFAULT_INDEXING_POLICY.entities;

  for (const policy of policies) {
    const ttlDays = policy.ttlDays ?? null;
    let expirationDate: string | null = null;

    if (ttlDays && ttlDays > 0) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() - ttlDays);
      expirationDate = expDate.toISOString();
    }

    stats[policy.entityType] = { ttlDays, expirationDate };
  }

  return stats;
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');

  runTTLCleanup({ dryRun })
    .then((summary) => {
      console.log('\n=== TTL Cleanup Summary ===');
      console.log(`Duration: ${summary.durationMs}ms`);
      console.log(`Documents checked: ${summary.totalDocsChecked}`);
      console.log(`Documents ${dryRun ? 'would be ' : ''}deleted: ${summary.totalDocsDeleted}`);
      console.log(`Errors: ${summary.totalErrors}`);

      if (summary.results.length > 0) {
        console.log('\nBy entity type:');
        for (const result of summary.results.filter((r) => r.docsDeleted > 0)) {
          console.log(`  ${result.entityType}: ${result.docsDeleted} deleted`);
        }
      }

      process.exit(0);
    })
    .catch((error) => {
      console.error('TTL cleanup failed:', error);
      process.exit(1);
    });
}
