#!/usr/bin/env npx tsx
/**
 * How the caller's name sounds in today's greeting lines (task 16, phase 1: measure only).
 *
 * Every template below is a shape the code speaks today (file:line in TEMPLATES), rendered
 * with fictional names on every voice in VOICE_IDS, through the production TTS path:
 * the gateway's SSML processor, createContinuationTTS and CartesiaTTSProvider.openReplyStream
 * (pinned Sonic snapshot, CARTESIA_PRONUNCIATION_DICT_ID when set, as prod). Per take it reports:
 *   - name loudness vs the rest of the line, in LU: K-weighted (ITU-R BS.1770 filter), ungated,
 *     over the name's own word window and over the other words' windows (a name is too short
 *     for gated LUFS, which needs 400 ms blocks);
 *   - the gaps before and after the name: from Cartesia's word timestamps, and the longest
 *     run of silence (10 ms frames under -45 dBFS) between the neighbouring words' midpoints;
 *   - an AI judge (Gemini 3.5 Flash on Vertex, temperature 0): how human it sounds 1-5,
 *     whether the name is louder or set apart, and how the name was pronounced.
 *
 *   npx tsx scripts/voice-eval/name-speech.ts --out <dir> --dry-run   items + what Cartesia receives, no network
 *   npx tsx scripts/voice-eval/name-speech.ts --out <dir>             render + measure (CARTESIA_API_KEY)
 *   npx tsx scripts/voice-eval/name-speech.ts --out <dir> --judge     judge the rendered takes (gcloud ADC)
 *   options: --voices ferni,peter_john (VOICE_IDS keys, lower case)  --limit <n>
 *
 * The key is read from the environment and never printed. Names are fictional.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';

process.env.TTS_ALIGNED_TRANSCRIPT = 'on'; // word timestamps on the reply stream (read at openReplyStream)

const { VOICE_IDS } = await import('../../src/config/voice-ids.js');
const { CartesiaTTSProvider, prosodyTags } = await import('../../src/speech/tts-gateway/providers/cartesia.js');
const { createContinuationTTS } = await import('../../src/speech/tts-gateway/continuation-tts.js');
const { getSSMLProcessor } = await import('../../src/speech/tts-gateway/ssml/index.js');

type WordTiming = { word: string; start: number; end: number };
type ReplyStream = AsyncIterable<ArrayBuffer> & {
  push(text: string): void;
  end(): void;
  cancel(): void;
  takeWordTimings?(): WordTiming[];
};

const NAMES = ['Sam', 'Riley', 'Ana', 'Nayan'];
const POSSESSIVE = "Nayan's";

/** Today's shapes. `{N}` is the name. */
const TEMPLATES: Record<string, { from: string; text: string }> = {
  director_stop: { from: 'greeting-direction.ts:107 example after calmGreeting (live default path)', text: 'Hey {N}. How did the running go this week?' },
  director_comma: { from: 'phase-2 candidate: name folded in with a comma', text: 'Hey {N}, how did the running go this week?' },
  fallback_plain: { from: 'proactive-opener.ts:63 fallback', text: "Hey {N}, it's Ferni, just calling to check in." },
  warm_ferni: { from: 'warm-greeting.ts:571-576', text: 'Good morning.<break time="60ms"/><speed ratio="0.92"/><emotion value="affectionate"/>{N}.<break time="100ms"/><speed ratio="1.0"/>How are you doing today?' },
  warm_team: { from: 'warm-greeting.ts:704-705', text: 'Good morning.<break time="50ms"/>{N}.<break time="80ms"/>How are you doing today?' },
  warm_nayan: { from: 'warm-greeting.ts:1275-1277', text: 'Good morning.<break time="80ms"/><emotion value="affectionate"/>{N}.<break time="150ms"/>How are you doing today?' },
  proactive: { from: 'proactive-starters.ts:367', text: '<emotion value="happy"/><break time="200ms"/>{N}! <break time="150ms"/>Good to hear from you again.' },
  intro: { from: 'greetings.ts "Hey.<break>I\'m X.<break>" (persona intro)', text: 'Hey.<break time="400ms"/>I\'m {N}.<break time="300ms"/>Good to meet you.' },
};
const POSSESSIVE_TEMPLATES: Record<string, { from: string; text: string }> = {
  poss_mid: { from: 'possessive mid-sentence', text: 'That was {N} idea, and it was a good one.' },
  poss_start: { from: 'possessive at the start', text: '{N} team will call you back tomorrow.' },
};

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const has = (name: string): boolean => process.argv.includes(`--${name}`);

interface Item { id: string; voiceKey: string; voice: string; template: string; name: string; text: string }

function items(): Item[] {
  const wanted = arg('voices')?.split(',');
  const voices = Object.entries(VOICE_IDS as Record<string, string>)
    .map(([k, v]) => [k.toLowerCase(), v] as const)
    .filter(([k]) => !wanted || wanted.includes(k));
  const out: Item[] = [];
  for (const [voiceKey, voice] of voices) {
    const add = (template: string, text: string, name: string): void => {
      out.push({ id: `${voiceKey}-${template}-${name.replace(/'/g, '')}`, voiceKey, voice, template, name, text: text.replace('{N}', name) });
    };
    for (const [t, { text }] of Object.entries(TEMPLATES)) for (const n of NAMES) add(t, text, n);
    for (const [t, { text }] of Object.entries(POSSESSIVE_TEMPLATES)) add(t, text, POSSESSIVE);
  }
  const limit = Number(arg('limit'));
  return Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out;
}

const ssml = getSSMLProcessor();
/** The gateway's sanitize (gateway-tts-node.ts sanitizeChunkForTTS, minus instruction-block stripping). */
const sanitize = (chunk: string): { text: string; prosody: Record<string, unknown> } => {
  const r = ssml.parse(chunk);
  return { text: r.cleanText.trim(), prosody: { ...r.prosody } };
};

/** Wraps a reply stream: keeps its PCM and word timings, in play order. */
class Recorder {
  readonly contexts: Array<{ pcm: Int16Array[]; timings: WordTiming[]; pushed: string[] }> = [];
  open(inner: ReplyStream): ReplyStream {
    const ctx = { pcm: [] as Int16Array[], timings: [] as WordTiming[], pushed: [] as string[] };
    this.contexts.push(ctx);
    return {
      push: (t) => (ctx.pushed.push(t), inner.push(t)),
      end: () => inner.end(),
      cancel: () => inner.cancel(),
      async *[Symbol.asyncIterator]() {
        for await (const chunk of inner) {
          ctx.pcm.push(new Int16Array(chunk.slice(0)));
          yield chunk;
        }
        ctx.timings.push(...(inner.takeWordTimings?.() ?? []));
      },
    };
  }
  /** One PCM track and the timings shifted to it (each context's clock starts at zero). */
  track(): { pcm: Int16Array; words: WordTiming[]; pushed: string } {
    const words: WordTiming[] = [];
    let offset = 0;
    const parts: Int16Array[] = [];
    for (const c of this.contexts) {
      for (const w of c.timings) words.push({ word: w.word, start: w.start + offset, end: w.end + offset });
      for (const p of c.pcm) parts.push(p);
      offset += c.pcm.reduce((n, p) => n + p.length, 0) / 24000;
    }
    const pcm = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) (pcm.set(p, o), (o += p.length));
    return { pcm, words, pushed: this.contexts.map((c) => c.pushed.join('')).join(' || ') };
  }
}

async function render(provider: InstanceType<typeof CartesiaTTSProvider>, item: Item): Promise<ReturnType<Recorder['track']>> {
  const rec = new Recorder();
  const open = (): ReplyStream => rec.open(provider.openReplyStream(item.voice) as ReplyStream);
  const textStream = new ReadableStream<string>({ start: (c) => (c.enqueue(item.text), c.close()) });
  const errors: unknown[] = [];
  const audio = createContinuationTTS({
    textStream: textStream as never,
    reply: open() as never,
    openReply: open as never,
    sanitize: sanitize as never,
    openingTags: prosodyTags,
    toFrames: () => [],
    onFirstAudio: Object.assign(() => {}, {}),
    trimLeadSilence: false,
    wordTimings: false,
    onError: (e) => errors.push(e),
  });
  for await (const _ of audio as AsyncIterable<unknown>) void _;
  if (errors.length) throw new Error(String(errors[0]));
  return rec.track();
}

// ── Measures ──────────────────────────────────────────────────────────────────

function biquad(x: Float64Array, [b0, b1, b2, a0, a1, a2]: number[]): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    (x2 = x1), (x1 = x[i]), (y2 = y1), (y1 = v), (y[i] = v);
  }
  return y;
}
/** BS.1770 K-weighting at `fs` (pre-filter shelf + RLB high-pass, as pyloudnorm derives them). */
function kWeight(pcm: Int16Array, fs = 24000): Float64Array {
  const x = Float64Array.from(pcm, (s) => s / 32768);
  const A = 10 ** (4 / 40), w0 = (2 * Math.PI * 1500) / fs, al = Math.sin(w0) / (2 / Math.SQRT2), c = Math.cos(w0);
  const shelf = [A * (A + 1 + (A - 1) * c + 2 * Math.sqrt(A) * al), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - 2 * Math.sqrt(A) * al),
    A + 1 - (A - 1) * c + 2 * Math.sqrt(A) * al, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - 2 * Math.sqrt(A) * al];
  const w1 = (2 * Math.PI * 38) / fs, a1 = Math.sin(w1) / (2 * 0.5), c1 = Math.cos(w1);
  const hp = [(1 + c1) / 2, -(1 + c1), (1 + c1) / 2, 1 + a1, -2 * c1, 1 - a1];
  return biquad(biquad(x, shelf), hp);
}
const loudness = (y: Float64Array, spans: Array<[number, number]>): number => {
  let sum = 0, n = 0;
  for (const [s, e] of spans) for (let i = Math.max(0, Math.round(s * 24000)); i < Math.min(y.length, Math.round(e * 24000)); i++) (sum += y[i] ** 2), n++;
  return n ? -0.691 + 10 * Math.log10(sum / n + 1e-12) : NaN;
};
/** Longest run (ms) of 10 ms frames under -45 dBFS between two times. */
function silenceMs(pcm: Int16Array, from: number, to: number): number {
  let best = 0, run = 0;
  for (let t = from; t + 0.01 <= to; t += 0.01) {
    let sum = 0;
    const s = Math.round(t * 24000);
    for (let i = s; i < s + 240 && i < pcm.length; i++) sum += (pcm[i] / 32768) ** 2;
    const db = 10 * Math.log10(sum / 240 + 1e-12);
    run = db < -45 ? run + 10 : 0;
    best = Math.max(best, run);
  }
  return best;
}
const norm = (w: string): string => w.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z']/g, '');

function measure(pcm: Int16Array, words: WordTiming[], name: string) {
  const i = words.findIndex((w) => norm(w.word) === norm(name));
  if (i < 0) return { found: false as const };
  const w = words[i], prev = words[i - 1], next = words[i + 1];
  const y = kWeight(pcm);
  const rest = words.filter((_, j) => j !== i).map((x) => [x.start, x.end] as [number, number]);
  const mid = (x: WordTiming): number => (x.start + x.end) / 2;
  return {
    found: true as const,
    nameLU: +(loudness(y, [[w.start, w.end]]) - loudness(y, rest)).toFixed(2),
    nameMs: Math.round((w.end - w.start) * 1000),
    gapBeforeMs: prev ? Math.round((w.start - prev.end) * 1000) : null,
    gapAfterMs: next ? Math.round((next.start - w.end) * 1000) : null,
    silenceBeforeMs: prev ? silenceMs(pcm, mid(prev), mid(w)) : null,
    silenceAfterMs: next ? silenceMs(pcm, mid(w), mid(next)) : null,
  };
}

function wav(pcm: Int16Array, rate = 24000): Buffer {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36);
  b.writeUInt32LE(pcm.length * 2, 40); Buffer.from(pcm.buffer, pcm.byteOffset, pcm.length * 2).copy(b, 44);
  return b;
}

// ── Judge ─────────────────────────────────────────────────────────────────────

const JUDGE = (name: string): string =>
  `This is a short synthetic voice line. Judge how the name "${name}" is delivered, as a listener who wants it to sound like ` +
  'a relaxed person talking to a friend. Return only JSON: {"human": 1-5 (5 = exactly how a relaxed person would say it, ' +
  '1 = clearly robotic or performed), "name_louder": true if the name is noticeably louder or more stressed than the words ' +
  'around it, "name_isolated": true if a noticeable pause before or after the name sets it apart, "heard_name": how the name ' +
  'sounded in sounds-like syllables with the stressed syllable in capitals}.';

async function judge(dir: string, rows: Array<Item & Record<string, unknown>>): Promise<void> {
  const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8' }).trim();
  const url = 'https://aiplatform.googleapis.com/v1/projects/johnb-2025/locations/global/publishers/google/models/gemini-3.5-flash:generateContent';
  let k = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (k < rows.length) {
      const r = rows[k++];
      if (r.judge || !fs.existsSync(join(dir, 'audio', `${r.id}.wav`))) continue;
      const data = fs.readFileSync(join(dir, 'audio', `${r.id}.wav`)).toString('base64');
      const body = { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data } }, { text: JUDGE(r.name) }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
      try {
        const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`judge HTTP ${res.status}`);
        const j = (await res.json()) as { candidates: Array<{ content: { parts: Array<{ text?: string }> } }> };
        r.judge = JSON.parse(j.candidates[0].content.parts.map((p) => p.text ?? '').join(''));
      } catch (e) {
        r.judge = { error: String(e).slice(0, 120) };
      }
    }
  }));
}

// ── Report ────────────────────────────────────────────────────────────────────

const median = (xs: number[]): number | null => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
function report(rows: Array<Record<string, any>>): string {
  const groups = new Map<string, Array<Record<string, any>>>();
  for (const r of rows) groups.set(`${r.template}|${r.name}`, [...(groups.get(`${r.template}|${r.name}`) ?? []), r]);
  const lines = ['| template | name | takes | name vs rest LU (median) | gap before ms ts / silence | gap after ms ts / silence | human 1-5 (mean) | name louder | name isolated |', '|---|---|---|---|---|---|---|---|---|'];
  for (const [key, rs] of groups) {
    const [t, n] = key.split('|');
    const m = rs.filter((r) => r.m?.found);
    const j = rs.filter((r) => typeof r.judge?.human === 'number');
    const mean = j.length ? (j.reduce((s, r) => s + r.judge.human, 0) / j.length).toFixed(2) : '-';
    const pct = (f: string): string => (j.length ? `${j.filter((r) => r.judge[f] === true).length}/${j.length}` : '-');
    const med = (f: string): string => String(median(m.map((r) => r.m[f])) ?? '-');
    lines.push(`| ${t} | ${n} | ${m.length}/${rs.length} | ${med('nameLU')} | ${med('gapBeforeMs')} / ${med('silenceBeforeMs')} | ${med('gapAfterMs')} / ${med('silenceAfterMs')} | ${mean} | ${pct('name_louder')} | ${pct('name_isolated')} |`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const dir = arg('out');
  if (!dir) throw new Error('--out <dir> is required');
  fs.mkdirSync(join(dir, 'audio'), { recursive: true });
  const all = items();
  const resultsPath = join(dir, 'results.json');
  const rows: Array<Item & Record<string, any>> = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : [];

  if (has('dry-run')) {
    const voices = new Set(all.map((i) => i.voiceKey));
    console.log(`${all.length} items: ${voices.size} voices x (${Object.keys(TEMPLATES).length} templates x ${NAMES.length} names + ${Object.keys(POSSESSIVE_TEMPLATES).length} possessive)`);
    console.log(`voices: ${[...voices].join(', ')}`);
    for (const [t, { from, text }] of Object.entries({ ...TEMPLATES, ...POSSESSIVE_TEMPLATES })) {
      const { text: clean, prosody } = sanitize(text.replace('{N}', t.startsWith('poss') ? POSSESSIVE : 'Sam'));
      // As one chunk; the render records what each Cartesia context really got (results.json `sent`).
      console.log(`- ${t} (${from})\n    as one chunk: ${prosodyTags(prosody as never)}${clean}`);
    }
    console.log(`key in env: ${process.env.CARTESIA_API_KEY ? 'yes' : 'no'}; dictionary in env: ${process.env.CARTESIA_PRONUNCIATION_DICT_ID ? 'yes' : 'no'}`);
    return;
  }

  if (has('judge')) {
    await judge(dir, rows);
    fs.writeFileSync(resultsPath, JSON.stringify(rows, null, 1));
  } else {
    if (!process.env.CARTESIA_API_KEY) throw new Error('CARTESIA_API_KEY is not set');
    const done = new Set(rows.map((r) => r.id));
    const todo = all.filter((i) => !done.has(i.id));
    const provider = new CartesiaTTSProvider();
    let k = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (k < todo.length) {
        const item = todo[k++];
        try {
          const { pcm, words, pushed } = await render(provider, item);
          fs.writeFileSync(join(dir, 'audio', `${item.id}.wav`), wav(pcm));
          rows.push({ ...item, sent: pushed, durMs: Math.round(pcm.length / 24), words: words.length, m: measure(pcm, words, item.name) });
        } catch (e) {
          rows.push({ ...item, error: String(e).slice(0, 160) });
        }
      }
    }));
    provider.close();
    fs.writeFileSync(resultsPath, JSON.stringify(rows, null, 1));
  }
  const table = report(rows);
  fs.writeFileSync(join(dir, 'summary.md'), `${table}\n`);
  console.log(table);
  console.log(`rows ${rows.length}, render errors ${rows.filter((r) => r.error).length}, name not found ${rows.filter((r) => r.m && !r.m.found).length}`);
}

main().then(() => process.exit(0), (e: unknown) => {
  console.error(`name-speech failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
