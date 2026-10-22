import { AudioFrame } from '@livekit/rtc-node';
import { describe, expect, it } from 'vitest';
import { GateV0 } from '../gate-v0.js';
import { RefRing } from '../reference-tap.js';

const RATE = 16_000;
const HOP = 160;
const T0 = 10_000; // media ms of the first hop
const ECHO_LAG_MS = 120;
const ECHO_GAIN = Math.pow(10, -18 / 20);
const NOISE_RMS = 32768 * 0.001; // -60 dBFS

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Speech-like reference: noise bursts of 120-400 ms with smooth envelopes, gaps 60-300 ms. */
function speechLike(
  totalMs: number,
  seed: number,
  gaps: Array<[number, number]> = []
): Float32Array {
  const rand = rng(seed);
  const out = new Float32Array((totalMs * RATE) / 1000);
  let i = 0;
  while (i < out.length) {
    const burst = Math.floor(((120 + rand() * 280) * RATE) / 1000);
    const amp = 3000 + rand() * 6000;
    for (let k = 0; k < burst && i + k < out.length; k++) {
      const env = Math.sin((Math.PI * k) / burst);
      out[i + k] = (rand() * 2 - 1) * amp * env;
    }
    i += burst + Math.floor(((60 + rand() * 240) * RATE) / 1000);
  }
  for (const [from, to] of gaps) out.fill(0, (from * RATE) / 1000, (to * RATE) / 1000);
  return out;
}

function burst(totalMs: number, fromMs: number, toMs: number, amp: number, seed: number) {
  const rand = rng(seed);
  const out = new Float32Array((totalMs * RATE) / 1000);
  for (let i = (fromMs * RATE) / 1000; i < (toMs * RATE) / 1000; i++)
    out[i] = (rand() * 2 - 1) * amp;
  return out;
}

/**
 * Plays `ref` through the tap's ring (written 200 ms ahead, like a queued reply)
 * and feeds the mic: echo of ref at the lag, plus noise, plus `caller`. Returns
 * p per hop (the gate's last-hop value via its window).
 */
function run(ref: Float32Array, opts: { caller?: Float32Array; echo?: boolean } = {}) {
  const ring = new RefRing();
  const gate = new GateV0(ring);
  const noise = rng(99);
  const lag = (ECHO_LAG_MS * RATE) / 1000;
  const hops = Math.floor(ref.length / HOP);
  const ahead = 20; // hops
  const p: number[] = [];
  const frame = new Int16Array(HOP);
  const write = (h: number) => {
    const d = new Int16Array(HOP);
    for (let k = 0; k < HOP; k++) d[k] = ref[h * HOP + k] ?? 0;
    ring.write(new AudioFrame(d, RATE, 1, HOP), T0 + h * 10);
  };
  for (let h = 0; h < ahead; h++) write(h);
  for (let h = 0; h < hops; h++) {
    if (h + ahead < hops) write(h + ahead);
    for (let k = 0; k < HOP; k++) {
      const i = h * HOP + k;
      const echo = opts.echo === false || i < lag ? 0 : ref[i - lag] * ECHO_GAIN;
      const n = (noise() * 2 - 1) * NOISE_RMS * Math.sqrt(3);
      frame[k] = Math.max(-32768, Math.min(32767, Math.round(echo + n + (opts.caller?.[i] ?? 0))));
    }
    gate.pushMic(frame, T0 + h * 10);
    p.push(gate.lastP());
  }
  return { gate, p };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const hopsOf = (p: number[], fromMs: number, toMs: number) => p.slice(fromMs / 10, toMs / 10);

describe('GateV0', () => {
  it('fails open (p = 1) before the echo lag is locked', () => {
    const { p } = run(speechLike(6000, 1));
    expect(Math.min(...hopsOf(p, 0, 1000))).toBe(1);
  });

  it('locks onto a -18 dB echo delayed 120 ms and scores it as Ferni (low p)', () => {
    const { gate, p } = run(speechLike(6000, 1));
    const w = gate.window();
    expect(w.lagMs).not.toBeNull();
    expect(Math.abs((w.lagMs as number) - ECHO_LAG_MS)).toBeLessThanOrEqual(20);
    expect(w.lockConf).toBeGreaterThan(0.5);
    expect(mean(hopsOf(p, 4000, 6000))).toBeLessThan(0.2);
    expect(w.wouldSuppress).toBe(true);
    expect(w.refActive).toBe(true);
  });

  it('scores a caller burst during a reference gap as genuine (high p)', () => {
    // Ferni silent 4000-4800 ms; the caller talks 4300-4600 ms, past the lag and 150 ms tail.
    const ref = speechLike(6000, 2, [[4000, 4800]]);
    const caller = burst(6000, 4300, 4600, 1000, 7); // ~-33 dBFS, 27 dB over the noise
    const { p } = run(ref, { caller });
    expect(mean(hopsOf(p, 4300, 4600))).toBeGreaterThan(0.8);
    // Without the caller, the same gap is not called genuine.
    const quiet = run(ref).p;
    expect(mean(hopsOf(quiet, 4300, 4600))).toBeLessThan(0.2);
  });

  it('scores double talk (echo plus a caller 10 dB louder) as genuine', () => {
    const ref = speechLike(6000, 3);
    // Echo rms in a burst: ~6000 (amp) x 0.41 (uniform noise, sine envelope) x 0.126 ≈ 310,
    // and its loudest bursts ≈ 650: the caller at 1270 rms is ~12 dB over it on average, 6 at worst.
    const caller = burst(6000, 4000, 5000, 1270 * Math.sqrt(3), 11);
    const { p, gate } = run(ref, { caller });
    expect(gate.window().lagMs).not.toBeNull();
    expect(mean(hopsOf(p, 4000, 5000))).toBeGreaterThan(0.8);
  });

  it('fails open when the reference is silent across the lag window', () => {
    const ref = speechLike(6000, 4, [[3500, 6000]]);
    const { p } = run(ref);
    expect(Math.min(...hopsOf(p, 4600, 6000))).toBe(1);
  });

  it('costs well under 200 µs per 10 ms hop (p99)', () => {
    const ref = speechLike(20_000, 5);
    const ring = new RefRing();
    const gate = new GateV0(ring);
    const frame = new Int16Array(HOP);
    const times: number[] = [];
    for (let h = 0; h < ref.length / HOP; h++) {
      const d = ref.subarray(h * HOP, h * HOP + HOP);
      for (let k = 0; k < HOP; k++) frame[k] = d[k];
      ring.write(new AudioFrame(frame, RATE, 1, HOP), T0 + h * 10);
      const t = process.hrtime.bigint();
      gate.pushMic(frame, T0 + h * 10);
      times.push(Number(process.hrtime.bigint() - t) / 1000);
    }
    const steady = times.slice(200).sort((a, b) => a - b); // after JIT warm-up
    const p50 = steady[Math.floor(steady.length * 0.5)];
    const p99 = steady[Math.floor(steady.length * 0.99)];
    console.info(`SELF_VOICE_GATE hop cost: p50 ${p50.toFixed(1)} µs, p99 ${p99.toFixed(1)} µs`);
    expect(gate.window().lagMs).toBe(0); // the mic was the reference itself: lag 0
    expect(p99).toBeLessThan(200);
  });
});
