#!/usr/bin/env npx tsx
/**
 * Test FTIS Classifier V2
 *
 * Tests the production-ready classifier with:
 * - transformers.js tokenization
 * - ONNX inference
 * - Gemini fallback
 * - Observability metrics
 *
 * Usage: npx tsx scripts/test-ftis-v2.ts
 */

import * as path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_QUERIES = [
  // Standard queries
  { query: 'Play some jazz music', expected: { super: 'media', fine: 'play_music' } },
  { query: 'Set an alarm for 7am', expected: { super: 'calendar', fine: 'alarm_set' } },
  { query: "I'm feeling anxious", expected: { super: 'emotional', fine: 'calm_support' } },
  { query: "What's the weather like today?", expected: { super: 'travel', fine: 'weather' } },
  { query: 'Call mom', expected: { super: 'communication', fine: 'call_make' } },
  { query: 'Add milk to my grocery list', expected: { super: 'productivity', fine: 'item_add' } },
  { query: 'Turn off the lights', expected: { super: 'home', fine: 'lights' } },

  // Edge cases (may use fallback)
  { query: 'remindme workout', note: 'Typo - should trigger fallback' },
  { query: 'plya jazz', note: 'Typo - should still work' },
  { query: 'help', note: 'Ambiguous single word' },
];

async function main() {
  console.log('🧪 FTIS Classifier V2 Test\n');
  console.log('='.repeat(80) + '\n');

  const { initializeFTISClassifierV2 } = await import(
    '../src/tools/intelligence/ftis-classifier-v2.js'
  );

  console.log('Initializing classifier...\n');
  const classifier = await initializeFTISClassifierV2({
    modelsDir: path.join(__dirname, '..', 'models', 'ftis-merged'),
    fallbackThreshold: 0.85,
    enableFallback: true,
    enableMetrics: true,
  });

  if (!classifier.isReady()) {
    console.log('❌ Classifier not ready\n');
    return;
  }

  console.log('✅ Classifier ready\n');
  console.log(`Super-categories: ${classifier.getSuperCategories().join(', ')}\n`);
  console.log('-'.repeat(80) + '\n');

  // Warmup
  console.log('Warming up...\n');
  await classifier.warmup();

  // Run tests
  let correct = 0;
  let total = 0;

  for (const test of TEST_QUERIES) {
    const result = await classifier.classify(test.query);

    if (!result) {
      console.log(`❌ "${test.query}" → Failed\n`);
      continue;
    }

    total++;
    let status = '~';

    if (test.expected) {
      if (result.superCategory === test.expected.super && result.fineCategory === test.expected.fine) {
        status = '✓';
        correct++;
      } else {
        status = '✗';
      }
    }

    const confIcon = result.combinedConfidence >= 0.9 ? '🟢' : result.combinedConfidence >= 0.7 ? '🟡' : '🔴';
    const fallbackIcon = result.usedFallback ? ' [FALLBACK]' : '';

    console.log(`${status} "${test.query}"`);
    console.log(`   ${confIcon} ${result.superCategory} → ${result.fineCategory} (${(result.combinedConfidence * 100).toFixed(0)}%)${fallbackIcon}`);
    console.log(`   📦 Tools: ${result.toolIds.slice(0, 3).join(', ')}${result.toolIds.length > 3 ? '...' : ''}`);
    console.log(`   ⏱️  ${result.latencyMs}ms`);

    if (result.alternatives && result.alternatives.length > 1) {
      console.log(`   🔀 Alt: ${result.alternatives.slice(1, 3).map(a => `${a.category}(${(a.confidence * 100).toFixed(0)}%)`).join(', ')}`);
    }

    if (test.note) console.log(`   📝 ${test.note}`);
    if (status === '✗' && test.expected) {
      console.log(`   ❌ Expected: ${test.expected.super} → ${test.expected.fine}`);
    }
    console.log();
  }

  // Print metrics
  console.log('-'.repeat(80));
  console.log('\n📊 Classification Metrics\n');

  const metrics = classifier.getMetrics();
  console.log(`   Total: ${metrics.totalClassifications}`);
  console.log(`   Avg Latency: ${metrics.averageLatencyMs.toFixed(1)}ms`);
  console.log(`   Fallback Rate: ${(metrics.fallbackUsageRate * 100).toFixed(1)}%`);
  console.log(`   Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
  console.log(`   Confidence Distribution:`);
  console.log(`     High (>90%): ${metrics.confidenceDistribution.high}`);
  console.log(`     Medium (70-90%): ${metrics.confidenceDistribution.medium}`);
  console.log(`     Low (<70%): ${metrics.confidenceDistribution.low}`);
  console.log(`   Errors: ${metrics.errorCount}`);

  console.log('\n📈 Test Results\n');
  const withExpected = TEST_QUERIES.filter(t => t.expected).length;
  console.log(`   Correct: ${correct}/${withExpected} (${((correct / withExpected) * 100).toFixed(0)}%)`);
  console.log();
}

main().catch(console.error);
