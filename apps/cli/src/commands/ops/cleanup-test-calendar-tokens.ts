/**
 * Cleanup Test Calendar Tokens
 *
 * Removes test calendar tokens from Firestore that were created during E2E testing.
 * These tokens have userIds starting with "cal-test-" or "test-user-" and cause
 * errors when the calendar sync job tries to refresh their invalid tokens.
 *
 * Usage:
 *   npx tsx scripts/cleanup-test-calendar-tokens.ts
 *   npx tsx scripts/cleanup-test-calendar-tokens.ts --dry-run
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Initialize Firebase if not already done
function initFirebase(): Firestore {
  if (getApps().length === 0) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use service account credentials
      initializeApp({
        credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
        projectId,
      });
    } else {
      // Use application default credentials
      initializeApp({ projectId });
    }
  }

  return getFirestore();
}

async function cleanupTestTokens(dryRun: boolean): Promise<void> {
  console.log('🧹 Cleaning up test calendar tokens...');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');

  const firestore = initFirebase();
  // The OAuth tokens are stored in google_calendar_tokens (not calendar_tokens)
  const collection = firestore.collection('google_calendar_tokens');

  // Query for test tokens
  const snapshot = await collection.get();

  let testTokenCount = 0;
  let deletedCount = 0;
  const testTokens: string[] = [];

  for (const doc of snapshot.docs) {
    const userId = doc.id;

    // Check if this is a test token (from E2E tests)
    const isTestToken = userId.startsWith('cal-test-') || userId.startsWith('test-user-');
    if (isTestToken) {
      testTokenCount++;
      testTokens.push(userId);

      if (!dryRun) {
        await doc.ref.delete();
        deletedCount++;
        console.log(`   ✅ Deleted: ${userId}`);
      } else {
        console.log(`   📋 Would delete: ${userId}`);
      }
    }
  }

  console.log('');
  console.log('📊 Summary:');
  console.log(`   Total tokens in collection: ${snapshot.size}`);
  console.log(`   Test tokens found: ${testTokenCount}`);

  if (dryRun) {
    console.log(`   Would delete: ${testTokenCount}`);
    console.log('');
    console.log('💡 Run without --dry-run to actually delete these tokens.');
  } else {
    console.log(`   Deleted: ${deletedCount}`);
  }
}

// Main
const dryRun = process.argv.includes('--dry-run');
cleanupTestTokens(dryRun)
  .then(() => {
    console.log('');
    console.log('✅ Cleanup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  });
