#!/usr/bin/env node
/**
 * V7 vs V6 Benchmark
 *
 * Compares the new V7 hierarchical classifier against V6 flat classifier.
 *
 * Metrics:
 * - Top-1 accuracy (correct tool in first prediction)
 * - Top-3 accuracy (correct tool in top 3 predictions)
 * - Average latency
 * - Confidence distribution
 *
 * Usage:
 *   node benchmark-v7-vs-v6.mjs
 */

// V6 (flat classifier) has been removed - benchmark now focuses on V7 only
// import { initializeOnnxClassifier, classifyWithOnnx, isOnnxClassifierAvailable } from './src/tools/semantic-router/advanced/intelligent/onnx-classifier.js';
import {
  classifyHierarchical,
  initializeHierarchicalClassifier,
  isHierarchicalClassifierAvailable,
} from './src/tools/semantic-router/advanced/intelligent/hierarchical-classifier.js';

// Test dataset: [query, expectedDomain, expectedMetaTool]
const testQueries = [
  // Music domain
  ['Play some jazz music', 'music_audio', 'music.play'],
  ['Skip this song', 'music_audio', 'music.skip'],
  ['What song is this?', 'music_audio', 'music.identify'],

  // Calendar domain
  ['Schedule a meeting tomorrow at 2pm', 'calendar', 'calendar.create'],
  ['What meetings do I have today?', 'calendar', 'calendar.read'],
  ['Cancel my 3pm meeting', 'calendar', 'calendar.delete'],

  // Habits domain
  ['Help me build a meditation habit', 'habits_routines', 'habit.create'],
  ['Did I meditate today?', 'habits_routines', 'habit.check'],
  ['I want to track my sleep', 'habits_routines', 'habit.create'],

  // Emotional support
  ['I need help processing grief', 'grief_loss', 'grief.support'],
  ["I'm feeling really anxious", 'emotional_support', 'emotional.calm'],
  ['I had a panic attack', 'crisis_safety', 'crisis.support'],

  // Career
  ["I'm thinking about changing jobs", 'career_work', 'career.plan'],
  ['How do I deal with burnout?', 'career_work', 'career.burnout'],

  // Knowledge/Search
  ["What's the weather like?", 'knowledge_search', 'weather.get'],
  ['Tell me about quantum physics', 'knowledge_search', 'knowledge.search'],

  // Developer tools
  ['Run my tests', 'developer', 'dev.tools'],

  // Communication
  ['Call my mom', 'communication', 'call.make'],
  ['Send a text to John', 'communication', 'message.send'],

  // Health/Fitness
  ['Log my workout', 'health_fitness', 'fitness.log'],
  ['How many calories in an apple?', 'food_nutrition', 'nutrition.lookup'],
];

console.log('🏁 V7 vs V6 Benchmark\n');
console.log('═'.repeat(80));

async function runBenchmark() {
  const results = {
    v6: { available: false, predictions: [], latencies: [], errors: 0 },
    v7: { available: false, predictions: [], latencies: [], errors: 0 },
  };

  // Initialize V6 (DEPRECATED - V6 classifier has been removed)
  console.log('\n📦 Initializing V6 (flat classifier)...');
  console.log('⚠️  V6 classifier has been removed - skipping V6 benchmark');
  results.v6.available = false;

  // Initialize V7
  console.log('\n📦 Initializing V7 (hierarchical classifier)...');
  try {
    await initializeHierarchicalClassifier();
    results.v7.available = isHierarchicalClassifierAvailable();
    console.log(results.v7.available ? '✅ V7 initialized' : '⚠️  V7 not available');
  } catch (error) {
    console.log(`⚠️  V7 initialization failed: ${error.message}`);
  }

  if (!results.v7.available) {
    console.error('\n❌ V7 classifier not available - cannot run benchmark');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('🧪 Running benchmark queries...\n');

  // Run benchmark
  for (let i = 0; i < testQueries.length; i++) {
    const [query, expectedDomain, expectedMetaTool] = testQueries[i];
    console.log(`[${i + 1}/${testQueries.length}] "${query}"`);
    console.log(`   Expected: [${expectedDomain}] ${expectedMetaTool}`);

    // Test V6
    if (results.v6.available) {
      try {
        const v6Result = classifyWithOnnx(query);
        results.v6.latencies.push(v6Result.latencyMs);

        const top1 = v6Result.predictions[0];
        const top3 = v6Result.predictions.slice(0, 3);

        const v6Prediction = {
          query,
          expectedDomain,
          expectedMetaTool,
          top1: top1.toolId,
          top1Confidence: top1.confidence,
          top3: top3.map((p) => p.toolId),
          latencyMs: v6Result.latencyMs,
          correct: top1.toolId === expectedMetaTool,
          correctIn3: top3.some((p) => p.toolId === expectedMetaTool),
        };

        results.v6.predictions.push(v6Prediction);

        const emoji = v6Prediction.correct ? '✅' : v6Prediction.correctIn3 ? '🟡' : '❌';
        console.log(
          `   V6: ${emoji} ${top1.toolId} (${(top1.confidence * 100).toFixed(1)}%) - ${v6Result.latencyMs.toFixed(1)}ms`
        );
      } catch (error) {
        results.v6.errors++;
        console.log(`   V6: ❌ Error: ${error.message}`);
      }
    }

    // Test V7
    if (results.v7.available) {
      try {
        const v7Result = classifyHierarchical(query);
        results.v7.latencies.push(v7Result.latencyMs);

        const top1 = v7Result.predictions[0];
        const top3 = v7Result.predictions.slice(0, 3);

        const v7Prediction = {
          query,
          expectedDomain,
          expectedMetaTool,
          top1Domain: top1.domain,
          top1MetaTool: top1.metaTool,
          top1Combined: top1.combinedConfidence,
          top3: top3.map((p) => ({ domain: p.domain, metaTool: p.metaTool })),
          latencyMs: v7Result.latencyMs,
          stage1Ms: v7Result.stage1LatencyMs,
          stage2Ms: v7Result.stage2LatencyMs,
          domainCorrect: top1.domain === expectedDomain,
          metaToolCorrect: top1.metaTool === expectedMetaTool,
          correctIn3: top3.some((p) => p.metaTool === expectedMetaTool),
        };

        results.v7.predictions.push(v7Prediction);

        const emoji = v7Prediction.metaToolCorrect ? '✅' : v7Prediction.correctIn3 ? '🟡' : '❌';
        const domainEmoji = v7Prediction.domainCorrect ? '✓' : '✗';
        console.log(
          `   V7: ${emoji} [${domainEmoji} ${top1.domain}] ${top1.metaTool} (${(top1.combinedConfidence * 100).toFixed(1)}%) - ${v7Result.latencyMs.toFixed(1)}ms (S1:${v7Result.stage1LatencyMs.toFixed(0)}ms S2:${v7Result.stage2LatencyMs.toFixed(0)}ms)`
        );
      } catch (error) {
        results.v7.errors++;
        console.log(`   V7: ❌ Error: ${error.message}`);
      }
    }

    console.log('');
  }

  // Print summary
  console.log('═'.repeat(80));
  console.log('📊 BENCHMARK RESULTS\n');

  if (results.v6.available) {
    const v6Top1Accuracy =
      (results.v6.predictions.filter((p) => p.correct).length / results.v6.predictions.length) *
      100;
    const v6Top3Accuracy =
      (results.v6.predictions.filter((p) => p.correctIn3).length / results.v6.predictions.length) *
      100;
    const v6AvgLatency =
      results.v6.latencies.reduce((a, b) => a + b, 0) / results.v6.latencies.length;
    const v6AvgConfidence =
      results.v6.predictions.reduce((sum, p) => sum + p.top1Confidence, 0) /
      results.v6.predictions.length;

    console.log('V6 (Flat Classifier):');
    console.log(
      `  Top-1 Accuracy: ${v6Top1Accuracy.toFixed(1)}% (${results.v6.predictions.filter((p) => p.correct).length}/${results.v6.predictions.length})`
    );
    console.log(
      `  Top-3 Accuracy: ${v6Top3Accuracy.toFixed(1)}% (${results.v6.predictions.filter((p) => p.correctIn3).length}/${results.v6.predictions.length})`
    );
    console.log(`  Avg Latency:    ${v6AvgLatency.toFixed(1)}ms`);
    console.log(`  Avg Confidence: ${(v6AvgConfidence * 100).toFixed(1)}%`);
    console.log(`  Errors:         ${results.v6.errors}`);
    console.log('');
  }

  if (results.v7.available) {
    const v7MetaToolAccuracy =
      (results.v7.predictions.filter((p) => p.metaToolCorrect).length /
        results.v7.predictions.length) *
      100;
    const v7DomainAccuracy =
      (results.v7.predictions.filter((p) => p.domainCorrect).length /
        results.v7.predictions.length) *
      100;
    const v7Top3Accuracy =
      (results.v7.predictions.filter((p) => p.correctIn3).length / results.v7.predictions.length) *
      100;
    const v7AvgLatency =
      results.v7.latencies.reduce((a, b) => a + b, 0) / results.v7.latencies.length;
    const v7AvgStage1 =
      results.v7.predictions.reduce((sum, p) => sum + p.stage1Ms, 0) /
      results.v7.predictions.length;
    const v7AvgStage2 =
      results.v7.predictions.reduce((sum, p) => sum + p.stage2Ms, 0) /
      results.v7.predictions.length;
    const v7AvgConfidence =
      results.v7.predictions.reduce((sum, p) => sum + p.top1Combined, 0) /
      results.v7.predictions.length;

    console.log('V7 (Hierarchical Classifier):');
    console.log(
      `  Domain Accuracy:    ${v7DomainAccuracy.toFixed(1)}% (${results.v7.predictions.filter((p) => p.domainCorrect).length}/${results.v7.predictions.length})`
    );
    console.log(
      `  Meta-Tool Accuracy: ${v7MetaToolAccuracy.toFixed(1)}% (${results.v7.predictions.filter((p) => p.metaToolCorrect).length}/${results.v7.predictions.length})`
    );
    console.log(
      `  Top-3 Accuracy:     ${v7Top3Accuracy.toFixed(1)}% (${results.v7.predictions.filter((p) => p.correctIn3).length}/${results.v7.predictions.length})`
    );
    console.log(
      `  Avg Latency:        ${v7AvgLatency.toFixed(1)}ms (Stage1: ${v7AvgStage1.toFixed(1)}ms, Stage2: ${v7AvgStage2.toFixed(1)}ms)`
    );
    console.log(`  Avg Confidence:     ${(v7AvgConfidence * 100).toFixed(1)}%`);
    console.log(`  Errors:             ${results.v7.errors}`);
    console.log('');
  }

  // Comparison
  if (results.v6.available && results.v7.available) {
    console.log('═'.repeat(80));
    console.log('📈 V7 vs V6 Comparison:\n');

    const v6Top1 =
      (results.v6.predictions.filter((p) => p.correct).length / results.v6.predictions.length) *
      100;
    const v7Top1 =
      (results.v7.predictions.filter((p) => p.metaToolCorrect).length /
        results.v7.predictions.length) *
      100;
    const accuracyDiff = v7Top1 - v6Top1;

    const v6Latency = results.v6.latencies.reduce((a, b) => a + b, 0) / results.v6.latencies.length;
    const v7Latency = results.v7.latencies.reduce((a, b) => a + b, 0) / results.v7.latencies.length;
    const latencyDiff = v7Latency - v6Latency;

    console.log(`  Accuracy:  V7 ${accuracyDiff >= 0 ? '+' : ''}${accuracyDiff.toFixed(1)}% vs V6`);
    console.log(
      `  Latency:   V7 ${latencyDiff >= 0 ? '+' : ''}${latencyDiff.toFixed(1)}ms vs V6 (${((latencyDiff / v6Latency) * 100).toFixed(1)}%)`
    );
    console.log('');

    if (accuracyDiff > 0) {
      console.log('  ✅ V7 has higher accuracy!');
    } else if (accuracyDiff < 0) {
      console.log('  ⚠️  V6 has higher accuracy');
    } else {
      console.log('  ➖ Accuracy is equal');
    }

    if (latencyDiff < 0) {
      console.log('  ✅ V7 is faster!');
    } else if (latencyDiff > 0) {
      console.log('  ⚠️  V6 is faster');
    } else {
      console.log('  ➖ Latency is equal');
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('✨ Benchmark complete!\n');
}

runBenchmark().catch((error) => {
  console.error('❌ Benchmark failed:', error);
  console.error(error.stack);
  process.exit(1);
});
