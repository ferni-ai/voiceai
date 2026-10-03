/**
 * Stage 2 reply audio (opening breath/sigh + tempo) with a fake native
 * module, plus the off-path identity contract against the real post-TTS
 * transform.
 */
import { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearReplyAudioPlan,
  setReplyAudioPlan,
  takeReplyAudioPlan,
} from '../../../../speech/reply-audio-plan.js';
import { applyPostTTSEnhancement, createPostTTSTransform } from '../post-tts-transform.js';
import {
  BREATH_TO_SPEECH_GAP_MS,
  applyReplyAudioStage,
  createReplyAudioStage,
  type ReplyAudioNative,
} from '../reply-audio-stage.js';

const SID = 'stage2-test';

function toneFrames(count: number, sr = 24000, size = 480): AudioFrame[] {
  const frames: AudioFrame[] = [];
  for (let f = 0; f < count; f++) {
    const d = new Int16Array(size);
    for (let i = 0; i < size; i++) {
      d[i] = Math.round(8000 * Math.sin((2 * Math.PI * 150 * (f * size + i)) / sr));
    }
    frames.push(new AudioFrame(d, sr, 1, size));
  }
  return frames;
}

function streamOf(frames: AudioFrame[]): NodeReadableStream<AudioFrame> {
  return new NodeReadableStream<AudioFrame>({
    start(c) {
      for (const f of frames) c.enqueue(f);
      c.close();
    },
  });
}

async function collect(s: NodeReadableStream<AudioFrame>): Promise<AudioFrame[]> {
  const out: AudioFrame[] = [];
  for await (const f of s) out.push(f);
  return out;
}

function samples(frames: AudioFrame[]): Int16Array {
  const total = frames.reduce((n, f) => n + f.samplesPerChannel, 0);
  const out = new Int16Array(total);
  let off = 0;
  for (const f of frames) {
    out.set(new Int16Array(f.data.buffer, f.data.byteOffset, f.samplesPerChannel), off);
    off += f.samplesPerChannel;
  }
  return out;
}

/** Fake native: clip of 0.25s; stretcher drops every 10th sample and holds 100 back. */
function fakeNative(log: string[] = []): ReplyAudioNative {
  return {
    renderNonverbal(kind, durationMs, intensity, seed, sampleRate) {
      log.push(`render ${kind} ${durationMs} ${intensity} ${sampleRate}`);
      if (kind !== 'breath' && kind !== 'sigh') throw new Error('unknown kind');
      const ms = durationMs > 0 ? durationMs : kind === 'breath' ? 350 : 800;
      return new Float32Array(Math.round((ms * sampleRate) / 1000)).fill(0.25);
    },
    NativeTempoStretcher: class {
      private held: number[] = [];
      private n = 0;
      constructor(sr: number, ratio: number) {
        log.push(`stretch ${sr} ${ratio}`);
      }
      process(frame: Float32Array): Float32Array {
        for (const v of frame) if (this.n++ % 10 !== 9) this.held.push(v);
        return Float32Array.from(this.held.splice(0, Math.max(0, this.held.length - 100)));
      }
      flush(): Float32Array {
        return Float32Array.from(this.held.splice(0));
      }
    },
  };
}

const LIVE = { nonverbal: true, tempo: true };

async function runStage(
  frames: AudioFrame[],
  native: ReplyAudioNative,
  gates = LIVE
): Promise<AudioFrame[]> {
  return collect(
    streamOf(frames).pipeThrough(createReplyAudioStage({ sessionId: SID, native, gates }))
  );
}

describe('reply-audio-stage', () => {
  const saved = { ...process.env };
  beforeEach(() => clearReplyAudioPlan(SID));
  afterEach(() => {
    process.env = { ...saved };
    clearReplyAudioPlan(SID);
  });

  it('gates off: returns the same stream, nothing added', async () => {
    delete process.env.SPEECH_STAGE2_NONVERBAL;
    delete process.env.SPEECH_STAGE2_TEMPO;
    const s = streamOf(toneFrames(3));
    expect(await applyReplyAudioStage(s, SID)).toBe(s);
  });

  it('gates live but no plan: the same frames pass through untouched', async () => {
    const input = toneFrames(10);
    const out = await runStage(input, fakeNative());
    expect(out).toHaveLength(input.length);
    out.forEach((f, i) => expect(f).toBe(input[i]));
  });

  it('prepends a breath, then 60 ms of silence, before the first speech frame', async () => {
    const calls: string[] = [];
    setReplyAudioPlan(SID, { opening: { kind: 'breath', intensity: 0.7 } });
    const input = toneFrames(5);
    const out = await runStage(input, fakeNative(calls));
    expect(calls).toEqual(['render breath 0 0.7 24000']);
    const clip = Math.round(0.35 * 24000);
    const gap = Math.round((BREATH_TO_SPEECH_GAP_MS / 1000) * 24000);
    const lead = out.slice(0, out.length - input.length);
    expect(samples(lead).length).toBe(clip + gap);
    const s = samples(lead);
    expect(s[0]).toBe(Math.round(0.25 * 32767));
    expect(s[clip - 1]).toBe(Math.round(0.25 * 32767));
    expect(s.slice(clip).every((v) => v === 0)).toBe(true);
    lead.forEach((f) => expect(f.sampleRate).toBe(24000));
    expect(lead.slice(0, -1).every((f) => f.samplesPerChannel === 480)).toBe(true);
    // Speech is untouched and after the lead (prepended, not mixed).
    out.slice(lead.length).forEach((f, i) => expect(f).toBe(input[i]));
    expect(takeReplyAudioPlan(SID)).toBeUndefined(); // consumed
  });

  it('a sigh runs straight into speech (no gap) and follows the stream sample rate', async () => {
    setReplyAudioPlan(SID, { opening: { kind: 'sigh', intensity: 1, durationMs: 500 } });
    const input = toneFrames(4, 48000, 960);
    const out = await runStage(input, fakeNative());
    const lead = out.slice(0, out.length - input.length);
    expect(samples(lead).length).toBe(Math.round(0.5 * 48000));
    expect(lead.every((f) => f.sampleRate === 48000)).toBe(true);
    expect(lead.slice(0, -1).every((f) => f.samplesPerChannel === 960)).toBe(true);
  });

  it('the opening plays once: the next reply on the session gets nothing', async () => {
    setReplyAudioPlan(SID, { opening: { kind: 'breath', intensity: 1 } });
    await runStage(toneFrames(2), fakeNative());
    const second = toneFrames(2);
    const out = await runStage(second, fakeNative());
    expect(out).toEqual(second);
  });

  it('nonverbal gate off: plan opening is ignored (and consumed)', async () => {
    setReplyAudioPlan(SID, { opening: { kind: 'breath', intensity: 1 } });
    const input = toneFrames(3);
    const out = await runStage(input, fakeNative(), { nonverbal: false, tempo: true });
    expect(out).toEqual(input);
    expect(takeReplyAudioPlan(SID)).toBeUndefined();
  });

  it('tempo: every sample goes through the stretcher and is re-framed to the input size', async () => {
    const calls: string[] = [];
    setReplyAudioPlan(SID, { tempo: 1.1 });
    const input = toneFrames(20);
    const out = await runStage(input, fakeNative(calls));
    expect(calls).toEqual(['stretch 24000 1.1']);
    expect(samples(out).length).toBe(20 * 480 - (20 * 480) / 10); // fake drops 1 in 10
    expect(out.slice(0, -1).every((f) => f.samplesPerChannel === 480)).toBe(true);
    // The held-back tail came out at flush: the last real input sample survives.
    expect(samples(out).at(-1)).toBe(samples(input).at(-2));
  });

  it('tempo gate off or tempo 1: no stretcher', async () => {
    const calls: string[] = [];
    setReplyAudioPlan(SID, { tempo: 1.1 });
    const input = toneFrames(3);
    expect(await runStage(input, fakeNative(calls), { nonverbal: true, tempo: false })).toEqual(
      input
    );
    setReplyAudioPlan(SID, { tempo: 1 });
    expect(await runStage(input, fakeNative(calls))).toEqual(input);
    expect(calls).toEqual([]);
  });

  it('a native failure never drops speech', async () => {
    const native = fakeNative();
    native.renderNonverbal = () => {
      throw new Error('boom');
    };
    setReplyAudioPlan(SID, { opening: { kind: 'breath', intensity: 1 }, tempo: 1.2 });
    const input = toneFrames(4);
    const out = await runStage(input, native);
    expect(out).toEqual(input);
  });

  it('skips non-mono streams', async () => {
    setReplyAudioPlan(SID, { opening: { kind: 'breath', intensity: 1 } });
    const stereo = [new AudioFrame(new Int16Array(960), 24000, 2, 480)];
    expect(await runStage(stereo, fakeNative())).toEqual(stereo);
  });
});

describe('applyPostTTSEnhancement with Stage 2 off is byte-identical to the transform alone', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  /** The transform's TPDF dither uses Math.random; replay the same sequence per run. */
  function seedRandom(): void {
    let x = 12345;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      return x / 2 ** 32;
    });
  }

  it.each([
    ['gates unset', {}],
    ['gates off', { SPEECH_STAGE2_NONVERBAL: 'off', SPEECH_STAGE2_TEMPO: 'off' }],
    ['gates live, no plan', { SPEECH_STAGE2_NONVERBAL: 'live', SPEECH_STAGE2_TEMPO: 'live' }],
  ])('%s', async (_name, env) => {
    delete process.env.SPEECH_STAGE2_NONVERBAL;
    delete process.env.SPEECH_STAGE2_TEMPO;
    Object.assign(process.env, env);
    clearReplyAudioPlan(SID);
    const config = { sessionId: SID, sampleRate: 24000 };
    seedRandom();
    const today = samples(
      await collect(streamOf(toneFrames(25)).pipeThrough(createPostTTSTransform(config)))
    );
    vi.restoreAllMocks();
    seedRandom();
    const glued = samples(
      await collect(await applyPostTTSEnhancement(streamOf(toneFrames(25)), config))
    );
    expect(glued.length).toBe(today.length);
    expect(Buffer.from(glued.buffer).equals(Buffer.from(today.buffer))).toBe(true);
  });

  it('enhancement disabled + Stage 2 off: the input stream itself comes back', async () => {
    delete process.env.SPEECH_STAGE2_NONVERBAL;
    delete process.env.SPEECH_STAGE2_TEMPO;
    process.env.POST_TTS_ENHANCEMENT_ENABLED = 'false';
    const s = streamOf(toneFrames(3));
    expect(await applyPostTTSEnhancement(s, { sessionId: SID })).toBe(s);
  });
});
