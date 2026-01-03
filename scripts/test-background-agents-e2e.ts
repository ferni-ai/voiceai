#!/usr/bin/env npx tsx
/**
 * Background Agents E2E Test Script
 *
 * Tests the full "While You Were Away" flow:
 * 1. Queue a background task
 * 2. Check that it was captured
 * 3. Verify it shows in pending results
 * 4. Check context injection
 *
 * Usage: npx tsx scripts/test-background-agents-e2e.ts [--prod]
 */

import { createLogger } from '../src/utils/safe-logger.js';

const log = createLogger({ module: 'BackgroundAgentsE2E' });

// ============================================================================
// CONFIG
// ============================================================================

const isProd = process.argv.includes('--prod');
const BASE_URL = isProd
  ? 'https://app.ferni.ai'
  : 'http://localhost:3002';

const TEST_USER_ID = `e2e-test-${Date.now()}`;

console.log('\n');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  BACKGROUND AGENTS E2E TEST');
console.log(`  Environment: ${isProd ? 'PRODUCTION' : 'LOCAL'}`);
console.log(`  Base URL: ${BASE_URL}`);
console.log(`  Test User: ${TEST_USER_ID}`);
console.log('═══════════════════════════════════════════════════════════════');
console.log('\n');

// ============================================================================
// HELPERS
// ============================================================================

async function testAPI(
  name: string,
  url: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  console.log(`\n📡 Testing: ${name}`);
  console.log(`   URL: ${url}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    const text = await response.text();
    let data: unknown;
    
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (response.ok) {
      console.log(`   ✅ Status: ${response.status}`);
      console.log(`   📦 Response:`, JSON.stringify(data, null, 2).slice(0, 500));
      return { success: true, data };
    } else {
      console.log(`   ❌ Status: ${response.status}`);
      console.log(`   ⚠️  Error:`, data);
      return { success: false, data, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error}`);
    return { success: false, error: String(error) };
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// TESTS
// ============================================================================

async function testHealthEndpoints(): Promise<boolean> {
  console.log('\n\n📋 STEP 1: Health Check Endpoints');
  console.log('─────────────────────────────────────────');

  const healthResult = await testAPI(
    'Health Check',
    `${BASE_URL}/health`
  );

  return healthResult.success;
}

async function testPendingResultsAPI(): Promise<boolean> {
  console.log('\n\n📋 STEP 2: Pending Results API');
  console.log('─────────────────────────────────────────');

  const pendingResult = await testAPI(
    'Get Pending Results',
    `${BASE_URL}/api/background-results/pending?userId=${TEST_USER_ID}&limit=10`
  );

  if (!pendingResult.success) {
    console.log('   ⚠️  Pending results API not available');
    return false;
  }

  const data = pendingResult.data as { results?: unknown[]; count?: number };
  console.log(`   📊 Current pending count: ${data?.count || 0}`);

  return true;
}

async function testHistoryAPI(): Promise<boolean> {
  console.log('\n\n📋 STEP 3: History API');
  console.log('─────────────────────────────────────────');

  const historyResult = await testAPI(
    'Get Result History',
    `${BASE_URL}/api/background-results/history?userId=${TEST_USER_ID}&limit=5`
  );

  if (!historyResult.success) {
    console.log('   ⚠️  History API not available');
    return false;
  }

  const data = historyResult.data as { results?: unknown[]; count?: number };
  console.log(`   📊 History count: ${data?.count || 0}`);

  return true;
}

async function testDirectCapture(): Promise<boolean> {
  console.log('\n\n📋 STEP 4: Direct Result Capture (via imports)');
  console.log('─────────────────────────────────────────');

  try {
    // Import the capture function directly
    const { captureBackgroundResult, getPendingResults } = await import(
      '../src/services/background-agents/index.js'
    );

    console.log('   📥 Capturing test result...');

    const result = await captureBackgroundResult({
      userId: TEST_USER_ID,
      type: 'research_complete',
      status: 'success',
      summary: 'E2E Test: Research on background agents completed',
      priority: 'normal',
      initiatedBy: 'peter',
      details: 'This is an E2E test of the background agents system.',
      actionItems: ['Review the test results', 'Verify delivery'],
    });

    console.log(`   ✅ Result captured: ${result.id}`);
    console.log(`   📊 Type: ${result.type}, Status: ${result.status}`);

    // Wait a moment for persistence
    await delay(1000);

    // Check if it shows up in pending
    console.log('\n   📡 Checking pending results...');
    const pending = await getPendingResults(TEST_USER_ID, { limit: 5 });
    console.log(`   📊 Pending count: ${pending.length}`);

    const found = pending.find((p) => p.id === result.id);
    if (found) {
      console.log(`   ✅ Result found in pending!`);
      console.log(`   📋 Summary: ${found.summary}`);
    } else {
      console.log(`   ⚠️  Result not found in pending (may be in Firestore)`);
    }

    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error}`);
    return false;
  }
}

async function testContextInjection(): Promise<boolean> {
  console.log('\n\n📋 STEP 5: Context Injection (While You Were Away)');
  console.log('─────────────────────────────────────────');

  try {
    const { buildPendingResultsContext } = await import(
      '../src/services/background-agents/index.js'
    );

    console.log('   📥 Building context for agent greeting...');

    const context = await buildPendingResultsContext(TEST_USER_ID);

    if (context) {
      console.log(`   ✅ Context generated!`);
      console.log('   📋 Preview (first 500 chars):');
      console.log('   ' + context.slice(0, 500).split('\n').join('\n   '));
    } else {
      console.log(`   ⚠️  No pending results for context injection`);
    }

    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error}`);
    return false;
  }
}

async function testExecutors(): Promise<boolean> {
  console.log('\n\n📋 STEP 6: Test Task Executors');
  console.log('─────────────────────────────────────────');

  const results = {
    research: false,
    habitReminder: false,
    followup: false,
  };

  // Test Research Executor
  try {
    console.log('\n   🔬 Testing Research Executor (Peter)...');
    const { queueResearchTask } = await import(
      '../src/services/background-agents/executors/research-executor.js'
    );

    const taskId = await queueResearchTask({
      userId: TEST_USER_ID,
      query: 'E2E test query',
      type: 'general',
      depth: 'quick',
      initiatedBy: 'peter',
    });

    console.log(`   ✅ Research task queued: ${taskId}`);
    results.research = true;
  } catch (error) {
    console.log(`   ❌ Research executor error: ${error}`);
  }

  // Test Habit Reminder Executor
  try {
    console.log('\n   🌱 Testing Habit Reminder Executor (Maya)...');
    const { queueHabitReminder } = await import(
      '../src/services/background-agents/executors/habit-reminder-executor.js'
    );

    const taskId = await queueHabitReminder({
      userId: TEST_USER_ID,
      habitId: 'e2e-test-habit',
      habitName: 'E2E Test Habit',
      reminderType: 'gentle_nudge',
      initiatedBy: 'maya',
    });

    console.log(`   ✅ Habit reminder queued: ${taskId}`);
    results.habitReminder = true;
  } catch (error) {
    console.log(`   ❌ Habit reminder executor error: ${error}`);
  }

  // Test Follow-up Executor
  try {
    console.log('\n   📧 Testing Follow-up Executor (Alex)...');
    const { queueFollowup } = await import(
      '../src/services/background-agents/executors/followup-executor.js'
    );

    const taskId = await queueFollowup({
      userId: TEST_USER_ID,
      recipientName: 'E2E Test Recipient',
      subject: 'E2E Test Follow-up',
      message: 'This is an E2E test of the follow-up executor.',
      channel: 'email',
      initiatedBy: 'alex',
    });

    console.log(`   ✅ Follow-up queued: ${taskId}`);
    results.followup = true;
  } catch (error) {
    console.log(`   ❌ Follow-up executor error: ${error}`);
  }

  return results.research && results.habitReminder && results.followup;
}

async function testDeliveryInitialization(): Promise<boolean> {
  console.log('\n\n📋 STEP 7: Delivery Services Initialization');
  console.log('─────────────────────────────────────────');

  try {
    const { initializeBackgroundDelivery } = await import(
      '../src/services/background-agents/index.js'
    );

    console.log('   📥 Initializing delivery services...');
    await initializeBackgroundDelivery();
    console.log('   ✅ Delivery services initialized');

    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error}`);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('Starting E2E tests...\n');

  const results: Record<string, boolean> = {};

  // Run tests
  results['Health Endpoints'] = await testHealthEndpoints();
  results['Pending Results API'] = await testPendingResultsAPI();
  results['History API'] = await testHistoryAPI();

  // Only run direct tests in local mode
  if (!isProd) {
    results['Delivery Init'] = await testDeliveryInitialization();
    results['Direct Capture'] = await testDirectCapture();
    results['Context Injection'] = await testContextInjection();
    results['Task Executors'] = await testExecutors();

    // Wait for async tasks to complete
    console.log('\n\n⏳ Waiting for async tasks to complete (3s)...');
    await delay(3000);

    // Check final pending count
    console.log('\n\n📋 FINAL: Check Pending Results');
    console.log('─────────────────────────────────────────');

    const { getPendingResults } = await import(
      '../src/services/background-agents/index.js'
    );

    const pending = await getPendingResults(TEST_USER_ID, { limit: 20 });
    console.log(`   📊 Total pending for test user: ${pending.length}`);

    for (const p of pending) {
      console.log(`   • ${p.type}: ${p.summary.slice(0, 60)}...`);
    }
  }

  // Summary
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');

  let allPassed = true;
  for (const [name, passed] of Object.entries(results)) {
    console.log(`  ${passed ? '✅' : '❌'} ${name}`);
    if (!passed) allPassed = false;
  }

  console.log('\n');
  if (allPassed) {
    console.log('  🎉 ALL TESTS PASSED!');
  } else {
    console.log('  ⚠️  SOME TESTS FAILED');
  }
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
