#!/usr/bin/env npx tsx
/**
 * Identity E2E Validation Script
 * 
 * Run after having a conversation to validate the identity pipeline:
 * 
 *   npx tsx scripts/validate-identity.ts <firebase_uid>
 * 
 * Or find recent profiles:
 * 
 *   npx tsx scripts/validate-identity.ts --recent
 */

import { Firestore } from '@google-cloud/firestore';

const db = new Firestore({ projectId: 'johnb-2025' });

interface ValidationResult {
  check: string;
  status: '✅ PASS' | '⚠️ WARN' | '❌ FAIL';
  details: string;
}

async function validateProfile(firebaseUid: string): Promise<void> {
  console.log(`\n🔍 Validating profile for Firebase UID: ${firebaseUid}\n`);
  console.log('─'.repeat(60));

  const results: ValidationResult[] = [];

  // 1. Check if profile exists
  const doc = await db.collection('bogle_users').doc(firebaseUid).get();
  
  if (!doc.exists) {
    console.log('❌ FAIL: Profile does not exist!');
    console.log('\nThis means either:');
    console.log('  1. The Firebase UID was not passed to the voice agent');
    console.log('  2. The session ended abnormally before profile was created');
    console.log('  3. Wrong Firebase UID (check browser console for actual UID)');
    return;
  }

  const profile = doc.data()!;
  console.log('✅ Profile exists in Firestore\n');

  // 2. Check profile ID format
  results.push({
    check: 'Profile ID is Firebase UID (not device:... or anon:...)',
    status: !firebaseUid.startsWith('device:') && !firebaseUid.startsWith('anon:') 
      ? '✅ PASS' : '❌ FAIL',
    details: `ID: ${firebaseUid}`,
  });

  // 3. Check name
  results.push({
    check: 'Name is stored',
    status: profile.name && profile.name !== 'Friend' ? '✅ PASS' : '⚠️ WARN',
    details: profile.name ? `Name: "${profile.name}"` : 'No name set (user may not have shared it)',
  });

  // 4. Check totalConversations
  results.push({
    check: 'totalConversations > 0',
    status: (profile.totalConversations ?? 0) > 0 ? '✅ PASS' : '❌ FAIL',
    details: `totalConversations: ${profile.totalConversations ?? 0}`,
  });

  // 5. Check lastConversationSummary
  results.push({
    check: 'lastConversationSummary is set',
    status: profile.lastConversationSummary ? '✅ PASS' : '❌ FAIL',
    details: profile.lastConversationSummary 
      ? `Summary: "${profile.lastConversationSummary.slice(0, 50)}..."` 
      : 'No summary (session may not have ended properly)',
  });

  // 6. Check lastContact/updatedAt
  const lastContact = profile.lastContact?.toDate?.() || profile.lastContact;
  const updatedAt = profile.updatedAt?.toDate?.() || profile.updatedAt;
  results.push({
    check: 'Profile was updated recently',
    status: lastContact || updatedAt ? '✅ PASS' : '⚠️ WARN',
    details: `Last contact: ${lastContact || 'unknown'}, Updated: ${updatedAt || 'unknown'}`,
  });

  // 7. Check relationshipStage
  results.push({
    check: 'relationshipStage is set',
    status: profile.relationshipStage ? '✅ PASS' : '⚠️ WARN',
    details: `Stage: ${profile.relationshipStage || 'not set'}`,
  });

  // Print results
  console.log('VALIDATION RESULTS:');
  console.log('─'.repeat(60));
  
  for (const result of results) {
    console.log(`${result.status} ${result.check}`);
    console.log(`   ${result.details}\n`);
  }

  // Summary
  const passed = results.filter(r => r.status === '✅ PASS').length;
  const warned = results.filter(r => r.status === '⚠️ WARN').length;
  const failed = results.filter(r => r.status === '❌ FAIL').length;

  console.log('─'.repeat(60));
  console.log(`SUMMARY: ${passed} passed, ${warned} warnings, ${failed} failed`);

  if (failed > 0) {
    console.log('\n🔴 Some checks failed. See details above for troubleshooting.');
  } else if (warned > 0) {
    console.log('\n🟡 Some warnings. Identity is working but some features may be incomplete.');
  } else {
    console.log('\n🟢 All checks passed! Identity pipeline is working correctly.');
  }

  // Print full profile for debugging
  console.log('\n📋 FULL PROFILE DATA:');
  console.log('─'.repeat(60));
  console.log(JSON.stringify(profile, null, 2));
}

async function showRecentProfiles(): Promise<void> {
  console.log('\n📊 MOST RECENT PROFILES\n');
  console.log('─'.repeat(80));

  const snap = await db.collection('bogle_users')
    .orderBy('updatedAt', 'desc')
    .limit(10)
    .get();

  if (snap.empty) {
    console.log('No profiles found in Firestore.');
    return;
  }

  console.log(`Found ${snap.size} recent profiles:\n`);
  
  let firebaseUidCount = 0;
  let namedCount = 0;

  snap.docs.forEach((doc, i) => {
    const data = doc.data();
    const id = doc.id;
    const isFirebaseUid = !id.startsWith('device:') && !id.startsWith('anon:');
    const hasName = data.name && data.name !== 'Friend';
    
    if (isFirebaseUid) firebaseUidCount++;
    if (hasName) namedCount++;

    const idType = isFirebaseUid ? '🔐 Firebase' : '📱 Device/Anon';
    const updated = data.updatedAt?.toDate?.() || data.updatedAt || 'unknown';
    
    console.log(`${i + 1}. ${idType} | ${id.slice(0, 30)}...`);
    console.log(`   Name: ${data.name || '(none)'} | Conversations: ${data.totalConversations || 0}`);
    console.log(`   Last summary: ${(data.lastConversationSummary || '(none)').slice(0, 50)}`);
    console.log(`   Updated: ${updated}`);
    console.log('');
  });

  console.log('─'.repeat(80));
  console.log(`STATS: ${firebaseUidCount}/${snap.size} using Firebase UID, ${namedCount}/${snap.size} have names\n`);

  if (firebaseUidCount === 0) {
    console.log('⚠️  No profiles with Firebase UIDs! The identity fix may not be working.');
    console.log('   Check that you deployed the frontend fix: ferni deploy frontend');
  }
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--recent') {
    await showRecentProfiles();
  } else {
    await validateProfile(args[0]);
  }
}

main().catch(console.error);

