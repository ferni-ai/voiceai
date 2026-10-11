/**
 * An offline phone line for listening tests: what a caller hears of 24 kHz
 * agent audio after LiveKit SIP transcodes it to 8 kHz G.711 mu-law.
 *
 * 1. resample 24 -> 8 kHz: windowed-sinc low-pass at 3.8 kHz (a resampler
 *    keeps up to just under Nyquist), then every third sample;
 * 2. mu-law encode and decode (G.711, the PCMU the trunk carries);
 * 3. the handset/line high-pass: 2nd-order at 300 Hz.
 *
 * Plus level helpers for a blind test: active speech level and level matching.
 *
 * @module scripts/audio-eval/phone-sim
 */
import { Biquad } from '../../src/agents/shared/performance/phone-voice-dsp.js';

export const PHONE_RATE = 8000;
const TAPS = 127;

/** Low-pass FIR (Blackman-windowed sinc), unity gain at DC. */
function lowpassTaps(cutoffHz: number, rate: number): Float64Array {
  const h = new Float64Array(TAPS);
  const fc = cutoffHz / rate;
  const mid = (TAPS - 1) / 2;
  let sum = 0;
  for (let n = 0; n < TAPS; n++) {
    const k = n - mid;
    const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    const w =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * n) / (TAPS - 1)) +
      0.08 * Math.cos((4 * Math.PI * n) / (TAPS - 1));
    h[n] = sinc * w;
    sum += h[n];
  }
  return h.map((v) => v / sum);
}

/** Resample by an integer factor down to 8 kHz. */
export function downsampleTo8k(x: Float32Array, rate: number): Float32Array {
  const factor = rate / PHONE_RATE;
  if (!Number.isInteger(factor) || factor < 1)
    throw new Error(`rate ${rate} is not a multiple of 8 kHz`);
  if (factor === 1) return x.slice();
  const h = lowpassTaps(3800, rate);
  const mid = (TAPS - 1) / 2;
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) {
    const c = i * factor;
    let acc = 0;
    for (let n = 0; n < TAPS; n++) {
      const j = c + n - mid;
      if (j >= 0 && j < x.length) acc += h[n] * x[j];
    }
    out[i] = acc;
  }
  return out;
}

const MU_BIAS = 0x84;
const MU_CLIP = 32635;

/** G.711 mu-law encode of a 16-bit sample. */
export function muLawEncode(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, Math.round(sample)));
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  s = Math.min(s, MU_CLIP) + MU_BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function muLawDecode(byte: number): number {
  const u = ~byte & 0xff;
  const exponent = (u >> 4) & 0x07;
  const magnitude = ((((u & 0x0f) << 3) + MU_BIAS) << exponent) - MU_BIAS;
  return u & 0x80 ? -magnitude : magnitude;
}

/** The whole line: 24 kHz float in, 8 kHz float out (what the caller hears). */
export function phoneLine(x: Float32Array, rate: number): Float32Array {
  const narrow = downsampleTo8k(x, rate);
  const line = new Biquad('highpass', PHONE_RATE, 300, Math.SQRT1_2);
  return narrow.map((v) => line.step(muLawDecode(muLawEncode(v * 32768)) / 32768));
}

/**
 * Active speech level (dBFS): RMS over 20 ms blocks within 30 dB of the
 * loudest block, so pauses don't count (a simple stand-in for ITU-T P.56).
 */
export function activeLevelDb(x: Float32Array, rate: number): number {
  const n = Math.round(rate / 50);
  const blocks: number[] = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += x[j] * x[j];
    blocks.push(s / n);
  }
  const loudest = Math.max(...blocks, 1e-12);
  const active = blocks.filter((p) => p >= loudest / 1000);
  const mean = active.reduce((a, p) => a + p, 0) / Math.max(active.length, 1);
  return 10 * Math.log10(Math.max(mean, 1e-12));
}

/** Scale to an active level, never past -1 dBFS peak. Returns the gain applied (dB). */
export function matchLevel(x: Float32Array, rate: number, targetDb: number): number {
  let peak = 1e-9;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const gainDb = Math.min(targetDb - activeLevelDb(x, rate), -1 - 20 * Math.log10(peak));
  const g = 10 ** (gainDb / 20);
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return gainDb;
}
