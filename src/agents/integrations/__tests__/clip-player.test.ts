import { describe, expect, it } from 'vitest';
import { AudioMixer, AudioSource, type AudioFrame } from '@livekit/rtc-node';
import { clipTrackPaced, pcmToFrames, silence } from '../clip-player.js';

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

  async function playTwoClips(keepAlive: boolean, paced = false): Promise<number> {
    const mixer = new AudioMixer(48000, 1, { blocksize: 4800, capacity: 1, streamTimeoutMs: 500 });
    if (keepAlive) mixer.addStream(silence(paced) as never);
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

  it('paced, it still keeps the mixer open for the second clip', async () => {
    expect(await playTwoClips(true, true)).toBeGreaterThan(5000);
  });
});

describe('side-track lag (CLIP_TRACK_PACED)', () => {
  it('is off unless CLIP_TRACK_PACED=on', () => {
    expect(clipTrackPaced({})).toBe(false);
    expect(clipTrackPaced({ CLIP_TRACK_PACED: 'on' })).toBe(true);
  });

  /**
   * The BackgroundAudioPlayer pipeline (agents 1.5.1): AudioMixer(48k, block
   * 4800, capacity 1) into AudioSource(48k, 1, 400 ms). Returns how long a clip
   * waits from play() to the wire: until the mixer emits it, plus the audio
   * already queued in the source ahead of it.
   */
  async function clipToWireMs(paced: boolean): Promise<number> {
    const source = new AudioSource(48000, 1, 400);
    const mixer = new AudioMixer(48000, 1, { blocksize: 4800, capacity: 1, streamTimeoutMs: 2000 });
    mixer.addStream(silence(paced) as never);
    let playedAt: number | null = null;
    const lags: number[] = [];
    const pump = (async () => {
      for await (const frame of mixer) {
        if (playedAt !== null && frame.data.some((x) => x !== 0)) {
          lags.push(Date.now() - playedAt + source.queuedDuration);
          playedAt = null;
        }
        await source.captureFrame(frame);
      }
    })();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });
    await sleep(1200); // steady state: the source queue as full as it gets
    for (let i = 0; i < 3; i++) {
      playedAt = Date.now();
      mixer.addStream(pcmToFrames(new Int16Array(2400).fill(8000).buffer) as never);
      await sleep(700);
    }
    await mixer.aclose();
    await pump.catch(() => undefined);
    await source.close();
    lags.sort((a, b) => a - b);
    return lags[1]!;
  }

  it('unpaced, a clip waits behind ~400 ms of queued silence', async () => {
    expect(await clipToWireMs(false)).toBeGreaterThan(550);
  }, 10_000);

  it('paced, it reaches the wire in about a quarter second', async () => {
    expect(await clipToWireMs(true)).toBeLessThan(350);
  }, 10_000);
});

describe('paced silence while a clip plays', () => {
  it('fills the queue during a clip (stall cushion), then drains back for the next clip', async () => {
    const source = new AudioSource(48000, 1, 400);
    const mixer = new AudioMixer(48000, 1, { blocksize: 4800, capacity: 1, streamTimeoutMs: 2000 });
    let busy = false;
    mixer.addStream(silence(true, () => busy) as never);
    let playedAt: number | null = null;
    const lags: number[] = [];
    let peakQueued = 0;
    const pump = (async () => {
      for await (const frame of mixer) {
        if (busy) peakQueued = Math.max(peakQueued, source.queuedDuration);
        if (playedAt !== null && frame.data.some((x) => x !== 0)) {
          lags.push(Date.now() - playedAt + source.queuedDuration);
          playedAt = null;
        }
        await source.captureFrame(frame);
      }
    })();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });
    const play = () => {
      playedAt = Date.now();
      mixer.addStream(pcmToFrames(new Int16Array(12000).fill(8000).buffer) as never); // 500 ms
    };
    await sleep(800);
    busy = true;
    play();
    await sleep(600);
    busy = false;
    await sleep(1500); // the queue drains back to the cushion
    play();
    await sleep(600);
    await mixer.aclose();
    await pump.catch(() => undefined);
    await source.close();
    expect(peakQueued).toBeGreaterThan(250);
    expect(lags[1]!).toBeLessThan(350);
  }, 10_000);
});
