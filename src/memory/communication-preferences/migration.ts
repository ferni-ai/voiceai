/**
 * Communication Preferences Migration
 *
 * Migrates from legacy single-document format to subcollection pattern:
 *
 * Legacy: bogle_users/{userId}/memory_systems/communication_preferences
 *   { preferences: [...], lastUpdated: "..." }
 *
 * New: bogle_users/{userId}/communication_preferences/{prefId}
 *   Individual documents with TTL, confidence, etc.
 *
 * Migration is idempotent - can be run multiple times safely.
 *
 * @module memory/communication-preferences/migration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type { LegacyCommunicationPreferencesData, CommunicationPreference } from './types.js';
import { PREFERENCE_CONFIG } from './types.js';

const log = createLogger({ module: 'comm-pref-migration' });

// ============================================================================
// TYPES
// ============================================================================

interface MigrationResult {
  success: boolean;
  userId: string;
  legacyCount: number;
  migratedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
  durationMs: number;
}

interface BatchMigrationResult {
  success: boolean;
  totalUsers: number;
  totalMigrated: number;
  totalSkipped: number;
  totalErrors: number;
  userResults: MigrationResult[];
  durationMs: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate deterministic ID from dimension + approach
 */
function generatePreferenceId(dimension: string, ourApproach: string): string {
  const normalized = `${dimension}:${ourApproach}`.toLowerCase().replace(/\s+/g, '_');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `pref_${Math.abs(hash).toString(36)}`;
}

function calculateExpiresAt(): string {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + PREFERENCE_CONFIG.TTL_DAYS);
  return expiresAt.toISOString();
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Migrate communication preferences for a single user from legacy to subcollection
 */
export async function migrateUserPreferences(
  userId: string,
  options: { dryRun?: boolean } = {}
): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    success: true,
    userId,
    legacyCount: 0,
    migratedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      result.success = false;
      result.errors.push('Firestore not available');
      return result;
    }

    // Read legacy document
    const legacyDocRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_systems')
      .doc('communication_preferences');

    const legacyDoc = await legacyDocRef.get();

    if (!legacyDoc.exists) {
      log.debug({ userId }, 'No legacy preferences to migrate');
      return result;
    }

    const legacyData = legacyDoc.data() as LegacyCommunicationPreferencesData | undefined;

    if (!legacyData?.preferences || legacyData.preferences.length === 0) {
      log.debug({ userId }, 'Legacy document empty, nothing to migrate');
      return result;
    }

    result.legacyCount = legacyData.preferences.length;

    // Get new collection reference
    const newCollection = db
      .collection('bogle_users')
      .doc(userId)
      .collection('communication_preferences');

    // Check which preferences already exist (for idempotency)
    const existingIds = new Set<string>();
    const existingDocs = await newCollection.limit(500).get();
    existingDocs.docs.forEach((doc) => existingIds.add(doc.id));

    const now = new Date().toISOString();

    // Migrate each preference
    for (const legacyPref of legacyData.preferences) {
      const id = generatePreferenceId(legacyPref.dimension, legacyPref.ourApproach);

      if (existingIds.has(id)) {
        result.skippedCount++;
        continue;
      }

      if (options.dryRun) {
        log.debug({ userId, id, dimension: legacyPref.dimension }, 'Would migrate preference');
        result.migratedCount++;
        continue;
      }

      try {
        const newPref: CommunicationPreference = {
          id,
          userId,
          dimension: legacyPref.dimension,
          ourApproach: legacyPref.ourApproach,
          userResponse: legacyPref.userResponse,
          situation: legacyPref.situation,
          confidence: 0.5, // Start with moderate confidence
          observationCount: 1,
          createdAt: legacyPref.timestamp || now,
          updatedAt: now,
          expiresAt: calculateExpiresAt(),
        };

        await newCollection.doc(id).set(cleanForFirestore(newPref));
        result.migratedCount++;
      } catch (error) {
        result.errorCount++;
        result.errors.push(`${id}: ${String(error)}`);
      }
    }

    // Mark legacy document as migrated (don't delete yet for rollback)
    if (!options.dryRun && result.migratedCount > 0) {
      await legacyDocRef.update({
        migratedAt: now,
        migratedToSubcollection: true,
      });
    }

    log.info(
      {
        userId,
        legacyCount: result.legacyCount,
        migrated: result.migratedCount,
        skipped: result.skippedCount,
        errors: result.errorCount,
      },
      'User preference migration completed'
    );
  } catch (error) {
    result.success = false;
    result.errors.push(String(error));
    log.error({ error: String(error), userId }, 'User preference migration failed');
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Migrate communication preferences for all users
 */
export async function migrateAllUserPreferences(
  options: {
    dryRun?: boolean;
    maxUsers?: number;
    getUserIds?: () => Promise<string[]>;
  } = {}
): Promise<BatchMigrationResult> {
  const startTime = Date.now();
  const result: BatchMigrationResult = {
    success: true,
    totalUsers: 0,
    totalMigrated: 0,
    totalSkipped: 0,
    totalErrors: 0,
    userResults: [],
    durationMs: 0,
  };

  try {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      result.success = false;
      return result;
    }

    // Get user IDs to migrate
    let userIds: string[];
    if (options.getUserIds) {
      userIds = await options.getUserIds();
    } else {
      // Default: find users with legacy preferences
      const usersSnapshot = await db
        .collection('bogle_users')
        .limit(options.maxUsers ?? 1000)
        .get();
      userIds = usersSnapshot.docs.map((doc) => doc.id);
    }

    if (options.maxUsers) {
      userIds = userIds.slice(0, options.maxUsers);
    }

    result.totalUsers = userIds.length;
    log.info(
      { userCount: userIds.length, dryRun: options.dryRun },
      'Starting batch preference migration'
    );

    // Migrate each user
    for (const userId of userIds) {
      const userResult = await migrateUserPreferences(userId, {
        dryRun: options.dryRun,
      });

      result.userResults.push(userResult);
      result.totalMigrated += userResult.migratedCount;
      result.totalSkipped += userResult.skippedCount;
      result.totalErrors += userResult.errorCount;

      if (!userResult.success) {
        result.success = false;
      }

      // Small delay between users
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch (error) {
    result.success = false;
    log.error({ error: String(error) }, 'Batch preference migration failed');
  }

  result.durationMs = Date.now() - startTime;

  log.info(
    {
      totalUsers: result.totalUsers,
      totalMigrated: result.totalMigrated,
      totalSkipped: result.totalSkipped,
      totalErrors: result.totalErrors,
      durationMs: result.durationMs,
    },
    'Batch preference migration completed'
  );

  return result;
}

/**
 * Cleanup legacy preference documents after successful migration
 */
export async function cleanupLegacyPreferences(
  userId: string,
  options: { dryRun?: boolean } = {}
): Promise<{ deleted: boolean; error?: string }> {
  try {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      return { deleted: false, error: 'Firestore not available' };
    }

    const legacyDocRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_systems')
      .doc('communication_preferences');

    const legacyDoc = await legacyDocRef.get();

    if (!legacyDoc.exists) {
      return { deleted: false };
    }

    const data = legacyDoc.data();
    if (!data?.migratedToSubcollection) {
      return { deleted: false, error: 'Not yet migrated - run migration first' };
    }

    if (options.dryRun) {
      log.debug({ userId }, 'Would delete legacy preference document');
      return { deleted: true };
    }

    await legacyDocRef.delete();
    log.info({ userId }, 'Deleted legacy preference document');
    return { deleted: true };
  } catch (error) {
    return { deleted: false, error: String(error) };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  migrateUserPreferences,
  migrateAllUserPreferences,
  cleanupLegacyPreferences,
};
