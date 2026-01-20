#!/usr/bin/env npx tsx
/**
 * FTIS V2 End-to-End Test Script
 *
 * Tests the full tool selection flow with FTIS V2 classification.
 * Run: npx tsx scripts/test-ftis-e2e.ts
 */

import { toolOrchestrator } from '../src/tools/orchestrator/unified-tool-orchestrator.js';
import { getFTISClassifierV2 } from '../src/tools/intelligence/ftis-classifier-v2.js';

const TEST_QUERIES = [
  { query: 'Play some jazz music', expected: { super: 'media', fine: 'play_music' } },
  { query: 'Set an alarm for 7am', expected: { super: 'calendar', fine: 'alarm_set' } },
  { query: "I'm feeling anxious", expected: { super: 'emotional', fine: 'calm_support' } },
  { query: "What's the weather?", expected: { super: 'travel', fine: 'weather' } },
  { query: 'Add milk to my list', expected: { super: 'productivity', fine: 'item_add' } },
  { query: 'Call my mom', expected: { super: 'communication', fine: 'call_contact' } },
  { query: 'How are my habits?', expected: { super: 'health', fine: 'habit_check' } },
];

async function testFTISClassifier() {
  console.log('\n📊 Testing FTIS V2 Classifier Directly\n');
  console.log('='.repeat(80));

  const classifier = getFTISClassifierV2();
  await classifier.initialize();

  if (!classifier.isReady()) {
    console.error('❌ FTIS V2 classifier failed to initialize');
    return;
  }

  console.log(`✅ FTIS V2 initialized with ${classifier.getSuperCategories().length} super-categories\n`);

  let correct = 0;
  for (const test of TEST_QUERIES) {
    const result = await classifier.classify(test.query);

    if (!result) {
      console.log(`❌ ${test.query.padEnd(30)} → FAILED (no result)`);
      continue;
    }

    const superMatch = result.superCategory === test.expected.super;
    const fineMatch = result.fineCategory === test.expected.fine;
    const icon = superMatch && fineMatch ? '✅' : superMatch ? '🟡' : '❌';

    if (superMatch && fineMatch) correct++;

    console.log(
      `${icon} "${test.query.padEnd(28)}" → ${result.superCategory}/${result.fineCategory} ` +
        `(${(result.combinedConfidence * 100).toFixed(0)}%${result.usedFallback ? ' [fallback]' : ''}) ` +
        `[${result.latencyMs}ms]`
    );

    if (!superMatch || !fineMatch) {
      console.log(`   Expected: ${test.expected.super}/${test.expected.fine}`);
    }
  }

  console.log(`\n📈 Accuracy: ${correct}/${TEST_QUERIES.length} (${((correct / TEST_QUERIES.length) * 100).toFixed(0)}%)`);

  // Show metrics
  const metrics = classifier.getMetrics();
  console.log('\n📊 Classifier Metrics:');
  console.log(`   Total classifications: ${metrics.totalClassifications}`);
  console.log(`   Average latency: ${metrics.averageLatencyMs.toFixed(1)}ms`);
  console.log(`   Fallback rate: ${(metrics.fallbackRate * 100).toFixed(1)}%`);
  console.log(`   Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
}

async function testToolOrchestrator() {
  console.log('\n\n📊 Testing Full Tool Orchestrator (with FTIS V2)\n');
  console.log('='.repeat(80));

  // Initialize orchestrator
  console.log('⏳ Initializing tool orchestrator...');
  await toolOrchestrator.initialize();
  console.log('✅ Orchestrator initialized\n');

  for (const test of TEST_QUERIES.slice(0, 3)) {
    // Test just first 3 to keep it quick
    console.log(`\n🔍 Query: "${test.query}"`);

    const result = await toolOrchestrator.getToolsForIntent({
      transcript: test.query,
      userId: 'test-user',
      agentId: 'ferni',
    });

    // Check for FTIS V2 in metadata
    const ftisV2 = result.meta.ftisV2;
    const toolCount = Object.keys(result.tools).length;
    const toolNames = Object.keys(result.tools).slice(0, 8);

    console.log(`   Tools selected: ${toolCount}`);
    console.log(`   Tool names: ${toolNames.join(', ')}${toolCount > 8 ? '...' : ''}`);
    console.log(`   Selection time: ${result.meta.selectionTimeMs}ms`);

    if (ftisV2) {
      console.log(`   ✅ FTIS V2: ${ftisV2.superCategory}/${ftisV2.fineCategory} (${(ftisV2.confidence * 100).toFixed(0)}%)`);
      console.log(`   FTIS V2 tools: ${ftisV2.toolIds.slice(0, 5).join(', ')}`);
    } else {
      console.log(`   ⚠️ FTIS V2: Not available (models may not be loaded)`);
    }
  }
}

async function main() {
  console.log('\n🚀 FTIS V2 End-to-End Test\n');
  console.log('This script tests the full flow from user query → tool selection\n');

  try {
    // Test 1: Direct classifier
    await testFTISClassifier();

    // Test 2: Full orchestrator
    await testToolOrchestrator();

    console.log('\n\n✅ All tests complete!\n');
    console.log('To test with live voice, open http://localhost:3004 and start a call.');
    console.log('Watch the terminal logs for "🧠 FTIS V2: Category-based tools boosted" messages.\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
