#!/usr/bin/env node
/**
 * Cleanup Anonymous Firebase Users
 *
 * This script deletes all anonymous users from Firebase Auth.
 * Run with: node scripts/cleanup-anonymous-users.js
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = 'johnb-2025';
const DRY_RUN = process.argv.includes('--dry-run');
const KEEP_EMAIL = 'apple-reviewer@ferni.ai'; // Keep the test reviewer account

async function main() {
  console.log('🧹 Firebase Anonymous User Cleanup');
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no deletions)' : 'LIVE'}`);
  console.log('');

  // Initialize Firebase Admin
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });

  const auth = getAuth();

  let anonymousCount = 0;
  let linkedCount = 0;
  let deletedCount = 0;
  let nextPageToken;

  console.log('📋 Scanning users...');

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);

    for (const user of listResult.users) {
      // Check if user is anonymous (no providers linked)
      const isAnonymous = user.providerData.length === 0 && !user.email;

      if (isAnonymous) {
        anonymousCount++;

        if (!DRY_RUN) {
          try {
            await auth.deleteUser(user.uid);
            deletedCount++;
            if (deletedCount % 50 === 0) {
              console.log(`   Deleted ${deletedCount} anonymous users...`);
            }
          } catch (error) {
            console.error(`   Failed to delete ${user.uid}: ${error.message}`);
          }
        }
      } else {
        linkedCount++;
        console.log(`   ✅ Keeping linked user: ${user.email || user.uid.slice(0, 8)}`);
      }
    }

    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  console.log('');
  console.log('📊 Summary:');
  console.log(`   Anonymous users found: ${anonymousCount}`);
  console.log(`   Linked users kept: ${linkedCount}`);

  if (DRY_RUN) {
    console.log(`   Would delete: ${anonymousCount} users`);
    console.log('');
    console.log('💡 Run without --dry-run to actually delete users');
  } else {
    console.log(`   Users deleted: ${deletedCount}`);
  }
}

main().catch(console.error);
