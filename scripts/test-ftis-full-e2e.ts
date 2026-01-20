#!/usr/bin/env npx tsx
/**
 * FTIS Full E2E Test
 *
 * Tests the complete classification pipeline:
 * 1. ONNX hierarchical classifier
 * 2. Gemini fallback for low confidence
 * 3. Tool mapping
 *
 * Usage: npx tsx scripts/test-ftis-full-e2e.ts
 */

import * as path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test queries with expected outcomes
const TEST_QUERIES = [
  // High confidence (should use ONNX only)
  { query: 'Play some jazz music', expectedSuper: 'media', expectedFine: 'play_music' },
  { query: 'Set an alarm for 7am', expectedSuper: 'calendar', expectedFine: 'alarm_set' },
  { query: "I'm feeling anxious", expectedSuper: 'emotional', expectedFine: 'calm_support' },
  { query: "What's the weather?", expectedSuper: 'travel', expectedFine: 'weather' },
  { query: 'Call mom', expectedSuper: 'communication', expectedFine: 'call_make' },

  // Edge cases (may trigger fallback)
  { query: 'help', note: 'Single word - ambiguous' },
  { query: 'remindme workout', note: 'Typo - may need fallback' },
  { query: 'whatever', note: 'Dismissive - ambiguous emotional' },
  { query: "I'm fine", note: 'Denial pattern' },
  { query: 'cal mom', note: 'Abbreviated' },
];

async function main() {
  console.log('🧪 FTIS Full E2E Test\n');
  console.log('='.repeat(80) + '\n');

  // Initialize hierarchical classifier
  const { initializeHierarchicalClassifier } = await import(
    '../src/tools/intelligence/ftis-hierarchical-classifier.js'
  );
  const classifier = await initializeHierarchicalClassifier({
    modelsDir: path.join(__dirname, '..', 'models', 'ftis-merged'),
    fallbackThreshold: 0.85,
    enableFallback: true,
  });

  if (!classifier.isReady()) {
    console.log('❌ Classifier not ready\n');
    return;
  }
  console.log('✅ ONNX Classifier ready\n');

  // Initialize Gemini fallback
  const { getGeminiFallback } = await import('../src/tools/intelligence/ftis-gemini-fallback.js');
  const fallback = getGeminiFallback();
  const centroidsPath = path.join(__dirname, '..', 'models', 'ftis-merged', 'category_centroids.json');
  await fallback.loadCentroids(centroidsPath);
  console.log(`✅ Gemini Fallback ready (${fallback.isInitialized() ? 'centroids loaded' : 'no centroids'})\n`);

  // Run tests
  console.log('Running tests...\n');
  console.log('-'.repeat(80));

  let correct = 0;
  let total = 0;
  let fallbackUsed = 0;

  for (const test of TEST_QUERIES) {
    total++;

    // Classify with ONNX
    const result = await classifier.classify(test.query);

    if (!result) {
      console.log(`❌ "${test.query}" → Classification failed\n`);
      continue;
    }

    // Check if fallback was used
    if (result.usedFallback) {
      fallbackUsed++;
    }

    // Check correctness
    let status = '?';
    if (test.expectedSuper && test.expectedFine) {
      if (result.superCategory === test.expectedSuper && result.fineCategory === test.expectedFine) {
        status = '✓';
        correct++;
      } else {
        status = '✗';
      }
    } else {
      // No expected - just report
      status = '~';
    }

    const confWarn = result.combinedConfidence < 0.85 ? '⚠️' : '';
    const fallbackNote = result.usedFallback ? '[fallback]' : '';

    console.log(`${status} "${test.query}"`);
    console.log(`   → ${result.superCategory} / ${result.fineCategory}`);
    console.log(`   → Confidence: ${(result.combinedConfidence * 100).toFixed(0)}% ${confWarn} ${fallbackNote}`);
    console.log(`   → Tools: ${result.toolIds.slice(0, 3).join(', ')}${result.toolIds.length > 3 ? '...' : ''}`);
    if (test.note) console.log(`   → Note: ${test.note}`);
    if (status === '✗') {
      console.log(`   → Expected: ${test.expectedSuper} / ${test.expectedFine}`);
    }
    console.log();
  }

  console.log('-'.repeat(80));
  console.log('\n📊 Summary\n');
  console.log(`   Total: ${total}`);
  console.log(`   Correct: ${correct}/${total - (TEST_QUERIES.filter((t) => !t.expectedSuper).length)}`);
  console.log(`   Fallback used: ${fallbackUsed}/${total}`);
  console.log();
}

main().catch(console.error);
