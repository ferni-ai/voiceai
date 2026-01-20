#!/usr/bin/env npx tsx
/**
 * FTIS Interactive REPL
 *
 * Test the classifier interactively.
 *
 * Usage: npx tsx scripts/ftis-repl.ts
 */

import * as readline from 'readline';
import * as path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🧠 FTIS Interactive Classifier\n');
  console.log('Type a query to classify, or:');
  console.log('  /metrics  - Show classification metrics');
  console.log('  /clear    - Clear metrics');
  console.log('  /exit     - Exit\n');

  const { initializeFTISClassifierV2 } = await import(
    '../src/tools/intelligence/ftis-classifier-v2.js'
  );

  console.log('Loading classifier...\n');
  const classifier = await initializeFTISClassifierV2({
    modelsDir: path.join(__dirname, '..', 'models', 'ftis-merged'),
    enableFallback: true,
    enableMetrics: true,
  });

  if (!classifier.isReady()) {
    console.log('❌ Classifier not ready. Make sure models exist in models/ftis-merged/');
    process.exit(1);
  }

  // Warmup
  await classifier.warmup();
  console.log('✅ Ready! Enter queries:\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === '/exit' || input === '/quit' || input === '/q') {
      console.log('\nBye! 👋\n');
      rl.close();
      process.exit(0);
    }

    if (input === '/metrics') {
      const m = classifier.getMetrics();
      console.log('\n📊 Metrics:');
      console.log(`   Classifications: ${m.totalClassifications}`);
      console.log(`   Avg Latency: ${m.averageLatencyMs.toFixed(1)}ms`);
      console.log(`   Fallback Rate: ${(m.fallbackUsageRate * 100).toFixed(1)}%`);
      console.log(`   Cache Hit Rate: ${(m.cacheHitRate * 100).toFixed(1)}%`);
      console.log(`   Confidence: High=${m.confidenceDistribution.high} Med=${m.confidenceDistribution.medium} Low=${m.confidenceDistribution.low}`);
      console.log(`   Errors: ${m.errorCount}\n`);
      rl.prompt();
      return;
    }

    if (input === '/clear') {
      classifier.resetMetrics();
      console.log('Metrics cleared.\n');
      rl.prompt();
      return;
    }

    // Classify the query
    try {
      const result = await classifier.classify(input);

      if (result) {
        const confIcon = result.combinedConfidence >= 0.9 ? '🟢' : result.combinedConfidence >= 0.7 ? '🟡' : '🔴';
        const fallbackIcon = result.usedFallback ? ' [FALLBACK]' : '';

        console.log(`\n${confIcon} ${result.superCategory} → ${result.fineCategory} (${(result.combinedConfidence * 100).toFixed(0)}%)${fallbackIcon}`);
        console.log(`   Tools: ${result.toolIds.slice(0, 5).join(', ')}${result.toolIds.length > 5 ? '...' : ''}`);
        console.log(`   Latency: ${result.latencyMs}ms`);
        
        if (result.alternatives && result.alternatives.length > 1) {
          console.log(`   Alternatives: ${result.alternatives.slice(1, 3).map(a => `${a.category}(${(a.confidence * 100).toFixed(0)}%)`).join(', ')}`);
        }
        console.log();
      } else {
        console.log('\n❌ Classification failed\n');
      }
    } catch (error) {
      console.log(`\n❌ Error: ${error}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch(console.error);
