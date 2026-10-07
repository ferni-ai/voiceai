/**
 * Sounds of someone being there when nobody is talking: a few bars whistled
 * to himself in an easy silence. Cartesia speaks and laughs but cannot
 * whistle, so the whistle is synthesized: a near-pure tone (a whistle is close
 * to a sine) with a little vibrato, glides between notes, a breathy edge and
 * soft attacks, so it reads as lips, not a beep.
 *
 * Tunes are short original note runs (no melody anyone owns), picked at
 * random per whistle.
 *
 * @module agents/integrations/presence-sounds
 */

const RATE = 24000;

/** Semitones above the base pitch, and beats. Original, idle, a little wandering. */
const TUNES: Array<Array<[number, number]>> = [
  [
    [0, 1],
    [4, 1],
    [7, 1.5],
    [5, 0.5],
    [4, 2],
  ],
  [
    [7, 1],
    [5, 0.5],
    [4, 0.5],
    [2, 1],
    [0, 2],
  ],
  [
    [0, 0.5],
    [2, 0.5],
    [4, 1],
    [2, 0.5],
    [4, 0.5],
    [7, 2],
  ],
  [
    [4, 1],
    [2, 1],
    [0, 1],
    [2, 0.5],
    [0, 2.5],
  ],
];

export interface WhistleOptions {
  /** Base pitch in Hz; whistles sit around 1-2 kHz. */
  baseHz?: number;
  /** Seconds per beat. */
  beat?: number;
  /** Peak level, 0-1. */
  level?: number;
  rng?: () => number;
}

/** A few bars whistled, as 24 kHz mono s16le PCM (the clip player's format). */
export function synthWhistle(options: WhistleOptions = {}): ArrayBuffer {
  const rng = options.rng ?? Math.random;
  const tune = TUNES[Math.floor(rng() * TUNES.length) % TUNES.length];
  const baseHz = (options.baseHz ?? 1100) * (0.94 + rng() * 0.12);
  const beat = (options.beat ?? 0.32) * (0.9 + rng() * 0.2);
  const level = options.level ?? 0.22;

  // Note boundaries, with a breath gap between some notes.
  const notes = tune.map(([semi, beats]) => ({ hz: baseHz * 2 ** (semi / 12), dur: beats * beat }));
  const total = notes.reduce((t, n) => t + n.dur, 0) + 0.15;
  const n = Math.round(total * RATE);
  const out = new Int16Array(n);

  let phase = 0;
  let noise = 0;
  let t0 = 0;
  for (let k = 0; k < notes.length; k++) {
    const note = notes[k];
    const next = notes[k + 1];
    const start = Math.round(t0 * RATE);
    const len = Math.round(note.dur * RATE);
    const glide = Math.min(0.04, note.dur * 0.25); // seconds of slide into the next note
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / RATE;
      // Slide toward the next pitch at the end of the note: lips don't jump.
      const into = next && t > note.dur - glide ? (t - (note.dur - glide)) / glide : 0;
      const hz = note.hz * (1 - into) + (next?.hz ?? note.hz) * into;
      const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * (t0 + t)) * Math.min(1, t / 0.15);
      phase += (2 * Math.PI * hz * vibrato) / RATE;
      // Soft attack, and a short release unless it glides on.
      const attack = Math.min(1, t / 0.03);
      const release = next ? 1 : Math.min(1, (note.dur - t) / 0.08);
      const env = Math.max(0, attack * release);
      // Breath: low-passed noise, louder at note starts.
      noise = 0.9 * noise + 0.1 * (rng() * 2 - 1);
      const breath = noise * (0.15 + 0.35 * Math.max(0, 1 - t / 0.06));
      const s = (Math.sin(phase) + 0.08 * Math.sin(2 * phase) + breath) * env * level;
      out[start + i] = Math.max(-32767, Math.min(32767, Math.round(s * 32767)));
    }
    t0 += note.dur;
  }
  return out.buffer;
}

export interface HumOptions {
  /** Base pitch in Hz; a relaxed male hum sits around 110-140 Hz. */
  baseHz?: number;
  beat?: number;
  level?: number;
  rng?: () => number;
}

/**
 * A few bars hummed with the mouth closed: a voiced tone (harmonics falling
 * off) shaped by a nasal resonance near 250 Hz, so it reads as "mm-mm-mmm"
 * and not as a buzz. Same original tunes as the whistle, an octave-ish lower.
 */
export function synthHum(options: HumOptions = {}): ArrayBuffer {
  const rng = options.rng ?? Math.random;
  const tune = TUNES[Math.floor(rng() * TUNES.length) % TUNES.length];
  const baseHz = (options.baseHz ?? 125) * (0.94 + rng() * 0.12);
  const beat = (options.beat ?? 0.36) * (0.9 + rng() * 0.2);
  const level = options.level ?? 0.45;
  const notes = tune.map(([semi, beats]) => ({ hz: baseHz * 2 ** (semi / 12), dur: beats * beat }));
  const n = Math.round((notes.reduce((t, x) => t + x.dur, 0) + 0.2) * RATE);
  const out = new Int16Array(n);
  // Nasal resonance: most energy low, a weak second peak, nothing bright.
  const gain = (f: number) =>
    Math.exp(-(((f - 250) / 160) ** 2)) + 0.25 * Math.exp(-(((f - 1000) / 350) ** 2)) + 0.04;
  const HARMONICS = 14;
  let phase = 0;
  let t0 = 0;
  for (let k = 0; k < notes.length; k++) {
    const note = notes[k];
    const next = notes[k + 1];
    const start = Math.round(t0 * RATE);
    const len = Math.round(note.dur * RATE);
    const glide = Math.min(0.06, note.dur * 0.3);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / RATE;
      const into = next && t > note.dur - glide ? (t - (note.dur - glide)) / glide : 0;
      const hz = note.hz * (1 - into) + (next?.hz ?? note.hz) * into;
      const vibrato = 1 + 0.01 * Math.sin(2 * Math.PI * 5 * (t0 + t)) * Math.min(1, t / 0.2);
      phase += (2 * Math.PI * hz * vibrato) / RATE;
      let v = 0;
      for (let h = 1; h <= HARMONICS; h++) v += (gain(hz * h) / h ** 1.2) * Math.sin(h * phase);
      // Slower attack than a whistle; a hum swells in. Small dip between notes.
      const attack = Math.min(1, t / 0.07);
      const release = next
        ? 1 - 0.25 * Math.max(0, (t - (note.dur - 0.05)) / 0.05)
        : Math.min(1, (note.dur - t) / 0.15);
      const s = 0.55 * v * Math.max(0, attack * release) * level;
      out[start + i] = Math.max(-32767, Math.min(32767, Math.round(s * 32767)));
    }
    t0 += note.dur;
  }
  return out.buffer;
}

/**
 * A mock snore, for a long quiet on a light call: two breaths, each a slow
 * fluttering in-breath (the soft palate rattling, ~30 Hz pulses through
 * low-passed noise) and a soft whooshing out-breath. A joke, so it is short.
 */
export function synthSnore(options: { level?: number; rng?: () => number } = {}): ArrayBuffer {
  const rng = options.rng ?? Math.random;
  const level = options.level ?? 0.17;
  const IN = 1.3;
  const OUT = 1.1;
  const GAP = 0.45;
  const breaths = 2;
  const n = Math.round(breaths * (IN + OUT + GAP) * RATE);
  const out = new Int16Array(n);
  let low = 0;
  let low2 = 0;
  let hiPrev = 0;
  const flutterHz = 28 + rng() * 10;
  for (let b = 0; b < breaths; b++) {
    const start = Math.round(b * (IN + OUT + GAP) * RATE);
    // In-breath: rattling, swelling then cut.
    for (let i = 0; i < IN * RATE; i++) {
      const t = i / RATE;
      const white = rng() * 2 - 1;
      low = 0.96 * low + 0.04 * white; // ~150 Hz low-pass
      low2 = 0.9 * low2 + 0.1 * low;
      const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * flutterHz * t);
      const env = Math.sin(Math.PI * Math.min(1, t / IN)) ** 1.5;
      const s =
        (low2 * 9 * pulse ** 3 + 0.25 * Math.sin(2 * Math.PI * flutterHz * 2 * t) * pulse) * env;
      out[start + i] = Math.round(Math.max(-1, Math.min(1, s * level)) * 32767);
    }
    // Out-breath: airy, falling.
    const outStart = start + Math.round(IN * RATE);
    for (let i = 0; i < OUT * RATE; i++) {
      const t = i / RATE;
      const white = rng() * 2 - 1;
      const hi = white - hiPrev; // crude high-pass: breath hiss
      hiPrev = white;
      const env = Math.min(1, t / 0.1) * Math.max(0, 1 - t / OUT) ** 1.3;
      const s = 0.18 * hi * env;
      out[outStart + i] = Math.round(Math.max(-1, Math.min(1, s * level)) * 32767);
    }
  }
  return out.buffer;
}

/** Peak absolute sample, 0-1 (for tests). */
export function peakOf(pcm: ArrayBuffer): number {
  const s = new Int16Array(pcm);
  let m = 0;
  for (const v of s) m = Math.max(m, Math.abs(v));
  return m / 32767;
}
