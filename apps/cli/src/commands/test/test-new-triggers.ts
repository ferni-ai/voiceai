#!/usr/bin/env npx tsx
/**
 * Test New Trigger Types
 *
 * Demonstrates the enhanced "Better Than Human" features:
 * - Pattern detection ("Mondays are hard")
 * - Anniversary/milestone triggers
 * - Goal progress triggers
 * - Streak celebration
 *
 * Usage:
 *   npx tsx scripts/test-new-triggers.ts --pattern     # Test pattern detection
 *   npx tsx scripts/test-new-triggers.ts --milestone   # Test milestones
 *   npx tsx scripts/test-new-triggers.ts --all         # Test all new triggers
 */

import {
  extractAndProcess,
  extractFromMessage,
} from '../../../../../src/services/outreach/conversation-extractor.js';
import {
  generateTextMessage,
  generateVoicemailMessage,
  type OutreachContext,
  type OutreachTone,
  type RelationshipStage,
} from '../../../../../src/services/outreach/persona-voice-generator.js';

// ============================================================================
// TEST MESSAGES
// ============================================================================

const TEST_MESSAGES = {
  // Day-of-week patterns
  pattern_monday: "Ugh, I hate Mondays. They're always so hard for me.",
  pattern_sunday: "I always get the Sunday scaries. It's the worst.",

  // Streaks
  streak_7: 'I hit a 7 day meditation streak today!',
  streak_30: 'Can you believe it? 30 days of journaling in a row!',
  streak_100: "I've been exercising for 100 days straight now.",

  // Goal progress
  progress_80: "I'm 80% done with my book now!",
  progress_almost: "I'm almost done with my certification, just 2 more modules!",
  progress_fraction: "I've completed 9 out of 10 chapters!",

  // Anniversaries
  anniversary_30: "It's been 30 days since I started therapy.",
  anniversary_100: "We've had 100 conversations together now, Ferni!",

  // Counts
  count_10: 'This is my 10th time working out this month!',
  count_50: "That's the 50th journal entry I've written!",

  // Combined patterns
  combined:
    "Mondays are always tough for me. I'm on day 14 of my streak though, and I'm 85% done with my goal!",
};

// ============================================================================
// EXTRACTION TESTS
// ============================================================================

function testExtraction() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 EXTRACTION TESTS');
  console.log('='.repeat(70));

  for (const [name, message] of Object.entries(TEST_MESSAGES)) {
    console.log(`\n🔍 Test: ${name}`);
    console.log(`   Message: "${message}"`);

    const result = extractFromMessage(message);

    if (result.patterns && result.patterns.length > 0) {
      console.log(`   ✅ Patterns detected:`);
      for (const p of result.patterns) {
        console.log(`      - ${p.type}: ${p.pattern} (confidence: ${p.confidence})`);
        if (p.dayOfWeek !== undefined) {
          console.log(`        Day: ${p.dayOfWeek}`);
        }
      }
    }

    if (result.milestones && result.milestones.length > 0) {
      console.log(`   ✅ Milestones detected:`);
      for (const m of result.milestones) {
        console.log(
          `      - ${m.type}: ${m.description} (value: ${m.value}, confidence: ${m.confidence})`
        );
      }
    }

    if (
      (!result.patterns || result.patterns.length === 0) &&
      (!result.milestones || result.milestones.length === 0)
    ) {
      console.log(`   ⚠️  No patterns or milestones extracted`);
    }
  }
}

// ============================================================================
// MESSAGE GENERATION TESTS
// ============================================================================

function testMessageGeneration() {
  console.log('\n' + '='.repeat(70));
  console.log('💬 MESSAGE GENERATION TESTS');
  console.log('='.repeat(70));

  // Test contexts for new trigger types
  const testContexts: Array<{
    name: string;
    trigger: string;
    reason: string;
    milestone?: string;
    goal?: string;
  }> = [
    {
      name: 'Pattern Acknowledgment (Monday support)',
      trigger: 'pattern_acknowledgment',
      reason: 'Mondays seem to be hard for you',
    },
    {
      name: 'Streak Celebration (30 days)',
      trigger: 'streak_celebration',
      milestone: '30 days of meditation',
    },
    {
      name: 'Goal Progress (near completion)',
      trigger: 'goal_progress',
      goal: 'completing your certification',
    },
    {
      name: 'Anniversary (100 conversations)',
      trigger: 'anniversary',
      milestone: "it's been 100 conversations since we met",
    },
    {
      name: 'Streak at Risk',
      trigger: 'streak_at_risk',
      goal: 'your meditation streak',
    },
    {
      name: 'Concern Check',
      trigger: 'concern_check',
      reason: 'You mentioned feeling overwhelmed at work',
    },
  ];

  for (const tc of testContexts) {
    console.log(`\n📝 ${tc.name}`);
    console.log(`   Trigger: ${tc.trigger}`);

    const context: OutreachContext = {
      userId: 'test-user',
      userName: 'Sarah',
      preferredName: 'Sarah',
      relationshipStage: 'established' as RelationshipStage,
      trigger: {
        type: tc.trigger,
        reason: tc.reason || `Checking in on ${tc.milestone || tc.goal}`,
        urgency: 'medium',
      },
      context: {
        recentTopics: ['work', 'meditation'],
        currentStruggles: ['feeling overwhelmed at work'],
      },
      milestone: tc.milestone,
      goal: tc.goal,
    };

    // Generate text message
    const textMsg = generateTextMessage('ferni', context, 'encouraging' as OutreachTone);
    console.log(`\n   📱 Text Message:`);
    console.log(`   "${textMsg}"`);

    // Generate voicemail
    const vmMsg = generateVoicemailMessage('ferni', context, 'encouraging' as OutreachTone);
    console.log(`\n   📞 Voicemail:`);
    console.log(`   "${vmMsg}"`);
  }
}

// ============================================================================
// FULL INTEGRATION TEST
// ============================================================================

async function testIntegration() {
  console.log('\n' + '='.repeat(70));
  console.log('🔗 FULL INTEGRATION TEST');
  console.log('='.repeat(70));

  const testMessage =
    "I'm really proud - I've been meditating for 30 days straight now! " +
    "Though Mondays are still hard, I'm getting better at starting my week positively.";

  console.log(`\n📝 Test message:`);
  console.log(`   "${testMessage}"`);
  console.log('\n🔄 Running extractAndProcess...');

  try {
    const result = await extractAndProcess('test-user-integration', testMessage);

    console.log('\n📊 Results:');
    console.log(`   Patterns: ${result.patterns?.length || 0}`);
    console.log(`   Milestones: ${result.milestones?.length || 0}`);
    console.log(`   Triggers created: ${result.triggersCreated.length}`);

    if (result.patterns && result.patterns.length > 0) {
      console.log('\n   Detected patterns:');
      for (const p of result.patterns) {
        console.log(`     - ${p.pattern}`);
      }
    }

    if (result.milestones && result.milestones.length > 0) {
      console.log('\n   Detected milestones:');
      for (const m of result.milestones) {
        console.log(`     - ${m.type}: ${m.description}`);
      }
    }

    if (result.triggersCreated.length > 0) {
      console.log('\n   Created trigger IDs:');
      for (const id of result.triggersCreated) {
        console.log(`     - ${id}`);
      }
    }

    console.log('\n✅ Integration test complete!');
  } catch (error) {
    console.log(`\n⚠️ Integration test skipped (requires backend services)`);
    console.log(`   Error: ${error}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  console.log('🧪 Testing New "Better Than Human" Trigger Types');
  console.log('='.repeat(70));

  if (args.includes('--pattern') || args.includes('--all') || args.length === 0) {
    testExtraction();
  }

  if (args.includes('--message') || args.includes('--all') || args.length === 0) {
    testMessageGeneration();
  }

  if (args.includes('--integration') || args.includes('--all')) {
    await testIntegration();
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ All tests complete!');
  console.log('='.repeat(70));
  console.log('\nNew trigger types available:');
  console.log('  - pattern_acknowledgment: "Mondays seem hard for you"');
  console.log('  - streak_celebration: 7, 30, 100 day milestones');
  console.log('  - goal_progress: When near completion (80%+)');
  console.log('  - anniversary: Relationship milestones');
  console.log('  - streak_at_risk: Gentle reminders');
  console.log('  - concern_check: Follow up on worrying topics');
}

main().catch(console.error);
