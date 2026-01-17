#!/usr/bin/env npx tsx
/**
 * Migration Script: Add familyUserId to Existing Sponsored Identities
 *
 * This script migrates existing sponsored identities that don't have
 * a familyUserId field. The familyUserId enables family members to
 * have their own memory storage separate from the sponsor.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-family-user-ids.ts          # Run migration
 *   pnpm tsx scripts/migrate-family-user-ids.ts --dry-run # Preview changes
 *
 * @module scripts/migrate-family-user-ids
 */

import admin from 'firebase-admin';

// ============================================================================
// CONFIGURATION
// ============================================================================

const COLLECTION_NAME = 'sponsored_identities';
const BATCH_SIZE = 100;

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

function initializeFirebase(): admin.firestore.Firestore {
  // Check if already initialized
  if (admin.apps.length > 0) {
    return admin.firestore();
  }

  // Try to get project ID from environment
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;

  if (projectId) {
    admin.initializeApp({ projectId });
    console.log(`✅ Initialized Firebase with project: ${projectId}`);
  } else {
    // Use application default credentials
    admin.initializeApp();
    console.log('✅ Initialized Firebase with default credentials');
  }

  return admin.firestore();
}

// ============================================================================
// MIGRATION LOGIC
// ============================================================================

interface SponsoredIdentityDoc {
  id: string;
  sponsorUserId: string;
  displayName: string;
  phoneNumber: string;
  familyUserId?: string;
}

async function runMigration(): Promise<void> {
  console.log('\n🚀 Starting familyUserId Migration');
  console.log(`   Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`   Collection: ${COLLECTION_NAME}`);
  console.log('');

  const db = initializeFirebase();

  // Step 1: Find all sponsored identities without familyUserId
  console.log('📊 Scanning for identities without familyUserId...');

  const snapshot = await db.collection(COLLECTION_NAME).get();
  const totalCount = snapshot.size;

  const toMigrate: SponsoredIdentityDoc[] = [];

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (!data.familyUserId) {
      toMigrate.push({
        id: doc.id,
        sponsorUserId: data.sponsorUserId,
        displayName: data.displayName,
        phoneNumber: data.phoneNumber,
      });
    }
  });

  console.log(`   Total identities: ${totalCount}`);
  console.log(`   Need migration: ${toMigrate.length}`);
  console.log(`   Already have familyUserId: ${totalCount - toMigrate.length}`);
  console.log('');

  if (toMigrate.length === 0) {
    console.log('✅ No migration needed - all identities have familyUserId');
    return;
  }

  // Step 2: Preview changes
  console.log('📋 Identities to migrate:');
  toMigrate.forEach((identity) => {
    const maskedPhone = identity.phoneNumber
      ? `${identity.phoneNumber.slice(0, 4)}****${identity.phoneNumber.slice(-2)}`
      : 'unknown';
    console.log(`   - ${identity.displayName} (${maskedPhone})`);
    console.log(`     ID: ${identity.id}`);
    console.log(`     New familyUserId: family_${identity.id}`);
  });
  console.log('');

  if (isDryRun) {
    console.log('🔍 DRY RUN - No changes made');
    console.log(`   Would have migrated ${toMigrate.length} identities`);
    return;
  }

  // Step 3: Perform migration in batches
  console.log('🔄 Migrating...');

  let migrated = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const batchItems = toMigrate.slice(i, i + BATCH_SIZE);

    for (const identity of batchItems) {
      const familyUserId = `family_${identity.id}`;
      const docRef = db.collection(COLLECTION_NAME).doc(identity.id);

      batch.update(docRef, {
        familyUserId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    try {
      await batch.commit();
      migrated += batchItems.length;
      console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}: Migrated ${batchItems.length} identities`);
    } catch (error) {
      errors += batchItems.length;
      console.error(`   ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error);
    }
  }

  // Step 4: Summary
  console.log('');
  console.log('📊 Migration Summary:');
  console.log(`   ✅ Migrated: ${migrated}`);
  if (errors > 0) {
    console.log(`   ❌ Errors: ${errors}`);
  }
  console.log('');

  // Step 5: Verification
  console.log('🔍 Verifying migration...');
  const verifySnapshot = await db.collection(COLLECTION_NAME).get();
  let withFamilyUserId = 0;
  let withoutFamilyUserId = 0;

  verifySnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.familyUserId) {
      withFamilyUserId++;
    } else {
      withoutFamilyUserId++;
    }
  });

  console.log(`   With familyUserId: ${withFamilyUserId}`);
  console.log(`   Without familyUserId: ${withoutFamilyUserId}`);

  if (withoutFamilyUserId === 0) {
    console.log('');
    console.log('✅ Migration completed successfully!');
  } else {
    console.log('');
    console.log(`⚠️ ${withoutFamilyUserId} identities still need migration`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  try {
    await runMigration();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
