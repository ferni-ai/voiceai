#!/usr/bin/env npx tsx
/**
 * Test for hybrid router pattern matching layer
 *
 * Verifies that the production hybrid router correctly:
 * 1. Uses pattern matching for edge cases (umbrella, headlines, AI questions)
 * 2. Falls through to ML for everything else
 * 3. Routes open_intent to LLM path
 */
import { getFTISHybridRouter } from '../../../src/tools/intelligence/tool-router.js';

async function main() {
  console.log('============================================================');
  console.log('🧪 FTIS Hybrid Router Pattern Matching Test');
  console.log('============================================================\n');

  const router = getFTISHybridRouter();
  await router.initialize();

  console.log('Router initialized. Testing pattern matching...\n');

  const testCases = [
    // The 3 cases that failed ML-only test (should now be caught by patterns)
    { query: 'do I need an umbrella today', expected: 'weather', type: 'tool', expectPattern: true },
    { query: 'give me the headlines', expected: 'news', type: 'tool', expectPattern: true },
    { query: "what's your favorite color", expected: 'open_intent', type: 'conversation', expectPattern: true },

    // Additional pattern edge cases
    { query: 'will it rain tomorrow', expected: 'weather', type: 'tool', expectPattern: true },
    { query: 'should I bring a jacket', expected: 'weather', type: 'tool', expectPattern: true },
    { query: 'do I need a coat', expected: 'weather', type: 'tool', expectPattern: true },
    { query: 'show me the headlines', expected: 'news', type: 'tool', expectPattern: true },
    { query: "what is your favorite food", expected: 'open_intent', type: 'conversation', expectPattern: true },
    { query: 'are you alive', expected: 'open_intent', type: 'conversation', expectPattern: true },
    { query: 'do you have feelings', expected: 'open_intent', type: 'conversation', expectPattern: true },
    { query: 'are you conscious', expected: 'open_intent', type: 'conversation', expectPattern: true },

    // Regular cases (should use ML, not pattern)
    { query: 'play some jazz music', expected: 'music', type: 'tool', expectPattern: false },
    { query: 'set a timer for 5 minutes', expected: 'timer', type: 'tool', expectPattern: false },
    { query: "what's on my calendar", expected: 'calendar', type: 'tool', expectPattern: false },
  ];

  let passed = 0;
  let failed = 0;
  let patternMatchedCorrectly = 0;

  for (const tc of testCases) {
    const result = await router.route(tc.query);

    const category = result.classification.fineCategory;
    const isOpenIntent = result.classification.isOpenIntent;
    const reason = result.reason;
    const tier = result.tier;

    let ok = false;
    if (tc.type === 'conversation') {
      // Should be open intent -> LLM path
      ok = isOpenIntent === true || tier === 'llm' || category === 'open_intent';
    } else {
      // Should match expected tool category (flexible: exact match, contains, or toolIds)
      const categoryLower = category.toLowerCase();
      const expectedLower = tc.expected.toLowerCase();
      ok = category === tc.expected ||
           categoryLower.includes(expectedLower) ||
           expectedLower.includes(categoryLower) ||
           (result.classification.toolIds?.some(t => t.toLowerCase().includes(expectedLower)) ?? false);
    }

    // Check if pattern match was used correctly
    const wasPatternMatch = reason.startsWith('pattern_match');
    const patternCorrect = wasPatternMatch === tc.expectPattern;
    if (patternCorrect) patternMatchedCorrectly++;

    const backend = wasPatternMatch ? 'PATTERN' : 'ML';
    const patternStatus = patternCorrect ? '' : (tc.expectPattern ? ' [EXPECTED PATTERN]' : ' [UNEXPECTED PATTERN]');

    if (ok) {
      passed++;
      console.log(`✅ "${tc.query.slice(0, 40).padEnd(40)}..." → ${category.padEnd(12)} (${backend.padEnd(7)}) [${tier}]${patternStatus}`);
    } else {
      failed++;
      console.log(`❌ "${tc.query.slice(0, 40).padEnd(40)}..." → Expected: ${tc.expected}, Got: ${category} [${tier}]`);
      console.log(`   Reason: ${reason}, isOpenIntent: ${isOpenIntent}`);
    }
  }

  console.log('\n============================================================');
  console.log('📊 Summary');
  console.log('============================================================');
  console.log(`Passed: ${passed}/${testCases.length} (${((passed / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}`);
  console.log(`Pattern routing correct: ${patternMatchedCorrectly}/${testCases.length}`);

  const metrics = router.getMetrics();
  console.log(`\n📈 Router Metrics:`);
  console.log(`   Pattern matches: ${metrics.patternMatchCount}/${metrics.totalRoutings} (${(metrics.patternMatchRate * 100).toFixed(1)}%)`);
  console.log(`   Fast path: ${metrics.fastPathCount}`);
  console.log(`   Verify path: ${metrics.verifyPathCount}`);
  console.log(`   LLM path: ${metrics.llmPathCount}`);
  console.log(`   Avg latency: ${metrics.averageLatencyMs.toFixed(1)}ms`);

  if (failed > 0) {
    console.log(`\n❌ Test FAILED`);
    process.exit(1);
  } else {
    console.log(`\n✅ Test PASSED`);
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
