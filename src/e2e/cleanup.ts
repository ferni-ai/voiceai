/**
 * E2E Test Cleanup
 *
 * Utilities for cleaning up test data from production Firestore.
 * Ensures tests don't leave behind orphaned data.
 */

import { createLogger } from '../utils/safe-logger.js';
import { isTestUserId, getUserPath } from './context-factory.js';
import type { E2ETestContext } from './types.js';

const log = createLogger({ module: 'e2e-cleanup' });

// ============================================================================
// Cleanup Configuration
// ============================================================================

/**
 * Subcollections under bogle_users/{userId} that should be cleaned up.
 */
const USER_SUBCOLLECTIONS = [
  'habits',
  'habit_completions',
  'career',
  'contacts',
  'memories',
  'calendar_events',
  'conversations',
  'settings',
  'integrations',
  'learning',
  'key_moments',
  'tracked_items',
  'team_insights',
  'tasks',
  'bills',
  'routines',
  'goals',
  'wellness',
  'relationships',
  'projects',
  'workflows',
  'documents',
  'preferences',
  'outreach',
  'notifications',
];

/**
 * Batch size for Firestore delete operations.
 */
const DELETE_BATCH_SIZE = 500;

// ============================================================================
// Main Cleanup Functions
// ============================================================================

/**
 * Clean up all test data for a user.
 *
 * @param ctx - E2E test context
 * @returns Number of documents deleted
 */
export async function cleanupTestUser(ctx: E2ETestContext): Promise<number> {
  // Safety check: only delete test users
  if (!isTestUserId(ctx.userId)) {
    ctx.log.error('Refusing to delete non-test user', { userId: ctx.userId });
    throw new Error(`Refusing to delete non-test user: ${ctx.userId}`);
  }

  ctx.log.info('Starting cleanup for test user', {
    userId: ctx.userId.substring(0, 20) + '...',
  });

  let totalDeleted = 0;

  // Delete all subcollections
  for (const subcollection of USER_SUBCOLLECTIONS) {
    const deleted = await deleteCollection(
      ctx,
      `${getUserPath(ctx.userId)}/${subcollection}`
    );
    totalDeleted += deleted;
  }

  // Delete the user document itself
  try {
    const userDocRef = ctx.firestore.doc(getUserPath(ctx.userId));
    await userDocRef.delete();
    totalDeleted++;
  } catch (error) {
    // Ignore if document doesn't exist
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('NOT_FOUND')) {
      ctx.log.warn('Error deleting user document', { error: errorMessage });
    }
  }

  ctx.log.info('Cleanup complete', { totalDeleted });
  return totalDeleted;
}

/**
 * Delete all documents in a collection.
 */
async function deleteCollection(
  ctx: E2ETestContext,
  collectionPath: string
): Promise<number> {
  let totalDeleted = 0;

  try {
    const collectionRef = ctx.firestore.collection(collectionPath);

    // Process in batches
    let hasMore = true;
    while (hasMore) {
      const snapshot = await collectionRef.limit(DELETE_BATCH_SIZE).get();

      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      // Create batch delete
      const batch = ctx.firestore.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
      }

      await batch.commit();
      totalDeleted += snapshot.docs.length;

      // If we got less than batch size, we're done
      if (snapshot.docs.length < DELETE_BATCH_SIZE) {
        hasMore = false;
      }
    }
  } catch (error) {
    // Ignore collection not found errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('NOT_FOUND') && !errorMessage.includes('not found')) {
      ctx.log.warn('Error deleting collection', {
        collectionPath,
        error: errorMessage,
      });
    }
  }

  return totalDeleted;
}

// ============================================================================
// Stale Test Data Cleanup
// ============================================================================

/**
 * Find and clean up stale test users.
 * Test users older than maxAgeMs will be deleted.
 *
 * @param firestore - Firestore instance
 * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 * @returns Number of test users cleaned up
 */
export async function cleanupStaleTestUsers(
  firestore: FirebaseFirestore.Firestore,
  maxAgeMs: number = 24 * 60 * 60 * 1000
): Promise<number> {
  const cutoffTime = Date.now() - maxAgeMs;
  let cleanedUp = 0;

  try {
    // Query for test users
    const usersRef = firestore.collection('bogle_users');
    const snapshot = await usersRef.get();

    for (const doc of snapshot.docs) {
      const userId = doc.id;

      // Only process test users
      if (!isTestUserId(userId)) {
        continue;
      }

      // Extract timestamp from user ID (format: e2e-test-{timestamp}-{random})
      const match = userId.match(/e2e-test-(\d+)-/);
      if (!match) {
        continue;
      }

      const timestamp = parseInt(match[1], 10);
      if (timestamp < cutoffTime) {
        // Create a minimal context for cleanup
        const ctx: E2ETestContext = {
          userId,
          firestore,
          apiBaseUrl: '',
          log: {
            debug: () => {},
            info: (msg) => log.info({ userId }, msg),
            warn: (msg, data) => log.warn({ userId, ...data }, msg),
            error: (msg, data) => log.error({ userId, ...data }, msg),
          },
          startTime: Date.now(),
        };

        try {
          await cleanupTestUser(ctx);
          cleanedUp++;
          log.info({ userId: userId.substring(0, 20) }, 'Cleaned up stale test user');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.warn({ userId: userId.substring(0, 20), error: errorMessage }, 'Failed to clean up stale test user');
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMessage }, 'Error during stale test user cleanup');
  }

  log.info({ cleanedUp }, 'Stale test user cleanup complete');
  return cleanedUp;
}

// ============================================================================
// Selective Cleanup
// ============================================================================

/**
 * Delete specific data for a test.
 */
export async function deleteTestData(
  ctx: E2ETestContext,
  paths: string[]
): Promise<number> {
  let deleted = 0;

  for (const path of paths) {
    const resolvedPath = path.replace('{userId}', ctx.userId);

    try {
      // Determine if path is a document or collection
      const pathParts = resolvedPath.split('/');
      const isDocument = pathParts.length % 2 === 0;

      if (isDocument) {
        const docRef = ctx.firestore.doc(resolvedPath);
        await docRef.delete();
        deleted++;
      } else {
        deleted += await deleteCollection(ctx, resolvedPath);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.log.warn('Error deleting test data', { path: resolvedPath, error: errorMessage });
    }
  }

  return deleted;
}

/**
 * Delete a single document.
 */
export async function deleteDocument(
  ctx: E2ETestContext,
  documentPath: string
): Promise<boolean> {
  try {
    const resolvedPath = documentPath.replace('{userId}', ctx.userId);
    const docRef = ctx.firestore.doc(resolvedPath);
    await docRef.delete();
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log.warn('Error deleting document', { documentPath, error: errorMessage });
    return false;
  }
}

// ============================================================================
// Cleanup Guard
// ============================================================================

/**
 * Ensure cleanup runs even if test throws.
 * Use as a wrapper for test execution.
 */
export async function withCleanup<T>(
  ctx: E2ETestContext,
  testFn: () => Promise<T>,
  skipCleanup = false
): Promise<T> {
  try {
    return await testFn();
  } finally {
    if (!skipCleanup) {
      try {
        await cleanupTestUser(ctx);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        ctx.log.error('Cleanup failed', { error: errorMessage });
      }
    }
  }
}
