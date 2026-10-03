import { describe, expect, it } from 'vitest';
import { AudioMixer, type AudioFrame } from '@livekit/rtc-node';
import { pcmToFrames, silence } from '../clip-player.js';

describe('pcmToFrames', () => {
  it('turns 24 kHz clip PCM into 48 kHz mixer frames of the same duration', async () => {
    const samples = new Int16Array(24000 / 2); // 500 ms
    for (let i = 0; i < samples.length; i++) samples[i] = Math.round(8000 * Math.sin(i / 10));
    let out = 0;
    for await (const frame of pcmToFrames(samples.buffer)) {
      expect(frame.sampleRate).toBe(48000);
      expect(frame.channels).toBe(1);
      out += frame.samplesPerChannel;
    }
    expect(Math.abs(out - 24000)).toBeLessThan(480); // within 10 ms of 500 ms at 48 kHz
  });
});

describe('mixer keep-alive', () => {
  const tone = (): ArrayBuffer => {
    const s = new Int16Array(2400); // 100 ms at 24 kHz
    for (let i = 0; i < s.length; i++) s[i] = Math.round(10000 * Math.sin(i / 5));
    return s.buffer;
  };
  const peakOf = (f: AudioFrame): number => Math.max(...Array.from(f.data, (x) => Math.abs(x)));

  async function playTwoClips(keepAlive: boolean): Promise<number> {
    const mixer = new AudioMixer(48000, 1, { blocksize: 4800, capacity: 1, streamTimeoutMs: 500 });
    if (keepAlive) mixer.addStream(silence() as never);
    const out = mixer[Symbol.asyncIterator]();
    mixer.addStream(pcmToFrames(tone()) as never);
    for (let i = 0; i < 4; i++) await out.next(); // first clip plays out
    try {
      mixer.addStream(pcmToFrames(tone()) as never);
    } catch {
      return 0; // the mixer ended with the first clip
    }
    let peak = 0;
    for (let i = 0; i < 4; i++) {
      const r = await out.next();
      if (r.done) break;
      peak = Math.max(peak, peakOf(r.value as AudioFrame));
    }
    await mixer.aclose();
    return peak;
  }

  it('without it, the SDK mixer ends after the first clip', async () => {
    expect(await playTwoClips(false)).toBe(0);
  });

  it('with it, a second clip is heard', async () => {
    expect(await playTwoClips(true)).toBeGreaterThan(5000);
  });
});
