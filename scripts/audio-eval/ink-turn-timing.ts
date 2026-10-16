/**
 * How long does ink-2 take to end a turn on phone audio, and does it end
 * turns early inside a caller's pause?
 *
 * On ferni-dev (2026-10-10) the four scripted phone calls ended turns later
 * than app calls: eouDelayMs p50 821 ms (n=9) vs 445 ms (n=1539). This
 * replays the same scripted lines through the same channel twice, as the app
 * sends them (16 kHz) and as a phone call does (G.711 mu-law, 8 kHz, carried
 * on a 16 kHz track; or sent at 8 kHz with PHONE_AUDIO_MODE), streamed in real
 * time, and measures for each turn-end threshold:
 *   - endMs: from the last speech sample to ink's turn.end
 *   - early: a turn.end inside a mid-sentence pause ([[slnc ms]] in the line),
 *     where Ferni would answer half a sentence
 *
 * usage: npx tsx scripts/audio-eval/ink-turn-timing.ts <work-dir> [end=0.3,0.4]
 *   CARTESIA_API_KEY in the environment (never printed). Places no calls.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const [work, endArg = 'end=0.3,0.4'] = process.argv.slice(2);
const apiKey = process.env.CARTESIA_API_KEY;
if (!work || !apiKey) {
  console.error('usage: CARTESIA_API_KEY=... ink-turn-timing.ts <work-dir> [end=0.3,0.4]');
  process.exit(2);
}
mkdirSync(work, { recursive: true });
const ENDS = endArg.replace(/^end=/, '').split(',').map(Number);
const START = 0.7;
const EAGER = 0.6;

// ---------------------------------------------------------------- lines
const SCENARIOS = ['long-day', 'real-call', 'story', 'playful', 'quiet'];
const lines = SCENARIOS.flatMap((s) =>
  readFileSync(`scripts/voice-eval/scenarios/${s}.txt`, 'utf8').split('\n')
)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  // A pause longer than 1.5 s is the caller stepping away, not a thinking pause.
  .filter((l) => [...l.matchAll(/\[\[slnc (\d+)\]\]/g)].every((m) => Number(m[1]) <= 1500));

/** The line as 16 kHz PCM, and where each spoken segment ends (samples). */
function render(text: string, i: number): { pcm: Int16Array; segmentEnds: number[] } {
  const parts = text.split(/\[\[slnc (\d+)\]\]/);
  const out: number[] = [];
  const segmentEnds: number[] = [];
  parts.forEach((part, k) => {
    if (k % 2 === 1) {
      for (let n = 0; n < (Number(part) * 16000) / 1000; n++) out.push(0);
      return;
    }
    const pcmFile = join(work, `l${i}-${k}.pcm`);
    if (!existsSync(pcmFile)) {
      const aiff = join(work, `l${i}-${k}.aiff`);
      execFileSync('say', ['-v', 'Samantha', '-o', aiff, '--', part.trim()]);
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
        pcmFile,
      ]);
    }
    const b = readFileSync(pcmFile);
    const seg = new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
    // Trim the voice's trailing silence so "end of speech" is the last loud sample.
    let last = seg.length - 1;
    while (last > 0 && Math.abs(seg[last]) < 300) last--;
    for (let n = 0; n <= last; n++) out.push(seg[n]);
    segmentEnds.push(out.length);
  });
  return { pcm: Int16Array.from(out), segmentEnds };
}

// ---------------------------------------------------------------- channels
const clip16 = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));
const to8k = (x: Int16Array): Int16Array =>
  Int16Array.from({ length: x.length >> 1 }, (_, i) => (x[2 * i] + x[2 * i + 1]) >> 1);
const up16 = (x: Int16Array): Int16Array => {
  const out = new Int16Array(x.length * 2);
  for (let i = 0; i < x.length; i++) {
    out[2 * i] = x[i];
    out[2 * i + 1] = i + 1 < x.length ? (x[i] + x[i + 1]) >> 1 : x[i];
  }
  return out;
};
/** G.711 mu-law round trip (Twilio PCMU). */
const ulaw = (x: Int16Array): Int16Array =>
  x.map((v) => {
    const sign = v < 0 ? 0x80 : 0;
    let m = Math.min(32635, Math.abs(v)) + 0x84;
    let exp = 7;
    for (let mask = 0x4000; (m & mask) === 0 && exp > 0; mask >>= 1) exp--;
    const byte = ~(sign | (exp << 4) | ((m >> (exp + 3)) & 0x0f)) & 0xff;
    const e = (~byte >> 4) & 0x07;
    m = ((((~byte & 0x0f) << 3) + 0x84) << e) - 0x84;
    return ~byte & 0x80 ? -m : m;
  });
let seed = 7;
const rnd = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
/** A phone line's hiss under the voice and through the pauses (about -50 dBFS). */
const lineNoise = (x: Int16Array): Int16Array => x.map((v) => clip16(v + rnd() * 100));

type Channel = { name: string; rate: number; make: (x: Int16Array) => Int16Array };
const CHANNELS: Channel[] = [
  { name: 'app-16k', rate: 16000, make: (x) => x },
  { name: 'phone-ulaw', rate: 16000, make: (x) => up16(ulaw(to8k(x))) },
  { name: 'phone-ulaw-hiss', rate: 16000, make: (x) => up16(ulaw(lineNoise(to8k(x)))) },
  { name: 'phone-ulaw-8k', rate: 8000, make: (x) => ulaw(to8k(x)) },
];

// ---------------------------------------------------------------- ink
interface Run {
  channel: string;
  end: number;
  line: number;
  endMs: number | null;
  early: number;
}

async function run(
  ch: Channel,
  end: number,
  i: number,
  pcm16: Int16Array,
  segmentEnds: number[]
): Promise<Run> {
  const audio = ch.make(pcm16);
  const scale = ch.rate / 16000;
  const speechEnd = Math.round(segmentEnds[segmentEnds.length - 1] * scale);
  const q = new URLSearchParams({
    model: 'ink-2',
    sample_rate: String(ch.rate),
    encoding: 'pcm_s16le',
    turn_start_threshold: String(START),
    turn_eager_end_threshold: String(EAGER),
    turn_end_threshold: String(end),
    turn_end_timeout_ms: '4500',
  });
  const ws = new WebSocket(`wss://api.cartesia.ai/stt/turns/websocket?${q}`, {
    headers: { 'X-API-Key': apiKey!, 'Cartesia-Version': '2026-08-14' },
  });
  const ends: number[] = []; // ms since stream start
  let t0 = 0;
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString()) as { type: string; message?: string };
    if (m.type === 'turn.end') ends.push(Date.now() - t0);
    if (m.type === 'error') console.error(`ink error (${ch.name} ${end} #${i}): ${m.message}`);
  });
  await new Promise<void>((r, j) => {
    ws.once('open', () => r());
    ws.once('error', j);
  });
  // Real time, 20 ms frames, then 5 s of the line's own silence (or hiss).
  const tail = ch.make(new Int16Array(16000 * 5));
  const all = Int16Array.from([...audio, ...tail]);
  const frame = ch.rate / 50;
  t0 = Date.now();
  for (let k = 0, f = 0; k < all.length; k += frame, f++) {
    if (ws.readyState !== WebSocket.OPEN) break;
    ws.send(Buffer.from(all.slice(k, k + frame).buffer));
    const due = t0 + (f + 1) * 20;
    const wait = due - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  ws.terminate();
  const speechEndMs = (speechEnd / ch.rate) * 1000;
  const pausesEndMs = segmentEnds.slice(0, -1).map((s) => ((s * scale) / ch.rate) * 1000);
  const final = ends.find((t) => t >= speechEndMs);
  // A turn.end after a mid-line segment but before the final one: an early end.
  const early = ends.filter(
    (t) => pausesEndMs.length > 0 && t >= pausesEndMs[0] && t < speechEndMs
  ).length;
  return {
    channel: ch.name,
    end,
    line: i,
    endMs: final === undefined ? null : Math.round(final - speechEndMs),
    early,
  };
}

// ---------------------------------------------------------------- main
const rendered = lines.map((l, i) => render(l, i));
const jobs: Array<() => Promise<Run>> = [];
for (const ch of CHANNELS)
  for (const end of ENDS)
    rendered.forEach((r, i) => jobs.push(() => run(ch, end, i, r.pcm, r.segmentEnds)));
const results: Run[] = [];
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      results.push(await job());
    }
  })
);
writeFileSync(join(work, 'turn-timing.json'), JSON.stringify(results, null, 1));

const pct = (a: number[], p: number): number | null => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const paused = new Set(rendered.flatMap((r, i) => (r.segmentEnds.length > 1 ? [i] : [])));
console.log(`lines=${lines.length} (with a mid-line pause: ${paused.size})`);
console.log('channel           end   n   endMs p50  p90  missed  early/paused-lines');
for (const ch of CHANNELS)
  for (const end of ENDS) {
    const rs = results.filter((r) => r.channel === ch.name && r.end === end);
    const ms = rs.flatMap((r) => (r.endMs === null ? [] : [r.endMs]));
    const early = rs.filter((r) => paused.has(r.line) && r.early > 0).length;
    console.log(
      `${ch.name.padEnd(17)} ${end.toFixed(2)} ${String(rs.length).padStart(3)}   ${String(pct(ms, 0.5)).padStart(4)} ${String(pct(ms, 0.9)).padStart(5)}  ${String(rs.length - ms.length).padStart(5)}   ${early}/${paused.size}`
    );
  }
