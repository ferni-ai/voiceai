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

/** Peak absolute sample, 0-1 (for tests). */
export function peakOf(pcm: ArrayBuffer): number {
  const s = new Int16Array(pcm);
  let m = 0;
  for (const v of s) m = Math.max(m, Math.abs(v));
  return m / 32767;
}
