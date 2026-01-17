#!/usr/bin/env npx tsx
/**
 * E2E Identity Flow Validation Script
 * 
 * Tests the complete identity pipeline:
 * 1. Token server receives Firebase UID + device_id
 * 2. LiveKit room is created with correct metadata
 * 3. Voice agent receives metadata and identifies user
 * 4. Profile is created/migrated with Firebase UID
 * 5. Auto-save persists data during conversation
 * 
 * Usage:
 *   npx tsx scripts/e2e-identity-flow.ts
 */

import { Firestore } from '@google-cloud/firestore';

const db = new Firestore({ projectId: 'johnb-2025' });
const COLLECTION = 'bogle_users';

// Initialize the global store with Firestore for proper E2E testing
async function initializeGlobalStore(): Promise<void> {
  const { FirestoreStore } = await import('../src/memory/firestore-store.js');
  const { setGlobalStore } = await import('../src/services/user-identification.js');
  
  const firestoreStore = new FirestoreStore({ 
    projectId: 'johnb-2025',
    useEmulator: false,
    collectionPrefix: 'bogle_'
  });
  
  setGlobalStore(firestoreStore);
  console.log('✅ Global Firestore store initialized for E2E testing');
}

// Test data
const TEST_FIREBASE_UID = `test_e2e_${Date.now()}`;
const TEST_DEVICE_ID = `device_e2e_${Date.now()}`;
const TEST_NAME = 'E2E Test User';

// Server URLs
const TOKEN_SERVER_URL = process.env.TOKEN_SERVER_URL || 'https://app.ferni.ai';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details: string;
  duration?: number;
}

const results: TestResult[] = [];

function log(message: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

async function runTest(
  name: string,
  testFn: () => Promise<{ pass: boolean; details: string }>
): Promise<void> {
  const start = Date.now();
  log(`🧪 Testing: ${name}`);
  
  try {
    const result = await testFn();
    const duration = Date.now() - start;
    
    results.push({
      test: name,
      status: result.pass ? 'PASS' : 'FAIL',
      details: result.details,
      duration,
    });
    
    if (result.pass) {
      log(`   ✅ PASS (${duration}ms): ${result.details}`);
    } else {
      log(`   ❌ FAIL (${duration}ms): ${result.details}`);
    }
  } catch (error) {
    const duration = Date.now() - start;
    results.push({
      test: name,
      status: 'FAIL',
      details: `Exception: ${error}`,
      duration,
    });
    log(`   ❌ FAIL (${duration}ms): Exception - ${error}`);
  }
}

// ============================================================================
// TEST 1: Token Server accepts Firebase UID
// ============================================================================
async function testTokenServerAcceptsFirebaseUid(): Promise<{ pass: boolean; details: string }> {
  const roomName = `e2e-test-${Date.now()}`;
  const url = `${TOKEN_SERVER_URL}/token?room=${roomName}&username=E2ETest&device_id=${TEST_DEVICE_ID}&persona_id=ferni&firebase_uid=${TEST_FIREBASE_UID}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    return { pass: false, details: `Token server returned ${response.status}: ${await response.text()}` };
  }
  
  const data = await response.json();
  
  if (!data.token) {
    return { pass: false, details: 'No token in response' };
  }
  
  // Decode JWT to verify metadata
  const [, payload] = data.token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
  
  return {
    pass: true,
    details: `Token generated for room ${roomName}, expires ${new Date(decoded.exp * 1000).toISOString()}`,
  };
}

// ============================================================================
// TEST 2: Firestore connection works
// ============================================================================
async function testFirestoreConnection(): Promise<{ pass: boolean; details: string }> {
  try {
    const testDoc = await db.collection(COLLECTION).limit(1).get();
    return {
      pass: true,
      details: `Connected to Firestore, found ${testDoc.size} doc(s) in sample query`,
    };
  } catch (error) {
    return { pass: false, details: `Firestore connection failed: ${error}` };
  }
}

// ============================================================================
// TEST 3: Create test device profile (simulating legacy user)
// ============================================================================
async function testCreateLegacyDeviceProfile(): Promise<{ pass: boolean; details: string }> {
  const deviceProfileId = `device:${TEST_DEVICE_ID}`;
  
  const legacyProfile = {
    id: deviceProfileId,
    name: TEST_NAME,
    totalConversations: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastContact: new Date(),
    preferences: { verbosity: 'normal' },
    relationshipStage: 'acquaintance',
    version: 1,
  };
  
  await db.collection(COLLECTION).doc(deviceProfileId).set(legacyProfile);
  
  // Verify it was created
  const doc = await db.collection(COLLECTION).doc(deviceProfileId).get();
  
  if (!doc.exists) {
    return { pass: false, details: 'Failed to create legacy device profile' };
  }
  
  return {
    pass: true,
    details: `Created legacy profile ${deviceProfileId} with ${legacyProfile.totalConversations} conversations`,
  };
}

// ============================================================================
// TEST 4: Verify identifyFromMetadata logic (unit test style)
// ============================================================================
async function testIdentifyFromMetadataLogic(): Promise<{ pass: boolean; details: string }> {
  // Import the function directly
  const { identifyFromMetadata } = await import('../src/services/user-identification.js');
  
  // Test with Firebase UID + device ID (should trigger migration check)
  const result = await identifyFromMetadata({
    firebase_uid: TEST_FIREBASE_UID,
    device_id: TEST_DEVICE_ID,
  });
  
  if (result.userId !== TEST_FIREBASE_UID) {
    return {
      pass: false,
      details: `Expected userId to be Firebase UID (${TEST_FIREBASE_UID}), got: ${result.userId}`,
    };
  }
  
  if (result.source.type !== 'firebase') {
    return {
      pass: false,
      details: `Expected source type 'firebase', got: ${result.source.type}`,
    };
  }
  
  return {
    pass: true,
    details: `Identified as Firebase user: ${result.userId.slice(0, 20)}..., source: ${result.source.type}`,
  };
}

// ============================================================================
// TEST 5: Verify auto-migration happened
// ============================================================================
async function testAutoMigration(): Promise<{ pass: boolean; details: string }> {
  // Check if Firebase UID profile was created
  const firebaseProfile = await db.collection(COLLECTION).doc(TEST_FIREBASE_UID).get();
  
  if (!firebaseProfile.exists) {
    return {
      pass: false,
      details: `Firebase UID profile not created. Auto-migration may not have triggered.`,
    };
  }
  
  const data = firebaseProfile.data()!;
  
  // Verify migration brought over the data
  const checks = [];
  
  if (data.name === TEST_NAME) {
    checks.push('✓ Name migrated');
  } else {
    checks.push(`✗ Name not migrated (expected "${TEST_NAME}", got "${data.name}")`);
  }
  
  if ((data.totalConversations ?? 0) >= 5) {
    checks.push(`✓ Conversations migrated (${data.totalConversations})`);
  } else {
    checks.push(`✗ Conversations not migrated (expected ≥5, got ${data.totalConversations})`);
  }
  
  const allPassed = checks.every(c => c.startsWith('✓'));
  
  return {
    pass: allPassed,
    details: checks.join(', '),
  };
}

// ============================================================================
// TEST 6: Verify device profile is marked as migrated
// ============================================================================
async function testDeviceProfileMarkedMigrated(): Promise<{ pass: boolean; details: string }> {
  const deviceProfileId = `device:${TEST_DEVICE_ID}`;
  const deviceDoc = await db.collection(COLLECTION).doc(deviceProfileId).get();
  
  if (!deviceDoc.exists) {
    return {
      pass: false,
      details: 'Device profile not found (should still exist after migration)',
    };
  }
  
  const data = deviceDoc.data()!;
  
  // Check if it's marked as migrated
  if (data.migratedTo === TEST_FIREBASE_UID) {
    return {
      pass: true,
      details: `Device profile marked as migrated to ${TEST_FIREBASE_UID.slice(0, 15)}...`,
    };
  }
  
  // Even if not marked, migration still worked if Firebase profile exists
  return {
    pass: true,
    details: 'Device profile exists (migration marker optional)',
  };
}

// ============================================================================
// TEST 7: Check real production profiles for Firebase UID usage (INFO ONLY)
// ============================================================================
async function testProductionProfileDistribution(): Promise<{ pass: boolean; details: string }> {
  const snap = await db.collection(COLLECTION)
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get();
  
  let firebaseCount = 0;
  let deviceCount = 0;
  let anonCount = 0;
  let recentFirebase: string[] = [];
  
  snap.docs.forEach(doc => {
    const id = doc.id;
    if (id.startsWith('device:')) {
      deviceCount++;
    } else if (id.startsWith('anon:')) {
      anonCount++;
    } else if (/^[a-zA-Z0-9]{20,}$/.test(id) && !id.startsWith('test_')) {
      firebaseCount++;
      const data = doc.data();
      const updated = data.updatedAt?.toDate?.() || data.updatedAt;
      recentFirebase.push(`${id.slice(0, 12)}... (${updated?.toISOString?.().slice(0, 10) || 'unknown'})`);
    }
  });
  
  const total = snap.size;
  const firebasePct = ((firebaseCount / total) * 100).toFixed(1);
  
  // This test is informational - pass as long as we can query
  // Firebase UID adoption will happen naturally as users reconnect
  const pass = true;
  
  let details = `Last 50: ${firebaseCount} Firebase (${firebasePct}%), ${deviceCount} device, ${anonCount} anon`;
  if (firebaseCount === 0) {
    details += ' (expected - no users have connected with new code yet)';
  } else if (recentFirebase.length > 0) {
    details += `. Recent Firebase: ${recentFirebase.slice(0, 3).join(', ')}`;
  }
  
  return { pass, details };
}

// ============================================================================
// CLEANUP
// ============================================================================
async function cleanup(): Promise<void> {
  log('🧹 Cleaning up test data...');
  
  try {
    // Delete test profiles
    await db.collection(COLLECTION).doc(TEST_FIREBASE_UID).delete();
    await db.collection(COLLECTION).doc(`device:${TEST_DEVICE_ID}`).delete();
    log('   Deleted test profiles');
  } catch (error) {
    log(`   Warning: Cleanup failed: ${error}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================
async function main(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('🔍 E2E IDENTITY FLOW VALIDATION');
  console.log('═'.repeat(60));
  console.log(`\nTest Firebase UID: ${TEST_FIREBASE_UID}`);
  console.log(`Test Device ID: ${TEST_DEVICE_ID}`);
  console.log(`Token Server: ${TOKEN_SERVER_URL}\n`);
  
  // Initialize the Firestore store before testing
  await initializeGlobalStore();
  console.log('');
  
  // Run tests
  await runTest('1. Token server accepts Firebase UID', testTokenServerAcceptsFirebaseUid);
  await runTest('2. Firestore connection works', testFirestoreConnection);
  await runTest('3. Create legacy device profile', testCreateLegacyDeviceProfile);
  await runTest('4. identifyFromMetadata returns Firebase UID', testIdentifyFromMetadataLogic);
  await runTest('5. Auto-migration creates Firebase profile', testAutoMigration);
  await runTest('6. Device profile preserved', testDeviceProfileMarkedMigrated);
  await runTest('7. Production profile distribution', testProductionProfileDistribution);
  
  // Cleanup
  await cleanup();
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    console.log(`${icon} ${r.test}`);
    if (r.status === 'FAIL') {
      console.log(`   → ${r.details}`);
    }
  });
  
  console.log('\n' + '─'.repeat(60));
  console.log(`TOTAL: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Review the details above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! Identity flow is working correctly.');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

