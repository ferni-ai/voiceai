/**
 * Listen to and measure the post-TTS chain: run TTS audio through it exactly
 * as the live path does (20 ms frames of 24 kHz mono, betterThanHuman preset)
 * and compare with the unprocessed audio.
 *
 * usage: npx tsx scripts/audio-eval/post-tts-ab.ts <pcm-dir> <out-dir> [variant ...]
 *   pcm-dir: 24 kHz mono s16le .pcm files (e.g. Cartesia renders)
 *   variant: name=JSON config overrides applied on top of the live config,
 *            e.g. 'jitter={"enableJitter":true}'. "live" (no overrides) and
 *            "off" (unprocessed) are always produced.
 * Writes <out-dir>/<variant>/<clip>.wav and <out-dir>/metrics.json.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import {
  applyPostTTSEnhancement,
  PostTTSPresets,
  type PostTTSConfig,
} from '../../src/agents/shared/performance/post-tts-transform.js';

const RATE = 24000;
const FRAME = 480;
const [pcmDir, outDir, ...variantArgs] = process.argv.slice(2);
if (!pcmDir || !outDir) {
  console.error('usage: post-tts-ab.ts <pcm-dir> <out-dir> [name=json ...]');
  process.exit(2);
}
const variants: Array<[string, Partial<PostTTSConfig> | null]> = [
  ['off', null],
  ['live', {}],
  ...variantArgs.map((a): [string, Partial<PostTTSConfig>] => {
    const i = a.indexOf('=');
    return [a.slice(0, i), JSON.parse(a.slice(i + 1)) as Partial<PostTTSConfig>];
  }),
];

async function process1(samples: Int16Array, overrides: Partial<PostTTSConfig>): Promise<Int16Array> {
  const frames: AudioFrame[] = [];
  for (let i = 0; i + FRAME <= samples.length; i += FRAME) {
    const chunk = samples.slice(i, i + FRAME);
    frames.push(new AudioFrame(chunk, RATE, 1, FRAME));
  }
  const input = new ReadableStream<AudioFrame>({
    start(c) {
      for (const f of frames) c.enqueue(f);
      c.close();
    },
  });
  const config = { ...PostTTSPresets.betterThanHuman, ...overrides, sessionId: 'ab', personaId: 'ferni' };
  const out = await applyPostTTSEnhancement(input as never, config);
  const chunks: Int16Array[] = [];
  for await (const f of out as unknown as AsyncIterable<AudioFrame>) {
    chunks.push(new Int16Array(f.data.buffer, f.data.byteOffset, f.samplesPerChannel).slice());
  }
  const all = new Int16Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return all;
}

/** Energy in a frequency band via a Goertzel sweep (coarse, but enough for tilt). */
function bandEnergy(x: Int16Array, lo: number, hi: number): number {
  let total = 0;
  const N = 1024;
  for (let start = 0; start + N <= x.length; start += N * 4) {
    for (let f = lo; f <= hi; f += (hi - lo) / 12) {
      const k = Math.round((f * N) / RATE);
      const w = (2 * Math.PI * k) / N;
      const coeff = 2 * Math.cos(w);
      let s1 = 0;
      let s2 = 0;
      for (let n = 0; n < N; n++) {
        const s = x[start + n] / 32768 + coeff * s1 - s2;
        s2 = s1;
        s1 = s;
      }
      total += s1 * s1 + s2 * s2 - coeff * s1 * s2;
    }
  }
  return total;
}

function metrics(x: Int16Array) {
  let sumSq = 0;
  let peak = 0;
  let clipped = 0;
  for (const v of x) {
    sumSq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 32700) clipped++;
  }
  const rms = Math.sqrt(sumSq / x.length);
  const jumps: number[] = [];
  let boundaryMax = 0;
  for (let i = 1; i < x.length; i++) {
    const j = Math.abs(x[i] - x[i - 1]);
    if (i % FRAME === 0) boundaryMax = Math.max(boundaryMax, j);
    else jumps.push(j);
  }
  jumps.sort((a, b) => a - b);
  const p999 = jumps[Math.floor(jumps.length * 0.999)] || 1;
  const db = (v: number): number => +(20 * Math.log10(v / 32768)).toFixed(2);
  return {
    rmsDbfs: db(rms),
    peakDbfs: db(peak),
    crestDb: +(20 * Math.log10(peak / rms)).toFixed(2),
    clippedSamples: clipped,
    boundaryJumpRatio: +(boundaryMax / p999).toFixed(2),
    // High (4-8 kHz) vs low (200-1000 Hz) energy: warmth/de-esser shift this.
    tiltDb: +(10 * Math.log10(bandEnergy(x, 4000, 8000) / bandEnergy(x, 200, 1000))).toFixed(2),
  };
}

function wav(x: Int16Array): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + x.byteLength, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(x.byteLength, 40);
  return Buffer.concat([h, Buffer.from(x.buffer, x.byteOffset, x.byteLength)]);
}

const clips = readdirSync(pcmDir).filter((f) => f.endsWith('.pcm')).sort();
const report: Record<string, Record<string, ReturnType<typeof metrics>>> = {};
for (const [name] of variants) mkdirSync(join(outDir, name), { recursive: true });
for (const [ci, file] of clips.entries()) {
  const raw = readFileSync(join(pcmDir, file));
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
  const clip = `${String(ci + 1).padStart(2, '0')}-${basename(file, '.pcm').slice(0, 40)}`;
  for (const [name, overrides] of variants) {
    const out = overrides === null ? samples.slice(0, Math.floor(samples.length / FRAME) * FRAME) : await process1(samples, overrides);
    writeFileSync(join(outDir, name, `${clip}.wav`), wav(out));
    (report[name] ??= {})[clip] = metrics(out);
  }
}
const summary: Record<string, Record<string, number>> = {};
for (const [name, byClip] of Object.entries(report)) {
  const rows = Object.values(byClip);
  const mean = (k: keyof ReturnType<typeof metrics>): number => +(rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(2);
  const max = (k: keyof ReturnType<typeof metrics>): number => Math.max(...rows.map((r) => r[k]));
  summary[name] = {
    rmsDbfs: mean('rmsDbfs'),
    peakDbfsMax: max('peakDbfs'),
    crestDb: mean('crestDb'),
    clippedSamples: rows.reduce((a, r) => a + r.clippedSamples, 0),
    boundaryJumpRatioMax: max('boundaryJumpRatio'),
    tiltDb: mean('tiltDb'),
  };
}
writeFileSync(join(outDir, 'metrics.json'), JSON.stringify({ summary, report }, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(0);
