/**
 * Telephone voice chain: shape Ferni's TTS for an 8 kHz phone line.
 *
 * A phone call carries 300-3400 Hz and goes through G.711 mu-law, which has
 * coarse steps for quiet sounds. Cartesia masters for full-band listening, so
 * on a phone the low end spends level the line throws away, the consonants
 * that carry intelligibility (1-3 kHz) sit low, and soft word endings drop
 * into the codec's noise. The chain, per sample, in order:
 *
 * 1. band: 2nd-order high-pass at 300 Hz, 4th-order low-pass at 3400 Hz, so
 *    the resamplers after us (WebRTC, then LiveKit SIP down to 8 kHz) have
 *    nothing above the band to fold back;
 * 2. presence: +4 dB peak at 2 kHz (Q 0.9, roughly 1-3 kHz);
 * 3. compression: 2.5:1 above -24 dBFS with a 6 dB soft knee, 5 ms attack,
 *    120 ms release, so soft words survive next to loud ones;
 * 4. leveller: moves active speech toward TARGET_RMS_DBFS, slowly (0.5 s),
 *    within LEVELLER_RANGE_DB, only while speech is present;
 * 5. limiter: instant attack, 50 ms release, ceiling CEILING_DBFS; a final
 *    clamp guarantees no sample exceeds it (mu-law clips at full scale and
 *    the Opus leg can overshoot a little).
 *
 * Mono float samples in [-1, 1]. No look-ahead, so no added latency.
 *
 * @module agents/shared/performance/phone-voice-dsp
 */

export const BAND_LOW_HZ = 300;
export const BAND_HIGH_HZ = 3400;
export const PRESENCE_HZ = 2000;
export const PRESENCE_DB = 4;
export const COMP_THRESHOLD_DBFS = -24;
export const COMP_RATIO = 2.5;
export const COMP_KNEE_DB = 6;
/** Active speech level for the phone (G.711 nominal speech is about -20 dBm0). */
export const TARGET_RMS_DBFS = -20;
export const LEVELLER_RANGE_DB = { min: -6, max: 9 } as const;
/** Below this short-term level the leveller holds (pauses, breaths, room). */
export const LEVELLER_GATE_DBFS = -45;
export const CEILING_DBFS = -1;
export const CEILING = 10 ** (CEILING_DBFS / 20);

const dbToLin = (db: number): number => 10 ** (db / 20);
const linToDb = (lin: number): number => 20 * Math.log10(Math.max(lin, 1e-9));
/** One-pole smoothing coefficient for a time constant. */
const coef = (ms: number, sr: number): number => Math.exp(-1 / ((ms / 1000) * sr));

type BiquadKind = 'lowpass' | 'highpass' | 'peaking';

/** RBJ cookbook biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(kind: BiquadKind, sampleRate: number, freq: number, q: number, gainDb = 0) {
    const w0 = (2 * Math.PI * Math.min(freq, sampleRate * 0.45)) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    let b: [number, number, number];
    let a: [number, number, number];
    if (kind === 'peaking') {
      const A = 10 ** (gainDb / 40);
      b = [1 + alpha * A, -2 * cos, 1 - alpha * A];
      a = [1 + alpha / A, -2 * cos, 1 - alpha / A];
    } else {
      const k = kind === 'lowpass' ? 1 - cos : 1 + cos;
      const mid = kind === 'lowpass' ? k : -k;
      b = [k / 2, mid, k / 2];
      a = [1 + alpha, -2 * cos, 1 - alpha];
    }
    [this.b0, this.b1, this.b2] = b.map((v) => v / a[0]);
    this.a1 = a[1] / a[0];
    this.a2 = a[2] / a[0];
  }

  step(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Steps 1 and 2: the phone band plus the presence lift. */
export class PhoneBandFilter {
  private readonly stages: Biquad[];

  constructor(sampleRate: number) {
    this.stages = [
      new Biquad('highpass', sampleRate, BAND_LOW_HZ, Math.SQRT1_2),
      // 4th-order Butterworth low-pass: two biquads with these Qs.
      new Biquad('lowpass', sampleRate, BAND_HIGH_HZ, 0.5412),
      new Biquad('lowpass', sampleRate, BAND_HIGH_HZ, 1.3066),
      new Biquad('peaking', sampleRate, PRESENCE_HZ, 0.9, PRESENCE_DB),
    ];
  }

  step(x: number): number {
    let y = x;
    for (const s of this.stages) y = s.step(y);
    return y;
  }
}

/** Gain reduction (dB, <= 0) for a level, with a soft knee. */
export function compressorGainDb(levelDb: number): number {
  const over = levelDb - COMP_THRESHOLD_DBFS;
  const slope = 1 / COMP_RATIO - 1;
  if (over <= -COMP_KNEE_DB / 2) return 0;
  if (over >= COMP_KNEE_DB / 2) return slope * over;
  const x = over + COMP_KNEE_DB / 2;
  return (slope * x * x) / (2 * COMP_KNEE_DB);
}

/**
 * The whole chain. One per reply stream; `levellerGainDb` carries the
 * leveller across a call's replies so each reply starts at the call's level.
 */
export class PhoneVoiceChain {
  private readonly band: PhoneBandFilter;
  private readonly compAttack: number;
  private readonly compRelease: number;
  private readonly levelSmooth: number;
  private readonly gainSlew: number;
  private readonly limRelease: number;
  private env = 0;
  private power = 0;
  private limGain = 1;
  levellerGainDb: number;

  constructor(
    readonly sampleRate: number,
    levellerGainDb = 0
  ) {
    this.band = new PhoneBandFilter(sampleRate);
    this.compAttack = coef(5, sampleRate);
    this.compRelease = coef(120, sampleRate);
    this.levelSmooth = coef(300, sampleRate);
    this.gainSlew = coef(500, sampleRate);
    this.limRelease = coef(50, sampleRate);
    this.levellerGainDb = levellerGainDb;
  }

  /** Process `samples` in place; returns them. */
  process(samples: Float32Array): Float32Array {
    for (let i = 0; i < samples.length; i++) {
      const x = this.band.step(samples[i]);

      const mag = Math.abs(x);
      const c = mag > this.env ? this.compAttack : this.compRelease;
      this.env = c * this.env + (1 - c) * mag;
      let y = x * dbToLin(compressorGainDb(linToDb(this.env)));

      this.power = this.levelSmooth * this.power + (1 - this.levelSmooth) * y * y;
      const levelDb = linToDb(Math.sqrt(this.power));
      if (levelDb > LEVELLER_GATE_DBFS) {
        const want = TARGET_RMS_DBFS - levelDb; // levelDb is before the leveller's gain
        const clamped = Math.min(LEVELLER_RANGE_DB.max, Math.max(LEVELLER_RANGE_DB.min, want));
        this.levellerGainDb = this.gainSlew * this.levellerGainDb + (1 - this.gainSlew) * clamped;
      }
      y *= dbToLin(this.levellerGainDb);

      const need = Math.abs(y) > CEILING ? CEILING / Math.abs(y) : 1;
      this.limGain = Math.min(need, this.limRelease * this.limGain + (1 - this.limRelease));
      y *= this.limGain;
      samples[i] = Math.max(-CEILING, Math.min(CEILING, y));
    }
    return samples;
  }
}
