#!/usr/bin/env npx ts-node --esm
/**
 * Speaker Embedding Model Benchmark Script
 *
 * Benchmarks speaker embedding models for:
 * - Equal Error Rate (EER)
 * - Processing time
 * - Memory usage
 * - Accuracy on test pairs
 *
 * Usage:
 *   npx ts-node --esm scripts/benchmark-speaker-models.ts
 *   npx ts-node --esm scripts/benchmark-speaker-models.ts --verbose
 *
 * @module BenchmarkSpeakerModels
 */

import { extractSpeakerEmbedding, isNeuralEmbeddingAvailable } from '../../../../../src/services/voice-memory-enhanced.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface BenchmarkResult {
  modelName: string;
  method: 'neural' | 'dsp';
  metrics: {
    eer: number;                    // Equal Error Rate (lower is better, target: <2%)
    avgProcessingMs: number;        // Average processing time per sample
    minProcessingMs: number;
    maxProcessingMs: number;
    peakMemoryMb: number;           // Peak memory during inference
    accuracyAtThreshold: number;    // Accuracy at optimal threshold
    falseAcceptRate: number;        // FAR at optimal threshold
    falseRejectRate: number;        // FRR at optimal threshold
  };
  testSamples: number;
  timestamp: Date;
}

interface TestPair {
  audio1: Float32Array;
  audio2: Float32Array;
  isSameSpeaker: boolean;
  speakerId1: string;
  speakerId2: string;
}

// ============================================================================
// TEST DATA GENERATION
// ============================================================================

/**
 * Generate synthetic test audio.
 * In production, use real audio samples.
 */
function generateTestAudio(speakerId: string, durationSec: number = 3, sampleRate: number = 16000): Float32Array {
  const samples = new Float32Array(durationSec * sampleRate);
  
  // Use speaker ID as seed for reproducible "different" voices
  const seed = speakerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const baseFreq = 100 + (seed % 200); // 100-300 Hz base frequency
  
  // Generate simple voice-like signal with harmonics
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    
    // Fundamental + harmonics
    let sample = 0;
    for (let h = 1; h <= 5; h++) {
      const freq = baseFreq * h;
      const amp = 1 / h; // Decreasing amplitude for higher harmonics
      sample += amp * Math.sin(2 * Math.PI * freq * t);
    }
    
    // Add some noise
    sample += 0.05 * (Math.random() * 2 - 1);
    
    // Add speaker-specific modulation
    sample *= 0.5 + 0.5 * Math.sin(2 * Math.PI * (3 + seed % 5) * t);
    
    samples[i] = sample * 0.5;
  }
  
  return samples;
}

/**
 * Generate test pairs for evaluation.
 */
function generateTestPairs(numSpeakers: number = 10, samplesPerSpeaker: number = 5): TestPair[] {
  const pairs: TestPair[] = [];
  const speakers: string[] = [];
  const speakerSamples: Map<string, Float32Array[]> = new Map();
  
  // Generate speakers and their samples
  for (let i = 0; i < numSpeakers; i++) {
    const speakerId = `speaker_${i}`;
    speakers.push(speakerId);
    
    const samples: Float32Array[] = [];
    for (let j = 0; j < samplesPerSpeaker; j++) {
      samples.push(generateTestAudio(speakerId));
    }
    speakerSamples.set(speakerId, samples);
  }
  
  // Generate same-speaker pairs (positive pairs)
  for (const speakerId of speakers) {
    const samples = speakerSamples.get(speakerId)!;
    for (let i = 0; i < samples.length - 1; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        pairs.push({
          audio1: samples[i],
          audio2: samples[j],
          isSameSpeaker: true,
          speakerId1: speakerId,
          speakerId2: speakerId,
        });
      }
    }
  }
  
  // Generate different-speaker pairs (negative pairs)
  for (let i = 0; i < speakers.length - 1; i++) {
    for (let j = i + 1; j < speakers.length; j++) {
      const samples1 = speakerSamples.get(speakers[i])!;
      const samples2 = speakerSamples.get(speakers[j])!;
      
      // Take one sample from each
      pairs.push({
        audio1: samples1[0],
        audio2: samples2[0],
        isSameSpeaker: false,
        speakerId1: speakers[i],
        speakerId2: speakers[j],
      });
    }
  }
  
  // Shuffle pairs
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  
  return pairs;
}

// ============================================================================
// EMBEDDING EXTRACTION
// ============================================================================

/**
 * Extract embedding from audio.
 */
async function extractEmbedding(audio: Float32Array): Promise<{
  embedding: number[];
  processingMs: number;
}> {
  const start = performance.now();
  const embedding = await extractSpeakerEmbedding(audio);
  const processingMs = performance.now() - start;
  
  return { embedding, processingMs };
}

/**
 * Compute cosine similarity between two embeddings.
 */
function cosineSimilarity(emb1: number[], emb2: number[]): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < emb1.length; i++) {
    dotProduct += emb1[i] * emb2[i];
    norm1 += emb1[i] * emb1[i];
    norm2 += emb2[i] * emb2[i];
  }
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// ============================================================================
// EER CALCULATION
// ============================================================================

/**
 * Calculate Equal Error Rate (EER).
 * EER is the point where FAR = FRR.
 */
function calculateEER(
  scores: { similarity: number; isSameSpeaker: boolean }[]
): { eer: number; threshold: number; far: number; frr: number } {
  // Sort by similarity
  const sorted = [...scores].sort((a, b) => a.similarity - b.similarity);
  
  const totalPositive = scores.filter(s => s.isSameSpeaker).length;
  const totalNegative = scores.filter(s => !s.isSameSpeaker).length;
  
  if (totalPositive === 0 || totalNegative === 0) {
    return { eer: 0.5, threshold: 0.5, far: 0.5, frr: 0.5 };
  }
  
  let bestEER = 1;
  let bestThreshold = 0;
  let bestFAR = 0;
  let bestFRR = 0;
  
  // Try each similarity value as threshold
  for (let i = 0; i < sorted.length; i++) {
    const threshold = sorted[i].similarity;
    
    // Count false accepts (negative pairs with similarity >= threshold)
    const falseAccepts = scores.filter(s => !s.isSameSpeaker && s.similarity >= threshold).length;
    const FAR = falseAccepts / totalNegative;
    
    // Count false rejects (positive pairs with similarity < threshold)
    const falseRejects = scores.filter(s => s.isSameSpeaker && s.similarity < threshold).length;
    const FRR = falseRejects / totalPositive;
    
    // EER is where FAR ≈ FRR
    const currentEER = Math.abs(FAR - FRR);
    
    if (currentEER < bestEER) {
      bestEER = currentEER;
      bestThreshold = threshold;
      bestFAR = FAR;
      bestFRR = FRR;
    }
  }
  
  // Return actual EER (average of FAR and FRR at best threshold)
  const actualEER = (bestFAR + bestFRR) / 2;
  
  return {
    eer: actualEER,
    threshold: bestThreshold,
    far: bestFAR,
    frr: bestFRR,
  };
}

// ============================================================================
// BENCHMARK
// ============================================================================

/**
 * Run the benchmark.
 */
async function runBenchmark(verbose: boolean = false): Promise<BenchmarkResult> {
  console.log('\n' + '='.repeat(60));
  console.log('  SPEAKER EMBEDDING MODEL BENCHMARK');
  console.log('='.repeat(60));
  
  // Check model availability
  const neuralAvailable = await isNeuralEmbeddingAvailable();
  const method = neuralAvailable ? 'neural' : 'dsp';
  const modelName = neuralAvailable ? 'ECAPA-TDNN (ferni-speaker)' : 'DSP Fallback';
  
  console.log(`\n📊 Model: ${modelName}`);
  console.log(`   Method: ${method}`);
  
  // Generate test pairs
  console.log('\n📦 Generating test data...');
  const testPairs = generateTestPairs(10, 5);
  console.log(`   Generated ${testPairs.length} test pairs`);
  console.log(`   - Positive pairs: ${testPairs.filter(p => p.isSameSpeaker).length}`);
  console.log(`   - Negative pairs: ${testPairs.filter(p => !p.isSameSpeaker).length}`);
  
  // Process pairs and collect scores
  console.log('\n⏱️ Processing pairs...');
  const scores: { similarity: number; isSameSpeaker: boolean }[] = [];
  const processingTimes: number[] = [];
  
  const startMemory = process.memoryUsage().heapUsed;
  let peakMemory = startMemory;
  
  for (let i = 0; i < testPairs.length; i++) {
    const pair = testPairs[i];
    
    // Extract embeddings
    const result1 = await extractEmbedding(pair.audio1);
    const result2 = await extractEmbedding(pair.audio2);
    
    processingTimes.push(result1.processingMs, result2.processingMs);
    
    // Compute similarity
    const similarity = cosineSimilarity(result1.embedding, result2.embedding);
    scores.push({ similarity, isSameSpeaker: pair.isSameSpeaker });
    
    // Track memory
    const currentMemory = process.memoryUsage().heapUsed;
    if (currentMemory > peakMemory) {
      peakMemory = currentMemory;
    }
    
    // Progress
    if (verbose && (i + 1) % 10 === 0) {
      console.log(`   Processed ${i + 1}/${testPairs.length} pairs`);
    }
  }
  
  // Calculate metrics
  console.log('\n📈 Calculating metrics...');
  
  const { eer, threshold, far, frr } = calculateEER(scores);
  
  const avgProcessingMs = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
  const minProcessingMs = Math.min(...processingTimes);
  const maxProcessingMs = Math.max(...processingTimes);
  const peakMemoryMb = (peakMemory - startMemory) / (1024 * 1024);
  
  // Calculate accuracy at threshold
  let correct = 0;
  for (const score of scores) {
    const predicted = score.similarity >= threshold;
    if (predicted === score.isSameSpeaker) {
      correct++;
    }
  }
  const accuracyAtThreshold = correct / scores.length;
  
  // Build result
  const result: BenchmarkResult = {
    modelName,
    method,
    metrics: {
      eer,
      avgProcessingMs,
      minProcessingMs,
      maxProcessingMs,
      peakMemoryMb,
      accuracyAtThreshold,
      falseAcceptRate: far,
      falseRejectRate: frr,
    },
    testSamples: testPairs.length * 2,
    timestamp: new Date(),
  };
  
  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('  RESULTS');
  console.log('='.repeat(60));
  console.log(`\n📊 Model: ${result.modelName}`);
  console.log(`   Method: ${result.method}`);
  console.log(`\n📈 Accuracy Metrics:`);
  console.log(`   EER: ${(result.metrics.eer * 100).toFixed(2)}%`);
  console.log(`   Optimal Threshold: ${threshold.toFixed(3)}`);
  console.log(`   Accuracy at Threshold: ${(result.metrics.accuracyAtThreshold * 100).toFixed(1)}%`);
  console.log(`   FAR: ${(result.metrics.falseAcceptRate * 100).toFixed(2)}%`);
  console.log(`   FRR: ${(result.metrics.falseRejectRate * 100).toFixed(2)}%`);
  console.log(`\n⏱️ Performance Metrics:`);
  console.log(`   Avg Processing: ${result.metrics.avgProcessingMs.toFixed(1)} ms`);
  console.log(`   Min Processing: ${result.metrics.minProcessingMs.toFixed(1)} ms`);
  console.log(`   Max Processing: ${result.metrics.maxProcessingMs.toFixed(1)} ms`);
  console.log(`   Peak Memory: ${result.metrics.peakMemoryMb.toFixed(1)} MB`);
  console.log(`\n📦 Test Data:`);
  console.log(`   Total Samples: ${result.testSamples}`);
  console.log(`   Total Pairs: ${testPairs.length}`);
  
  // Quality assessment
  console.log('\n' + '='.repeat(60));
  console.log('  ASSESSMENT');
  console.log('='.repeat(60));
  
  if (result.metrics.eer < 0.02) {
    console.log('✅ EXCELLENT - EER < 2% (production ready)');
  } else if (result.metrics.eer < 0.05) {
    console.log('🟡 GOOD - EER < 5% (acceptable for most use cases)');
  } else if (result.metrics.eer < 0.10) {
    console.log('🟠 FAIR - EER < 10% (needs improvement)');
  } else {
    console.log('❌ POOR - EER >= 10% (not suitable for production)');
  }
  
  if (result.metrics.avgProcessingMs < 50) {
    console.log('✅ FAST - Processing < 50ms (real-time capable)');
  } else if (result.metrics.avgProcessingMs < 200) {
    console.log('🟡 OK - Processing < 200ms (acceptable latency)');
  } else {
    console.log('❌ SLOW - Processing >= 200ms (needs optimization)');
  }
  
  console.log('\n');
  
  return result;
}

// ============================================================================
// SAVE RESULTS
// ============================================================================

/**
 * Save benchmark results to file.
 */
function saveResults(result: BenchmarkResult): void {
  const resultsDir = path.join(process.cwd(), 'benchmark-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const filename = `benchmark-${result.method}-${Date.now()}.json`;
  const filepath = path.join(resultsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  console.log(`📁 Results saved to: ${filepath}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  
  try {
    const result = await runBenchmark(verbose);
    saveResults(result);
    
    // Exit with code based on EER
    if (result.metrics.eer > 0.10) {
      process.exit(1); // Fail if EER too high
    }
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

main();

