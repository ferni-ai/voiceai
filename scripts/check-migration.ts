#!/usr/bin/env npx tsx
/**
 * Check migration target for Seth Ford profile
 */

import { getFirestoreDb } from '../src/services/superhuman/firestore-utils.js';

async function checkMigration() {
  console.log('Checking migration details...\n');
  
  const db = getFirestoreDb();
  if (!db) {
    console.log('No DB');
    return;
  }
  
  // Check Seth Ford profile
  const doc = await db.collection('bogle_users').doc('granted_1767219924498_bxr6lj4').get();
  const data = doc.data() as Record<string, unknown>;
  
  console.log('Seth Ford Profile:');
  console.log(JSON.stringify(data, null, 2));
  
  // If migrated, check the target
  if (data._migratedTo) {
    console.log('\n\nChecking migrated target:', data._migratedTo);
    const targetDoc = await db.collection('bogle_users').doc(data._migratedTo as string).get();
    if (targetDoc.exists) {
      console.log('Target profile exists:');
      console.log(JSON.stringify(targetDoc.data(), null, 2));
    } else {
      console.log('Target profile not found');
    }
  }
  
  // Also search for any user with seth.ford email
  console.log('\n\nSearching for users with seth.ford in email...');
  const allUsers = await db.collection('bogle_users').get();
  for (const doc of allUsers.docs) {
    const userData = doc.data();
    if (userData.email?.includes('seth') || userData.name?.toLowerCase().includes('seth')) {
      console.log(`\nFound: ${doc.id}`);
      console.log(`  Name: ${userData.name}`);
      console.log(`  Email: ${userData.email}`);
      console.log(`  Conversations: ${userData.totalConversations || 0}`);
    }
  }
}

checkMigration().catch(console.error);
