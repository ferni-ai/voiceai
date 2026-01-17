/**
 * Post-TTS Processor Performance Benchmark
 *
 * Tests the Rust native module performance with various configurations.
 * Run with: npx tsx benchmark.ts
 */

import {
  NativePostTtsProcessor,
  type NativePostTtsConfig,
} from './index.js';

// ============================================================================
// Test Configurations
// ============================================================================

const CONFIGS: Record<string, Partial<NativePostTtsConfig>> = {
  bypass: {
    enableBreath: false,
    enableWarmth: false,
    enableCompression: false,
    enablePresence: false,
    enableMicroPitch: false,
    enableNoiseFloor: false,
    enableAmplitudeJitter: false,
    enablePitchDrift: false,
    enableVocalFry: false,
    enableLipSmacks: false,
    enableTempoVariation: false,
    enableOnsetSoftening: false,
  },
  minimal: {
    enableBreath: false,
    enableWarmth: true,
    enableCompression: true,
    enablePresence: true,
    enableMicroPitch: false,
    enableNoiseFloor: false,
    enableAmplitudeJitter: false,
    enablePitchDrift: false,
    enableVocalFry: false,
    enableLipSmacks: false,
    enableTempoVariation: false,
    enableOnsetSoftening: false,
  },
  betterThanHuman: {
    enableBreath: true,
    enableWarmth: true,
    enableCompression: true,
    enablePresence: true,
    enableMicroPitch: true,
    enableNoiseFloor: true,
    enableAmplitudeJitter: true,
    enablePitchDrift: true,
    enableVocalFry: false,
    enableLipSmacks: false,
    enableTempoVariation: false,
    enableOnsetSoftening: false,
  },
  allFeatures: {
    enableBreath: true,
    enableWarmth: true,
    enableCompression: true,
    enablePresence: true,
    enableMicroPitch: true,
    enableNoiseFloor: true,
    enableAmplitudeJitter: true,
    enablePitchDrift: true,
    enableVocalFry: true,
    enableLipSmacks: true,
    enableTempoVariation: true,
    enableOnsetSoftening: true,
    enableEmotionProsody: true,
    enableAdaptivePacing: true,
  },
};

// ============================================================================
// Benchmark Utilities
// ============================================================================

function generateTestAudio(durationMs: number, sampleRate: number): Float32Array {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const audio = new Float32Array(numSamples);

  // Generate a mix of frequencies (simulating speech)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Fundamental + harmonics (typical speech)
    audio[i] =
      0.3 * Math.sin(2 * Math.PI * 150 * t) + // Fundamental ~150Hz
      0.2 * Math.sin(2 * Math.PI * 300 * t) + // H2
      0.15 * Math.sin(2 * Math.PI * 450 * t) + // H3
      0.1 * Math.sin(2 * Math.PI * 600 * t) + // H4
      0.05 * (Math.random() * 2 - 1); // Noise
  }

  return audio;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ============================================================================
// Benchmark Runner
// ============================================================================

async function runBenchmark() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Post-TTS Processor Performance Benchmark');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const SAMPLE_RATE = 24000;
  const FRAME_SIZE_MS = 20; // Typical TTS frame
  const FRAME_SIZE = Math.floor((FRAME_SIZE_MS / 1000) * SAMPLE_RATE);
  const WARMUP_ITERATIONS = 10;
  const BENCHMARK_ITERATIONS = 100;
  const TOTAL_DURATION_MS = 5000; // 5 seconds of audio

  // Generate test audio
  const testAudio = generateTestAudio(TOTAL_DURATION_MS, SAMPLE_RATE);
  const numFrames = Math.floor(testAudio.length / FRAME_SIZE);

  console.log(`Sample Rate: ${SAMPLE_RATE} Hz`);
  console.log(`Frame Size: ${FRAME_SIZE} samples (${FRAME_SIZE_MS}ms)`);
  console.log(`Test Duration: ${TOTAL_DURATION_MS}ms (${numFrames} frames)`);
  console.log(`Iterations: ${BENCHMARK_ITERATIONS} (+ ${WARMUP_ITERATIONS} warmup)`);
  console.log('');

  const results: Record<string, { avgMs: number; framesPerSec: number; rtFactor: number }> = {};

  for (const [configName, config] of Object.entries(CONFIGS)) {
    console.log(`\n▶ Testing: ${configName}`);
    console.log('─'.repeat(50));

    // Create processor
    const processor = new NativePostTtsProcessor({
      sampleRate: SAMPLE_RATE,
      ...config,
    });

    // Warmup
    for (let iter = 0; iter < WARMUP_ITERATIONS; iter++) {
      processor.startUtterance();
      for (let i = 0; i < numFrames; i++) {
        const frame = testAudio.slice(i * FRAME_SIZE, (i + 1) * FRAME_SIZE);
        const isLast = i === numFrames - 1;
        processor.processFrame(frame, isLast);
      }
      processor.reset();
    }

    // Benchmark
    const times: number[] = [];
    for (let iter = 0; iter < BENCHMARK_ITERATIONS; iter++) {
      processor.startUtterance();
      const start = performance.now();

      for (let i = 0; i < numFrames; i++) {
        const frame = testAudio.slice(i * FRAME_SIZE, (i + 1) * FRAME_SIZE);
        const isLast = i === numFrames - 1;
        processor.processFrame(frame, isLast);
      }

      times.push(performance.now() - start);
      processor.reset();
    }

    // Calculate stats
    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    const minMs = Math.min(...times);
    const maxMs = Math.max(...times);
    const framesPerSec = (numFrames / avgMs) * 1000;
    const rtFactor = TOTAL_DURATION_MS / avgMs;

    results[configName] = { avgMs, framesPerSec, rtFactor };

    console.log(`  Avg: ${formatNumber(avgMs)}ms`);
    console.log(`  Min: ${formatNumber(minMs)}ms | Max: ${formatNumber(maxMs)}ms`);
    console.log(`  Throughput: ${formatNumber(framesPerSec)} frames/sec`);
    console.log(`  Real-time factor: ${formatNumber(rtFactor)}x`);
  }

  // Summary
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Config           │ Avg (ms) │ Frames/s │ RT Factor');
  console.log('─────────────────┼──────────┼──────────┼───────────');

  for (const [name, { avgMs, framesPerSec, rtFactor }] of Object.entries(results)) {
    const namePad = name.padEnd(16);
    const avgPad = formatNumber(avgMs).padStart(8);
    const fpsPad = formatNumber(framesPerSec).padStart(8);
    const rtPad = formatNumber(rtFactor).padStart(9);
    console.log(`${namePad} │ ${avgPad} │ ${fpsPad} │ ${rtPad}x`);
  }

  console.log('');

  // Check if we're real-time capable
  const worstCase = results['allFeatures'];
  if (worstCase.rtFactor < 1) {
    console.log('⚠️  WARNING: allFeatures config is SLOWER than real-time!');
  } else if (worstCase.rtFactor < 2) {
    console.log('⚠️  CAUTION: allFeatures config has low headroom (<2x RT)');
  } else {
    console.log('✅ All configurations are real-time capable with good headroom');
  }

  console.log('');
}

// Run
runBenchmark().catch(console.error);
