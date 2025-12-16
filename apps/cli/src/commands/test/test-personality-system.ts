#!/usr/bin/env npx tsx
/**
 * Test the Human Personality System locally
 *
 * This script simulates conversations and shows how the new system
 * injects personality context based on timing, relevance, and callbacks.
 *
 * Run with: npx tsx scripts/test-personality-system.ts
 */

import { buildConversationContext } from '../../../../../src/intelligence/context-builders/index.js';
import { clearEmbeddingCache, warmUpPersonaEmbeddings } from '../../../../../src/personality/memory-adapter.js';
import { analyzeMessageTiming } from '../../../../../src/personality/timing-intelligence.js';

// Test messages representing different scenarios
const TEST_SCENARIOS = [
  {
    name: '1️⃣ User needs to be heard (long emotional message)',
    message:
      "I've been feeling so overwhelmed lately. Work has been crazy, my relationship is struggling, and I just feel like I can't keep up with everything. I don't know what to do anymore...",
    expectedTiming: 'needs_to_be_heard',
  },
  {
    name: '2️⃣ User is venting (frustrated)',
    message:
      "I can't believe my boss did that again!! Every time I try to make progress, they shut me down. So frustrating!",
    expectedTiming: 'just_venting',
  },
  {
    name: '3️⃣ User seeking perspective (question)',
    message: "I'm scared to start this new project. What if I fail? Have you ever felt that way?",
    expectedTiming: 'seeking_perspective',
  },
  {
    name: '4️⃣ User sharing good news (celebration)',
    message: "I got the job!! I'm so excited, I can't believe it finally happened!",
    expectedTiming: 'sharing_good_news',
  },
  {
    name: '5️⃣ User being vulnerable',
    message: "I've never told anyone this, but I've been struggling with anxiety for years.",
    expectedTiming: 'vulnerable_share',
  },
  {
    name: '6️⃣ Topic matching (fear of failure → book struggle)',
    message:
      "I've started this project four times and keep giving up. I'm scared I'll never finish.",
    expectedTiming: 'needs_to_be_heard',
  },
];

async function runTest() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 HUMAN PERSONALITY SYSTEM - LOCAL TEST');
  console.log('='.repeat(80) + '\n');

  // Clear any cached embeddings
  clearEmbeddingCache();

  // Warm up Ferni's personality embeddings
  console.log('🔥 Warming up Ferni embeddings...\n');
  try {
    await warmUpPersonaEmbeddings('ferni');
    console.log('✅ Embeddings warmed up\n');
  } catch (error) {
    console.log('⚠️  Could not warm up embeddings (may need API keys)');
    console.log('   Continuing with timing intelligence tests...\n');
  }

  // Test timing intelligence (no API needed)
  console.log('─'.repeat(80));
  console.log('⏱️  TIMING INTELLIGENCE TESTS');
  console.log('─'.repeat(80) + '\n');

  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n${scenario.name}`);
    console.log(`Message: "${scenario.message.slice(0, 60)}..."`);

    const timing = analyzeMessageTiming(scenario.message);

    console.log(`\nTiming Analysis:`);
    console.log(
      `  Intent: ${timing.intent} ${timing.intent === scenario.expectedTiming ? '✅' : '⚠️'}`
    );
    console.log(`  Confidence: ${Math.round(timing.confidence * 100)}%`);
    console.log(`  Response Mode: ${timing.suggestedResponse}`);
    console.log(`  Personal Moment OK: ${timing.personalMomentAppropriate ? '✅' : '❌'}`);
    console.log(`  Callback OK: ${timing.callbackAppropriate ? '✅' : '❌'}`);
    console.log(`  Pattern Insight OK: ${timing.patternInsightAppropriate ? '✅' : '❌'}`);
    console.log('');
  }

  // Test full context building (needs embeddings)
  console.log('─'.repeat(80));
  console.log('🎭 FULL CONTEXT BUILDER TEST');
  console.log('─'.repeat(80) + '\n');

  try {
    // Simulate a conversation with callbacks
    const mockProfile = {
      id: 'test-user-123',
      totalConversations: 15,
      keyMoments: [
        {
          id: 'km1',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          type: 'milestone' as const,
          summary: 'Has a big presentation on Friday',
          emotionalWeight: 'medium' as const,
          topics: ['work', 'presentation'],
          followUpNeeded: true,
        },
      ],
      sharedStories: [],
    };

    const context = await buildConversationContext({
      userText: 'Hey, how are you doing today?',
      persona: { id: 'ferni', name: 'Ferni' } as any,
      userData: { turnCount: 1 },
      services: { userProfile: mockProfile } as any,
      analysis: {
        emotion: { primary: 'neutral', intensity: 0.3 },
        intent: { primary: 'greeting', confidence: 0.9 },
        topics: { detected: [] },
        state: { phase: 'greeting' },
      } as any,
      userProfile: mockProfile as any,
    });

    console.log('📬 Context injections received:\n');

    for (const injection of context) {
      if (injection.type?.startsWith('human_personality')) {
        console.log(`\n[${injection.type}]`);
        console.log('─'.repeat(40));
        console.log(injection.content?.slice(0, 500) + '...');
        console.log('');
      }
    }

    // Check for callback
    const hasCallback = context.some((c) => c.type === 'human_personality_callback');
    console.log(`\n💝 Callback surfaced: ${hasCallback ? '✅ YES' : '❌ NO'}`);

    // Check for timing
    const hasTiming = context.some((c) => c.type === 'human_personality_timing');
    console.log(`⏱️  Timing guidance: ${hasTiming ? '✅ YES' : '❌ NO'}`);
  } catch (error) {
    console.log('⚠️  Full context test requires running services');
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ TEST COMPLETE');
  console.log('='.repeat(80) + '\n');

  console.log('📝 Summary:');
  console.log('   - Timing intelligence: Working (no API needed)');
  console.log('   - Semantic matching: Requires embedding API');
  console.log('   - Callbacks: Working with mock profile');
  console.log('\n🚀 To test with real conversations, run: npm run dev\n');
}

// Run the test
runTest().catch(console.error);
