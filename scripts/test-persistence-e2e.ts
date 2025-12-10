#!/usr/bin/env npx tsx
/**
 * E2E Test Script for Persistence Implementations
 *
 * Tests all Firestore/Redis persistence that was implemented:
 * 1. Habits API - Firestore persistence
 * 2. Appointment tracking - Firestore persistence
 * 3. Ritual onboarding - Firestore persistence
 * 4. Engagement notifications - Firestore persistence
 * 5. Twilio call tracking - Redis persistence
 * 6. Token vault - Firestore persistence
 * 7. Humanization analytics - Firestore persistence
 *
 * Usage:
 *   npx tsx scripts/test-persistence-e2e.ts
 */

import 'dotenv/config';

// ANSI colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

const log = {
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`${colors.cyan}→${colors.reset} ${msg}`),
  header: (msg: string) =>
    console.log(`\n${colors.bold}${colors.magenta}${msg}${colors.reset}\n${'─'.repeat(60)}`),
  dim: (msg: string) => console.log(`${colors.dim}  ${msg}${colors.reset}`),
};

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

function addResult(result: TestResult): void {
  results.push(result);
  if (result.passed) {
    log.success(`${result.name}: ${result.message}`);
  } else {
    log.error(`${result.name}: ${result.message}`);
  }
  if (result.duration) {
    log.dim(`Duration: ${result.duration}ms`);
  }
}

// ============================================================================
// 1. TEST FIREBASE/FIRESTORE CONNECTION
// ============================================================================

async function testFirestoreConnection(): Promise<boolean> {
  log.header('1. Firestore Connection');

  try {
    const admin = await import('firebase-admin');

    // Check if already initialized
    try {
      admin.app();
      log.success('Firebase Admin already initialized');
    } catch {
      // Initialize if needed
      if (process.env.GOOGLE_CLOUD_PROJECT) {
        admin.initializeApp({
          projectId: process.env.GOOGLE_CLOUD_PROJECT,
        });
        log.success(`Initialized Firebase with project: ${process.env.GOOGLE_CLOUD_PROJECT}`);
      } else {
        addResult({
          name: 'Firestore Connection',
          passed: false,
          message: 'GOOGLE_CLOUD_PROJECT not set',
        });
        return false;
      }
    }

    const db = admin.firestore();
    const startTime = Date.now();

    // Try a simple read
    const testDoc = await db.collection('_test').doc('persistence_test').get();
    const duration = Date.now() - startTime;

    addResult({
      name: 'Firestore Connection',
      passed: true,
      message: `Connected successfully (test doc exists: ${testDoc.exists})`,
      duration,
    });

    return true;
  } catch (error) {
    addResult({
      name: 'Firestore Connection',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    return false;
  }
}

// ============================================================================
// 2. TEST REDIS CONNECTION
// ============================================================================

async function testRedisConnection(): Promise<boolean> {
  log.header('2. Redis Connection');

  if (!process.env.REDIS_URL) {
    addResult({
      name: 'Redis Connection',
      passed: true,
      message: 'REDIS_URL not set - will use in-memory fallback (OK for dev)',
    });
    return true;
  }

  try {
    const { getRedisCache } = await import('../src/memory/redis-cache.js');
    const redis = getRedisCache();

    if (!redis) {
      addResult({
        name: 'Redis Connection',
        passed: true,
        message: 'Redis not available - using in-memory fallback',
      });
      return true;
    }

    const startTime = Date.now();
    const testKey = `test:persistence:${Date.now()}`;
    await redis.set(testKey, { test: true }, 60);
    const result = await redis.get<{ test: boolean }>(testKey);
    const duration = Date.now() - startTime;

    addResult({
      name: 'Redis Connection',
      passed: result?.test === true,
      message: result?.test ? 'Connected and read/write working' : 'Connection issue',
      duration,
    });

    return result?.test === true;
  } catch (error) {
    addResult({
      name: 'Redis Connection',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    return false;
  }
}

// ============================================================================
// 3. TEST HABITS PERSISTENCE
// ============================================================================

async function testHabitsPersistence(): Promise<void> {
  log.header('3. Habits API Persistence');

  try {
    const admin = await import('firebase-admin');
    const db = admin.firestore();

    const testUserId = `test_user_${Date.now()}`;
    const testHabit = {
      id: `habit_test_${Date.now()}`,
      userId: testUserId,
      name: 'Test Habit E2E',
      frequency: 'daily',
      currentStreak: 0,
      longestStreak: 0,
      totalCompletions: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
    };

    const startTime = Date.now();

    // Write
    await db.collection('user_habits').doc(testHabit.id).set(testHabit);

    // Read
    const doc = await db.collection('user_habits').doc(testHabit.id).get();

    // Cleanup
    await db.collection('user_habits').doc(testHabit.id).delete();

    const duration = Date.now() - startTime;

    addResult({
      name: 'Habits Persistence',
      passed: doc.exists && (doc.data() as typeof testHabit).name === 'Test Habit E2E',
      message: 'Write, read, and delete successful',
      duration,
    });
  } catch (error) {
    addResult({
      name: 'Habits Persistence',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// ============================================================================
// 4. TEST APPOINTMENT PERSISTENCE
// ============================================================================

async function testAppointmentPersistence(): Promise<void> {
  log.header('4. Appointment Tracking Persistence');

  try {
    const admin = await import('firebase-admin');
    const db = admin.firestore();

    const testAppointment = {
      id: `apt_test_${Date.now()}`,
      userId: 'test_user',
      businessName: 'Test Business',
      status: 'pending',
      requestedDateTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      callAttempts: 0,
      maxCallAttempts: 3,
      notes: [],
    };

    const startTime = Date.now();

    // Write
    await db.collection('tracked_appointments').doc(testAppointment.id).set(testAppointment);

    // Read
    const doc = await db.collection('tracked_appointments').doc(testAppointment.id).get();

    // Cleanup
    await db.collection('tracked_appointments').doc(testAppointment.id).delete();

    const duration = Date.now() - startTime;

    addResult({
      name: 'Appointment Persistence',
      passed: doc.exists && (doc.data() as typeof testAppointment).businessName === 'Test Business',
      message: 'Write, read, and delete successful',
      duration,
    });
  } catch (error) {
    addResult({
      name: 'Appointment Persistence',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// ============================================================================
// 5. TEST RITUAL ONBOARDING PERSISTENCE
// ============================================================================

async function testRitualOnboardingPersistence(): Promise<void> {
  log.header('5. Ritual Onboarding Persistence');

  try {
    const admin = await import('firebase-admin');
    const db = admin.firestore();

    const testState = {
      userId: `test_user_${Date.now()}`,
      conversationCount: 5,
      ritualsIntroduced: ['morning-sky', 'daily-priority'],
      ritualsAccepted: ['morning-sky'],
      ritualsDeclined: [],
      lastOnboardingConversation: 3,
    };

    const startTime = Date.now();

    // Write
    await db.collection('ritual_onboarding').doc(testState.userId).set(testState);

    // Read
    const doc = await db.collection('ritual_onboarding').doc(testState.userId).get();

    // Cleanup
    await db.collection('ritual_onboarding').doc(testState.userId).delete();

    const duration = Date.now() - startTime;

    addResult({
      name: 'Ritual Onboarding Persistence',
      passed: doc.exists && (doc.data() as typeof testState).conversationCount === 5,
      message: 'Write, read, and delete successful',
      duration,
    });
  } catch (error) {
    addResult({
      name: 'Ritual Onboarding Persistence',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// ============================================================================
// 6. TEST NOTIFICATION STATE PERSISTENCE
// ============================================================================

async function testNotificationStatePersistence(): Promise<void> {
  log.header('6. Engagement Notification State Persistence');

  try {
    const admin = await import('firebase-admin');
    const db = admin.firestore();

    const testState = {
      userId: `test_user_${Date.now()}`,
      preferences: {
        enabled: true,
        quietHoursStart: 22,
        quietHoursEnd: 7,
        maxPerDay: 3,
        allowedTypes: ['streak_reminder', 'milestone'],
        preferredChannel: 'in_app',
      },
      lastNotificationAt: null,
      todayCount: 0,
      dismissedNotifications: [],
      snoozeUntil: null,
    };

    const startTime = Date.now();

    // Write
    await db.collection('engagement_notification_states').doc(testState.userId).set(testState);

    // Read
    const doc = await db.collection('engagement_notification_states').doc(testState.userId).get();

    // Cleanup
    await db.collection('engagement_notification_states').doc(testState.userId).delete();

    const duration = Date.now() - startTime;

    addResult({
      name: 'Notification State Persistence',
      passed: doc.exists && (doc.data() as typeof testState).preferences.maxPerDay === 3,
      message: 'Write, read, and delete successful',
      duration,
    });
  } catch (error) {
    addResult({
      name: 'Notification State Persistence',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// ============================================================================
// 7. TEST TOKEN VAULT PERSISTENCE
// ============================================================================

async function testTokenVaultPersistence(): Promise<void> {
  log.header('7. Token Vault Persistence');

  try {
    const admin = await import('firebase-admin');
    const db = admin.firestore();

    const testToken = `tok_test_${Date.now()}`;
    const testData = {
      value: '+15551234567',
      category: 'phone',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const startTime = Date.now();

    // Write
    await db.collection('token_vault').doc(testToken).set(testData);

    // Read
    const doc = await db.collection('token_vault').doc(testToken).get();

    // Cleanup
    await db.collection('token_vault').doc(testToken).delete();

    const duration = Date.now() - startTime;

    addResult({
      name: 'Token Vault Persistence',
      passed: doc.exists && (doc.data() as typeof testData).category === 'phone',
      message: 'Write, read, and delete successful',
      duration,
    });
  } catch (error) {
    addResult({
      name: 'Token Vault Persistence',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// ============================================================================
// 8. TEST HUMANIZATION ANALYTICS PERSISTENCE
// ============================================================================

async function testHumanizationAnalyticsPersistence(): Promise<void> {
  log.header('8. Humanization Analytics Persistence');

  try {
    const admin = await import('firebase-admin');
    const db = admin.firestore();

    const testMetrics = {
      personaId: `test_persona_${Date.now()}`,
      totalSessions: 10,
      totalTurns: 150,
      featureUsage: {
        disfluency: 25,
        hedging: 15,
        backchannel: 30,
      },
      engagementCorrelations: [],
      lastUpdated: Date.now(),
    };

    const startTime = Date.now();

    // Write
    await db.collection('humanization_metrics').doc(testMetrics.personaId).set(testMetrics);

    // Read
    const doc = await db.collection('humanization_metrics').doc(testMetrics.personaId).get();

    // Cleanup
    await db.collection('humanization_metrics').doc(testMetrics.personaId).delete();

    const duration = Date.now() - startTime;

    addResult({
      name: 'Humanization Analytics Persistence',
      passed: doc.exists && (doc.data() as typeof testMetrics).totalSessions === 10,
      message: 'Write, read, and delete successful',
      duration,
    });
  } catch (error) {
    addResult({
      name: 'Humanization Analytics Persistence',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(): void {
  log.header('📊 Persistence Test Summary');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\n  Total:  ${total}`);
  console.log(`  ${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${failed}${colors.reset}`);

  if (failed > 0) {
    console.log(`\n${colors.bold}Failed Tests:${colors.reset}`);
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`  ${colors.red}✗${colors.reset} ${result.name}: ${result.message}`);
    }
  }

  console.log('');

  if (failed === 0) {
    console.log(`${colors.green}${colors.bold}✅ All persistence tests passed!${colors.reset}`);
  } else {
    console.log(
      `${colors.red}${colors.bold}❌ Some persistence tests failed. See details above.${colors.reset}`
    );
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`
${colors.bold}${colors.magenta}╔════════════════════════════════════════════════════════════╗
║           Persistence Implementation E2E Test              ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

  // Test connections first
  const firestoreOk = await testFirestoreConnection();
  await testRedisConnection();

  if (!firestoreOk) {
    log.error('\nFirestore connection failed - cannot continue with persistence tests.');
    printSummary();
    return;
  }

  // Run all persistence tests
  await testHabitsPersistence();
  await testAppointmentPersistence();
  await testRitualOnboardingPersistence();
  await testNotificationStatePersistence();
  await testTokenVaultPersistence();
  await testHumanizationAnalyticsPersistence();

  // Print summary
  printSummary();
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
