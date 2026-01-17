/**
 * Stale Profile Cleanup Script
 *
 * Deletes empty anonymous test profiles from Firestore to:
 * - Reduce Firestore read costs
 * - Speed up operations that iterate over profiles
 * - Prevent startup hangs (like the Dec 2024 incident)
 *
 * Only deletes profiles that are:
 * - Anonymous (id starts with "anon:")
 * - Have no meaningful profile data
 * - Have no conversation history
 *
 * Usage:
 *   pnpm ops:profiles:clean
 *   npx tsx scripts/delete-stale-profiles.ts
 *   npx tsx scripts/delete-stale-profiles.ts --dry-run
 *
 * SAFETY: Real user profiles are NEVER deleted.
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { getLogger } from '../src/utils/safe-logger.js';

const log = getLogger();

const DRY_RUN = process.argv.includes('--dry-run');

async function deleteStaleProfiles(): Promise<void> {
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No profiles will be deleted\n');
  }

  log.info('🗑️ Starting stale profile cleanup...');

  // Initialize Firebase Admin
  if (!admin.apps.length) {
    const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
    admin.initializeApp({ projectId });
    log.info({ projectId }, 'Firebase Admin initialized');
  }

  const db = admin.firestore();
  const profilesRef = db.collection('bogle_users');
  const snapshot = await profilesRef.get();

  log.info({ totalProfiles: snapshot.size }, 'Total profiles before cleanup');

  const toDelete: string[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const userId = doc.id;
    const isAnonymous = userId.startsWith('anon:');

    if (!isAnonymous) {
      // NEVER delete non-anonymous profiles
      continue;
    }

    // Check for meaningful profile data
    const hasProfileData =
      !!data.profile?.name ||
      !!data.profile?.fourTendency ||
      Object.keys(data.profile || {}).length > 2;

    // Check for conversations
    const hasConversations = (data.profile?.totalConversations || 0) > 0;

    // Only delete if anonymous AND has no meaningful data
    if (!hasProfileData && !hasConversations) {
      toDelete.push(userId);
    }
  }

  console.log(`\n📊 Found ${toDelete.length} empty anonymous profiles to delete`);

  if (toDelete.length === 0) {
    console.log('✅ No stale profiles found. Database is clean!');
    return;
  }

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN: Would delete these profiles:');
    toDelete.slice(0, 10).forEach((id) => console.log(`  - ${id}`));
    if (toDelete.length > 10) {
      console.log(`  ... and ${toDelete.length - 10} more`);
    }
    return;
  }

  // Delete in batches (Firestore limit is 500 per batch)
  console.log('\n🗑️ Deleting in batches of 500...');
  const batchSize = 500;
  let deletedTotal = 0;

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = db.batch();
    const slice = toDelete.slice(i, i + batchSize);

    for (const id of slice) {
      batch.delete(profilesRef.doc(id));
    }

    await batch.commit();
    deletedTotal += slice.length;
    console.log(`  ✓ Deleted batch ${Math.floor(i / batchSize) + 1} (${slice.length} profiles)`);
  }

  // Verify
  const afterSnapshot = await profilesRef.get();
  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Deleted: ${deletedTotal} empty anonymous profiles`);
  console.log(`   Remaining: ${afterSnapshot.size} profiles`);
}

deleteStaleProfiles().catch((err) => {
  log.error({ error: String(err) }, 'Profile cleanup failed');
  process.exit(1);
});
