import { describe, expect, it } from 'vitest';
import { EchoMixer, Resampler, dbToGain, echoConfigFromEnv } from '../echo-mixer.mjs';

const CHUNK = 480; // converse.mjs: 10 ms at 48 kHz

/** Run the mic for `ms`, the caller silent, and return everything sent. */
function drain(mixer, ms) {
  const out = [];
  for (let i = 0; i < (ms * mixer.rate) / 1000; i += CHUNK)
    out.push(...mixer.mix(new Int16Array(CHUNK)));
  return Int16Array.from(out);
}

const nonZero = (pcm) => [...pcm.keys()].filter((i) => pcm[i] !== 0);

describe('echo delay', () => {
  it('lands an impulse delayMs after it arrived on the mic clock', () => {
    const m = new EchoMixer({ gainDb: 0, delayMs: 120, noiseDb: null });
    m.push('agent', Int16Array.from([10000]), 48000);
    const sent = drain(m, 300);
    expect(nonZero(sent)).toEqual([5760]); // 120 ms at 48 kHz
    expect(sent[5760]).toBe(10000);
  });

  it('counts the delay from when the frame arrives, not from the start of the call', () => {
    const m = new EchoMixer({ gainDb: 0, delayMs: 50, noiseDb: null });
    drain(m, 100); // 4800 samples already sent
    m.push('agent', Int16Array.from([8000]), 48000);
    expect(nonZero(drain(m, 200))).toEqual([2400]); // 50 ms after "now"
  });

  it('keeps later frames of a track contiguous with its first', () => {
    const m = new EchoMixer({ gainDb: 0, delayMs: 20, noiseDb: null });
    m.push('agent', Int16Array.from([1, 2, 3]), 48000);
    drain(m, 10); // the mic moves on before the next frame arrives
    m.push('agent', Int16Array.from([4, 5]), 48000);
    const sent = drain(m, 50);
    // 20 ms = 960 samples, 480 of them sent before this drain
    expect([...sent.subarray(480, 485)]).toEqual([1, 2, 3, 4, 5]);
  });
  it('re-applies the delay when a track resumes after a gap in its frames', () => {
    const m = new EchoMixer({ gainDb: 0, delayMs: 50, noiseDb: null });
    m.push('agent', Int16Array.from([1]), 48000);
    drain(m, 500); // no frames for 500 ms
    m.push('agent', Int16Array.from([9000]), 48000);
    expect(nonZero(drain(m, 100))).toEqual([2400]);
    expect(m.stats.reanchors).toBe(1);
  });
});

describe('echo gain', () => {
  it('attenuates by gainDb (-18 dB is x0.1259)', () => {
    const m = new EchoMixer({ gainDb: -18, delayMs: 0, noiseDb: null });
    m.push('agent', new Int16Array(CHUNK).fill(10000), 48000);
    const sent = drain(m, 10);
    expect(dbToGain(-18)).toBeCloseTo(0.12589, 5);
    expect(sent[0]).toBe(1259);
    expect(sent[CHUNK - 1]).toBe(1259);
  });

  it('adds echo to the caller and clips at int16', () => {
    const m = new EchoMixer({ gainDb: 0, delayMs: 0, noiseDb: null });
    m.push('agent', new Int16Array(CHUNK).fill(20000), 48000);
    const caller = new Int16Array(CHUNK).fill(1000);
    caller[1] = 20000;
    caller[2] = -30000;
    const sent = m.mix(caller);
    expect([sent[0], sent[1], sent[2]]).toEqual([21000, 32767, -10000]);
  });

  it('sums two agent tracks (reply voice and a background clip)', () => {
    const m = new EchoMixer({ gainDb: -6, delayMs: 0, noiseDb: null });
    m.push('voice', new Int16Array(CHUNK).fill(4000), 48000);
    m.push('clip', new Int16Array(CHUNK).fill(2000), 48000);
    expect(m.mix(new Int16Array(CHUNK))[10]).toBe(Math.round(6000 * dbToGain(-6)));
  });
});

describe('sample rates and frame boundaries', () => {
  it('upsamples 24 kHz agent audio to the 48 kHz mic by interpolation', () => {
    const rs = new Resampler(24000, 48000);
    // the last input sample is held until the next frame shows where it goes
    expect([...rs.push(Int16Array.from([0, 100, 200, 300]))]).toEqual([
      0, 50, 100, 150, 200, 250, 300,
    ]);
    expect([...rs.push(Int16Array.from([500]))]).toEqual([400, 500]);
  });

  it('passes same-rate audio through unchanged', () => {
    const rs = new Resampler(48000, 48000);
    expect([...rs.push(Int16Array.from([7, -7, 9]))]).toEqual([7, -7, 9]);
  });

  it('gives the same output however the input is split into frames', () => {
    const x = Int16Array.from({ length: 1000 }, (_, i) => Math.round(8000 * Math.sin(i / 7)));
    const whole = new Resampler(24000, 48000).push(x);
    const rs = new Resampler(24000, 48000);
    const parts = [];
    for (const [a, b] of [
      [0, 7],
      [7, 247],
      [247, 248],
      [248, 1000],
    ])
      parts.push(...rs.push(x.subarray(a, b)));
    expect(parts).toEqual([...whole]);
    expect(whole.length).toBe(1999);
  });

  it('places 24 kHz echo at twice the sample index on the 48 kHz mic', () => {
    const m = new EchoMixer({ gainDb: 0, delayMs: 10, noiseDb: null });
    m.push('agent', Int16Array.from([0, 1000, 0, 0]), 24000);
    const sent = drain(m, 30);
    // 10 ms = 480; the 24 kHz sample 1 is the 48 kHz sample 2, with half-way ramps
    expect([...sent.subarray(480, 486)]).toEqual([0, 500, 1000, 500, 0, 0]);
  });
});

describe('room noise', () => {
  const rms = (pcm) => Math.sqrt(pcm.reduce((a, s) => a + s * s, 0) / pcm.length);

  it('adds noise at noiseDb RMS, also in the stretches with no echo', () => {
    const sent = drain(new EchoMixer({ gainDb: -18, delayMs: 120, noiseDb: -40 }), 1000);
    expect(rms(sent) / 32767).toBeGreaterThan(dbToGain(-40) * 0.95);
    expect(rms(sent) / 32767).toBeLessThan(dbToGain(-40) * 1.05);
  });

  it('is silent with no noise and no echo, and repeatable for a seed', () => {
    expect(nonZero(drain(new EchoMixer({ gainDb: 0, delayMs: 0, noiseDb: null }), 100))).toEqual(
      []
    );
    const a = drain(new EchoMixer({ gainDb: 0, delayMs: 0, noiseDb: -30 }, { seed: 7 }), 20);
    const b = drain(new EchoMixer({ gainDb: 0, delayMs: 0, noiseDb: -30 }, { seed: 7 }), 20);
    expect([...a]).toEqual([...b]);
  });
});

describe('echoConfigFromEnv', () => {
  it('is off unless asked for', () => {
    expect(echoConfigFromEnv({})).toBeNull();
    expect(echoConfigFromEnv({ EVAL_ECHO_GAIN_DB: '' })).toBeNull();
  });

  it('uses the defaults for EVAL_ECHO=1 and reads each value', () => {
    expect(echoConfigFromEnv({ EVAL_ECHO: '1' })).toEqual({
      gainDb: -18,
      delayMs: 120,
      noiseDb: null,
    });
    expect(echoConfigFromEnv({ EVAL_ECHO_DELAY_MS: '200', EVAL_ECHO_NOISE_DB: '-50' })).toEqual({
      gainDb: -18,
      delayMs: 200,
      noiseDb: -50,
    });
  });

  it('refuses values that are not numbers or out of range', () => {
    expect(() => echoConfigFromEnv({ EVAL_ECHO_GAIN_DB: 'loud' })).toThrow(/not a number/);
    expect(() => echoConfigFromEnv({ EVAL_ECHO_DELAY_MS: '-5' })).toThrow(/0\.\.2000/);
  });
});
