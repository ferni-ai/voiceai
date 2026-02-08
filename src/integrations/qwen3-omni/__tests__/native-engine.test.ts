/**
 * Unit tests for NativeOmniEngine (ferni-omni NAPI wrapper).
 *
 * When ferni-omni is not built, tests that require the native module are skipped.
 */

import { describe, it, expect } from 'vitest';
import {
  NativeOmniEngine,
  isNativeOmniAvailable,
} from '../native-engine.js';

describe('NativeOmniEngine', () => {
  it('isNativeOmniAvailable returns boolean', () => {
    const available = isNativeOmniAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('int16ToFloat32 converts and clamps to [-1, 1]', () => {
    const i16 = new Int16Array([0, 32767, -32768, 16384]);
    const f32 = NativeOmniEngine.int16ToFloat32(i16);
    expect(f32).toBeInstanceOf(Float32Array);
    expect(f32.length).toBe(4);
    expect(f32[0]).toBe(0);
    expect(Math.abs(f32[1] - 32767 / 32768)).toBeLessThan(1e-6);
    expect(Math.abs(f32[2] - (-32768 / 32768))).toBeLessThan(1e-6);
  });

  it('float32ToInt16 converts and clamps', () => {
    const f32 = new Float32Array([0, 1, -1, 0.5]);
    const i16 = NativeOmniEngine.float32ToInt16(f32);
    expect(i16).toBeInstanceOf(Int16Array);
    expect(i16.length).toBe(4);
    expect(i16[0]).toBe(0);
    expect(i16[1]).toBe(32767);
    expect(i16[2]).toBe(-32768);
    expect(i16[3]).toBeGreaterThan(0);
    expect(i16[3]).toBeLessThanOrEqual(32767);
  });

  it('create with testMode throws when native module not available', () => {
    if (isNativeOmniAvailable()) {
      return;
    }
    expect(() => NativeOmniEngine.create({ testMode: true })).toThrow(
      /ferni-omni native addon not available/
    );
  });

  it('create with testMode succeeds and processAudio returns correct shape when native available', () => {
    if (!isNativeOmniAvailable()) {
      return;
    }
    const engine = NativeOmniEngine.create({ testMode: true });
    expect(engine.isReady).toBe(true);
    expect(engine.sampleRateIn).toBe(16000);
    expect(engine.sampleRateOut).toBe(24000);

    const input = new Float32Array(16000);
    for (let i = 0; i < input.length; i++) {
      input[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
    }
    const output = engine.processAudio(input);
    expect(output).toBeInstanceOf(Float32Array);
    expect(output.length).toBe(24000);
    for (let i = 0; i < output.length; i++) {
      expect(output[i]).toBeGreaterThanOrEqual(-1);
      expect(output[i]).toBeLessThanOrEqual(1);
    }
  });

  it('processAudioTimed returns timings when native available', () => {
    if (!isNativeOmniAvailable()) {
      return;
    }
    const engine = NativeOmniEngine.create({ testMode: true });
    const input = new Float32Array(1600);
    const timings = engine.processAudioTimed(input);
    expect(timings).toHaveProperty('totalMs');
    expect(timings).toHaveProperty('melMs');
    expect(timings).toHaveProperty('encoderMs');
    expect(timings).toHaveProperty('thinkerMs');
    expect(timings).toHaveProperty('talkerMs');
    expect(timings).toHaveProperty('code2WavMs');
    expect(typeof timings.totalMs).toBe('number');
  });

  it('processAudioStreaming invokes callback with chunks when native available', () => {
    if (!isNativeOmniAvailable()) {
      return;
    }
    const engine = NativeOmniEngine.create({ testMode: true });
    const input = new Float32Array(1600);
    let chunkCount = 0;
    let totalSamples = 0;
    engine.processAudioStreaming(input, (chunk) => {
      chunkCount++;
      expect(chunk).toBeInstanceOf(Float32Array);
      totalSamples += chunk.length;
    });
    expect(chunkCount).toBeGreaterThan(0);
    expect(totalSamples).toBe(2400);
  });
});
