/**
 * Stage 2 reply audio (opening breath/sigh + tempo) with a fake native
 * module, plus the off-path contract: applyPostTTSEnhancement with Stage 2
 * off produces the same bytes as with the Stage 2 module stubbed out
 * (pre-Stage-2 behavior).
 */
import { AudioFrame } from '@livekit/rtc-node';
import { createRequire } from 'node:module';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearReplyAudioPlan,
  setReplyAudioPlan,
  takeReplyAudioPlan,
} from '../../../../speech/reply-audio-plan.js';
import { applyPostTTSEnhancement } from '../post-tts-transform.js';
import {
  BREATH_TO_SPEECH_GAP_MS,
  TEMPO_FAILOVER_FADE_MS,
  applyReplyAudioStage,
  createReplyAudioStage,
  isReplyAudioLeadFrame,
  type ReplyAudioNative,
} from '../reply-audio-stage.js';

const SID = 'stage2-test';

function hasNativeTempo(): boolean {
  try {
    const m = createRequire(import.meta.url)('@ferni/audio') as Record<string, unknown>;
    return typeof m.NativeTempoStretcher === 'function';
  } catch {
    return false;
  }
}
const TURN = 4;

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
  gates = LIVE,
  turn = TURN
): Promise<AudioFrame[]> {
  return collect(
    streamOf(frames).pipeThrough(createReplyAudioStage({ sessionId: SID, turn, native, gates }))
  );
}

/** Resolves with the value, or 'timeout' if the read doesn't settle in `ms`. */
async function readWithin<T>(p: Promise<T>, ms = 200): Promise<T | 'timeout'> {
  return Promise.race([
    p,
    new Promise<'timeout'>((r) => {
      setTimeout(() => r('timeout'), ms);
    }),
  ]);
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
    expect(await applyReplyAudioStage(s, SID, TURN)).toBe(s);
  });

  it('gates live but no plan: the same frames pass through untouched', async () => {
    const input = toneFrames(10);
    const out = await runStage(input, fakeNative());
    expect(out).toHaveLength(input.length);
    out.forEach((f, i) => expect(f).toBe(input[i]));
  });

  it('prepends a breath, then 60 ms of silence, before the first speech frame', async () => {
    const calls: string[] = [];
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'breath', intensity: 0.7 } });
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
    expect(takeReplyAudioPlan(SID, TURN)).toBeUndefined(); // consumed
  });

  it('a sigh runs straight into speech (no gap), at the configured output rate', async () => {
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'sigh', intensity: 1, durationMs: 500 } });
    const input = toneFrames(4, 48000, 960);
    const out = await collect(
      streamOf(input).pipeThrough(
        createReplyAudioStage({
          sessionId: SID,
          turn: TURN,
          native: fakeNative(),
          gates: LIVE,
          outputSampleRate: 48000,
        })
      )
    );
    const lead = out.slice(0, out.length - input.length);
    expect(samples(lead).length).toBe(Math.round(0.5 * 48000));
    expect(lead.every((f) => f.sampleRate === 48000)).toBe(true);
    expect(lead.slice(0, -1).every((f) => f.samplesPerChannel === 960)).toBe(true);
  });

  it('the opening plays once: the next reply on the session gets nothing', async () => {
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'breath', intensity: 1 } });
    await runStage(toneFrames(2), fakeNative());
    const second = toneFrames(2);
    const out = await runStage(second, fakeNative());
    expect(out).toEqual(second);
  });

  it('nonverbal gate off: plan opening is ignored (and consumed)', async () => {
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'breath', intensity: 1 } });
    const input = toneFrames(3);
    const out = await runStage(input, fakeNative(), { nonverbal: false, tempo: true });
    expect(out).toEqual(input);
    expect(takeReplyAudioPlan(SID, TURN)).toBeUndefined();
  });

  it('tempo: every sample goes through the stretcher and is re-framed to the input size', async () => {
    const calls: string[] = [];
    setReplyAudioPlan(SID, TURN, { tempo: 1.1 });
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
    setReplyAudioPlan(SID, TURN, { tempo: 1.1 });
    const input = toneFrames(3);
    expect(await runStage(input, fakeNative(calls), { nonverbal: true, tempo: false })).toEqual(
      input
    );
    setReplyAudioPlan(SID, TURN, { tempo: 1 });
    expect(await runStage(input, fakeNative(calls))).toEqual(input);
    expect(calls).toEqual([]);
  });

  it('a render failure never drops speech: no opening, tempo still applies', async () => {
    const native = fakeNative();
    native.renderNonverbal = () => {
      throw new Error('boom');
    };
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'breath', intensity: 1 } });
    const input = toneFrames(4);
    expect(await runStage(input, native)).toEqual(input);
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'breath', intensity: 1 }, tempo: 1.2 });
    const out = await runStage(toneFrames(20), native);
    expect(out.some(isReplyAudioLeadFrame)).toBe(false);
    expect(samples(out).length).toBe(20 * 480 - (20 * 480) / 10);
  });

  it('tempo skips non-mono streams', async () => {
    const calls: string[] = [];
    setReplyAudioPlan(SID, TURN, { tempo: 1.1 });
    const stereo = [new AudioFrame(new Int16Array(960), 24000, 2, 480)];
    expect(await runStage(stereo, fakeNative(calls))).toEqual(stereo);
    expect(calls).toEqual([]);
  });

  // ---- M1: plans are per (session, turn) ----
  it('a plan for turn N never lands on turn N+1', async () => {
    const calls: string[] = [];
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'sigh', intensity: 1 }, tempo: 1.2 });
    const input = toneFrames(5);
    const out = await runStage(input, fakeNative(calls), LIVE, TURN + 1);
    expect(out).toHaveLength(input.length);
    out.forEach((f, i) => expect(f).toBe(input[i]));
    expect(calls).toEqual([]);
    expect(takeReplyAudioPlan(SID, TURN)).toBeUndefined(); // the stale plan was discarded
    // Control: the same plan on its own turn does apply.
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'sigh', intensity: 1 }, tempo: 1.2 });
    await runStage(toneFrames(5), fakeNative(calls), LIVE, TURN);
    expect(calls).toEqual(['render sigh 0 1 24000', 'stretch 24000 1.2']);
  });

  // ---- M2: no shared 'unknown' slot ----
  it('no real session id or no turn: the stream comes back untouched', async () => {
    process.env.SPEECH_STAGE2_NONVERBAL = 'live';
    process.env.SPEECH_STAGE2_TEMPO = 'live';
    setReplyAudioPlan('unknown', TURN, { tempo: 1.1 }); // rejected
    const cases = [
      ['unknown', TURN],
      [undefined, TURN],
      ['', TURN],
      [SID, undefined],
    ] as const;
    const streams = cases.map(() => streamOf(toneFrames(2)));
    const out = await Promise.all(
      cases.map(([sid, t], i) => applyReplyAudioStage(streams[i], sid, t))
    );
    out.forEach((s, i) => expect(s).toBe(streams[i]));
  });

  // ---- M3: the opening covers the TTS wait instead of delaying speech ----
  it('the opening is readable before Cartesia sends any audio', async () => {
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'breath', intensity: 0.7 } });
    const stage = createReplyAudioStage({
      sessionId: SID,
      turn: TURN,
      native: fakeNative(),
      gates: LIVE,
    });
    const reader = stage.readable.getReader();
    // Nothing written yet: the upstream TTS is still waiting on its first byte.
    const first = await readWithin(reader.read());
    expect(first).not.toBe('timeout');
    const f = (first as { value?: AudioFrame }).value as AudioFrame;
    expect(f.sampleRate).toBe(24000);
    expect(f.samplesPerChannel).toBe(480);
    expect(isReplyAudioLeadFrame(f)).toBe(true);
    reader.releaseLock();
  });

  it('lead frames are marked, speech frames are not', async () => {
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'breath', intensity: 1 } });
    const input = toneFrames(3);
    const out = await runStage(input, fakeNative());
    const lead = out.slice(0, out.length - input.length);
    expect(lead.length).toBeGreaterThan(0);
    expect(lead.every(isReplyAudioLeadFrame)).toBe(true);
    expect(out.slice(lead.length).some(isReplyAudioLeadFrame)).toBe(false);
  });

  it('a plan that arrives after TTS start gets its tempo but no opening', async () => {
    const calls: string[] = [];
    const stage = createReplyAudioStage({
      sessionId: SID,
      turn: TURN,
      native: fakeNative(calls),
      gates: LIVE,
    });
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'sigh', intensity: 1 }, tempo: 1.1 });
    const input = toneFrames(20);
    const out = await collect(streamOf(input).pipeThrough(stage));
    expect(calls).toEqual(['stretch 24000 1.1']); // no render
    expect(samples(out).length).toBe(20 * 480 - (20 * 480) / 10);
  });

  it('the opening duration reaching the renderer is capped', async () => {
    const calls: string[] = [];
    setReplyAudioPlan(SID, TURN, { opening: { kind: 'sigh', intensity: 1, durationMs: 3000 } });
    await runStage(toneFrames(1), fakeNative(calls));
    expect(calls).toEqual(['render sigh 1200 1 24000']);
  });

  // ---- LOW: stretcher failure / format change mid-reply ----
  it('stretcher throws mid-reply: no hard jump, rest passes through, stretcher dropped', async () => {
    let processCalls = 0;
    const native = fakeNative();
    const Base = native.NativeTempoStretcher;
    native.NativeTempoStretcher = class {
      private readonly inner: InstanceType<typeof Base>;
      constructor(sr: number, ratio: number) {
        this.inner = new Base(sr, ratio);
      }
      process = (frame: Float32Array): Float32Array => {
        if (++processCalls === 6) throw new Error('boom');
        return this.inner.process(frame);
      };
      flush = (): Float32Array => this.inner.flush();
    };
    setReplyAudioPlan(SID, TURN, { tempo: 1.1 });
    const input = toneFrames(12);
    const out = await runStage(input, native);
    expect(processCalls).toBe(6); // dropped after the failure: logged/handled once
    const all = samples(out);
    // Frames after the failing one pass through unchanged (same objects).
    out.slice(-6).forEach((f, i) => expect(f).toBe(input[6 + i]));
    // The failing frame is faded in from the last stretched sample: no jump
    // bigger than a sample step of the tone itself (~250) at the seam.
    const failedAt = all.length - 7 * 480;
    const maxToneStep = 8000 * ((2 * Math.PI * 150) / 24000) * 1.05;
    expect(Math.abs(all[failedAt] - all[failedAt - 1])).toBeLessThan(maxToneStep);
    const fade = Math.round((TEMPO_FAILOVER_FADE_MS / 1000) * 24000);
    expect(Array.from(all.slice(failedAt + fade, failedAt + 480))).toEqual(
      Array.from(samples([input[5]]).slice(fade))
    );
  });

  it('sample rate changes mid-reply: tempo flushes and turns off, frames pass through', async () => {
    let flushed = 0;
    const native = fakeNative();
    const Base = native.NativeTempoStretcher;
    native.NativeTempoStretcher = class {
      private readonly inner: InstanceType<typeof Base>;
      constructor(sr: number, ratio: number) {
        this.inner = new Base(sr, ratio);
      }
      process = (frame: Float32Array): Float32Array => this.inner.process(frame);
      flush = (): Float32Array => {
        flushed++;
        return this.inner.flush();
      };
    };
    setReplyAudioPlan(SID, TURN, { tempo: 1.1 });
    const odd = toneFrames(2, 48000, 960);
    const out = await runStage([...toneFrames(5), ...odd], native);
    expect(flushed).toBe(1);
    expect(out.slice(-2)).toEqual(odd);
    expect(out.slice(-2)[0]).toBe(odd[0]);
    // 5 frames stretched (1 in 10 dropped) then flushed in full, before the 48 kHz frames.
    expect(samples(out.slice(0, -2)).length).toBe(5 * 480 - (5 * 480) / 10);
  });
});

describe('applyPostTTSEnhancement with Stage 2 off == Stage 2 module stubbed out', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
    vi.doUnmock('../reply-audio-stage.js');
    vi.resetModules();
  });

  /** The transform's TPDF dither uses Math.random; replay the same sequence per run. */
  function seedRandom(): void {
    let x = 12345;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      return x / 2 ** 32;
    });
  }

  /** Bytes out of a freshly imported applyPostTTSEnhancement (seeded dither). */
  async function run(config: object, turn?: number): Promise<Int16Array> {
    const mod = await import('../post-tts-transform.js');
    seedRandom();
    const out = samples(
      await collect(await mod.applyPostTTSEnhancement(streamOf(toneFrames(25)), config, turn))
    );
    vi.restoreAllMocks();
    return out;
  }

  /** Pre-Stage-2 behavior: the same function with the Stage 2 module replaced by identity. */
  async function runStubbed(config: object): Promise<Int16Array> {
    vi.resetModules();
    let stubCalls = 0;
    vi.doMock('../reply-audio-stage.js', () => ({
      applyReplyAudioStage: async (s: unknown) => (stubCalls++, s),
    }));
    const out = await run(config);
    expect(stubCalls).toBe(1); // the stub, not the real stage, produced `before`
    vi.doUnmock('../reply-audio-stage.js');
    vi.resetModules();
    return out;
  }

  it.each([
    ['gates unset', {}],
    ['gates off', { SPEECH_STAGE2_NONVERBAL: 'off', SPEECH_STAGE2_TEMPO: 'off' }],
    ['gates live, no plan', { SPEECH_STAGE2_NONVERBAL: 'live', SPEECH_STAGE2_TEMPO: 'live' }],
  ])('%s', async (_name, env) => {
    delete process.env.SPEECH_STAGE2_NONVERBAL;
    delete process.env.SPEECH_STAGE2_TEMPO;
    Object.assign(process.env, env);
    const config = { sessionId: SID, sampleRate: 24000 };
    const before = await runStubbed(config);
    const plan = await import('../../../../speech/reply-audio-plan.js');
    plan.clearReplyAudioPlan(SID);
    const now = await run(config, TURN);
    expect(now.length).toBe(before.length);
    expect(Buffer.from(now.buffer).equals(Buffer.from(before.buffer))).toBe(true);
  });

  // Needs the real binary (Stage 2 is a no-op without it, by design).
  it.skipIf(!hasNativeTempo())(
    'the comparison is not vacuous: gates live + a plan for this turn changes the bytes',
    async () => {
      const config = { sessionId: SID, sampleRate: 24000 };
      const before = await runStubbed(config);
      process.env.SPEECH_STAGE2_TEMPO = 'live';
      const plan = await import('../../../../speech/reply-audio-plan.js');
      plan.setReplyAudioPlan(SID, TURN, { tempo: 1.2 });
      const now = await run(config, TURN);
      expect(now.length).toBeLessThan(before.length * 0.9);
    }
  );

  it('enhancement disabled + Stage 2 off: the input stream itself comes back', async () => {
    delete process.env.SPEECH_STAGE2_NONVERBAL;
    delete process.env.SPEECH_STAGE2_TEMPO;
    process.env.POST_TTS_ENHANCEMENT_ENABLED = 'false';
    const s = streamOf(toneFrames(3));
    expect(await applyPostTTSEnhancement(s, { sessionId: SID }, TURN)).toBe(s);
  });
});
