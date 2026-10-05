/**
 * The post-TTS chain as it runs on live calls, with real audio frames through
 * the native (Rust) processor: the betterThanHuman preset plus env overrides,
 * 20 ms frames of 24 kHz mono, exactly as tts-wrapper.ts applies it.
 *
 * The other post-TTS tests check configuration; none pushed a frame through
 * the native chain, and its Rust tests did not run in CI. In CI the native
 * module must load (ci.yml builds it first); locally the test is skipped when
 * it has not been built.
 */

import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPostTTSEnhancement,
  PostTTSPresets,
  postTtsEnvOverrides,
} from '../post-tts-transform.js';

const RATE = 24000;
const FRAME = 480; // 20 ms

type Native = {
  NativePostTtsProcessor?: { prototype: { processFrame: (...a: unknown[]) => unknown } };
};
async function loadNative(): Promise<Native | null> {
  try {
    const m = (await import('@ferni/audio')) as unknown as Native;
    return typeof m.NativePostTtsProcessor === 'function' ? m : null;
  } catch {
    return null;
  }
}
const native = await loadNative();
if (!native && process.env.CI)
  throw new Error('@ferni/audio must load in CI: the live chain test would not run');

/** 3 s of speech-like sound: a voiced tone with harmonics, syllable envelope, a little noise. */
function speechLike(seconds = 3): Int16Array {
  const n = RATE * seconds;
  const out = new Int16Array(n);
  let seed = 7;
  const noise = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f0 = 140 + 20 * Math.sin(2 * Math.PI * 0.7 * t);
    const voiced =
      Math.sin(2 * Math.PI * f0 * t) +
      0.5 * Math.sin(4 * Math.PI * f0 * t) +
      0.25 * Math.sin(6 * Math.PI * f0 * t);
    const syllables = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t); // ~4 syllables/s
    out[i] = Math.round(9000 * syllables * (0.6 * voiced + 0.02 * noise()));
  }
  return out;
}

async function runChain(samples: Int16Array, frameRate = RATE): Promise<AudioFrame[]> {
  const frames: AudioFrame[] = [];
  const size = Math.round((FRAME * frameRate) / RATE);
  for (let i = 0; i + size <= samples.length; i += size) {
    const chunk = samples.slice(i, i + size);
    frames.push(new AudioFrame(chunk, frameRate, 1, chunk.length));
  }
  const input = new ReadableStream<AudioFrame>({
    start(c) {
      for (const f of frames) c.enqueue(f);
      c.close();
    },
  });
  const config = {
    ...PostTTSPresets.betterThanHuman,
    ...postTtsEnvOverrides(),
    sessionId: 'live-chain-test',
    personaId: 'ferni',
  };
  const out = await applyPostTTSEnhancement(input as never, config);
  const got: AudioFrame[] = [];
  for await (const f of out as unknown as AsyncIterable<AudioFrame>) got.push(f);
  return got;
}

const concat = (frames: AudioFrame[]): Int16Array => {
  const all = new Int16Array(frames.reduce((a, f) => a + f.samplesPerChannel, 0));
  let o = 0;
  for (const f of frames) {
    all.set(new Int16Array(f.data.buffer, f.data.byteOffset, f.samplesPerChannel), o);
    o += f.samplesPerChannel;
  }
  return all;
};
const rms = (x: Int16Array): number => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

describe.runIf(native)('post-TTS live chain (native)', () => {
  // The chain is opt-in (postTtsChainEnabled); these tests are about the chain itself.
  beforeEach(() => vi.stubEnv('POST_TTS_ENHANCEMENT_ENABLED', 'true'));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('runs every frame through the native processor, same count and format out', async () => {
    const spy = vi.spyOn(native!.NativePostTtsProcessor!.prototype, 'processFrame');
    const input = speechLike();
    const out = await runChain(input);
    expect(out).toHaveLength(input.length / FRAME);
    expect(spy).toHaveBeenCalledTimes(input.length / FRAME);
    for (const f of out) {
      expect(f.sampleRate).toBe(RATE);
      expect(f.channels).toBe(1);
      expect(f.samplesPerChannel).toBe(FRAME);
    }
  });

  it('adds no clicks at frame boundaries, no clipping, and keeps the level', async () => {
    const input = speechLike();
    const out = concat(await runChain(input));
    const jumps: number[] = [];
    let boundaryMax = 0;
    for (let i = 1; i < out.length; i++) {
      const j = Math.abs(out[i] - out[i - 1]);
      if (i % FRAME === 0) boundaryMax = Math.max(boundaryMax, j);
      else jumps.push(j);
    }
    jumps.sort((a, b) => a - b);
    const p999 = jumps[Math.floor(jumps.length * 0.999)];
    expect(boundaryMax).toBeLessThanOrEqual(p999 * 1.5);
    expect(out.filter((v) => Math.abs(v) >= 32767).length).toBe(0);
    const gainDb = 20 * Math.log10(rms(out) / rms(input));
    expect(Math.abs(gainDb)).toBeLessThan(6);
  });

  it('passes a stream in another format through untouched', async () => {
    const input = speechLike(1);
    const at48k = new Int16Array(input.length * 2).map((_, i) => input[i >> 1]);
    const out = await runChain(at48k, 48000);
    expect(concat(out)).toEqual(at48k.slice(0, concat(out).length));
    expect(out.every((f) => f.sampleRate === 48000)).toBe(true);
  });
});

describe('postTtsEnvOverrides', () => {
  it('applies only the switches that are set, over the preset', () => {
    expect(postTtsEnvOverrides({})).toEqual({});
    expect(
      postTtsEnvOverrides({
        POST_TTS_JITTER: 'true',
        POST_TTS_WARMTH: 'false',
        POST_TTS_BREATH: 'maybe',
      })
    ).toEqual({
      enableJitter: true,
      enableWarmth: false,
    });
    const live = {
      ...PostTTSPresets.betterThanHuman,
      ...postTtsEnvOverrides({ POST_TTS_JITTER: '1' }),
    };
    expect(live.enableJitter).toBe(true);
    expect(live.enableWarmth).toBe(true); // preset value kept when unset
  });
});
