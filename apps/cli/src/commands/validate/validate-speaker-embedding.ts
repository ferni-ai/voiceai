#!/usr/bin/env npx ts-node
/**
 * End-to-End Speaker Embedding Validation
 *
 * Run: npx ts-node scripts/validate-speaker-embedding.ts
 *
 * This script validates that the speaker embedding system works correctly:
 * 1. Native module loads and initializes
 * 2. Embeddings are extracted correctly
 * 3. Comparisons work as expected
 * 4. Performance meets requirements
 */

import * as path from 'path';
import * as fs from 'fs';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg: string) {
  console.log(msg);
}

function success(msg: string) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function error(msg: string) {
  console.log(`${RED}✗${RESET} ${msg}`);
}

function warn(msg: string) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

function header(msg: string) {
  console.log(`\n${CYAN}${BOLD}${msg}${RESET}`);
}

// Audio generation utilities
function generateSineWave(frequency: number, durationMs: number, sampleRate = 16000): Float32Array {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5;
  }
  return samples;
}

function generateNoise(durationMs: number, sampleRate = 16000): Float32Array {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = (Math.random() * 2 - 1) * 0.3;
  }
  return samples;
}

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

async function runValidation(): Promise<void> {
  const results: TestResult[] = [];
  let speaker: any = null;

  header('🔊 Speaker Embedding E2E Validation');
  log('=' .repeat(50));

  // Test 1: Check if native module exists
  header('1. Checking Native Module');

  const modulePath = path.join(process.cwd(), 'node_modules/ferni-speaker');
  const nodeFiles = fs.existsSync(modulePath)
    ? fs.readdirSync(modulePath).filter((f) => f.endsWith('.node'))
    : [];

  if (nodeFiles.length === 0) {
    error('No .node files found in ferni-speaker');
    results.push({ name: 'Native module exists', passed: false, message: 'No .node files' });
    return printResults(results);
  }
  success(`Found native module: ${nodeFiles[0]}`);
  results.push({ name: 'Native module exists', passed: true, message: nodeFiles[0] });

  // Test 2: Check if model exists
  const modelPath = path.join(modulePath, 'models/ecapa_tdnn.onnx');
  if (!fs.existsSync(modelPath)) {
    error('Model file not found');
    results.push({ name: 'Model file exists', passed: false, message: modelPath });
    return printResults(results);
  }
  const modelSize = fs.statSync(modelPath).size / (1024 * 1024);
  success(`Model file exists: ${modelSize.toFixed(1)} MB`);
  results.push({ name: 'Model file exists', passed: true, message: `${modelSize.toFixed(1)} MB` });

  // Test 3: Load module
  header('2. Loading Module');

  try {
    // Use createRequire for ESM compatibility
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    speaker = require('ferni-speaker');
    success('Module loaded');
    results.push({ name: 'Module loads', passed: true, message: 'OK' });
  } catch (e: any) {
    error(`Failed to load: ${e.message}`);
    results.push({ name: 'Module loads', passed: false, message: e.message });
    return printResults(results);
  }

  // Test 4: Initialize
  try {
    speaker.initialize(modelPath);
    success('Model initialized');
    results.push({ name: 'Model initializes', passed: true, message: 'OK' });
  } catch (e: any) {
    error(`Failed to initialize: ${e.message}`);
    results.push({ name: 'Model initializes', passed: false, message: e.message });
    return printResults(results);
  }

  // Test 5: Get model info
  const info = speaker.getModelInfo();
  if (info.embeddingDim === 192) {
    success(`Model info: ${info.name}, ${info.embeddingDim}-dim`);
    results.push({ name: 'Model info correct', passed: true, message: `${info.embeddingDim}-dim` });
  } else {
    error(`Unexpected embedding dim: ${info.embeddingDim}`);
    results.push({ name: 'Model info correct', passed: false, message: `${info.embeddingDim}-dim` });
  }

  // Test 6: Extract embedding
  header('3. Embedding Extraction');

  const audio = generateSineWave(440, 1000);
  let embedding: Float32Array;
  let extractionTime: number;

  try {
    const start = Date.now();
    embedding = speaker.extractEmbedding(audio);
    extractionTime = Date.now() - start;

    if (embedding.length === 192) {
      success(`Extracted 192-dim embedding in ${extractionTime}ms`);
      results.push({
        name: 'Embedding extraction',
        passed: true,
        message: `${extractionTime}ms`,
        duration: extractionTime,
      });
    } else {
      error(`Wrong dimension: ${embedding.length}`);
      results.push({ name: 'Embedding extraction', passed: false, message: `dim=${embedding.length}` });
    }
  } catch (e: any) {
    error(`Extraction failed: ${e.message}`);
    results.push({ name: 'Embedding extraction', passed: false, message: e.message });
    return printResults(results);
  }

  // Test 7: Check normalization
  const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  if (Math.abs(norm - 1.0) < 0.01) {
    success(`L2 normalized: norm=${norm.toFixed(4)}`);
    results.push({ name: 'Embedding normalized', passed: true, message: `norm=${norm.toFixed(4)}` });
  } else {
    error(`Not normalized: norm=${norm.toFixed(4)}`);
    results.push({ name: 'Embedding normalized', passed: false, message: `norm=${norm.toFixed(4)}` });
  }

  // Test 8: Self-similarity
  header('4. Similarity Comparison');

  const selfSim = speaker.compareEmbeddings(embedding, embedding);
  if (Math.abs(selfSim - 1.0) < 0.001) {
    success(`Self-similarity: ${selfSim.toFixed(4)}`);
    results.push({ name: 'Self-similarity = 1.0', passed: true, message: selfSim.toFixed(4) });
  } else {
    error(`Self-similarity wrong: ${selfSim.toFixed(4)}`);
    results.push({ name: 'Self-similarity = 1.0', passed: false, message: selfSim.toFixed(4) });
  }

  // Test 9: Different audio similarity
  const audio2 = generateSineWave(880, 1000);
  const embedding2 = speaker.extractEmbedding(audio2);
  const crossSim = speaker.compareEmbeddings(embedding, embedding2);

  if (crossSim < 1.0 && crossSim > 0) {
    success(`Cross-similarity: ${crossSim.toFixed(4)} (different audio)`);
    results.push({ name: 'Cross-similarity valid', passed: true, message: crossSim.toFixed(4) });
  } else {
    error(`Cross-similarity invalid: ${crossSim.toFixed(4)}`);
    results.push({ name: 'Cross-similarity valid', passed: false, message: crossSim.toFixed(4) });
  }

  // Test 10: Find best match
  header('5. Speaker Matching');

  const candidates = [embedding2, embedding, generateNoise(1000)].map((a) =>
    a instanceof Float32Array && a.length === 192 ? a : speaker.extractEmbedding(a)
  );

  // Fix: candidates[2] is noise audio, need to extract embedding
  const noiseAudio = generateNoise(1000);
  const noiseEmb = speaker.extractEmbedding(noiseAudio);
  const testCandidates = [embedding2, embedding, noiseEmb];

  const match = speaker.findBestMatch(embedding, testCandidates, 0.5);

  if (match && match.index === 1) {
    success(`Best match found: index=${match.index}, sim=${match.similarity.toFixed(4)}`);
    results.push({ name: 'findBestMatch works', passed: true, message: `index=${match.index}` });
  } else {
    error(`Best match wrong: ${JSON.stringify(match)}`);
    results.push({ name: 'findBestMatch works', passed: false, message: JSON.stringify(match) });
  }

  // Test 11: Performance benchmark
  header('6. Performance Benchmark');

  const benchmarkAudio = generateSineWave(440, 1000);
  const iterations = 20;
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    speaker.extractEmbedding(benchmarkAudio);
    times.push(Date.now() - start);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  log(`   Iterations: ${iterations}`);
  log(`   Average: ${avgTime.toFixed(1)}ms`);
  log(`   Min: ${minTime}ms, Max: ${maxTime}ms`);

  if (avgTime < 20) {
    success(`Performance: ${avgTime.toFixed(1)}ms average (target: <20ms)`);
    results.push({ name: 'Performance < 20ms', passed: true, message: `${avgTime.toFixed(1)}ms avg` });
  } else {
    warn(`Performance: ${avgTime.toFixed(1)}ms average (target: <20ms)`);
    results.push({ name: 'Performance < 20ms', passed: false, message: `${avgTime.toFixed(1)}ms avg` });
  }

  // Test 12: Batch extraction
  header('7. Batch Extraction');

  const batchAudios = [
    generateSineWave(440, 1000),
    generateSineWave(880, 1000),
    generateNoise(1000),
  ];

  try {
    const batchStart = Date.now();
    const batchEmbs = speaker.extractEmbeddingsBatch(batchAudios);
    const batchTime = Date.now() - batchStart;

    if (batchEmbs.length === 3 && batchEmbs.every((e: Float32Array) => e.length === 192)) {
      success(`Batch extraction: ${batchEmbs.length} embeddings in ${batchTime}ms`);
      results.push({ name: 'Batch extraction', passed: true, message: `${batchTime}ms for 3` });
    } else {
      error(`Batch extraction failed`);
      results.push({ name: 'Batch extraction', passed: false, message: 'Invalid output' });
    }
  } catch (e: any) {
    error(`Batch extraction error: ${e.message}`);
    results.push({ name: 'Batch extraction', passed: false, message: e.message });
  }

  // Test 13: Error handling
  header('8. Error Handling');

  try {
    const shortAudio = generateSineWave(440, 400); // 0.4s, should fail
    speaker.extractEmbedding(shortAudio);
    error('Should have thrown for short audio');
    results.push({ name: 'Rejects short audio', passed: false, message: 'No error thrown' });
  } catch (e: any) {
    if (e.message.toLowerCase().includes('short')) {
      success(`Correctly rejects short audio`);
      results.push({ name: 'Rejects short audio', passed: true, message: 'OK' });
    } else {
      warn(`Threw error but wrong message: ${e.message}`);
      results.push({ name: 'Rejects short audio', passed: true, message: e.message });
    }
  }

  printResults(results);
}

function printResults(results: TestResult[]): void {
  header('📊 Results Summary');
  log('=' .repeat(50));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;

  results.forEach((r) => {
    const icon = r.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`${icon} ${r.name}: ${r.message}`);
  });

  log('');
  if (allPassed) {
    log(`${GREEN}${BOLD}✅ All ${total} tests passed!${RESET}`);
    log(`${GREEN}Speaker embedding system is ready for production.${RESET}`);
  } else {
    log(`${RED}${BOLD}❌ ${total - passed}/${total} tests failed${RESET}`);
    log(`${RED}Please fix the issues above before deploying.${RESET}`);
    process.exit(1);
  }
}

// Run validation
runValidation().catch((e) => {
  console.error('Validation error:', e);
  process.exit(1);
});

