#!/usr/bin/env npx tsx
/**
 * Ferni Awareness Diagnostic Script
 *
 * Run this to check why Ferni might not be remembering a user.
 *
 * Usage:
 *   npx tsx scripts/diagnose-awareness.ts <userId>
 *   npx tsx scripts/diagnose-awareness.ts seth-123
 */

import { getFirestoreDb } from '../src/memory/firestore-client.js';
import { validateUserId } from '../src/services/session-manager/validation.js';
import { createLogger } from '../src/utils/safe-logger.js';

const log = createLogger({ module: 'diagnose-awareness' });

interface DiagnosticResult {
  userId: string;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    details?: unknown;
  }[];
  recommendations: string[];
}

async function diagnoseAwareness(userId: string): Promise<DiagnosticResult> {
  const result: DiagnosticResult = {
    userId,
    checks: [],
    recommendations: [],
  };

  console.log('\n🔍 FERNI AWARENESS DIAGNOSTIC');
  console.log('━'.repeat(50));
  console.log(`User ID: ${userId}`);
  console.log('━'.repeat(50));

  // ============================================================================
  // CHECK 1: User ID Validation
  // ============================================================================
  console.log('\n📋 CHECK 1: User ID Validation');

  const validatedId = validateUserId(userId);
  if (validatedId) {
    result.checks.push({
      name: 'User ID Validation',
      status: 'pass',
      message: `User ID "${userId}" is valid`,
    });
    console.log(`   ✅ User ID format is valid`);
  } else {
    result.checks.push({
      name: 'User ID Validation',
      status: 'fail',
      message: `User ID "${userId}" FAILED validation`,
      details: {
        length: userId.length,
        minRequired: 4,
        maxAllowed: 128,
        pattern: '/^[a-zA-Z0-9_\\-.@:]+$/',
      },
    });
    console.log(`   ❌ User ID FAILED validation!`);
    console.log(`      Length: ${userId.length} (must be 4-128)`);
    console.log(`      Pattern: /^[a-zA-Z0-9_\\-.@:]+$/`);
    result.recommendations.push(
      'Fix: Ensure userId is 4-128 chars with only alphanumeric, _, -, ., @, :'
    );
  }

  // ============================================================================
  // CHECK 2: Firestore Connection
  // ============================================================================
  console.log('\n📋 CHECK 2: Firestore Connection');

  const db = getFirestoreDb();
  if (db) {
    result.checks.push({
      name: 'Firestore Connection',
      status: 'pass',
      message: 'Firestore is connected',
    });
    console.log(`   ✅ Firestore is connected`);
  } else {
    result.checks.push({
      name: 'Firestore Connection',
      status: 'fail',
      message: 'Firestore NOT connected - profiles cannot be loaded!',
    });
    console.log(`   ❌ Firestore NOT connected!`);
    result.recommendations.push(
      'Fix: Check GOOGLE_APPLICATION_CREDENTIALS or Firestore initialization'
    );
    // Can't continue without Firestore
    return result;
  }

  // ============================================================================
  // CHECK 3: User Profile Exists
  // ============================================================================
  console.log('\n📋 CHECK 3: User Profile');

  try {
    const profileDoc = await db.collection('bogle_users').doc(userId).get();

    if (profileDoc.exists) {
      const profile = profileDoc.data();
      result.checks.push({
        name: 'Profile Exists',
        status: 'pass',
        message: 'User profile exists in Firestore',
        details: {
          name: profile?.name,
          totalConversations: profile?.totalConversations,
          createdAt: profile?.createdAt,
        },
      });
      console.log(`   ✅ Profile exists`);
      console.log(`      Name: ${profile?.name || '(not set)'}`);
      console.log(`      Total conversations: ${profile?.totalConversations || 0}`);
      console.log(`      Created: ${profile?.createdAt || '(unknown)'}`);

      // Check if profile is "empty" (new user)
      if (!profile?.totalConversations || profile.totalConversations === 0) {
        result.checks.push({
          name: 'Profile Has History',
          status: 'warn',
          message: 'Profile has 0 conversations - no memory yet',
        });
        console.log(`   ⚠️  Profile has 0 conversations - this is a new user`);
        result.recommendations.push(
          'Note: New users have no memories yet. Have at least 1 conversation first.'
        );
      }

      // Check humanMemory
      if (profile?.humanMemory) {
        const hmKeys = Object.keys(profile.humanMemory);
        console.log(`   ✅ Human memory exists (${hmKeys.length} fields)`);
      } else {
        console.log(`   ⚠️  Human memory not populated yet`);
      }
    } else {
      result.checks.push({
        name: 'Profile Exists',
        status: 'fail',
        message: 'NO profile found in Firestore for this userId!',
      });
      console.log(`   ❌ NO profile found!`);
      result.recommendations.push(
        'Fix: This userId has never been used. Check if frontend is sending correct userId.'
      );
    }
  } catch (error) {
    result.checks.push({
      name: 'Profile Exists',
      status: 'fail',
      message: `Error loading profile: ${error}`,
    });
    console.log(`   ❌ Error loading profile: ${error}`);
  }

  // ============================================================================
  // CHECK 4: Memories Subcollection
  // ============================================================================
  console.log('\n📋 CHECK 4: Memories');

  try {
    const memoriesSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memories')
      .limit(5)
      .get();

    if (memoriesSnapshot.empty) {
      result.checks.push({
        name: 'Memories Collection',
        status: 'warn',
        message: 'No memories stored yet',
      });
      console.log(`   ⚠️  No memories stored (collection empty or doesn't exist)`);
    } else {
      result.checks.push({
        name: 'Memories Collection',
        status: 'pass',
        message: `Found ${memoriesSnapshot.size} memories (showing up to 5)`,
      });
      console.log(`   ✅ Found memories (showing up to 5):`);
      memoriesSnapshot.docs.forEach((doc, i) => {
        const data = doc.data();
        console.log(`      ${i + 1}. ${data.type || 'unknown'}: ${(data.content || '').slice(0, 50)}...`);
      });
    }
  } catch (error) {
    result.checks.push({
      name: 'Memories Collection',
      status: 'fail',
      message: `Error loading memories: ${error}`,
    });
    console.log(`   ❌ Error loading memories: ${error}`);
  }

  // ============================================================================
  // CHECK 5: Conversation History
  // ============================================================================
  console.log('\n📋 CHECK 5: Conversation History');

  try {
    const conversationsSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .orderBy('startTime', 'desc')
      .limit(3)
      .get();

    if (conversationsSnapshot.empty) {
      result.checks.push({
        name: 'Conversations',
        status: 'warn',
        message: 'No conversation history found',
      });
      console.log(`   ⚠️  No conversation history found`);
    } else {
      result.checks.push({
        name: 'Conversations',
        status: 'pass',
        message: `Found ${conversationsSnapshot.size} recent conversations`,
      });
      console.log(`   ✅ Recent conversations:`);
      conversationsSnapshot.docs.forEach((doc, i) => {
        const data = doc.data();
        console.log(`      ${i + 1}. ${data.startTime || 'unknown time'} - ${data.summary?.slice(0, 40) || '(no summary)'}...`);
      });
    }
  } catch (error) {
    // This collection might not exist for all users
    console.log(`   ⚠️  Could not load conversations: ${error}`);
  }

  // ============================================================================
  // CHECK 6: Trust Profile
  // ============================================================================
  console.log('\n📋 CHECK 6: Trust Profile');

  try {
    const trustDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('trust_profiles')
      .doc('unified')
      .get();

    if (trustDoc.exists) {
      result.checks.push({
        name: 'Trust Profile',
        status: 'pass',
        message: 'Trust profile exists',
      });
      console.log(`   ✅ Trust profile exists`);
    } else {
      console.log(`   ⚠️  Trust profile not created yet`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not load trust profile: ${error}`);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '━'.repeat(50));
  console.log('📊 SUMMARY');
  console.log('━'.repeat(50));

  const passCount = result.checks.filter((c) => c.status === 'pass').length;
  const failCount = result.checks.filter((c) => c.status === 'fail').length;
  const warnCount = result.checks.filter((c) => c.status === 'warn').length;

  console.log(`   ✅ Passed: ${passCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ⚠️  Warnings: ${warnCount}`);

  if (result.recommendations.length > 0) {
    console.log('\n📝 RECOMMENDATIONS:');
    result.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }

  if (failCount === 0 && warnCount === 0) {
    console.log('\n🎉 All checks passed! User data looks good.');
    console.log('   If Ferni still doesn\'t remember, check:');
    console.log('   1. DEBUG_INJECTIONS=true to see what\'s being injected');
    console.log('   2. Is the same userId being sent each session?');
    console.log('   3. Are context builders actually running? (check logs)');
  }

  console.log('\n');
  return result;
}

// ============================================================================
// MAIN
// ============================================================================

const userId = process.argv[2];

if (!userId) {
  console.log('\n❌ Usage: npx tsx scripts/diagnose-awareness.ts <userId>');
  console.log('   Example: npx tsx scripts/diagnose-awareness.ts seth-123');
  console.log('\n   This script checks why Ferni might not remember a specific user.\n');
  process.exit(1);
}

diagnoseAwareness(userId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  });
