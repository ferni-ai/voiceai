#!/usr/bin/env npx tsx
/**
 * One-time script to cleanup anonymous Firebase users.
 * Run with: npx tsx scripts/cleanup-anonymous-users.ts
 *
 * Or with dry-run first: npx tsx scripts/cleanup-anonymous-users.ts --dry-run
 */

import admin from 'firebase-admin';

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;

// Initialize Firebase Admin
function initializeFirebase(): void {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (serviceAccountPath) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } else {
    // Try with project ID
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'johnb-2025',
    });
  }

  console.log('Firebase Admin initialized');
}

async function listAllUsers(): Promise<admin.auth.UserRecord[]> {
  const users: admin.auth.UserRecord[] = [];
  let nextPageToken: string | undefined;

  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    users.push(...result.users);
    nextPageToken = result.pageToken;
    console.log(`Fetched ${users.length} users...`);
  } while (nextPageToken);

  return users;
}

function isAnonymousUser(user: admin.auth.UserRecord): boolean {
  // Anonymous users typically have:
  // 1. No email
  // 2. Provider data only contains 'anonymous' or is empty
  // 3. No phone number

  const hasNoEmail = !user.email;
  const hasNoPhone = !user.phoneNumber;
  const providers = user.providerData || [];

  // Check if the only provider is anonymous or there are no providers
  const onlyAnonymousProvider = providers.length === 0 ||
    (providers.length === 1 && providers[0].providerId === 'anonymous');

  return hasNoEmail && hasNoPhone && onlyAnonymousProvider;
}

async function deleteUserBatch(uids: string[]): Promise<void> {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would delete ${uids.length} users`);
    return;
  }

  const result = await admin.auth().deleteUsers(uids);
  console.log(`Deleted ${result.successCount} users, ${result.failureCount} failures`);

  if (result.failureCount > 0) {
    result.errors.forEach((error) => {
      console.error(`  Failed to delete ${error.index}: ${error.error.message}`);
    });
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Anonymous User Cleanup Script');
  console.log(DRY_RUN ? '🔍 DRY RUN MODE - No changes will be made' : '🚨 LIVE MODE - Users will be deleted');
  console.log('='.repeat(60));

  initializeFirebase();

  // List all users
  console.log('\n📋 Fetching all users...');
  const allUsers = await listAllUsers();
  console.log(`Total users in Firebase: ${allUsers.length}`);

  // Filter anonymous users
  const anonymousUsers = allUsers.filter(isAnonymousUser);
  console.log(`Anonymous users found: ${anonymousUsers.length}`);

  if (anonymousUsers.length === 0) {
    console.log('\n✅ No anonymous users to delete');
    return;
  }

  // Show sample of anonymous users
  console.log('\n📝 Sample anonymous users:');
  anonymousUsers.slice(0, 5).forEach((user) => {
    console.log(`  - UID: ${user.uid}, Created: ${user.metadata.creationTime}`);
  });

  if (anonymousUsers.length > 5) {
    console.log(`  ... and ${anonymousUsers.length - 5} more`);
  }

  // Delete in batches
  console.log(`\n🗑️  Deleting ${anonymousUsers.length} anonymous users in batches of ${BATCH_SIZE}...`);

  const uids = anonymousUsers.map((u) => u.uid);
  let deleted = 0;

  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    await deleteUserBatch(batch);
    deleted += batch.length;
    console.log(`Progress: ${deleted}/${uids.length}`);
  }

  console.log('\n' + '='.repeat(60));
  if (DRY_RUN) {
    console.log(`🔍 DRY RUN COMPLETE - Would have deleted ${anonymousUsers.length} anonymous users`);
    console.log('Run without --dry-run to actually delete');
  } else {
    console.log(`✅ CLEANUP COMPLETE - Deleted ${anonymousUsers.length} anonymous users`);
  }
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
