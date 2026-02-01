#!/usr/bin/env npx tsx
/**
 * Test script for Rust ONNX Router
 *
 * Run with: npx tsx test_rust_onnx.ts
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

async function main() {
  console.log('🦀 Testing Rust ONNX Router\n');

  // Import the native module
  let OnnxRouter: any;
  try {
    const ferniPerf = await import('@ferni/perf');
    OnnxRouter = ferniPerf.OnnxRouter;
    if (!OnnxRouter) {
      throw new Error('OnnxRouter not exported');
    }
    console.log('✅ @ferni/perf loaded successfully');
  } catch (error) {
    console.error('❌ Failed to load @ferni/perf:', error);
    console.log('\n🔧 To build the native module:');
    console.log('   cd apps/rust-perf && pnpm build');
    process.exit(1);
  }

  // Initialize the router
  const modelPath = path.join(projectRoot, 'models/ferni-router-v3/model.onnx');
  const tokenizerPath = path.join(projectRoot, 'models/ferni-router-v3/tokenizer.json');
  const labelMapPath = path.join(projectRoot, 'models/ferni-router-v3/label_map.json');

  console.log('\n📁 Model paths:');
  console.log(`   Model: ${modelPath}`);
  console.log(`   Tokenizer: ${tokenizerPath}`);
  console.log(`   Labels: ${labelMapPath}`);

  let router: any;
  try {
    console.log('\n⏳ Loading ONNX model (this may take a moment)...');
    const start = Date.now();

    router = new OnnxRouter({
      modelPath,
      tokenizerPath,
      labelMapPath,
      maxLength: 128,
      threshold: 0.05,
      topK: 10,
      // numThreads: undefined = auto-detect based on CPU cores
    });

    const loadTime = Date.now() - start;
    console.log(`✅ Router initialized in ${loadTime}ms`);
    console.log(`   Tools: ${router.getNumTools()}`);

    // Warmup the JIT compiler to avoid cold-start latency
    console.log('\n🔥 Warming up JIT compiler...');
    const warmupTime = router.warmup();
    console.log(`✅ Warmup complete in ${warmupTime.toFixed(1)}ms`);
  } catch (error) {
    console.error('❌ Failed to initialize router:', error);
    process.exit(1);
  }

  // Test predictions
  const testQueries = [
    // Tool queries (should have high confidence)
    'play some jazz music',
    'what\'s the weather like today',
    "schedule a meeting for tomorrow at 3pm",
    'call my mom',
    'set a reminder to buy groceries',
    'how much money do I have in my account',

    // Open intents (should have low confidence)
    'how are you doing today',
    'I had a great day',
    'tell me a joke',
    'what do you think about the meaning of life',
  ];

  console.log('\n📊 Running predictions:\n');
  console.log('Query'.padEnd(50) + 'Tool'.padEnd(25) + 'Conf'.padEnd(10) + 'Time');
  console.log('-'.repeat(95));

  let totalTime = 0;
  let correctToolCalls = 0;
  let correctOpenIntents = 0;

  for (const query of testQueries) {
    const result = router.predict(query);
    totalTime += result.latencyMs;

    const topPred = result.predictions[0];
    const isOpenIntent = !topPred || topPred.confidence < 0.05;
    const isToolQuery = testQueries.indexOf(query) < 6; // First 6 are tool queries

    if (isToolQuery && !isOpenIntent) correctToolCalls++;
    if (!isToolQuery && isOpenIntent) correctOpenIntents++;

    const toolStr = isOpenIntent ? '(open intent)' : topPred.toolId;
    const confStr = isOpenIntent ? '-' : `${(topPred.confidence * 100).toFixed(1)}%`;
    const timeStr = `${result.latencyMs.toFixed(1)}ms`;

    console.log(
      query.slice(0, 48).padEnd(50) +
      toolStr.padEnd(25) +
      confStr.padEnd(10) +
      timeStr
    );
  }

  console.log('-'.repeat(95));
  console.log(`\n📈 Performance Summary:`);
  console.log(`   Total queries: ${testQueries.length}`);
  console.log(`   Average latency: ${(totalTime / testQueries.length).toFixed(1)}ms`);
  console.log(`   Tool accuracy: ${correctToolCalls}/6 (${((correctToolCalls / 6) * 100).toFixed(0)}%)`);
  console.log(`   Open intent accuracy: ${correctOpenIntents}/4 (${((correctOpenIntents / 4) * 100).toFixed(0)}%)`);

  if (correctToolCalls === 6 && correctOpenIntents === 4) {
    console.log('\n✅ All tests passed! Rust ONNX router is working correctly.');
  } else {
    console.log('\n⚠️  Some predictions may need threshold tuning.');
  }
}

main().catch(console.error);
