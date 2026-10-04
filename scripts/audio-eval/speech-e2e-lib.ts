/**
 * Pure helpers for the live speech E2E harness (speech-e2e.ts): audio energy
 * and silence analysis, WAV encoding, transcript normalization + WER, and the
 * scripted "LLM token" chunker. No I/O and no network, so they are unit-tested
 * with synthetic audio (scripts/audio-eval/__tests__/speech-e2e-lib.test.ts).
 *
 * @module scripts/audio-eval/speech-e2e-lib
 */

// ---------------------------------------------------------------- audio energy

/** RMS of a window in dBFS (int16 full scale). -Infinity for digital silence. */
export function windowDb(pcm: Int16Array, start: number, length: number): number {
  const end = Math.min(pcm.length, start + length);
  if (end <= start) return -Infinity;
  let sum = 0;
  for (let i = start; i < end; i++) sum += pcm[i] * pcm[i];
  const rms = Math.sqrt(sum / (end - start));
  return rms > 0 ? 20 * Math.log10(rms / 32768) : -Infinity;
}

export interface SilenceGap {
  /** Start of the silent run, ms from the start of the audio. */
  startMs: number;
  durationMs: number;
}

export interface EnergyAnalysis {
  durationMs: number;
  windowMs: number;
  /** One flag per window: true when the window is above `energyDb`. */
  energetic: boolean[];
  /** Start of the first energetic window, or null when the audio is silent. */
  firstEnergyMs: number | null;
  /** End of the last energetic window, or null when the audio is silent. */
  lastEnergyMs: number | null;
  /** Silent runs strictly between the first and last energetic windows, >= minSilenceMs. */
  internalSilences: SilenceGap[];
  /** Longest internal silent run (ms), 0 when none. */
  longestInternalSilenceMs: number;
}

export interface EnergyOptions {
  /** Analysis window (ms). Default 10. */
  windowMs?: number;
  /** A window at or above this level counts as sound. Default -45 dBFS. */
  energyDb?: number;
  /** Only report internal silences at least this long (ms). Default 700. */
  minSilenceMs?: number;
}

export function analyzeEnergy(
  pcm: Int16Array,
  sampleRate: number,
  options: EnergyOptions = {}
): EnergyAnalysis {
  const windowMs = options.windowMs ?? 10;
  const energyDb = options.energyDb ?? -45;
  const minSilenceMs = options.minSilenceMs ?? 700;
  const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const energetic: boolean[] = [];
  for (let start = 0; start < pcm.length; start += win) {
    energetic.push(windowDb(pcm, start, win) >= energyDb);
  }
  const first = energetic.indexOf(true);
  const last = energetic.lastIndexOf(true);
  const internalSilences: SilenceGap[] = [];
  if (first >= 0) {
    let runStart = -1;
    for (let i = first; i <= last; i++) {
      if (!energetic[i]) {
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        const durationMs = (i - runStart) * windowMs;
        if (durationMs >= minSilenceMs)
          internalSilences.push({ startMs: runStart * windowMs, durationMs });
        runStart = -1;
      }
    }
  }
  return {
    durationMs: Math.round((pcm.length / sampleRate) * 1000),
    windowMs,
    energetic,
    firstEnergyMs: first >= 0 ? first * windowMs : null,
    lastEnergyMs: last >= 0 ? (last + 1) * windowMs : null,
    internalSilences,
    longestInternalSilenceMs: internalSilences.reduce((m, s) => Math.max(m, s.durationMs), 0),
  };
}

/**
 * How much sound precedes the first spoken word: the energetic windows that
 * end before `speechStartMs - marginMs`. A breath or sigh in front of the
 * first word shows up here; plain leading silence does not.
 */
export function leadingEnergyMs(
  analysis: EnergyAnalysis,
  speechStartMs: number,
  marginMs = 150
): number {
  const limit = speechStartMs - marginMs;
  let total = 0;
  for (let i = 0; i < analysis.energetic.length; i++) {
    if ((i + 1) * analysis.windowMs > limit) break;
    if (analysis.energetic[i]) total += analysis.windowMs;
  }
  return total;
}

/** Mono int16 PCM as a 16-bit WAV file. */
export function encodeWav(pcm: Int16Array, sampleRate: number): Buffer {
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return buf;
}

// ---------------------------------------------------------------- numbers → words

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0..999,999,999 as words, no "and" ("one hundred one"). */
export function intToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`intToWords: ${n}`);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
  if (n < 1000) {
    return `${ONES[Math.floor(n / 100)]} hundred` + (n % 100 ? ` ${intToWords(n % 100)}` : '');
  }
  for (const [size, name] of [
    [1_000_000, 'million'],
    [1_000, 'thousand'],
  ] as const) {
    if (n >= size) {
      const rest = n % size;
      return `${intToWords(Math.floor(n / size))} ${name}` + (rest ? ` ${intToWords(rest)}` : '');
    }
  }
  throw new RangeError(`intToWords: ${n}`);
}

/** A year the way it is said: 1990 → "nineteen ninety", 1905 → "nineteen oh five". */
export function yearToWords(y: number): string {
  if (y >= 2000 && y < 2010) return intToWords(y);
  const hi = Math.floor(y / 100);
  const lo = y % 100;
  if (lo === 0) return `${intToWords(hi)} hundred`;
  return `${intToWords(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : intToWords(lo)}`;
}

const ORDINAL_IRREGULAR: Record<string, string> = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
};

export function ordinalWords(n: number): string {
  const words = intToWords(n).split(' ');
  const last = words.pop()!;
  const ord =
    ORDINAL_IRREGULAR[last] ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return [...words, ord].join(' ');
}

const pluralWord = (w: string): string => (w.endsWith('y') ? `${w.slice(0, -1)}ies` : `${w}s`);
const pluralLast = (phrase: string): string => {
  const words = phrase.split(' ');
  words.push(pluralWord(words.pop()!));
  return words.join(' ');
};

const isYearLike = (n: number): boolean => n >= 1100 && n <= 2099;

// ---------------------------------------------------------------- transcript normalization

/** Non-speech annotations a transcriber adds for sounds: "(sighs)", "[laughter]", "*smiles*". */
const ANNOTATION = /\(([^)]*)\)|\[([^\]]*)\]|\*([^*\s][^*]*)\*/g;

/** Annotations in a transcript, e.g. ["sighs"]. */
export function annotations(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ANNOTATION)) out.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  return out.filter(Boolean);
}

const digitWords = (digits: string): string => [...digits].map((d) => ONES[Number(d)]).join(' ');

/**
 * Canonical word sequence for WER. Applied to both reference and hypothesis,
 * so its choices only need to be consistent: numbers become words, money/time/
 * ordinals/decades are said out, letter-digit codes are split into characters,
 * runs of single letters collapse into one token ("f d i c" → "fdic"), "oh" in
 * a number reads as zero, and fillers ("um", "uh") drop.
 */
export function normalizeTranscript(text: string): string[] {
  // "401(k)" is a code, not an annotation.
  let t = text
    .replace(/(\d)\(([a-z])\)/gi, '$1$2')
    .replace(ANNOTATION, ' ')
    .toLowerCase();
  t = t.replace(/[’‘`]/g, "'").replace(/'/g, '');
  t = t.replace(
    /\$(\d+)(?:\.(\d{2}))?/g,
    (_, d: string, c?: string) =>
      ` ${intToWords(Number(d))} dollars${c ? ` and ${intToWords(Number(c))} cents` : ''} `
  );
  t = t
    .replace(/%/g, ' percent ')
    .replace(/°\s*f?/g, ' degrees ')
    .replace(/&/g, ' and ');
  t = t.replace(/(^|[\s(])[-−–](\d)/g, '$1minus $2');
  t = t.replace(
    /\b(\d{1,2}):(\d{2})\b/g,
    (_, h: string, m: string) =>
      ` ${intToWords(Number(h))}${m === '00' ? '' : ` ${Number(m) < 10 ? `oh ${ONES[Number(m)]}` : intToWords(Number(m))}`} `
  );
  t = t.replace(/\b(\d+)(st|nd|rd|th)\b/g, (_, d: string) => ` ${ordinalWords(Number(d))} `);
  t = t.replace(
    /\b(\d{4})s\b/g,
    (_, d: string) =>
      ` ${isYearLike(Number(d)) ? pluralLast(yearToWords(Number(d))) : pluralLast(intToWords(Number(d)))} `
  );
  t = t.replace(/\b(\d)0s\b/g, (_, d: string) => ` ${pluralWord(TENS[Number(d)] || 'ten')} `);
  // Letter/digit codes ("ab12cd", "401k") are read character by character.
  t = t.replace(
    /\b(?=[a-z]*\d)(?=\d*[a-z])[a-z\d]+\b/g,
    (code: string) =>
      ` ${[...code].map((ch) => (/\d/.test(ch) ? ONES[Number(ch)] : ch)).join(' ')} `
  );
  t = t.replace(
    /\b(\d+)\.(\d+)\b/g,
    (_, a: string, b: string) => ` ${intToWords(Number(a))} point ${digitWords(b)} `
  );
  t = t.replace(/\b\d+\b/g, (d: string) => {
    const n = Number(d);
    if (d.length === 4 && isYearLike(n)) return ` ${yearToWords(n)} `;
    return n < 1e9 ? ` ${intToWords(n)} ` : ` ${digitWords(d)} `;
  });
  t = t.replace(/[^a-z0-9\s]+/g, ' ');
  const raw = t.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let letters = '';
  const flushLetters = (): void => {
    if (letters) out.push(letters);
    letters = '';
  };
  for (const w of raw) {
    if (w === 'um' || w === 'uh' || w === 'erm') continue;
    if (w.length === 1 && /[a-z]/.test(w)) {
      letters += w;
      continue;
    }
    flushLetters();
    if (/^h?m{1,}m*$/.test(w) || /^hm+$/.test(w) || w === 'mm' || w === 'hmmm') out.push('hmm');
    else if (w === 'oh') out.push('zero');
    else if (w === 'ok') out.push('okay');
    else out.push(w);
  }
  flushLetters();
  return out;
}

/** Expand "{a|b} c {d|e}" into every alternative (capped). */
export function expandAlternatives(template: string, cap = 512): string[] {
  const m = /\{([^{}]*)\}/.exec(template);
  if (!m) return [template];
  const out: string[] = [];
  for (const choice of m[1].split('|')) {
    const next = template.slice(0, m.index) + choice + template.slice(m.index + m[0].length);
    for (const e of expandAlternatives(next, cap)) {
      if (out.length >= cap) return out;
      out.push(e);
    }
  }
  return out;
}

/** Word-level edit distance. */
export function editDistance(ref: readonly string[], hyp: readonly string[]): number {
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[hyp.length];
}

export interface WerResult {
  wer: number;
  errors: number;
  refWords: number;
  /** The normalized reference alternative that scored best. */
  bestRef: string;
  hyp: string;
}

/** WER of `hypothesis` against the best-matching alternative of `referenceTemplate`. */
export function wer(referenceTemplate: string, hypothesis: string): WerResult {
  const hyp = normalizeTranscript(hypothesis);
  let best: WerResult | null = null;
  for (const alt of expandAlternatives(referenceTemplate)) {
    const ref = normalizeTranscript(alt);
    const errors = editDistance(ref, hyp);
    const rate = ref.length ? errors / ref.length : hyp.length ? 1 : 0;
    if (!best || rate < best.wer) {
      best = {
        wer: rate,
        errors,
        refWords: ref.length,
        bestRef: ref.join(' '),
        hyp: hyp.join(' '),
      };
    }
  }
  return best!;
}

/** Stage-direction words spoken aloud (annotations like "(sighs)" are excluded: those are sounds). */
const STAGE_WORDS =
  /\b(smiles?|smiling|sighs?|sighing|laughs?|laughing|chuckles?|chuckling|grins?|grinning|asterisks?|pauses)\b/gi;

export function spokenStageDirections(transcript: string): string[] {
  return [...transcript.replace(ANNOTATION, ' ').matchAll(STAGE_WORDS)].map((m) =>
    m[0].toLowerCase()
  );
}

/** True when a word was spelled letter by letter ("R E A L L Y", "R-E-A-L-L-Y"). */
export function spelledOut(transcript: string, word: string): boolean {
  const letters = [...word.toLowerCase()].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b${letters.join('[\\s.\\-,]+')}\\b`, 'i').test(transcript);
}

// ---------------------------------------------------------------- scripted LLM stream

/** Deterministic PRNG (mulberry32) so a scenario streams the same way every run. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TextChunk {
  text: string;
  /** Wait after this chunk before the next (ms). */
  gapMs: number;
}

export interface ChunkOptions {
  /** Longest token (chars, excluding leading space). Default 6. */
  maxTokenChars?: number;
  minGapMs?: number;
  maxGapMs?: number;
  /** Chance of a long stall between tokens (a slow decode step). */
  stallChance?: number;
  stallMs?: number;
}

/**
 * Split a reply into token-sized pieces (leading space kept, long words split)
 * with realistic decode gaps. Joining the pieces gives back `text` exactly.
 */
export function chunkLikeLlm(
  text: string,
  rng: () => number,
  opts: ChunkOptions = {}
): TextChunk[] {
  const max = opts.maxTokenChars ?? 6;
  const minGap = opts.minGapMs ?? 12;
  const maxGap = opts.maxGapMs ?? 45;
  const stallChance = opts.stallChance ?? 0.04;
  const stallMs = opts.stallMs ?? 150;
  const pieces = text.match(new RegExp(`\\s*\\S{1,${max}}|\\s+$`, 'g')) ?? [];
  return pieces.map((piece) => ({
    text: piece,
    gapMs: Math.round(rng() < stallChance ? stallMs : minGap + rng() * (maxGap - minGap)),
  }));
}

// ---------------------------------------------------------------- stats

export function median(values: readonly number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
