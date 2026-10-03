/**
 * Stage 2 reply audio against the real @ferni/audio binary: renderNonverbal,
 * timeStretch and NativeTempoStretcher, and the stage end to end.
 * Skips only when the native module can't load (e.g. a CI job without the
 * Rust build); locally it must run.
 */
import { AudioFrame } from '@livekit/rtc-node';
import { createRequire } from 'node:module';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it } from 'vitest';

import { clearReplyAudioPlan, setReplyAudioPlan } from '../../../../speech/reply-audio-plan.js';
import {
  BREATH_TO_SPEECH_GAP_MS,
  applyReplyAudioStage,
  createReplyAudioStage,
  type ReplyAudioNative,
} from '../reply-audio-stage.js';

type Native = ReplyAudioNative & {
  timeStretch: (samples: Float32Array, ratio: number, sampleRate: number) => Float32Array;
};

function loadNative(): Native | null {
  try {
    const m = createRequire(import.meta.url)('@ferni/audio') as Partial<Native>;
    return typeof m.renderNonverbal === 'function' && typeof m.NativeTempoStretcher === 'function'
      ? (m as Native)
      : null;
  } catch {
    return null;
  }
}

const native = loadNative();
const SID = 'stage2-native';
const TURN = 1;

function tone(n: number, sr: number, f0 = 150): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let h = 1; h <= 6; h++) s += Math.sin((2 * Math.PI * f0 * h * i) / sr) / h;
    x[i] = 0.3 * s;
  }
  return x;
}

/** F0 by autocorrelation peak (100-400 Hz: excludes the 2T lag of a 150 Hz tone). */
function f0(x: Float32Array, sr: number): number {
  const lo = Math.floor(sr / 400);
  const hi = Math.floor(sr / 100);
  const n = x.length - hi;
  const ac: number[] = [];
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i] * x[i + lag];
    ac.push(s);
  }
  let b = 1;
  for (let i = 1; i < ac.length - 1; i++) if (ac[i] > ac[b]) b = i;
  const shift = (0.5 * (ac[b - 1] - ac[b + 1])) / (ac[b - 1] - 2 * ac[b] + ac[b + 1]);
  return sr / (lo + b + shift);
}

describe.skipIf(!native)('Stage 2 native (@ferni/audio)', () => {
  const n = native as Native;
  afterEach(() => clearReplyAudioPlan(SID));

  it('renderNonverbal: exact length, silent edges, under -12 dBFS, errors on unknown kind', () => {
    for (const [kind, ms] of [
      ['breath', 350],
      ['sigh', 800],
    ] as const) {
      for (const sr of [24000, 48000]) {
        const x = n.renderNonverbal(kind, 0, 1, 7, sr);
        expect(x.length).toBe(Math.round((ms * sr) / 1000));
        expect(Math.abs(x[0])).toBeLessThan(1e-6);
        expect(Math.abs(x[x.length - 1])).toBeLessThan(1e-6);
        const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        expect(peak).toBeLessThanOrEqual(10 ** (-12 / 20));
        expect(peak).toBeGreaterThan(0.1);
      }
    }
    expect(n.renderNonverbal('breath', 420, 0.5, 1, 24000).length).toBe(10080);
    expect(() => n.renderNonverbal('laugh', 0, 1, 1, 24000)).toThrow(/unknown nonverbal kind/);
    expect(() => n.renderNonverbal('breath', 0, 1, 1, 1000)).toThrow(/sample rate/);
  });

  it("renderNonverbal: a sigh's onset follows the speaker f0 (Ferni ~111 Hz)", () => {
    const sr = 24000;
    const plain = n.renderNonverbal('sigh', 0, 1, 7, sr);
    const lester = n.renderNonverbal('sigh', 0, 1, 7, sr, 111);
    expect(lester.length).toBe(plain.length);
    // Onset (4-16%): about 1.25 x 111 Hz, well under the 150-195 Hz default.
    const onset = (x: Float32Array): Float32Array =>
      x.subarray(Math.floor(x.length * 0.04), Math.floor(x.length * 0.16));
    expect(f0(onset(lester), sr)).toBeGreaterThan(118);
    expect(f0(onset(lester), sr)).toBeLessThan(152);
    expect(f0(onset(lester), sr)).toBeLessThan(0.9 * f0(onset(plain), sr));
    // A breath has no pitch: f0 leaves it as it was.
    expect(Array.from(n.renderNonverbal('breath', 0, 1, 7, sr, 111))).toEqual(
      Array.from(n.renderNonverbal('breath', 0, 1, 7, sr))
    );
  });

  it('NativeTempoStretcher: streamed = whole, length tracks ratio, pitch kept', () => {
    const sr = 24000;
    const x = tone(sr * 2, sr);
    for (const ratio of [0.9, 1.1]) {
      const s = new n.NativeTempoStretcher(sr, ratio);
      const parts: Float32Array[] = [];
      for (let i = 0; i < x.length; i += 480) parts.push(s.process(x.subarray(i, i + 480)));
      parts.push(s.flush());
      const streamed = Float32Array.from(parts.flatMap((p) => Array.from(p)));
      const whole = n.timeStretch(x, ratio, sr);
      expect(Array.from(streamed)).toEqual(Array.from(whole));
      expect(Math.abs(streamed.length - x.length / ratio) / (x.length / ratio)).toBeLessThan(0.02);
      const mid = Math.floor(streamed.length / 2);
      const ratioF0 =
        f0(streamed.subarray(mid - 4800, mid + 4800), sr) / f0(x.subarray(9600, 19200), sr);
      expect(Math.abs(ratioF0 - 1)).toBeLessThan(0.02);
    }
    const clamped = new n.NativeTempoStretcher(sr, 9) as unknown as { ratio: number };
    expect(clamped.ratio).toBe(1.25);
  });

  it('applyReplyAudioStage loads the real module when a gate is live', async () => {
    const saved = process.env.SPEECH_STAGE2_NONVERBAL;
    process.env.SPEECH_STAGE2_NONVERBAL = 'live';
    try {
      setReplyAudioPlan(SID, TURN, { opening: { kind: 'sigh', intensity: 0.5 } });
      const frames = [new AudioFrame(new Int16Array(480), 24000, 1, 480)];
      const input = new NodeReadableStream<AudioFrame>({
        start(c) {
          frames.forEach((f) => c.enqueue(f));
          c.close();
        },
      });
      const out: AudioFrame[] = [];
      for await (const f of await applyReplyAudioStage(input, SID, TURN)) out.push(f);
      const total = out.reduce((s, f) => s + f.samplesPerChannel, 0);
      expect(total).toBe(Math.round(0.8 * 24000) + 480); // default 800 ms sigh, no gap
    } finally {
      if (saved === undefined) delete process.env.SPEECH_STAGE2_NONVERBAL;
      else process.env.SPEECH_STAGE2_NONVERBAL = saved;
    }
  });

  it('stage end to end: breath prepended, speech stretched at 0.9', async () => {
    const sr = 24000;
    const speech = tone(sr, sr);
    const frames: AudioFrame[] = [];
    for (let i = 0; i < speech.length; i += 480) {
      const d = new Int16Array(480);
      for (let j = 0; j < 480; j++) d[j] = Math.round(speech[i + j] * 32767);
      frames.push(new AudioFrame(d, sr, 1, 480));
    }
    setReplyAudioPlan(SID, TURN, { tempo: 0.9, opening: { kind: 'breath', intensity: 0.8 } });
    const out: AudioFrame[] = [];
    const stream = new NodeReadableStream<AudioFrame>({
      start(c) {
        frames.forEach((f) => c.enqueue(f));
        c.close();
      },
    }).pipeThrough(
      createReplyAudioStage({
        sessionId: SID,
        turn: TURN,
        native: n,
        gates: { nonverbal: true, tempo: true },
      })
    );
    for await (const f of stream) out.push(f);
    const total = out.reduce((s, f) => s + f.samplesPerChannel, 0);
    const lead = Math.round(0.35 * sr) + Math.round((BREATH_TO_SPEECH_GAP_MS / 1000) * sr);
    expect(Math.abs(total - lead - speech.length / 0.9)).toBeLessThan(0.02 * (speech.length / 0.9));
    expect(out.every((f) => f.sampleRate === sr && f.channels === 1)).toBe(true);
  });
});
