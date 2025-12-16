#!/usr/bin/env npx ts-node

/**
 * Persistence Verification Script
 * 
 * Tests that Firestore persistence is properly configured and working.
 * 
 * Usage:
 *   npx ts-node scripts/verify-persistence.ts
 * 
 * Required environment variables:
 *   - GOOGLE_CLOUD_PROJECT
 *   - GOOGLE_APPLICATION_CREDENTIALS (optional if using default credentials)
 */

import { Firestore } from '@google-cloud/firestore';

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

interface VerificationResult {
  test: string;
  passed: boolean;
  message: string;
  duration?: number;
}

async function main() {
  console.log(`${BLUE}╔════════════════════════════════════════════════════════════╗${NC}`);
  console.log(`${BLUE}║     Ferni AI - Persistence Verification                    ║${NC}`);
  console.log(`${BLUE}╚════════════════════════════════════════════════════════════╝${NC}`);
  console.log('');

  const results: VerificationResult[] = [];

  // ==========================================================================
  // Test 1: Environment Variables
  // ==========================================================================
  console.log(`${YELLOW}Test 1: Environment Variables${NC}`);
  
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (projectId) {
    results.push({
      test: 'GOOGLE_CLOUD_PROJECT',
      passed: true,
      message: `Set to: ${projectId}`,
    });
    console.log(`   ${GREEN}✓${NC} GOOGLE_CLOUD_PROJECT: ${projectId}`);
  } else {
    results.push({
      test: 'GOOGLE_CLOUD_PROJECT',
      passed: false,
      message: 'Not set',
    });
    console.log(`   ${RED}✗${NC} GOOGLE_CLOUD_PROJECT not set`);
    console.log(`     Set it with: export GOOGLE_CLOUD_PROJECT=your-project-id`);
    process.exit(1);
  }

  if (credentials) {
    results.push({
      test: 'GOOGLE_APPLICATION_CREDENTIALS',
      passed: true,
      message: `Set to: ${credentials}`,
    });
    console.log(`   ${GREEN}✓${NC} GOOGLE_APPLICATION_CREDENTIALS: ${credentials}`);
  } else {
    results.push({
      test: 'GOOGLE_APPLICATION_CREDENTIALS',
      passed: true,
      message: 'Not set (using default credentials)',
    });
    console.log(`   ${YELLOW}⚠${NC} GOOGLE_APPLICATION_CREDENTIALS not set (using default credentials)`);
  }

  // ==========================================================================
  // Test 2: Firestore Connection
  // ==========================================================================
  console.log('');
  console.log(`${YELLOW}Test 2: Firestore Connection${NC}`);

  let db: Firestore;
  try {
    const startConnect = Date.now();
    db = new Firestore({ projectId });
    
    // Test connection by listing collections
    await db.listCollections();
    const connectDuration = Date.now() - startConnect;
    
    results.push({
      test: 'Firestore Connection',
      passed: true,
      message: 'Connected successfully',
      duration: connectDuration,
    });
    console.log(`   ${GREEN}✓${NC} Connected to Firestore (${connectDuration}ms)`);
  } catch (error) {
    const err = error as Error;
    results.push({
      test: 'Firestore Connection',
      passed: false,
      message: err.message,
    });
    console.log(`   ${RED}✗${NC} Failed to connect: ${err.message}`);
    process.exit(1);
  }

  // ==========================================================================
  // Test 3: Write Operation
  // ==========================================================================
  console.log('');
  console.log(`${YELLOW}Test 3: Write Operation${NC}`);

  const testDocId = `_verification_test_${Date.now()}`;
  const testData = {
    testId: testDocId,
    timestamp: new Date().toISOString(),
    message: 'Ferni AI persistence verification',
  };

  try {
    const startWrite = Date.now();
    await db.collection('_verification').doc(testDocId).set(testData);
    const writeDuration = Date.now() - startWrite;

    results.push({
      test: 'Write Operation',
      passed: true,
      message: 'Document written successfully',
      duration: writeDuration,
    });
    console.log(`   ${GREEN}✓${NC} Write successful (${writeDuration}ms)`);
  } catch (error) {
    const err = error as Error;
    results.push({
      test: 'Write Operation',
      passed: false,
      message: err.message,
    });
    console.log(`   ${RED}✗${NC} Write failed: ${err.message}`);
  }

  // ==========================================================================
  // Test 4: Read Operation
  // ==========================================================================
  console.log('');
  console.log(`${YELLOW}Test 4: Read Operation${NC}`);

  try {
    const startRead = Date.now();
    const doc = await db.collection('_verification').doc(testDocId).get();
    const readDuration = Date.now() - startRead;

    if (doc.exists && doc.data()?.testId === testDocId) {
      results.push({
        test: 'Read Operation',
        passed: true,
        message: 'Document read successfully',
        duration: readDuration,
      });
      console.log(`   ${GREEN}✓${NC} Read successful (${readDuration}ms)`);
    } else {
      results.push({
        test: 'Read Operation',
        passed: false,
        message: 'Document not found or data mismatch',
      });
      console.log(`   ${RED}✗${NC} Read failed: Document not found or data mismatch`);
    }
  } catch (error) {
    const err = error as Error;
    results.push({
      test: 'Read Operation',
      passed: false,
      message: err.message,
    });
    console.log(`   ${RED}✗${NC} Read failed: ${err.message}`);
  }

  // ==========================================================================
  // Test 5: Delete Operation (Cleanup)
  // ==========================================================================
  console.log('');
  console.log(`${YELLOW}Test 5: Delete Operation${NC}`);

  try {
    const startDelete = Date.now();
    await db.collection('_verification').doc(testDocId).delete();
    const deleteDuration = Date.now() - startDelete;

    results.push({
      test: 'Delete Operation',
      passed: true,
      message: 'Test document cleaned up',
      duration: deleteDuration,
    });
    console.log(`   ${GREEN}✓${NC} Delete successful (${deleteDuration}ms)`);
  } catch (error) {
    const err = error as Error;
    results.push({
      test: 'Delete Operation',
      passed: false,
      message: err.message,
    });
    console.log(`   ${YELLOW}⚠${NC} Delete failed (non-critical): ${err.message}`);
  }

  // ==========================================================================
  // Test 6: User Collection Access
  // ==========================================================================
  console.log('');
  console.log(`${YELLOW}Test 6: User Collection Access${NC}`);

  try {
    const startList = Date.now();
    const users = await db.collection('bogle_users').limit(1).get();
    const listDuration = Date.now() - startList;

    results.push({
      test: 'User Collection Access',
      passed: true,
      message: `Collection accessible (${users.size} docs checked)`,
      duration: listDuration,
    });
    console.log(`   ${GREEN}✓${NC} User collection accessible (${listDuration}ms)`);
    
    if (users.size > 0) {
      console.log(`   ${BLUE}ℹ${NC} Found existing user data`);
    } else {
      console.log(`   ${BLUE}ℹ${NC} No existing users (expected for fresh setup)`);
    }
  } catch (error) {
    const err = error as Error;
    results.push({
      test: 'User Collection Access',
      passed: false,
      message: err.message,
    });
    console.log(`   ${RED}✗${NC} Collection access failed: ${err.message}`);
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('');
  console.log(`${BLUE}════════════════════════════════════════════════════════════${NC}`);
  console.log(`${BLUE}Summary${NC}`);
  console.log(`${BLUE}════════════════════════════════════════════════════════════${NC}`);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('');
  for (const result of results) {
    const icon = result.passed ? `${GREEN}✓${NC}` : `${RED}✗${NC}`;
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`   ${icon} ${result.test}: ${result.message}${duration}`);
  }

  console.log('');
  if (failed === 0) {
    console.log(`${GREEN}╔════════════════════════════════════════════════════════════╗${NC}`);
    console.log(`${GREEN}║     ✓ All ${passed} tests passed! Persistence is working.       ║${NC}`);
    console.log(`${GREEN}╚════════════════════════════════════════════════════════════╝${NC}`);
  } else {
    console.log(`${RED}╔════════════════════════════════════════════════════════════╗${NC}`);
    console.log(`${RED}║     ✗ ${failed} of ${passed + failed} tests failed                              ║${NC}`);
    console.log(`${RED}╚════════════════════════════════════════════════════════════╝${NC}`);
    process.exit(1);
  }

  // Close connection
  await db.terminate();
}

main().catch((error) => {
  console.error(`${RED}Unexpected error:${NC}`, error);
  process.exit(1);
});

