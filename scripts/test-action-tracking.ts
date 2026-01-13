#!/usr/bin/env npx tsx
/**
 * Test Script: Action Tracking E2E
 *
 * This script simulates the full action tracking lifecycle:
 * 1. Creates an action (simulating user request)
 * 2. Starts execution (simulating tool start)
 * 3. Completes execution (simulating tool finish)
 *
 * Run with: npx tsx scripts/test-action-tracking.ts
 *
 * You can watch the Activity UI update in real-time via SSE.
 */

import { getActionTracker } from '../src/services/action-tracker/index.js';
import { createLogger } from '../src/utils/safe-logger.js';

const log = createLogger({ module: 'ActionTrackingTest' });

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testActionTracking(): Promise<void> {
  const tracker = getActionTracker();

  // Use a test user ID (in production, this would come from auth)
  const userId = process.env.TEST_USER_ID || 'test-user-e2e';

  console.log('\n🚀 Starting Action Tracking E2E Test\n');
  console.log(`   User ID: ${userId}`);
  console.log('   Open Activity UI (Cmd+Shift+A) to watch real-time updates\n');

  // ============================================================================
  // Test 1: Call action lifecycle
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📞 Test 1: Call Action');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const callAction = await tracker.createAction({
    userId,
    type: 'call',
    description: 'Call Mom about dinner plans',
    target: 'Mom',
    targetContact: '+1234567890',
    sessionId: `session-${Date.now()}`,
  });

  console.log(`   ✅ Created action: ${callAction.id}`);
  console.log(`   Status: ${callAction.status}\n`);

  await sleep(2000);

  // Start execution
  await tracker.startExecution(callAction.id, {
    toolId: 'callAndConverse',
    toolArgs: { phone: '+1234567890', name: 'Mom' },
  });

  console.log('   ⏳ Execution started...');
  console.log('   Status: in_progress\n');

  await sleep(3000);

  // Complete execution
  await tracker.completeExecution(callAction.id, {
    success: true,
    resultSummary: 'Left voicemail - Mom didn\'t answer after 4 rings',
    callDurationSeconds: 25,
  });

  console.log('   ✅ Execution completed');
  console.log('   Result: Left voicemail\n');

  // ============================================================================
  // Test 2: Text action lifecycle
  // ============================================================================
  await sleep(1000);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💬 Test 2: Text Action');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const textAction = await tracker.createAction({
    userId,
    type: 'text',
    description: 'Text John about meeting tomorrow',
    target: 'John',
    targetContact: '+0987654321',
    sessionId: `session-${Date.now()}`,
  });

  console.log(`   ✅ Created action: ${textAction.id}`);

  await sleep(1500);

  await tracker.startExecution(textAction.id, {
    toolId: 'sendText',
    toolArgs: { phone: '+0987654321', message: 'Hey John, still on for tomorrow?' },
  });

  console.log('   ⏳ Sending text...');

  await sleep(1000);

  await tracker.completeExecution(textAction.id, {
    success: true,
    resultSummary: 'Message delivered',
    deliveryStatus: 'delivered',
  });

  console.log('   ✅ Text sent and delivered\n');

  // ============================================================================
  // Test 3: Failed action
  // ============================================================================
  await sleep(1000);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('❌ Test 3: Failed Action');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const failedAction = await tracker.createAction({
    userId,
    type: 'email',
    description: 'Send project update to team',
    target: 'team@company.com',
    sessionId: `session-${Date.now()}`,
  });

  console.log(`   ✅ Created action: ${failedAction.id}`);

  await sleep(1500);

  await tracker.startExecution(failedAction.id, {
    toolId: 'sendEmail',
    toolArgs: { to: 'team@company.com', subject: 'Project Update' },
  });

  console.log('   ⏳ Sending email...');

  await sleep(2000);

  await tracker.completeExecution(failedAction.id, {
    success: false,
    resultSummary: 'Failed to send - SMTP connection timeout',
  });

  console.log('   ❌ Email failed: SMTP connection timeout\n');

  // ============================================================================
  // Summary
  // ============================================================================
  await sleep(1000);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Test Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const stats = await tracker.getStats(userId);

  console.log(`   Total actions: ${stats.total}`);
  console.log(`   Completed: ${stats.byStatus.completed}`);
  console.log(`   Failed: ${stats.byStatus.failed}`);
  console.log(`   By type:`);
  console.log(`     - Calls: ${stats.byType.call}`);
  console.log(`     - Texts: ${stats.byType.text}`);
  console.log(`     - Emails: ${stats.byType.email}`);
  console.log(`\n✅ E2E Test Complete!\n`);
  console.log('   Check the Activity UI to see all actions.\n');
}

// Run the test
testActionTracking().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
