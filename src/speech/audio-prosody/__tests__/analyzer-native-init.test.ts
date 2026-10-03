/**
 * The batch prosody analyzer creates its native processor from the first
 * frame's sample rate (it was fixed at 16 kHz), and USE_NATIVE_AUDIO=false
 * keeps it on the JavaScript path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';

const created: Array<[string, number]> = [];
vi.mock('../native-analyzer.js', async (orig) => ({
  ...(await orig<typeof import('../native-analyzer.js')>()),
  isNativeAudioAvailable: () => true,
  getOrCreateNativeProcessor: (id: string, rate: number) => {
    created.push([id, rate]);
    return true;
  },
  processNativeFrame: () => null,
  convertI16ToF32: (x: Int16Array) => Float32Array.from(x, (v) => v / 32768),
}));

const frame = (rate: number): AudioFrame =>
  new AudioFrame(new Int16Array(rate / 50).fill(1000), rate, 1, rate / 50);

describe('AudioProsodyAnalyzer native processor', () => {
  afterEach(() => {
    created.length = 0;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is created on the first frame, at that frame’s sample rate', async () => {
    const { AudioProsodyAnalyzer } = await import('../analyzer.js');
    const a = new AudioProsodyAnalyzer('rate-test');
    expect(created).toEqual([]);
    a.processAudioFrame(frame(48000));
    a.processAudioFrame(frame(48000));
    expect(created).toEqual([['rate-test', 48000]]);
  });

  it('stays off with USE_NATIVE_AUDIO=false', async () => {
    // vi.resetModules() (afterEach) gives this test fresh, uncached feature flags.
    vi.stubEnv('USE_NATIVE_AUDIO', 'false');
    const { AudioProsodyAnalyzer } = await import('../analyzer.js');
    new AudioProsodyAnalyzer('off-test').processAudioFrame(frame(16000));
    expect(created).toEqual([]);
  });
});
