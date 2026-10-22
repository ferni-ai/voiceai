// Speakerphone echo for the scripted caller: the agent's own voice, delayed,
// attenuated and optionally under room noise, mixed into the caller's mic, as an
// iPhone speaker leaks it past AEC (docs/testing/VOICE-EVAL-ECHO.md). converse.mjs
// feeds every agent frame it receives to push() and sends mix(callerFrame).
//
// Placement: a track's first frame lands delayMs after "now" on the mic clock
// (samples handed to the mic so far); its later frames follow contiguously, so
// network jitter in frame arrival does not smear the echo. A track that stops
// sending frames and starts again is placed delayMs after "now" again.
//
// usage: node echo-mixer.mjs --config   prints the env's echo settings as JSON
//        (null when echo is off), exit 2 on a bad value. run.sh uses it.

export const ECHO_DEFAULTS = { gainDb: -18, delayMs: 120, noiseDb: null };
const MAX_DELAY_MS = 2000;
const RING_S = 4;

export const dbToGain = (db) => 10 ** (db / 20);

/**
 * Echo settings from env (run.sh sets these from --echo*), or null when off.
 * EVAL_ECHO=1 turns it on with the defaults; any EVAL_ECHO_* value turns it on.
 */
export function echoConfigFromEnv(env = process.env) {
  const keys = {
    gainDb: 'EVAL_ECHO_GAIN_DB',
    delayMs: 'EVAL_ECHO_DELAY_MS',
    noiseDb: 'EVAL_ECHO_NOISE_DB',
  };
  const set = (k) => env[k] !== undefined && env[k] !== '';
  if (env.EVAL_ECHO !== '1' && !Object.values(keys).some(set)) return null;
  const cfg = { ...ECHO_DEFAULTS };
  for (const [field, k] of Object.entries(keys)) {
    if (!set(k)) continue;
    const n = Number(env[k]);
    if (!Number.isFinite(n)) throw new Error(`${k} is not a number: ${env[k]}`);
    cfg[field] = n;
  }
  if (cfg.delayMs < 0 || cfg.delayMs > MAX_DELAY_MS)
    throw new Error(`EVAL_ECHO_DELAY_MS must be 0..${MAX_DELAY_MS} (got ${cfg.delayMs})`);
  return cfg;
}

/**
 * Streaming linear-interpolation resampler for one track. It holds back the
 * last input sample until the next frame arrives, so output does not depend
 * on where frame boundaries fall.
 */
export class Resampler {
  constructor(inRate, outRate) {
    this.inRate = inRate;
    this.outRate = outRate;
    this.inCount = 0; // input samples seen
    this.outCount = 0; // output samples produced
    this.last = 0; // input sample inCount - 1
  }

  /** Int16 input samples in, Float32 output samples out. */
  push(x) {
    const total = this.inCount + x.length;
    const at = (i) => (i < this.inCount ? this.last : x[i - this.inCount]);
    const out = [];
    for (;;) {
      const num = this.outCount * this.inRate;
      const i = Math.floor(num / this.outRate);
      const frac = (num % this.outRate) / this.outRate;
      if (frac === 0 ? i >= total : i + 1 >= total) break;
      out.push(frac === 0 ? at(i) : at(i) + (at(i + 1) - at(i)) * frac);
      this.outCount += 1;
    }
    if (x.length) this.last = x[x.length - 1];
    this.inCount = total;
    return Float32Array.from(out);
  }
}

/** Seeded PRNG (32-bit LCG): the same noise on every run of a seed. */
function prng(seed) {
  let a = seed >>> 0;
  return () => (a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export class EchoMixer {
  /** cfg: { gainDb, delayMs, noiseDb }; rate: the mic's sample rate. */
  constructor(cfg, { rate = 48000, seed = 1 } = {}) {
    this.rate = rate;
    this.gain = dbToGain(cfg.gainDb);
    this.delay = Math.round((cfg.delayMs * rate) / 1000);
    // Uniform noise in [-a, a] has RMS a/sqrt(3); noiseDb is its RMS in dBFS.
    this.noiseAmp =
      cfg.noiseDb === null || cfg.noiseDb === undefined
        ? 0
        : 32767 * dbToGain(cfg.noiseDb) * Math.sqrt(3);
    this.ring = new Float32Array(rate * RING_S);
    this.readPos = 0; // the mic clock: samples mixed so far
    this.tracks = new Map(); // key -> { rs, writeAt }
    this.rand = prng(seed);
    this.stats = { echoSamples: 0, reanchors: 0, droppedSamples: 0 };
  }

  /** One frame of agent audio as it arrives (key: the track it came from). */
  push(key, pcm, sampleRate) {
    let t = this.tracks.get(key);
    if (!t || t.rs.inRate !== sampleRate) {
      t = { rs: new Resampler(sampleRate, this.rate), writeAt: this.readPos + this.delay };
      this.tracks.set(key, t);
    }
    const y = t.rs.push(pcm);
    if (t.writeAt < this.readPos) {
      // The track paused (no frames) or fell behind: place it delayMs from now again.
      this.stats.reanchors += 1;
      t.writeAt = this.readPos + this.delay;
    }
    const n = this.ring.length;
    for (let k = 0; k < y.length; k++) {
      const at = t.writeAt + k;
      if (at - this.readPos >= n) {
        this.stats.droppedSamples += 1; // further ahead than the ring holds
        continue;
      }
      this.ring[at % n] += y[k] * this.gain;
    }
    t.writeAt += y.length;
    this.stats.echoSamples += y.length;
  }

  /** The next mic frame: the caller's samples plus echo and noise, clipped to int16. */
  mix(caller) {
    const out = new Int16Array(caller.length);
    const n = this.ring.length;
    for (let i = 0; i < caller.length; i++) {
      const j = (this.readPos + i) % n;
      let v = caller[i] + this.ring[j];
      this.ring[j] = 0;
      if (this.noiseAmp) v += (this.rand() * 2 - 1) * this.noiseAmp;
      out[i] = Math.max(-32768, Math.min(32767, Math.round(v)));
    }
    this.readPos += caller.length;
    return out;
  }
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === '--config') {
  try {
    console.log(JSON.stringify(echoConfigFromEnv()));
  } catch (error) {
    console.error(`echo-mixer: ${error.message}`);
    process.exit(2);
  }
}
