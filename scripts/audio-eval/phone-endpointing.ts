/**
 * How long does ink-2 take to end a caller's turn on phone audio, at 16 kHz
 * (today) vs 8 kHz (PHONE_AUDIO_MODE=on)? Audio is streamed in real time with
 * the prod turn thresholds (responsive profile), and the wait is measured from
 * the end of speech to ink's turn.eager_end and turn.end.
 *
 * usage: npx tsx scripts/audio-eval/phone-endpointing.ts <secrets.env> <work-dir> [count]
 *   work-dir holds the u<i>.pcm utterances stt-accuracy.ts writes (16 kHz).
 *   CONCURRENCY (default 6). Arms: wideband (clean 16k), phone@16k (mu-law,
 *   upsampled), phone@8k (mu-law, native rate), each also with AGC + high-pass
 *   as the SIP pre-STT applies it (phone arms).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { INK_TURN_PROFILES } from '../../src/agents/model-provider/cartesia-cascade.js';

const [secretsFile, work, countArg] = process.argv.slice(2);
if (!secretsFile || !work) {
  console.error('usage: phone-endpointing.ts <secrets.env> <work-dir> [count]');
  process.exit(2);
}
const apiKey = readFileSync(secretsFile, 'utf8')
  .split('\n')
  .find((l) => l.startsWith('CARTESIA_API_KEY='))
  ?.slice('CARTESIA_API_KEY='.length)
  .replace(/^"|"$/g, '');
if (!apiKey) throw new Error('CARTESIA_API_KEY not found');

const count = Number(countArg ?? 60);
const td = INK_TURN_PROFILES.responsive;

// ---------------------------------------------------------------- audio
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
type PreStt = { processFrame(samples: Float32Array, isSpeech: boolean): Float32Array };
const audio = (await import('@ferni/audio')) as unknown as {
  NativePreSttProcessor: new (cfg: Record<string, unknown>) => PreStt;
};
/** AGC + high-pass at 16 kHz, as the SIP pre-STT does on the track. */
function agc(x: Int16Array): Int16Array {
  const proc = new audio.NativePreSttProcessor({
    sampleRate: 16000,
    enableAgc: true,
    enableHighpass: true,
    highpassCutoffHz: 80,
    enableNoiseSuppression: false,
    enableBandwidthExtension: false,
  });
  const out: number[] = [];
  for (let i = 0; i + 320 <= x.length; i += 320) {
    const f = Float32Array.from(x.subarray(i, i + 320), (v) => v / 32768);
    for (const v of proc.processFrame(f, true))
      out.push(Math.max(-32768, Math.min(32767, v * 32768)));
  }
  return Int16Array.from(out);
}
/** Seconds into `x` where speech ends (last 20 ms frame above -45 dBFS). */
function speechEndSec(x: Int16Array, rate: number): number {
  const f = rate / 50;
  let last = 0;
  for (let i = 0; i + f <= x.length; i += f) {
    let s = 0;
    for (let j = i; j < i + f; j++) s += x[j] * x[j];
    if (20 * Math.log10(Math.sqrt(s / f) / 32768 + 1e-9) > -45) last = i + f;
  }
  return last / rate;
}

// ---------------------------------------------------------------- ink
interface Timing {
  eagerMs?: number;
  endMs?: number;
}
async function endpoint(pcm: Int16Array, rate: number): Promise<Timing> {
  const params = new URLSearchParams({
    model: 'ink-2',
    sample_rate: String(rate),
    encoding: 'pcm_s16le',
    turn_start_threshold: String(td.startThreshold),
    turn_eager_end_threshold: String(td.eagerEndThreshold),
    turn_end_threshold: String(td.endThreshold),
    turn_end_timeout_ms: String(td.endTimeoutMs),
  });
  const ws = new WebSocket(`wss://api.cartesia.ai/stt/turns/websocket?${params}`, {
    headers: { 'X-API-Key': apiKey!, 'Cartesia-Version': '2026-03-01' },
  });
  await new Promise<void>((r, j) => {
    ws.once('open', () => r());
    ws.once('error', j);
  });
  const timing: Timing = {};
  let speechEndAt = Number.POSITIVE_INFINITY;
  let ended = false;
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString()) as { type: string };
    const now = performance.now();
    if (now < speechEndAt) return; // a turn event before the speech has ended
    if (m.type === 'turn.eager_end' && timing.eagerMs === undefined)
      timing.eagerMs = now - speechEndAt;
    if (m.type === 'turn.end' && timing.endMs === undefined) {
      timing.endMs = now - speechEndAt;
      ended = true;
    }
  });
  // Real time: 20 ms chunks every 20 ms, then silence until ink ends the turn (≤ 6 s).
  const endSample = Math.round(speechEndSec(pcm, rate) * rate);
  const chunk = rate / 50;
  const start = performance.now();
  const silence = new Int16Array(chunk);
  for (let i = 0; !ended && i < endSample + rate * 6; i += chunk) {
    const due = start + (i / rate) * 1000;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (i >= endSample && speechEndAt === Number.POSITIVE_INFINITY) speechEndAt = performance.now();
    ws.send(Buffer.from((i < pcm.length ? pcm.slice(i, i + chunk) : silence).buffer));
  }
  ws.terminate();
  return timing;
}

// ---------------------------------------------------------------- run
const clean: Int16Array[] = [];
for (let i = 0; i < count && existsSync(join(work, `u${i}.pcm`)); i++) {
  const b = readFileSync(join(work, `u${i}.pcm`));
  clean.push(new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1).slice());
}
const arms: Record<string, (x: Int16Array) => [Int16Array, number]> = {
  wideband: (x) => [x, 16000],
  'phone@16k': (x) => [up16(ulaw(to8k(x))), 16000],
  'phone@8k': (x) => [ulaw(to8k(x)), 8000],
  'phone+agc@16k': (x) => [agc(up16(ulaw(to8k(x)))), 16000],
  'phone+agc@8k': (x) => [to8k(agc(up16(ulaw(to8k(x))))), 8000],
};
const results: Record<string, Timing[]> = Object.fromEntries(Object.keys(arms).map((a) => [a, []]));
const jobs = clean.flatMap((x) =>
  Object.entries(arms).map(([arm, make]) => async () => {
    const [pcm, rate] = make(x);
    results[arm].push(await endpoint(pcm, rate).catch(() => ({})));
  })
);
let next = 0;
await Promise.all(
  Array.from({ length: Number(process.env.CONCURRENCY ?? 6) }, async () => {
    while (next < jobs.length) await jobs[next++]();
  })
);
const stat = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const q = (p: number) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? NaN);
  return {
    n: s.length,
    p50: q(0.5),
    p90: q(0.9),
    mean: Math.round(s.reduce((a, b) => a + b, 0) / (s.length || 1)),
  };
};
const report = Object.fromEntries(
  Object.entries(results).map(([arm, t]) => [
    arm,
    {
      end: stat(t.flatMap((x) => (x.endMs === undefined ? [] : [x.endMs]))),
      eager: stat(t.flatMap((x) => (x.eagerMs === undefined ? [] : [x.eagerMs]))),
      noEnd: t.filter((x) => x.endMs === undefined).length,
    },
  ])
);
console.log(JSON.stringify({ utterances: clean.length, thresholds: td, report }, null, 1));
process.exit(0);
