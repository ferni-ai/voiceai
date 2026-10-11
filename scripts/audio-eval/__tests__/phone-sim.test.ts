import { describe, expect, it } from 'vitest';

import {
  activeLevelDb,
  downsampleTo8k,
  matchLevel,
  muLawDecode,
  muLawEncode,
  PHONE_RATE,
  phoneLine,
} from '../phone-sim.js';

const SR = 24000;
const sine = (hz: number, amp: number, rate = SR, seconds = 0.5): Float32Array =>
  Float32Array.from(
    { length: rate * seconds },
    (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate)
  );
const rms = (x: Float32Array, from = 0): number => {
  let s = 0;
  for (let i = from; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / (x.length - from));
};
const db = (v: number): number => 20 * Math.log10(v);

describe('G.711 mu-law', () => {
  it('matches the reference code points', () => {
    expect(muLawEncode(0)).toBe(0xff);
    expect(muLawEncode(32767)).toBe(0x80);
    expect(muLawEncode(-32768)).toBe(0x00);
    expect(muLawDecode(0xff)).toBe(0);
    expect(muLawDecode(0x80)).toBe(32124);
    expect(muLawDecode(0x00)).toBe(-32124);
  });

  it('round-trips with the codec step: fine when quiet, coarse when loud', () => {
    for (const v of [5, -40, 300, -1000, 8000, -20000]) {
      const err = Math.abs(muLawDecode(muLawEncode(v)) - v);
      expect(err).toBeLessThanOrEqual(Math.max(4, Math.abs(v) / 16));
    }
    // 8 kHz-quiet sounds lose relatively more than loud ones (what the phone profile fights).
    const rel = (v: number): number => Math.abs(muLawDecode(muLawEncode(v)) - v) / v;
    expect(rel(8000)).toBeLessThan(0.04);
  });
});

describe('the phone line', () => {
  it('downsamples 24 -> 8 kHz without folding 5 kHz back into the band', () => {
    const pass = downsampleTo8k(sine(1000, 0.5), SR);
    const alias = downsampleTo8k(sine(5000, 0.5), SR);
    expect(pass.length).toBe((SR * 0.5) / 3);
    expect(Math.abs(db(rms(pass, 200) / 0.3536))).toBeLessThan(0.5);
    expect(db(rms(alias, 200) / 0.3536)).toBeLessThan(-40);
  });

  it('rejects rates that are not a multiple of 8 kHz', () => {
    expect(() => downsampleTo8k(new Float32Array(10), 22050)).toThrow();
  });

  it('goes through mu-law: a sound below its first step is lost', () => {
    const whisper = sine(1000, 3 / 32768); // under half of mu-law's smallest step (8)
    expect(rms(phoneLine(whisper, SR), 800)).toBe(0);
    expect(rms(phoneLine(sine(1000, 40 / 32768), SR), 800)).toBeGreaterThan(0);
  });

  it('cuts the low end like a handset and keeps speech-band tones', () => {
    const low = phoneLine(sine(100, 0.3), SR);
    const mid = phoneLine(sine(1000, 0.3), SR);
    expect(db(rms(low, 800) / rms(mid, 800))).toBeLessThan(-12);
  });
});

describe('level matching', () => {
  it('sets the active level and ignores pauses', () => {
    const x = new Float32Array(PHONE_RATE);
    x.set(sine(500, 0.05, PHONE_RATE, 0.5)); // half speech, half silence
    const before = activeLevelDb(x, PHONE_RATE);
    expect(before).toBeCloseTo(db(0.05 / Math.SQRT2), 0);
    matchLevel(x, PHONE_RATE, -24);
    expect(activeLevelDb(x, PHONE_RATE)).toBeCloseTo(-24, 1);
  });

  it('never pushes a peak past -1 dBFS', () => {
    const x = sine(500, 0.5, PHONE_RATE);
    x[100] = 0.99; // a spike well above the speech
    expect(matchLevel(x, PHONE_RATE, -3)).toBeLessThan(0); // the spike caps the gain
    expect(Math.max(...Array.from(x, Math.abs))).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
  });
});
