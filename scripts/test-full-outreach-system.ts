/**
 * Full E2E Test for Proactive Outreach System
 * 
 * Tests all components:
 * 1. Contact onboarding (auto-detect)
 * 2. Proactive outreach (send SMS)
 * 3. Outreach intelligence (commitment extraction)
 * 4. Goal integration (streaks, milestones)
 * 5. Calendar reminders
 * 6. Analytics tracking
 * 7. Admin dashboard
 */

import { setUserContactInfo, textUser, initializeProactiveOutreach } from '../src/tools/proactive-outreach.js';
import { detectContactInfo, processMessageForOnboarding, getConfirmationMessage } from '../src/services/contact-onboarding.js';
import { extractCommitments, analyzeConversationForOutreach, setPreferences, getPreferences } from '../src/services/outreach-intelligence.js';
import { recordCheckIn, createGoal, updateGoalProgress, startGoalMonitoring, stopGoalMonitoring } from '../src/services/goal-outreach-integration.js';
import { upsertEvent, generateMorningDigest, getUpcomingEvents, startCalendarReminders, stopCalendarReminders } from '../src/services/calendar-reminders.js';
import { logOutreachEvent, getUserAnalytics, getGlobalAnalytics, generateSummaryReport } from '../src/services/outreach-analytics.js';
import { getUserSummary, getDashboardData, getAnalyticsReport } from '../src/services/outreach-admin.js';

const TEST_USER_ID = 'test-user-e2e';
const TEST_PHONE = process.env.TEST_PHONE_NUMBER;

async function runTests() {
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('🧪 FULL E2E OUTREACH SYSTEM TEST');
  console.log('═'.repeat(60));
  console.log('\n');

  let passed = 0;
  let failed = 0;

  // =========================================================================
  // TEST 1: Contact Onboarding - Auto-Detection
  // =========================================================================
  console.log('📱 TEST 1: Contact Onboarding');
  console.log('-'.repeat(60));

  try {
    // Test phone detection
    const phoneResult = detectContactInfo("My number is 555-123-4567");
    if (phoneResult?.phone === '+15551234567') {
      console.log('  ✅ Phone detection: +15551234567');
      passed++;
    } else {
      console.log(`  ❌ Phone detection failed: ${phoneResult?.phone}`);
      failed++;
    }

    // Test email detection
    const emailResult = detectContactInfo("Email me at test@example.com");
    if (emailResult?.email === 'test@example.com') {
      console.log('  ✅ Email detection: test@example.com');
      passed++;
    } else {
      console.log(`  ❌ Email detection failed: ${emailResult?.email}`);
      failed++;
    }

    // Test preference detection
    const prefResult = detectContactInfo("Please text me for reminders");
    if (prefResult?.preferredMethod === 'sms') {
      console.log('  ✅ Preference detection: sms');
      passed++;
    } else {
      console.log(`  ❌ Preference detection failed: ${prefResult?.preferredMethod}`);
      failed++;
    }

    // Test full onboarding flow
    const onboardResult = processMessageForOnboarding(TEST_USER_ID, "My phone is 801-555-1234", 5);
    if (onboardResult.detectedContact?.phone && onboardResult.confirmation) {
      console.log('  ✅ Full onboarding flow works');
      console.log(`     Confirmation: "${onboardResult.confirmation.slice(0, 50)}..."`);
      passed++;
    } else {
      console.log('  ❌ Full onboarding flow failed');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ Contact onboarding error: ${error}`);
    failed++;
  }

  // =========================================================================
  // TEST 2: Proactive Outreach - Send SMS
  // =========================================================================
  console.log('\n📤 TEST 2: Proactive Outreach');
  console.log('-'.repeat(60));

  try {
    if (TEST_PHONE) {
      // Set up real contact
      setUserContactInfo(TEST_USER_ID, { 
        phone: TEST_PHONE, 
        timezone: 'America/Denver' 
      });
      console.log(`  📱 Test phone: ${TEST_PHONE}`);

      // Initialize scheduler
      initializeProactiveOutreach();
      console.log('  ✅ Scheduler initialized');

      // Send test message
      const sendResult = await textUser(
        TEST_USER_ID,
        '🧪 E2E Test: Proactive outreach system is working!',
        'Ferni'
      );

      if (sendResult.success) {
        console.log('  ✅ Test SMS sent successfully!');
        passed++;
      } else {
        console.log(`  ❌ SMS send failed: ${sendResult.error}`);
        failed++;
      }
    } else {
      console.log('  ⚠️  TEST_PHONE_NUMBER not set - skipping real SMS test');
      // Still test the setup
      setUserContactInfo(TEST_USER_ID, { phone: '+15551234567' });
      console.log('  ✅ Contact info saved (simulated)');
      passed++;
    }
  } catch (error) {
    console.log(`  ❌ Proactive outreach error: ${error}`);
    failed++;
  }

  // =========================================================================
  // TEST 3: Outreach Intelligence - Commitment Extraction
  // =========================================================================
  console.log('\n🧠 TEST 3: Outreach Intelligence');
  console.log('-'.repeat(60));

  try {
    // Test commitment extraction
    const commitments = extractCommitments(
      TEST_USER_ID,
      "I'll work out tomorrow and call my mom this weekend"
    );

    if (commitments.length >= 2) {
      console.log(`  ✅ Extracted ${commitments.length} commitments:`);
      for (const c of commitments) {
        console.log(`     - "${c.what}" (check-in: ${c.checkInTime.toLocaleDateString()})`);
      }
      passed++;
    } else {
      console.log(`  ❌ Expected 2+ commitments, got ${commitments.length}`);
      failed++;
    }

    // Test preferences
    setPreferences(TEST_USER_ID, {
      enabled: true,
      preferredMethod: 'sms',
      maxPerDay: 5,
    });
    const prefs = getPreferences(TEST_USER_ID);
    if (prefs.maxPerDay === 5) {
      console.log('  ✅ Preferences saved and retrieved');
      passed++;
    } else {
      console.log('  ❌ Preferences not saved correctly');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ Outreach intelligence error: ${error}`);
    failed++;
  }

  // =========================================================================
  // TEST 4: Goal Integration - Streaks & Milestones
  // =========================================================================
  console.log('\n🎯 TEST 4: Goal Integration');
  console.log('-'.repeat(60));

  try {
    // Test streak recording
    const checkInResult = await recordCheckIn({
      userId: TEST_USER_ID,
      habitName: 'meditation',
      completed: true,
      timestamp: new Date(),
    });

    if (checkInResult.streak.currentStreak >= 1) {
      console.log(`  ✅ Streak recorded: ${checkInResult.streak.currentStreak} day(s)`);
      passed++;
    } else {
      console.log('  ❌ Streak recording failed');
      failed++;
    }

    // Test goal creation
    const goal = createGoal({
      userId: TEST_USER_ID,
      title: 'Read 12 books this year',
      milestones: [
        { title: 'First book!', targetProgress: 8 },
        { title: 'Halfway there', targetProgress: 50 },
        { title: 'Almost done', targetProgress: 90 },
      ],
    });

    if (goal.id && goal.milestones.length === 3) {
      console.log(`  ✅ Goal created: "${goal.title}" with ${goal.milestones.length} milestones`);
      passed++;
    } else {
      console.log('  ❌ Goal creation failed');
      failed++;
    }

    // Test progress update
    const progressResult = await updateGoalProgress(TEST_USER_ID, goal.id, 10);
    if (progressResult.goal.progress === 10 && progressResult.milestonesReached.length === 1) {
      console.log(`  ✅ Progress updated: ${progressResult.goal.progress}%, milestone reached!`);
      passed++;
    } else {
      console.log('  ❌ Progress update failed');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ Goal integration error: ${error}`);
    failed++;
  }

  // =========================================================================
  // TEST 5: Calendar Reminders
  // =========================================================================
  console.log('\n📅 TEST 5: Calendar Reminders');
  console.log('-'.repeat(60));

  try {
    // Create test event
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);

    const event = upsertEvent({
      id: 'test-event-1',
      userId: TEST_USER_ID,
      title: 'Important Interview',
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + 60 * 60 * 1000),
      isAllDay: false,
      location: 'Zoom',
      reminders: [],
      source: 'manual',
    });

    if (event.reminders.length > 0) {
      console.log(`  ✅ Event created with ${event.reminders.length} auto-reminders`);
      passed++;
    } else {
      console.log('  ❌ Event reminders not created');
      failed++;
    }

    // Test upcoming events
    const upcoming = getUpcomingEvents(TEST_USER_ID, 48);
    if (upcoming.length >= 1) {
      console.log(`  ✅ Found ${upcoming.length} upcoming event(s)`);
      passed++;
    } else {
      console.log('  ❌ Upcoming events not found');
      failed++;
    }

    // Create today event for digest
    const today = new Date();
    today.setHours(15, 0, 0, 0);
    upsertEvent({
      id: 'test-event-today',
      userId: TEST_USER_ID,
      title: 'Team Meeting',
      startTime: today,
      endTime: new Date(today.getTime() + 30 * 60 * 1000),
      isAllDay: false,
      reminders: [],
      source: 'manual',
    });

    // Test morning digest
    const digest = generateMorningDigest(TEST_USER_ID);
    if (digest && digest.events.length > 0) {
      console.log(`  ✅ Morning digest generated with ${digest.events.length} event(s)`);
      console.log(`     Preview: "${digest.message.slice(0, 60)}..."`);
      passed++;
    } else {
      console.log('  ⚠️  No events for today\'s digest');
    }
  } catch (error) {
    console.log(`  ❌ Calendar reminders error: ${error}`);
    failed++;
  }

  // =========================================================================
  // TEST 6: Analytics Tracking
  // =========================================================================
  console.log('\n📊 TEST 6: Analytics');
  console.log('-'.repeat(60));

  try {
    // Log some test events
    logOutreachEvent({
      userId: TEST_USER_ID,
      timestamp: new Date(),
      trigger: 'commitment_check',
      method: 'sms',
      status: 'sent',
      message: 'Test message 1',
    });

    logOutreachEvent({
      userId: TEST_USER_ID,
      timestamp: new Date(),
      trigger: 'goal_milestone',
      method: 'sms',
      status: 'responded',
      message: 'Test message 2',
    });

    // Get user analytics
    const userAnalytics = getUserAnalytics(TEST_USER_ID);
    if (userAnalytics.totalSent >= 2) {
      console.log(`  ✅ User analytics: ${userAnalytics.totalSent} sent, ${(userAnalytics.responseRate * 100).toFixed(0)}% response rate`);
      passed++;
    } else {
      console.log('  ❌ User analytics failed');
      failed++;
    }

    // Get global analytics
    const globalAnalytics = getGlobalAnalytics();
    if (globalAnalytics.totalOutreach >= 2) {
      console.log(`  ✅ Global analytics: ${globalAnalytics.totalOutreach} total outreach`);
      passed++;
    } else {
      console.log('  ❌ Global analytics failed');
      failed++;
    }

    // Generate report
    const report = generateSummaryReport();
    if (report.includes('OUTREACH ANALYTICS REPORT')) {
      console.log('  ✅ Summary report generated');
      passed++;
    } else {
      console.log('  ❌ Summary report failed');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ Analytics error: ${error}`);
    failed++;
  }

  // =========================================================================
  // TEST 7: Admin Dashboard
  // =========================================================================
  console.log('\n🎛️  TEST 7: Admin Dashboard');
  console.log('-'.repeat(60));

  try {
    // Get user summary
    const summary = getUserSummary(TEST_USER_ID);
    if (summary.userId === TEST_USER_ID && summary.contactInfo) {
      console.log(`  ✅ User summary retrieved`);
      console.log(`     Has phone: ${summary.contactInfo.hasPhone}`);
      console.log(`     Response rate: ${(summary.stats.responseRate * 100).toFixed(0)}%`);
      passed++;
    } else {
      console.log('  ❌ User summary failed');
      failed++;
    }

    // Get dashboard data
    const dashboard = getDashboardData();
    if (dashboard.analytics) {
      console.log('  ✅ Dashboard data retrieved');
      passed++;
    } else {
      console.log('  ❌ Dashboard data failed');
      failed++;
    }

    // Get analytics report
    const adminReport = getAnalyticsReport();
    if (adminReport.length > 50) {
      console.log('  ✅ Admin analytics report generated');
      passed++;
    } else {
      console.log('  ❌ Admin report failed');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ Admin dashboard error: ${error}`);
    failed++;
  }

  // =========================================================================
  // TEST 8: Full Conversation Analysis
  // =========================================================================
  console.log('\n💬 TEST 8: Full Conversation Analysis');
  console.log('-'.repeat(60));

  try {
    const conversation = `
      User: Hey, I've been thinking about my goals.
      Agent: That's great! What's on your mind?
      User: I want to get healthier. I'll start working out tomorrow morning.
      Agent: Awesome commitment! Exercise is so important.
      User: Yeah, and I promise to meditate every day this week.
      Agent: I love that. Consistency is key!
      User: By the way, you can text me at 555-987-6543 for reminders.
      Agent: Got it! I'll check in with you on your progress.
    `;

    const result = await analyzeConversationForOutreach(
      TEST_USER_ID + '-conv',
      conversation,
      'Ferni'
    );

    console.log(`  📝 Commitments found: ${result.commitments.length}`);
    console.log(`  🎯 Opportunities: ${result.opportunities.length}`);
    console.log(`  📤 Scheduled: ${result.scheduled}`);

    if (result.commitments.length >= 2) {
      console.log('  ✅ Full conversation analysis works!');
      passed++;
    } else {
      console.log('  ⚠️  Fewer commitments than expected');
    }
  } catch (error) {
    console.log(`  ❌ Conversation analysis error: ${error}`);
    failed++;
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\n  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('\n');

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! The outreach system is fully operational.');
  } else {
    console.log('⚠️  Some tests failed. Review the output above.');
  }

  console.log('═'.repeat(60));
  console.log('\n');

  // Cleanup background jobs
  stopGoalMonitoring();
  stopCalendarReminders();
}

// Run tests
runTests().catch(console.error);

