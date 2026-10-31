/**
 * A call's batch prosody analyzer registers a native processor (in Rust, keyed
 * by session id) on its first frame. Ending the call (session-cleanup.ts runs
 * resetSessionAudioProsodyAnalyzer) only reset it, so every call's processor
 * stayed: in a harness, 200 calls left 200 processors and ~375 MB more RSS,
 * with the JS heap flat. These tests end calls and count what is left.
 */
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, describe, expect, it, vi } from 'vitest';

const registry = vi.hoisted(() => new Map<string, number>());

vi.mock('../native-analyzer.js', async (orig) => {
  const real = await orig<typeof import('../native-analyzer.js')>();
  if (process.env.PROSODY_REAL_NATIVE === '1') return real;
  return {
    ...real,
    isNativeAudioAvailable: () => true,
    getOrCreateNativeProcessor: (id: string, rate: number) => {
      if (registry.has(id)) return false;
      registry.set(id, rate);
      return true;
    },
    processNativeFrame: () => null,
    resetNativeProcessor: (id: string) => registry.has(id),
    removeNativeProcessor: (id: string) => registry.delete(id),
    getActiveNativeProcessorCount: () => registry.size,
    convertI16ToF32: (x: Int16Array) => Float32Array.from(x, (v) => v / 32768),
  };
});

const frame = (): AudioFrame => new AudioFrame(new Int16Array(480).fill(1000), 48000, 1, 480);

/** N calls: each gets its analyzer, hears a second of audio, and ends as session-cleanup ends it. */
async function runCalls(n: number, tag: string): Promise<number> {
  const { getSessionAudioProsodyAnalyzer, resetSessionAudioProsodyAnalyzer } =
    await import('../session-management.js');
  const { getActiveNativeProcessorCount } = await import('../native-analyzer.js');
  const start = getActiveNativeProcessorCount();
  for (let c = 0; c < n; c++) {
    const sessionId = `${tag}-${c}`;
    const analyzer = getSessionAudioProsodyAnalyzer(sessionId);
    for (let f = 0; f < 100; f++) analyzer.processAudioFrame(frame());
    resetSessionAudioProsodyAnalyzer(sessionId);
  }
  return getActiveNativeProcessorCount() - start;
}

describe('batch prosody analyzer: a call frees its native processor', () => {
  afterEach(() => {
    registry.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('a live call holds one processor; ending it removes it', async () => {
    const { getSessionAudioProsodyAnalyzer, resetSessionAudioProsodyAnalyzer } =
      await import('../session-management.js');
    getSessionAudioProsodyAnalyzer('live-call').processAudioFrame(frame());
    expect([...registry.keys()]).toEqual(['live-call']);
    resetSessionAudioProsodyAnalyzer('live-call');
    expect(registry.size).toBe(0);
  });

  it('25 ended calls leave no processor behind', async () => {
    expect(await runCalls(25, 'ended-call')).toBe(0);
  });

  it('with the real Rust module (when built for this machine)', async () => {
    vi.stubEnv('PROSODY_REAL_NATIVE', '1');
    const { isNativeAudioAvailable } = await import('../native-analyzer.js');
    if (!isNativeAudioAvailable()) return; // CI has no native build; the fake above covers it
    expect(await runCalls(25, 'real-native-call')).toBe(0);
  });
});
