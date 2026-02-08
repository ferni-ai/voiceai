#!/usr/bin/env npx tsx
/**
 * E2E shape validation for native Qwen3-Omni STS pipeline (ferni-omni NAPI).
 *
 * Run with: npx tsx scripts/qwen3-omni/e2e-native-sts-test.ts
 *
 * Requires: apps/rust-omni built (pnpm build in apps/rust-omni).
 * Uses test mode (zero weights) so no model checkpoint is needed.
 */

import {
  NativeOmniEngine,
  isNativeOmniAvailable,
} from '../../src/integrations/qwen3-omni/native-engine.js';

const SAMPLE_RATE_IN = 16000;
const SAMPLE_RATE_OUT = 24000;
const DURATION_SEC = 1;

function generateSine16k(durationSec: number, freqHz: number): Float32Array {
  const numSamples = SAMPLE_RATE_IN * durationSec;
  const out = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    out[i] = Math.sin((2 * Math.PI * freqHz * i) / SAMPLE_RATE_IN) * 0.5;
  }
  return out;
}

function assertInRange(arr: Float32Array, min: number, max: number): void {
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v < min || v > max) {
      throw new Error(`Value at index ${i} is ${v}, expected in [${min}, ${max}]`);
    }
  }
}

function main(): void {
  console.log('E2E Native STS: checking ferni-omni availability...');
  if (!isNativeOmniAvailable()) {
    console.error(
      'ferni-omni not available. Build with: cd apps/rust-omni && pnpm build'
    );
    process.exit(1);
  }

  console.log('Creating NativeOmniEngine in test mode (zero weights)...');
  const engine = NativeOmniEngine.create({ testMode: true });
  if (!engine.isReady) {
    console.error('Engine reported not ready.');
    process.exit(1);
  }
  if (engine.sampleRateIn !== SAMPLE_RATE_IN || engine.sampleRateOut !== SAMPLE_RATE_OUT) {
    console.error(
      `Unexpected sample rates: in=${engine.sampleRateIn}, out=${engine.sampleRateOut}`
    );
    process.exit(1);
  }

  const sine = generateSine16k(DURATION_SEC, 440);
  console.log(`Generated ${sine.length} samples (${DURATION_SEC}s at ${SAMPLE_RATE_IN} Hz).`);

  // 1. processAudio
  console.log('Running processAudio...');
  const out = engine.processAudio(sine);
  const expectedOutLen = SAMPLE_RATE_OUT * DURATION_SEC;
  if (!(out instanceof Float32Array)) {
    console.error('Output is not Float32Array');
    process.exit(1);
  }
  if (out.length !== expectedOutLen) {
    console.error(
      `Output length ${out.length}, expected ${expectedOutLen} (${SAMPLE_RATE_OUT} * ${DURATION_SEC})`
    );
    process.exit(1);
  }
  assertInRange(out, -1, 1);
  console.log(`  Output: ${out.length} samples, values in [-1, 1].`);

  // 2. processAudioTimed
  console.log('Running processAudioTimed...');
  const timings = engine.processAudioTimed(sine);
  console.log(
    `  Timings: mel=${timings.melMs}ms encoder=${timings.encoderMs}ms thinker=${timings.thinkerMs}ms talker=${timings.talkerMs}ms code2Wav=${timings.code2WavMs}ms total=${timings.totalMs}ms`
  );

  // 3. processAudioStreaming
  console.log('Running processAudioStreaming...');
  let chunkCount = 0;
  let totalStreamSamples = 0;
  const streamingTimings = engine.processAudioStreaming(sine, (chunk) => {
    chunkCount++;
    if (!(chunk instanceof Float32Array)) {
      throw new Error('Streaming chunk is not Float32Array');
    }
    totalStreamSamples += chunk.length;
    assertInRange(chunk, -1, 1);
  });
  console.log(
    `  Chunks: ${chunkCount}, total samples: ${totalStreamSamples}, totalMs=${streamingTimings.totalMs}ms`
  );
  if (totalStreamSamples !== expectedOutLen) {
    console.error(
      `Streaming total samples ${totalStreamSamples}, expected ${expectedOutLen}`
    );
    process.exit(1);
  }

  console.log('E2E Native STS: all checks passed.');
}

main();
