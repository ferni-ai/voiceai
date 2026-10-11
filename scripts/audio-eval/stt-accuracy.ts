/**
 * Does pre-STT processing (AGC, noise suppression, high-pass; bandwidth
 * extension for phone audio) make Cartesia Ink-2 recognise speech better?
 *
 * Scripted utterances (macOS voices) under several conditions are sent to
 * Ink-2 twice, raw and through the native pre-STT processor, and the word
 * error rates compared.
 *
 * usage: npx tsx scripts/audio-eval/stt-accuracy.ts <secrets.env> <work-dir> [arm=json ...]
 *   secrets.env must contain CARTESIA_API_KEY (read, never printed)
 *   arm: a pre-STT stage selection compared with raw audio, e.g.
 *        'agc={"enableAgc":true}' (stages not named are off). Default: all
 *        stages on, as the live phone bridge configures it. An arm whose
 *        name ends in 8k is sent to ink at 8 kHz.
 *   CONDITIONS=sip-ulaw,... limits the conditions; INK8K=1 adds an arm sending
 *   the untouched 8 kHz phone signal at sample_rate=8000; SEED picks the noise.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const [secretsFile, work, ...armArgs] = process.argv.slice(2);
if (!secretsFile || !work) {
  console.error('usage: stt-accuracy.ts <secrets.env> <work-dir>');
  process.exit(2);
}
const apiKey = readFileSync(secretsFile, 'utf8')
  .split('\n')
  .find((l) => l.startsWith('CARTESIA_API_KEY='))
  ?.slice('CARTESIA_API_KEY='.length)
  .replace(/^"|"$/g, '');
if (!apiKey) throw new Error('CARTESIA_API_KEY not found');
mkdirSync(work, { recursive: true });

// ---------------------------------------------------------------- utterances
const scenarioDir = 'scripts/voice-eval/scenarios';
const lines = readdirSync(scenarioDir)
  .flatMap((f) => readFileSync(join(scenarioDir, f), 'utf8').split('\n'))
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) =>
    l
      .replace(/\[\[slnc \d+\]\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
const VOICES = ['Samantha', 'Daniel', 'Karen'];

function tts(text: string, i: number): Int16Array {
  const aiff = join(work, `u${i}.aiff`);
  const pcm = join(work, `u${i}.pcm`);
  if (!existsSync(pcm)) {
    execFileSync('say', ['-v', VOICES[i % VOICES.length], '-o', aiff, '--', text]);
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-i',
      aiff,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      's16le',
      pcm,
    ]);
  }
  const b = readFileSync(pcm);
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1).slice();
}

// ---------------------------------------------------------------- degradations
// SEED picks a different noise realization (default 11).
let seed = Number(process.env.SEED ?? 11);
const rnd = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
function pink(n: number): Float32Array {
  // Paul Kellet's economy pink filter
  const out = new Float32Array(n);
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd();
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = b0 + b1 + b2 + w * 0.1848;
  }
  return out;
}
const rms = (x: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
};
/** Speech RMS over its louder half (ignores leading/trailing silence). */
function speechRms(x: Int16Array): number {
  const frames: number[] = [];
  for (let i = 0; i + 320 <= x.length; i += 320) frames.push(rms(x.subarray(i, i + 320)));
  frames.sort((a, b) => b - a);
  return rms(frames.slice(0, Math.max(1, frames.length >> 1)));
}
const clip16 = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));

function withNoise(x: Int16Array, snrDb: number, babble: Int16Array): Int16Array {
  const s = speechRms(x);
  const p = pink(x.length);
  const pScale = s / 10 ** ((snrDb + 6) / 20) / (rms(p) || 1); // pink 6 dB under the babble
  const bSeg = Int16Array.from({ length: x.length }, (_, i) => babble[i % babble.length]);
  const bScale = s / 10 ** (snrDb / 20) / (rms(bSeg) || 1);
  return x.map((v, i) => clip16(v + p[i] * pScale + bSeg[i] * bScale));
}
const quiet = (x: Int16Array, db = -22): Int16Array =>
  x.map((v) => clip16(v * 10 ** (db / 20) + rnd() * 8));
/** Phone band: 8 kHz (with a crude anti-alias average). */
const to8k = (x: Int16Array): Int16Array =>
  Int16Array.from({ length: x.length >> 1 }, (_, i) => (x[2 * i] + x[2 * i + 1]) >> 1);
/** What a raw phone call reaches STT as: 8 kHz upsampled to 16 kHz, no extension. */
const up16 = (x: Int16Array): Int16Array => {
  const out = new Int16Array(x.length * 2);
  for (let i = 0; i < x.length; i++) {
    out[2 * i] = x[i];
    out[2 * i + 1] = i + 1 < x.length ? (x[i] + x[i + 1]) >> 1 : x[i];
  }
  return out;
};

/** G.711 mu-law round trip: the companding a PCMU phone call (Twilio SIP) applies. */
function ulaw(x: Int16Array): Int16Array {
  return x.map((v) => {
    const sign = v < 0 ? 0x80 : 0;
    let m = Math.min(32635, Math.abs(v)) + 0x84;
    let exp = 7;
    for (let mask = 0x4000; (m & mask) === 0 && exp > 0; mask >>= 1) exp--;
    const byte = ~(sign | (exp << 4) | ((m >> (exp + 3)) & 0x0f)) & 0xff;
    const e = (~byte >> 4) & 0x07;
    m = ((((~byte & 0x0f) << 3) + 0x84) << e) - 0x84;
    return ~byte & 0x80 ? -m : m;
  });
}

// ---------------------------------------------------------------- pre-STT
type PreStt = { processFrame(samples: Float32Array, isSpeech: boolean): Float32Array };
const audio = (await import('@ferni/audio')) as unknown as {
  NativePreSttProcessor: new (cfg: Record<string, unknown>) => PreStt;
};
const STAGES_OFF = {
  enableAgc: false,
  enableNoiseSuppression: false,
  enableHighpass: false,
  enableBandwidthExtension: false,
};
const ARMS: Array<[string, Record<string, boolean>]> = armArgs.length
  ? armArgs.map((a): [string, Record<string, boolean>] => [
      a.slice(0, a.indexOf('=')),
      JSON.parse(a.slice(a.indexOf('=') + 1)),
    ])
  : [
      [
        'all',
        {
          enableAgc: true,
          enableNoiseSuppression: true,
          enableHighpass: true,
          enableBandwidthExtension: true,
        },
      ],
    ];
function preStt(x: Int16Array, phone: boolean, stages: Record<string, boolean>): Int16Array {
  const on = { ...STAGES_OFF, ...stages };
  const proc = new audio.NativePreSttProcessor(
    phone
      ? { sampleRate: 8000, inputIs8Khz: true, highpassCutoffHz: 80, ...on }
      : { sampleRate: 16000, highpassCutoffHz: 80, ...on, enableBandwidthExtension: false }
  );
  // Without bandwidth extension, phone audio stays at 8 kHz: upsample it the
  // way the bridge's fallback does so STT gets 16 kHz either way.
  const frame = phone ? 160 : 320;
  const out: number[] = [];
  for (let i = 0; i + frame <= x.length; i += frame) {
    const f = Float32Array.from(x.subarray(i, i + frame), (v) => v / 32768);
    const isSpeech = 20 * Math.log10(rms(f) || 1e-9) > -45;
    for (const v of proc.processFrame(f, isSpeech)) out.push(clip16(v * 32768));
  }
  const result = Int16Array.from(out);
  return phone && !on.enableBandwidthExtension ? up16(result) : result;
}

// ---------------------------------------------------------------- Ink-2
async function transcribe(pcm: Int16Array, rate = 16000): Promise<string> {
  const url = `wss://api.cartesia.ai/stt/turns/websocket?model=ink-2&sample_rate=${rate}&encoding=pcm_s16le`;
  const ws = new WebSocket(url, {
    headers: { 'X-API-Key': apiKey!, 'Cartesia-Version': '2026-03-01' },
  });
  const finals: string[] = [];
  let current = '';
  const done = new Promise<void>((resolve, reject) => {
    ws.on('message', (data) => {
      const m = JSON.parse(data.toString()) as {
        type: string;
        transcript?: string;
        message?: string;
      };
      if (m.type === 'turn.update' && m.transcript) current = m.transcript;
      if (m.type === 'turn.end') {
        finals.push(m.transcript || current);
        current = '';
      }
      if (m.type === 'error') reject(new Error(m.message ?? 'ink error'));
    });
    ws.on('close', () => resolve());
    ws.on('error', reject);
  });
  await new Promise<void>((r, j) => {
    ws.once('open', () => r());
    ws.once('error', j);
  });
  // 20 ms chunks at 4x real time, then a second of silence so the turn ends.
  const tail = new Int16Array(rate);
  const all = Int16Array.from([...pcm, ...tail]);
  const chunk = rate / 50;
  for (let i = 0; i < all.length; i += chunk) {
    const c = all.slice(i, i + chunk);
    ws.send(Buffer.from(c.buffer));
    if ((i / chunk) % 4 === 0) await new Promise((r) => setTimeout(r, 20));
  }
  await new Promise((r) => setTimeout(r, 1500));
  ws.send(JSON.stringify({ type: 'close' }));
  await Promise.race([done, new Promise((r) => setTimeout(r, 8000))]);
  if (current) finals.push(current);
  ws.terminate();
  return finals.join(' ');
}

// ---------------------------------------------------------------- WER
const NUMS: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
  '12': 'twelve',
  '20': 'twenty',
};
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMS[w] ?? w);
function wer(ref: string, hyp: string): { errors: number; words: number } {
  const r = words(ref);
  const h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [
    i,
    ...new Array<number>(h.length).fill(0),
  ]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1)
      );
  return { errors: d[r.length][h.length], words: r.length };
}

// ---------------------------------------------------------------- run
const clean = lines.map((t, i) => tts(t, i));
const babbleSrc = Int16Array.from(clean.slice(0, 6).flatMap((x) => Array.from(x)));
const conditions: Record<
  string,
  (
    x: Int16Array,
    i: number
  ) => { raw: Int16Array; input: Int16Array; phone: boolean; narrow?: Int16Array }
> = {
  clean: (x) => ({ raw: x, input: x, phone: false }),
  'noise-20dB': (x, i) => {
    const n = withNoise(x, 20, babbleSrc.subarray((i * 7919) % 20000));
    return { raw: n, input: n, phone: false };
  },
  'noise-10dB': (x, i) => {
    const n = withNoise(x, 10, babbleSrc.subarray((i * 7919) % 20000));
    return { raw: n, input: n, phone: false };
  },
  'noise-5dB': (x, i) => {
    const n = withNoise(x, 5, babbleSrc.subarray((i * 7919) % 20000));
    return { raw: n, input: n, phone: false };
  },
  'quiet-22dB': (x) => {
    const q = quiet(x);
    return { raw: q, input: q, phone: false };
  },
  'phone-8kHz': (x) => {
    const p = to8k(x);
    return { raw: up16(p), input: p, phone: true };
  },
  // A LiveKit SIP caller: phone-band audio already carried on a wideband
  // track, so the agent processes it at the track rate (no 8 kHz input,
  // no bandwidth extension), at a normal, soft and quiet line level.
  sip: (x) => {
    const p = up16(to8k(x));
    return { raw: p, input: p, phone: false };
  },
  'sip-soft-12dB': (x) => {
    const p = up16(to8k(quiet(x, -12)));
    return { raw: p, input: p, phone: false };
  },
  'sip-quiet-22dB': (x) => {
    const p = up16(to8k(quiet(x)));
    return { raw: p, input: p, phone: false };
  },
  'sip-noise-10dB': (x, i) => {
    const p = up16(to8k(withNoise(x, 10, babbleSrc.subarray((i * 7919) % 20000))));
    return { raw: p, input: p, phone: false };
  },
  // A PCMU (mu-law) call as Twilio's SIP trunk carries it; `narrow` is the
  // 8 kHz signal itself, for the ink8k arm (ink told the audio is 8 kHz).
  'sip-ulaw': (x) => {
    const n = ulaw(to8k(x));
    const p = up16(n);
    return { raw: p, input: p, phone: false, narrow: n };
  },
  'sip-ulaw-noise-15dB': (x, i) => {
    const n = ulaw(to8k(withNoise(x, 15, babbleSrc.subarray((i * 7919) % 20000))));
    const p = up16(n);
    return { raw: p, input: p, phone: false, narrow: n };
  },
  'sip-ulaw-soft-12dB': (x) => {
    const n = ulaw(to8k(quiet(x, -12)));
    const p = up16(n);
    return { raw: p, input: p, phone: false, narrow: n };
  },
};
// INK8K=1 adds an arm sending the 8 kHz signal at sample_rate=8000 (conditions with `narrow`).
const ink8k = process.env.INK8K === '1';
// CONDITIONS=sip,sip-quiet-22dB runs only those.
const only = process.env.CONDITIONS?.split(',').map((c) => c.trim());
if (only) for (const k of Object.keys(conditions)) if (!only.includes(k)) delete conditions[k];

type Tally = { e: number; w: number };
const results: Record<string, Record<string, Tally> & { samples?: never }> = {};
const samples: Record<string, string[]> = {};
const jobs: Array<() => Promise<void>> = [];
const armNames = ['raw', ...ARMS.map(([n]) => n), ...(ink8k ? ['ink8k'] : [])];
for (const [name, make] of Object.entries(conditions)) {
  results[name] = Object.fromEntries(armNames.map((a) => [a, { e: 0, w: 0 }]));
  samples[name] = [];
  clean.forEach((x, i) => {
    const { raw, input, phone, narrow } = make(x, i);
    const arms: Array<[string, Int16Array, number]> = [
      ['raw', raw, 16000],
      // An arm named *8k sends its output to ink at 8 kHz, as PHONE_AUDIO_MODE=on does for a phone caller.
      ...ARMS.map(([n, st]): [string, Int16Array, number] =>
        n.endsWith('8k')
          ? [n, to8k(preStt(input, phone, st)), 8000]
          : [n, preStt(input, phone, st), 16000]
      ),
      ...(ink8k
        ? [['ink8k', narrow ?? raw, narrow ? 8000 : 16000] as [string, Int16Array, number]]
        : []),
    ];
    for (const [arm, pcm, rate] of arms) {
      jobs.push(async () => {
        const hyp = await transcribe(pcm, rate);
        const { errors, words: n } = wer(lines[i], hyp);
        results[name][arm].e += errors;
        results[name][arm].w += n;
        if (i < 2) samples[name].push(`${arm}: ${hyp}`);
      });
    }
  });
}
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < jobs.length) await jobs[next++]();
  })
);
const table = Object.fromEntries(
  Object.entries(results).map(([k, v]) => [
    k,
    Object.fromEntries(armNames.map((a) => [a, +(v[a].e / v[a].w).toFixed(3)])),
  ])
);
writeFileSync(
  join(work, 'stt-accuracy.json'),
  JSON.stringify({ utterances: lines.length, arms: ARMS, table, samples }, null, 1)
);
console.log(JSON.stringify({ utterances: lines.length, werByCondition: table }, null, 1));
process.exit(0);
